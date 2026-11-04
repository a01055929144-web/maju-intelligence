import { describe, expect, it } from "vitest";
import { applyPreset, DOCUMENT_PRESETS } from "../domains/pricing/document-presets";
import type { DocumentContent } from "../domains/pricing/document";

const base: DocumentContent = { kind: "quote", title: "x", companyName: "회사", contact: "", recipient: "", footer: "", validUntil: "2026-11-30", theme: "blue", layout: "auto", showPrice: true, showBrand: true, showSpec: true, lines: [], display: { columns: 1, promoLayout: "cards", info: [{ key: "main_phone", label: "대표 연락처", value: "02-1", place: "header" }] } };

describe("document presets", () => {
  it("has four presets with unique ids", () => {
    expect(new Set(DOCUMENT_PRESETS.map((p) => p.id)).size).toBe(4);
  });
  it("applies look but keeps kind and info lines", () => {
    const many = DOCUMENT_PRESETS.find((p) => p.id === "sheet-many")!;
    const out = applyPreset(base, many);
    expect(out.kind).toBe("quote");
    expect(out.display?.columns).toBe(3);
    expect(out.display?.info).toHaveLength(1);
    expect(out.theme).toBe("mono");
    expect(out.companyName).toBe("회사");
  });
});
