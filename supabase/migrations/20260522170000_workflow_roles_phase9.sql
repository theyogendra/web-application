-- Phase 9: Workflow redesign + per-module role access + payment approval
--
-- Roles (final):
--   * Admin    -- full access including user management
--   * Manager  -- everything except creating/editing/deleting users
--   * Employee -- per-module access governed by user_module_access
--                 (Inventory / Proposals / Quotations / Invoices / Payments)
--                 No audit-logs access. View-only on unassigned modules.
--
-- Workflow:
--   Proposal create  -> auto-creates linked draft Quotation
--   Quotation accept -> auto-creates linked draft Invoice
--   Invoice approve  -> ready for Payment
--   Payment approve  -> marks invoice paid + deducts inventory

-- ============================================================
-- user_module_access -- per-user fine-grained module access
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.users(id) ON DELETE CASCADE,
  module       text NOT NULL,           -- 'inventory' | 'proposals' | 'quotations' | 'invoices' | 'payments'
  access_level text NOT NULL DEFAULT 'view',  -- 'view' | 'edit'
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON public.user_module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_module ON public.user_module_access(module);

ALTER TABLE public.user_module_access
  ADD CONSTRAINT IF NOT EXISTS user_module_access_module_chk
  CHECK (module IN ('inventory','proposals','quotations','invoices','payments'));

ALTER TABLE public.user_module_access
  ADD CONSTRAINT IF NOT EXISTS user_module_access_level_chk
  CHECK (access_level IN ('view','edit'));

-- ============================================================
-- Refresh role permissions for the new flow
-- ============================================================
-- Manager: same as Admin minus user/role management
UPDATE public.roles SET permissions = '[
  "users.read",
  "roles.read",
  "invoices.read","invoices.create","invoices.update","invoices.delete","invoices.send","invoices.approve",
  "quotations.read","quotations.create","quotations.update","quotations.delete","quotations.send","quotations.convert","quotations.approve",
  "proposals.read","proposals.create","proposals.update","proposals.delete","proposals.send","proposals.convert","proposals.approve",
  "payments.read","payments.create","payments.update","payments.delete","payments.approve",
  "customers.read","customers.create","customers.update","customers.delete",
  "inventory.read","inventory.create","inventory.update","inventory.delete",
  "reports.read","reports.export",
  "audit_logs.read","audit_logs.export",
  "settings.read"
]'::jsonb WHERE name = 'Manager';

-- Admin: keep everything (already correct from phase 5) + new approval verbs
UPDATE public.roles SET permissions = '[
  "users.read","users.create","users.update","users.delete",
  "roles.read","roles.create","roles.update","roles.delete",
  "invoices.read","invoices.create","invoices.update","invoices.delete","invoices.send","invoices.approve",
  "quotations.read","quotations.create","quotations.update","quotations.delete","quotations.send","quotations.convert","quotations.approve",
  "proposals.read","proposals.create","proposals.update","proposals.delete","proposals.send","proposals.convert","proposals.approve",
  "payments.read","payments.create","payments.update","payments.delete","payments.approve",
  "customers.read","customers.create","customers.update","customers.delete",
  "inventory.read","inventory.create","inventory.update","inventory.delete",
  "reports.read","reports.export",
  "audit_logs.read","audit_logs.export",
  "settings.read","settings.update"
]'::jsonb WHERE name = 'Admin';

-- Employee: empty by default; effective access derived from user_module_access.
INSERT INTO public.roles (name, description, is_system, permissions)
VALUES (
  'Employee',
  'Per-module access set via user_module_access. View on unassigned modules. No audit-log access.',
  true,
  '[]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- Retire the legacy Accountant / Viewer system roles by renaming them so they
-- don't accidentally get assigned, but keep the row for any user still linked.
UPDATE public.roles SET name = 'Accountant (legacy)', is_system = false
  WHERE name = 'Accountant';
UPDATE public.roles SET name = 'Viewer (legacy)', is_system = false
  WHERE name = 'Viewer';

-- ============================================================
-- payments: approval workflow
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS approval_status  text DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Existing pre-phase-9 payments are implicitly approved (the old behaviour
-- credited them immediately). Reflect that so balances stay correct.
UPDATE public.payments SET approval_status = 'approved'
  WHERE approval_status IS NULL OR approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payments_approval_status ON public.payments(approval_status);

-- ============================================================
-- record_invoice_payment v2 -- never auto-applies any more.
-- It inserts the payment in approval_status='pending' and does NOT touch
-- invoice paid_amount/balance_due/status. Approval is the trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  invoice_id_input       uuid,
  amount_input           numeric,
  payment_method_input   text,
  payment_date_input     date,
  reference_number_input text,
  notes_input            text,
  user_id_input          uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv          RECORD;
  pay_row      RECORD;
  already_paid numeric;
  pay_number   text;
BEGIN
  IF amount_input IS NULL OR amount_input <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Payment amount must be greater than zero');
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
  END IF;

  IF inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot record payment on a cancelled invoice');
  END IF;

  -- Sum already-approved + pending payments to guard against creating a row
  -- that would overpay even once approved.
  SELECT COALESCE(SUM(amount), 0) INTO already_paid
  FROM public.payments
  WHERE invoice_id = invoice_id_input
    AND approval_status IN ('approved', 'pending');

  IF already_paid + amount_input > COALESCE(inv.grand_total, 0) + 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payment would exceed the outstanding balance (including pending approvals)',
      'balance_due', round(COALESCE(inv.grand_total, 0) - already_paid, 2)
    );
  END IF;

  pay_number := public.next_payment_number();

  INSERT INTO public.payments
    (invoice_id, payment_number, amount, payment_date, payment_method,
     reference_number, notes, created_by, approval_status)
  VALUES
    (invoice_id_input, pay_number, amount_input,
     COALESCE(payment_date_input, current_date),
     COALESCE(NULLIF(payment_method_input, ''), 'cash'),
     reference_number_input, notes_input, user_id_input, 'pending')
  RETURNING * INTO pay_row;

  RETURN jsonb_build_object(
    'success',         true,
    'message',         'Payment recorded; awaiting approval',
    'payment',         row_to_json(pay_row),
    'invoice_status',  inv.status,        -- unchanged until approval
    'paid_amount',     COALESCE(inv.paid_amount, 0),
    'balance_due',     COALESCE(inv.balance_due, 0)
  );
