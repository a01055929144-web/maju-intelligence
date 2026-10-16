-- 운영 적용 완료(2026-10-16). 재실행 금지.
-- 원본: inventory-phase-1-final.sql
-- 재고관리 1단계 (Claude 최종본 2026-10-16, Codex 초안 05af375 기반)
-- 선행: ERP 1단계 + 1-B v2 + 1-C 적용 완료. 여러 번 실행해도 안전(멱등).
-- 전표 연동은 business_documents 트리거로 처리: 확정·발행 전표 수정(revision 증가)·삭제(취소) 시 자동 반영.
-- 기존 ERP 함수는 수정하지 않음.

begin;

-- 0. 사전 점검
do $$
declare t text;
begin
  foreach t in array array['product_catalog','business_documents','business_document_lines','supplier_products'] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype in ('u','p')
        and pg_get_constraintdef(oid) in ('UNIQUE (company_id, id)', 'UNIQUE (id, company_id)')
    ) then
      raise exception '사전 점검 실패: public.%에 (company_id, id) 유니크 제약이 없습니다.', t;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where proname = 'save_business_document') then
    raise exception '사전 점검 실패: ERP 1-B v2(save_business_document)를 먼저 적용하세요.';
  end if;
end $$;

-- 1. 단위 환산 / 상품별 재고 설정
create table if not exists public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  unit_name text not null,
  base_quantity numeric(14,3) not null,
  is_base boolean not null default false,
  is_confirmed boolean not null default false,
  source text not null default 'manual',
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_unit_conversions_company_id_id_uq unique(company_id, id),
  constraint product_unit_conversions_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  constraint product_unit_conversions_unit_uq unique(company_id, product_catalog_id, unit_name),
  constraint product_unit_conversions_quantity_check check(base_quantity > 0),
  constraint product_unit_conversions_base_one_check check(not is_base or base_quantity = 1),
  constraint product_unit_conversions_unit_check check(length(btrim(unit_name)) between 1 and 40),
  constraint product_unit_conversions_source_check check(source in ('manual','supplier_match','legacy'))
);
create unique index if not exists product_unit_conversions_one_base_uq
  on public.product_unit_conversions(company_id, product_catalog_id) where is_base;

create table if not exists public.product_inventory_settings (
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  tracking_enabled boolean not null default true,
  safety_stock_quantity numeric(14,3) not null default 0,
  preferred_supplier_product_id uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key(company_id, product_catalog_id),
  constraint product_inventory_settings_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  constraint product_inventory_settings_supplier_product_fk foreign key(company_id, preferred_supplier_product_id)
    references public.supplier_products(company_id, id) on delete set null (preferred_supplier_product_id),
  constraint product_inventory_settings_safety_check check(safety_stock_quantity >= 0)
);

-- 2. 재고 원장(append-only)
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  movement_type text not null,
  quantity_delta numeric(14,3) not null,
  value_delta numeric(18,2) not null default 0,
  unit_cost numeric(18,6),
  business_date date not null,
  source_document_id uuid,
  source_document_number_snapshot text,
  stocktake_id uuid,
  reason text,
  actor_name text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_company_id_id_uq unique(company_id, id),
  constraint inventory_movements_idempotency_uq unique(company_id, idempotency_key),
  constraint inventory_movements_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_movements_document_fk foreign key(company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint inventory_movements_type_check check(movement_type in (
    'purchase_in','sale_out','sale_return_in','purchase_return_out','adjustment','revision')),
  constraint inventory_movements_quantity_check check(
    (movement_type in ('purchase_in','sale_return_in') and quantity_delta > 0)
    or (movement_type in ('sale_out','purchase_return_out') and quantity_delta < 0)
    or (movement_type = 'adjustment' and quantity_delta <> 0)
    or (movement_type = 'revision' and (quantity_delta <> 0 or value_delta <> 0))),
  constraint inventory_movements_unit_cost_check check(unit_cost is null or unit_cost >= 0)
);
create index if not exists inventory_movements_product_date_idx
  on public.inventory_movements(company_id, product_catalog_id, business_date desc, created_at desc);
create index if not exists inventory_movements_document_idx
  on public.inventory_movements(company_id, source_document_id, created_at);

drop trigger if exists inventory_movements_append_only on public.inventory_movements;
create trigger inventory_movements_append_only
before update or delete on public.inventory_movements
for each row execute function public.reject_append_only_mutation();

