-- CX-69 안전 down: 입출금·역분개·상계 증거 행은 지우지 않는다. 함수와 신규 식별 칸만 제거한다.
begin;
drop function if exists public.offset_dual_partner_balance_v1(uuid,uuid,uuid,date,bigint,text,text,uuid,text);
drop function if exists public.reverse_partner_payment_v1(uuid,uuid,text,text,uuid,text);
drop function if exists public.record_partner_payment_v2(uuid,text,uuid,date,bigint,text,text,uuid,text,text,uuid);
alter table public.product_suppliers drop column if exists sub_business_number;
alter table public.normalized_customers drop column if exists sub_business_number;
commit;
