-- Phase 7: Atomic document-conversion RPCs.
-- Replace the multi-step JS conversion logic with single Postgres functions
-- so we never end up with a half-created destination + half-updated source.

-- ============================================================
-- convert_proposal_to_quotation
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_proposal_to_quotation(
  proposal_id_input  uuid,
  valid_until_input  date,
  user_id_input      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p RECORD;
  q_row RECORD;
  q_number text;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = proposal_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Proposal not found');
  END IF;

  IF p.status IN ('converted', 'cancelled', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot convert a ' || p.status || ' proposal'
    );
  END IF;

  q_number := public.next_quotation_number();

  INSERT INTO public.quotations (
    quotation_number, customer_id, customer_name, customer_email, customer_phone,
    billing_address, quotation_date, valid_until, status,
    notes, terms,
    subtotal, discount, tax_amount, grand_total,
    converted_from_proposal_id, created_by
  ) VALUES (
    q_number, p.customer_id, p.customer_name, p.customer_email, p.customer_phone,
    p.billing_address, current_date, COALESCE(valid_until_input, p.valid_until), 'draft',
    p.notes, p.terms,
    p.subtotal, p.discount, p.tax_amount, p.grand_total,
    p.id, user_id_input
  ) RETURNING * INTO q_row;

  INSERT INTO public.quotation_items (
    quotation_id, product_id, description, quantity, unit_price,
    discount, discount_amount, tax_rate, tax_amount,
    line_subtotal, line_total, total
  )
  SELECT
    q_row.id, product_id, description, quantity, unit_price,
    discount, discount_amount, tax_rate, tax_amount,
    line_subtotal, line_total, total
  FROM public.proposal_items
  WHERE proposal_id = proposal_id_input;

  UPDATE public.proposals
  SET status                    = 'converted',
      converted_at              = now(),
      converted_to_quotation_id = q_row.id,
      updated_at                = now(),
      updated_by                = user_id_input
  WHERE id = proposal_id_input;

  RETURN jsonb_build_object(
    'success', true,
    'quotation_id',     q_row.id,
    'quotation_number', q_row.quotation_number
  );
END;
$$;

-- ============================================================
-- convert_quotation_to_invoice
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
  quotation_id_input  uuid,
  due_date_input      date,
  user_id_input       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q RECORD;
  inv_row RECORD;
  inv_number text;
  grand numeric;
BEGIN
  SELECT * INTO q FROM public.quotations WHERE id = quotation_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quotation not found');
  END IF;

  IF q.status IN ('converted', 'cancelled', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot convert a ' || q.status || ' quotation'
    );
  END IF;

  inv_number := public.next_invoice_number();
  grand := COALESCE(q.grand_total, 0);

  INSERT INTO public.invoices (
    invoice_number, customer_id, customer_name, customer_email, customer_phone,
    billing_address, invoice_date, due_date, status,
    notes, terms,
    subtotal, discount, tax_amount, grand_total,
    paid_amount, balance_due,
    converted_from_quotation_id, created_by
  ) VALUES (
    inv_number, q.customer_id, q.customer_name, q.customer_email, q.customer_phone,
    q.billing_address, current_date, COALESCE(due_date_input, q.valid_until), 'draft',
    q.notes, q.terms,
    q.subtotal, q.discount, q.tax_amount, grand,
    0, grand,
    q.id, user_id_input
  ) RETURNING * INTO inv_row;

  INSERT INTO public.invoice_items (
    invoice_id, product_id, description, quantity, unit_price,
    discount, discount_amount, tax_rate, tax_amount,
    line_subtotal, line_total, total
  )
  SELECT
    inv_row.id, product_id, description, quantity, unit_price,
    discount, discount_amount, tax_rate, tax_amount,
    line_subtotal, line_total, total
  FROM public.quotation_items
  WHERE quotation_id = quotation_id_input;

  UPDATE public.quotations
  SET status                  = 'converted',
      converted_at            = now(),
      converted_to_invoice_id = inv_row.id,
      updated_at              = now(),
      updated_by              = user_id_input
  WHERE id = quotation_id_input;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id',     inv_row.id,
    'invoice_number', inv_row.invoice_number
  );
END;
$$;
