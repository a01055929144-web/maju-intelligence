// CC-30c: 행사 노출 대상(CC-29). 순수 함수만 — 판정은 DB(promotion_applies_to), 저장은 save_promotion_audience_v1.
export type Audience = "all" | "only" | "except";
export type AudienceTarget = { kind: "customer" | "template" | "store_grade"; id: string };
export type AudienceSummary = { promotionId: string; audience: Audience; customers: number; templates: number; grades?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 목록 "대상" 열: 전체 매장 / 매장 3 · 카탈로그 1 · 등급 2(매장 등급) / 제외: 매장 3 */
export function audienceLabel(x: Pick<AudienceSummary, "audience" | "customers" | "templates" | "grades"> | undefined): string {
  if (!x || x.audience === "all") return "전체 매장";
  const parts = [x.customers ? `매장 ${x.customers}` : "", x.templates ? `카탈로그 ${x.templates}` : "", x.grades ? `등급 ${x.grades}` : ""].filter(Boolean).join(" · ");
  return x.audience === "except" ? `제외: ${parts || "없음"}` : parts || "없음";
}

/** 저장 요청 검증(서버 경계). 통과하면 DB 함수에 그대로 넘길 값을 돌려준다. */
export function parseAudienceRequest(body: unknown): { promotionId: string; expected: number; audience: Audience; targets: AudienceTarget[] } | null {
  const b = body as { promotionId?: unknown; expected?: unknown; audience?: unknown; targets?: unknown } | null;
  if (!b || typeof b.promotionId !== "string" || !UUID.test(b.promotionId) || !Number.isSafeInteger(b.expected) || (b.expected as number) < 1) return null;
  if (b.audience !== "all" && b.audience !== "only" && b.audience !== "except") return null;
  if (!Array.isArray(b.targets) || b.targets.length > 200) return null;
  const targets: AudienceTarget[] = [];
  for (const t of b.targets as Array<{ kind?: unknown; id?: unknown }>) {
    if ((t?.kind !== "customer" && t?.kind !== "template" && t?.kind !== "store_grade") || typeof t.id !== "string" || !UUID.test(t.id)) return null;
    targets.push({ kind: t.kind, id: t.id.toLowerCase() });
  }
  if (b.audience === "all" ? targets.length > 0 : b.audience === "only" && targets.length === 0) return null;
  return { promotionId: b.promotionId.toLowerCase(), expected: b.expected as number, audience: b.audience, targets };
}
