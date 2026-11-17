import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PartnerDirectory } from "../components/partners/partner-directory";
import type { PartnerRow } from "../domains/partner/directory";

const rows: PartnerRow[] = [{ id: "p1", displayName: "가짜상점 청담점", businessName: "주식회사 가짜", businessNumber: "1234567890", subBusinessNumber: "0002", status: "거래중" }];

it("매출처 · 매입처가 같은 틀: 같은 상세 탭 순서와 같은 위쪽 버튼 3개, 라벨만 다르다", () => {
  const html = (type: "customer" | "supplier") => renderToStaticMarkup(<PartnerDirectory partnerType={type} registerHref="/x" rows={rows} uploadHref="/up" />);
  for (const type of ["customer", "supplier"] as const) {
    const out = html(type);
    const tabs = ["기본 정보", "품목/단가", "전표", "원장", "메모"].map((label) => out.indexOf(`>${label}<`));
    expect(tabs.every((index) => index > 0)).toBe(true);
    expect([...tabs].sort((a, b) => a - b)).toEqual(tabs);
    expect(out).toContain("등록");
    expect(out).toContain("엑셀 올리기");
    expect(out).toContain(`partnerType=${type}&amp;partnerId=p1`);
  }
  expect(html("customer")).toContain("미수금");
  expect(html("supplier")).toContain("미지급금");
  expect(html("customer")).toContain("사업자 상호 주식회사 가짜 · 종사업장 0002");
});
it("행이 없으면 전표 쓰기는 비활성, 안내 글", () => {
  const out = renderToStaticMarkup(<PartnerDirectory partnerType="supplier" rows={[]} uploadHref="/up" />);
  expect(out).toContain("매입처를 고르면 상세가 보입니다.");
  expect(out).toContain('disabled=""');
  expect(out).toContain("전표 쓰기");
});
