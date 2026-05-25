-- Phase 11: Atomic chain-termination RPCs.
--
-- Replaces the JS-orchestrated cascade in proposal/quotation/invoice routes
-- with four Postgres functions so the primary update + the upstream/downstream
-- cascade run inside a single transaction. JS still owns the audit-log writes
-- after the RPC returns, using the returned jsonb to know what cascaded.

-- ============================================================
-- terminate_proposal
--   - draft: hard DELETE
--   - else : UPDATE status = 'cancelled', rejected_at = now()
--   - FORWARD cascade: if linked quotation is open (draft/sent/accepted)
--                       -> mark it rejected
-- ============================================================
CREATE OR REPLACE FUNCTION public.terminate_proposal(
  proposal_id_input uuid,
  user_id_input     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p          RECORD;
  q          RECORD;
  cascaded   jsonb := NULL;
  was_draft  boolean;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = proposal_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Proposal not found');
  END IF;

  was_draft := p.status = 'draft';

  -- Forward cascade FIRST so a failure here aborts the entire transaction
  -- and we never get a deleted proposal with a stranded quotation.
  IF p.converted_to_quotation_id IS NOT NULL THEN
    SELECT id, status, quotation_number INTO q
    FROM public.quotations
    WHERE id = p.converted_to_quotation_id
    FOR UPDATE;

    IF FOUND AND q.status IN ('draft', 'sent', 'accepted') THEN
      UPDATE public.quotations SET
        status      = 'rejected',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at  = now(),
        updated_by  = user_id_input
      WHERE id = q.id;
      cascaded := jsonb_build_object(
        'type',             'quotation',
        'id',               q.id,
        'quotation_number', q.quotation_number,
        'previous_status',  q.status,
        'new_status',       'rejected'
      );
    END IF;
  END IF;

  -- Terminate the proposal itself
  IF was_draft THEN
    DELETE FROM public.proposals WHERE id = proposal_id_input;
  ELSE
    UPDATE public.proposals SET
      status      = 'cancelled',
      rejected_at = COALESCE(rejected_at, now()),
      updated_at  = now(),
      updated_by  = user_id_input
    WHERE id = proposal_id_input;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'hard_deleted', was_draft,
    'old_status',   p.status,
    'cascaded',     cascaded
  );
END;
$$;

-- ============================================================
-- terminate_quotation
--   - draft: hard DELETE
--   - else : UPDATE status = 'cancelled'
--   - 'converted' status is BLOCKED (caller gets an error)
--   - BACKWARD cascade: if upstream proposal is still 'converted'
--                        -> mark it rejected
-- ============================================================
CREATE OR REPLACE FUNCTION public.terminate_quotation(
  quotation_id_input uuid,
  user_id_input      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q          RECORD;
  p          RECORD;
  cascaded   jsonb := NULL;
  was_draft  boolean;
BEGIN
  SELECT * INTO q FROM public.quotations WHERE id = quotation_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quotation not found');
  END IF;
  IF q.status = 'converted' THEN
    RETURN jsonb_build_object('success', false, 'message', 'A converted quotation cannot be deleted');
  END IF;

  was_draft := q.status = 'draft';

  -- Backward cascade to upstream proposal
  IF q.converted_from_proposal_id IS NOT NULL THEN
    SELECT id, status, proposal_number INTO p
    FROM public.proposals
    WHERE id = q.converted_from_proposal_id
    FOR UPDATE;

    IF FOUND AND p.status = 'converted' THEN
      UPDATE public.proposals SET
        status      = 'rejected',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at  = now(),
        updated_by  = user_id_input
      WHERE id = p.id;
      cascaded := jsonb_build_object(
        'type',            'proposal',
        'id',              p.id,
        'proposal_number', p.proposal_number,
        'previous_status', p.status,
        'new_status',      'rejected'
      );
    END IF;
  END IF;

  IF was_draft THEN
    DELETE FROM public.quotations WHERE id = quotation_id_input;
  ELSE
    UPDATE public.quotations SET
      status      = 'cancelled',
      rejected_at = COALESCE(rejected_at, now()),
      updated_at  = now(),
      updated_by  = user_id_input
    WHERE id = quotation_id_input;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'hard_deleted', was_draft,
    'old_status',   q.status,
    'cascaded',     cascaded
  );
END;
$$;

