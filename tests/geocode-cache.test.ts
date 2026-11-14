import { describe, expect, it } from "vitest";
import { GEOCODE_CACHE_STORAGE_KEY, loadGeocodeCache, saveGeocodeCache, type GeocodePoint } from "../components/map/geocode-cache";

// 가짜 저장소만 사용한다.
const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("지오코딩 캐시 v2", () => {
  it("옛 v1 키는 읽지 않고 지운다(approx 표시 없는 근사 좌표가 정확으로 보이는 것 방지)", () => {
    const storage = fakeStorage({ "maju:kakao-geocode-cache:v1": JSON.stringify({ "가짜 주소 1": { lat: 37.5, lng: 127 } }) });
    const cache = new Map<string, GeocodePoint>();
    loadGeocodeCache(cache, storage);
    expect(cache.size).toBe(0);
    expect(storage.data.has("maju:kakao-geocode-cache:v1")).toBe(false);
  });

  it("v2 값은 읽고, approx 표시도 함께 저장·복원된다", () => {
    const storage = fakeStorage();
    const saved = new Map<string, GeocodePoint>([["가짜 주소 2", { lat: 37.5, lng: 127.1, approx: true }], ["가짜 주소 3", { lat: 37.6, lng: 127.2 }]]);
    saveGeocodeCache(saved, storage);
    expect(storage.data.has(GEOCODE_CACHE_STORAGE_KEY)).toBe(true);
    const loaded = new Map<string, GeocodePoint>();
    loadGeocodeCache(loaded, storage);
    expect(loaded.get("가짜 주소 2")).toEqual({ lat: 37.5, lng: 127.1, approx: true });
    expect(loaded.get("가짜 주소 3")?.approx).toBeUndefined();
  });

  it("깨진 값은 무시하고 좌표가 숫자가 아닌 항목은 버린다", () => {
    const storage = fakeStorage({ [GEOCODE_CACHE_STORAGE_KEY]: "{깨짐" });
    const cache = new Map<string, GeocodePoint>();
    expect(() => loadGeocodeCache(cache, storage)).not.toThrow();
    storage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify({ a: { lat: "x", lng: 1 }, b: { lat: 1, lng: 2 } }));
    loadGeocodeCache(cache, storage);
    expect([...cache.keys()]).toEqual(["b"]);
  });
});
