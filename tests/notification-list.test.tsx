import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationList } from "../components/ui/notification-list";
import { diffNotificationValues, notificationStatus, sortNotifications, unreadCount, type CompanyNotification } from "../lib/notification-list";

const items: CompanyNotification[] = [
  { id: "p", notificationType: "store_profile_changed", createdAt: "2026-11-16T01:00:00Z", processedAt: "2026-11-16T02:00:00Z", subject: "가짜처리매장" },
  { id: "r", notificationType: "new_store", createdAt: "2026-11-16T03:00:00Z", readAt: "2026-11-16T04:00:00Z", subject: "가짜읽음매장" },
  { id: "n1", notificationType: "store_profile_changed", createdAt: "2026-11-16T05:00:00Z", subject: "가짜새매장", beforeValues: { storeName: "가짜식당", baseAddress: "서울 중구 가짜로 1", accessNote: "" }, afterValues: { storeName: "가짜식당", baseAddress: "서울 중구 가짜로 9", accessNote: "뒷문" } },
  { id: "n2", notificationType: "new_store", createdAt: "2026-11-16T06:00:00Z", subject: "더새매장" }
];

describe("알림 규칙 (CC-56)", () => {
  it("상태: 처리됨 > 읽음 > 새 알림", () => {
    expect(notificationStatus({ processedAt: "x", readAt: "y" })).toBe("processed");
    expect(notificationStatus({ readAt: "y" })).toBe("read");
    expect(notificationStatus({})).toBe("new");
  });
  it("정렬: 새 알림(최신순) → 읽음 → 처리됨, 입력은 그대로", () => {
    const copy = [...items];
    expect(sortNotifications(items).map((item) => item.id)).toEqual(["n2", "n1", "r", "p"]);
    expect(items).toEqual(copy);
    expect(unreadCount(items)).toBe(2);
  });
  it("전후 비교: 달라진 칸만, 모르는 키는 키 이름 그대로", () => {
    expect(diffNotificationValues(items[2].beforeValues, items[2].afterValues)).toEqual([
      { key: "accessNote", label: "출입 안내", before: "", after: "뒷문" },
      { key: "baseAddress", label: "기본 주소", before: "서울 중구 가짜로 1", after: "서울 중구 가짜로 9" }
    ]);
    expect(diffNotificationValues({ newKey: 1 }, { newKey: 2 })[0].label).toBe("newKey");
    expect(diffNotificationValues({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe("NotificationList (CC-56)", () => {
  const html = renderToStaticMarkup(<NotificationList items={items} onMarkRead={() => undefined} onProcess={() => undefined} processLabel="거래처에 반영" titles={{ new_store: "새 매장", store_profile_changed: "매장 정보 변경" }} />);
  it("건수 줄 · 상태 표시 · 제목+대상 · 새 알림이 위", () => {
    expect(html).toContain("안 읽은 알림 2건 · 전체 4건");
    expect(html).toContain("새 매장 · 더새매장");
    expect(html.indexOf("더새매장")).toBeLessThan(html.indexOf("가짜읽음매장"));
    expect(html.indexOf("가짜읽음매장")).toBeLessThan(html.indexOf("가짜처리매장"));
    for (const label of ["새 알림", "읽음", "처리됨"]) expect(html).toContain(label);
  });
  it("전후 비교는 달라진 칸이 있을 때만 버튼으로(처음엔 접힘), 처리됨 항목에는 읽음·처리 버튼이 없다", () => {
    expect(html).toContain("전후 비교 보기 (2칸)");
    expect(html).not.toContain("서울 중구 가짜로 9");
    expect((html.match(/읽음 표시/g) || []).length).toBe(2);
    expect((html.match(/>거래처에 반영</g) || []).length).toBe(3);
  });
  it("새 주문은 읽음만 표시하고 거래처 반영 버튼은 만들지 않는다", () => {
    const order = { id: "order", notificationType: "new_order", createdAt: "2026-11-17T00:00:00Z" };
    const orderHtml = renderToStaticMarkup(<NotificationList canProcess={(item) => item.notificationType !== "new_order"} items={[order]} onMarkRead={() => undefined} onProcess={() => undefined} titles={{ new_order: "새 주문" }} />);
    expect(orderHtml).toContain("새 주문");
    expect(orderHtml).toContain("읽음 표시");
    expect(orderHtml).not.toContain("거래처에 반영");
  });
  it("비어 있으면 안내, 처리 중 항목은 버튼 잠금", () => {
    expect(renderToStaticMarkup(<NotificationList items={[]} />)).toContain("새 알림이 없습니다.");
    expect(renderToStaticMarkup(<NotificationList busyId="n2" items={items} onProcess={() => undefined} />)).toContain("처리 중…");
  });
});
