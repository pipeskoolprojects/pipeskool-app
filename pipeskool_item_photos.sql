-- Material master photos (update 474)
-- Run in the Supabase SQL Editor before using photo uploads.
-- Existing item records remain unchanged; the field is optional.
alter table public.item_master
  add column if not exists photo_url text;

select count(*) as photo_url_installed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'item_master'
  and column_name = 'photo_url';
