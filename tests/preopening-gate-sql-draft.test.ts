import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { activatePreopeningStoreOwner } from "../lib/store/07-store-owner-provisioning";

const draft = fs.readFileSync(path.join(process.cwd(), "docs/sql-drafts/20261117-S-3d-preopening-gate.sql"), "utf8");
const down = fs.readFileSync(path.join(process.cwd(), "docs/sql-drafts/20261117-S-3d-preopening-gate.down.sql"), "utf8");

beforeEach(() => mocks.db.mockReset());

describe("S-3d preopening gate draft", () => {
  it("accepts only a company-prepared token and keeps the company/customer boundary", () => {
    expect(draft).toContain("prepared_by_company_member_id is not null");
    expect(draft).toContain("public_idempotency_key is null");
    expect(draft).toContain("customer_id is not null");
    expect(draft).toContain("company_id=r.company_id and id=r.customer_id");
    expect(draft).toContain("company_id=r.company_id and id=p_delivery_territory_id");
    expect(draft).toContain("provision_store_owner_v1(r.company_id,r.store_account_id,p_auth_user_id,r.prepared_by_company_member_id)");
    expect(draft).not.toContain("insert into public.customer_imports");
    expect(draft).not.toContain("insert into public.normalized_customers");
  });

  it("is service-only, consumes the token once and leaves normal signup untouched", () => {
    expect(draft).toContain("consumed_at is null and cancelled_at is null");
    expect(draft).toContain("set consumed_at=clock_timestamp()");
    expect(draft).toContain("from public,anon,authenticated,service_role");
    expect(draft).toContain("to service_role");
    expect(draft).not.toContain("activate_store_owner_v1(");
  });

  it("has an explicit rollback to the prior public preopening behavior", () => {
    expect(down).toContain("public_idempotency_key is not null");
    expect(down).toContain("insert into public.customer_imports");
    expect(down).toContain("insert into public.normalized_customers");
  });

  it("sends only the hashed company-issued proof to the activation RPC", async () => {
    mocks.db.mockResolvedValue({ companyId: "company", storeAccountId: "store" });
    await activatePreopeningStoreOwner({
      authUserId: "user", termsAcceptedAt: "2026-11-17T12:00:00.000Z", token: "company-issued-token"
    });
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/activate_preopening_store_owner_v1");
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("company-issued-token");
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
});