-- 3. 투영(재구축 가능): 전표별 반영 수량, 상품별 현재고
create table if not exists public.inventory_document_positions (
  company_id uuid not null references public.companies(id) on delete restrict,
  source_document_id uuid not null,
  product_catalog_id uuid not null,
  applied_base_quantity numeric(14,3) not null default 0,
  applied_value numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key(company_id, source_document_id, product_catalog_id),
  constraint inventory_document_positions_document_fk foreign key(company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint inventory_document_positions_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict
);

create table if not exists public.inventory_balances (
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  on_hand_quantity numeric(14,3) not null default 0,
  inventory_value numeric(18,2) not null default 0,
  average_unit_cost numeric(18,6),
  negative_cost_estimate boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(company_id, product_catalog_id),
  constraint inventory_balances_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_balances_cost_check check(average_unit_cost is null or average_unit_cost >= 0)
);
create index if not exists inventory_balances_negative_idx
  on public.inventory_balances(company_id, on_hand_quantity) where on_hand_quantity < 0;

-- 4. 실사
create table if not exists public.inventory_stocktakes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'draft',
  counted_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  reason text not null,
  posted_at timestamptz,
  posted_by_name text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stocktakes_company_id_id_uq unique(company_id, id),
  constraint inventory_stocktakes_status_check check(status in ('draft','posted','cancelled')),
  constraint inventory_stocktakes_reason_check check(length(btrim(reason)) between 1 and 500)
);

create table if not exists public.inventory_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  stocktake_id uuid not null,
  product_catalog_id uuid not null,
  counted_quantity numeric(14,3) not null,
  system_quantity_snapshot numeric(14,3),
  difference_quantity numeric(14,3),
  created_at timestamptz not null default now(),
  constraint inventory_stocktake_lines_product_uq unique(company_id, stocktake_id, product_catalog_id),
  constraint inventory_stocktake_lines_stocktake_fk foreign key(company_id, stocktake_id)
    references public.inventory_stocktakes(company_id, id) on delete cascade,
  constraint inventory_stocktake_lines_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_stocktake_lines_count_check check(counted_quantity >= 0)
);

-- 5. 전표 라인 → 재고 상품·기본 단위 수량 해석
--    status: ok / unmapped(매입 상품 확정 매핑 없음) / no_conversion(단위 환산 없음) / untracked / no_product
create or replace function public.inventory_resolve_document_lines(p_company_id uuid, p_document_id uuid)
returns table(line_id uuid, product_catalog_id uuid, base_quantity numeric, line_value bigint, resolve_status text)
language sql stable security invoker set search_path = '' as $$
  with lines as (
    select l.id, l.unit_snapshot, l.quantity, l.supply_amount, d.document_type,
           case when d.document_type in ('sale','sale_return') then l.product_catalog_id
                else (select m.product_catalog_id from public.supplier_product_matches m
                      where m.company_id = l.company_id and m.supplier_product_id = l.supplier_product_id
                        and m.match_status = 'confirmed' limit 1)
           end as product_id
    from public.business_document_lines l
    join public.business_documents d on d.company_id = l.company_id and d.id = l.document_id
    where l.company_id = p_company_id and l.document_id = p_document_id
  )
  select x.id, x.product_id,
         case when x.factor is null then null else x.quantity * x.factor end,
         x.supply_amount,
         case when x.product_id is null and x.document_type in ('purchase','purchase_return') then 'unmapped'
              when x.product_id is null then 'no_product'
              when x.tracking = false then 'untracked'
              when x.factor is null then 'no_conversion'
              else 'ok' end
  from (
    select lines.*,
      coalesce((select s.tracking_enabled from public.product_inventory_settings s
                where s.company_id = p_company_id and s.product_catalog_id = lines.product_id), true) as tracking,
      coalesce(
        (select c.base_quantity from public.product_unit_conversions c
         where c.company_id = p_company_id and c.product_catalog_id = lines.product_id
           and c.is_confirmed and lower(btrim(c.unit_name)) = lower(btrim(lines.unit_snapshot))),
        -- 환산표가 아직 없는 상품은 상품의 판매 단위와 같은 단위만 1:1로 인정
        (select 1::numeric from public.product_catalog p
         where p.company_id = p_company_id and p.id = lines.product_id
           and not exists (select 1 from public.product_unit_conversions c2
                           where c2.company_id = p_company_id and c2.product_catalog_id = lines.product_id)
           and lower(btrim(coalesce(to_jsonb(p)->>'sales_unit', ''))) = lower(btrim(lines.unit_snapshot)))
      ) as factor
    from lines
  ) x;
