import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { collapseStoreCostDuplicates, storeCostProductKey, validateStoreCostInput,
  type StoreCostInput } from "../../domains/store-cost/store-cost";
import { canAccessStoreCosts } from "../../domains/organization/store-cost-access";
import { isFeatureEnabled } from "../../lib/feature-flags";
import { getStoreMemberContext } from "../../lib/store/07-store-member-context";
import { importStoreCosts } from "../../lib/store/store-costs";

const MAX_ROWS = 2_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ImportInput = { companyId: string; fileName: unknown; importId: unknown; rows: unknown; storeAccountId: string };
type AccessFailure = { ok: false; status: 401 | 403 | 404 };

function normalizeRows(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ROWS) throw new Error("invalid_store_cost_rows");
  const rows = value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid_store_cost_rows");
    const row = raw as Record<string, unknown>;
    if (typeof row.effectiveOn !== "string" || typeof row.productName !== "string" ||
      typeof row.unit !== "string" || typeof row.costKrw !== "number" ||
      (row.specification !== undefined && typeof row.specification !== "string") ||
      typeof row.sourceRowNumber !== "number") throw new Error("invalid_store_cost_rows");
    return validateStoreCostInput({ costKrw: row.costKrw, effectiveOn: row.effectiveOn,
      productName: row.productName, sourceRowNumber: row.sourceRowNumber as number | undefined,
      specification: row.specification as string | undefined, unit: row.unit }, index + 1);
  });
  return collapseStoreCostDuplicates(rows);
}

function prepare(input: ImportInput) {
  if (typeof input.fileName !== "string" || !input.fileName.trim() || input.fileName.length > 255) {
    throw new Error("invalid_store_cost_file");
  }
  if (typeof input.importId !== "string" || !UUID.test(input.importId)) throw new Error("invalid_store_cost_import_id");
  const rows = normalizeRows(input.rows);
  const confirmationHash = createHash("sha256").update(
    `${input.companyId}\n${input.storeAccountId}\n${input.importId}\n${JSON.stringify(rows)}`
  ).digest("hex");
  return { confirmationHash, fileName: input.fileName.trim(), importId: input.importId, rows };
}

async function authorize(input: Pick<ImportInput, "companyId" | "storeAccountId">) {
  if (!isFeatureEnabled("STORE_COSTS", input.companyId)) return { ok: false, status: 404 } as const;
  const member = await getStoreMemberContext({ companyId: input.companyId, storeAccountId: input.storeAccountId });
  if (!member) return { ok: false, status: 401 } as const;
  if (!canAccessStoreCosts(member.role, "manage")) return { ok: false, status: 403 } as const;
  return { member, ok: true } as const;
}

export async function previewStoreCostImport(input: ImportInput): Promise<AccessFailure | { ok: true; preview: ReturnType<typeof prepare> }> {
  const access = await authorize(input);
  if (!access.ok) return access;
  return { ok: true, preview: prepare(input) };
}

export async function applyStoreCostImport(input: ImportInput & { confirmationHash: unknown }) {
  const access = await authorize(input);
  if (!access.ok) return access;
  const prepared = prepare(input);
  if (typeof input.confirmationHash !== "string" || !/^[0-9a-f]{64}$/.test(input.confirmationHash) ||
    !timingSafeEqual(Buffer.from(input.confirmationHash, "hex"), Buffer.from(prepared.confirmationHash, "hex"))) {
    throw new Error("store_cost_preview_changed");
  }
  const result = await importStoreCosts({ actorMemberId: access.member.memberId, companyId: input.companyId,
    fileName: prepared.fileName, importId: prepared.importId, rows: prepared.rows, storeAccountId: input.storeAccountId });
  return { ok: true, result } as const;
}

export type { StoreCostInput };
