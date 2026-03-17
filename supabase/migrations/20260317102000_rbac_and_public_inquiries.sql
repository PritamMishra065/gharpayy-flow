DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'agent', 'owner', 'customer');
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "CRM admins manage roles" ON public.user_roles;
CREATE POLICY "CRM admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'manager')
  )
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_crm_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'manager', 'agent')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.owners
    WHERE user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_for_property(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.owners o ON o.id = p.owner_id
    WHERE p.id = _property_id
      AND o.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_home_path(_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN '/explore';
  END IF;

  IF public.is_crm_user(_user_id) THEN
    RETURN '/dashboard';
  END IF;

  IF public.is_owner_user(_user_id) THEN
    RETURN '/owner-portal';
  END IF;

  RETURN '/explore';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_roles text[];
  v_owner_id uuid;
  v_agent_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', NULL,
      'roles', '[]'::jsonb,
      'default_path', '/explore',
      'is_crm_user', false,
      'is_owner', false,
      'owner_id', NULL,
      'agent_id', NULL
    );
  END IF;

  SELECT COALESCE(array_agg(role::text ORDER BY role::text), ARRAY[]::text[])
  INTO v_roles
  FROM public.user_roles
  WHERE user_id = v_user_id;

  SELECT id INTO v_owner_id
  FROM public.owners
  WHERE user_id = v_user_id
  LIMIT 1;

  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'roles', to_jsonb(COALESCE(v_roles, ARRAY[]::text[])),
    'default_path', public.get_user_home_path(v_user_id),
    'is_crm_user', public.is_crm_user(v_user_id),
    'is_owner', public.is_owner_user(v_user_id),
    'owner_id', v_owner_id,
    'agent_id', v_agent_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_selected_role text := COALESCE(
    NEW.raw_user_meta_data ->> 'selected_role',
    NEW.raw_user_meta_data ->> 'role',
    'customer'
  );
  v_full_name text := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.email
  );
  v_phone text := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');
  v_company_name text := NULLIF(NEW.raw_user_meta_data ->> 'company_name', '');
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      updated_at = now();

  IF v_selected_role IN ('admin', 'manager', 'agent', 'owner', 'customer') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_selected_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF v_selected_role = 'owner' THEN
    INSERT INTO public.owners (user_id, name, phone, email, company_name)
    VALUES (NEW.id, v_full_name, COALESCE(v_phone, 'pending'), NEW.email, v_company_name)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.property_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  inquiry_type text NOT NULL CHECK (inquiry_type IN ('chat', 'schedule_visit', 'virtual_tour')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  message text,
  requested_at timestamptz,
  requested_slot text,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM and owners read property inquiries" ON public.property_inquiries;
CREATE POLICY "CRM and owners read property inquiries"
ON public.property_inquiries
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
);

DROP POLICY IF EXISTS "CRM manage property inquiries" ON public.property_inquiries;
CREATE POLICY "CRM manage property inquiries"
ON public.property_inquiries
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_property_id ON public.property_inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_created_at ON public.property_inquiries(created_at DESC);

