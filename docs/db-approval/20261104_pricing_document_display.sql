-- 11/4 견적서·단가표 문서 보기: 품목 격자 열 수 · 행사 블록 모양 · 회사 정보 줄(display) 저장 + 품목 최대 100 → 300.
-- 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요. 함수 1개(pricing_p1_clean)만 바꾸고 테이블은 바꾸지 않습니다.
-- 기존 문서는 display 가 없으면 기본값(1열·카드·정보 없음)으로 저장됩니다.
create or replace function public.pricing_p1_clean(p_company uuid, p_content jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare l jsonb; result jsonb:='[]'; promo pricing_promotions; item uuid; name text; price numeric; seen text[]:='{}'; key text;
 disp jsonb; cols integer; promo_layout text; info jsonb:='[]'; i jsonb;
begin
 if coalesce(p_content->>'kind','') not in ('sheet','quote') or coalesce(p_content->>'theme','') not in ('blue','green','mono') or coalesce(p_content->>'layout','') not in ('auto','table','cards') then raise exception 'Invalid document options'; end if;
 if length(trim(coalesce(p_content->>'title',''))) not between 1 and 100 or length(trim(coalesce(p_content->>'companyName',''))) not between 1 and 100 or length(coalesce(p_content->>'contact',''))>100 or length(coalesce(p_content->>'recipient',''))>100 or length(coalesce(p_content->>'footer',''))>400 then raise exception 'Invalid header'; end if;
 if coalesce(p_content->>'validUntil','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_content->>'validUntil')::date,'YYYY-MM-DD')<>p_content->>'validUntil' then raise exception 'Invalid expiry'; end if;
 if jsonb_typeof(p_content->'showPrice') is distinct from 'boolean' or jsonb_typeof(p_content->'showBrand') is distinct from 'boolean' or jsonb_typeof(p_content->'showSpec') is distinct from 'boolean' or jsonb_typeof(p_content->'lines') is distinct from 'array' or jsonb_array_length(p_content->'lines') not between 1 and 300 then raise exception 'Invalid document fields'; end if;
 for l in select * from jsonb_array_elements(p_content->'lines') loop
   item:=(l->>'productId')::uuid;
   if not exists(select from product_catalog where company_id=p_company and id=item and is_active) then raise exception 'Product not found in company'; end if;
   key:=item::text||':'||coalesce(l->>'promotionId','');
   if key=any(seen) then raise exception 'Duplicate product'; end if; seen:=array_append(seen,key);
   name:=trim(coalesce(l->>'displayName',''));price:=(l->>'price')::numeric;
   if length(name) not between 1 and 120 or length(coalesce(l->>'brand',''))>80 or length(coalesce(l->>'spec',''))>80 or length(coalesce(l->>'unit',''))>20 or price is null or price<>trunc(price) or price<0 or price>1000000000000 or coalesce(l->>'taxType','') not in ('taxable','exempt') or jsonb_typeof(l->'visible') is distinct from 'boolean' then raise exception 'Invalid printable line'; end if;
   select * into promo from pricing_promotions where company_id=p_company and id=(l->>'promotionId')::uuid and product_id=item;
   if l->>'promotionId' is not null and not found then raise exception 'Promotion not found'; end if;
   if promo.id is not null and p_content->>'kind'='sheet' and not promo.allow_sheet then raise exception 'Promotion not enabled for sheets'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('productId',item,'displayName',coalesce(promo.display_name,name),'brand',coalesce(l->>'brand',''),'spec',coalesce(l->>'spec',''),'unit',coalesce(l->>'unit',''),'price',coalesce(promo.price,price::bigint),'taxType',coalesce(promo.tax_type,l->>'taxType'),'visible',(l->>'visible')::boolean,'promotionId',promo.id,'startsOn',promo.starts_on,'endsOn',promo.ends_on,'remaining',promo.stock,'badge',coalesce(promo.badge,'')));
 end loop;
 if not exists(select from jsonb_array_elements(result) x where (x->>'visible')::boolean) then raise exception 'No visible products'; end if;
 -- 표시 설정(선택). 형식이 틀린 값은 버리고 기본값을 씁니다.
 disp:=case when jsonb_typeof(p_content->'display')='object' then p_content->'display' else '{}'::jsonb end;
 cols:=case when disp->>'columns' in ('1','2','3') then (disp->>'columns')::integer else 1 end;
 promo_layout:=case when disp->>'promoLayout' in ('cards','table') then disp->>'promoLayout' else 'cards' end;
 if jsonb_typeof(disp->'info')='array' then
   for i in select value from jsonb_array_elements(disp->'info') limit 24 loop
     if jsonb_typeof(i)='object' and coalesce(i->>'place','') in ('header','footer') and length(trim(coalesce(i->>'label',''))) between 1 and 30 and length(trim(coalesce(i->>'value',''))) between 1 and 200 then
       info:=info||jsonb_build_array(jsonb_build_object('key',left(coalesce(i->>'key',''),40),'label',trim(i->>'label'),'value',trim(i->>'value'),'place',i->>'place'));
     end if;
   end loop;
 end if;
 return jsonb_build_object('kind',p_content->>'kind','title',trim(p_content->>'title'),'companyName',trim(p_content->>'companyName'),'contact',coalesce(p_content->>'contact',''),'recipient',coalesce(p_content->>'recipient',''),'footer',coalesce(p_content->>'footer',''),'validUntil',p_content->>'validUntil','theme',p_content->>'theme','layout',p_content->>'layout','showPrice',p_content->'showPrice','showBrand',p_content->'showBrand','showSpec',p_content->'showSpec','lines',result,'display',jsonb_build_object('columns',cols,'promoLayout',promo_layout,'info',info));
end $function$;
