import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("contact record void (11/3)", () => {
  const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
  it("hides voided records from the ledger and lead history", () => {
    expect(store).toContain("&voided_at=is.null&or=");
    expect(store).toContain("select=id,action_type,result,memo,actor_name,created_at&voided_at=is.null");
  });
  it("voids through the RPC instead of deleting", () => {
    expect(store).toContain('"rpc/void_lead_action_v1"');
    const sql = readFileSync(resolve(process.cwd(), "docs/db-approval/20261103_lead_action_void.sql"), "utf8");
    expect(sql).not.toMatch(/delete from public\.lead_actions/i);
  });
});
