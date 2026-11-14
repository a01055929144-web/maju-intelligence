import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// M4a/M4b 원칙: 워크스페이스에서 분리한 파일은 워크스페이스를 import하지 않는다(순환 import → TDZ 흰 화면 방지).
it.each([
  "components/map/map-side-panel.tsx",
  "components/map/map-row-helpers.ts",
  "components/map/lead-list-sort.ts",
  "components/map/map-place-detail.tsx",
  "components/map/map-place-helpers.ts",
])("%s는 sales-route-map-workspace를 import하지 않는다", (file) => {
  expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["'][^"']*sales-route-map-workspace["']/);
});
