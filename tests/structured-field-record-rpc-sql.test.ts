import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261027-structured-field-record-rpc.sql", "utf8");

describe("structured field record RPC SQL draft", () => {
  it("keeps both RPCs invoker-only and grants execution only to service_role", () => {
    expect(sql.match(/security invoker/g)).toHaveLength(2);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(2);
    expect(sql).toMatch(/revoke all on function public\.record_delivery_event_atomic[\s\S]*from public, anon, authenticated;/i);
    expect(sql).toMatch(/revoke all on function public\.record_lead_sales_offer_atomic[\s\S]*from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant execute on function public\.record_delivery_event_atomic[\s\S]*to service_role;/i);
    expect(sql).toMatch(/grant execute on function public\.record_lead_sales_offer_atomic[\s\S]*to service_role;/i);
  });

  it("enforces tenant ownership for subjects and non-null actors", () => {
    expect(sql).toMatch(/normalized_customers where company_id = p_company_id and id = p_customer_id/i);
    expect(sql).toMatch(/business_permit_leads where company_id = p_company_id and id = p_lead_id/i);
    expect(sql.match(/select 1 from public\.company_members/g)).toHaveLength(2);
    expect(sql.match(/where company_id = p_company_id and user_id = p_actor_user_id and status = 'active'/g)).toHaveLength(2);
  });

  it("rejects explicit null item payloads before writing", () => {
    expect(sql).toMatch(/if p_items is null or jsonb_typeof\(p_items\) <> 'array' then raise exception 'items_must_be_array'/i);
    expect(sql).toMatch(/if p_items is null or jsonb_typeof\(p_items\) <> 'array' or jsonb_array_length\(p_items\) = 0 then/i);
  });

  it("backs advisory locking with durable database uniqueness", () => {
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql).toMatch(/create unique index if not exists uq_lead_actions_structured_idempotency/i);
    expect(sql).toMatch(/on public\.lead_actions\(company_id, lead_id, \(metadata->>'structuredIdempotencyKey'\)\)/i);
    expect(sql).toMatch(/where nullif\(metadata->>'structuredIdempotencyKey', ''\) is not null/i);
  });

  it("keeps delivery retries immutable and resolves completed events", () => {
    expect(sql).toMatch(/return jsonb_build_object\('noteId', v_note_id, 'eventId', v_event_id, 'replayed', true\)/i);
    expect(sql).toMatch(/on conflict \(company_id, customer_id, idempotency_key\) where idempotency_key is not null[\s\S]*do nothing/i);
    expect(sql).toMatch(/case when v_status = 'completed' then now\(\) else null end/i);
  });
});
