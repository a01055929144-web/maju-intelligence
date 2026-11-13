import type { Page } from "@playwright/test";

// CX-11: 매장 화면 메뉴. 휴대폰(≤640px)은 하단 탭 버튼, PC는 사이드바 링크(이름이 조금 다르다).
const SIDEBAR_LABEL = { "홈": "홈", "주문": "주문", "내역": "주문 내역", "데이터": "데이터", "내 정보": "매장 정보" } as const;
export type StoreTabName = keyof typeof SIDEBAR_LABEL;

export function storeTab(page: Page, name: StoreTabName) {
  const phone = (page.viewportSize()?.width ?? 1440) <= 640;
  return phone ? page.getByRole("button", { name, exact: true }) : page.getByRole("link", { name: SIDEBAR_LABEL[name], exact: true });
}