$$;

-- 6. 원장 1건 기록 + 현재고 갱신(같은 트랜잭션)
create or replace function public.inventory_post_movement(
  p_company_id uuid, p_product_id uuid, p_type text, p_quantity numeric, p_value numeric,
  p_business_date date, p_document_id uuid, p_document_number text, p_stocktake_id uuid,
  p_reason text, p_actor_name text, p_idempotency_key text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  v_inserted uuid;
  v_new_qty numeric;
  v_new_value numeric;
  v_avg numeric;
begin
  insert into public.inventory_balances(company_id, product_catalog_id)
  values (p_company_id, p_product_id) on conflict do nothing;
  perform 1 from public.inventory_balances
  where company_id = p_company_id and product_catalog_id = p_product_id for update;

  insert into public.inventory_movements(
    company_id, product_catalog_id, movement_type, quantity_delta, value_delta, unit_cost,
    business_date, source_document_id, source_document_number_snapshot, stocktake_id,
    reason, actor_name, idempotency_key
  ) values (
    p_company_id, p_product_id, p_type, p_quantity, round(p_value, 2),
    case when p_quantity <> 0 then abs(p_value / p_quantity) end,
    p_business_date, p_document_id, p_document_number, p_stocktake_id,
    p_reason, p_actor_name, p_idempotency_key
  ) on conflict (company_id, idempotency_key) do nothing
  returning id into v_inserted;
  if v_inserted is null then return false; end if;

  select on_hand_quantity + p_quantity, inventory_value + round(p_value, 2), average_unit_cost
    into v_new_qty, v_new_value, v_avg
  from public.inventory_balances where company_id = p_company_id and product_catalog_id = p_product_id;

  if v_new_qty > 0 then
    v_avg := greatest(v_new_value, 0) / v_new_qty;
  else
    -- 0 이하로 내려가면 마지막 평균원가 유지, 금액은 수량 × 평균원가로 맞춤
    v_new_value := round(v_new_qty * coalesce(v_avg, 0), 2);
  end if;

  update public.inventory_balances set
    on_hand_quantity = v_new_qty,
    inventory_value = v_new_value,
    average_unit_cost = v_avg,
    negative_cost_estimate = v_new_qty < 0,
    updated_at = now()
  where company_id = p_company_id and product_catalog_id = p_product_id;
  return true;
end;
$$;

-- 7. 전표 1건의 재고를 "목표 수량"에 맞춤(차이만 기록). 확정=유형 수량, 그 외(취소 등)=0
create or replace function public.apply_inventory_for_document(
  p_company_id uuid, p_document_id uuid, p_actor_name text, p_reason text default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_doc public.business_documents%rowtype;
  v_sign integer;
  v_row record;
  v_avg numeric;
  v_delta numeric;
  v_value_delta numeric;
  v_type text;
  v_seq integer;
begin
  select * into v_doc from public.business_documents
  where company_id = p_company_id and id = p_document_id;
  if not found then return; end if;
  v_sign := case when v_doc.document_type in ('purchase','sale_return') then 1 else -1 end;

  for v_row in
    with targets as (
      select r.product_catalog_id, sum(r.base_quantity) as qty, sum(r.line_value) as val
      from public.inventory_resolve_document_lines(p_company_id, p_document_id) r
      where v_doc.status = 'confirmed' and r.resolve_status = 'ok'
      group by r.product_catalog_id
    ),
    positions as (
      select product_catalog_id, applied_base_quantity, applied_value
      from public.inventory_document_positions
      where company_id = p_company_id and source_document_id = p_document_id
    )
    select coalesce(t.product_catalog_id, p.product_catalog_id) as product_id,
           coalesce(v_sign * t.qty, 0) as target_qty,
           coalesce(v_sign * t.val, 0) as target_value,
           p.product_catalog_id is not null as has_position,
           coalesce(p.applied_base_quantity, 0) as applied_qty,
           coalesce(p.applied_value, 0) as applied_value
    from targets t full join positions p on p.product_catalog_id = t.product_catalog_id
    order by 1   -- 상품 ID 순서로 잠금(교착 방지)
  loop
    v_delta := v_row.target_qty - v_row.applied_qty;
    -- 매입 단가만 바뀐 경우(수량 동일)는 금액만 보정
    if v_delta = 0 and not (v_doc.document_type = 'purchase' and v_row.target_value <> v_row.applied_value) then
      continue;
    end if;

    select average_unit_cost into v_avg from public.inventory_balances
    where company_id = p_company_id and product_catalog_id = v_row.product_id;

    if v_doc.document_type = 'purchase' then
      -- 매입: 실제 매입금액(공급가액) 기준
      v_value_delta := v_row.target_value - v_row.applied_value;
    else
      -- 매출·반품: 현재 평균원가 기준
      v_value_delta := v_delta * coalesce(v_avg, 0);
    end if;

    v_type := case
      when not v_row.has_position then
        case v_doc.document_type when 'purchase' then 'purchase_in' when 'sale' then 'sale_out'
             when 'sale_return' then 'sale_return_in' else 'purchase_return_out' end
      else 'revision' end;

    select count(*) into v_seq from public.inventory_movements
    where company_id = p_company_id and source_document_id = p_document_id
      and product_catalog_id = v_row.product_id;

    perform public.inventory_post_movement(
      p_company_id, v_row.product_id, v_type, v_delta, v_value_delta,
      v_doc.document_date, p_document_id, v_doc.document_number, null,
      coalesce(p_reason, case when v_doc.status = 'cancelled' then '전표 삭제'
                              when v_row.has_position then '전표 수정 ' || v_doc.revision || '차'
                              else '전표 확정' end),
      p_actor_name,
      'doc:' || p_document_id || ':' || v_row.product_id || ':' || v_seq
    );

    insert into public.inventory_document_positions(
      company_id, source_document_id, product_catalog_id, applied_base_quantity, applied_value
    ) values (
      p_company_id, p_document_id, v_row.product_id, v_row.target_qty,
      v_row.applied_value + v_value_delta
    ) on conflict (company_id, source_document_id, product_catalog_id) do update set
      applied_base_quantity = excluded.applied_base_quantity,
      applied_value = excluded.applied_value,
      updated_at = now();
  end loop;
end;
$$;

-- 8. 전표 트리거: 확정·발행 전표 수정(revision)·삭제(취소) 시 자동 반영
create or replace function public.business_documents_inventory_trigger()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.apply_inventory_for_document(
    new.company_id, new.id,
    coalesce(new.last_revised_by_name, new.cancelled_by_name, new.confirmed_by_name, new.created_by_name));
  return null;
end;
$$;

drop trigger if exists business_documents_inventory_trg on public.business_documents;
create trigger business_documents_inventory_trg
after update on public.business_documents
for each row
when (old.status is distinct from new.status or old.revision is distinct from new.revision)
execute function public.business_documents_inventory_trigger();

-- 9. 매핑·단위 환산을 나중에 채운 경우 재반영
create or replace function public.reapply_inventory_for_document(
  p_company_id uuid, p_document_id uuid, p_actor_name text
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  perform public.apply_inventory_for_document(p_company_id, p_document_id, p_actor_name, '매핑·환산 반영');
end;
$$;

-- 10. 전표별 재고 반영 상태(화면 표시용): 반영 / 매입상품 미연결 / 환산 없음 / 미추적
create or replace function public.inventory_document_status(p_company_id uuid, p_document_id uuid)
returns table(resolve_status text, line_count bigint)
language sql stable security invoker set search_path = '' as $$
  select resolve_status, count(*)
  from public.inventory_resolve_document_lines(p_company_id, p_document_id)
  group by resolve_status;
$$;

-- 11. 실사 게시: 시스템 수량과 차이만 adjustment로 기록
create or replace function public.post_inventory_stocktake(
  p_company_id uuid, p_stocktake_id uuid, p_actor_name text
) returns public.inventory_stocktakes
language plpgsql security invoker set search_path = '' as $$
declare
  v_take public.inventory_stocktakes%rowtype;
  v_line record;
  v_system numeric;
  v_avg numeric;
  v_diff numeric;
begin
  select * into v_take from public.inventory_stocktakes
  where company_id = p_company_id and id = p_stocktake_id for update;
  if not found then raise exception 'stocktake not found'; end if;
  if v_take.status = 'posted' then return v_take; end if;
  if v_take.status <> 'draft' then raise exception 'only draft stocktakes can be posted'; end if;

  for v_line in
    select * from public.inventory_stocktake_lines
    where company_id = p_company_id and stocktake_id = p_stocktake_id
    order by product_catalog_id
  loop
    insert into public.inventory_balances(company_id, product_catalog_id)
    values (p_company_id, v_line.product_catalog_id) on conflict do nothing;
    select on_hand_quantity, average_unit_cost into v_system, v_avg
    from public.inventory_balances
    where company_id = p_company_id and product_catalog_id = v_line.product_catalog_id for update;
    v_diff := v_line.counted_quantity - v_system;

    update public.inventory_stocktake_lines set
      system_quantity_snapshot = v_system, difference_quantity = v_diff
    where id = v_line.id;

    if v_diff <> 0 then
      perform public.inventory_post_movement(
        p_company_id, v_line.product_catalog_id, 'adjustment', v_diff, v_diff * coalesce(v_avg, 0),
        v_take.counted_on, null, null, p_stocktake_id,
        '실사: ' || v_take.reason, p_actor_name,
        'stocktake:' || p_stocktake_id || ':' || v_line.product_catalog_id
      );
    end if;
  end loop;

  update public.inventory_stocktakes set
    status = 'posted', posted_at = now(), posted_by_name = p_actor_name, updated_at = now()
  where company_id = p_company_id and id = p_stocktake_id returning * into v_take;
  return v_take;
end;
$$;

-- 12. 점검: 원장 합계와 현재고가 다른 상품
create or replace function public.inventory_balance_audit(p_company_id uuid)
returns table(product_catalog_id uuid, ledger_quantity numeric, balance_quantity numeric)
language sql stable security invoker set search_path = '' as $$
  select coalesce(m.product_catalog_id, b.product_catalog_id), coalesce(m.qty, 0), coalesce(b.on_hand_quantity, 0)
  from (select product_catalog_id, sum(quantity_delta) qty from public.inventory_movements
        where company_id = p_company_id group by product_catalog_id) m
  full join (select product_catalog_id, on_hand_quantity from public.inventory_balances
             where company_id = p_company_id) b on b.product_catalog_id = m.product_catalog_id
  where coalesce(m.qty, 0) <> coalesce(b.on_hand_quantity, 0);
$$;

-- 13. 권한
alter table public.product_unit_conversions enable row level security;
alter table public.product_inventory_settings enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_document_positions enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_stocktakes enable row level security;
alter table public.inventory_stocktake_lines enable row level security;

revoke all on table public.product_unit_conversions, public.product_inventory_settings, public.inventory_movements,
  public.inventory_document_positions, public.inventory_balances, public.inventory_stocktakes,
  public.inventory_stocktake_lines from public, anon, authenticated;
grant all on table public.product_unit_conversions, public.product_inventory_settings, public.inventory_movements,
  public.inventory_document_positions, public.inventory_balances, public.inventory_stocktakes,
  public.inventory_stocktake_lines to service_role;

revoke execute on function public.inventory_resolve_document_lines(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.inventory_post_movement(uuid,uuid,text,numeric,numeric,date,uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.apply_inventory_for_document(uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.business_documents_inventory_trigger() from public, anon, authenticated;
revoke execute on function public.reapply_inventory_for_document(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.inventory_document_status(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.post_inventory_stocktake(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.inventory_balance_audit(uuid) from public, anon, authenticated;
grant execute on function public.inventory_resolve_document_lines(uuid,uuid) to service_role;
grant execute on function public.inventory_post_movement(uuid,uuid,text,numeric,numeric,date,uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.apply_inventory_for_document(uuid,uuid,text,text) to service_role;
grant execute on function public.business_documents_inventory_trigger() to service_role;
grant execute on function public.reapply_inventory_for_document(uuid,uuid,text) to service_role;
grant execute on function public.inventory_document_status(uuid,uuid) to service_role;
grant execute on function public.post_inventory_stocktake(uuid,uuid,text) to service_role;
grant execute on function public.inventory_balance_audit(uuid) to service_role;

commit;
