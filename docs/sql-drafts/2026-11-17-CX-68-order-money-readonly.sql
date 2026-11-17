-- CX-68 operating check: read-only. Returns only mismatches; never writes.
with line_totals as (
  select company_id, order_id, coalesce(sum(total_amount),0)::bigint as line_total
  from public.store_order_lines group by company_id, order_id
), documents as (
  select company_id, source_id as order_id, id as document_id, total_amount as document_total
  from public.business_documents
  where source_type='order' and document_type='sale' and status='confirmed'
), ledger as (
  select company_id, source_document_id as document_id, coalesce(sum(amount),0)::bigint as ledger_increase
  from public.partner_ledger_entries group by company_id, source_document_id
)
select o.company_id,o.id as order_id,o.status,o.known_total,
  coalesce(l.line_total,0)+o.delivery_fee as line_and_fee_total,
  d.document_id,d.document_total,g.ledger_increase,
  clock_timestamp() as checked_at
from public.store_orders o
left join line_totals l on l.company_id=o.company_id and l.order_id=o.id
left join documents d on d.company_id=o.company_id and d.order_id=o.id
left join ledger g on g.company_id=d.company_id and g.document_id=d.document_id
where o.submitted_at >= current_date - interval '7 days'
  and (o.known_total is distinct from coalesce(l.line_total,0)+o.delivery_fee
    or d.document_id is not null and (o.known_total is distinct from d.document_total or d.document_total is distinct from g.ledger_increase))
order by o.submitted_at desc,o.id;
