alter table public.companies
  add column if not exists delivery_complete_message text,
  add column if not exists delivery_issue_message text,
  add column if not exists delivery_partial_message text,
  add column if not exists notification_phone text,
  add column if not exists notification_sender_name text,
  add column if not exists sms_sender_phone text;
