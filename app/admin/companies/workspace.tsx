"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardList, Eye, EyeOff, FileSpreadsheet, KeyRound, LayoutDashboard, MapPin, Plus, ReceiptText, Save, Search, Send, Smartphone, UploadCloud, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ManagedCompanyAccount, ManagedCompanyAccountInput, StaffInvitation } from "@/lib/store";

type Props = {
  initialCompanies: ManagedCompanyAccount[];
  source: "sample" | "supabase";
};

const emptyCompany: ManagedCompanyAccountInput = {
  name: "",
  businessType: "식자재 유통",
  ownerName: "",
  originAddress: "",
  status: "active",
  customerEmail: "",
  customerPassword: ""
};

export function AdminCompaniesWorkspace({ initialCompanies, source }: Props) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [selectedId, setSelectedId] = useState(initialCompanies[0]?.id || "new");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<"all" | "active" | "needs-setup" | "paused">("all");
  const [form, setForm] = useState<ManagedCompanyAccountInput>(initialCompanies[0] || emptyCompany);
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteForm, setInviteForm] = useState({ employeeName: "", employeePhone: "", role: "driver" as StaffInvitation["role"] });
  const [inviteMessage, setInviteMessage] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);

  const filteredCompanies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return companies.filter((company) => {
      const readiness = getCompanyReadiness(company);
      const matchesKeyword =
        !keyword || [company.name, company.ownerName, company.customerEmail, company.originAddress].some((value) => value.toLowerCase().includes(keyword));
      const matchesFilter =
        companyFilter === "all" ||
        (companyFilter === "active" && company.status === "active") ||
        (companyFilter === "paused" && company.status !== "active") ||
        (companyFilter === "needs-setup" && readiness.score < 80);

      return matchesKeyword && matchesFilter;
    });
  }, [companies, companyFilter, query]);

  function selectCompany(company: ManagedCompanyAccount) {
    setSelectedId(company.id);
    setMessage("");
    setForm({
      id: company.id,
      name: company.name,
      businessType: company.businessType,
      ownerName: company.ownerName,
      originAddress: company.originAddress,
      status: company.status,
      customerEmail: company.customerEmail,
      customerPassword: company.customerPassword
    });
  }

  function startNewCompany() {
    setSelectedId("new");
    setMessage("");
    setForm(emptyCompany);
  }

  function update<K extends keyof ManagedCompanyAccountInput>(key: K, value: ManagedCompanyAccountInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/admin/companies", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      setMessage(payload?.message || "고객사 저장에 실패했습니다.");
      return;
    }

    const saved = payload.company as ManagedCompanyAccount;
    setCompanies((prev) => {
      const exists = prev.some((company) => company.id === saved.id);
      return exists ? prev.map((company) => (company.id === saved.id ? { ...company, ...saved } : company)) : [saved, ...prev];
    });
    setSelectedId(saved.id);
    setForm({
      id: saved.id,
      name: saved.name,
      businessType: saved.businessType,
      ownerName: saved.ownerName,
      originAddress: saved.originAddress,
      status: saved.status,
      customerEmail: saved.customerEmail,
      customerPassword: saved.customerPassword
    });
    setMessage(payload.persisted ? "고객사와 로그인 계정이 저장되었습니다." : "고객사 정보가 화면에 반영되었습니다. 서버 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function createInvite() {
    if (!selectedCompany) return;

    setCreatingInvite(true);
    setInviteMessage("");

    const response = await fetch("/api/admin/staff-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompany.id,
        employeeName: inviteForm.employeeName,
        employeePhone: inviteForm.employeePhone,
        role: inviteForm.role
      })
    });
    const payload = await response.json().catch(() => null);
    setCreatingInvite(false);

    if (!response.ok) {
      setInviteMessage(payload?.message || "직원 초대 생성에 실패했습니다.");
      return;
    }

    const invitation = payload.invitation as StaffInvitation;
    setCompanies((prev) =>
      prev.map((company) =>
        company.id === selectedCompany.id
          ? {
              ...company,
              staffInvitationCount: (company.staffInvitationCount || 0) + 1,
              staffInvitations: [invitation, ...(company.staffInvitations || [])].slice(0, 5)
            }
          : company
      )
    );
    setInviteForm({ employeeName: "", employeePhone: "", role: "driver" });
    setInviteMessage(payload.persisted ? "직원 카카오 가입 초대 링크가 생성되었습니다." : "초대 링크가 화면에 생성되었습니다. 서버 저장 상태는 시스템 점검에서 확인하세요.");
  }

  const selectedCompany = companies.find((company) => company.id === selectedId);
  const selectedReadiness = selectedCompany ? getCompanyReadiness(selectedCompany) : null;
  const totalCustomers = companies.reduce((sum, company) => sum + company.customerCount, 0);
  const totalSalesRows = companies.reduce((sum, company) => sum + company.salesTransactionCount, 0);
  const totalUploads = companies.reduce((sum, company) => sum + company.uploadCount, 0);
  const activeCompanies = companies.filter((company) => company.status === "active").length;
  const needsSetupCompanies = companies.filter((company) => getCompanyReadiness(company).score < 80).length;
  const pausedCompanies = companies.filter((company) => company.status !== "active").length;
  const adminActionQueue = companies
    .map((company) => ({ company, missingCheck: getFirstMissingCheck(company), readiness: getCompanyReadiness(company) }))
    .filter((item) => item.missingCheck)
    .sort((a, b) => a.readiness.score - b.readiness.score)
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <AdminSummaryCard icon={Building2} label="운영 고객사" value={`${activeCompanies.toLocaleString()}곳`} helper={`전체 ${companies.length.toLocaleString()}곳`} />
        <AdminSummaryCard icon={Users} label="총 거래처" value={`${totalCustomers.toLocaleString()}곳`} helper="회사별 분리 저장" />
        <AdminSummaryCard icon={ReceiptText} label="매출 거래행" value={`${totalSalesRows.toLocaleString()}건`} helper="거래원장 누적" />
        <AdminSummaryCard icon={UploadCloud} label="업로드 이력" value={`${totalUploads.toLocaleString()}회`} helper={source === "supabase" ? "DB 연결" : "저장 확인 필요"} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-primary">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-primary">어드민 운영 큐</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">오늘 먼저 확인할 고객사</h2>
              <p className="mt-1 text-sm font-bold text-muted-foreground">계정, 출발지, 거래처, 매출 원장, 업로드 이력 중 빠진 항목이 있는 회사를 우선 정렬합니다.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <AdminQueueMetric label="준비 미흡" value={`${needsSetupCompanies}곳`} tone="warning" />
            <AdminQueueMetric label="운영중" value={`${activeCompanies}곳`} />
            <AdminQueueMetric label="DB 상태" value={source === "supabase" ? "연결" : "확인"} tone={source === "supabase" ? "default" : "warning"} />
          </div>
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-4">
          {adminActionQueue.map(({ company, missingCheck, readiness }) => (
            <button
              key={company.id}
              className="group rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-white hover:shadow-sm"
              type="button"
              onClick={() => selectCompany(company)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{company.name}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{company.customerEmail || "로그인 계정 미등록"}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">{readiness.score}%</span>
              </div>
              <div className="mt-4 rounded-md border border-amber-100 bg-white p-3">
                <p className="text-xs font-black text-amber-800">{missingCheck?.label} 필요</p>
                <p className="mt-1 min-h-10 text-xs font-bold leading-5 text-muted-foreground">{missingCheck?.description}</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-primary">
                고객사 선택
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
          {!adminActionQueue.length ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 lg:col-span-4">
              <p className="font-black text-emerald-900">모든 고객사가 운영 준비 기준을 충족했습니다.</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">신규 업로드 실패, 출발지 변경, 계정 변경 요청만 수시로 확인하면 됩니다.</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-muted-foreground">고객사 목록</p>
              <p className="text-2xl font-black">{companies.length}곳</p>
            </div>
            <Badge className={source === "supabase" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
              {source === "supabase" ? "DB 연결" : "저장 확인 필요"}
            </Badge>
          </div>
          <div className="mt-4 flex gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="회사명, 이메일 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <Button type="button" onClick={startNewCompany}>
              <Plus className="h-4 w-4" />
              신규
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CompanyFilterButton active={companyFilter === "all"} count={companies.length} label="전체" onClick={() => setCompanyFilter("all")} />
            <CompanyFilterButton active={companyFilter === "active"} count={activeCompanies} label="운영중" onClick={() => setCompanyFilter("active")} />
            <CompanyFilterButton active={companyFilter === "needs-setup"} count={needsSetupCompanies} label="준비 미흡" onClick={() => setCompanyFilter("needs-setup")} tone="warning" />
            <CompanyFilterButton active={companyFilter === "paused"} count={pausedCompanies} label="중지" onClick={() => setCompanyFilter("paused")} />
          </div>
        </div>

        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3">
          {filteredCompanies.map((company) => (
            <button
              key={company.id}
              className={`w-full rounded-lg border p-4 text-left transition ${
                selectedId === company.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              type="button"
              onClick={() => selectCompany(company)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{company.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{company.customerEmail || "로그인 계정 미등록"}</p>
                </div>
                <Badge className={company.status === "active" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"}>
                  {company.status === "active" ? "운영" : "중지"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  거래처 {company.customerCount}곳
                </span>
                <span className="inline-flex items-center gap-1">
                  <ReceiptText className="h-3.5 w-3.5" />
                  매출 {company.salesTransactionCount}건
                </span>
                <span>{company.ownerName || "대표자 미입력"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <ListStatusBadge ok={Boolean(company.customerEmail && company.customerPassword)} label="계정" />
                <ListStatusBadge ok={Boolean(company.originAddress)} label="출발지" />
                <ListStatusBadge ok={company.customerCount > 0} label="거래처" />
                <ListStatusBadge ok={company.salesTransactionCount > 0} label="매출" />
              </div>
              <div className="mt-3">
                <ReadinessMeter readiness={getCompanyReadiness(company)} compact />
              </div>
            </button>
          ))}
          {!filteredCompanies.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm font-black text-slate-800">조건에 맞는 고객사가 없습니다.</p>
              <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">검색어 또는 운영 필터를 바꾸거나 신규 고객사를 등록하세요.</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <Badge className="mb-2 bg-slate-100 text-slate-700">{selectedCompany ? "선택 고객사" : "신규 고객사"}</Badge>
            <h2 className="text-2xl font-black">{selectedCompany?.name || "새 고객사 등록"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              회사 기본정보, 출발지, 고객사 로그인 계정을 한 번에 관리합니다.
            </p>
          </div>
          <Building2 className="h-8 w-8 text-primary" />
        </div>

        <form className="space-y-6 p-5" onSubmit={handleSubmit}>
          {selectedCompany ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black">운영 준비 상태</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">계정, 출발지, 거래처, 매출, 업로드 기준으로 고객사가 바로 쓸 수 있는지 확인합니다.</p>
                  </div>
                  {selectedReadiness ? <ReadinessMeter readiness={selectedReadiness} /> : null}
                </div>
                {selectedReadiness ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {selectedReadiness.checks.map((check) => (
                      <div key={check.label} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
                        {check.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
                        <div>
                          <p className="text-sm font-black text-slate-900">{check.label}</p>
                          <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">{check.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-black">빠른 운영 작업</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">선택 고객사의 다음 작업으로 바로 이동합니다.</p>
                <div className="mt-4 grid gap-2">
                  <QuickAction href={`/dashboard?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={LayoutDashboard} label="고객사 대시보드" primary />
                  <QuickAction href={`/crm/timeline?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={Users} label="거래처 히스토리" />
                  <QuickAction href={`/?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={UploadCloud} label="데이터 등록/업로드" />
                  <QuickAction href={`/revenue/transactions?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={ReceiptText} label="매출 원장 분석" />
                  <QuickAction href={`/routes/today?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={MapPin} label="영업·배송 코스" />
                </div>
              </div>
            </div>
          ) : null}

          {selectedCompany ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                  <div>
                    <p className="flex items-center gap-2 font-black text-slate-950">
                      <Smartphone className="h-4 w-4 text-primary" />
                      직원 카카오 가입 초대
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">배송기사와 영업직원이 카카오톡 링크로 가입한 뒤 모바일 오늘 코스를 사용합니다.</p>
                  </div>
                  <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">모바일 준비</Badge>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-[1fr_160px_150px_auto] md:items-end">
                  <Field label="직원명" value={inviteForm.employeeName} onChange={(value) => setInviteForm((prev) => ({ ...prev, employeeName: value }))} />
                  <Field label="연락처" value={inviteForm.employeePhone} onChange={(value) => setInviteForm((prev) => ({ ...prev, employeePhone: value }))} />
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-muted-foreground">역할</span>
                    <select
                      className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={inviteForm.role}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value as StaffInvitation["role"] }))}
                    >
                      <option value="driver">배송기사</option>
                      <option value="sales">영업직원</option>
                      <option value="manager">현장관리자</option>
                      <option value="member">일반직원</option>
                    </select>
                  </label>
                  <Button className="h-11" disabled={creatingInvite} onClick={createInvite} type="button">
                    <Send className="h-4 w-4" />
                    {creatingInvite ? "생성 중" : "초대 생성"}
                  </Button>
                </div>
                {inviteMessage ? (
                  <p className={inviteMessage.includes("실패") ? "mx-4 mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" : "mx-4 mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary"}>
                    {inviteMessage}
                  </p>
                ) : null}
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">최근 직원 초대</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">카카오톡으로 전달할 가입 링크입니다.</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">{selectedCompany.staffInvitationCount || 0}건</span>
                </div>
                <div className="mt-4 space-y-2">
                  {(selectedCompany.staffInvitations || []).map((invitation) => (
                    <div key={invitation.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{invitation.employeeName}</p>
                          <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{getStaffRoleLabel(invitation.role)} · {invitation.employeePhone || "연락처 미입력"}</p>
                        </div>
                        <Badge className={invitation.status === "accepted" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                          {getInvitationStatusLabel(invitation.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 rounded-md bg-slate-50 px-2 py-2 font-mono text-[11px] font-bold text-slate-600">
                        {invitation.inviteUrl}
                      </div>
                    </div>
                  ))}
                  {!(selectedCompany.staffInvitations || []).length ? (
                    <div className="rounded-md border border-dashed border-slate-200 bg-white p-4 text-sm font-bold leading-6 text-muted-foreground">
                      아직 생성된 직원 초대가 없습니다. 배송기사 또는 영업직원을 먼저 초대하세요.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {selectedCompany ? (
            <div className="grid gap-3 md:grid-cols-4">
              <DataMetric icon={Users} label="거래처" value={`${selectedCompany.customerCount.toLocaleString()}곳`} />
              <DataMetric icon={ReceiptText} label="매출 거래" value={`${selectedCompany.salesTransactionCount.toLocaleString()}건`} />
              <DataMetric icon={UploadCloud} label="업로드" value={`${selectedCompany.uploadCount.toLocaleString()}회`} />
              <DataMetric icon={FileSpreadsheet} label="마지막 업로드" value={selectedCompany.lastUploadAt || "-"} compact />
            </div>
          ) : null}

          {selectedCompany ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <p className="font-black">최근 업로드 이력</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">회사별 엑셀 업로드 성공/실패와 처리 품질을 확인합니다.</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                  최근 {selectedCompany.recentUploads.length}건
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-black text-slate-500">
                      <th className="border-b border-slate-100 px-4 py-3">파일명</th>
                      <th className="border-b border-slate-100 px-4 py-3">상태</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-right">처리 행</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-right">품질</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-right">중복</th>
                      <th className="border-b border-slate-100 px-4 py-3">업로드 시점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCompany.recentUploads.map((upload) => (
                      <tr key={upload.id} className="font-bold text-slate-800">
                        <td className="border-b border-slate-100 px-4 py-3">{upload.filename}</td>
                        <td className="border-b border-slate-100 px-4 py-3">
                          <span className={`rounded-md px-2 py-1 text-xs font-black ${upload.status === "completed" ? "bg-emerald-100 text-emerald-800" : upload.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                            {upload.status === "completed" ? "완료" : upload.status === "failed" ? "실패" : "진행중"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right">{upload.rows.toLocaleString()}</td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right">{upload.qualityScore}%</td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right">{upload.duplicateCount.toLocaleString()}</td>
                        <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{upload.createdAt}</td>
                      </tr>
                    ))}
                    {!selectedCompany.recentUploads.length ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-sm font-bold text-slate-500" colSpan={6}>
                          아직 업로드 이력이 없습니다. 거래처 마스터 또는 매출 거래내역을 업로드하면 이곳에 표시됩니다.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="고객사명" required value={form.name} onChange={(value) => update("name", value)} />
            <Field label="대표자/담당자명" value={form.ownerName || ""} onChange={(value) => update("ownerName", value)} />
            <Field label="업종" value={form.businessType || ""} onChange={(value) => update("businessType", value)} />
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">운영상태</span>
              <select
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.status || "active"}
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="active">운영</option>
                <option value="paused">중지</option>
              </select>
            </label>
          </div>

          <Field label="물류 출발지 주소" value={form.originAddress || ""} onChange={(value) => update("originAddress", value)} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-black">고객사 로그인 계정</p>
                <p className="mt-1 text-xs text-muted-foreground">이 계정으로 고객사가 자기 회사 데이터만 조회합니다.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPassword ? "숨기기" : "보기"}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="로그인 이메일" required type="email" value={form.customerEmail} onChange={(value) => update("customerEmail", value)} />
              <Field
                label="로그인 비밀번호"
                required
                type={showPassword ? "text" : "password"}
                value={form.customerPassword}
                onChange={(value) => update("customerPassword", value)}
              />
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-xs font-bold leading-5 text-muted-foreground">
                  현재 버전은 어드민이 고객사 계정을 생성/수정합니다. 추후 운영 안정화 단계에서 비밀번호 해시 저장, 임시 비밀번호 발급, 비밀번호 변경 이력으로 강화합니다.
                </p>
              </div>
            </div>
          </div>

          {form.id ? (
            <div className="flex flex-col gap-3 rounded-md bg-slate-50 px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                회사 ID: <span className="font-mono font-bold text-slate-700">{form.id}</span>
              </span>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                href={`/dashboard?companyId=${encodeURIComponent(form.id)}`}
              >
                고객사 대시보드
              </Link>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                href={`/crm/timeline?companyId=${encodeURIComponent(form.id)}`}
              >
                이 고객사 거래처 보기
              </Link>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                href={`/?companyId=${encodeURIComponent(form.id)}`}
              >
                매출/거래처 업로드
              </Link>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                href={`/revenue/transactions?companyId=${encodeURIComponent(form.id)}`}
              >
                매출 원장 보기
              </Link>
            </div>
          ) : null}

          {message ? (
            <p className={message.includes("실패") ? "rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" : "rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary"}>
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "저장 중" : form.id ? "고객사 수정 저장" : "고객사 생성"}
            </Button>
            <Button type="button" variant="outline" onClick={startNewCompany}>
              <Plus className="h-4 w-4" />
              새 고객사 입력
            </Button>
          </div>
        </form>
      </section>
      </div>
    </div>
  );
}

type CompanyReadiness = {
  checks: Array<{ description: string; label: string; ok: boolean }>;
  complete: number;
  score: number;
  total: number;
};

function getCompanyReadiness(company: ManagedCompanyAccount): CompanyReadiness {
  const checks = [
    {
      description: company.customerEmail && company.customerPassword ? "고객사 로그인 이메일과 비밀번호가 등록되어 있습니다." : "고객사 로그인 계정을 먼저 등록하세요.",
      label: "로그인 계정",
      ok: Boolean(company.customerEmail && company.customerPassword)
    },
    {
      description: company.originAddress ? "물류 출발지 주소가 있어 배송/영업 코스 계산에 사용할 수 있습니다." : "회사 출발지 주소를 입력해야 경로 계산이 가능합니다.",
      label: "출발지 주소",
      ok: Boolean(company.originAddress)
    },
    {
      description: company.customerCount > 0 ? `거래처 ${company.customerCount.toLocaleString()}곳이 연결되어 있습니다.` : "거래처 마스터를 등록해야 합니다.",
      label: "거래처 데이터",
      ok: company.customerCount > 0
    },
    {
      description: company.salesTransactionCount > 0 ? `매출 거래 ${company.salesTransactionCount.toLocaleString()}건이 연결되어 있습니다.` : "매출 거래원장을 업로드해야 분석이 가능합니다.",
      label: "매출 원장",
      ok: company.salesTransactionCount > 0
    },
    {
      description: company.uploadCount > 0 ? `업로드 이력 ${company.uploadCount.toLocaleString()}회가 기록되어 있습니다.` : "최초 데이터 등록 이력이 필요합니다.",
      label: "업로드 이력",
      ok: company.uploadCount > 0
    }
  ];
  const complete = checks.filter((check) => check.ok).length;

  return {
    checks,
    complete,
    score: Math.round((complete / checks.length) * 100),
    total: checks.length
  };
}

function getFirstMissingCheck(company: ManagedCompanyAccount) {
  return getCompanyReadiness(company).checks.find((check) => !check.ok);
}

function AdminSummaryCard({ helper, icon: Icon, label, value }: { helper: string; icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <Icon className="mb-3 h-4 w-4 text-primary" />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold text-muted-foreground">{helper}</p>
    </div>
  );
}

function AdminQueueMetric({ label, tone = "default", value }: { label: string; tone?: "default" | "warning"; value: string }) {
  return (
    <div className={`min-w-24 rounded-lg border px-3 py-2 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-[11px] font-black ${tone === "warning" ? "text-amber-700" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-sm font-black ${tone === "warning" ? "text-amber-950" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function CompanyFilterButton({
  active,
  count,
  label,
  onClick,
  tone = "default"
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone?: "default" | "warning";
}) {
  const activeClass =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-teal-500 bg-teal-700 text-white";

  return (
    <button
      className={`flex h-10 items-center justify-between rounded-md border px-3 text-xs font-black transition ${
        active ? activeClass : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
      }`}
      type="button"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 ${active ? "bg-white/20" : "bg-white text-slate-600"}`}>{count.toLocaleString()}</span>
    </button>
  );
}

function ListStatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`rounded-md px-2 py-1 text-[11px] font-black ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {label} {ok ? "완료" : "필요"}
    </span>
  );
}

function getStaffRoleLabel(role: StaffInvitation["role"]) {
  if (role === "driver") return "배송기사";
  if (role === "sales") return "영업직원";
  if (role === "manager") return "현장관리자";
  return "일반직원";
}

function getInvitationStatusLabel(status: StaffInvitation["status"]) {
  if (status === "accepted") return "가입완료";
  if (status === "expired") return "만료";
  if (status === "revoked") return "취소";
  return "대기";
}

function ReadinessMeter({ compact, readiness }: { compact?: boolean; readiness: CompanyReadiness }) {
  const ready = readiness.score >= 80;

  return (
    <div className={compact ? "" : "min-w-[180px]"}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-black ${ready ? "text-emerald-700" : "text-amber-700"}`}>운영 준비 {readiness.score}%</span>
        <span className="text-xs font-black text-slate-500">
          {readiness.complete}/{readiness.total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${readiness.score}%` }} />
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, primary }: { href: string; icon: typeof Users; label: string; primary?: boolean }) {
  return (
    <Link
      className={`inline-flex h-10 items-center justify-between rounded-md border px-3 text-sm font-black transition ${
        primary ? "border-teal-500 bg-teal-700 text-white shadow-sm hover:bg-teal-800" : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white"
      }`}
      href={href}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className={`h-4 w-4 ${primary ? "text-white" : "text-primary"}`} />
        {label}
      </span>
      <span className={`text-xs ${primary ? "text-white/70" : "text-muted-foreground"}`}>열기</span>
    </Link>
  );
}

function DataMetric({
  compact,
  icon: Icon,
  label,
  value
}: {
  compact?: boolean;
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <Icon className="mb-3 h-4 w-4 text-primary" />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className={`${compact ? "text-sm leading-5" : "text-2xl"} mt-1 font-black text-slate-950`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  onChange,
  required,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <input
        className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
