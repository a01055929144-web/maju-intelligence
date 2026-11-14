import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Dialog, trapTabTarget } from "../components/ui/dialog";

const noop = () => undefined;

it("Dialog: role=dialog · aria-modal · 제목 연결 · 기본 × 닫기 버튼", () => {
  const html = renderToStaticMarkup(<Dialog onClose={noop} title="가짜 팝업"><p>내용</p></Dialog>);
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toMatch(/aria-labelledby="dialog-title-\w+"/);
  expect(html).toContain('aria-label="닫기"');
  expect(html).toContain("내용");
});

it("Dialog: hideClose면 ×가 없고, 제목이 없으면 ariaLabel을 쓴다", () => {
  const html = renderToStaticMarkup(<Dialog ariaLabel="가짜 확인" hideClose onClose={noop}>x</Dialog>);
  expect(html).not.toContain('aria-label="닫기"');
  expect(html).toContain('aria-label="가짜 확인"');
});

it("Dialog: 휴대폰 전체 화면 옵션은 켰을 때만 클래스가 붙는다", () => {
  expect(renderToStaticMarkup(<Dialog fullScreenOnMobile onClose={noop} title="t">x</Dialog>)).toContain("max-sm:h-full");
  expect(renderToStaticMarkup(<Dialog onClose={noop} title="t">x</Dialog>)).not.toContain("max-sm:h-full");
});

it("trapTabTarget: 끝에서 Tab → 처음, 처음에서 Shift+Tab → 끝, 바깥이면 처음/끝, 중간은 그대로", () => {
  const list = ["a", "b", "c"];
  expect(trapTabTarget(list, "c", false)).toBe("a");
  expect(trapTabTarget(list, "a", true)).toBe("c");
  expect(trapTabTarget(list, null, false)).toBe("a");
  expect(trapTabTarget(list, null, true)).toBe("c");
  expect(trapTabTarget(list, "b", false)).toBeNull();
  expect(trapTabTarget([], null, false)).toBeNull();
});

it("ConfirmDialog: 기본은 빨간(danger) 확인 버튼, tone=default는 빨강 없음, 문구·버튼 이름 유지", () => {
  const danger = renderToStaticMarkup(<ConfirmDialog confirmLabel="삭제" message={'"가짜상회" 를 삭제합니다.'} onCancel={noop} onConfirm={noop} title="삭제 확인" />);
  expect(danger).toContain("bg-rose-600");
  expect(danger).toContain("삭제 확인");
  expect(danger).toContain("취소");
  expect(danger).toContain(">삭제<");
  expect(danger).not.toContain('aria-label="닫기"');
  const plain = renderToStaticMarkup(<ConfirmDialog message="계속할까요?" onCancel={noop} onConfirm={noop} tone="default" />);
  expect(plain).not.toContain("bg-rose-600");
  expect(plain).toContain(">확인<");
});
