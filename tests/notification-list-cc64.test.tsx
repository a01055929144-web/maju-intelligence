import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NotificationList } from "../components/ui/notification-list";

const base = { createdAt: "2026-11-16T01:00:00Z" };
const items = [
  { ...base, id: "1", notificationType: "new_order", subject: "가짜상점A" },
  { ...base, id: "2", notificationType: "store_profile_changed", subject: "가짜상점B", createdAt: "2026-11-16T03:00:00Z" },
  { ...base, id: "3", notificationType: "new_order", subject: "가짜상점C", readAt: "2026-11-16T02:00:00Z" }
];
const titles = { new_order: "새 주문", store_profile_changed: "매장 정보 변경" };

it("종류별 묶음: 묶음 제목 · 안 읽은 개수 배지 · 묶음 순서는 맨 앞 항목 순", () => {
  const html = renderToStaticMarkup(<NotificationList groupByType items={items} onMarkRead={() => undefined} titles={titles} />);
  expect(html.indexOf("매장 정보 변경")).toBeLessThan(html.indexOf("새 주문"));
  expect(html).toContain('role="group"');
  expect(html).toContain('aria-label="안 읽은 1건"');
  expect(html).toContain("안 읽은 알림 2건 · 전체 3건");
});
it("묶음을 안 켜면 기존처럼 한 목록, 전체 개수 배지만", () => {
  const html = renderToStaticMarkup(<NotificationList items={items} titles={titles} />);
  expect(html).not.toContain("<h3");
  expect(html).toContain(">2</span>");
});
it("빈 화면 · 오류 화면(다시 시도) · 키보드 순서(읽음 표시 → 처리, 항목 순서대로)", () => {
  expect(renderToStaticMarkup(<NotificationList emptyDescription="새 주문이 들어오면 여기에 보입니다." items={[]} />)).toContain("새 주문이 들어오면");
  const err = renderToStaticMarkup(<NotificationList error="알림을 불러오지 못했습니다." items={items} onRetry={() => undefined} />);
  expect(err).toContain('role="alert"');
  expect(err).toContain("다시 시도");
  expect(err).not.toContain("가짜상점A");
  const list = renderToStaticMarkup(<NotificationList items={[items[0]]} onMarkRead={() => undefined} onProcess={() => undefined} />);
  expect(list.indexOf("읽음 표시")).toBeLessThan(list.indexOf(">처리<"));
});
