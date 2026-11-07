-- ============================================================
-- BYTEWERK STUDIO — Forum-Schema (optional, fuer echte Konten)
-- ------------------------------------------------------------
-- Im Supabase SQL-Editor ausfuehren, nachdem supabase/schema.sql
-- gelaufen ist (public.profiles muss existieren).
--
-- Das Forum laeuft ohne dieses Schema: forum.js speichert im
-- Browser (localStorage) und ist damit fuer Vorschau und eine
-- einzelne Person brauchbar. Dieses Schema ist der Weg zu
-- echten, geteilten Themen mit denselben Regeln.
--
-- Grundsaetze:
--   1. Lesen darf jede angemeldete Person, Schreiben nur mit
--      passendem Plan. Der Plan kommt aus public.profiles,
--      niemals aus dem Request.
--   2. Autor, Zeitpunkt und Loesungsstatus setzt die Datenbank,
--      nicht der Client (Trigger).
--   3. Laengen sind hart begrenzt, damit kein Beitrag die
--      Datenbank oder die Anzeige sprengt.
--   4. Kein Volltextindex ueber alles: Suche laeuft ueber
--      tsvector auf Titel und Text, nicht ueber ILIKE '%...%'.
-- ============================================================

-- ---------- 1. Kategorien ----------------------------------
-- profiles kennt in schema.sql noch keinen Plan. Das Forum
-- braucht ihn; die Spalte ist additiv und standardmaessig frei.
alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free','pro','mod'));

create table if not exists public.forum_categories (
  id          text primary key,
  label_de    text not null,
  label_en    text not null,
  pro_only    boolean not null default false,
  sort_order  smallint not null default 0
);

alter table public.forum_categories enable row level security;

drop policy if exists "forum_categories_read" on public.forum_categories;
create policy "forum_categories_read"
  on public.forum_categories for select
  to authenticated, anon
  using (true);

insert into public.forum_categories (id, label_de, label_en, pro_only, sort_order) values
  ('frontend', 'Frontend & UI',      'Frontend & UI',       false, 1),
  ('three',    'three.js & 3D',      'three.js & 3D',       false, 2),
  ('backend',  'Backend & APIs',     'Backend & APIs',      false, 3),
  ('tools',    'Werkzeuge & Ablauf', 'Tooling & workflow',  false, 4),
  ('studio',   'Studio & Auftraege', 'Studio & client work', true, 5),
  ('feedback', 'Produkt-Feedback',   'Product feedback',     true, 6)
on conflict (id) do nothing;

-- ---------- 2. Hilfsfunktionen ------------------------------
-- Der Plan einer Person. security definer, damit die Policy
-- nicht auf die eigene Sichtbarkeit von profiles angewiesen ist.
create or replace function public.forum_plan(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select plan from public.profiles where id = uid), 'free');
$$;

revoke all on function public.forum_plan(uuid) from public;
grant execute on function public.forum_plan(uuid) to authenticated;

create or replace function public.forum_is_pro_category(cat text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select pro_only from public.forum_categories where id = cat), false);
$$;

revoke all on function public.forum_is_pro_category(text) from public;
grant execute on function public.forum_is_pro_category(text) to authenticated;

-- ---------- 3. Themen --------------------------------------
create table if not exists public.forum_threads (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  category     text not null references public.forum_categories (id),
  kind         text not null default 'question' check (kind in ('question','discussion','bug')),
  title        text not null check (char_length(title) between 8 and 110),
  body         text not null check (char_length(body) between 20 and 8000),
  tags         text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 3),
  author_id    uuid not null references auth.users (id) on delete cascade,
  author_name  text not null,
  solved       boolean not null default false,
  solved_post  uuid,
  pinned       boolean not null default false,
  views        integer not null default 0 check (views >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 to_tsvector('simple', title || ' ' || body || ' ' || array_to_string(tags, ' '))
               ) stored
);

create index if not exists forum_threads_recent on public.forum_threads (created_at desc);
create index if not exists forum_threads_category on public.forum_threads (category, created_at desc);
create index if not exists forum_threads_search on public.forum_threads using gin (search);

alter table public.forum_threads enable row level security;

drop policy if exists "forum_threads_read" on public.forum_threads;
create policy "forum_threads_read"
  on public.forum_threads for select
  to authenticated
  using (true);

drop policy if exists "forum_threads_insert" on public.forum_threads;
create policy "forum_threads_insert"
  on public.forum_threads for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (not public.forum_is_pro_category(category) or public.forum_plan(auth.uid()) in ('pro','mod'))
  );

