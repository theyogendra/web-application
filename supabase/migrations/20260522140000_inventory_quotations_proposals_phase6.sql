-- Phase 6: Inventory enhancements, Quotations, Proposals
-- Builds the Proposal -> Quotation -> Invoice document chain on top of the
-- existing invoice/payment system.

-- ============================================================
-- INVENTORY (products) — SKU, unit, cost, category, reorder
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku            text,
  ADD COLUMN IF NOT EXISTS unit           text     DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS cost           numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate       numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category       text,
  ADD COLUMN IF NOT EXISTS reorder_level  integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active      boolean  DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku       ON public.products(sku) WHERE sku IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_products_category  ON public.products(category);
CREATE INDEX        IF NOT EXISTS idx_products_is_active ON public.products(is_active);

-- ============================================================
-- NUMBER SEQUENCES + GENERATORS  (QUO-0001, PRO-0001)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.proposal_number_seq  START 1;

CREATE OR REPLACE FUNCTION public.next_quotation_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'QUO-' || lpad(nextval('public.quotation_number_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_proposal_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'PRO-' || lpad(nextval('public.proposal_number_seq')::text, 4, '0');
$$;

-- ============================================================
-- PROPOSALS (created first; no FK to quotations yet — added below)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proposals (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_number            text UNIQUE,
  customer_id                uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name              text,
  customer_email             text,
  customer_phone             text,
  billing_address            text,
  proposal_date              date DEFAULT current_date,
  valid_until                date,
  status                     text DEFAULT 'draft',
  subtotal                   numeric DEFAULT 0,
  discount                   numeric DEFAULT 0,
  tax_amount                 numeric DEFAULT 0,
  grand_total                numeric DEFAULT 0,
  notes                      text,
  terms                      text,
  scope                      text,                                  -- narrative section unique to proposals
  sent_at                    timestamptz,
  accepted_at                timestamptz,
  rejected_at                timestamptz,
  converted_at               timestamptz,
  converted_to_quotation_id  uuid,                                  -- FK added after quotations exists
  created_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_status        ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_customer_id   ON public.proposals(customer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_proposal_date ON public.proposals(proposal_date);

CREATE TABLE IF NOT EXISTS public.proposal_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  product_id        bigint REFERENCES public.products(id) ON DELETE SET NULL,
  description       text,
  quantity          numeric NOT NULL DEFAULT 1,
  unit_price        numeric NOT NULL DEFAULT 0,
  discount          numeric DEFAULT 0,
  discount_amount   numeric DEFAULT 0,
  tax_rate          numeric DEFAULT 0,
  tax_amount        numeric DEFAULT 0,
  line_subtotal     numeric DEFAULT 0,
  line_total        numeric DEFAULT 0,
  total             numeric DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal_id ON public.proposal_items(proposal_id);

-- ============================================================
-- QUOTATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quotations (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number              text UNIQUE,
  customer_id                   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name                 text,
  customer_email                text,
  customer_phone                text,
  billing_address               text,
  quotation_date                date DEFAULT current_date,
  valid_until                   date,
  status                        text DEFAULT 'draft',
  subtotal                      numeric DEFAULT 0,
  discount                      numeric DEFAULT 0,
  tax_amount                    numeric DEFAULT 0,
  grand_total                   numeric DEFAULT 0,
  notes                         text,
  terms                         text,
  sent_at                       timestamptz,
  accepted_at                   timestamptz,
  rejected_at                   timestamptz,
  converted_at                  timestamptz,
  converted_to_invoice_id       uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  converted_from_proposal_id    uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  created_by                    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by                    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotations_status         ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id    ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON public.quotations(quotation_date);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id      uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id        bigint REFERENCES public.products(id) ON DELETE SET NULL,
  description       text,
  quantity          numeric NOT NULL DEFAULT 1,
  unit_price        numeric NOT NULL DEFAULT 0,
  discount          numeric DEFAULT 0,
  discount_amount   numeric DEFAULT 0,
  tax_rate          numeric DEFAULT 0,
  tax_amount        numeric DEFAULT 0,
  line_subtotal     numeric DEFAULT 0,
  line_total        numeric DEFAULT 0,
  total             numeric DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);

-- ============================================================
-- Cross-link FKs (added after both tables exist)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_converted_to_quotation_fk'
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_converted_to_quotation_fk
      FOREIGN KEY (converted_to_quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Invoices already exist; just add the back-reference column.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS converted_from_quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL;
