-- Stamp: loyalty stamp cards shared between signed-in users.
--
-- Every card has members, and only members can see it. The app can only read
-- tables; every change goes through the functions below, which check who is
-- asking, lock the card row first (so two people tapping at once are applied
-- one after the other), and enforce the stack rules:
--   * only the newest pass in a stack takes stamps;
--   * a new pass starts only once the newest one is full;
--   * a pass is redeemed at most once, and only when full.
-- Each pass keeps its own stamp count, copied from the card when it starts,
-- so changing a card's count reshapes only the pass in progress.
--
-- Helpers live in the `private` schema, which the API does not expose.

create schema private;

-- Tables ---------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null
    check (char_length(title) between 1 and 40 and title = trim(title)),
  -- The count new passes start with.
  max_stamps int not null check (max_stamps between 1 and 50),
  icon text not null check (char_length(icon) between 1 and 64),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  reward_text text not null default '' check (char_length(reward_text) <= 60),
  -- Object path in the card-photos bucket, or '' for none.
  photo_path text not null default '' check (char_length(photo_path) <= 200),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'member');

create table public.card_members (
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index card_members_user_idx on public.card_members (user_id);

create table public.passes (
  card_id uuid not null references public.cards (id) on delete cascade,
  instance int not null check (instance >= 0),
  max_stamps int not null check (max_stamps between 1 and 50),
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  primary key (card_id, instance)
);

create table public.stamps (
  card_id uuid not null,
  instance int not null,
  slot int not null check (slot between 0 and 49),
  stamped_by uuid references public.profiles (id) on delete set null,
  stamped_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 120),
  primary key (card_id, instance, slot),
  foreign key (card_id, instance) references public.passes on delete cascade
);

create table public.redemptions (
  card_id uuid not null,
  instance int not null,
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (card_id, instance),
  foreign key (card_id, instance) references public.passes on delete cascade
);

