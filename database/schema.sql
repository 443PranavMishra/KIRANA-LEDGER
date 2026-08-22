-- Khata schema - multi-tenant (shopkeeper login + data isolation)

create extension if not exists vector;
create extension if not exists pgcrypto;  -- for gen_random_uuid()

-- ============================================================
-- 1. SHOPKEEPERS — one row per shop owner
-- ============================================================
create table if not exists shopkeepers (
    id uuid primary key default gen_random_uuid(),

    name text not null,
    phone text not null,
    shop_name text not null,
    shop_address text,

    password_hash text not null,     -- hashed, never stored in plain text
    unique_id text not null,         -- recovery key, shown once at registration

    default_credit_limit numeric(10,2) not null default 0,
    upi_id text not null,

    photo_url text not null,
    embedding vector(512) not null,  -- for scan-to-login

    registered_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table shopkeepers add column if not exists upi_id text;
alter table shopkeepers add column if not exists default_credit_limit numeric(10,2) not null default 0;

-- phone number) only now. Drops the columns and their old unique index
-- for installs that had already run an earlier version of this schema.
drop index if exists shopkeepers_bank_account_ci_unique;
alter table shopkeepers drop column if exists bank_account_number;
alter table shopkeepers drop column if exists bank_ifsc;
alter table shopkeepers drop column if exists bank_name;
alter table shopkeepers drop column if exists bank_branch;
alter table shopkeepers drop column if exists qr_code_url;


drop index if exists shopkeepers_upi_id_ci_unique;
create unique index shopkeepers_upi_id_ci_unique on shopkeepers (lower(upi_id));

-- Phone and unique_id must each be unique across ALL shopkeepers
alter table shopkeepers drop constraint if exists shopkeepers_phone_length;
alter table shopkeepers add constraint shopkeepers_phone_length
    check (phone ~ '^[0-9]{10}$');

alter table shopkeepers drop constraint if exists shopkeepers_phone_unique;
alter table shopkeepers add constraint shopkeepers_phone_unique unique (phone);

alter table shopkeepers drop constraint if exists shopkeepers_unique_id_unique;
alter table shopkeepers add constraint shopkeepers_unique_id_unique unique (unique_id);

create index if not exists shopkeepers_embedding_idx
    on shopkeepers using ivfflat (embedding vector_cosine_ops)
    with (lists = 10);

-- Face-match function for shopkeeper login
drop function if exists match_shopkeeper(vector);
create or replace function match_shopkeeper(query_embedding vector(512))
returns table (
    id uuid,
    name text,
    shop_name text,
    similarity float
)
language sql stable
as $$
    select id, name, shop_name,
           1 - (embedding <=> query_embedding) as similarity
    from shopkeepers
    order by embedding <=> query_embedding
    limit 1;
$$;

-- ============================================================
-- 2. CUSTOMERS — now scoped to a shopkeeper
-- ============================================================
create table if not exists customers (
    id uuid primary key default gen_random_uuid(),
    shopkeeper_id uuid references shopkeepers(id) on delete cascade,

    name text not null,
    mobile text,
    address text,
    photo_url text not null,
    embedding vector(512) not null,

    due_amount numeric(10,2) not null default 0,
    credit_limit numeric(10,2) default 0,

    total_purchases numeric(10,2) not null default 0,
    last_purchase_amount numeric(10,2),
    last_purchase_at timestamptz,

    last_payment_amount numeric(10,2),
    last_payment_at timestamptz,

    status text not null default 'Clear',

    registered_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table customers add column if not exists shopkeeper_id uuid references shopkeepers(id) on delete cascade;
alter table customers add column if not exists address text;
alter table customers add column if not exists mobile text;

alter table customers drop constraint if exists customers_mobile_length;
alter table customers add constraint customers_mobile_length
    check (mobile is null or (mobile ~ '^[0-9]*$' and length(mobile) <= 10));

-- A phone number now only needs to be unique WITHIN one shop, not globally
-- — two different shops can each have a customer with the same number.
alter table customers drop constraint if exists customers_mobile_unique;
alter table customers drop constraint if exists customers_shop_mobile_unique;
alter table customers add constraint customers_shop_mobile_unique
    unique (shopkeeper_id, mobile);

create index if not exists customers_embedding_idx
    on customers using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);
create index if not exists customers_shopkeeper_idx on customers (shopkeeper_id);

-- ============================================================
-- 3. TRANSACTIONS — unchanged in shape, still cascades from customers
-- ============================================================
create table if not exists transactions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete cascade,
    type text not null check (type in ('purchase', 'payment')),
    amount numeric(10,2) not null,
    note text,
    created_at timestamptz default now()
);

alter table transactions add column if not exists products text[] default '{}';

alter table transactions add column if not exists screenshot_url text;
alter table transactions add column if not exists is_online_payment boolean not null default false;

create index if not exists transactions_customer_idx
    on transactions (customer_id, created_at desc);

-- ============================================================
-- 4. Face-match for customers — now scoped to one shop's customers only
-- ============================================================
drop function if exists match_customer(vector);
drop function if exists match_customer(vector, uuid);

create or replace function match_customer(query_embedding vector(512), shop_id uuid)
returns table (
    id uuid,
    name text,
    mobile text,
    address text,
    photo_url text,
    due_amount numeric,
    credit_limit numeric,
    total_purchases numeric,
    last_purchase_amount numeric,
    last_purchase_at timestamptz,
    last_payment_amount numeric,
    last_payment_at timestamptz,
    status text,
    similarity float
)
language sql stable
as $$
    select
        id, name, mobile, address, photo_url,
        due_amount, credit_limit, total_purchases,
        last_purchase_amount, last_purchase_at,
        last_payment_amount, last_payment_at,
        status,
        1 - (embedding <=> query_embedding) as similarity
    from customers
    where shopkeeper_id = shop_id
    order by embedding <=> query_embedding
    limit 1;
