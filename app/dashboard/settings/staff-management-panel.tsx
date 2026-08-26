"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle2, Copy, Link2, Plus, Send, ShieldCheck, Smartphone, Tags, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StaffInvitation } from "@/lib/store";

const roleOptions: Array<{ label: string; value: StaffInvitation["role"] }> = [
  { label: "배송기사", value: "driver" },
  { label: "영업직원", value: "sales" },
  { label: "현장관리자", value: "manager" },
  { label: "일반직원", value: "member" }
];
const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

function isErrorMessage(message: string) {
  return ["실패", "오류", "않", "필요", "맞지", "준비"].some((keyword) => message.includes(keyword));
}

export function StaffManagementPanel({
  canManageMembers,
  initialInvitations
}: {
  canManageMembers: boolean;
  initialInvitations: StaffInvitation[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [form, setForm] = useState({ employeeName: "", employeePhone: "", role: "driver" as StaffInvitation["role"] });
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(30);
  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length;
  const acceptedCount = invitations.filter((invitation) => invitation.status === "accepted").length;
  const activeCount = invitations.filter((invitation) => invitation.status !== "revoked").length;
  const totalPages = Math.max(1, Math.ceil(invitations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = invitations.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(invitations.length, currentPage * pageSize);
  const pagedInvitations = invitations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function createStaff() {
    if (!form.employeeName.trim() || creating) return;
    setCreating(true);
    setMessage("");

    const response = await fetch("/api/customer/staff-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    setCreating(false);

    if (!response.ok) {
      setMessage(payload?.message || "직원 추가에 실패했습니다.");
      return;
    }

    setInvitations((current) => [payload.invitation as StaffInvitation, ...current]);
    setForm({ employeeName: "", employeePhone: "", role: "driver" });
    setMessage(payload.persisted ? "직원 초대 링크 저장이 완료되었습니다. 링크를 복사해 카카오 가입 안내에 사용하세요." : "직원 초대가 화면에 반영되었습니다. 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function updateStaff(invitation: StaffInvitation, patch: { role?: StaffInvitation["role"]; status?: "pending" | "revoked" }) {
    setSavingId(invitation.id);
    setMessage("");

    const response = await fetch("/api/customer/staff-invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationId: invitation.id,
        ...patch
      })
    });
    const payload = await response.json().catch(() => null);
    setSavingId("");

    if (!response.ok) {
      setMessage(payload?.message || "직원 정보 변경에 실패했습니다.");
      return;
    }

    const updated = payload.invitation as StaffInvitation;
    setInvitations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMessage(payload.persisted ? "직원 정보 저장이 완료되었습니다." : "직원 정보가 화면에 반영되었습니다. 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function copyInviteUrl(url: string) {
    await navigator.clipboard?.writeText(url).catch(() => null);
    setMessage("초대 링크를 복사했습니다.");
  }

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-3 w-fit bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100">
            <Users className="mr-1 h-3.5 w-3.5" />
            직원 관리
          </Badge>
          <h2 className="text-2xl font-black text-slate-950">직원 초대</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            이름과 연락처를 입력하면 카카오 가입용 초대 링크가 생성됩니다. 직원 추가·수정은 대표/관리자만 할 수 있습니다.
          </p>
        </div>
        <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{invitations.length}명</Badge>
      </div>

      <div className="grid gap-4 border-b border-slate-200 bg-white p-4 md:grid-cols-4">
        <StaffSignal icon={<Users className="h-4 w-4" />} label="등록 직원" value={`${invitations.length}명`} />
        <StaffSignal icon={<Link2 className="h-4 w-4" />} label="초대 대기" value={`${pendingCount}명`} />
        <StaffSignal icon={<Smartphone className="h-4 w-4" />} label="가입 완료" value={`${acceptedCount}명`} />
        <StaffSignal icon={<CheckCircle2 className="h-4 w-4" />} label="활성 직원" value={`${activeCount}명`} />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4 md:grid-cols-3">
            <OnboardingStep
              icon={<Link2 className="h-4 w-4" />}
              title="1. 초대 생성"
              description="관리자가 직원명, 연락처, 업무 구분을 등록합니다."
            />
            <OnboardingStep
              icon={<Smartphone className="h-4 w-4" />}
              title="2. 카카오 가입"
              description="직원은 초대 링크로 모바일 가입 흐름에 들어갑니다."
            />
            <OnboardingStep
              icon={<Tags className="h-4 w-4" />}
              title="3. 업무 구분"
              description="역할은 표시와 필터 기준입니다. 초대 관리 자체는 대표/관리자만 가능합니다."
            />
          </div>

          {invitations.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                보기
                <select
                  className="h-6 border-0 bg-transparent p-0 text-xs font-black text-slate-900 outline-none focus:ring-0"
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as ListPageSize);
                    setPage(1);
                  }}
                  value={pageSize}
                >
                  {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}개
                    </option>
                  ))}
                </select>
              </label>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {invitations.length.toLocaleString()}명
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                이전
              </button>
              <span className="text-xs font-black text-slate-400">
                {currentPage.toLocaleString()} / {totalPages.toLocaleString()}
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                type="button"
              >
                다음
              </button>
            </div>
          ) : null}

          {pagedInvitations.map((invitation) => (
            <div key={invitation.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-950">{invitation.employeeName}</p>
                  <p className="mt-1 truncate text-xs font-bold text-slate-500">{invitation.employeePhone || "연락처 미입력"}</p>
                </div>
                <Badge className={invitation.status === "accepted" ? "bg-emerald-100 text-emerald-800" : invitation.status === "revoked" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                  {getStatusLabel(invitation.status)}
                </Badge>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canManageMembers || savingId === invitation.id}
                  value={invitation.role}
                  onChange={(event) => updateStaff(invitation, { role: event.target.value as StaffInvitation["role"] })}
                >
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <Button disabled={!canManageMembers || savingId === invitation.id} onClick={() => copyInviteUrl(invitation.inviteUrl)} type="button" variant="outline">
                  <Copy className="h-4 w-4" />
                  링크
                </Button>
                <Button
                  disabled={!canManageMembers || savingId === invitation.id}
                  onClick={() => updateStaff(invitation, { status: invitation.status === "revoked" ? "pending" : "revoked" })}
                  type="button"
                  variant="outline"
                >
                  {savingId === invitation.id ? "저장 중" : invitation.status === "revoked" ? "재활성화" : "비활성화"}
                </Button>
              </div>
              <p className="mt-3 truncate rounded-md bg-slate-50 px-3 py-2 font-mono text-[11px] font-bold text-slate-500">{invitation.inviteUrl}</p>
            </div>
          ))}
          {!invitations.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold leading-6 text-slate-500">
              아직 등록된 직원 초대가 없습니다. 오른쪽에서 직원명을 입력해 카카오 가입 링크를 먼저 생성하세요.
            </div>
          ) : null}
        </div>

        <aside className="h-fit rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-black text-slate-950">직원 초대 만들기</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">생성된 링크를 직원에게 보내면 모바일 가입 흐름으로 이어집니다.</p>
            </div>
          </div>
          {canManageMembers ? (
            <div className="mt-4 grid gap-3">
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                placeholder="직원명"
                value={form.employeeName}
                onChange={(event) => setForm((prev) => ({ ...prev, employeeName: event.target.value }))}
              />
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                placeholder="연락처"
                value={form.employeePhone}
                onChange={(event) => setForm((prev) => ({ ...prev, employeePhone: event.target.value }))}
              />
              <select
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as StaffInvitation["role"] }))}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className="-mt-1 text-xs font-bold leading-5 text-slate-500">역할은 화면 정리와 담당 업무 표시용입니다.</p>
              <Button className="h-11 bg-teal-700 font-black hover:bg-teal-800" disabled={!form.employeeName.trim() || creating} onClick={createStaff} type="button">
                {creating ? <Send className="h-4 w-4 animate-pulse" /> : <Plus className="h-4 w-4" />}
                {creating ? "추가 중" : "직원 추가"}
              </Button>
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-bold leading-5 text-slate-500">
              직원 추가·역할 변경·비활성화는 대표 또는 관리자 권한이 있는 직원만 할 수 있습니다. 필요하면 대표/관리자에게 요청해주세요.
            </p>
          )}
          {message ? (
            <p className={`mt-3 rounded-md px-3 py-2 text-xs font-bold leading-5 ${isErrorMessage(message) ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
              {message}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function StaffSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-teal-700">{icon}</div>
      <p className="mt-3 text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function OnboardingStep({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg bg-white/80 p-3 ring-1 ring-inset ring-blue-100">
      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
        <span className="text-blue-700">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function getStatusLabel(status: StaffInvitation["status"]) {
  if (status === "accepted") return "가입완료";
  if (status === "expired") return "만료";
  if (status === "revoked") return "비활성";
  return "초대대기";
}
