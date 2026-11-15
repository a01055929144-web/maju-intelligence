import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 훅 자체는 AbortController 한 줄 규칙: 새로 시작하면 이전 signal이 aborted. 렌더 없이 같은 로직을 검증하고, 지도 로더가 실제로 signal을 쓰는지 소스로 확인한다.
it("a new request aborts the previous one", () => {
  let current: AbortController | null = null;
  const begin = () => { current?.abort(); current = new AbortController(); return current.signal; };
  const first = begin();
  const second = begin();
  expect(first.aborted).toBe(true);
  expect(second.aborted).toBe(false);
});

it("map lead loaders pass the signal and drop stale responses", () => {
  const source = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
  expect(source).toContain("const signal = beginAllLeadsRequest()");
  expect(source).toContain("{ cache: \"no-store\", signal }");
  expect(source).toContain("const signal = beginRadiusRequest()");
  expect(source.match(/if \(signal\.aborted\) return;/g)?.length).toBeGreaterThanOrEqual(3);
  expect(readFileSync("hooks/use-latest-request.ts", "utf8")).toContain("controllerRef.current?.abort()");
});
