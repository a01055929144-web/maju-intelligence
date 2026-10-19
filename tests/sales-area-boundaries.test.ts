import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KOREAN_ADMINISTRATIVE_AREAS, KOREAN_GENERAL_GU_AREAS } from "../lib/korean-administrative-areas";

type BoundaryManifest = {
  provinces: Record<string, { file: string; gzipBytes: number }>;
};

type BoundaryCollection = {
  features: Array<{ properties: { administrativeArea: string; parentAdministrativeArea: string } }>;
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
      const selectorKeys = districts.flatMap((district) => {
        const parent = `${province} ${district}`;
        const generalGus = KOREAN_GENERAL_GU_AREAS[parent] || [];
        return generalGus.length ? generalGus.map((gu) => `${parent} ${gu}`) : [parent];
      }).sort();
      expect(boundaryKeys, `${province} 경계/선택기 키`).toEqual(selectorKeys);
    }
  });

  it("keeps general-gu boundaries while retaining their parent city key", () => {
    const asset = manifest.provinces["경기도"];
    const collection = JSON.parse(readFileSync(path.join(boundaryDirectory, asset.file), "utf8")) as BoundaryCollection;
    const seongnam = collection.features.filter((feature) => feature.properties.parentAdministrativeArea === "경기도 성남시");
    expect(seongnam.map((feature) => feature.properties.administrativeArea).sort()).toEqual([
      "경기도 성남시 분당구", "경기도 성남시 수정구", "경기도 성남시 중원구"
    ].sort());
  });
});
