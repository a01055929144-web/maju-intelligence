"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle2, Copy, Link2, Plus, Send, ShieldCheck, Smartphone, Tags, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriverSelectField } from "@/components/driver-select-field";
import { formatPhoneNumber } from "@/lib/phone";
import { DEFAULT_STAFF_JOB_TITLES, type CompanyJobTitle, type StaffInvitation } from "@/lib/store";

const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

function isErrorMessage(message: string) {
  return ["실패", "오류", "않", "필요", "맞지", "준비"].some((keyword) => message.includes(keyword));
}

export function StaffManagementPanel({
  canManageMembers,
  initialInvitations,
  initialJobTitles,
  managerOptions,
  vehicleOptions
}: {
  canManageMembers: boolean;
  initialInvitations: StaffInvitation[];
  initialJobTitles: CompanyJobTitle[];
  managerOptions: string[];
  vehicleOptions: string[];
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [form, setForm] = useState({ employeeName: "", employeePhone: "", role: "driver" as string });
  // 거래처에 실제 등록된 담당자명/배송차량 목록입니다. 화면에서 "+ 새 담당자/배송차 추가"로 입력한
  // 이름은 거래처에 저장되는 값이 아니라 이 직원의 배정 기준(override)으로만 쓰이므로 서버에 다시
  // 등록할 필요 없이 이 세션의 선택지 목록에만 더해서 바로 고를 수 있게 합니다.
  const [managerChoices, setManagerChoices] = useState(managerOptions);
  const [vehicleChoices, setVehicleChoices] = useState(vehicleOptions);
  // 기본 4개(배송기사/영업직원/현장관리자/일반직원)는 권한 체계와 연결돼 있어 항상 고정으로
  // 제공되고, 회사가 직접 추가한 담당 업무 이름표만 이 상태로 관리됩니다(추가/삭제 가능).
  const [jobTitles, setJobTitles] = useState(initialJobTitles);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [addingJobTitle, setAddingJobTitle] = useState(false);
  const [removingJobTitleId, setRemovingJobTitleId] = useState("");
  const roleOptions: Array<{ label: string; value: string }> = [
    ...DEFAULT_STAFF_JOB_TITLES,
    ...jobTitles.map((jobTitle) => ({ label: jobTitle.label, value: jobTitle.label }))
  ];
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(30);
  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length;
  const acceptedCount = invitations.filter((invitation) => invitation.status === "accepted").length;
  const linkedCount = invitations.filter((invitation) => Boolean(invitation.acceptedBy)).length;
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

  async function deleteStaff(invitation: StaffInvitation) {
    const confirmed = window.confirm(
      invitation.status === "accepted"
        ? `${invitation.employeeName || "이 직원"}을(를) 삭제하시겠습니까? 이미 가입된 직원이라 로그인 권한도 함께 비활성화됩니다.`
        : `${invitation.employeeName || "이 초대"}를 목록에서 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    setSavingId(invitation.id);
    setMessage("");

    const response = await fetch("/api/customer/staff-invitations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: invitation.id })
    });
    const payload = await response.json().catch(() => null);
    setSavingId("");

    if (!response.ok) {
      setMessage(payload?.message || "직원 삭제에 실패했습니다.");
      return;
    }

    setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    setMessage("직원을 삭제했습니다.");
  }

  async function saveAssignment(invitation: StaffInvitation, patch: { assignedManagerName: string; assignedVehicle: string }) {
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
      setMessage(payload?.message || "배정 기준 저장에 실패했습니다.");
      return;
    }

    const updated = payload.invitation as StaffInvitation;
    setInvitations((current) => current.map((item) => (item.id === updated.id ? { ...updated, matchedCustomerCount: item.matchedCustomerCount } : item)));
    setMessage(payload.persisted ? "배정 기준 저장이 완료되었습니다. 목록을 새로고침하면 매칭 거래처 수가 갱신됩니다." : "배정 기준이 화면에 반영되었습니다. 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function addJobTitle() {
    if (!newJobTitle.trim() || addingJobTitle) return;
    setAddingJobTitle(true);
    setMessage("");

    const response = await fetch("/api/company-job-titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newJobTitle })
    });
    const payload = await response.json().catch(() => null);
    setAddingJobTitle(false);

    if (!response.ok) {
      setMessage(payload?.message || "담당 업무 추가에 실패했습니다.");
      return;
    }

    setJobTitles((current) => [...current, payload.jobTitle as CompanyJobTitle]);
    setNewJobTitle("");
    setMessage(payload.persisted ? "담당 업무를 추가했습니다." : "담당 업무가 화면에 반영되었습니다. 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function removeJobTitle(jobTitle: CompanyJobTitle) {
    const confirmed = window.confirm(`"${jobTitle.label}" 담당 업무 항목을 삭제하시겠습니까? 이미 이 값으로 지정된 직원의 표시는 그대로 남습니다.`);
    if (!confirmed) return;

    setRemovingJobTitleId(jobTitle.id);
    setMessage("");

    const response = await fetch(`/api/company-job-titles?id=${encodeURIComponent(jobTitle.id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setRemovingJobTitleId("");

    if (!response.ok) {
      setMessage(payload?.message || "담당 업무 삭제에 실패했습니다.");
      return;
    }

    setJobTitles((current) => current.filter((item) => item.id !== jobTitle.id));
    setMessage(`"${jobTitle.label}" 항목을 삭제했습니다.`);
  }

  async function copyText(value: string, nextMessage: string) {
    await navigator.clipboard?.writeText(value).catch(() => null);
    setMessage(nextMessage);
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
        <StaffSignal icon={<CheckCircle2 className="h-4 w-4" />} label="고유ID 연결" value={`${linkedCount}명`} />
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
              title="3. 거래처 배정"
              description="가입 후 거래처 담당자 값과 연결되면 모바일에 담당 거래처만 표시됩니다."
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
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                  <p className="mt-1 truncate text-xs font-bold text-slate-500">{formatPhoneNumber(invitation.employeePhone) || "연락처 미입력"}</p>
                </div>
                <Badge className={invitation.status === "accepted" ? "bg-emerald-100 text-emerald-800" : invitation.status === "revoked" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                  {getStatusLabel(invitation.status)}
                </Badge>
              </div>

              <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="font-black text-slate-900">배정 기준</p>
                  <p className="mt-1 truncate">{getAssignmentLabel(invitation)}</p>
                </div>
                {invitation.acceptedBy ? (
                  <Button
                    className="h-8 px-2 text-xs"
                    disabled={!canManageMembers}
                    onClick={() => copyText(invitation.acceptedBy || "", "직원 고유 ID를 복사했습니다.")}
                    type="button"
                    variant="outline"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    ID
                  </Button>
                ) : null}
              </div>

              {invitation.status === "accepted" ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-900">거래처 매칭</p>
                    {typeof invitation.matchedCustomerCount === "number" ? (
                      <Badge className={invitation.matchedCustomerCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}>
                        {invitation.matchedCustomerCount > 0 ? `${invitation.matchedCustomerCount}곳 매칭됨` : "매칭 안 됨"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    거래처의 배송담당자/차량 표기가 직원명과 다르면 매칭이 안 됩니다. 그럴 때만 아래에 실제 등록된 담당자명 또는 차량번호를 입력해 수동으로 연결하세요.
                  </p>
                  <StaffAssignmentEditor
                    canEdit={canManageMembers}
                    invitation={invitation}
                    managerOptions={managerChoices}
                    onAddManagerOption={(name) => setManagerChoices((current) => (current.includes(name) ? current : [...current, name].sort((a, b) => a.localeCompare(b, "ko"))))}
                    onAddVehicleOption={(name) => setVehicleChoices((current) => (current.includes(name) ? current : [...current, name].sort((a, b) => a.localeCompare(b, "ko"))))}
                    onSave={(patch) => saveAssignment(invitation, patch)}
                    saving={savingId === invitation.id}
                    vehicleOptions={vehicleChoices}
                  />
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
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
                <Button disabled={!canManageMembers || savingId === invitation.id} onClick={() => copyText(invitation.inviteUrl, "초대 링크를 복사했습니다.")} type="button" variant="outline">
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
                <Button
                  className="text-rose-700 hover:bg-rose-50"
                  disabled={!canManageMembers || savingId === invitation.id}
                  onClick={() => deleteStaff(invitation)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  삭제
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

              <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-white p-3">
                <p className="text-xs font-black text-slate-900">담당 업무 항목 관리</p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                  배송기사·영업직원·현장관리자·일반직원은 기본 제공 항목이라 삭제할 수 없습니다. 필요한 이름을 자유롭게 추가·삭제하세요.
                </p>
                {jobTitles.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {jobTitles.map((jobTitle) => (
                      <li key={jobTitle.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                        <span className="truncate text-xs font-bold text-slate-700">{jobTitle.label}</span>
                        <button
                          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={removingJobTitleId === jobTitle.id}
                          onClick={() => removeJobTitle(jobTitle)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setNewJobTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addJobTitle();
                    }}
                    placeholder="새 담당 업무 이름 (예: 냉동창고 관리)"
                    value={newJobTitle}
                  />
                  <Button className="h-9 shrink-0 px-2.5 text-xs" disabled={!newJobTitle.trim() || addingJobTitle} onClick={addJobTitle} type="button" variant="outline">
                    {addingJobTitle ? "추가 중" : "추가"}
                  </Button>
                </div>
              </div>
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

// 자동 이름 매칭이 실패하는 직원을 위한 수동 연결 입력창입니다. 직원마다 독립된 입력 상태를
// 가져야 해서(목록 전체가 하나의 상태를 공유하면 다른 직원 입력 중 포커스가 튐) 부모의
// invitations 배열과 별개로 이 컴포넌트 안에서만 편집 중 텍스트를 들고 있습니다.
function StaffAssignmentEditor({
  canEdit,
  invitation,
  managerOptions,
  onAddManagerOption,
  onAddVehicleOption,
  onSave,
  saving,
  vehicleOptions
}: {
  canEdit: boolean;
  invitation: StaffInvitation;
  managerOptions: string[];
  onAddManagerOption: (name: string) => void;
  onAddVehicleOption: (name: string) => void;
  onSave: (patch: { assignedManagerName: string; assignedVehicle: string }) => void;
  saving: boolean;
  vehicleOptions: string[];
}) {
  const [managerName, setManagerName] = useState(invitation.assignedManagerName || "");
  const [vehicle, setVehicle] = useState(invitation.assignedVehicle || "");
  const dirty = managerName !== (invitation.assignedManagerName || "") || vehicle !== (invitation.assignedVehicle || "");

  if (!canEdit) {
    return invitation.assignedManagerName || invitation.assignedVehicle ? (
      <p className="mt-2 text-xs font-bold text-slate-600">
        수동 연결: {[invitation.assignedManagerName, invitation.assignedVehicle].filter(Boolean).join(" · ")}
      </p>
    ) : null;
  }

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <DriverSelectField
        compact
        driverOptions={managerOptions}
        entityLabel="담당자"
        onAddDriver={async (name) => {
          const trimmed = name.trim();
          if (!trimmed) return { ok: false, message: "담당자명을 입력하세요." };
          onAddManagerOption(trimmed);
          return { ok: true };
        }}
        onChange={setManagerName}
        value={managerName}
      />
      <DriverSelectField
        compact
        driverOptions={vehicleOptions}
        entityLabel="배송차량"
        onAddDriver={async (name) => {
          const trimmed = name.trim();
          if (!trimmed) return { ok: false, message: "배송차량명을 입력하세요." };
          onAddVehicleOption(trimmed);
          return { ok: true };
        }}
        onChange={setVehicle}
        value={vehicle}
      />
      <Button
        className="h-9 px-3 text-xs"
        disabled={!dirty || saving}
        onClick={() => onSave({ assignedManagerName: managerName, assignedVehicle: vehicle })}
        type="button"
        variant="outline"
      >
        {saving ? "저장 중" : "연결 저장"}
      </Button>
    </div>
  );
}

function getStatusLabel(status: StaffInvitation["status"]) {
  if (status === "accepted") return "가입완료";
  if (status === "expired") return "만료";
  if (status === "revoked") return "비활성";
  return "초대대기";
}

function getAssignmentLabel(invitation: StaffInvitation) {
  if (invitation.acceptedBy) return `카카오/소셜 고유 ID 연결 · ${invitation.acceptedBy}`;
  if (invitation.employeePhone) return `가입 전 · 연락처 ${invitation.employeePhone}`;
  return `가입 전 · 직원명 ${invitation.employeeName}`;
}
