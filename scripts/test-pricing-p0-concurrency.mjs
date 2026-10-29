import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
export async function checkConcurrency(connectionString) {
  const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString }));
  await Promise.all(clients.map(c => c.connect()));
  const [a,b,c] = clients;
  const company='00000000-0000-4000-8000-000000000011';
  const product='10000000-0000-4000-8000-000000000011';
  try {
    await a.query('insert into companies values($1)',[company]);
    await a.query("insert into product_catalog(id,company_id,purchase_product_name,purchase_price) values($1,$2,'concurrency fixture',800)",[product,company]);
    await a.query('select pricing_p0_command($1,$2)',[company,{ action:'group', name:'concurrency', margin:20, rounding:10 }]);
    const group=(await a.query('select id from margin_groups where company_id=$1',[company])).rows[0].id;
    await a.query('select pricing_p0_command($1,$2)',[company,{ action:'assign', productId:product, groupId:group }]);
    await a.query('begin');
    await a.query('select 1 from product_catalog where company_id=$1 for update',[company]);
    const pending=b.query('select pricing_p0_command($1,$2)',[company,{ action:'recalculate' }]);
    await delay(100);
    await a.query('update product_catalog set purchase_price=880 where company_id=$1',[company]);
    await a.query('commit');
    await pending;
    const price=(await a.query('select price,applied_cost from pricing_items where company_id=$1',[company])).rows[0];
    if (Number(price.price)!==1060 || Number(price.applied_cost)!==880) throw new Error('Concurrent cost not captured');
    await a.query('update product_catalog set purchase_price=960 where company_id=$1',[company]);
    await Promise.all([b,c].map(client => client.query('select pricing_p0_command($1,$2)',[company,{ action:'recalculate' }])));
    const runs=(await a.query('select count(*) from price_recalc_runs where company_id=$1',[company])).rows[0];
    if (Number(runs.count)!==2) throw new Error('Duplicate concurrent recalculation');
    const latest=(await a.query('select id from price_recalc_runs where company_id=$1 order by created_at desc,id desc limit 1',[company])).rows[0].id;
    await Promise.all([b,c].map(client => client.query('select pricing_p0_command($1,$2)',[company,{ action:'restore',batchId:latest }])));
    if (Number((await a.query('select price from pricing_items where company_id=$1',[company])).rows[0].price)!==1060) throw new Error('Concurrent restore');
    console.log('PASS PostgreSQL16 concurrency: cost-update lock, duplicate recalculate, duplicate restore');
  } finally {
    await a.query('rollback');
    await a.query('delete from companies where id=$1',[company]);
    await Promise.all(clients.map(client => client.end()));
  }
}
