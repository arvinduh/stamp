-- Card photos: a private bucket laid out as `<card id>/<file>`. Members of a
-- card can view its photos; only its owner can add or remove them.
--
-- Kept apart from the main schema because it depends on Supabase Storage,
-- which the database tests do not install.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-photos',
  'card-photos',
  false,
  2097152,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

-- The card an object belongs to, or null when its folder is not a card id.
create function private.photo_card(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on function private.photo_card(text) from public, anon;
grant execute on function private.photo_card(text) to authenticated;

create policy "members view card photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'card-photos' and private.is_member(private.photo_card(name))
  );

create policy "owners add card photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'card-photos' and private.is_owner(private.photo_card(name))
  );

create policy "owners remove card photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'card-photos' and private.is_owner(private.photo_card(name))
  );
