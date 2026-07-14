"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, Eye, EyeOff, FileSpreadsheet, KeyRound, MapPin, Plus, ReceiptText, Save, Search, UploadCloud, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ManagedCompanyAccount, ManagedCompanyAccountInput } from "@/lib/store";

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
  const [form, setForm] = useState<ManagedCompanyAccountInput>(initialCompanies[0] || emptyCompany);
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const filteredCompanies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return companies;
    return companies.filter((company) =>
      [company.name, company.ownerName, company.customerEmail, company.originAddress].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [companies, query]);

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

  const selectedCompany = companies.find((company) => company.id === selectedId);
  const selectedReadiness = selectedCompany ? getCompanyReadiness(selectedCompany) : null;
  const totalCustomers = companies.reduce((sum, company) => sum + company.customerCount, 0);
  const totalSalesRows = companies.reduce((sum, company) => sum + company.salesTransactionCount, 0);
  const totalUploads = companies.reduce((sum, company) => sum + company.uploadCount, 0);
  const activeCompanies = companies.filter((company) => company.status === "active").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <AdminSummaryCard icon={Building2} label="운영 고객사" value={`${activeCompanies.toLocaleString()}곳`} helper={`전체 ${companies.length.toLocaleString()}곳`} />
        <AdminSummaryCard icon={Users} label="총 거래처" value={`${totalCustomers.toLocaleString()}곳`} helper="회사별 분리 저장" />
        <AdminSummaryCard icon={ReceiptText} label="매출 거래행" value={`${totalSalesRows.toLocaleString()}건`} helper="거래원장 누적" />
        <AdminSummaryCard icon={UploadCloud} label="업로드 이력" value={`${totalUploads.toLocaleString()}회`} helper={source === "supabase" ? "DB 연결" : "저장 확인 필요"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
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
              <div className="mt-3">
                <ReadinessMeter readiness={getCompanyReadiness(company)} compact />
              </div>
            </button>
          ))}
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
                  <QuickAction href={`/crm/timeline?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={Users} label="거래처 히스토리" />
                  <QuickAction href={`/?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={UploadCloud} label="데이터 등록/업로드" />
                  <QuickAction href={`/revenue/transactions?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={ReceiptText} label="매출 원장 분석" />
                  <QuickAction href={`/routes/today?companyId=${encodeURIComponent(selectedCompany.id)}`} icon={MapPin} label="영업·배송 코스" />
                </div>
              </div>
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

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link className="inline-flex h-10 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-800 transition hover:bg-white" href={href}>
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">열기</span>
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
