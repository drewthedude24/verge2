create extension if not exists pgcrypto;

create table if not exists public.planner_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null,
  scope_label text not null,
  plan_status text not null default 'draft',
  timezone text,
  focus_strategy text,
  plan_summary text,
  source_prompt text,
  provider_label text,
  raw_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.planner_blocks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.planner_runs(id) on delete cascade,
  block_key text not null,
  position integer not null default 0,
  title text not null,
  kind text not null,
  date_label text,
  start_time text,
  end_time text,
  duration_minutes integer,
  focus_level text,
  energy_match text,
  status text not null default 'pending',
  can_skip boolean not null default true,
  source_goal text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, block_key)
);

create index if not exists planner_runs_user_created_idx on public.planner_runs (user_id, created_at desc);
create index if not exists planner_blocks_run_position_idx on public.planner_blocks (run_id, position);

alter table public.planner_runs enable row level security;
alter table public.planner_blocks enable row level security;

drop policy if exists "Users can read their own planner runs" on public.planner_runs;
create policy "Users can read their own planner runs"
  on public.planner_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own planner runs" on public.planner_runs;
create policy "Users can insert their own planner runs"
  on public.planner_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own planner runs" on public.planner_runs;
create policy "Users can update their own planner runs"
  on public.planner_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own planner runs" on public.planner_runs;
create policy "Users can delete their own planner runs"
  on public.planner_runs
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read blocks for their own planner runs" on public.planner_blocks;
create policy "Users can read blocks for their own planner runs"
  on public.planner_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.planner_runs
      where planner_runs.id = planner_blocks.run_id
        and planner_runs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert blocks for their own planner runs" on public.planner_blocks;
create policy "Users can insert blocks for their own planner runs"
  on public.planner_blocks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.planner_runs
      where planner_runs.id = planner_blocks.run_id
        and planner_runs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update blocks for their own planner runs" on public.planner_blocks;
create policy "Users can update blocks for their own planner runs"
  on public.planner_blocks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.planner_runs
      where planner_runs.id = planner_blocks.run_id
        and planner_runs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.planner_runs
      where planner_runs.id = planner_blocks.run_id
        and planner_runs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete blocks for their own planner runs" on public.planner_blocks;
create policy "Users can delete blocks for their own planner runs"
  on public.planner_blocks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.planner_runs
      where planner_runs.id = planner_blocks.run_id
        and planner_runs.user_id = auth.uid()
    )
  );
