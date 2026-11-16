import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BottomActionBar, BottomNav, BottomSheet, MobileListRow, MobileShell, MoneyText, SlideToConfirm, clampSlide, isSlideComplete, nextSheetHeight } from "../components/ui/mobile";

it("SlideToConfirm: 85% 이상 밀어야 처리되고, 범위를 벗어나지 않는다", () => {
  expect(isSlideComplete(84, 100)).toBe(false);
  expect(isSlideComplete(85, 100)).toBe(true);
  expect(isSlideComplete(10, 0)).toBe(false);
  expect(clampSlide(-5, 100)).toBe(0);
  expect(clampSlide(150, 100)).toBe(100);
});

it("SlideToConfirm: 같은 동작의 일반 버튼이 함께 있고, 처리 중이면 비활성", () => {
  const html = renderToStaticMarkup(<SlideToConfirm label="배송 완료" onConfirm={() => undefined} />);
  expect(html).toContain('<button');
  expect(html).toContain(">배송 완료</button>");
  expect(html).toContain('aria-hidden="true"');
  expect(renderToStaticMarkup(<SlideToConfirm busy label="배송 완료" onConfirm={() => undefined} />)).toContain("disabled");
});

it("BottomSheet: 높이 단계는 작게→중간→크게→작게, docked는 모달이 아니다", () => {
  expect(nextSheetHeight("small")).toBe("medium");
  expect(nextSheetHeight("medium")).toBe("large");
  expect(nextSheetHeight("large")).toBe("small");
  const docked = renderToStaticMarkup(<BottomSheet height="small" mode="docked" onHeightChange={() => undefined} title="지금 할 일">x</BottomSheet>);
  expect(docked).not.toContain("aria-modal");
  expect(docked).toContain("h-[22vh]");
  expect(docked).toContain('aria-label="시트 높이 바꾸기"');
  expect(renderToStaticMarkup(<BottomSheet onClose={() => undefined} title="고르기">x</BottomSheet>)).toContain('aria-modal="true"');
});

it("BottomNav: 항목·가운데 버튼·선택 표시", () => {
  const html = renderToStaticMarkup(<BottomNav ariaLabel="바로가기" center={{ icon: <i />, label: "기록", onClick: () => undefined }} items={[{ active: true, href: "/a", icon: <i />, label: "오늘" }, { href: "/b", icon: <i />, label: "지도" }, { href: "/c", icon: <i />, label: "리드" }, { href: "/d", icon: <i />, label: "코스" }]} />);
  expect(html).toContain('aria-label="바로가기"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain('aria-label="기록"');
  expect(html.indexOf("지도")).toBeLessThan(html.indexOf('aria-label="기록"'));
  expect(html.indexOf('aria-label="기록"')).toBeLessThan(html.indexOf("리드"));
});

it("MoneyText·MobileListRow·MobileShell·BottomActionBar", () => {
  expect(renderToStaticMarkup(<MoneyText value={1234567} />)).toMatch(/whitespace-nowrap.*1,234,567원/);
  const row = renderToStaticMarkup(<MobileListRow subtitle="서울 중구" title="가짜식당" trailing={<MoneyText value={5000} />} />);
  expect(row).toContain("가짜식당");
  expect(row).toContain("서울 중구");
  expect(renderToStaticMarkup(<MobileShell backHref="/x" title="제목">본문</MobileShell>)).toContain('aria-label="뒤로"');
  const bar = renderToStaticMarkup(<BottomActionBar busy onClick={() => undefined}>도착</BottomActionBar>);
  expect(bar).toContain("처리 중");
  expect(bar).toContain("disabled");
});
