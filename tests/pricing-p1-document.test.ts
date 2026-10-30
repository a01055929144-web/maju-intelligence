import { describe, it, expect, vi } from "vitest";
import {
  parseDocument,
  documentOutput,
  printPages,
  koreaDay,
  withMargin,
  withLivePromotions,
  lineFromCatalog,
  type DocumentContent,
  type DocumentVersion,
} from "../domains/pricing/document";
import { pricingDocuments } from "../application/pricing/documents";
const id = "10000000-0000-4000-8000-000000000001";
const content: DocumentContent = {
  kind: "quote",
  title: "식자재 견적",
  companyName: "합성 회사",
  contact: "문의 안내",
  recipient: "받는 곳",
  footer: "배송 안내",
  validUntil: "2026-11-30",
  theme: "blue",
  layout: "table",
  showPrice: true,
  showBrand: true,
  showSpec: true,
  lines: [
    {
      productId: id,
      displayName: "매장 상품",
      brand: "브랜드",
      spec: "1kg",
      unit: "개",
      price: 21180,
      taxType: "exempt",
      visible: true,
      promotionId: null,
      startsOn: null,
      endsOn: null,
      remaining: null,
      badge: "",
    },
  ],
};
const version: DocumentVersion = {
  id,
  documentId: id,
  version: 1,
  revision: 1,
  publishedAt: "2026-10-29T16:00:00Z",
  content,
  unavailablePromotions: [],
};
describe("pricing P1 documents", () => {
  it("whitelists printable fields instead of spreading private records", () => {
    const parsed = parseDocument({
      ...content,
      cost: 18910,
      margin: 12,
      supplier: "PRIVATE",
      lines: [
        {
          ...content.lines[0],
          cost: 18910,
          managementName: "INTERNAL",
          token: "SECRET",
        },
      ],
    });
    const output = JSON.stringify(
      documentOutput({ ...version, content: parsed }, "2026-10-30"),
    );
    for (const forbidden of [
      "18910",
      "cost",
      "margin",
      "PRIVATE",
      "INTERNAL",
      "SECRET",
      "productId",
    ])
      expect(output).not.toContain(forbidden);
    expect(output).toContain("21180");
  });
  it("hides prices after expiry while retaining display names and removes hidden rows", () => {
    expect(documentOutput(version, "2026-12-01").lines[0].price).toBeNull();
    expect(
      documentOutput(
        { ...version, content: { ...content, showPrice: false } },
        "2026-10-30",
      ).lines[0].price,
    ).toBeNull();
    const second = {
      ...content.lines[0],
      productId: "10000000-0000-4000-8000-000000000002",
      visible: false,
    };
    expect(
      documentOutput(
        {
          ...version,
          content: { ...content, lines: [content.lines[0], second] },
        },
        "2026-10-30",
      ).lines,
    ).toHaveLength(1);
  });
  it("filters expired, future, sold-out or currently unavailable promotions", () => {
    const line = {
      ...content.lines[0],
      promotionId: id,
      startsOn: "2026-10-30",
      endsOn: "2026-11-01",
      remaining: 2,
      badge: "행사" as const,
    };
    const v = { ...version, content: { ...content, lines: [line] } };
    expect(documentOutput(v, "2026-10-30").lines).toHaveLength(1);
    expect(documentOutput(v, "2026-11-02").lines).toHaveLength(0);
    expect(documentOutput(v, "2026-10-29").lines).toHaveLength(0);
    expect(
      documentOutput({ ...v, unavailablePromotions: [id] }, "2026-10-30").lines,
    ).toHaveLength(0);
    expect(
      documentOutput(
        { ...v, content: { ...content, lines: [{ ...line, remaining: 0 }] } },
        "2026-10-30",
      ).lines,
    ).toHaveLength(0);
  });
  it("uses current stock for output without repricing the fixed version", () => {
    const line = {
      ...content.lines[0],
      promotionId: id,
      startsOn: "2026-10-30",
      endsOn: "2026-11-01",
      remaining: 10,
      badge: "행사" as const,
    };
    const v = {
      ...version,
      content: { ...content, lines: [line] },
      promotionStock: { [id]: 3 },
    };
    const output = documentOutput(v, "2026-10-30");
    expect(output.lines[0].remaining).toBe(3);
    expect(output.lines[0].price).toBe(21180);
    expect(v.content.lines[0].remaining).toBe(10);
    expect(
      documentOutput({ ...v, promotionStock: { [id]: 0 } }, "2026-10-30").lines,
    ).toHaveLength(0);
  });
  it("shows live stock when a draft preview first opens and after stock changes", () => {
    const draft = {
      ...version,
      version: 0,
      content: {
        ...content,
        lines: [
          {
            ...content.lines[0],
            promotionId: id,
            startsOn: "2026-10-30",
            endsOn: "2026-11-01",
            remaining: 10,
            badge: "행사" as const,
          },
        ],
      },
    };
    const promotion = {
      id,
      productId: id,
      name: "관리명",
      displayName: "행사명",
      startsOn: "2026-10-30",
      endsOn: "2026-11-01",
      price: 21180,
      stock: 1,
      perStoreLimit: null,
      allowSheet: true,
      badge: "행사" as const,
      revision: 1,
      taxType: "exempt" as const,
    };
    const first = withLivePromotions(draft, [promotion], "2026-10-30");
    expect(documentOutput(first, "2026-10-30").lines[0]).toMatchObject({
      remaining: 1,
      price: 21180,
    });
    const soldOut = withLivePromotions(
      first,
      [{ ...promotion, stock: 0 }],
      "2026-10-30",
    );
    expect(documentOutput(soldOut, "2026-10-30").lines).toHaveLength(0);
    expect(draft.content.lines[0].remaining).toBe(10);
  });
  it("retains order and all long names across conservative A4 pages", () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({
      ...content.lines[0],
      productId: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      displayName: `긴 품목 ${i} `.padEnd(120, "가"),
      brand: "나".repeat(80),
      spec: "다".repeat(80),
    }));
    const output = documentOutput(
      { ...version, content: { ...content, lines } },
      "2026-10-30",
    );
    const pages = printPages(output);
    expect(pages.length).toBeGreaterThan(10);
    expect(pages.flatMap((p) => p.lines).map((l) => l.displayName)).toEqual(
      lines.map((l) => l.displayName),
    );
    expect(pages.every((p) => p.lines.length <= 18)).toBe(true);
  });
  it("uses current P0 cost markup and Korean day boundaries", () => {
    expect(withMargin(content.lines[0], 18910, 12).price).toBe(21180);
    expect(koreaDay(new Date("2026-10-29T15:00:00Z"))).toBe("2026-10-30");
  });
  it.each([NaN, Infinity, -1, 1.5, 1e13])("rejects invalid money %s", (price) =>
    expect(() =>
      parseDocument({ ...content, lines: [{ ...content.lines[0], price }] }),
    ).toThrow(),
  );
  it("requires an explicit output name, valid tax/date and unique products", () => {
    expect(() =>
      parseDocument({
        ...content,
        lines: [{ ...content.lines[0], displayName: "" }],
      }),
    ).toThrow();
    expect(() =>
      parseDocument({
        ...content,
        lines: [{ ...content.lines[0], taxType: "unknown" }],
      }),
    ).toThrow();
    expect(() =>
      parseDocument({ ...content, validUntil: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      parseDocument({
        ...content,
        lines: [content.lines[0], content.lines[0]],
      }),
    ).toThrow();
  });
  it("application ignores supplied actor/company/cost and rejects sales sheets", async () => {
    const request = vi.fn().mockResolvedValue({});
    const app = pricingDocuments({ request });
    const scope = { companyId: id, actor: "a".repeat(64), manager: false };
    await app.execute(scope, {
      action: "save",
      id,
      expected: 0,
      companyId: "other",
      actor: "b",
      content: { ...content, cost: 100 },
    });
    expect(request).toHaveBeenCalledWith(scope, "save", {
      id,
      expected: 0,
      content,
    });
    expect(() =>
      app.execute(scope, {
        action: "save",
        id,
        expected: 0,
        content: { ...content, kind: "sheet" },
      }),
    ).toThrow();
  });
});

it("retains unknown catalog tax until an explicit choice; does not assume taxable", () => {
  const line = lineFromCatalog({
    id,
    name: "관리 상품",
    displayName: "노출 상품",
    brand: "",
    spec: "",
    unit: "개",
    price: 10,
    taxType: "unknown",
  });
  expect(line.taxType).toBe("unknown");
  expect(() => parseDocument({ ...content, lines: [line] })).toThrow(
    "과세 미확정",
  );
  expect(
    parseDocument({ ...content, lines: [{ ...line, taxType: "exempt" }] })
      .lines[0].taxType,
  ).toBe("exempt");
});
