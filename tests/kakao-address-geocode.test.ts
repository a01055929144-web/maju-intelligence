import { afterEach, describe, expect, it } from "vitest";
import { geocodeAddress } from "../lib/kakao-address-geocode";

const reply = (documents: unknown[], ok = true) => (async () => ({ ok, json: async () => ({ documents }) })) as unknown as typeof fetch;

describe("geocodeAddress", () => {
  afterEach(() => { delete process.env.KAKAO_REST_KEY; });
  it("returns null without a key or an address", async () => {
    expect(await geocodeAddress("서울 강남구", reply([]))).toBeNull();
    process.env.KAKAO_REST_KEY = "test";
    expect(await geocodeAddress("  ", reply([]))).toBeNull();
  });
  it("reads the first address result", async () => {
    process.env.KAKAO_REST_KEY = "test";
    expect(await geocodeAddress("서울 강남구 테헤란로 1", reply([{ x: "127.03", y: "37.5" }]))).toEqual({ lat: 37.5, lng: 127.03 });
  });
  it("rejects coordinates outside Korea", async () => {
    process.env.KAKAO_REST_KEY = "test";
    expect(await geocodeAddress("x", reply([{ x: "0", y: "0" }]))).toBeNull();
  });
});
