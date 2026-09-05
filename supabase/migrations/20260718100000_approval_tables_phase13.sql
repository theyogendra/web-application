-- Phase 13: Approval-workflow infrastructure
--
-- Adds the three tables referenced by the invoice approval endpoints
-- that were missing from all prior migrations:
--
--   approval_rules     -- which role/amount triggers approval
--   invoice_approvals  -- per-invoice approval record
--   approval_logs      -- audit trail of every approve/reject action
--
-- Also adds the missing columns to the invoices table that the
-- /request-approval and /approve endpoints write to.

-- ============================================================
-- invoices: missing approval columns
-- ============================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approval_status   text,
  ADD COLUMN IF NOT EXISTS approval_level    integer,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason  text;

CREATE INDEX IF NOT EXISTS idx_invoices_approval_status
  ON public.invoices(approval_status);

-- ============================================================
-- approval_rules
-- Defines which approver role is responsible for which amount
-- band. The /request-approval endpoint picks the first active
-- rule whose min_amount <= grand_total <= max_amount (or
-- max_amount IS NULL for an unlimited upper bound).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approval_rules (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  approver_role  text        NOT NULL,
  approval_level integer     NOT NULL DEFAULT 1,
  min_amount     numeric     NOT NULL DEFAULT 0,
  max_amount     numeric,                          -- NULL = unlimited
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_active
  ON public.approval_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_approval_rules_level
  ON public.approval_rules(approval_level);

-- ============================================================
-- Seed: one default catch-all rule so the workflow functions
-- out-of-the-box without manual DB configuration.
-- Skipped if any active rule already exists.
-- ============================================================
INSERT INTO public.approval_rules
  (approver_role, approval_level, min_amount, max_amount, is_active)
SELECT 'Manager', 1, 0, NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.approval_rules WHERE is_active = true
);

-- ============================================================
-- invoice_approvals
-- One row is inserted per approval request. The /approve and
-- /reject endpoints look up the pending row for the invoice.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_approvals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid        REFERENCES public.invoices(id) ON DELETE CASCADE,
  approver_role  text        NOT NULL,
  approval_level integer     NOT NULL DEFAULT 1,
  status         text        NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  remarks        text,
  approved_at    timestamptz,
  rejected_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_approvals_status_chk'
  ) THEN
    ALTER TABLE public.invoice_approvals
      ADD CONSTRAINT invoice_approvals_status_chk
      CHECK (status IN ('pending','approved','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_approvals_invoice_id
  ON public.invoice_approvals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_approvals_status
  ON public.invoice_approvals(status);

-- ============================================================
-- approval_logs
-- Immutable audit trail written by the /request-approval,
-- /approve, and /reject endpoints.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid        REFERENCES public.invoices(id) ON DELETE CASCADE,
  approval_id uuid        REFERENCES public.invoice_approvals(id) ON DELETE SET NULL,
  action      text        NOT NULL,   -- approval_requested | approved | rejected
  action_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  remarks     text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_logs_invoice_id
  ON public.approval_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_approval_logs_action
  ON public.approval_logs(action);
