import { describe, expect, it } from "vitest";
import { deliveryDayState, deliveryGuide, ORDER_HORIZON_DAYS, type DeliveryPolicy } from "../domains/order/order-rules";

// 홍곱창 규칙: 배송 월~토, D일 23:59까지 주문하면 D+1 배송(cutoffDaysBefore 1, 23:59). 시각은 KST로 만든다.
const policy: DeliveryPolicy = { weekdays: [1, 2, 3, 4, 5, 6], cutoffDaysBefore: 1, cutoffTime: "23:59", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0, holidays: [] };
const kst = (value: string) => new Date(`${value}+09:00`);

describe("CX-145 P1-1 deliveryGuide / 기본 배송일", () => {
  it("22시대 주문 → 오늘 밤 11:59까지 주문하면 내일(11/26 목) 배송", () => {
    const guide = deliveryGuide(policy, kst("2026-11-25T22:29:00"));
    expect(guide).toEqual({ next: "2026-11-26", text: "오늘 밤 11:59까지 주문하면 내일(11/26 목) 배송" });
  });
  it("자정 이후(11/26 00:10) → 모레가 아니라 마감이 다시 열려 11/27(금)", () => {
    expect(deliveryGuide(policy, kst("2026-11-26T00:10:00"))).toEqual({ next: "2026-11-27", text: "오늘 밤 11:59까지 주문하면 내일(11/27 금) 배송" });
  });
  it("마감 직후(23:59 이후) → 지금 주문하면 11/27(금) 배송", () => {
    expect(deliveryGuide(policy, kst("2026-11-25T23:59:30"))).toEqual({ next: "2026-11-27", text: "지금 주문하면 11/27(금) 배송" });
  });
  it("토요일 밤 → 일요일은 배송 없음이라 월요일", () => {
    const guide = deliveryGuide(policy, kst("2026-11-28T22:00:00"));
    expect(guide.next).toBe("2026-11-30");
    expect(guide.text).toBe("지금 주문하면 11/30(월) 배송");
  });
  it("휴무일은 건너뛴다(11/26 휴무 → 11/27)", () => {
    const holiday = { ...policy, holidays: [{ kind: "date" as const, date: "2026-11-26" }] };
    expect(deliveryGuide(holiday, kst("2026-11-25T22:29:00")).next).toBe("2026-11-27");
  });
  it("배송 요일이 없으면 안내만(예외를 던지지 않는다)", () => {
    expect(deliveryGuide({ ...policy, weekdays: [] }, kst("2026-11-25T22:29:00"))).toEqual({ next: null, text: "배송 요일이 설정되지 않았습니다." });
  });
});

describe("CX-145 P1-1 deliveryDayState (달력·서버 공통)", () => {
  const now = kst("2026-11-25T22:29:00");
  it("고를 수 있는 날", () => expect(deliveryDayState("2026-11-26", policy, now)).toEqual({ ok: true }));
  it("오늘(마감 지남)·지난 날 = 마감", () => {
    expect(deliveryDayState("2026-11-25", policy, now)).toEqual({ ok: false, reason: "cutoff" });
    expect(deliveryDayState("2026-11-24", policy, now)).toEqual({ ok: false, reason: "cutoff" });
  });
  it("일요일 = 배송 없음, 휴무일 = 휴무(요일 규칙이 먼저)", () => {
    expect(deliveryDayState("2026-11-29", policy, now)).toEqual({ ok: false, reason: "weekday" });
    const holiday = { ...policy, holidays: [{ kind: "date" as const, date: "2026-11-27" }, { kind: "fixed" as const, month: 12, day: 1 }] };
    expect(deliveryDayState("2026-11-27", holiday, now)).toEqual({ ok: false, reason: "holiday" });
    expect(deliveryDayState("2026-12-01", holiday, now)).toEqual({ ok: false, reason: "holiday" });
  });
  it("오늘부터 14일 넘으면 범위 밖", () => {
    expect(ORDER_HORIZON_DAYS).toBe(14);
    expect(deliveryDayState("2026-12-09", policy, now)).toEqual({ ok: true });
    expect(deliveryDayState("2026-12-10", policy, now)).toEqual({ ok: false, reason: "range" });
  });
  it("배송 요일이 비면 전부 배송 없음(예외 없음)", () => {
    expect(deliveryDayState("2026-11-26", { ...policy, weekdays: [] }, now)).toEqual({ ok: false, reason: "weekday" });
  });
});