CREATE OR REPLACE FUNCTION public.submit_property_inquiry(
  p_property_id uuid,
  p_inquiry_type text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_requested_at timestamptz DEFAULT NULL,
  p_requested_slot text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_lead_id uuid;
  v_lead_status public.pipeline_stage := 'new';
  v_visit_id uuid;
  v_inquiry_id uuid;
  v_note text;
BEGIN
  IF p_inquiry_type NOT IN ('chat', 'schedule_visit', 'virtual_tour') THEN
    RAISE EXCEPTION 'Unsupported inquiry type';
  END IF;

  IF COALESCE(trim(p_customer_name), '') = '' OR COALESCE(trim(p_customer_phone), '') = '' THEN
    RAISE EXCEPTION 'Name and phone are required';
  END IF;

  SELECT *
  INTO v_property
  FROM public.properties
  WHERE id = p_property_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found';
  END IF;

  IF p_inquiry_type = 'schedule_visit' THEN
    v_lead_status := 'visit_scheduled';
  END IF;

  SELECT id
  INTO v_lead_id
  FROM public.leads
  WHERE phone = p_customer_phone
  ORDER BY created_at DESC
  LIMIT 1;

  v_note := CONCAT(
    'Inquiry type: ', p_inquiry_type,
    CASE WHEN p_message IS NOT NULL AND p_message <> '' THEN E'\nMessage: ' || p_message ELSE '' END,
    CASE WHEN p_requested_slot IS NOT NULL AND p_requested_slot <> '' THEN E'\nRequested slot: ' || p_requested_slot ELSE '' END
  );

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (
      name,
      phone,
      email,
      source,
      status,
      preferred_location,
      property_id,
      notes
    )
    VALUES (
      p_customer_name,
      p_customer_phone,
      NULLIF(p_customer_email, ''),
      'website',
      v_lead_status,
      COALESCE(v_property.area, v_property.city),
      p_property_id,
      NULLIF(v_note, '')
    )
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE public.leads
    SET name = p_customer_name,
        email = COALESCE(NULLIF(p_customer_email, ''), email),
        property_id = COALESCE(property_id, p_property_id),
        preferred_location = COALESCE(preferred_location, v_property.area, v_property.city),
        status = CASE
          WHEN p_inquiry_type = 'schedule_visit' THEN 'visit_scheduled'
          ELSE status
        END,
        notes = CONCAT_WS(E'\n\n', notes, NULLIF(v_note, '')),
        last_activity_at = now(),
        updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  INSERT INTO public.conversations (
    lead_id,
    message,
    direction,
    channel,
    context_type,
    context_id
  )
  VALUES (
    v_lead_id,
    COALESCE(NULLIF(p_message, ''), initcap(replace(p_inquiry_type, '_', ' ')) || ' request received'),
    'inbound',
    CASE WHEN p_inquiry_type = 'chat' THEN 'website_chat' ELSE 'website_form' END,
    'property',
    p_property_id
  );

  IF p_inquiry_type = 'schedule_visit' THEN
    INSERT INTO public.visits (
      lead_id,
      property_id,
      scheduled_at,
      notes,
      confirmed
    )
    VALUES (
      v_lead_id,
      p_property_id,
      COALESCE(p_requested_at, now() + interval '1 day'),
      NULLIF(v_note, ''),
      false
    )
    RETURNING id INTO v_visit_id;
  END IF;

  INSERT INTO public.property_inquiries (
    property_id,
    lead_id,
    inquiry_type,
    customer_name,
    customer_phone,
    customer_email,
    message,
    requested_at,
    requested_slot,
    metadata
  )
  VALUES (
    p_property_id,
    v_lead_id,
    p_inquiry_type,
    p_customer_name,
    p_customer_phone,
    NULLIF(p_customer_email, ''),
    NULLIF(p_message, ''),
    p_requested_at,
    NULLIF(p_requested_slot, ''),
    jsonb_build_object(
      'property_name', v_property.name,
      'property_area', v_property.area,
      'property_city', v_property.city,
      'visit_id', v_visit_id
    )
  )
  RETURNING id INTO v_inquiry_id;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'visit_id', v_visit_id,
    'inquiry_id', v_inquiry_id
  );
END;
$$;

DROP POLICY IF EXISTS "Anyone read reservations" ON public.reservations;
DROP POLICY IF EXISTS "Anyone insert reservations" ON public.reservations;
DROP POLICY IF EXISTS "Anyone update reservations" ON public.reservations;

CREATE POLICY "CRM and owners read reservations"
ON public.reservations
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
);

