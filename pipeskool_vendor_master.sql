-- ============================================================
-- PIPESKOOL — Vendor Master fields (v9.2)
-- Run in Supabase SQL Editor.
-- ============================================================

alter table vendors add column if not exists email text;
alter table vendors add column if not exists address text;
alter table vendors add column if not exists payment_terms text;
alter table vendors add column if not exists categories text;   -- comma-separated tags
alter table vendors add column if not exists contact text;
alter table vendors add column if not exists phone text;
alter table vendors add column if not exists gstin text;
alter table vendors add column if not exists is_active boolean not null default true;

-- ============================================================
-- Done. Vendor master ready for full PO detail.
-- ============================================================
