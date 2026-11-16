import { expect, it } from "vitest";
import { deliveryResultParts, mergeDeliveryResults } from "./delivery-result";

const now = Date.parse("2026-11-17T03:00:00Z");
it("전달 n일 전 · 열어봄 글", () => {
  expect(deliveryResultParts({ deliveredAt: "2026-11-14T03:00:00Z", openedAt: "2026-11-15T01:00:00Z" }, now)).toEqual(["단가표 전달 3일 전", "열어봄"]);
  expect(deliveryResultParts({ deliveredAt: "2026-11-17T01:00:00Z" }, now)).toEqual(["단가표 전달 오늘"]);
  expect(deliveryResultParts({ openedAt: "2026-11-16T01:00:00Z" }, now)).toEqual(["열어봄"]);
});
it("기록이 없거나 시각이 잘못되면 아무것도 안 보인다", () => {
  expect(deliveryResultParts(undefined, now)).toEqual([]);
  expect(deliveryResultParts({ deliveredAt: "잘못", openedAt: null }, now)).toEqual([]);
});
it("같은 리드는 가장 최근 시각으로 합친다", () => {
  expect(mergeDeliveryResults(
    [{ leadId: "a", at: "2026-11-10T00:00:00Z" }, { leadId: "a", at: "2026-11-12T00:00:00Z" }],
    [{ leadId: "a", at: "2026-11-13T00:00:00Z" }, { leadId: "b", at: "2026-11-11T00:00:00Z" }]
  )).toEqual([{ leadId: "a", deliveredAt: "2026-11-12T00:00:00Z", openedAt: "2026-11-13T00:00:00Z" }, { leadId: "b", openedAt: "2026-11-11T00:00:00Z" }]);
});
