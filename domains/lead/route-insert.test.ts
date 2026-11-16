import { expect, it } from "vitest";
import { suggestInsertion } from "./route-insert";

const A = { order: 1, lat: 37.5, lng: 127.0 }, B = { order: 2, lat: 37.5, lng: 127.1 }, C = { order: 3, lat: 37.5, lng: 127.2 };

it("정류장이 없으면 null", () => expect(suggestInsertion([], { lat: 37.5, lng: 127 })).toBeNull());
it("두 정류장 사이 길목의 리드는 그 사이(2번 자리)에 들어가고 추가 시간이 작다", () => {
  const s = suggestInsertion([A, B, C], { lat: 37.501, lng: 127.05 });
  expect(s?.insertAt).toBe(2);
  expect(s?.extraMinutes).toBeLessThanOrEqual(2);
});
it("경로 끝 너머의 리드는 마지막 뒤에, 시작 앞의 리드는 1번 자리에", () => {
  expect(suggestInsertion([A, B, C], { lat: 37.5, lng: 127.3 })?.insertAt).toBe(4);
  expect(suggestInsertion([A, B, C], { lat: 37.5, lng: 126.9 })?.insertAt).toBe(1);
});
it("순서가 섞여 들어와도 stop_order로 정렬해 계산한다", () => {
  expect(suggestInsertion([C, A, B], { lat: 37.501, lng: 127.15 })?.insertAt).toBe(3);
});
