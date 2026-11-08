import { createHmac, randomUUID } from "node:crypto";
import { Client, types } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { toOrderDeliveryCandidates } from "../../application/delivery/store-order-delivery-adapter";
import type { StoreOrderDeliveryRow } from "../../application/delivery/store-order-delivery-adapter";

const mocks = vi.hoisted(() => ({ read: vi.fn(), rest: vi.fn() }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.rest }));
vi.mock("@/lib/auth", () => ({ storeMemberSessionEnabled: () => true }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: vi.fn() }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: () => true }));
vi.mock("@/lib/pricing/store-order-member", () => ({ getStoreOrderActor: async () => ({
  storeAccountId: "30000000-0000-4000-8000-000000000001", memberId: "40000000-0000-4000-8000-000000000001", authUserId: "50000000-0000-4000-8000-000000000001",
}) }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/lib/pricing/storefront", () => ({ readStorefront: mocks.read }));
vi.mock("@/lib/pricing/storefront-public", () => ({ toPublicStorefront: vi.fn() }));
vi.mock("@/lib/pricing/store-link-token", () => ({ verifyStoreLinkToken: () => ({ hash: "a".repeat(64) }) }));
vi.mock("@/lib/pricing/store-order-delivery-feature", () => import("../../lib/pricing/store-order-delivery-feature"));
vi.mock("@/lib/pricing/store-order-delivery-producer", () => import("../../lib/pricing/store-order-delivery-producer"));
vi.mock("@/domains/pricing/document", () => import("../../domains/pricing/document"));
import { PUT } from "../../app/api/storefront/route";
types.setTypeParser(1082, value => value);

const companyId = "00000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const origin = "https://store.example.test";
const base = { token: "fixture-signed-link", deliveryDate: "2099-01-05", memo: "",
  lines: [{ productId: "60000000-0000-4000-8000-000000000001", quantity: 1 }] };
const put = (patch: Record<string, unknown>) => PUT(new NextRequest(origin + "/api/storefront",
  { method: "PUT", headers: { origin }, body: JSON.stringify({ ...base, ...patch }) }));
afterEach(() => vi.unstubAllEnvs());

describe.runIf(process.env.ORDER_PRODUCER_INTEGRATION === "isolated")("09 PUT -> producer -> PostgREST -> PG17", () => {
  it("returns the 02 DTO and preserves OFF, stored snapshots, revisions and idempotent writes", async () => {
    const target = new URL(process.env.ORDER_PRODUCER_POSTGREST_URL || "");
    if (target.origin !== "http://127.0.0.1:3003" || process.env.PGHOST !== "127.0.0.1" ||
      process.env.PGDATABASE !== "store_member_order_test_delivery_09_api") throw new Error("isolated_order_producer_target_required");
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 });
    const jwt = unsigned + "." + createHmac("sha256", process.env.PGRST_JWT_SECRET!).update(unsigned).digest("base64url");
    const headers = { authorization: "Bearer " + jwt, "content-type": "application/json" };
    let ready = false;
    for (let n = 0; n < 30; n += 1) {
      ready = await fetch(target.origin, { headers }).then(r => r.ok).catch(() => false);
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    expect(ready).toBe(true);
    let loseResponseKey: string | null = null;
    mocks.rest.mockImplementation(async (path: string, init?: RequestInit) => {
      const response = await fetch(target.origin + "/" + path, { ...init, headers });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || "postgrest_error");
      if (loseResponseKey && path === "rpc/place_store_order_with_delivery_snapshot_09" &&
        JSON.parse(String(init?.body)).p_idempotency_key === loseResponseKey) {
        loseResponseKey = null;
        throw new Error("fixture_committed_response_lost");
      }
      return value;
    });
    const db = new Client();
    await db.connect();
    try {
      expect(Number((await db.query("show server_version_num")).rows[0].server_version_num)).toBeGreaterThanOrEqual(170000);
      mocks.read.mockImplementation(async () => {
        const row = (await db.query("select customer_name,address from normalized_customers where company_id=$1 and id=$2", [companyId, customerId])).rows[0];
        return { companyId, customerId, linkId: "90000000-0000-4000-8000-000000000001", customerName: row.customer_name, deliveryAddress: row.address };
      });
      vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", companyId);
      vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "");
      const off = await put({ idempotencyKey: randomUUID() });
      expect(off.status).toBe(200);
      const offBody = await off.json();
      expect(offBody).not.toHaveProperty("delivery");
      expect((await db.query("select delivery_address_snapshot from store_orders where id=$1", [offBody.result.id])).rows[0].delivery_address_snapshot).toBeNull();

      vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true");
      const key = randomUUID();
      const first = await put({ idempotencyKey: key, companyId: "forged", memberId: "forged", knownTotal: 1 });
      expect(first.status).toBe(200);
      const placed = await first.json();
      const stored = (await db.query<StoreOrderDeliveryRow>("select * from store_orders where id=$1", [placed.result.id])).rows[0];
      expect(placed.delivery).toEqual(toOrderDeliveryCandidates([stored]).candidates[0]);
      expect(placed.delivery.orderId).toBe(placed.result.id);
      expect(placed.delivery.orderRevision).toBe(placed.result.revision);
      expect(placed.delivery.destination.address).toBe("synthetic delivery address");
      expect(placed.result.knownTotal).toBe(1200);
      const author = (await db.query("select ordered_by_member_id from store_orders where id=$1", [placed.result.id])).rows[0];
      expect(author.ordered_by_member_id).toBe("40000000-0000-4000-8000-000000000001");

      // Simulate a committed response being lost, then the customer master changing before retry.
      await db.query("update normalized_customers set customer_name='changed master',address='changed address' where id=$1", [customerId]);
      expect(await (await put({ idempotencyKey: key })).json()).toEqual(placed);
      const conflict = await put({ idempotencyKey: key, deliverySnapshot: {
        deliveryCustomerNameSnapshot: "synthetic store", deliveryAddressSnapshot: "changed address" } });
      expect(conflict.status).toBe(409);

      const edited = await put({ idempotencyKey: randomUUID(), orderId: placed.result.id, expectedRevision: 1, deliveryDate: "2099-01-06" });
      expect(edited.status).toBe(200);
      const editBody = await edited.json();
      expect(editBody.delivery.orderId).toBe(placed.result.id);
      expect(editBody.delivery.orderRevision).toBe(2);
      expect(editBody.delivery.deliveryDate).toBe("2099-01-06");
      const editRow = (await db.query<StoreOrderDeliveryRow>("select * from store_orders where id=$1", [placed.result.id])).rows[0];
      expect(editBody.delivery).toEqual(toOrderDeliveryCandidates([editRow]).candidates[0]);
      expect(await (await put({ idempotencyKey: key })).json()).toEqual(placed);

      await db.query("update normalized_customers set customer_name='synthetic store',address='synthetic delivery address' where id=$1", [customerId]);
      const lostKey = randomUUID();
      loseResponseKey = lostKey;
      expect((await put({ idempotencyKey: lostKey })).status).toBe(409);
      const recovered = await put({ idempotencyKey: lostKey });
      expect(recovered.status).toBe(200);
      const recoveredBody = await recovered.json();
      expect((await db.query("select id from store_orders where company_id=$1 and idempotency_key=$2", [companyId, lostKey])).rows)
        .toEqual([{ id: recoveredBody.delivery.orderId }]);
      const raceKey = randomUUID();
      const [a, b] = await Promise.all([put({ idempotencyKey: raceKey }), put({ idempotencyKey: raceKey })]);
      expect(a.status).toBe(200); expect(b.status).toBe(200);
      expect(await a.json()).toEqual(await b.json());
      expect((await db.query("select count(*)::integer n from store_orders where company_id=$1 and idempotency_key=$2", [companyId, raceKey])).rows[0].n).toBe(1);
      expect((await db.query("select count(*)::integer n from store_order_delivery_requests_09 where company_id=$1 and idempotency_key=$2", [companyId, raceKey])).rows[0].n).toBe(1);
      const count = Number((await db.query("select count(*) n from store_orders")).rows[0].n);
      await db.query("update normalized_customers set address=null where id=$1", [customerId]);
      expect((await put({ idempotencyKey: randomUUID() })).status).toBe(400);
      expect(Number((await db.query("select count(*) n from store_orders")).rows[0].n)).toBe(count);
      console.log("order_producer_put_postgrest_pg17_snapshot_dto_revision_retry_off_pass");
    } finally {
      await db.end();
    }
  }, 30_000);
});