END;
$$;

-- ============================================================
-- approve_invoice_payment(payment_id, user_id)
--   - locks invoice
--   - flips payment to 'approved'
--   - recalculates invoice paid_amount / balance_due / status from APPROVED payments
--   - if invoice becomes fully paid, deducts inventory stock from each line
--     item that references a product, and logs a stock_movement row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_invoice_payment(
  payment_id_input uuid,
  user_id_input    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pay         RECORD;
  inv         RECORD;
  total_paid  numeric;
  new_balance numeric;
  new_status  text;
  was_paid    boolean;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = payment_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Payment not found');
  END IF;
  IF pay.approval_status = 'approved' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Payment is already approved');
  END IF;
  IF pay.approval_status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot approve a rejected payment');
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = pay.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Linked invoice not found');
  END IF;
  was_paid := inv.status = 'paid';

  UPDATE public.payments
  SET approval_status = 'approved',
      approved_at     = now(),
      approved_by     = user_id_input
  WHERE id = payment_id_input;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = pay.invoice_id AND approval_status = 'approved';

  new_balance := round(COALESCE(inv.grand_total, 0) - total_paid, 2);
  IF new_balance <= 0.01 THEN
    new_balance := 0;
    new_status  := 'paid';
  ELSE
    new_status  := 'partially_paid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = total_paid,
      balance_due = new_balance,
      status      = new_status,
      paid_at     = CASE WHEN new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at  = now(),
      updated_by  = user_id_input
  WHERE id = pay.invoice_id;

  -- Inventory deduction: only the first time the invoice transitions to paid,
  -- and only for line items that reference a real product.
  IF new_status = 'paid' AND NOT was_paid THEN
    INSERT INTO public.stock_movements (
      product_id, invoice_id, invoice_item_id, movement_type, quantity,
      old_stock, new_stock, reason, reference_type, reference_id, created_by
    )
    SELECT
      ii.product_id, inv.id, ii.id, 'invoice_paid_reduce', -ii.quantity,
      p.stock, p.stock - ii.quantity,
      'Stock deducted on payment approval', 'invoice', inv.id, user_id_input
    FROM public.invoice_items ii
    JOIN public.products p ON p.id = ii.product_id
    WHERE ii.invoice_id = inv.id AND ii.product_id IS NOT NULL;

    UPDATE public.products p
    SET stock = p.stock - ii.quantity
    FROM public.invoice_items ii
    WHERE ii.invoice_id = inv.id
      AND ii.product_id = p.id;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'message',        'Payment approved',
    'invoice_status', new_status,
    'paid_amount',    total_paid,
    'balance_due',    new_balance,
    'inventory_deducted', new_status = 'paid' AND NOT was_paid
  );
END;
$$;

-- ============================================================
-- reject_invoice_payment(payment_id, user_id, reason)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_invoice_payment(
  payment_id_input uuid,
  user_id_input    uuid,
  reason_input     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pay RECORD;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = payment_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Payment not found');
  END IF;
  IF pay.approval_status = 'approved' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot reject an already-approved payment');
  END IF;

  UPDATE public.payments
  SET approval_status  = 'rejected',
      rejected_at      = now(),
      rejected_by      = user_id_input,
      rejection_reason = reason_input
  WHERE id = payment_id_input;

  RETURN jsonb_build_object('success', true, 'message', 'Payment rejected');
END;
$$;
