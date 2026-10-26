import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDashed, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/app/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { getAdminSession } from "@/lib/auth";
import { getManagedCompanyAccounts } from "@/lib/store";
import { isLeadWorkspaceV2Enabled } from "@/lib/feature-modules";
import { LeadWorkspaceSettings } from "@/app/dashboard/settings/leads/workspace";
import { AdminCompanySetupWorkspace } from "./workspace";

type SetupStep = {
  description: string;
  href: string;
  label: string;
  ready: (company: Awaited<ReturnType<typeof getManagedCompanyAccounts>>["companies"][number]) => boolean;
};

const SETUP_STEPS: SetupStep[] = [
  { label: "영업 지역", description: "리드 수집을 시작할 시·도와 시·군·구를 먼저 선택합니다.", href: "#sales-area-step", ready: (company) => company.salesAreaCount > 0 },
  { label: "회사 정보", description: "회사명·대표자·출발지를 확인합니다.", href: "/admin/companies", ready: (company) => Boolean(company.name && company.ownerName) },
  { label: "대표 로그인", description: "로그인 이메일과 임시 비밀번호를 발급합니다.", href: "/admin/companies", ready: (company) => Boolean(company.customerEmail && company.hasPassword) },
  { label: "출발지·차량", description: "배송 출발지와 차량 정보를 확인합니다.", href: "/dashboard/settings/routes", ready: (company) => Boolean(company.originAddress) },
  { label: "직원 등록", description: "직원 계정을 만들거나 카카오 가입 링크를 발급합니다.", href: "/admin/companies", ready: (company) => Boolean(company.staffInvitationCount) },
  { label: "리드 기본값", description: "영업 업종과 후속 행동 기본값을 점검합니다.", href: "#assisted-setup", ready: (company) => Boolean(company.businessType) },
  { label: "엑셀 가져오기", description: "고객사 자료의 열을 매핑하고 미리 봅니다.", href: "#lead-import", ready: (company) => company.leadImportCount > 0 },
  { label: "구독", description: "요금제와 결제 상태를 확인합니다.", href: "/admin/billing", ready: (company) => ["active", "trialing"].includes(company.subscriptionStatus) },
  { label: "완료 확인", description: "최초 리드 수집과 고객 안내문을 확인합니다.", href: "/admin/system", ready: (company) => company.leadCount > 0 }
];

export default async function AdminCompanySetupPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [{ id }, payload] = await Promise.all([params, getManagedCompanyAccounts()]);
  const company = payload.companies.find((item) => item.id === id);
  if (!company) redirect("/admin/companies");

  const completedCount = SETUP_STEPS.filter((step) => step.ready(company)).length;
  const salesAreaConfigured = company.salesAreaCount > 0;
  const withCompany = (href: string) => href.startsWith("#") ? href : `${href}${href.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(company.id)}`;

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="companies" badge="Assisted Setup" session={session} subtitle={`${company.name} 초기 설정을 순서대로 확인합니다`} title="고객사 초기 설정" />
      <section className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            href={`/admin/companies?companyId=${encodeURIComponent(company.id)}`}
          >
            <ArrowLeft className="h-4 w-4" /> 고객사 관리로
          </Link>
          <Badge className="bg-slate-900 text-white">{completedCount}/9 확인</Badge>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="flex items-center gap-2 font-black"><LockKeyhole className="h-4 w-4" /> 관리자 대행 설정 원칙</p>
          <p className="mt-1">임시 비밀번호는 발급 순간에만 표시하고 감사 로그에는 남기지 않습니다. 약관·개인정보·위치·결제 동의는 고객이 직접 완료해야 합니다.</p>
        </div>

        {!salesAreaConfigured ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-900">
            영업 지역이 없어 리드 수집 대상이 0곳입니다. 아래 1단계에서 담당 시·군·구를 저장하면 나머지 초기 설정을 이어갈 수 있습니다.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {SETUP_STEPS.map((step, index) => {
            const ready = step.ready(company);
            const locked = index > 0 && !salesAreaConfigured;
            const content = (
              <div className="flex items-start gap-3">
                {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}
                <div>
                  <p className="font-black text-slate-950">{index + 1}. {step.label}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.description}</p>
                  <p className={`mt-2 text-xs font-black ${ready ? "text-emerald-700" : locked ? "text-slate-500" : "text-amber-700"}`}>{ready ? "현재 정보 확인됨" : locked ? "1단계 완료 후 진행" : "필수 설정"}</p>
                </div>
              </div>
            );
            if (locked) return <div aria-disabled="true" className="rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-70" key={step.label}>{content}</div>;
            return (
              <Link key={step.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-400 hover:shadow-md" href={withCompany(step.href)}>
                {content}
              </Link>
            );
          })}
        </div>

        <div id="assisted-setup"><AdminCompanySetupWorkspace company={company} /></div>
        <div id="lead-import">
          {!salesAreaConfigured
            ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">영업 지역을 저장하면 엑셀 가져오기 대행을 진행할 수 있습니다.</p>
            : isLeadWorkspaceV2Enabled(company.id)
              ? <LeadWorkspaceSettings companyId={company.id} initialTab="import" />
              : <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">WO-4 기능 플래그를 켠 고객사에서 리드 칸·엑셀 가져오기·유통사 탭이 표시됩니다.</p>}
        </div>

        <p className="rounded-lg border border-slate-200 bg-white p-4 text-xs font-bold leading-5 text-muted-foreground">
          최초 동기화는 06:00~07:30 KST 잠금 시간에는 실행하지 않습니다. 강제 비밀번호 변경과 설정 완료 도장은 운영 스키마 승인 후 활성화됩니다.
        </p>
      </section>
    </main>
  );
}