drop policy if exists "forum_threads_update_own" on public.forum_threads;
create policy "forum_threads_update_own"
  on public.forum_threads for update
  to authenticated
  using (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod')
  with check (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod');

drop policy if exists "forum_threads_delete_own" on public.forum_threads;
create policy "forum_threads_delete_own"
  on public.forum_threads for delete
  to authenticated
  using (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod');

-- ---------- 4. Beitraege -----------------------------------
create table if not exists public.forum_posts (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.forum_threads (id) on delete cascade,
  author_id    uuid not null references auth.users (id) on delete cascade,
  author_name  text not null,
  body         text not null check (char_length(body) between 8 and 8000),
  reply_to     uuid references public.forum_posts (id) on delete set null,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);

create index if not exists forum_posts_thread on public.forum_posts (thread_id, created_at);

alter table public.forum_posts enable row level security;

drop policy if exists "forum_posts_read" on public.forum_posts;
create policy "forum_posts_read"
  on public.forum_posts for select
  to authenticated
  using (true);

drop policy if exists "forum_posts_insert" on public.forum_posts;
create policy "forum_posts_insert"
  on public.forum_posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.forum_threads t
      where t.id = thread_id
        and (not public.forum_is_pro_category(t.category)
             or public.forum_plan(auth.uid()) in ('pro','mod'))
    )
  );

drop policy if exists "forum_posts_update_own" on public.forum_posts;
create policy "forum_posts_update_own"
  on public.forum_posts for update
  to authenticated
  using (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod')
  with check (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod');

drop policy if exists "forum_posts_delete_own" on public.forum_posts;
create policy "forum_posts_delete_own"
  on public.forum_posts for delete
  to authenticated
  using (author_id = auth.uid() or public.forum_plan(auth.uid()) = 'mod');

-- ---------- 5. Stimmen -------------------------------------
create table if not exists public.forum_votes (
  item_kind  text not null check (item_kind in ('thread','post')),
  item_id    uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_kind, item_id, user_id)
);

alter table public.forum_votes enable row level security;

drop policy if exists "forum_votes_read" on public.forum_votes;
create policy "forum_votes_read"
  on public.forum_votes for select
  to authenticated using (true);

drop policy if exists "forum_votes_own" on public.forum_votes;
create policy "forum_votes_own"
  on public.forum_votes for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "forum_votes_remove" on public.forum_votes;
create policy "forum_votes_remove"
  on public.forum_votes for delete
  to authenticated using (user_id = auth.uid());

-- ---------- 6. Meldungen -----------------------------------
create table if not exists public.forum_reports (
  id         uuid primary key default gen_random_uuid(),
  item_kind  text not null check (item_kind in ('thread','post')),
  item_id    uuid not null,
  reason     text not null check (char_length(reason) between 3 and 500),
  reporter   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table public.forum_reports enable row level security;

-- Meldungen sieht nur die Moderation. Wer meldet, sieht die eigene.
drop policy if exists "forum_reports_insert" on public.forum_reports;
create policy "forum_reports_insert"
  on public.forum_reports for insert
  to authenticated with check (reporter = auth.uid());

drop policy if exists "forum_reports_read" on public.forum_reports;
create policy "forum_reports_read"
  on public.forum_reports for select
  to authenticated
  using (reporter = auth.uid() or public.forum_plan(auth.uid()) = 'mod');

-- ---------- 7. Trigger: Autor und Zeit kommen vom Server -----
create or replace function public.forum_thread_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(name, ''), split_part(email, '@', 1), 'Mitglied')
      into display_name
      from public.profiles where id = auth.uid();
    new.author_id := auth.uid();
    new.author_name := coalesce(display_name, 'Mitglied');
    new.views := 0;
  else
    -- readers may only bump the counter; authors may edit text
    if auth.uid() <> old.author_id then
      new.title := old.title;
      new.body := old.body;
      new.tags := old.tags;
      new.category := old.category;
      new.pinned := old.pinned;
    end if;
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forum_thread_touch on public.forum_threads;
create trigger forum_thread_touch
  before insert or update on public.forum_threads
  for each row execute function public.forum_thread_touch();

create or replace function public.forum_post_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(name, ''), split_part(email, '@', 1), 'Mitglied')
      into display_name
      from public.profiles where id = auth.uid();
    new.author_id := auth.uid();
    new.author_name := coalesce(display_name, 'Mitglied');
    new.edited_at := null;
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.thread_id := old.thread_id;
    new.created_at := old.created_at;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists forum_post_touch on public.forum_posts;
create trigger forum_post_touch
  before insert or update on public.forum_posts
  for each row execute function public.forum_post_touch();

-- Themen-Zeitstempel ziehen nach, wenn eine Antwort kommt
create or replace function public.forum_bump_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forum_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists forum_bump_thread on public.forum_posts;
create trigger forum_bump_thread
  after insert on public.forum_posts
  for each row execute function public.forum_bump_thread();

-- ---------- 8. Rechte --------------------------------------
revoke all on public.forum_threads  from anon;
revoke all on public.forum_posts    from anon;
revoke all on public.forum_votes    from anon;
revoke all on public.forum_reports  from anon;

grant select, insert, update, delete on public.forum_threads to authenticated;
grant select, insert, update, delete on public.forum_posts   to authenticated;
grant select, insert, delete         on public.forum_votes   to authenticated;
grant select, insert                 on public.forum_reports to authenticated;
grant select                         on public.forum_categories to authenticated, anon;
