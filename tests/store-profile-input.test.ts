import { describe, expect, it } from "vitest";
import { parseStoreProfileInput } from "../domains/store/store-profile";

const base = { storeName: " 합성 식당 ", businessNumber: "", openingSoon: true, baseAddress: "서울 합성구 합성로 1", addressDetail: "", termsAccepted: true };
// 체크섬이 맞는 합성 번호(1234567891). 실제 사업자번호 아님.
const validNumber = "123-45-67891";

describe("store profile direct signup input", () => {
  it("accepts an opening-soon store without a business number and trims text", () => {
    const parsed = parseStoreProfileInput(base);
    expect(parsed).toEqual({ ok: true, value: { storeName: "합성 식당", businessRegistrationNumber: null, baseAddress: "서울 합성구 합성로 1", addressDetail: null } });
  });

  it("requires a valid business number unless opening soon, and normalizes hyphens", () => {
    expect(parseStoreProfileInput({ ...base, openingSoon: false, businessNumber: "" })).toMatchObject({ ok: false, field: "businessNumber" });
    expect(parseStoreProfileInput({ ...base, openingSoon: false, businessNumber: "1234567890" })).toMatchObject({ ok: false, field: "businessNumber" });
    expect(parseStoreProfileInput({ ...base, openingSoon: false, businessNumber: validNumber })).toMatchObject({ ok: true, value: { businessRegistrationNumber: "1234567891" } });
  });

  it("ignores a typed number when opening soon so no unchecked number is stored", () => {
    expect(parseStoreProfileInput({ ...base, openingSoon: true, businessNumber: validNumber })).toMatchObject({ ok: true, value: { businessRegistrationNumber: null } });
  });

  it("enforces name, address and detail limits and terms", () => {
    expect(parseStoreProfileInput({ ...base, storeName: "   " })).toMatchObject({ ok: false, field: "storeName" });
    expect(parseStoreProfileInput({ ...base, storeName: "가".repeat(101) })).toMatchObject({ ok: false, field: "storeName" });
    expect(parseStoreProfileInput({ ...base, baseAddress: "" })).toMatchObject({ ok: false, field: "baseAddress" });
    expect(parseStoreProfileInput({ ...base, addressDetail: "가".repeat(201) })).toMatchObject({ ok: false, field: "addressDetail" });
    expect(parseStoreProfileInput({ ...base, termsAccepted: false })).toMatchObject({ ok: false, field: "termsAccepted" });
    expect(parseStoreProfileInput({ ...base, termsAccepted: "true" })).toMatchObject({ ok: false, field: "termsAccepted" });
  });

  it("rejects non-object bodies", () => {
    expect(parseStoreProfileInput(null)).toMatchObject({ ok: false });
    expect(parseStoreProfileInput([])).toMatchObject({ ok: false });
    expect(parseStoreProfileInput("x")).toMatchObject({ ok: false });
  });
});
