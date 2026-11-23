import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BusinessIdentityFields, businessIdentityBlocked } from "../components/partners/business-identity-fields";

it("사업자 정보 칸: 4칸 라벨, 법인일 때만 법인등록번호, 충돌 안내와 중복 허용 링크", () => {
  const html = renderToStaticMarkup(<BusinessIdentityFields notice={{ kind: "blocked", peerName: "가짜 본점" }} onChange={() => undefined} value={{ businessEntityType: "corporation", subBusinessNumber: "12" }} />);
  for (const text of ["사업자 상호", "종사업장번호", "개인 / 법인", "법인등록번호", "중복 허용 사업자번호에 추가", "가짜 본점", "숫자 4자리여야 합니다"]) expect(html).toContain(text);
  expect(renderToStaticMarkup(<BusinessIdentityFields onChange={() => undefined} value={{ businessEntityType: "individual" }} />)).not.toContain("법인등록번호");
});
it("저장 막힘 판정: 4자리·13자리·충돌", () => {
  expect(businessIdentityBlocked({ subBusinessNumber: "0002" })).toBe(false);
  expect(businessIdentityBlocked({ subBusinessNumber: "12" })).toBe(true);
  expect(businessIdentityBlocked({ corporateRegistrationNumber: "123" })).toBe(true);
  expect(businessIdentityBlocked({}, { kind: "blocked", peerName: "x" })).toBe(true);
  expect(businessIdentityBlocked({}, { kind: "info", peerName: "x" })).toBe(false);
});
