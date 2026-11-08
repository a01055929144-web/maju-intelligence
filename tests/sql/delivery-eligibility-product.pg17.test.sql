-- Disposable PG17 product contract fixture. This is not an operating migration.
do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'PG17_required';
  end if;
end $$;

create temporary table normalized_customers_fixture (
  id text primary key,
  customer_name text not null,
  address text,
  delivery_eligibility text not null check (delivery_eligibility in ('eligible', 'not_ready'))
);

insert into normalized_customers_fixture values
  ('existing-customer', '기존 거래처', '서울 기존 주소', 'eligible'),
  ('new-customer-with-address-and-order', '신규 거래처', '서울 신규 주소', 'not_ready');

do $$
begin
  if (select count(*) from normalized_customers_fixture) <> 2 then
    raise exception 'flag_off_must_preserve_existing_route_candidates';
  end if;
  if (select array_agg(id order by id) from normalized_customers_fixture where delivery_eligibility = 'eligible')
      <> array['existing-customer'] then
    raise exception 'flag_on_must_require_explicit_delivery_eligibility';
  end if;
end $$;
