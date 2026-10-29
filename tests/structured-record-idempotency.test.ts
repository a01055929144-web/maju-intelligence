import { describe, expect, it, vi } from "vitest";
import { createStructuredSaveSnapshot, resolveStructuredSaveAttempt } from "../lib/structured-record-idempotency";

describe("structured sales save idempotency", () => {
  it("keeps the same key when only the response was lost and the payload is unchanged", () => {
    const createId = vi.fn(() => "first");
    const snapshot = createStructuredSaveSnapshot({ leadId: "lead-1", memo: "사과 견적", items: [{ itemName: "사과", offeredPrice: "30000" }] });
    const first = resolveStructuredSaveAttempt(null, snapshot, createId);
    const retry = resolveStructuredSaveAttempt(first, snapshot, createId);
    expect(retry).toBe(first);
    expect(retry.key).toBe("sales:first");
    expect(createId).toHaveBeenCalledOnce();
  });

  it("issues a new key after the user changes memo, item, or price", () => {
    const createId = vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("second");
    const original = createStructuredSaveSnapshot({ memo: "사과 견적", items: [{ itemName: "사과", offeredPrice: "30000" }] });
    const changed = createStructuredSaveSnapshot({ memo: "사과 수정 견적", items: [{ itemName: "사과", offeredPrice: "32000" }] });
    const first = resolveStructuredSaveAttempt(null, original, createId);
    const next = resolveStructuredSaveAttempt(first, changed, createId);
    expect(next.key).toBe("sales:second");
    expect(next.snapshot).toBe(changed);
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("issues a new key for a new record after a successful save, even if the values match", () => {
    const createId = vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("next-record");
    const snapshot = createStructuredSaveSnapshot({ leadId: "lead-1", memo: "방문", items: [{ itemName: "두부" }] });
    const saved = resolveStructuredSaveAttempt(null, snapshot, createId);
    const next = resolveStructuredSaveAttempt(null, snapshot, createId);
    expect(saved.key).toBe("sales:first");
    expect(next.key).toBe("sales:next-record");
  });
});
