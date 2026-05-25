-- Phase 10: Role cleanup -- drop Accountant entirely, restore Viewer as a
-- read-only system role. Any user still linked to a removed role gets
-- role_id = NULL via the existing ON DELETE SET NULL FK (they fall back to
-- "no permissions / view-only" until an admin reassigns).
--
-- Resulting role set:
--   * Admin    (full)
--   * Manager  (full minus user CRUD)
--   * Employee (per-module access via user_module_access)
--   * Viewer   (read-only on all five modules; no audit logs, no settings,
--               no user management)

-- ============================================================
-- Drop the Accountant role outright
-- ============================================================
DELETE FROM public.roles
WHERE name IN ('Accountant', 'Accountant (legacy)');

-- ============================================================
-- Restore Viewer as a clean read-only role
-- ============================================================
UPDATE public.roles
SET name        = 'Viewer',
    description = 'Read-only access across Inventory, Proposals, Quotations, Invoices, Payments and Reports. No audit logs, no settings.',
    is_system   = true,
    permissions = '[
      "invoices.read",
      "quotations.read",
      "proposals.read",
      "payments.read",
      "customers.read",
      "inventory.read",
      "reports.read"
    ]'::jsonb,
    updated_at  = now()
WHERE name IN ('Viewer', 'Viewer (legacy)');

-- If Viewer didn't exist at all for some reason, seed it.
INSERT INTO public.roles (name, description, is_system, permissions)
SELECT
  'Viewer',
  'Read-only access across Inventory, Proposals, Quotations, Invoices, Payments and Reports. No audit logs, no settings.',
  true,
  '[
    "invoices.read",
    "quotations.read",
    "proposals.read",
    "payments.read",
    "customers.read",
    "inventory.read",
    "reports.read"
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Viewer');
