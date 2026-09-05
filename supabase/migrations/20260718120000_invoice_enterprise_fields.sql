-- Migration: Add missing enterprise invoice columns and update atomic invoice RPC routines
-- Establishes layout options, shipping addresses, currency, and tagging support.

-- 1. Alter public.invoices with new column fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS shipping_address   text,
  ADD COLUMN IF NOT EXISTS currency           text default 'INR',
  ADD COLUMN IF NOT EXISTS sales_person        text,
  ADD COLUMN IF NOT EXISTS internal_notes      text,
  ADD COLUMN IF NOT EXISTS shipping_charges   numeric default 0,
  ADD COLUMN IF NOT EXISTS additional_charges numeric default 0,
  ADD COLUMN IF NOT EXISTS attachments        jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags               jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields      jsonb default '{}'::jsonb;

-- 2. Update create_invoice_with_items RPC
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
    created_by,
    shipping_address, currency, sales_person, internal_notes,
    shipping_charges, additional_charges, attachments, tags, custom_fields
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
    NULLIF(invoice_input->>'created_by', '')::uuid,
    invoice_input->>'shipping_address',
    COALESCE(invoice_input->>'currency', 'INR'),
    invoice_input->>'sales_person',
    invoice_input->>'internal_notes',
    COALESCE((invoice_input->>'shipping_charges')::numeric, 0),
    COALESCE((invoice_input->>'additional_charges')::numeric, 0),
    COALESCE(invoice_input->'attachments', '[]'::jsonb),
    COALESCE(invoice_input->'tags', '[]'::jsonb),
    COALESCE(invoice_input->'custom_fields', '{}'::jsonb)
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

-- 3. Update update_invoice_with_items RPC
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
    updated_at          = now(),
    shipping_address    = COALESCE(invoice_input->>'shipping_address', shipping_address),
    currency            = COALESCE(invoice_input->>'currency', currency),
    sales_person        = COALESCE(invoice_input->>'sales_person', sales_person),
    internal_notes      = COALESCE(invoice_input->>'internal_notes', internal_notes),
    shipping_charges    = COALESCE((invoice_input->>'shipping_charges')::numeric, shipping_charges),
    additional_charges  = COALESCE((invoice_input->>'additional_charges')::numeric, additional_charges),
    attachments         = COALESCE(invoice_input->'attachments', attachments),
    tags                = COALESCE(invoice_input->'tags', tags),
    custom_fields       = COALESCE(invoice_input->'custom_fields', custom_fields)
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
