-- PR A of 5: notification policy + queue schema
--
-- Introduces a server-side queue that future PRs (B–E) will use to:
--   * Batch DIGESTIBLE notifications into a daily/weekly email digest.
--   * Dedupe re-fires of the same alert (price-increase, contract-end, etc.).
--   * Mirror outbound notifications onto WhatsApp / Telegram for parity.
--
-- This migration is intentionally inert: it adds the table + opt-out column.
-- No call sites are migrated yet (those land in PRs B–E).

create extension if not exists "pgcrypto";

create table if not exists public.notification_queue (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null,
  payload         jsonb not null default '{}'::jsonb,
  priority        smallint not null default 2 check (priority in (1, 2, 3)),
  dedup_key       text,
  created_at      timestamptz not null default now(),
  dispatched_at   timestamptz,
  digest_id       uuid
);

comment on table  public.notification_queue is 'Outbound notification queue. priority 1=time-critical (immediate), 2=digestible (batched), 3=marketing.';
comment on column public.notification_queue.kind        is 'Notification kind, e.g. price_increase, contract_end, dispute_status, deal_alert, weekly_digest.';
comment on column public.notification_queue.payload     is 'Renderer-specific payload (subject/body params, links, amounts).';
comment on column public.notification_queue.dedup_key   is 'Optional dedupe key. While dispatched_at is null, (user_id, dedup_key) is unique.';
comment on column public.notification_queue.dispatched_at is 'Set when the row has been delivered (email sent or rolled into a digest).';
comment on column public.notification_queue.digest_id   is 'If non-null, the row was rolled into the digest with this id.';

-- Dedupe undispatched rows per user (only when dedup_key supplied).
create unique index if not exists notification_queue_user_dedup_active_uq
  on public.notification_queue (user_id, dedup_key)
  where dispatched_at is null and dedup_key is not null;

-- Digest scan: fast lookup of pending rows per user.
create index if not exists notification_queue_user_dispatched_idx
  on public.notification_queue (user_id, dispatched_at);

-- RLS: service-role only. No direct client access.
alter table public.notification_queue enable row level security;

drop policy if exists "service_role only" on public.notification_queue;
create policy "service_role only"
  on public.notification_queue
  as permissive
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Per-user opt-out for the digestible bucket. Time-critical alerts ignore this flag.
alter table public.profiles
  add column if not exists email_digest_optout boolean not null default false;

comment on column public.profiles.email_digest_optout is 'When true, suppress DIGESTIBLE-bucket emails for this user. Time-critical and transactional emails are unaffected.';
