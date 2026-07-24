-- Supabase schema for the AI Compliance Command Center demo.
-- The app runs fully in-memory by default; apply this schema and set the
-- VITE_SUPABASE_* env vars to persist pipeline state to a Supabase project.
-- (In the Azure architecture this is the "React + Supabase" analyst dashboard
-- store; the immutable audit copy lives in Azure Blob with a WORM policy.)

create table if not exists alerts (
  id text primary key,
  transaction jsonb not null,
  assessment jsonb not null,
  status text not null default 'queued',
  priority int not null default 5,
  triage_summary text,
  assigned_to text,
  created_at timestamptz not null default now()
);

create table if not exists cases (
  id text primary key,
  alert_id text references alerts (id),
  alert jsonb not null,
  status text not null default 'open',
  opened_by text not null,
  notes jsonb not null default '[]',
  sar jsonb,
  opened_at timestamptz not null default now()
);

-- Append-only audit log. The hash chain is enforced in application code; here we
-- additionally block UPDATE/DELETE so rows are immutable once written.
create table if not exists audit_log (
  id text primary key,
  action text not null,
  actor text not null,
  subject_id text not null,
  detail text,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now()
);

create or replace function deny_mutation() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function deny_mutation();

create index if not exists alerts_status_idx on alerts (status, priority);
create index if not exists cases_status_idx on cases (status);
create index if not exists audit_created_idx on audit_log (created_at);
