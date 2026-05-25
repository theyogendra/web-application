-- Phase 12: Unified chain numbering.
--
-- Before this migration each doc type had its own independent sequence:
--   * proposal_number_seq, quotation_number_seq, invoice_number_seq
-- That meant a proposal PRO-0005 could auto-convert into QUO-0002 simply
-- because the quotation sequence was at a different value -- visibly
-- confusing to users tracking an "order" through the chain.
--
-- After this migration:
--   * One shared sequence  chain_number_seq  drives all three generators.
--   * When a proposal is created, the new PRO-N consumes value N.
--     Auto-converting it produces QUO-N (same N, no new allocation).
--     Approving and converting the quotation produces INV-N (same N).
--   * Standalone documents (e.g. an invoice created directly without a
--     proposal) get a fresh N from the same shared pool, so no collisions.
--
-- Existing rows are NOT renumbered (that would break audit references).
-- Only chains created from this migration forward are aligned.

-- ============================================================
-- 1. Shared sequence, seeded to the max of all existing numeric suffixes
--    so the next allocation never collides with historical rows.
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.chain_number_seq START 1;

DO $$
DECLARE
  max_val bigint := 0;
  v       bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(SUBSTRING(invoice_number FROM 5), '')::bigint), 0) INTO v
  FROM public.invoices WHERE invoice_number LIKE 'INV-%';
  IF v > max_val THEN max_val := v; END IF;

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(quotation_number FROM 5), '')::bigint), 0) INTO v
  FROM public.quotations WHERE quotation_number LIKE 'QUO-%';
  IF v > max_val THEN max_val := v; END IF;

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(proposal_number FROM 5), '')::bigint), 0) INTO v
  FROM public.proposals WHERE proposal_number LIKE 'PRO-%';
  IF v > max_val THEN max_val := v; END IF;

  -- setval with a positive value primes the sequence so nextval returns N+1.
  IF max_val >= 1 THEN
    PERFORM setval('public.chain_number_seq', max_val);
  END IF;
END $$;

-- ============================================================
-- 2. Generators all reuse the shared sequence.
--    Same function names as phase 4 / phase 6 so the backend doesn't
--    need to change which RPC it calls.
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_chain_number()
RETURNS bigint LANGUAGE sql AS $$
  SELECT nextval('public.chain_number_seq');
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'INV-' || lpad(nextval('public.chain_number_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_quotation_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'QUO-' || lpad(nextval('public.chain_number_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_proposal_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'PRO-' || lpad(nextval('public.chain_number_seq')::text, 4, '0');
$$;

-- ============================================================
-- 3. Convert RPCs -- reuse the parent's numeric suffix instead of
--    allocating a new value. Collision-safe fallback to a fresh number
--    from the shared sequence in case the parent number doesn't follow
--    the PRO-/QUO- pattern OR a manual-numbered child already exists.
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
  p        RECORD;
  q_row    RECORD;
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

  -- Reuse the proposal's numeric suffix so PRO-N -> QUO-N share the chain.
  IF p.proposal_number ~ '^PRO-[0-9]+$' THEN
    q_number := 'QUO-' || SUBSTRING(p.proposal_number FROM 5);
  ELSE
    q_number := public.next_quotation_number();
  END IF;

  -- Safety: if a manually-numbered quotation already owns that string,
  -- fall back to a fresh chain number.
  IF EXISTS (SELECT 1 FROM public.quotations WHERE quotation_number = q_number) THEN
    q_number := public.next_quotation_number();
  END IF;

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
  FROM public.proposal_items WHERE proposal_id = proposal_id_input;

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
  q          RECORD;
  inv_row    RECORD;
  inv_number text;
  grand      numeric;
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

  IF q.quotation_number ~ '^QUO-[0-9]+$' THEN
    inv_number := 'INV-' || SUBSTRING(q.quotation_number FROM 5);
  ELSE
    inv_number := public.next_invoice_number();
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = inv_number) THEN
    inv_number := public.next_invoice_number();
  END IF;

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
  FROM public.quotation_items WHERE quotation_id = quotation_id_input;

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
