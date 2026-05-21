create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  billing_address text,
  gst_number text,
  created_at timestamptz default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  billing_address text,
  gst_number text,
  created_at timestamptz default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  customer_id uuid references public.customers(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  status text not null default 'draft',
  subtotal numeric default 0,
  discount numeric default 0,
  tax_amount numeric default 0,
  grand_total numeric default 0,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  discount numeric default 0,
  tax_rate numeric default 0,
  tax_amount numeric default 0,
  total numeric not null default 0,
  created_at timestamptz default now()
);
