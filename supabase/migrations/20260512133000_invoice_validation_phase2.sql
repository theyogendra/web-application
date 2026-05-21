-- Add validation fields to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS validation_status text default 'pending',
ADD COLUMN IF NOT EXISTS validation_errors jsonb default '[]'::jsonb,
ADD COLUMN IF NOT EXISTS validation_warnings jsonb default '[]'::jsonb,
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS validated_at timestamptz,
ADD COLUMN IF NOT EXISTS updated_by uuid references public.users(id);

-- Add validation fields to invoice_items
ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS expected_unit_price numeric default 0,
ADD COLUMN IF NOT EXISTS price_variance numeric default 0,
ADD COLUMN IF NOT EXISTS line_subtotal numeric default 0,
ADD COLUMN IF NOT EXISTS line_total numeric default 0,
ADD COLUMN IF NOT EXISTS validation_errors jsonb default '[]'::jsonb;

-- Create validation logs table
CREATE TABLE IF NOT EXISTS public.invoice_validation_logs (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references public.invoices(id) on delete cascade,
    validation_type text not null,
    status text not null,
    message text,
    details jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    created_at timestamptz default now()
);
