alter table public.customer_notes add column if not exists idempotency_key text;
alter table public.customer_attachments add column if not exists idempotency_key text;
alter table public.customer_message_logs add column if not exists idempotency_key text;

create unique index if not exists uq_customer_notes_delivery_idempotency
  on public.customer_notes(company_id, customer_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists uq_customer_attachments_delivery_idempotency
  on public.customer_attachments(company_id, customer_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists uq_customer_message_logs_delivery_idempotency
  on public.customer_message_logs(company_id, customer_id, idempotency_key)
  where idempotency_key is not null;
