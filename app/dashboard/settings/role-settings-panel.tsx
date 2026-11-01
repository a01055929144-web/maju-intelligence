"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ROLE_GROUPS,
  ROLE_PERMISSION_KEYS,
  ROLE_PERMISSION_LABELS,
  resolveRolePermissions,
  type RoleGroupKey,
  type RolePermissionKey
} from "@/domains/organization/role-settings";

type RoleMember = {
  email: string;
  groupKey: RoleGroupKey;
  name: string;
  overrides: Partial<Record<RolePermissionKey, boolean>>;
  userId: string;
};

type RoleSettingsInitialData = { currentUserId: string; members: RoleMember[] };

export function RoleSettingsPanel({ initialData }: { initialData?: RoleSettingsInitialData } = {}) {
  const [members, setMembers] = useState<RoleMember[]>(initialData?.members ?? []);
  const [currentUserId, setCurrentUserId] = useState(initialData?.currentUserId ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupKey, setGroupKey] = useState<RoleGroupKey>("sales");
  const [permissions, setPermissions] = useState<RolePermissionKey[]>(ROLE_GROUPS.sales.permissions);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialData) return;
    fetch("/api/customer/role-settings", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json().catch(() => null) }))
      .then(({ ok, payload }) => {
        if (!ok) throw new Error(payload?.message || "권한 정보를 불러오지 못했습니다.");
        setMembers(payload.members || []);
        setCurrentUserId(payload.currentUserId || "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "권한 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [initialData]);

  const selectedMembers = useMemo(() => members.filter((member) => selected.includes(member.userId)), [members, selected]);
  const currentMember = members.find((member) => member.userId === currentUserId);
  const mixedOwnerBatch = currentMember?.groupKey === "owner" && selected.length > 1 && selected.includes(currentUserId);
  const overrides = useMemo(() => {
    const defaults = new Set(ROLE_GROUPS[groupKey].permissions);
    return Object.fromEntries(ROLE_PERMISSION_KEYS.flatMap((key) => permissions.includes(key) === defaults.has(key) ? [] : [[key, permissions.includes(key)]]));
  }, [groupKey, permissions]);

  function chooseGroup(next: RoleGroupKey) {
    setGroupKey(next);
    setPermissions([...ROLE_GROUPS[next].permissions]);
  }

  function togglePermission(key: RolePermissionKey) {
    setPermissions((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function apply() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer/role-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupKey, overrides, targetUserIds: selected })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "권한 일괄 적용에 실패했습니다.");
      setMembers((current) => current.map((member) => selected.includes(member.userId) ? { ...member, groupKey, overrides } : member));
      setSelected([]);
      setMessage("선택한 사람의 권한을 한 번에 적용했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "권한 일괄 적용에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <Card className="border-violet-200 shadow-sm">
      <CardHeader className="border-b border-violet-100 bg-violet-50/60">
        <CardTitle className="flex items-center gap-2 text-xl"><ShieldCheck className="h-5 w-5 text-violet-700" />직원 · 권한 일괄 설정</CardTitle>
        <p className="text-sm text-slate-600">사람 선택 → 권한 묶음과 개별 권한 → 미리보기 → 일괄 적용 순서로 진행합니다.</p>
      </CardHeader>
      <CardContent className="grid gap-5 p-4 lg:grid-cols-2 lg:p-6">
        <section aria-labelledby="role-step-1" className="rounded-xl border p-4">
          <h3 className="font-black" id="role-step-1">① 사람 고르기</h3>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {members.map((member) => (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2" key={member.userId}>
                <input checked={selected.includes(member.userId)} onChange={() => setSelected((current) => current.includes(member.userId) ? current.filter((id) => id !== member.userId) : [...current, member.userId])} type="checkbox" />
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{member.name}{member.userId === currentUserId ? " (나)" : ""}</span><span className="block truncate text-xs text-slate-500">{member.email || ROLE_GROUPS[member.groupKey].label}</span></span>
              </label>
            ))}
            {!members.length ? <p className="text-sm text-slate-500">가입 완료된 직원이 없습니다.</p> : null}
          </div>
        </section>

        <section aria-labelledby="role-step-2" className="rounded-xl border p-4">
          <h3 className="font-black" id="role-step-2">② 권한 묶음 + 개별 체크</h3>
          <select aria-label="권한 묶음" className="mt-3 h-11 w-full rounded-lg border bg-white px-3 text-sm font-bold" onChange={(event) => chooseGroup(event.target.value as RoleGroupKey)} value={groupKey}>
            {(Object.keys(ROLE_GROUPS) as RoleGroupKey[]).map((key) => <option key={key} value={key}>{ROLE_GROUPS[key].label}</option>)}
          </select>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ROLE_PERMISSION_KEYS.map((key) => (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold" key={key}>
                <input checked={permissions.includes(key)} onChange={() => togglePermission(key)} type="checkbox" />{ROLE_PERMISSION_LABELS[key]}
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="role-step-3" className="rounded-xl border p-4 lg:col-span-2">
          <h3 className="font-black" id="role-step-3">③ 미리보기</h3>
          <p className="mt-2 text-sm font-bold text-violet-800"><Users className="mr-1 inline h-4 w-4" />{selectedMembers.map((member) => member.name).join(", ") || "사람을 선택해주세요."} → {ROLE_GROUPS[groupKey].label}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ROLE_PERMISSION_KEYS.map((key) => {
              const allowed = permissions.includes(key);
              return <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${allowed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-400 line-through"}`} key={key}>{allowed ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}{ROLE_PERMISSION_LABELS[key]}</div>;
            })}
          </div>
          {ROLE_GROUPS[groupKey].mobileOnly ? <p className="mt-3 text-xs font-bold text-amber-700">PC 메뉴는 보이지 않고 모바일 영업 화면만 사용할 수 있습니다.</p> : null}
        </section>

        <section aria-labelledby="role-step-4" className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 lg:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-black" id="role-step-4">④ 선택한 사람에게 일괄 적용</h3><p className="text-xs text-slate-600">서버의 단일 트랜잭션으로 권한과 감사 기록을 함께 저장합니다.</p></div>
          <Button className="bg-violet-700 hover:bg-violet-800" disabled={!selected.length || mixedOwnerBatch || saving} onClick={apply} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{selected.length}명에게 적용</Button>
        </section>
        {mixedOwnerBatch ? <p className="text-sm font-bold text-rose-700 lg:col-span-2">대표 자신의 권한은 다른 사람과 함께 일괄로 바꿀 수 없습니다.</p> : null}
        {message ? <p aria-live="polite" className="text-sm font-bold text-slate-700 lg:col-span-2" role="status">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
