import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";
import proj4 from "proj4";

const PROVINCE_SLUGS = {
  "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu", "인천광역시": "incheon",
  "광주광역시": "gwangju", "대전광역시": "daejeon", "울산광역시": "ulsan", "세종특별자치시": "sejong",
  "경기도": "gyeonggi", "강원특별자치도": "gangwon", "충청북도": "chungbuk", "충청남도": "chungnam",
  "전북특별자치도": "jeonbuk", "전라남도": "jeonnam", "경상북도": "gyeongbuk", "경상남도": "gyeongnam",
  "제주특별자치도": "jeju"
};
const PROVINCE_ALIASES = { "강원도": "강원특별자치도", "전라북도": "전북특별자치도" };
const GENERAL_GU_CITIES = ["고양시", "성남시", "수원시", "용인시", "안양시", "안산시", "부천시", "청주시", "천안시", "전주시", "포항시", "창원시"];
const MAX_GZIP_BYTES = 250 * 1024;
const SGIS_DERIVED_2025_URL = "https://raw.githubusercontent.com/vuski/admdongkor/master/ver20250701/HangJeongDong_ver20250701.geojson";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function roundCoordinate(value) {
  return Math.round(value * 100000) / 100000;
}

function mapCoordinates(value, mapper) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number") return mapper(value);
  return value.map((child) => mapCoordinates(child, mapper));
}

function normalizeProvince(value) {
  return PROVINCE_ALIASES[value] || value;
}

function deriveProperties(properties = {}) {
  const parts = String(properties.adm_nm || properties.ADM_NM || properties.full_nm || "").trim().split(/\s+/);
  const province = normalizeProvince(String(properties.sidonm || properties.SIDO_NM || parts[0] || ""));
  let district = String(properties.sggnm || properties.SGG_NM || parts[1] || "").trim();
  const parentCity = GENERAL_GU_CITIES.find((city) => district.includes(city) || parts.includes(city));
  let parentSalesArea = "";
  if (parentCity) {
    const cityIndex = parts.indexOf(parentCity);
    const spacedGu = cityIndex >= 0 && parts[cityIndex + 1]?.endsWith("구") ? parts[cityIndex + 1] : "";
    const compactGu = district.replace(parentCity, "").trim();
    const gu = spacedGu || (compactGu.endsWith("구") ? compactGu : "");
    parentSalesArea = `${province} ${parentCity}`;
    district = gu ? `${parentCity} ${gu}` : parentCity;
  }
  if (!province || !district) throw new Error(`행정구역 이름을 해석하지 못했습니다: ${JSON.stringify(properties)}`);
  return { district, parent_sales_area: parentSalesArea || `${province} ${district}`, province, sales_area: `${province} ${district}` };
}

function normalizeInput(inputPath, outputPath) {
  const collection = JSON.parse(readFileSync(inputPath, "utf8"));
  const sample = collection.features?.[0]?.geometry?.coordinates;
  const first = JSON.stringify(sample || []).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  const needsProjection = Math.abs(first[0] || 0) > 180 || Math.abs(first[1] || 0) > 90;
  proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
  const features = collection.features.map((feature) => ({
    type: "Feature",
    properties: deriveProperties(feature.properties),
    geometry: {
      ...feature.geometry,
      coordinates: mapCoordinates(feature.geometry.coordinates, ([x, y]) => {
        const [lng, lat] = needsProjection ? proj4("EPSG:5179", "EPSG:4326", [x, y]) : [x, y];
        return [roundCoordinate(lng), roundCoordinate(lat)];
      })
    }
  }));
  writeFileSync(outputPath, JSON.stringify({ type: "FeatureCollection", features }));
}

function visitCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number") callback(value);
  else value.forEach((child) => visitCoordinates(child, callback));
}

function geometryMetadata(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity, lngSum = 0, latSum = 0, count = 0;
  visitCoordinates(geometry.coordinates, ([lng, lat]) => {
    minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat);
    lngSum += lng; latSum += lat; count += 1;
  });
  return { bbox: [minLng, minLat, maxLng, maxLat], centroid: [lngSum / count, latSum / count] };
}

async function main() {
  const outputDirectory = path.resolve(readArg("--output", "public/maps/sales-areas/2025"));
  const workDirectory = path.resolve(readArg("--work", ".tmp-boundary/build"));
  let inputPath = readArg("--input");
  mkdirSync(workDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  if (!inputPath) {
    inputPath = path.join(workDirectory, "HangJeongDong_ver20250701.geojson");
    if (!existsSync(inputPath)) {
      const response = await fetch(SGIS_DERIVED_2025_URL);
      if (!response.ok) throw new Error(`경계 원본 다운로드 실패: ${response.status}`);
      writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));
    }
  }

  const normalizedPath = path.join(workDirectory, "normalized.geojson");
  const dissolvedPath = path.join(workDirectory, "dissolved.geojson");
  normalizeInput(path.resolve(inputPath), normalizedPath);
  const mapshaperBin = path.resolve("node_modules/mapshaper/bin/mapshaper");
  execFileSync(process.execPath, [mapshaperBin,
    normalizedPath,
    "-dissolve", "sales_area", "copy-fields=province,district,parent_sales_area",
    "-simplify", "weighted", "8%", "keep-shapes",
    "-clean",
    "-o", "precision=0.00001", "format=geojson", dissolvedPath
  ], { stdio: "inherit" });

  const dissolved = JSON.parse(readFileSync(dissolvedPath, "utf8"));
  const byProvince = new Map();
  for (const feature of dissolved.features) {
    const metadata = geometryMetadata(feature.geometry);
    feature.properties = {
      administrativeArea: feature.properties.sales_area,
      parentAdministrativeArea: feature.properties.parent_sales_area,
      province: feature.properties.province,
      district: feature.properties.district,
      centroid: metadata.centroid.map(roundCoordinate),
      bbox: metadata.bbox.map(roundCoordinate)
    };
    const items = byProvince.get(feature.properties.province) || [];
    items.push(feature);
    byProvince.set(feature.properties.province, items);
  }

  const manifest = { source: "국가데이터처 SGIS 기반 행정동 경계", sourceDate: "2025-07-01", generatedAt: new Date().toISOString(), provinces: {} };
  const oversize = [];
  for (const [province, features] of byProvince) {
    const slug = PROVINCE_SLUGS[province];
    if (!slug) throw new Error(`지원하지 않는 시·도입니다: ${province}`);
    const body = JSON.stringify({ type: "FeatureCollection", features });
    const bytes = Buffer.byteLength(body);
    const gzipBytes = gzipSync(body).byteLength;
    if (gzipBytes > MAX_GZIP_BYTES) oversize.push(`${province}: ${gzipBytes.toLocaleString()} bytes gzip`);
    const filename = `${slug}.geojson`;
    writeFileSync(path.join(outputDirectory, filename), body);
    manifest.provinces[province] = {
      file: filename,
      featureCount: features.length,
      bytes,
      gzipBytes,
      sha256: createHash("sha256").update(body).digest("hex")
    };
  }
  writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(normalizedPath, { force: true });
  rmSync(dissolvedPath, { force: true });
  if (oversize.length) throw new Error(`250KB gzip 제한 초과:\n${oversize.join("\n")}`);
  console.table(Object.entries(manifest.provinces).map(([province, item]) => ({ province, ...item })));
}

await main();
