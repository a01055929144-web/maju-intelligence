import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';

assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'store_member_order_test_cx08');
const pending=readFileSync('docs/sql-drafts/20261110-09-pending-delivery-order.sql','utf8');
assert.match(pending,/SUPERSEDED[\s\S]*DO NOT APPLY/);
assert.doesNotMatch(pending,/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?place_store_(?:member_)?order\s*\(/i);
assert(!readFileSync('app/api/storefront/route.ts','utf8').includes('rpc/place_store_pending_delivery_order'));
const up='docs/sql-drafts/20261110-CX-08-promotion-reservation.sql';
const down='docs/sql-drafts/20261110-CX-08-promotion-reservation.down.sql';
const oldPredicate="and so.status = 'submitted' and so.id <> v_order.id;";
const newPredicate="and so.status <> 'cancelled' and so.id <> v_order.id;";
const apply=file=>spawnSync('psql',['--set=ON_ERROR_STOP=1',`--file=${file}`],{encoding:'utf8',env:process.env});
const a=new Client(),b=new Client();await a.connect();await b.connect();
const promo='c0080000-0000-4000-8000-000000000001';
const clean=()=>a.query('delete from store_order_requests;delete from store_order_lines;delete from store_orders');
const place=(connection,mode,client)=>connection.query('select public.cx08_place($1,$2) result',[mode,client]).then(r=>r.rows[0].result);
const definitions=()=>a.query(`select oid::text,proacl::text,prosecdef,pg_get_functiondef(oid) definition from pg_proc where oid in
 ('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
 'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure) order by oid`);
try{
 assert.equal((await a.query('select current_database() db')).rows[0].db,'store_member_order_test_cx08');
 assert.equal((await a.query('show server_version_num')).rows[0].server_version_num.slice(0,2),'17');
 const before=(await definitions()).rows;
 const duplicate=apply(up);assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/cx08_definition_changed_or_already_applied/);
 assert.deepEqual((await definitions()).rows,before);
 const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid;
 const pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 await b.query('set role service_role');
 for(const [first,second] of [['legacy','legacy'],['member','member'],['legacy','member'],['member','legacy']]){
  await clean();await a.query('update pricing_promotions set stock=2,per_store_limit=null where id=$1',[promo]);
  await a.query('set role service_role');const baseline=await place(a,'member',1);await a.query('reset role');
  await a.query("update store_orders set status='delivered' where id=$1",[baseline.id]);
  const refused=apply(down);assert.notEqual(refused.status,0);assert.match(refused.stderr,/cx08_down_refused_advanced_promotion_orders/);
  assert.deepEqual((await definitions()).rows,before);
  await a.query('begin');await a.query('set local role service_role');
  const accepted=await place(a,first,1);await a.query('reset role');
  const last=place(b,second,2).then(result=>({result}),error=>({error:error.message}));
  let waiting=false;const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   const result=await a.query("select wait_event_type='Lock' and $2=any(pg_blocking_pids(pid)) waiting from pg_stat_activity where pid=$1",[pidB,pidA]);
   if(result.rows[0]?.waiting){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,true,`${first}/${second}: different store links must wait on the shared promotion`);
  assert.equal((await a.query("select exists(select from pg_locks where pid=$1 and relation='public.pricing_promotions'::regclass and mode='RowShareLock') held",[pidA])).rows[0].held,true);
  // Confirmed orders must still consume stock after the waiter resumes.
  await a.query("update store_orders set status='received' where id=$1",[accepted.id]);await a.query('commit');
  assert.match((await last).error||'',/Promotion unavailable/);
  const total=(await a.query("select sum(sl.quantity) quantity,count(distinct so.id) orders from store_order_lines sl join store_orders so on so.company_id=sl.company_id and so.id=sl.order_id where sl.promotion_id=$1 and so.status<>'cancelled'",[promo])).rows[0];
  assert.equal(Number(total.quantity),2);assert.equal(Number(total.orders),2);
  console.log(`cx08_promotion_lock_${first}_${second}_received_and_delivered_no_oversell_pg17_pass`);
 }
 await clean();const restored=apply(down);assert.equal(restored.status,0,restored.stderr);
 const after=(await definitions()).rows;
 assert.deepEqual(after,before.map(row=>({...row,definition:row.definition.replace(newPredicate,oldPredicate)})));
 console.log('cx08_down_guard_exact_restore_and_pending_draft_no_native_redefinition_pg17_pass');
}finally{
 await a.query('rollback').catch(()=>{});await a.end();await b.end();
}