-- A shareable link: whoever opens it while it is valid joins the card.
create table public.card_invites (
  -- Two v4 UUIDs: 244 random bits, as 64 hex characters.
  token text primary key default
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  card_id uuid not null references public.cards (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

-- Profiles for new accounts -------------------------------------------

-- Names a new account after its Google profile, falling back to the email.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'someone'
    ), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Access helpers --------------------------------------------------------

create function private.is_member(p_card uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.card_members
    where card_id = p_card and user_id = auth.uid()
  );
$$;

create function private.is_owner(p_card uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.card_members
    where card_id = p_card and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Whether the caller may see `p_user`'s profile: themselves, or anyone they
-- share a card with.
create function private.shares_card(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = auth.uid() or exists (
    select 1
    from public.card_members mine
    join public.card_members theirs on theirs.card_id = mine.card_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- Locks a card the caller belongs to and returns it. A card the caller is
-- not on reads as missing, so its existence is never revealed.
create function private.lock_card(p_card uuid)
returns public.cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.cards;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select * into card from public.cards where id = p_card for update;
  if not found or not private.is_member(p_card) then
    raise exception 'That card no longer exists.';
  end if;
  return card;
end;
$$;

-- The newest pass of a card, which the caller must have locked.
create function private.newest_pass(p_card uuid)
returns public.passes
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.passes
  where card_id = p_card
  order by instance desc
  limit 1;
$$;

-- Returns pass `p_instance` if it may change stamps: newest and unclaimed.
create function private.open_pass(p_card uuid, p_instance int)
returns public.passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  pass public.passes := private.newest_pass(p_card);
begin
  if pass.instance is distinct from p_instance then
    raise exception 'Only the newest card in a stack takes stamps.';
  end if;
  if exists (
    select 1 from public.redemptions
    where card_id = p_card and instance = p_instance
  ) then
    raise exception 'This card was already redeemed.';
  end if;
  return pass;
end;
$$;

create function private.filled(p_card uuid, p_instance int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.stamps
  where card_id = p_card and instance = p_instance;
$$;

-- Actions -----------------------------------------------------------------

create function public.create_card(
  p_id uuid,
  p_title text,
  p_max_stamps int,
  p_icon text,
  p_color text,
  p_reward_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  -- A retried request: the card is already there.
  if exists (select 1 from public.cards where id = p_id) then
    return;
  end if;
  insert into public.cards
    (id, owner_id, title, max_stamps, icon, color, reward_text)
  values
    (p_id, auth.uid(), trim(p_title), p_max_stamps, p_icon, p_color,
     p_reward_text);
  insert into public.card_members (card_id, user_id, role)
  values (p_id, auth.uid(), 'owner');
  insert into public.passes (card_id, instance, max_stamps, started_by)
  values (p_id, 0, p_max_stamps, auth.uid());
end;
$$;

-- Changes a card's look and stamp count. A new count also applies to the
-- pass in progress, as long as no used stamp falls outside it; finished
-- passes keep the count they were filled at.
create function public.update_card(
  p_id uuid,
  p_title text,
  p_max_stamps int,
  p_icon text,
  p_color text,
  p_reward_text text,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.cards := private.lock_card(p_id);
  pass public.passes;
  highest int;
begin
  if not private.is_owner(p_id) then
    raise exception 'Only the card''s owner can change it.';
  end if;
  if p_max_stamps <> card.max_stamps then
    pass := private.newest_pass(p_id);
    if private.filled(p_id, pass.instance) < pass.max_stamps
      and not exists (
        select 1 from public.redemptions
        where card_id = p_id and instance = pass.instance
      )
    then
      select max(slot) into highest from public.stamps
      where card_id = p_id and instance = pass.instance;
      if p_max_stamps <= coalesce(highest, -1) then
        raise exception 'Stamp % is already used. Pick at least %.',
          highest + 1, highest + 1;
      end if;
      update public.passes set max_stamps = p_max_stamps
      where card_id = p_id and instance = pass.instance;
    end if;
  end if;
  update public.cards set
    title = trim(p_title),
    max_stamps = p_max_stamps,
    icon = p_icon,
    color = p_color,
    reward_text = p_reward_text,
    photo_path = p_photo_path
  where id = p_id;
end;
$$;

create function public.stamp(p_card uuid, p_instance int, p_slot int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pass public.passes;
begin
  perform private.lock_card(p_card);
  pass := private.open_pass(p_card, p_instance);
  if p_slot < 0 or p_slot >= pass.max_stamps then
    raise exception 'That stamp slot does not exist.';
  end if;
  insert into public.stamps (card_id, instance, slot, stamped_by)
  values (p_card, p_instance, p_slot, auth.uid())
  on conflict do nothing;
end;
$$;

create function public.unstamp(p_card uuid, p_instance int, p_slot int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_card(p_card);
  perform private.open_pass(p_card, p_instance);
  delete from public.stamps
  where card_id = p_card and instance = p_instance and slot = p_slot;
end;
$$;

create function public.save_note(
  p_card uuid,
  p_instance int,
  p_slot int,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_card(p_card);
  update public.stamps set note = p_note
  where card_id = p_card and instance = p_instance and slot = p_slot;
  if not found then
    raise exception 'That stamp was removed.';
  end if;
end;
$$;

create function public.redeem(p_card uuid, p_instance int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pass public.passes;
begin
  perform private.lock_card(p_card);
  select * into pass from public.passes
  where card_id = p_card and instance = p_instance;
  if not found or private.filled(p_card, p_instance) < pass.max_stamps then
    raise exception 'This card is not full yet.';
  end if;
  insert into public.redemptions (card_id, instance, redeemed_by)
  values (p_card, p_instance, auth.uid())
  on conflict do nothing;
end;
$$;

create function public.unredeem(p_card uuid, p_instance int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_card(p_card);
  delete from public.redemptions
  where card_id = p_card and instance = p_instance;
end;
$$;

-- Starts pass `p_instance`, which must follow a full newest pass. Asking for
-- a pass that already exists (someone else started it) is not an error.
create function public.start_next_pass(p_card uuid, p_instance int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.cards := private.lock_card(p_card);
  newest public.passes := private.newest_pass(p_card);
begin
  if p_instance <= newest.instance then
    return;
  end if;
  if p_instance <> newest.instance + 1 then
    raise exception 'Cards in a stack must be started in order.';
  end if;
  if private.filled(p_card, newest.instance) < newest.max_stamps then
    raise exception 'Finish the current card before starting a new one.';
  end if;
  insert into public.passes (card_id, instance, max_stamps, started_by)
  values (p_card, p_instance, card.max_stamps, auth.uid());
end;
$$;

-- Joins the card behind a valid invite and returns its id.
create function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.card_invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select * into invite from public.card_invites
  where token = p_token and expires_at > now();
  if not found then
    raise exception 'This invite link has expired or was revoked.';
  end if;
  insert into public.card_members (card_id, user_id, role)
  values (invite.card_id, auth.uid(), 'member')
  on conflict do nothing;
  return invite.card_id;
end;
$$;

-- Deletes a card with all its history; returns its photo path so the client
-- can remove the file from storage.
create function public.delete_card(p_card uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.cards := private.lock_card(p_card);
begin
  if not private.is_owner(p_card) then
    raise exception 'Only the card''s owner can delete it.';
  end if;
  delete from public.cards where id = p_card;
  return card.photo_path;
end;
$$;

-- Makes a new invite link for a card and returns its token.
create function public.create_invite(p_card uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token text;
begin
  perform private.lock_card(p_card);
  if not private.is_owner(p_card) then
    raise exception 'Only the card''s owner can share it.';
  end if;
  insert into public.card_invites (card_id, created_by)
  values (p_card, auth.uid())
  returning token into new_token;
  return new_token;
end;
$$;

-- Stops every invite link for a card from working.
create function public.revoke_invites(p_card uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_card(p_card);
  if not private.is_owner(p_card) then
    raise exception 'Only the card''s owner can share it.';
  end if;
  delete from public.card_invites where card_id = p_card;
end;
$$;

-- Removes a member: yourself (leaving), or anyone if you own the card. The
-- owner cannot be removed; they delete the card instead.
create function public.remove_member(p_card uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_card(p_card);
  if p_user <> auth.uid() and not private.is_owner(p_card) then
    raise exception 'Only the card''s owner can remove people.';
  end if;
  if exists (
    select 1 from public.card_members
    where card_id = p_card and user_id = p_user and role = 'owner'
  ) then
    raise exception 'The owner can''t leave their card. Delete it instead.';
  end if;
  delete from public.card_members
  where card_id = p_card and user_id = p_user;
end;
$$;

create function public.rename(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  update public.profiles set display_name = trim(p_name)
  where id = auth.uid();
end;
$$;

-- Everything the caller can see, in one round trip. Runs as the caller, so
-- row-level security decides what is included.
create function public.get_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'me', auth.uid(),
    'cards', coalesce(
      (select jsonb_agg(c order by c.created_at) from public.cards c), '[]'),
    'members', coalesce(
      (select jsonb_agg(m) from public.card_members m), '[]'),
    'passes', coalesce(
      (select jsonb_agg(p) from public.passes p), '[]'),
    'stamps', coalesce(
      (select jsonb_agg(s) from public.stamps s), '[]'),
    'redemptions', coalesce(
      (select jsonb_agg(r) from public.redemptions r), '[]'),
    'profiles', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'display_name', pr.display_name))
       from public.profiles pr), '[]')
  );
$$;

-- Row-level security --------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.card_members enable row level security;
alter table public.passes enable row level security;
alter table public.stamps enable row level security;
alter table public.redemptions enable row level security;
alter table public.card_invites enable row level security;

-- Reads only: every write goes through the functions above. Invites have no
-- policy at all; they are reached only through create_invite/accept_invite.

create policy "see people you share a card with" on public.profiles
  for select to authenticated using (private.shares_card(id));
create policy "members see the card" on public.cards
  for select to authenticated using (private.is_member(id));
create policy "members see each other" on public.card_members
  for select to authenticated using (private.is_member(card_id));
create policy "members see passes" on public.passes
  for select to authenticated using (private.is_member(card_id));
create policy "members see stamps" on public.stamps
  for select to authenticated using (private.is_member(card_id));
create policy "members see redemptions" on public.redemptions
  for select to authenticated using (private.is_member(card_id));

-- Privileges ------------------------------------------------------------------

-- Supabase grants broad table and function access by default; start from
-- nothing and allow only what the app uses.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.shares_card(uuid)
to authenticated;

grant select on
  public.profiles,
  public.cards,
  public.card_members,
  public.passes,
  public.stamps,
  public.redemptions
to authenticated;

grant execute on function
  public.create_card(uuid, text, int, text, text, text),
  public.update_card(uuid, text, int, text, text, text, text),
  public.delete_card(uuid),
  public.stamp(uuid, int, int),
  public.unstamp(uuid, int, int),
  public.save_note(uuid, int, int, text),
  public.redeem(uuid, int),
  public.unredeem(uuid, int),
  public.start_next_pass(uuid, int),
  public.create_invite(uuid),
  public.revoke_invites(uuid),
  public.accept_invite(text),
  public.remove_member(uuid, uuid),
  public.rename(text),
  public.get_state()
to authenticated;

-- Live updates: stream changes to these tables (filtered by the policies
-- above). Skipped where Supabase Realtime is not installed, as in tests.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  then
    alter publication supabase_realtime add table
      public.profiles,
      public.cards,
      public.card_members,
      public.passes,
      public.stamps,
      public.redemptions;
  end if;
end;
$$;
