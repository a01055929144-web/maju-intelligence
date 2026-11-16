"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Notice } from "./ui/notice";

type Profile = {
  accessNote: string;
  addressDetail: string;
  baseAddress: string;
  businessRegistrationNumber: string;
  deliveryContactPhone: string;
  preferredDeliveryTime: string;
  representativeName: string;
  storeName: string;
};

const initial: Profile = {
  accessNote: "공동 현관에서 호출",
  addressDetail: "1층 매장",
  baseAddress: "서울 중구 세종대로 110",
  businessRegistrationNumber: "1234567890",
  deliveryContactPhone: "01012345678",
  preferredDeliveryTime: "오전 9시~11시",
  representativeName: "홍대표",
  storeName: "합성 가입 매장",
};

export function StoreProfileSettingsPrep({ canEdit }: { canEdit: boolean }) {
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const field = "mt-1 min-h-[44px] w-full rounded border px-3 disabled:bg-slate-50";
  const input = (label: string, key: keyof Profile, options?: { disabled?: boolean; maxLength?: number }) => <label className="block text-sm font-medium">{label}<input
    className={field} disabled={!editing || options?.disabled} maxLength={options?.maxLength ?? 200}
    onChange={event => setDraft({ ...draft, [key]: event.target.value })} value={draft[key]}
  /></label>;
  const save = () => {
    if (!draft.baseAddress.trim()) return;
    setEditing(false); setSaved(true);
  };
  return <Card><CardHeader><CardTitle>매장 정보</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700" role="status">적용 대기: 현재 화면은 합성 데이터로 수정 권한과 입력 항목만 시험합니다. 운영 정보는 저장하지 않습니다.</p>
    {input("상호", "storeName", { maxLength: 100 })}
    {input("사업자등록번호", "businessRegistrationNumber", { disabled: true })}
    {input("대표자", "representativeName", { maxLength: 50 })}
    {input("매장 주소", "baseAddress")}
    {input("상세 주소", "addressDetail")}
    {input("출입 방법", "accessNote")}
    {input("받는 분 연락처", "deliveryContactPhone", { maxLength: 30 })}
    {input("받을 수 있는 시간", "preferredDeliveryTime", { maxLength: 100 })}
    {editing && !draft.baseAddress.trim() ? <Notice kind="error">매장 주소를 입력해 주세요.</Notice> : null}
    {canEdit ? editing ? <div className="flex gap-2"><Button disabled={!draft.baseAddress.trim()} onClick={save}>저장 시험</Button><Button onClick={() => { setDraft(initial); setEditing(false); }} variant="outline">취소</Button></div>
      : <Button onClick={() => { setEditing(true); setSaved(false); }} variant="outline">정보 수정 시험</Button>
      : <p className="text-sm text-slate-600">매장 정보 수정은 점주만 할 수 있습니다.</p>}
    {saved ? <Notice kind="success">합성 화면에서 저장 동작을 확인했습니다.</Notice> : null}
  </CardContent></Card>;
}
