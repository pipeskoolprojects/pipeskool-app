-- =============================================================================
-- PIPESKOOL — update254: RATE-COMPARISON PROOF (one per quotation, not per item)
--
-- SAFE TO RUN WHETHER OR NOT YOU ALREADY RAN THE update253 VERSION OF THIS FILE.
-- It creates the table if missing, and if the 253 table already exists it simply relaxes
-- the two columns that used to be mandatory. Nothing is dropped and no row is deleted.
--
-- WHAT CHANGED FROM 253
-- 253 attached a proof to every (item, vendor) rate cell. 254 attaches ONE proof set to the
-- whole quotation instead, so indent_item_id and vendor_name become NULLABLE:
--     both NULL            -> a rate-comparison proof for the whole indent  (what we use now)
--     both set             -> a per-line proof (253 rows keep working, nothing is lost)
--
-- WHY A SEPARATE TABLE AT ALL
-- saveQuotes() deletes every indent_quotes row for the indent and re-inserts them on each
-- save, so a proof column on that table would be destroyed the moment anyone edited a rate.
--
-- Files live in the existing attendance-photos bucket under quote-proofs/.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create table if not exists quote_proofs (
  id              bigint generated always as identity primary key,
  indent_id       bigint not null references material_indents(id) on delete cascade,
  indent_item_id  bigint references material_indent_items(id) on delete cascade,   -- null = whole quotation
  vendor_name     text,                                                            -- null = whole quotation
  path            text   not null,
  mime            text,
  note            text,
  uploaded_by     bigint references app_users(id),
  created_at      timestamptz not null default now()
);

-- if the 253 table is already in place, relax the two columns (no-op otherwise)
alter table quote_proofs alter column indent_item_id drop not null;
alter table quote_proofs alter column vendor_name    drop not null;

create index if not exists idx_quote_proofs_indent on quote_proofs(indent_id);
create index if not exists idx_quote_proofs_line   on quote_proofs(indent_item_id, vendor_name);

alter table quote_proofs enable row level security;

drop policy if exists qp_select on quote_proofs;
create policy qp_select on quote_proofs for select to authenticated
  using (fn_is_director() or fn_has_perm('indent','view') or fn_has_perm('indent','create')
         or fn_has_perm('indent','manage') or fn_has_perm('indent','approve'));

drop policy if exists qp_insert on quote_proofs;
create policy qp_insert on quote_proofs for insert to authenticated
  with check (fn_is_director() or fn_has_perm('indent','create') or fn_has_perm('indent','manage'));

drop policy if exists qp_delete on quote_proofs;
create policy qp_delete on quote_proofs for delete to authenticated
  using (fn_is_director() or fn_has_perm('indent','create') or fn_has_perm('indent','manage'));

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables where table_name = 'quote_proofs')   as table_ready,      -- expect 1
  (select count(*) from information_schema.columns
     where table_name = 'quote_proofs' and column_name in ('indent_item_id','vendor_name')
       and is_nullable = 'YES')                                                        as nullable_cols,    -- expect 2
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'quote_proofs')                       as policies,         -- expect 3
  (select count(*) from quote_proofs where indent_item_id is null)                     as quotation_proofs, -- 0 on first run
  (select count(*) from quote_proofs where indent_item_id is not null)                 as legacy_line_proofs, -- 253 rows, if any
  (select count(*) from indent_quotes)                                                 as quotes_untouched, -- unchanged
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                       as unlocked_tables_left; -- expect 0
