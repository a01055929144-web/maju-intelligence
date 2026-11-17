import { expect, it } from "vitest";
import { businessIdentityNotice, isValidCorporateRegistrationNumber } from "./business-identity-notice";

const peers = [{ id: "a", customerName: "OO 본점", businessNumber: "123-45-67890", subBusinessNumber: "" }, { id: "b", customerName: "OO 청담점", businessNumber: "1234567890", subBusinessNumber: "0002" }];

it("사업자번호가 다르면 안내 없음", () => expect(businessIdentityNotice({ businessNumber: "999-99-99999" }, peers)).toEqual({ kind: "none" }));
it("같은 번호 + 종사업장이 다 다르면 안내만(저장 허용)", () => {
  expect(businessIdentityNotice({ businessNumber: "123-45-67890", subBusinessNumber: "0003" }, [peers[1]])).toEqual({ kind: "info", peerName: "OO 청담점" });
});
it("종사업장이 같거나 한쪽이 비면 저장 막음", () => {
  expect(businessIdentityNotice({ businessNumber: "1234567890", subBusinessNumber: "0002" }, peers)).toEqual({ kind: "blocked", peerName: "OO 청담점" });
  expect(businessIdentityNotice({ businessNumber: "1234567890", subBusinessNumber: "0003" }, peers)).toEqual({ kind: "blocked", peerName: "OO 본점" });
  expect(businessIdentityNotice({ businessNumber: "1234567890" }, [peers[1]])).toEqual({ kind: "blocked", peerName: "OO 청담점" });
});
it("자기 자신은 제외한다", () => expect(businessIdentityNotice({ id: "a", businessNumber: "1234567890" }, [peers[0]])).toEqual({ kind: "none" }));
it("법인등록번호는 13자리만", () => {
  expect(isValidCorporateRegistrationNumber("110111-1234567")).toBe(true);
  expect(isValidCorporateRegistrationNumber("")).toBe(true);
  expect(isValidCorporateRegistrationNumber("12345")).toBe(false);
});
