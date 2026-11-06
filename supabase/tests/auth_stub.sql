-- The slice of Supabase that the schema migration relies on, for running it
-- in a bare Postgres: the auth.users table, auth.uid() (which reads the
-- caller from a session setting, as PostgREST does), and the API roles.

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create role anon nologin;
create role authenticated nologin;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
