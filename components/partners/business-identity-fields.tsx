"use client";

import Link from "next/link";
import type { IdentityNotice } from "@/domains/partner/business-identity-notice";
import { isValidCorporateRegistrationNumber } from "@/domains/partner/business-identity-notice";
import { parseSubBusinessNumber } from "@/domains/partner/directory";

// CC-70: 매출처(와 이어서 매입처) 등록·수정이 같이 쓰는 사업자 정보 칸. 종사업장번호는 company_profiles.sub_business_number와 같은 규칙(숫자 4자리, 비우면 없음).
// 매장/표시 상호(customer_name)·사업자번호·대표자는 쓰는 화면이 이미 가진 칸을 쓰고, 여기서는 새로 생긴 4칸과 안내만 맡는다.
export type BusinessIdentityValue = {
  businessName?: string;
  subBusinessNumber?: string;
  businessEntityType?: "individual" | "corporation" | "";
  corporateRegistrationNumber?: string;
};

type Props = {
  readonly value: BusinessIdentityValue;
  readonly onChange: (next: BusinessIdentityValue) => void;
  readonly notice?: IdentityNotice;
  readonly displayName?: string;
  /** 중복 허용 사업자번호 설정 화면 주소(회사 미리보기면 companyId 포함). */
  readonly exceptionsHref?: string;
};

/** 저장 전에 막아야 하는 입력이 있는지(4자리 · 13자리 · 같은 사업자번호 충돌). */
export function businessIdentityBlocked(value: BusinessIdentityValue, notice?: IdentityNotice): boolean {
  return !parseSubBusinessNumber(value.subBusinessNumber).ok || !isValidCorporateRegistrationNumber(value.corporateRegistrationNumber) || notice?.kind === "blocked";
}

const input = "maju-input mt-1 w-full";
export function BusinessIdentityFields({ displayName, exceptionsHref = "/dashboard/settings/advanced", notice, onChange, value }: Props) {
  const subBad = !parseSubBusinessNumber(value.subBusinessNumber).ok;
  const corpBad = !isValidCorporateRegistrationNumber(value.corporateRegistrationNumber);
  const set = (patch: BusinessIdentityValue) => onChange({ ...value, ...patch });
  return (
    <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-black text-slate-600">사업자 정보</legend>
      <label className="text-sm font-semibold">사업자 상호
        <input className={input} maxLength={100} onChange={(event) => set({ businessName: event.target.value })} placeholder={displayName ? `비우면 매장 상호(${displayName})와 같음` : "비우면 매장 상호와 같음"} value={value.businessName ?? ""} />
      </label>
      <label className="text-sm font-semibold">종사업장번호 <span className="text-xs font-normal text-slate-500">(숫자 4자리, 선택)</span>
        <input aria-invalid={subBad} className={input} inputMode="numeric" maxLength={4} onChange={(event) => set({ subBusinessNumber: event.target.value.replace(/\D/g, "") })} placeholder="예: 0002" value={value.subBusinessNumber ?? ""} />
        {subBad ? <span className="text-xs font-bold text-rose-700" role="alert">종사업장번호는 숫자 4자리여야 합니다.</span> : null}
      </label>
      <label className="text-sm font-semibold">개인 / 법인
        <select className={input} onChange={(event) => set({ businessEntityType: event.target.value as BusinessIdentityValue["businessEntityType"] })} value={value.businessEntityType ?? ""}>
          <option value="">선택 안 함</option>
          <option value="individual">개인</option>
          <option value="corporation">법인</option>
        </select>
      </label>
      {value.businessEntityType === "corporation" ? (
        <label className="text-sm font-semibold">법인등록번호 <span className="text-xs font-normal text-slate-500">(13자리, 선택)</span>
          <input aria-invalid={corpBad} className={input} inputMode="numeric" maxLength={14} onChange={(event) => set({ corporateRegistrationNumber: event.target.value.replace(/[^0-9-]/g, "") })} value={value.corporateRegistrationNumber ?? ""} />
          {corpBad ? <span className="text-xs font-bold text-rose-700" role="alert">법인등록번호는 숫자 13자리여야 합니다.</span> : null}
        </label>
      ) : null}
      {notice?.kind === "info" ? <p className="text-xs font-bold text-slate-600 sm:col-span-2" role="status">같은 사업자번호의 매출처 {notice.peerName}가 있습니다. 종사업장번호가 서로 달라 저장할 수 있습니다.</p> : null}
      {notice?.kind === "blocked" ? (
        <p className="rounded bg-rose-50 p-2 text-xs font-bold text-rose-800 sm:col-span-2" role="alert">
          같은 사업자번호의 매출처 {notice.peerName}가 있습니다. 종사업장이면 종사업장번호를 넣어 주세요(같은 번호이거나 비어 있으면 저장할 수 없습니다).{" "}
          <Link className="underline" href={exceptionsHref}>중복 허용 사업자번호에 추가</Link>
        </p>
      ) : null}
    </fieldset>
  );
}
