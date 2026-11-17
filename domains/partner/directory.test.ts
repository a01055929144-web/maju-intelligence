import { expect, it } from "vitest";
import { filterPartnerRows, formatBusinessNumber, parseSubBusinessNumber, partnerDocumentHref, PARTNER_LABELS, PARTNER_TABS, type PartnerRow } from "./directory";

const row = (id: string, over: Partial<PartnerRow> = {}): PartnerRow => ({ id, displayName: `가짜${id}`, status: "활성", ...over });

it("두 화면이 같은 탭 순서를 쓰고 라벨만 다르다", () => {
  expect(PARTNER_TABS.map(([, label]) => label)).toEqual(["기본 정보", "품목/단가", "전표", "원장", "메모"]);
  expect([PARTNER_LABELS.customer.balance, PARTNER_LABELS.supplier.balance]).toEqual(["미수금", "미지급금"]);
});
it("사업자번호 형식과 종사업장번호(숫자 4자리, 비우면 없음)", () => {
  expect(formatBusinessNumber("1234567890")).toBe("123-45-67890");
  expect(formatBusinessNumber("12345")).toBe("123-45");
  expect(parseSubBusinessNumber("0002")).toEqual({ ok: true, value: "0002" });
  expect(parseSubBusinessNumber("")).toEqual({ ok: true, value: "" });
  expect(parseSubBusinessNumber("12")).toEqual({ ok: false });
  expect(parseSubBusinessNumber("00a2")).toEqual({ ok: false });
});
it("전표 쓰기 주소는 거래처 종류·id(와 회사)를 싣는다", () => {
  expect(partnerDocumentHref("supplier", "s1")).toBe("/operations/documents?partnerType=supplier&partnerId=s1");
  expect(partnerDocumentHref("customer", "c1", "co")).toBe("/operations/documents?companyId=co&partnerType=customer&partnerId=c1");
});
it("검색: 상호 · 사업자 상호 · 사업자번호(숫자만) · 대표자", () => {
  const rows = [row("1", { businessName: "주식회사 가짜", businessNumber: "123-45-67890" }), row("2", { representativeName: "홍길동" }), row("3")];
  expect(filterPartnerRows(rows, "주식회사").map((r) => r.id)).toEqual(["1"]);
  expect(filterPartnerRows(rows, "1234567").map((r) => r.id)).toEqual(["1"]);
  expect(filterPartnerRows(rows, "홍길").map((r) => r.id)).toEqual(["2"]);
  expect(filterPartnerRows(rows, "").length).toBe(3);
});
