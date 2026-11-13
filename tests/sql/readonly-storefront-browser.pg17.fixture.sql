\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'readonly_storefront_browser_test' or current_setting('server_version_num')::integer/10000<>17 then
  raise exception 'disposable_readonly_browser_PG17_required';
 end if;
end $$;
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir pricing-p2-fixture.sql
\ir ../../supabase/migrations/20261102114602_pricing_p2_store_ordering.sql
