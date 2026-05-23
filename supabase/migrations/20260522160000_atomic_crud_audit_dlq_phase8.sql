-- Phase 8: Atomic create/update with items + audit dead-letter + reports SQL
--
-- 1. audit_logs_failed -- DLQ for createAuditLog inserts that fail (e.g. RLS
--    drop, transient outage). We never want a money-touching mutation to
--    succeed silently with no audit trail.
-- 2. create/update RPCs for invoice/quotation/proposal so the parent insert
--    + child items insert run inside a single Postgres transaction.
-- 3. Reports SQL aggregations so summary / monthly revenue / aging / customer
--    revenue / payment methods / tax monthly do not pull every row into JS.

-- ============================================================
-- AUDIT LOGS DEAD-LETTER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs_failed (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload      jsonb NOT NULL,
  error_message text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_failed_created_at
  ON public.audit_logs_failed(created_at DESC);

-- ============================================================
-- ATOMIC CRUD: invoices
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  invoice_input jsonb,
  items_input   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
BEGIN
  INSERT INTO public.invoices (
    invoice_number, customer_id, vendor_id,
    customer_name, customer_email, customer_phone, billing_address,
    invoice_date, due_date, notes, terms,
    status, validation_status, validation_errors, validation_warnings,
    subtotal, discount, tax_amount, grand_total,
    paid_amount, balance_due,
    created_by
  )
  VALUES (
    invoice_input->>'invoice_number',
    NULLIF(invoice_input->>'customer_id', '')::uuid,
    NULLIF(invoice_input->>'vendor_id', '')::uuid,
    invoice_input->>'customer_name',
    invoice_input->>'customer_email',
    invoice_input->>'customer_phone',
    invoice_input->>'billing_address',
    COALESCE(NULLIF(invoice_input->>'invoice_date', '')::date, current_date),
    NULLIF(invoice_input->>'due_date', '')::date,
    invoice_input->>'notes',
    invoice_input->>'terms',
    COALESCE(invoice_input->>'status', 'draft'),
    invoice_input->>'validation_status',
    COALESCE(invoice_input->'validation_errors', '[]'::jsonb),
    COALESCE(invoice_input->'validation_warnings', '[]'::jsonb),
    COALESCE((invoice_input->>'subtotal')::numeric, 0),
    COALESCE((invoice_input->>'discount')::numeric, 0),
    COALESCE((invoice_input->>'tax_amount')::numeric, 0),
    COALESCE((invoice_input->>'grand_total')::numeric, 0),
    COALESCE((invoice_input->>'paid_amount')::numeric, 0),
    COALESCE((invoice_input->>'balance_due')::numeric, 0),
    NULLIF(invoice_input->>'created_by', '')::uuid
  )
  RETURNING * INTO inv;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    INSERT INTO public.invoice_items (
      invoice_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total,
      expected_unit_price, price_variance, validation_errors
    )
    SELECT
      inv.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0),
      COALESCE((item->>'expected_unit_price')::numeric, 0),
      COALESCE((item->>'price_variance')::numeric, 0),
      COALESCE(item->'validation_errors', '[]'::jsonb)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', inv.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
  invoice_id_input uuid,
  invoice_input    jsonb,
  items_input      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