CREATE POLICY "CRM manage reservations"
ON public.reservations
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users manage agents" ON public.agents;
DROP POLICY IF EXISTS "Auth users update agents" ON public.agents;
DROP POLICY IF EXISTS "Auth users delete agents" ON public.agents;
DROP POLICY IF EXISTS "Auth users read agents" ON public.agents;
CREATE POLICY "CRM read agents"
ON public.agents
FOR SELECT
TO authenticated
USING (public.is_crm_user(auth.uid()));
CREATE POLICY "CRM manage agents"
ON public.agents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Auth users manage properties" ON public.properties;
DROP POLICY IF EXISTS "Auth users update properties" ON public.properties;
DROP POLICY IF EXISTS "Auth users delete properties" ON public.properties;
DROP POLICY IF EXISTS "Auth users read properties" ON public.properties;
CREATE POLICY "Public read properties"
ON public.properties
FOR SELECT
USING (is_active = true OR public.is_crm_user(auth.uid()) OR public.is_owner_for_property(auth.uid(), id));
CREATE POLICY "CRM and owners insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), id)
  OR EXISTS (
    SELECT 1
    FROM public.owners o
    WHERE o.id = owner_id
      AND o.user_id = auth.uid()
  )
);
CREATE POLICY "CRM and owners update properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), id)
)
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.owners o
    WHERE o.id = owner_id
      AND o.user_id = auth.uid()
  )
);
CREATE POLICY "CRM delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users read leads" ON public.leads;
DROP POLICY IF EXISTS "Auth users manage leads" ON public.leads;
DROP POLICY IF EXISTS "Auth users update leads" ON public.leads;
DROP POLICY IF EXISTS "Auth users delete leads" ON public.leads;
CREATE POLICY "CRM read leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.is_crm_user(auth.uid()));
CREATE POLICY "CRM manage leads"
ON public.leads
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users read visits" ON public.visits;
DROP POLICY IF EXISTS "Auth users manage visits" ON public.visits;
DROP POLICY IF EXISTS "Auth users update visits" ON public.visits;
DROP POLICY IF EXISTS "Auth users delete visits" ON public.visits;
CREATE POLICY "CRM and owners read visits"
ON public.visits
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
);
CREATE POLICY "CRM manage visits"
ON public.visits
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users read conversations" ON public.conversations;
DROP POLICY IF EXISTS "Auth users manage conversations" ON public.conversations;
CREATE POLICY "CRM read conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (public.is_crm_user(auth.uid()));
CREATE POLICY "CRM manage conversations"
ON public.conversations
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users read reminders" ON public.follow_up_reminders;
DROP POLICY IF EXISTS "Auth users manage reminders" ON public.follow_up_reminders;
DROP POLICY IF EXISTS "Auth users update reminders" ON public.follow_up_reminders;
CREATE POLICY "CRM manage reminders"
ON public.follow_up_reminders
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users manage owners" ON public.owners;
DROP POLICY IF EXISTS "Auth users update owners" ON public.owners;
DROP POLICY IF EXISTS "Auth users delete owners" ON public.owners;
DROP POLICY IF EXISTS "Anon read owners" ON public.owners;
CREATE POLICY "Public and owner read owners"
ON public.owners
FOR SELECT
USING (
  auth.uid() IS NULL
  OR public.is_crm_user(auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "CRM and self insert owners"
ON public.owners
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "CRM and self update owners"
ON public.owners
FOR UPDATE
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "CRM delete owners"
ON public.owners
FOR DELETE
TO authenticated
USING (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Anon read rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth users manage rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth users update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth users delete rooms" ON public.rooms;
CREATE POLICY "Public read rooms"
ON public.rooms
FOR SELECT
USING (true);
CREATE POLICY "CRM and owners manage rooms"
ON public.rooms
FOR ALL
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
)
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
);

DROP POLICY IF EXISTS "Anon read room_status_log" ON public.room_status_log;
DROP POLICY IF EXISTS "Auth users manage room_status_log" ON public.room_status_log;
CREATE POLICY "CRM and owners read room status log"
ON public.room_status_log
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND public.is_owner_for_property(auth.uid(), r.property_id)
  )
);
CREATE POLICY "CRM and owners insert room status log"
ON public.room_status_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_crm_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND public.is_owner_for_property(auth.uid(), r.property_id)
  )
);

DROP POLICY IF EXISTS "Anon read soft_locks" ON public.soft_locks;
DROP POLICY IF EXISTS "Auth users manage soft_locks" ON public.soft_locks;
DROP POLICY IF EXISTS "Auth users update soft_locks" ON public.soft_locks;
DROP POLICY IF EXISTS "Auth users delete soft_locks" ON public.soft_locks;
CREATE POLICY "CRM and owners read soft locks"
ON public.soft_locks
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND public.is_owner_for_property(auth.uid(), r.property_id)
  )
);
CREATE POLICY "CRM manage soft locks"
ON public.soft_locks
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone read zones" ON public.zones;
DROP POLICY IF EXISTS "Auth manage zones" ON public.zones;
DROP POLICY IF EXISTS "Auth update zones" ON public.zones;
DROP POLICY IF EXISTS "Auth delete zones" ON public.zones;
CREATE POLICY "CRM manage zones"
ON public.zones
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone read team_queues" ON public.team_queues;
DROP POLICY IF EXISTS "Auth manage team_queues" ON public.team_queues;
DROP POLICY IF EXISTS "Auth update team_queues" ON public.team_queues;
DROP POLICY IF EXISTS "Auth delete team_queues" ON public.team_queues;
CREATE POLICY "CRM manage team queues"
ON public.team_queues
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone read handoffs" ON public.handoffs;
DROP POLICY IF EXISTS "Auth insert handoffs" ON public.handoffs;
CREATE POLICY "CRM manage handoffs"
ON public.handoffs
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone read escalations" ON public.escalations;
DROP POLICY IF EXISTS "Auth manage escalations" ON public.escalations;
DROP POLICY IF EXISTS "Auth update escalations" ON public.escalations;
CREATE POLICY "CRM manage escalations"
ON public.escalations
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));

DROP POLICY IF EXISTS "Auth users read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Auth users manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Auth users update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Auth users delete bookings" ON public.bookings;
CREATE POLICY "CRM and owners read bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  public.is_crm_user(auth.uid())
  OR public.is_owner_for_property(auth.uid(), property_id)
);
CREATE POLICY "CRM manage bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (public.is_crm_user(auth.uid()))
WITH CHECK (public.is_crm_user(auth.uid()));
