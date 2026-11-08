import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { Client } from "pg";

assert.equal(process.env.STAGE_A_INTEGRATION, "isolated");
assert.equal(process.env.PGHOST, "127.0.0.1");
assert.equal(process.env.PGDATABASE, "maju_stage_a_integration");
assert(process.env.GITHUB_ENV);
assert(process.env.PGRST_JWT_SECRET);

const companyA = "00000000-0000-4000-8000-0000000000a1";
const companyB = "00000000-0000-4000-8000-0000000000b2";
const sql = (path) => readFileSync(path, "utf8");
const db = new Client();
await db.connect();
try {
  await db.query(`
    create table public.delivery_territories (
      id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
      unique (company_id, id)
    );
    create table public.customer_price_agreements (
      id uuid primary key, company_id uuid not null, customer_id uuid not null,
      product_catalog_id uuid not null, sales_unit text not null, unit_price bigint not null,
      tax_type text not null, price_includes_tax boolean not null default false,
      status text not null, effective_from date not null, effective_until date
    );
    create table public.business_documents (
      id uuid primary key, company_id uuid not null, customer_id uuid not null,
      document_date date not null, document_type text not null, status text not null
    );
    create table public.business_document_lines (
      id uuid primary key, company_id uuid not null, document_id uuid not null,
      product_catalog_id uuid, unit_price bigint not null
    );
  `);
  await db.query(sql("supabase/migrations/20261102114602_pricing_p2_store_ordering.sql"));
  await db.query(`
    grant usage on schema public to service_role;
    grant select on all tables in schema public to service_role;

    insert into companies(id,name) values ('${companyA}','Stage F A'),('${companyB}','Stage F B');
    insert into customer_imports(id,company_id,status,quality_score,duplicate_count)
      select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${companyA}','failed',100,0 from generate_series(1,25) n;
    insert into customer_imports(id,company_id,status,quality_score,duplicate_count) values
      ('20000000-0000-4000-8000-000000000001','${companyB}','failed',100,0);

    insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit,tax_type,is_active) values
      ('30000000-0000-4000-8000-000000000001','${companyA}','A 품목',100,null,'taxable',true),
      ('30000000-0000-4000-8000-000000000002','${companyB}','B 품목',100,null,'taxable',true);
    insert into product_suppliers(id,company_id,name) values
      ('40000000-0000-4000-8000-000000000001','${companyA}','A 공급처'),
      ('40000000-0000-4000-8000-000000000002','${companyB}','B 공급처');
    insert into supplier_products(id,company_id,supplier_id,source_fingerprint,raw_name,is_active) values
      ('50000000-0000-4000-8000-000000000001','${companyA}','40000000-0000-4000-8000-000000000001','a-unmatched','A 미연결',true),
      ('50000000-0000-4000-8000-000000000002','${companyA}','40000000-0000-4000-8000-000000000001','a-unconfirmed','A 환산미확인',true),
      ('50000000-0000-4000-8000-000000000003','${companyB}','40000000-0000-4000-8000-000000000002','b-unmatched','B 미연결',true);
    insert into supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status,match_score,conversion_confirmed) values
      ('${companyA}','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','confirmed',100,false);

    insert into normalized_customers(id,company_id,import_id,customer_name) values
      ('60000000-0000-4000-8000-000000000001','${companyA}','10000000-0000-4000-8000-000000000001','A 매장'),
      ('60000000-0000-4000-8000-000000000002','${companyB}','20000000-0000-4000-8000-000000000001','B 매장');
    insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values
      ('70000000-0000-4000-8000-000000000001','${companyA}',repeat('a',64),'sheet',1,'{}'),
      ('70000000-0000-4000-8000-000000000002','${companyB}',repeat('b',64),'sheet',1,'{}');
    insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values
      ('80000000-0000-4000-8000-000000000001','${companyA}','70000000-0000-4000-8000-000000000001',1,1,'{}'),
      ('80000000-0000-4000-8000-000000000002','${companyB}','70000000-0000-4000-8000-000000000002',1,1,'{}');
    insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at,revoked_at,can_order) values
      ('90000000-0000-4000-8000-000000000001','${companyA}','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',repeat('1',32),repeat('1',64),now()+interval '1 day',now(),true),
      ('90000000-0000-4000-8000-000000000002','${companyB}','60000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002',repeat('2',32),repeat('2',64),now()+interval '1 day',now(),true);
  `);
} finally {
  await db.end();
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const header = encode({ alg: "HS256", typ: "JWT" });
const payload = encode({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 });
const signature = createHmac("sha256", process.env.PGRST_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
appendFileSync(process.env.GITHUB_ENV, `SUPABASE_SERVICE_ROLE_KEY=${header}.${payload}.${signature}\n`);
console.log(JSON.stringify({ companyA, companyB, operatingDatabase: false, pgMajor: 17 }));