$$;

-- ============================================================
-- 5. PRODUCTS — each shop's own catalog. Prices here are the single
-- source of truth: the purchase flow looks prices up from this table
-- rather than trusting whatever a client sends, so every customer at a
-- given shop pays the same price for the same product.
-- ============================================================
create table if not exists products (
    id uuid primary key default gen_random_uuid(),
    shopkeeper_id uuid references shopkeepers(id) on delete cascade,
    name text not null,
    price numeric(10,2) not null,
    in_stock boolean not null default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Case-insensitive uniqueness per shop — "Rice" and "rice" can't both exist
drop index if exists products_shop_name_ci_unique;
create unique index products_shop_name_ci_unique on products (shopkeeper_id, lower(name));

create index if not exists products_shopkeeper_idx on products (shopkeeper_id);

-- ============================================================
-- 6. CREDIT REQUESTS — a customer, via the customer portal, can request
-- to add products to their credit at a specific shop. Nothing changes on
-- the customer's account until the shopkeeper confirms.
-- ============================================================
create table if not exists credit_requests (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete cascade,
    shopkeeper_id uuid references shopkeepers(id) on delete cascade,
    items jsonb not null,        -- [{product_id, name, price, quantity}], priced at request time
    amount numeric(10,2) not null,
    status text not null default 'pending',  -- 'pending' | 'confirmed'
    created_at timestamptz default now()
);

alter table credit_requests add column if not exists status text not null default 'pending';

create index if not exists credit_requests_shopkeeper_idx on credit_requests (shopkeeper_id, created_at desc);
create index if not exists credit_requests_customer_idx on credit_requests (customer_id);

-- ============================================================
-- 6b.
-- One active code per phone number (a new send/resend overwrites the
-- old one, matching the "update otp in database" requirement). Rows are
-- deleted on successful verification or when they expire.
-- ============================================================
create table if not exists phone_otps (
    phone text primary key,
    otp_code text not null,
    expires_at timestamptz not null,
    created_at timestamptz default now()
);

create table if not exists verified_phones (
    phone text primary key,
    verified_at timestamptz default now()
);

-- ============================================================
-- 6c. PAYMENT REQUESTS — a customer claims to have paid a shop via
-- bank transfer or UPI
-- ============================================================
create table if not exists payment_requests (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete cascade,
    shopkeeper_id uuid references shopkeepers(id) on delete cascade,
    amount numeric(10,2) not null,
    method text not null,       -- 'upi' (only method now)
    screenshot_url text not null,  -- proof of payment, required, shown to the shop owner before they confirm
    status text not null default 'pending',  -- 'pending' | 'confirmed' | 'rejected'
    created_at timestamptz default now()
);

alter table payment_requests add column if not exists screenshot_url text;

create index if not exists payment_requests_shopkeeper_idx on payment_requests (shopkeeper_id, created_at desc);
create index if not exists payment_requests_customer_idx on payment_requests (customer_id);

-- ============================================================
-- 6d. BANK-DETAILS EDIT AUTHORIZATION
-- ============================================================
create table if not exists bank_edit_authorizations (
    shopkeeper_id uuid primary key references shopkeepers(id) on delete cascade,
    authorized_at timestamptz default now()
);

-- ============================================================
-- 6e. COMPLAINTS — customer feedback/opinions about a shop
-- ============================================================
create table if not exists complaints (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete set null,
    shopkeeper_id uuid references shopkeepers(id) on delete cascade,
    customer_name text not null,  -- snapshotted at submission time, survives if the customer record is ever gone
    category text not null default 'other',  -- 'shop' | 'product' | 'staff' | 'other'
    message text not null,
    created_at timestamptz default now()
);

create index if not exists complaints_shopkeeper_idx on complaints (shopkeeper_id, created_at desc);

-- ============================================================
-- 6f. CONTACT SUBMISSIONS — "Contact Us" form
-- ============================================================
create table if not exists contact_submissions (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null,      
    role text not null,        
    category text not null,   
    description text not null,
    email_sent boolean not null default false,  
    created_at timestamptz default now()
);

alter table contact_submissions add column if not exists email text;
alter table contact_submissions alter column email drop not null;

create index if not exists contact_submissions_created_idx on contact_submissions (created_at desc);

-- ============================================================
-- 7. Customer portal — cross-shop lookup
-- ============================================================
drop function if exists match_customer_global(vector);
create or replace function match_customer_global(query_embedding vector(512))
returns table (
    customer_id uuid,
    shopkeeper_id uuid,
    shop_name text,
    customer_name text,
    mobile text,
    due_amount numeric,
    total_purchases numeric,
    last_purchase_amount numeric,
    last_purchase_at timestamptz,
    last_payment_amount numeric,
    last_payment_at timestamptz,
    similarity float
)
language sql stable
as $$
    select
        c.id, c.shopkeeper_id, s.shop_name, c.name, c.mobile,
        c.due_amount, c.total_purchases,
        c.last_purchase_amount, c.last_purchase_at,
        c.last_payment_amount, c.last_payment_at,
        1 - (c.embedding <=> query_embedding) as similarity
    from customers c
    join shopkeepers s on s.id = c.shopkeeper_id
    order by c.embedding <=> query_embedding
    limit 50;
$$;

-- ============================================================
-- 8. Storage buckets — create both in Supabase dashboard (Storage > New
--    bucket, public ON) if not already present:
--      customer-photos
--      shopkeeper-photos    (new — for the shop owner's own login photo)
-- ============================================================
