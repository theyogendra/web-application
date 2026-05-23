-- Phase 4: Billing fields, Payments, Email logs, Company settings, Reports support
-- Extends the existing invoice system (Phases 1-3) rather than replacing it.

-- ============================================================
-- INVOICES: billing / customer / payment-tracking fields
-- ============================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_name    text,
  ADD COLUMN IF NOT EXISTS customer_email   text,
  ADD COLUMN IF NOT EXISTS customer_phone   text,
  ADD COLUMN IF NOT EXISTS billing_address  text,
  ADD COLUMN IF NOT EXISTS invoice_date     date DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS due_date         date,
  ADD COLUMN IF NOT EXISTS paid_amount      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS terms            text,
  ADD COLUMN IF NOT EXISTS sent_at          timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at          timestamptz;

-- ============================================================
-- INVOICE ITEMS: description + per-line discount amount
-- (these were referenced by the validation service but never created)
-- ============================================================
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- ============================================================
-- AUDIT LOGS: spec fields (user_name, module, details, user_agent)
-- entity_type is relaxed to nullable so non-entity actions
-- (Login, Logout, Report Viewed, ...) can be logged too.
-- ============================================================
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_name  text,
  ADD COLUMN IF NOT EXISTS module     text,
  ADD COLUMN IF NOT EXISTS details    jsonb,
  ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE public.audit_logs ALTER COLUMN entity_type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module     ON public.audit_logs(module);

-- ============================================================
-- NUMBER SEQUENCES + GENERATORS (INV-0001, PAY-0001)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_payment_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'PAY-' || lpad(nextval('public.payment_number_seq')::text, 4, '0');
$$;

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid references public.invoices(id) on delete cascade,
  payment_number   text unique,
  amount           numeric not null check (amount > 0),
  payment_date     date default current_date,
  payment_method   text not null default 'cash',
  reference_number text,
  notes            text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date       ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method     ON public.payments(payment_method);

-- ============================================================
-- EMAIL LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id                  uuid primary key default gen_random_uuid(),
  to_email            text not null,
  subject             text,
  body                text,
  email_type          text,
  module              text,
  record_id           uuid,
  status              text default 'pending',
  provider            text default 'resend',
  provider_message_id text,
  sent_at             timestamptz,
  error_message       text,
  created_at          timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_record ON public.email_logs(record_id);

-- ============================================================
-- COMPANY SETTINGS (single-row config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_settings (
  id             uuid primary key default gen_random_uuid(),
  company_name   text default 'Your Company',
  email          text,
  phone          text,
  address        text,
  logo_url       text,
  tax_number     text,
  invoice_prefix text default 'INV-',
  currency       text default 'INR',
  default_terms  text,
  default_notes  text,
  updated_at     timestamptz default now()
);

INSERT INTO public.company_settings (company_name, email, phone, currency, default_terms)
SELECT 'Your Company', 'billing@yourcompany.com', '', 'INR',
       'Payment due within 15 days of invoice date.'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- ============================================================
-- RPC: record_invoice_payment
-- Atomic payment recording with overpayment prevention and
-- automatic invoice status transition (partially_paid / paid).
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
  new_paid     numeric;
  new_balance  numeric;
  new_status   text;
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

  SELECT COALESCE(SUM(amount), 0) INTO already_paid
  FROM public.payments WHERE invoice_id = invoice_id_input;

  new_paid := already_paid + amount_input;

  -- Overpayment guard (1 paisa/cent tolerance for float rounding)
  IF new_paid > COALESCE(inv.grand_total, 0) + 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payment exceeds the outstanding balance',
      'balance_due', round(COALESCE(inv.grand_total, 0) - already_paid, 2)
    );
  END IF;

  new_balance := round(COALESCE(inv.grand_total, 0) - new_paid, 2);
  IF new_balance <= 0.01 THEN
    new_balance := 0;
    new_status  := 'paid';
  ELSE
    new_status  := 'partially_paid';
  END IF;

  pay_number := public.next_payment_number();

  INSERT INTO public.payments
    (invoice_id, payment_number, amount, payment_date, payment_method, reference_number, notes, created_by)
  VALUES
    (invoice_id_input, pay_number, amount_input, COALESCE(payment_date_input, current_date),
     COALESCE(NULLIF(payment_method_input, ''), 'cash'), reference_number_input, notes_input, user_id_input)
  RETURNING * INTO pay_row;

  UPDATE public.invoices
  SET paid_amount = new_paid,
      balance_due = new_balance,
      status      = new_status,
      paid_at     = CASE WHEN new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at  = now(),
      updated_by  = user_id_input
  WHERE id = invoice_id_input;

  RETURN jsonb_build_object(
    'success',        true,
    'message',        'Payment recorded successfully',
    'payment',        row_to_json(pay_row),
    'invoice_status', new_status,
    'paid_amount',    new_paid,
    'balance_due',    new_balance
  );
END;
$$;

-- Keep invoice paid/balance figures correct after a payment is deleted.
CREATE OR REPLACE FUNCTION public.recalculate_invoice_payment(invoice_id_input uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv         RECORD;
  total_paid  numeric;
  new_balance numeric;
  new_status  text;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments WHERE invoice_id = invoice_id_input;

  new_balance := round(COALESCE(inv.grand_total, 0) - total_paid, 2);

  IF inv.status = 'cancelled' THEN
    new_status := 'cancelled';
  ELSIF total_paid <= 0 THEN
    new_status := CASE WHEN inv.sent_at IS NOT NULL THEN 'sent' ELSE 'draft' END;
  ELSIF new_balance <= 0.01 THEN
    new_balance := 0;
    new_status  := 'paid';
  ELSE
    new_status := 'partially_paid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = total_paid,
      balance_due = new_balance,
      status      = new_status,
      updated_at  = now()
  WHERE id = invoice_id_input;

  RETURN jsonb_build_object('success', true, 'paid_amount', total_paid,
                            'balance_due', new_balance, 'invoice_status', new_status);
END;
$$;
