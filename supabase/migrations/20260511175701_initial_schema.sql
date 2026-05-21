create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password text not null,
  created_at timestamptz default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  price numeric not null,
  stock integer default 0,
  created_at timestamptz default now()
);

create table public.orders (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  total numeric not null,
  status text default 'pending',
  created_at timestamptz default now()
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete cascade,
  quantity integer not null,
  price numeric not null
);
