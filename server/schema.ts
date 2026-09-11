/** Idempotent schema, applied when the API starts. */
export const schema = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  name text,
  picture text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  title text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_by_user on conversations (user_id, updated_at desc);

create table if not exists messages (
  conversation_id uuid not null references conversations (id) on delete cascade,
  position integer not null,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, position)
);
`;
