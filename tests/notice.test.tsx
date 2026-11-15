import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NOTICE_TOAST_MS, Notice, Toast, ToastClose, scheduleToastDismiss } from "../components/ui/notice";

afterEach(() => vi.useRealTimers());

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

it("Notice: 성공은 초록 + role=status, 실패는 빨강 + role=alert", () => {
  const ok = html(<Notice kind="success">저장했습니다.</Notice>);
  expect(ok).toContain('role="status"');
  expect(ok).toContain("bg-teal-50");
  expect(ok).toContain("저장했습니다.");
  const bad = html(<Notice kind="error">저장하지 못했습니다.</Notice>);
  expect(bad).toContain('role="alert"');
  expect(bad).toContain("bg-rose-50");
});

it("Notice: 다시 시도 버튼은 실패 + onRetry일 때만(휴대폰 44px)", () => {
  const retry = html(<Notice kind="error" onRetry={() => undefined}>실패</Notice>);
  expect(retry).toContain("다시 시도");
  expect(retry).toContain("max-sm:min-h-11");
  expect(html(<Notice kind="error">실패</Notice>)).not.toContain("다시 시도");
  expect(html(<Notice kind="success" onRetry={() => undefined}>성공</Notice>)).not.toContain("다시 시도");
});

it("Toast: 성공 polite/status, 실패 assertive/alert, 아래 가운데 고정, 아이콘·다시 시도", () => {
  const ok = html(<Toast icon={<i data-icon="" />}>가짜 알림</Toast>);
  expect(ok).toContain('aria-live="polite"');
  expect(ok).toContain('role="status"');
  expect(ok).toContain('aria-atomic="true"');
  expect(ok).toContain("bottom-6");
  expect(ok).toContain("data-icon");
  const bad = html(<Toast kind="error" onRetry={() => undefined}>가짜 실패</Toast>);
  expect(bad).toContain('aria-live="assertive"');
  expect(bad).toContain('role="alert"');
  expect(bad).toContain("다시 시도");
});

it("토스트가 사라지는 시간은 한 값", () => {
  expect(NOTICE_TOAST_MS).toBe(6000);
});

it("실패 토스트는 시간이 지나도 자동으로 안 닫힌다(onDismiss 안 불림)", () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  expect(scheduleToastDismiss("error", onDismiss)).toBeNull();
  vi.advanceTimersByTime(NOTICE_TOAST_MS * 5);
  expect(onDismiss).not.toHaveBeenCalled();
});

it("성공 토스트는 NOTICE_TOAST_MS 뒤 onDismiss가 불리고, 취소하면 안 불린다", () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  scheduleToastDismiss("success", onDismiss);
  vi.advanceTimersByTime(NOTICE_TOAST_MS - 1);
  expect(onDismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  const cancel = scheduleToastDismiss("success", onDismiss)!;
  cancel();
  vi.advanceTimersByTime(NOTICE_TOAST_MS * 2);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("× 닫기 버튼: aria-label '알림 닫기'·휴대폰 44px·누르면 onDismiss, Toast는 onDismiss가 있을 때만 ×를 그린다", () => {
  const onDismiss = vi.fn();
  const close = ToastClose({ onDismiss });
  expect(close.props["aria-label"]).toBe("알림 닫기");
  expect(close.props.className).toContain("max-sm:h-11");
  close.props.onClick();
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(html(<Toast onDismiss={() => undefined}>가짜</Toast>)).toContain("알림 닫기");
  expect(html(<Toast kind="error" onDismiss={() => undefined}>가짜</Toast>)).toContain("알림 닫기");
  expect(html(<Toast>가짜</Toast>)).not.toContain("알림 닫기");
});
