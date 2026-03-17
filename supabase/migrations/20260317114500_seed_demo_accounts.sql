CREATE OR REPLACE FUNCTION public.ensure_demo_account(
  p_email text,
  p_password text,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      email_change_token_current,
      email_change_confirm_status,
      reauthentication_token,
      is_sso_user,
      deleted_at,
      is_anonymous
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      v_now,
      NULL,
      '',
      NULL,
      '',
      NULL,
      '',
      '',
      NULL,
      v_now,
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      p_metadata,
      false,
      v_now,
      v_now,
      NULLIF(p_metadata ->> 'phone', ''),
      CASE WHEN COALESCE(p_metadata ->> 'phone', '') <> '' THEN v_now ELSE NULL END,
      '',
      '',
      '',
      0,
      '',
      false,
      NULL,
      false
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, v_now),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        raw_user_meta_data = p_metadata,
        phone = NULLIF(p_metadata ->> 'phone', ''),
        phone_confirmed_at = CASE
          WHEN COALESCE(p_metadata ->> 'phone', '') <> '' THEN COALESCE(phone_confirmed_at, v_now)
          ELSE phone_confirmed_at
        END,
        updated_at = v_now,
        deleted_at = NULL
    WHERE id = v_user_id;
  END IF;

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', COALESCE(p_metadata ->> 'phone', '') <> '',
      'full_name', COALESCE(p_metadata ->> 'full_name', p_email)
    ),
    'email',
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (provider_id, provider) DO UPDATE
  SET identity_data = EXCLUDED.identity_data,
      last_sign_in_at = EXCLUDED.last_sign_in_at,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, COALESCE(p_metadata ->> 'full_name', p_email))
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      updated_at = v_now;

  IF COALESCE(p_metadata ->> 'selected_role', 'customer') IN ('admin', 'manager', 'agent', 'owner', 'customer') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, (p_metadata ->> 'selected_role')::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF COALESCE(p_metadata ->> 'selected_role', '') = 'owner' THEN
    INSERT INTO public.owners (user_id, name, phone, email, company_name)
    VALUES (
      v_user_id,
      COALESCE(p_metadata ->> 'full_name', p_email),
      COALESCE(NULLIF(p_metadata ->> 'phone', ''), 'pending'),
      p_email,
      NULLIF(p_metadata ->> 'company_name', '')
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_user_id;
END;
$$;

SELECT public.ensure_demo_account(
  'demo@gharpayy.com',
  'demo1234',
  '{"full_name":"Demo User","selected_role":"customer"}'::jsonb
);

SELECT public.ensure_demo_account(
  'admin@gharpayy.com',
  'admin1234',
  '{"full_name":"Demo Admin","selected_role":"admin"}'::jsonb
);

SELECT public.ensure_demo_account(
  'owner@gharpayy.com',
  'owner1234',
  '{"full_name":"Demo Owner","selected_role":"owner","phone":"+919900000001","company_name":"Demo Owner Portfolio"}'::jsonb
);