-- ============================================================
-- mark_quotation_rejected
--   Only valid for draft / sent quotations.
--   BACKWARD cascade to upstream proposal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_quotation_rejected(
  quotation_id_input uuid,
  user_id_input      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q        RECORD;
  p        RECORD;
  cascaded jsonb := NULL;
BEGIN
  SELECT * INTO q FROM public.quotations WHERE id = quotation_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quotation not found');
  END IF;
  IF q.status NOT IN ('draft', 'sent') THEN
    RETURN jsonb_build_object('success', false, 'message',
      format('Cannot reject a %s quotation', q.status));
  END IF;

  UPDATE public.quotations SET
    status      = 'rejected',
    rejected_at = now(),
    updated_at  = now(),
    updated_by  = user_id_input
  WHERE id = quotation_id_input;

  IF q.converted_from_proposal_id IS NOT NULL THEN
    SELECT id, status, proposal_number INTO p
    FROM public.proposals
    WHERE id = q.converted_from_proposal_id
    FOR UPDATE;

    IF FOUND AND p.status = 'converted' THEN
      UPDATE public.proposals SET
        status      = 'rejected',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at  = now(),
        updated_by  = user_id_input
      WHERE id = p.id;
      cascaded := jsonb_build_object(
        'type',            'proposal',
        'id',              p.id,
        'proposal_number', p.proposal_number,
        'previous_status', p.status,
        'new_status',      'rejected'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'old_status', q.status, 'cascaded', cascaded);
END;
$$;

-- ============================================================
-- terminate_invoice
--   - paid: BLOCKED
--   - cancelled: BLOCKED (already terminal)
--   - draft + no payments + allow_hard_delete: hard DELETE
--   - else: UPDATE status = 'cancelled'
--   - Releases held stock via the existing release_invoice_stock /
--     restore_invoice_stock RPCs (PERFORM call inside the same tx).
--   - BACKWARD cascade: upstream quotation 'converted' -> 'rejected'
-- ============================================================
CREATE OR REPLACE FUNCTION public.terminate_invoice(
  invoice_id_input    uuid,
  user_id_input       uuid,
  allow_hard_delete   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv          RECORD;
  q            RECORD;
  cascaded     jsonb := NULL;
  has_payments boolean;
  stock_result jsonb;
  hard_deleted boolean := false;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = invoice_id_input FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invoice not found');
  END IF;
  IF inv.status = 'paid' THEN
    RETURN jsonb_build_object('success', false,
      'message', 'A fully paid invoice cannot be deleted. Issue a credit note instead.');
  END IF;
  IF inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invoice is already cancelled');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payments WHERE invoice_id = invoice_id_input
  ) INTO has_payments;

  -- Release / restore any held stock first
  IF inv.stock_status = 'reserved' THEN
    stock_result := public.release_invoice_stock(invoice_id_input, user_id_input);
    IF (stock_result->>'success')::boolean = false THEN
      RETURN jsonb_build_object('success', false,
        'message', format('Cancel aborted: %s', stock_result->>'message'));
    END IF;
  ELSIF inv.stock_status = 'reduced' THEN
    stock_result := public.restore_invoice_stock(invoice_id_input, user_id_input);
    IF (stock_result->>'success')::boolean = false THEN
      RETURN jsonb_build_object('success', false,
        'message', format('Cancel aborted: %s', stock_result->>'message'));
    END IF;
  END IF;

  -- Backward cascade to upstream quotation
  IF inv.converted_from_quotation_id IS NOT NULL THEN
    SELECT id, status, quotation_number INTO q
    FROM public.quotations
    WHERE id = inv.converted_from_quotation_id
    FOR UPDATE;

    IF FOUND AND q.status = 'converted' THEN
      UPDATE public.quotations SET
        status      = 'rejected',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at  = now(),
        updated_by  = user_id_input
      WHERE id = q.id;
      cascaded := jsonb_build_object(
        'type',             'quotation',
        'id',               q.id,
        'quotation_number', q.quotation_number,
        'previous_status',  q.status,
        'new_status',       'rejected'
      );
    END IF;
  END IF;

  IF inv.status = 'draft' AND NOT has_payments AND allow_hard_delete THEN
    DELETE FROM public.invoices WHERE id = invoice_id_input;
    hard_deleted := true;
  ELSE
    UPDATE public.invoices SET
      status     = 'cancelled',
      updated_by = user_id_input,
      updated_at = now()
    WHERE id = invoice_id_input;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'hard_deleted', hard_deleted,
    'old_status',   inv.status,
    'cascaded',     cascaded
  );
END;
$$;
