-- Recipe Keeper database and storage setup
-- Safe for a new Supabase project. This script does not delete recipe data.

create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text,
  category text check (category is null or char_length(category) <= 60),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  cook_minutes integer not null default 0 check (cook_minutes >= 0),
  default_servings numeric not null default 4 check (default_servings > 0),
  notes text,
  total_cost numeric check (total_cost is null or total_cost >= 0),
  actual_servings numeric check (actual_servings is null or actual_servings > 0),
  cost_notes text,
  is_favorite boolean not null default false,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_cost_values_together check (
    (total_cost is null and actual_servings is null)
    or (total_cost is not null and actual_servings is not null)
  )
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null check (position >= 0),
  quantity numeric not null check (quantity > 0),
  unit text,
  name text not null check (char_length(trim(name)) > 0),
  note text,
  unique (recipe_id, position)
);

create table if not exists public.directions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null check (position >= 0),
  instruction text not null check (char_length(trim(instruction)) > 0),
  timer_seconds integer not null default 0 check (timer_seconds >= 0),
  unique (recipe_id, position)
);

create index if not exists recipes_user_updated_idx on public.recipes (user_id, updated_at desc);
create index if not exists recipes_user_category_idx on public.recipes (user_id, category);
create index if not exists recipes_user_favorite_idx on public.recipes (user_id, is_favorite) where is_favorite = true;
create index if not exists ingredients_recipe_idx on public.ingredients (recipe_id, position);
create index if not exists directions_recipe_idx on public.directions (recipe_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'recipes_set_updated_at'
      and tgrelid = 'public.recipes'::regclass
  ) then
    create trigger recipes_set_updated_at
      before update on public.recipes
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.directions enable row level security;

create policy "recipe owners can read recipes"
on public.recipes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "recipe owners can insert recipes"
on public.recipes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "recipe owners can update recipes"
on public.recipes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "recipe owners can delete recipes"
on public.recipes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "recipe owners can read ingredients"
on public.ingredients for select
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = ingredients.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can insert ingredients"
on public.ingredients for insert
to authenticated
with check (exists (
  select 1 from public.recipes r
  where r.id = ingredients.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can update ingredients"
on public.ingredients for update
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = ingredients.recipe_id and r.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.recipes r
  where r.id = ingredients.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can delete ingredients"
on public.ingredients for delete
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = ingredients.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can read directions"
on public.directions for select
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = directions.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can insert directions"
on public.directions for insert
to authenticated
with check (exists (
  select 1 from public.recipes r
  where r.id = directions.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can update directions"
on public.directions for update
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = directions.recipe_id and r.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.recipes r
  where r.id = directions.recipe_id and r.user_id = (select auth.uid())
));

create policy "recipe owners can delete directions"
on public.directions for delete
to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = directions.recipe_id and r.user_id = (select auth.uid())
));

grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.directions to authenticated;

-- Saves a recipe and its child rows together. If any part fails, PostgreSQL
-- rolls the whole save back, preventing a half-saved recipe.
create or replace function public.save_recipe(
  p_payload jsonb,
  p_ingredients jsonb,
  p_directions jsonb,
  p_recipe_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recipe_id uuid;
  v_image_path text := nullif(p_payload->>'image_path', '');
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in.';
  end if;

  if v_image_path is not null and split_part(v_image_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'Image path does not belong to the signed-in user.';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (
      user_id, title, description, category, prep_minutes, cook_minutes,
      default_servings, notes, total_cost, actual_servings, cost_notes,
      is_favorite, image_path
    ) values (
      (select auth.uid()), trim(p_payload->>'title'), nullif(trim(p_payload->>'description'), ''),
      nullif(trim(p_payload->>'category'), ''), coalesce((p_payload->>'prep_minutes')::integer, 0),
      coalesce((p_payload->>'cook_minutes')::integer, 0), (p_payload->>'default_servings')::numeric,
      nullif(trim(p_payload->>'notes'), ''), nullif(p_payload->>'total_cost', '')::numeric,
      nullif(p_payload->>'actual_servings', '')::numeric, nullif(trim(p_payload->>'cost_notes'), ''),
      coalesce((p_payload->>'is_favorite')::boolean, false), v_image_path
    ) returning id into v_recipe_id;
  else
    update public.recipes set
      title = trim(p_payload->>'title'),
      description = nullif(trim(p_payload->>'description'), ''),
      category = nullif(trim(p_payload->>'category'), ''),
      prep_minutes = coalesce((p_payload->>'prep_minutes')::integer, 0),
      cook_minutes = coalesce((p_payload->>'cook_minutes')::integer, 0),
      default_servings = (p_payload->>'default_servings')::numeric,
      notes = nullif(trim(p_payload->>'notes'), ''),
      total_cost = nullif(p_payload->>'total_cost', '')::numeric,
      actual_servings = nullif(p_payload->>'actual_servings', '')::numeric,
      cost_notes = nullif(trim(p_payload->>'cost_notes'), ''),
      is_favorite = coalesce((p_payload->>'is_favorite')::boolean, false),
      image_path = v_image_path
    where id = p_recipe_id and user_id = (select auth.uid())
    returning id into v_recipe_id;

    if v_recipe_id is null then
      raise exception 'Recipe not found or access denied.';
    end if;

    delete from public.ingredients where recipe_id = v_recipe_id;
    delete from public.directions where recipe_id = v_recipe_id;
  end if;

  insert into public.ingredients (recipe_id, position, quantity, unit, name, note)
  select v_recipe_id, x.position, x.quantity, nullif(trim(x.unit), ''), trim(x.name), nullif(trim(x.note), '')
  from jsonb_to_recordset(coalesce(p_ingredients, '[]'::jsonb))
    as x(position integer, quantity numeric, unit text, name text, note text);

  insert into public.directions (recipe_id, position, instruction, timer_seconds)
  select v_recipe_id, x.position, trim(x.instruction), coalesce(x.timer_seconds, 0)
  from jsonb_to_recordset(coalesce(p_directions, '[]'::jsonb))
    as x(position integer, instruction text, timer_seconds integer);

  return v_recipe_id;
end;
$$;

revoke all on function public.save_recipe(jsonb, jsonb, jsonb, uuid) from public;
grant execute on function public.save_recipe(jsonb, jsonb, jsonb, uuid) to authenticated;

-- Private image bucket. Files are limited to common image formats and 5 MB
-- after the app compresses them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images', 'recipe-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users can read their recipe images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users can upload their recipe images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users can update their recipe images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users can delete their recipe images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
