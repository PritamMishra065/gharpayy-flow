CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
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
      AND role IN ('admin', 'manager')
  );
$$;

DROP POLICY IF EXISTS "CRM admins manage roles" ON public.user_roles;

CREATE POLICY "CRM admins insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "CRM admins update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()))
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "CRM admins delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "CRM admins read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

DELETE FROM public.owners o
WHERE o.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.owners newer
    WHERE newer.user_id = o.user_id
      AND (
        newer.created_at > o.created_at
        OR (newer.created_at = o.created_at AND newer.id > o.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS owners_user_id_unique
ON public.owners(user_id)
WHERE user_id IS NOT NULL;

INSERT INTO public.owners (user_id, name, phone, email, company_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.email),
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'phone', ''), 'pending'),
  u.email,
  NULLIF(u.raw_user_meta_data ->> 'company_name', '')
FROM auth.users u
JOIN public.user_roles ur
  ON ur.user_id = u.id
 AND ur.role = 'owner'
LEFT JOIN public.owners o
  ON o.user_id = u.id
WHERE o.id IS NULL;
