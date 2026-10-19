import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KOREAN_ADMINISTRATIVE_AREAS } from "../lib/korean-administrative-areas";

type BoundaryManifest = {
  provinces: Record<string, { file: string; gzipBytes: number }>;
};

type BoundaryCollection = {
  features: Array<{ properties: { administrativeArea: string } }>;
};

const boundaryDirectory = path.resolve("public/maps/sales-areas/2025");
const manifest = JSON.parse(readFileSync(path.join(boundaryDirectory, "manifest.json"), "utf8")) as BoundaryManifest;

describe("sales area boundary assets", () => {
  it("keeps every province asset under the 250KB gzip budget", () => {
    for (const item of Object.values(manifest.provinces)) {
      expect(item.gzipBytes).toBeLessThanOrEqual(250 * 1024);
    }
  });

  it("matches boundary keys with selectable sales-area keys province by province", () => {
    for (const [province, districts] of Object.entries(KOREAN_ADMINISTRATIVE_AREAS)) {
      if (province === "세종특별자치시") continue;
      const asset = manifest.provinces[province];
      expect(asset, `${province} 경계 파일`).toBeDefined();
      const collection = JSON.parse(readFileSync(path.join(boundaryDirectory, asset.file), "utf8")) as BoundaryCollection;
      const boundaryKeys = collection.features.map((feature) => feature.properties.administrativeArea).sort();
      const selectorKeys = districts.map((district) => `${province} ${district}`).sort();
      expect(boundaryKeys, `${province} 경계/선택기 키`).toEqual(selectorKeys);
    }
  });

  it("dissolves general-gu cities to the product sales-area key", () => {
    const asset = manifest.provinces["경기도"];
    const collection = JSON.parse(readFileSync(path.join(boundaryDirectory, asset.file), "utf8")) as BoundaryCollection;
    const keys = collection.features.map((feature) => feature.properties.administrativeArea);
    expect(keys).toContain("경기도 성남시");
    expect(keys.some((key) => key.startsWith("경기도 성남시분당구"))).toBe(false);
  });
});
