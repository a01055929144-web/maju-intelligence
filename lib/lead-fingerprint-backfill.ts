import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { planLeadFingerprintBackfill } from "@/domains/lead/fingerprint-backfill";

type BackfillRow = {
  id: string;
  business_name: string;
  business_number: string | null;
  address: string | null;
};

export type LeadFingerprintBackfillPageInput = {
  companyId: string;
  batchId?: string;
  cursor?: string;
  limit?: number;
};

function getConnectionString() {
  const value = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!value) throw new Error("운영 DB 연결 정보가 없습니다.");
  return value;
}

export async function backfillLeadFingerprintsPage(input: LeadFingerprintBackfillPageInput) {
  const batchId = input.batchId || randomUUID();
  const limit = Math.min(Math.max(Math.trunc(input.limit || 500), 1), 1000);
  const client = new Client({ connectionString: getConnectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const before = await client.query<{ empty: string; existing: string }>(
      `select count(*) filter(where canonical_fingerprint is null)::text as empty,
              count(*) filter(where canonical_fingerprint is not null)::text as existing
         from public.business_permit_leads where company_id=$1`,
      [input.companyId]
    );
    const page = await client.query<BackfillRow>(
      `select id,business_name,business_number,address
         from public.business_permit_leads
        where company_id=$1 and canonical_fingerprint is null
          and ($2::uuid is null or id>$2::uuid)
        order by id asc limit $3`,
      [input.companyId, input.cursor || null, limit]
    );
    const plan = planLeadFingerprintBackfill(page.rows.map((row) => ({
      id: row.id,
      businessName: row.business_name,
      businessNumber: row.business_number,
      address: row.address
    })));

    let filled = 0;
    if (plan.fillable.length) {
      await client.query("begin");
      try {
        const result = await client.query<{ id: string }>(
          `with input_rows as (
             select * from jsonb_to_recordset($3::jsonb) as row(id uuid,fingerprint text)
           ), updated as (
             update public.business_permit_leads lead
                set canonical_fingerprint=input_rows.fingerprint
               from input_rows
              where lead.company_id=$1 and lead.id=input_rows.id
                and lead.canonical_fingerprint is null
             returning lead.id,lead.company_id,lead.canonical_fingerprint
           )
           insert into public.lead_fingerprint_backfill_log(batch_id,company_id,lead_id,fingerprint)
           select $2,company_id,id,canonical_fingerprint from updated
           returning lead_id as id`,
          [input.companyId, batchId, JSON.stringify(plan.fillable)]
        );
        filled = result.rowCount || 0;
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const nextCursor = page.rows.at(-1)?.id || input.cursor || null;
    return {
      batchId,
      companyId: input.companyId,
      scanned: page.rows.length,
      filled,
      unfillable: plan.unfillableIds.length,
      unfillableIds: plan.unfillableIds,
      existingBefore: Number(before.rows[0]?.existing || 0),
      emptyBefore: Number(before.rows[0]?.empty || 0),
      nextCursor,
      done: page.rows.length < limit
    };
  } finally {
    await client.end();
  }
}
