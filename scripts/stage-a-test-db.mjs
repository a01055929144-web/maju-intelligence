import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
assert.equal(process.env.STAGE_A_INTEGRATION, 'isolated');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'maju_stage_a_integration');
const company = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const supplier = '30000000-0000-4000-8000-000000000001';
const uuid = (prefix,n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const testDate = process.env.STAGE_A_TEST_DATE || new Date().toISOString().slice(0,10);
const priorDate = new Date(Date.parse(testDate+'T00:00:00Z')-172800000).toISOString().slice(0,10);
const db = new Client(); await db.connect();
try {
  assert.equal((await db.query('select current_database() name')).rows[0].name, 'maju_stage_a_integration');
  const action = process.argv[2];
  if (action === 'seed') {
    const count = Number(process.argv[3]); assert([0,741].includes(count));
    await db.query('truncate public.companies cascade; truncate public.stage_a_failure_control');
    await db.query(`insert into companies(id,name,owner_name,status) values($1,'CI Stage A','CI Owner','active'),($2,'CI Other','CI Other Owner','active')`, [company,other]);
    await db.query(`insert into product_suppliers(id,company_id,name) values($1,$2,'합성 매입처')`, [supplier,company]);
    await db.query('insert into stage_a_failure_control(company_id,fail_recalculation) values($1,false)',[company]);
    const records = Array.from({length:count},(_,i)=>({ id:uuid('2',i+1),sp:uuid('4',i+1),code:`ERP-${String(i+1).padStart(4,'0')}`,name:`합성 기존 품목 ${i+1}`,unit:['EA','BOX','봉','병'][i%4] }));
    await db.query(`insert into product_catalog(id,company_id,source,source_key,product_code,canonical_name,purchase_product_name,
      purchase_spec,purchase_unit,sales_unit,purchase_price,purchase_price_date,spec_value,spec_unit,category,created_at)
      select r.id::uuid,$1,'manual',r.code,r.code,r.name,r.name,'1kg',r.unit,r.unit,100,$3::date,1,'kg','검증',now()-interval '60 days'
      from jsonb_to_recordset($2::jsonb) r(id text,code text,name text,unit text)`, [company,JSON.stringify(records),priorDate]);
    await db.query(`insert into supplier_products(id,company_id,supplier_id,supplier_code,source_fingerprint,raw_name,raw_spec,raw_unit,
      parsed_name,parsed_spec_value,parsed_spec_unit,latest_cost,cost_confirmed,last_seen_date)
      select r.sp::uuid,$1,$2,r.code,'seed:'||r.code,r.name,'1kg',r.unit,r.name,1,'kg',100,true,$4::date
      from jsonb_to_recordset($3::jsonb) r(sp text,code text,name text,unit text)`,[company,supplier,JSON.stringify(records),priorDate]);
    await db.query(`insert into supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status,match_score,purchase_to_sales_ratio,conversion_confirmed)
      select $1,r.sp::uuid,r.id::uuid,'confirmed',100,1,true from jsonb_to_recordset($2::jsonb) r(sp text,id text)`,[company,JSON.stringify(records)]);
    await db.query(`insert into product_catalog(id,company_id,purchase_product_name,canonical_name,purchase_price,purchase_price_date,sales_unit)
      values($1,$2,'CI Other Sentinel','CI Other Sentinel',999,$3::date,'EA')`,[uuid('2',999999),other,priorDate]);
    await db.query(`insert into auth_credentials(id,customer_email,customer_password,customer_company_id,admin_email,admin_password)
      values('maju-default','ci-owner@example.test','ci-stage-a-owner-password-2026',$1,'ci-admin@example.test','ci-stage-a-admin-password-2026')
      on conflict(id) do update set customer_password=excluded.customer_password,customer_company_id=excluded.customer_company_id`,[company]);
    console.log(JSON.stringify({seededExisting:count,otherCompanySentinel:true}));
  } else if (action === 'fail-on' || action === 'fail-off') {
    await db.query('update stage_a_failure_control set fail_recalculation=$2 where company_id=$1',[company,action==='fail-on']);
    console.log(JSON.stringify({failureEnabled:action==='fail-on'}));
  } else if (action === 'state') {
    const counts = (await db.query(`select
      (select count(*)::int from product_catalog where company_id=$1) products_count,
      (select count(*)::int from product_catalog where company_id=$1 and purchase_price=0) unpriced,
      (select count(*)::int from purchase_receipt_lines where company_id=$1) receipts,
      (select count(*)::int from purchase_cost_date_batches_v2 where company_id=$1) batches,
      (select count(*)::int from price_recalc_runs where company_id=$1) price_runs,
      (select count(*)::int from purchase_receipt_correction_events where company_id=$1) corrections,
      (select purchase_price from product_catalog where company_id=$2 limit 1) other_cost`,[company,other])).rows[0];
    const batch = (await db.query('select id,status,row_count,history_only_product_count,recalc_run_id from purchase_cost_date_batches_v2 where company_id=$1 order by created_at desc,id desc limit 1',[company])).rows[0] || null;
    const products = (await db.query(`select sp.supplier_code code,c.id,c.purchase_price cost,c.purchase_price_date::text date,c.purchase_unit,c.sales_unit,c.purchase_to_sales_ratio ratio,
      coalesce(pi.price,0) price from product_catalog c join supplier_product_matches m on m.company_id=c.company_id and m.product_catalog_id=c.id
      join supplier_products sp on sp.company_id=m.company_id and sp.id=m.supplier_product_id
      left join pricing_items pi on pi.company_id=c.company_id and pi.product_id=c.id where c.company_id=$1 order by sp.supplier_code`,[company])).rows;
    console.log(JSON.stringify({...counts,batch,items:products}));
  } else if (action === 'verify-source') {
    const expected = JSON.parse(readFileSync(0,'utf8'));
    const rows = (await db.query(`select source_row_number,receipt_date::text,erp_code,quantity,unit_price,unit_cost_ex_vat,supply_amount,vat_amount,total_amount,raw_values,unit
      from purchase_receipt_lines where company_id=$1 order by source_row_number`,[company])).rows;
    assert.equal(rows.length,3417);
    rows.forEach((row,i)=>{
      const value=expected[i]; assert.equal(row.source_row_number,i+2); assert.equal(row.receipt_date,testDate);
      assert.equal(row.erp_code,value[0]); assert.equal(Number(row.unit_price),value[5]);
      assert.equal(Number(row.quantity),value[6]); assert.equal(Number(row.supply_amount),value[7]);
      assert.equal(Number(row.vat_amount),value[8]); assert.equal(Number(row.total_amount),value[9]);
      assert.deepEqual(row.raw_values,value.map(String)); assert.equal(row.unit ?? '',value[3]);
    });
    console.log(JSON.stringify({verifiedOriginalRows:rows.length,allRawValuesAndAmountsPreserved:true}));
  } else throw new Error('Unsupported isolated test operation');
} finally { await db.end(); }
