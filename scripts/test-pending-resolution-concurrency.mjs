import assert from "node:assert/strict";
import pg from "pg";

if(!["127.0.0.1","localhost"].includes(process.env.PGHOST)||process.env.PGDATABASE!=="store_member_order_test")
  throw new Error("disposable_loopback_pending_resolution_database_required");
const a=new pg.Client(),b=new pg.Client(),observer=new pg.Client();
await Promise.all([a.connect(),b.connect(),observer.connect()]);
try {
  const {rows:[fixture]}=await observer.query(`select o.*,m.id actor,m.user_id actor_user from store_orders o
    join company_members m on m.company_id=o.company_id and m.status='active' and coalesce(m.permission_role,m.role) in ('owner','manager')
    join app_users u on u.id=m.user_id and u.status='active' where o.delivery_confirmation='scheduled'
    and exists(select 1 from store_order_delivery_resolutions_09 r where r.company_id=o.company_id and r.order_id=o.id and r.action='confirm') limit 1`);
  assert.ok(fixture);
  const {rows:[fresh]}=await observer.query(`insert into store_orders(company_id,customer_id,link_id,document_version_id,delivery_date,delivery_confirmation,idempotency_key,store_account_id,ordered_by_member_id,known_total)
    values($1,$2,$3,$4,null,'pending',gen_random_uuid(),$5,$6,$7) returning id,revision`,[fixture.company_id,fixture.customer_id,fixture.link_id,fixture.document_version_id,fixture.store_account_id,fixture.ordered_by_member_id,fixture.known_total]);
  const {rows:[keys]}=await observer.query("select gen_random_uuid() request_one,gen_random_uuid() request_two,((clock_timestamp() at time zone 'Asia/Seoul')::date+1)::text delivery_day");
  const call="select resolve_pending_order_delivery_09($1,$2,$3,$4,$5,$6,$7,$8) result";
  const common=[fixture.company_id,fresh.id,fixture.actor,fixture.actor_user];
  await a.query("begin");await a.query("set local role service_role");await b.query("set role service_role");
  const first=await a.query(call,[...common,keys.request_one,fresh.revision,keys.delivery_day,"confirm"]);
  const competing=b.query(call,[...common,keys.request_two,fresh.revision,null,"cancel"]).then(()=>null,e=>e);
  let blocked=false;
  for(let i=0;i<80;i++) {
    const {rows:[state]}=await observer.query("select wait_event_type from pg_stat_activity where pid=$1",[b.processID]);
    if(state?.wait_event_type==="Lock"){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.ok(blocked,"competing resolution must wait for the same order row");
  await a.query("commit");
  const error=await competing;assert.match(error?.message||"",/pending_confirmation_revision_conflict/);
  const replay=await b.query(call,[...common,keys.request_one,fresh.revision,keys.delivery_day,"confirm"]);
  assert.deepEqual(first.rows[0].result,replay.rows[0].result);
  const {rows:[after]}=await observer.query("select status,revision,delivery_confirmation,known_total,(select count(*)::int from store_order_delivery_resolutions_09 where order_id=$1) audits from store_orders where id=$1",[fresh.id]);
  assert.equal(after.status,"submitted");assert.equal(after.revision,fresh.revision+1);assert.equal(after.delivery_confirmation,"scheduled");assert.equal(after.audits,1);
  assert.equal(String(after.known_total),String(fixture.known_total));
  console.log("pending_resolution_concurrency_pass");
} finally {
  await a.query("rollback").catch(()=>{});
  await Promise.allSettled([a.end(),b.end(),observer.end()]);
}
