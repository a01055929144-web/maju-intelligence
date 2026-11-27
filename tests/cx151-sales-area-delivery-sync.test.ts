import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "docs/sql-drafts/2026-11-27-CX-151-sales-area-delivery-sync.sql"), "utf8");
const down = readFileSync(join(process.cwd(), "docs/sql-drafts/2026-11-27-CX-151-sales-area-delivery-sync.down.sql"), "utf8");
const route = readFileSync(join(process.cwd(), "app/api/leads/permits/keyword-search-regions/route.ts"), "utf8");
const component = readFileSync(join(process.cwd(), "components/sales-area-selector.tsx"), "utf8");

describe("CX-151 sales area delivery territory boundary", () => {
  it("keeps the RPC service-only and scoped by company", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("where company_id = p_company_id");
    expect(sql).toContain("revoke all on function public.sync_sales_areas_to_default_delivery_territory_v1(uuid) from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.sync_sales_areas_to_default_delivery_territory_v1(uuid) to service_role");
  });

  it("skips areas owned by another territory and preserves a reversible schema rollback", () => {
    expect(sql).toContain("not exists (\n        select 1 from public.delivery_territory_areas occupied");
    expect(sql).toContain("on conflict (company_id, administrative_area) do nothing");
    expect(down).toContain("drop column if exists delivery_disabled");
    expect(down).not.toContain("delete from public.delivery_territory_areas");
  });

  it("exposes the per-region opt-out and mismatch warning only through the gated API", () => {
    expect(route).toContain("isSalesAreaDeliverySyncEnabled(scope.companyId)");
    expect(route).toContain("export async function PATCH");
    expect(component).toContain("배송 안 함");
    expect(component).toContain("영업 지역과 배송 권역이 다릅니다.");
  });
});