BEGIN
  UPDATE public.invoices SET
    invoice_number      = COALESCE(invoice_input->>'invoice_number', invoice_number),
    customer_id         = COALESCE(NULLIF(invoice_input->>'customer_id', '')::uuid, customer_id),
    vendor_id           = COALESCE(NULLIF(invoice_input->>'vendor_id', '')::uuid, vendor_id),
    customer_name       = COALESCE(invoice_input->>'customer_name', customer_name),
    customer_email      = COALESCE(invoice_input->>'customer_email', customer_email),
    customer_phone      = COALESCE(invoice_input->>'customer_phone', customer_phone),
    billing_address     = COALESCE(invoice_input->>'billing_address', billing_address),
    invoice_date        = COALESCE(NULLIF(invoice_input->>'invoice_date', '')::date, invoice_date),
    due_date            = COALESCE(NULLIF(invoice_input->>'due_date', '')::date, due_date),
    notes               = COALESCE(invoice_input->>'notes', notes),
    terms               = COALESCE(invoice_input->>'terms', terms),
    status              = COALESCE(invoice_input->>'status', status),
    validation_status   = COALESCE(invoice_input->>'validation_status', validation_status),
    validation_errors   = COALESCE(invoice_input->'validation_errors', validation_errors),
    validation_warnings = COALESCE(invoice_input->'validation_warnings', validation_warnings),
    subtotal            = COALESCE((invoice_input->>'subtotal')::numeric, subtotal),
    discount            = COALESCE((invoice_input->>'discount')::numeric, discount),
    tax_amount          = COALESCE((invoice_input->>'tax_amount')::numeric, tax_amount),
    grand_total         = COALESCE((invoice_input->>'grand_total')::numeric, grand_total),
    balance_due         = COALESCE((invoice_input->>'balance_due')::numeric, balance_due),
    updated_by          = COALESCE(NULLIF(invoice_input->>'updated_by', '')::uuid, updated_by),
    updated_at          = now()
  WHERE id = invoice_id_input
  RETURNING * INTO inv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
  END IF;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    DELETE FROM public.invoice_items WHERE invoice_id = invoice_id_input;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total,
      expected_unit_price, price_variance, validation_errors
    )
    SELECT
      inv.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0),
      COALESCE((item->>'expected_unit_price')::numeric, 0),
      COALESCE((item->>'price_variance')::numeric, 0),
      COALESCE(item->'validation_errors', '[]'::jsonb)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', inv.id);
END;
$$;

