import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { completeOrderDelivery } from "../../application/delivery/complete-order-delivery";

const companyId = "00000000-0000-4000-8000-000000000001";
const otherCompanyId = "00000000-0000-4000-8000-000000000002";
const customerId = "20000000-0000-4000-8000-000000000001";
const otherCustomerId = "20000000-0000-4000-8000-000000000002";
const noteId = "a1000000-0000-4000-8000-000000000001";
const attachmentIds = ["a2000000-0000-4000-8000-000000000001", "a2000000-0000-4000-8000-000000000002"];
const deliveryDate = "2099-01-05";
const actor = { actorKey: "fixture-verified-driver", companyId, driverKeys: ["fixture-driver"], vehicleKeys: ["1호차"] };

function token(secret: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

describe.runIf(process.env.STAGE_D_COMPLETION_INTEGRATION === "isolated")("Stage D application -> PostgREST -> PG17", () => {
  it("commits one proof-bound completion and preserves its idempotent boundary", async () => {
    const manifestLine = readFileSync(process.env.STAGE_D_FIXTURE_MANIFEST!, "utf8").split(/\r?\n/).find((line) => line.startsWith("delivery_completion_09_fixture_manifest="));
    expect(manifestLine).toBeTruthy();
    const manifest = JSON.parse(manifestLine!.slice("delivery_completion_09_fixture_manifest=".length)) as {
      command: Parameters<typeof completeOrderDelivery>[0];
      countsAfterSuccessOrReplay: { attachmentRelations: number; events: number; orderRelations: number; orders: number };
      negativeReferences: { otherCustomerAttachmentId: string };
    };
    const baseUrl = process.env.STAGE_D_POSTGREST_URL!;
    const jwt = token(process.env.PGRST_JWT_SECRET!);
    const headers = { apikey: jwt, authorization: `Bearer ${jwt}`, "content-type": "application/json" };
    const rest = async <T>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${baseUrl}/${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || value.details || `PostgREST ${response.status}`);
      return value as T;
    };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await fetch(`${baseUrl}/`, { headers })).ok) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const db = new Client();
    await db.connect();
    try {
      await db.query("update normalized_customers set delivery_manager=$1,delivery_vehicle=$2 where company_id=$3 and id=$4", ["fixture-driver", "1호차", companyId, customerId]);
      await db.query("insert into route_plan_confirmations(company_id,driver_name,route_date,customer_ids) values($1,$2,$3,$4::jsonb)", [companyId, "fixture-driver", deliveryDate, JSON.stringify([customerId])]);
      await db.query("notify pgrst,'reload schema'");
      const command = manifest.command;
      const eventId = command.completionEventId;

      const first = await completeOrderDelivery(command, actor, rest);
      const retry = await completeOrderDelivery({ ...command, proof: { noteId, attachmentIds: [...attachmentIds].reverse() } }, actor, rest);
      expect(retry).toEqual(first);
      await expect(completeOrderDelivery({ ...command, proof: { noteId, attachmentIds: [attachmentIds[0]] } }, actor, rest)).rejects.toThrow("기존 완료 정보와 다릅니다");
      await expect(completeOrderDelivery({ ...command, proof: { noteId, attachmentIds: [manifest.negativeReferences.otherCustomerAttachmentId] } }, actor, rest)).rejects.toThrow();
      await expect(completeOrderDelivery({ ...command, companyId: otherCompanyId }, { ...actor, companyId: otherCompanyId }, rest)).rejects.toThrow();
      await expect(completeOrderDelivery({ ...command, customerId: otherCustomerId }, actor, rest)).rejects.toThrow();

      const state = await db.query("select status,revision from store_orders where id=any($1::uuid[]) order by id", [command.orders.map((order) => order.orderId)]);
      expect(state.rows).toEqual(command.orders.map(() => ({ status: "delivered", revision: 2 })));
      const links = await db.query("select (select count(*)::integer from store_orders) orders,(select count(*)::integer from store_order_delivery_completions_09 where completion_event_id=$1) events,(select count(*)::integer from store_order_delivery_completion_orders_09 where completion_event_id=$1) \"orderRelations\",(select count(*)::integer from store_order_delivery_completion_attachments_09 where completion_event_id=$1) \"attachmentRelations\"", [eventId]);
      expect(links.rows).toEqual([manifest.countsAfterSuccessOrReplay]);
      await expect(db.query("delete from customer_notes where id=$1", [noteId])).rejects.toThrow();
      await expect(db.query("delete from customer_attachments where id=$1", [attachmentIds[0]])).rejects.toThrow();
    } finally {
      await db.end();
    }
  }, 30_000);
});
