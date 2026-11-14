// Schema, one entry per version. Never edit an applied entry: add a new one.
// Every row that belongs to a person carries (case_id, member_id), and every query filters on it.

export const MIGRATIONS: string[] = [
  `
  create table sessions (
    id uuid primary key,
    case_id text not null,
    member_id text not null,
    state jsonb not null,
    summary text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index sessions_owner on sessions (case_id, member_id, updated_at desc);

  create table goals (
    id uuid primary key,
    case_id text not null,
    member_id text not null,
    title text not null,
    detail text not null default '',
    due date,
    status text not null default 'open' check (status in ('open', 'done')),
    created_at timestamptz not null default now()
  );
  create index goals_owner on goals (case_id, member_id, created_at);

  create table checkins (
    id bigserial primary key,
    goal_id uuid not null references goals (id) on delete cascade,
    at timestamptz not null default now(),
    note text
  );
  create index checkins_goal on checkins (goal_id, at);

  create table events (
    id bigserial primary key,
    case_id text not null,
    member_id text not null,
    session_id uuid,
    kind text not null,
    data jsonb not null default '{}',
    at timestamptz not null default now()
  );
  create index events_owner on events (case_id, member_id, at)
  `,
];