-- ============================================================
-- ATOMIC CRUD: quotations
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_quotation_with_items(
  q_input    jsonb,
  items_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q RECORD;
BEGIN
  INSERT INTO public.quotations (
    quotation_number, customer_id,
    customer_name, customer_email, customer_phone, billing_address,
    quotation_date, valid_until, status,
    notes, terms,
    subtotal, discount, tax_amount, grand_total,
    created_by
  )
  VALUES (
    q_input->>'quotation_number',
    NULLIF(q_input->>'customer_id', '')::uuid,
    q_input->>'customer_name',
    q_input->>'customer_email',
    q_input->>'customer_phone',
    q_input->>'billing_address',
    COALESCE(NULLIF(q_input->>'quotation_date', '')::date, current_date),
    NULLIF(q_input->>'valid_until', '')::date,
    COALESCE(q_input->>'status', 'draft'),
    q_input->>'notes',
    q_input->>'terms',
    COALESCE((q_input->>'subtotal')::numeric, 0),
    COALESCE((q_input->>'discount')::numeric, 0),
    COALESCE((q_input->>'tax_amount')::numeric, 0),
    COALESCE((q_input->>'grand_total')::numeric, 0),
    NULLIF(q_input->>'created_by', '')::uuid
  )
  RETURNING * INTO q;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    INSERT INTO public.quotation_items (
      quotation_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total
    )
    SELECT
      q.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'quotation_id', q.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_quotation_with_items(
  quotation_id_input uuid,
  q_input            jsonb,
  items_input        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q RECORD;
BEGIN
  UPDATE public.quotations SET
    quotation_number = COALESCE(q_input->>'quotation_number', quotation_number),
    customer_id      = COALESCE(NULLIF(q_input->>'customer_id', '')::uuid, customer_id),
    customer_name    = COALESCE(q_input->>'customer_name', customer_name),
    customer_email   = COALESCE(q_input->>'customer_email', customer_email),
    customer_phone   = COALESCE(q_input->>'customer_phone', customer_phone),
    billing_address  = COALESCE(q_input->>'billing_address', billing_address),
    quotation_date   = COALESCE(NULLIF(q_input->>'quotation_date', '')::date, quotation_date),
    valid_until      = COALESCE(NULLIF(q_input->>'valid_until', '')::date, valid_until),
    status           = COALESCE(q_input->>'status', status),
    notes            = COALESCE(q_input->>'notes', notes),
    terms            = COALESCE(q_input->>'terms', terms),
    subtotal         = COALESCE((q_input->>'subtotal')::numeric, subtotal),
    discount         = COALESCE((q_input->>'discount')::numeric, discount),
    tax_amount       = COALESCE((q_input->>'tax_amount')::numeric, tax_amount),
    grand_total      = COALESCE((q_input->>'grand_total')::numeric, grand_total),
    updated_by       = COALESCE(NULLIF(q_input->>'updated_by', '')::uuid, updated_by),
    updated_at       = now()
  WHERE id = quotation_id_input
  RETURNING * INTO q;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quotation not found');
  END IF;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    DELETE FROM public.quotation_items WHERE quotation_id = quotation_id_input;

    INSERT INTO public.quotation_items (
      quotation_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total
    )
    SELECT
      q.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'quotation_id', q.id);
END;
$$;

-- ============================================================
-- ATOMIC CRUD: proposals
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_proposal_with_items(
  p_input    jsonb,
  items_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p RECORD;
BEGIN
  INSERT INTO public.proposals (
    proposal_number, customer_id,
    customer_name, customer_email, customer_phone, billing_address,
    proposal_date, valid_until, status,
    notes, terms, scope,
    subtotal, discount, tax_amount, grand_total,
    created_by
  )
  VALUES (
    p_input->>'proposal_number',
    NULLIF(p_input->>'customer_id', '')::uuid,
    p_input->>'customer_name',
    p_input->>'customer_email',
    p_input->>'customer_phone',
    p_input->>'billing_address',
    COALESCE(NULLIF(p_input->>'proposal_date', '')::date, current_date),
    NULLIF(p_input->>'valid_until', '')::date,
    COALESCE(p_input->>'status', 'draft'),
    p_input->>'notes',
    p_input->>'terms',
    p_input->>'scope',
    COALESCE((p_input->>'subtotal')::numeric, 0),
    COALESCE((p_input->>'discount')::numeric, 0),
    COALESCE((p_input->>'tax_amount')::numeric, 0),
    COALESCE((p_input->>'grand_total')::numeric, 0),
    NULLIF(p_input->>'created_by', '')::uuid
  )
  RETURNING * INTO p;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    INSERT INTO public.proposal_items (
      proposal_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total
    )
    SELECT
      p.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'proposal_id', p.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_proposal_with_items(
  proposal_id_input uuid,
  p_input           jsonb,
  items_input       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p RECORD;
BEGIN
  UPDATE public.proposals SET
    proposal_number = COALESCE(p_input->>'proposal_number', proposal_number),
    customer_id     = COALESCE(NULLIF(p_input->>'customer_id', '')::uuid, customer_id),
    customer_name   = COALESCE(p_input->>'customer_name', customer_name),
    customer_email  = COALESCE(p_input->>'customer_email', customer_email),
    customer_phone  = COALESCE(p_input->>'customer_phone', customer_phone),
    billing_address = COALESCE(p_input->>'billing_address', billing_address),
    proposal_date   = COALESCE(NULLIF(p_input->>'proposal_date', '')::date, proposal_date),
    valid_until     = COALESCE(NULLIF(p_input->>'valid_until', '')::date, valid_until),
    status          = COALESCE(p_input->>'status', status),
    notes           = COALESCE(p_input->>'notes', notes),
    terms           = COALESCE(p_input->>'terms', terms),
    scope           = COALESCE(p_input->>'scope', scope),
    subtotal        = COALESCE((p_input->>'subtotal')::numeric, subtotal),
    discount        = COALESCE((p_input->>'discount')::numeric, discount),
    tax_amount      = COALESCE((p_input->>'tax_amount')::numeric, tax_amount),
    grand_total     = COALESCE((p_input->>'grand_total')::numeric, grand_total),
    updated_by      = COALESCE(NULLIF(p_input->>'updated_by', '')::uuid, updated_by),
    updated_at      = now()
  WHERE id = proposal_id_input
  RETURNING * INTO p;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Proposal not found');
  END IF;

  IF items_input IS NOT NULL AND jsonb_typeof(items_input) = 'array' THEN
    DELETE FROM public.proposal_items WHERE proposal_id = proposal_id_input;

    INSERT INTO public.proposal_items (
      proposal_id, product_id, description,
      quantity, unit_price, discount, discount_amount,
      tax_rate, tax_amount, line_subtotal, line_total, total
    )
    SELECT
      p.id,
      NULLIF(item->>'product_id', '')::bigint,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 0),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount')::numeric, 0),
      COALESCE((item->>'discount_amount')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 0),
      COALESCE((item->>'tax_amount')::numeric, 0),
      COALESCE((item->>'line_subtotal')::numeric, 0),
      COALESCE((item->>'line_total')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0)
    FROM jsonb_array_elements(items_input) AS item;
  END IF;

  RETURN jsonb_build_object('success', true, 'proposal_id', p.id);
END;
$$;

-- ============================================================
-- REPORTS: SQL aggregations
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_summary(
  from_input     date,
  to_input       date,
  customer_input text,
  status_input   text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  inv_counts jsonb;
  totals     jsonb;
  payments_total numeric;
  payments_count int;
BEGIN
  WITH filtered AS (
    SELECT * FROM public.invoices
    WHERE (from_input IS NULL OR invoice_date >= from_input)
      AND (to_input   IS NULL OR invoice_date <= to_input)
      AND (status_input IS NULL OR status = status_input)
      AND (customer_input IS NULL OR customer_name ILIKE '%' || customer_input || '%')
  ),
  active AS (SELECT * FROM filtered WHERE status <> 'cancelled')
  SELECT
    jsonb_build_object(
      'total',          (SELECT count(*) FROM filtered),
      'draft',          (SELECT count(*) FROM filtered WHERE status = 'draft'),
      'sent',           (SELECT count(*) FROM filtered WHERE status = 'sent'),
      'partially_paid', (SELECT count(*) FROM filtered WHERE status = 'partially_paid'),
      'paid',           (SELECT count(*) FROM filtered WHERE status = 'paid'),
      'cancelled',      (SELECT count(*) FROM filtered WHERE status = 'cancelled'),
      'overdue',        (SELECT count(*) FROM filtered
                          WHERE due_date IS NOT NULL
                            AND due_date < current_date
                            AND status NOT IN ('paid','cancelled')
                            AND COALESCE(balance_due, 0) > 0.01),
      'pending',        (SELECT count(*) FROM filtered WHERE status IN ('draft','sent','partially_paid'))
    ),
    jsonb_build_object(
      'total_invoiced',    COALESCE((SELECT round(sum(grand_total)::numeric, 2) FROM active), 0),
      'total_outstanding', COALESCE((SELECT round(sum(balance_due)::numeric, 2) FROM active), 0),
      'total_tax',         COALESCE((SELECT round(sum(tax_amount)::numeric, 2) FROM active), 0)
    )
  INTO inv_counts, totals;

  SELECT COALESCE(round(sum(amount)::numeric, 2), 0), count(*)
  INTO payments_total, payments_count
  FROM public.payments
  WHERE (from_input IS NULL OR payment_date >= from_input)
    AND (to_input   IS NULL OR payment_date <= to_input);

  RETURN jsonb_build_object(
    'total_revenue',     payments_total,
    'total_invoiced',    totals->'total_invoiced',
    'total_outstanding', totals->'total_outstanding',
    'total_tax',         totals->'total_tax',
    'payment_count',     payments_count,
    'invoice_counts',    inv_counts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_revenue_monthly(
  from_input date,
  to_input   date
)
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql STABLE AS $$
  SELECT to_char(payment_date, 'YYYY-MM') AS month,
         round(sum(amount)::numeric, 2)   AS revenue
  FROM public.payments
  WHERE (from_input IS NULL OR payment_date >= from_input)
    AND (to_input   IS NULL OR payment_date <= to_input)
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.report_payment_methods(
  from_input date,
  to_input   date
)
RETURNS TABLE(method text, count bigint, amount numeric)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(payment_method, 'unknown') AS method,
         count(*)                            AS count,
         round(sum(amount)::numeric, 2)      AS amount
  FROM public.payments
  WHERE (from_input IS NULL OR payment_date >= from_input)
    AND (to_input   IS NULL OR payment_date <= to_input)
  GROUP BY 1
  ORDER BY 3 DESC;
$$;

CREATE OR REPLACE FUNCTION public.report_customer_revenue(
  from_input date,
  to_input   date,
  status_input text
)
RETURNS TABLE(customer text, invoice_count bigint, invoiced numeric, paid numeric, balance numeric)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(customer_name, 'Unknown')      AS customer,
         count(*)                                AS invoice_count,
         round(sum(grand_total)::numeric, 2)     AS invoiced,
         round(sum(paid_amount)::numeric, 2)     AS paid,
         round(sum(balance_due)::numeric, 2)     AS balance
  FROM public.invoices
  WHERE status <> 'cancelled'
    AND (from_input IS NULL OR invoice_date >= from_input)
    AND (to_input   IS NULL OR invoice_date <= to_input)
    AND (status_input IS NULL OR status = status_input)
  GROUP BY 1
  ORDER BY paid DESC;
$$;

CREATE OR REPLACE FUNCTION public.report_tax_monthly(
  from_input date,
  to_input   date
)
RETURNS TABLE(month text, subtotal numeric, discount numeric, tax numeric, total numeric)
LANGUAGE sql STABLE AS $$
  SELECT to_char(invoice_date, 'YYYY-MM') AS month,
         round(sum(subtotal)::numeric, 2),
         round(sum(discount)::numeric, 2),
         round(sum(tax_amount)::numeric, 2),
         round(sum(grand_total)::numeric, 2)
  FROM public.invoices
  WHERE status <> 'cancelled'
    AND (from_input IS NULL OR invoice_date >= from_input)
    AND (to_input   IS NULL OR invoice_date <= to_input)
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.report_invoice_aging(
  from_input date,
  to_input   date
)
RETURNS TABLE(bucket text, count bigint, amount numeric)
LANGUAGE sql STABLE AS $$
  WITH bucketed AS (
    SELECT
      CASE
        WHEN due_date IS NULL OR due_date >= current_date THEN 'not_due'
        WHEN current_date - due_date BETWEEN 1 AND 30  THEN '1-30'
        WHEN current_date - due_date BETWEEN 31 AND 60 THEN '31-60'
        WHEN current_date - due_date BETWEEN 61 AND 90 THEN '61-90'
        ELSE '90+'
      END                                     AS bucket,
      COALESCE(balance_due, 0)                AS bal
    FROM public.invoices
    WHERE status <> 'cancelled'
      AND COALESCE(balance_due, 0) > 0.01
      AND (from_input IS NULL OR invoice_date >= from_input)
      AND (to_input   IS NULL OR invoice_date <= to_input)
  )
  SELECT b.bucket,
         COALESCE((SELECT count(*) FROM bucketed WHERE bucket = b.bucket), 0)         AS count,
         COALESCE((SELECT round(sum(bal)::numeric, 2) FROM bucketed WHERE bucket = b.bucket), 0) AS amount
  FROM (VALUES ('not_due'), ('1-30'), ('31-60'), ('61-90'), ('90+')) AS b(bucket);
$$;
