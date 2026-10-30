import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contact refusal lookup privacy boundary", () => {
  it("keeps contact values out of the request URL and returns only masked values", () => {
    const store = readFileSync("lib/store.ts", "utf8");
    const lookup = store.split("export async function listActiveLeadDoNotContacts")[1]
      ?.split("export async function registerLeadDoNotContact")[0];
    const sql = readFileSync("docs/sql-drafts/lead-do-not-contact-rpc.sql", "utf8");

    expect(lookup).toContain('supabaseRequest<DncRow[]>("rpc/list_active_lead_do_not_contacts"');
    expect(lookup).toContain('method: "POST"');
    expect(lookup).not.toContain("normalized_value=eq.");
    expect(lookup).not.toContain("phone=");
    expect(lookup).not.toContain("email=");
    expect(lookup).not.toContain("normalized_value: string");
    expect(sql).toContain("public.mask_dnc_value(dnc.channel, dnc.normalized_value)");
    expect(sql).toContain("lead_row.company_id = p_company_id and lead_row.id = p_lead_id");
    expect(sql).toContain("revoke all on function public.list_active_lead_do_not_contacts(uuid,uuid) from public, anon, authenticated");
  });
});
