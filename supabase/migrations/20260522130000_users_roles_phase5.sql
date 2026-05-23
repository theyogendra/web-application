-- Phase 5: Users, Roles & Permissions
-- Extends the existing `users` table with profile / status / audit columns,
-- adds a `roles` table with a JSONB permissions array, seeds four system
-- roles, links every existing user to Admin, and seeds an admin account.

-- ============================================================
-- USERS: profile + status + tracking
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS avatar_url      text,
  ADD COLUMN IF NOT EXISTS is_active       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_superuser    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_hash   text,        -- future bcrypt path; plaintext `password` kept for backward compat
  ADD COLUMN IF NOT EXISTS last_login_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_ip   text,
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_email     ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  description text,
  is_system   boolean DEFAULT false,                 -- prevents deletion of built-in roles
  permissions jsonb   DEFAULT '[]'::jsonb,           -- array of "module.action" strings
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);

-- Link users to a role (FK added now that roles exists)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);

-- ============================================================
-- SEED: system roles
-- Permissions use "module.action" naming so the app can check
-- e.g. user.permissions.includes('invoices.create').
-- ============================================================
INSERT INTO public.roles (name, description, is_system, permissions)
VALUES
  ('Admin', 'Full system access', true, '[
    "users.read","users.create","users.update","users.delete",
    "roles.read","roles.create","roles.update","roles.delete",
    "invoices.read","invoices.create","invoices.update","invoices.delete","invoices.send","invoices.approve",
    "quotations.read","quotations.create","quotations.update","quotations.delete","quotations.send","quotations.convert",
    "proposals.read","proposals.create","proposals.update","proposals.delete","proposals.send","proposals.convert",
    "payments.read","payments.create","payments.update","payments.delete",
    "customers.read","customers.create","customers.update","customers.delete",
    "inventory.read","inventory.create","inventory.update","inventory.delete",
    "reports.read","reports.export",
    "audit_logs.read","audit_logs.export",
    "settings.read","settings.update"
  ]'::jsonb),
  ('Manager', 'Manage invoices, quotations, payments. View reports & audit logs.', true, '[
    "invoices.read","invoices.create","invoices.update","invoices.delete","invoices.send",
    "quotations.read","quotations.create","quotations.update","quotations.delete","quotations.send","quotations.convert",
    "proposals.read","proposals.create","proposals.update","proposals.delete","proposals.send","proposals.convert",
    "payments.read","payments.create","payments.update",
    "customers.read","customers.create","customers.update",
    "inventory.read","inventory.update",
    "reports.read","reports.export",
    "audit_logs.read"
  ]'::jsonb),
  ('Accountant', 'Record payments and view financial reports.', true, '[
    "invoices.read","invoices.send",
    "quotations.read",
    "payments.read","payments.create","payments.update",
    "customers.read",
    "inventory.read",
    "reports.read","reports.export",
    "audit_logs.read"
  ]'::jsonb),
  ('Viewer', 'Read-only access to all modules.', true, '[
    "invoices.read",
    "quotations.read",
    "proposals.read",
    "payments.read",
    "customers.read",
    "inventory.read",
    "reports.read",
    "audit_logs.read"
  ]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Assign any existing un-roled user to Admin (legacy users
-- shouldn't suddenly lose access when this migration runs).
-- NOTE: we backfill the role only — `is_superuser` is left untouched
-- so re-running this migration after new users have been created
-- doesn't accidentally grant them superuser. The seeded
-- admin@enterprise.com row below explicitly sets is_superuser = true.
-- ============================================================
UPDATE public.users
SET role_id = (SELECT id FROM public.roles WHERE name = 'Admin')
WHERE role_id IS NULL;

-- ============================================================
-- Seed default admin account if none exists.
-- Matches ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env.
-- ============================================================
INSERT INTO public.users (name, email, password, is_active, is_superuser, role_id)
SELECT
  'System Administrator',
  'admin@enterprise.com',
  'admin123',
  true,
  true,
  (SELECT id FROM public.roles WHERE name = 'Admin')
WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'admin@enterprise.com');

-- ============================================================
-- USER SESSIONS (optional but useful for forced logout / device list)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE,
  token_id    text UNIQUE,
  ip_address  text,
  user_agent  text,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id     ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at  ON public.user_sessions(expires_at);
