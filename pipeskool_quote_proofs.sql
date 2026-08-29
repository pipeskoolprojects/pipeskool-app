-- =============================================================================
-- PIPESKOOL — update253: RATE PROOFS ON VENDOR QUOTES
--
-- WHY A SEPARATE TABLE, NOT A COLUMN ON indent_quotes
-- saveQuotes() DELETES every quote row for the indent and re-inserts them on each save:
--     delete from indent_quotes where indent_id = ...   then   insert ...
-- A proof column on that table would therefore be destroyed every time anyone edited a
-- rate. quote_proofs is keyed by (indent_item_id, vendor_name) instead, so it survives
-- re-saves untouched and one item can hold a different proof per vendor — which is what
-- makes the Compare-rates view able to show each vendor's own evidence.
--
-- HOW IT REACHES THE PURCHASE ORDER WITH NO CHANGE TO po_items
-- po_items already carries indent_item_id, and purchase_orders already carries vendor_name.
-- Joining those two against this table gives the proof behind the price on every PO line,
-- so nothing about PO creation or the PO print has to change structurally.
--
-- Files live in the existing attendance-photos bucket under quote-proofs/, the same bucket
-- and access model as expense bills.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create table if not exists quote_proofs (
  id              bigint generated always as identity primary key,
  indent_id       bigint not null references material_indents(id) on delete cascade,
  indent_item_id  bigint not null references material_indent_items(id) on delete cascade,
  vendor_name     text   not null,                       -- snapshot, matches indent_quotes
  path            text   not null,                       -- storage key in attendance-photos
  mime            text,
  note            text,
  uploaded_by     bigint references app_users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_quote_proofs_indent on quote_proofs(indent_id);
create index if not exists idx_quote_proofs_line   on quote_proofs(indent_item_id, vendor_name);

alter table quote_proofs enable row level security;

-- read: anyone who may see procurement at all
drop policy if exists qp_select on quote_proofs;
create policy qp_select on quote_proofs for select to authenticated
  using (fn_is_director() or fn_has_perm('indent','view') or fn_has_perm('indent','create')
         or fn_has_perm('indent','manage') or fn_has_perm('indent','approve'));

-- write: whoever may enter rates in the first place
drop policy if exists qp_insert on quote_proofs;
create policy qp_insert on quote_proofs for insert to authenticated
  with check (fn_is_director() or fn_has_perm('indent','create') or fn_has_perm('indent','manage'));

drop policy if exists qp_delete on quote_proofs;
create policy qp_delete on quote_proofs for delete to authenticated
  using (fn_is_director() or fn_has_perm('indent','create') or fn_has_perm('indent','manage'));

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables
    where table_name = 'quote_proofs')                                        as table_created,     -- expect 1
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'quote_proofs')               as policies,          -- expect 3
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'quote_proofs' and c.relrowsecurity)
                                                                              as rls_on,            -- expect 1
  (select count(*) from quote_proofs)                                         as proofs_on_file,    -- expect 0 on first run
  (select count(*) from indent_quotes)                                        as quotes_untouched,  -- unchanged by this file
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                              as unlocked_tables_left; -- expect 0
