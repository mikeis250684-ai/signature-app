-- הרץ את זה ב-Supabase SQL Editor

create table documents (
  id uuid primary key,
  name text not null,
  pdf_path text not null,
  signed_pdf_path text,
  status text default 'draft', -- draft | in_progress | completed
  created_at timestamptz default now()
);

create table signers (
  id uuid primary key,
  document_id uuid references documents(id) on delete cascade,
  signer_order int not null,
  name text not null,
  email text,
  phone text,
  token uuid not null unique,
  signed_at timestamptz
);

create table signature_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  signer_order int not null,
  page int not null,
  x float not null,
  y float not null,
  width float not null,
  height float not null
);

create table signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  signer_id uuid references signers(id) on delete cascade,
  field_id uuid references signature_fields(id) on delete cascade,
  image_data text not null,
  created_at timestamptz default now()
);

-- Storage bucket (הרץ ב-Supabase Dashboard > Storage)
-- צור bucket בשם "pdfs" עם הגדרה: private
