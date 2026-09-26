-- Password-based authentication for the portal.
--
-- Adds per-user password hashes (scrypt, set only through the admin panel or
-- scripts/set-user-password.mjs), roles, and a session version that is bumped
-- whenever a password/role changes so existing sessions are invalidated.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_requested_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'super_admin'));
  END IF;
END $$;

UPDATE public.users
SET role = 'super_admin'
WHERE email IN ('["dhruvshdarshansh@gmail.com"]', '["dharmsasanwork99@gmail.com"]');

-- This Supabase project is shared with aryanculture.org, whose anon key is public.
-- The portal only touches `users` through the service role, so lock the table
-- down: RLS on with no policies, and no direct grants for anon/authenticated.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users FROM anon, authenticated;
