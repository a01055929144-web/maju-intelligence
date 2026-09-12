import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, FileClock, KeyRound, LayoutDashboard, ServerCog, ShieldAlert, UploadCloud, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminSession } from "@/lib/auth";
import { getAdminAuditLogs, getSystemDiagnostics } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";

const statusLabels = {
  ready: "준비됨",
  fallback: "점검 필요",
  missing: "누락"
};

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getCredentialSafety() {
  const issues = [
    (!process.env.ADMIN_EMAIL || process.env.ADMIN_EMAIL === "admin@maju.local") && "관리자 이메일이 기본값이거나 누락되었습니다.",
    (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "maju-admin-2026") && "관리자 비밀번호가 기본값이거나 누락되었습니다.",
    (!process.env.CUSTOMER_EMAIL || process.env.CUSTOMER_EMAIL === "owner@maju.local") && "고객사 이메일이 기본값이거나 누락되었습니다.",
    (!process.env.CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD === "maju-owner-2026") && "고객사 비밀번호가 기본값이거나 누락되었습니다.",
    (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) && "관리자 세션 시크릿이 누락되었거나 32자보다 짧습니다."
  ].filter((issue): issue is string => Boolean(issue));

  return { issues, safe: issues.length === 0 };
}

export default async function AdminSystemPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const auditCompany = singleParam(params.auditCompany);
  const auditQuery = singleParam(params.auditQuery).trim().toLowerCase();
  const auditTone = singleParam(params.auditTone);
  const [system, auditResult] = await Promise.all([
    getSystemDiagnostics(),
    getAdminAuditLogs(undefined, 50)
      .then((logs) => ({ error: "", logs }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "감사 로그를 불러오지 못했습니다.", logs: [] }))
  ]);
  const auditLogs = auditResult.logs;
  const auditCompanies = Array.from(new Map(auditLogs.filter((log) => log.companyId).map((log) => [log.companyId, log.company])).entries()).sort((a, b) => a[1].localeCompare(b[1], "ko"));
  const filteredAuditLogs = auditLogs.filter((log) => {
    const tone = auditHasSensitiveChange(log.metadata) ? "danger" : auditActionTone(log.action);
    const matchesCompany = !auditCompany || log.companyId === auditCompany;
    const matchesTone = !auditTone || tone === auditTone;
    const matchesQuery = !auditQuery || [log.actorName, log.company, auditActionLabel(log.action), auditMetadataSummary(log.metadata)]
      .some((value) => value.toLowerCase().includes(auditQuery));
    return matchesCompany && matchesTone && matchesQuery;
  });
  const sensitiveAuditCount = filteredAuditLogs.filter((log) => auditHasSensitiveChange(log.metadata)).length;
  const dataAuditCount = filteredAuditLogs.filter((log) => auditActionTone(log.action) === "data").length;
  const accountAuditCount = filteredAuditLogs.filter((log) => auditActionTone(log.action) === "account").length;
  const databaseReady = system.mode === "production-db" && system.databaseChecks.length > 0 && system.databaseChecks.every((check) => check.status === "ready");
  const storageReady = system.storageChecks.length > 0 && system.storageChecks.every((check) => check.status === "ready");
  const credentialSafety = getCredentialSafety();
  const authReady = system.adminConfigured && system.customerConfigured && credentialSafety.safe;
  const deployReady = system.appUrlConfigured;
  const operationDataReady = system.databaseChecks.some((check) => check.name === "정제 거래처" && Number(check.count || 0) > 0);
  const privacyOperations = [
    {
      detail: storageReady ? "비공개 customer-attachments 버킷 연결이 확인되었습니다." : "Storage 연결과 비공개 버킷 정책을 확인하세요.",
      label: "민감 첨부파일 저장소",
      ready: storageReady
    },
    {
      detail: "첨부파일 열람 API가 회사 경로와 담당 거래처 권한을 확인한 뒤 단기 서명 URL을 발급합니다.",
      label: "첨부파일 접근 통제",
      ready: true
    },
    {
      detail: "직원 위치 이벤트는 365일 보관 후 일일 크론에서 삭제하도록 설정되어 있습니다.",
      label: "위치정보 보관기간",
      ready: true
    },
    {
      detail: process.env.CRON_SECRET ? "CRON_SECRET이 설정되어 자동 정리 요청을 인증할 수 있습니다." : "CRON_SECRET이 없어 자동 위치정보 정리를 실행할 수 없습니다.",
      label: "위치정보 자동 정리 인증",
      ready: Boolean(process.env.CRON_SECRET)
    },
    {
      detail: "최근 정리 성공 시각과 삭제 건수는 아직 별도 운영 로그로 저장하지 않습니다.",
      label: "최근 정리 실행 증적",
      ready: false
    }
  ];
  const launchGates = [
    {
      description: databaseReady ? "Supabase 테이블 연결과 카운트 확인이 완료되었습니다." : "Supabase 환경변수와 schema.sql 적용, 테이블 카운트를 확인하세요.",
      label: "저장 상태",
      ready: databaseReady
    },
    {
      description: authReady ? "관리자와 고객사 인증값이 기본값이 아니며 세션 시크릿 강도 기준을 충족합니다." : "관리자/고객사 기본 자격증명과 세션 시크릿 강도를 확인하세요.",
      label: "권한 분리",
      ready: authReady
    },
    {
      description: storageReady ? "첨부자료 Storage 접근이 준비되었습니다." : "사업자등록증, 통장사본, 적재위치 파일 업로드 Storage를 확인하세요.",
      label: "첨부자료",
      ready: storageReady
    },
    {
      description: deployReady ? "Production URL 기준 링크 확인이 가능합니다." : "NEXT_PUBLIC_APP_URL을 Production URL로 등록하세요.",
      label: "배포 URL",
      ready: deployReady
    },
    {
      description: operationDataReady ? "정제 거래처 데이터가 저장되어 있습니다." : "거래처 마스터를 업로드하거나 수기 등록 후 정제 테이블을 확인하세요.",
      label: "운영 데이터",
      ready: operationDataReady
    }
  ];
  const launchReadyCount = launchGates.filter((gate) => gate.ready).length;
  const launchProgress = Math.round((launchReadyCount / launchGates.length) * 100);
  const priorityActions = [
    {
      description: system.mode === "production-db" ? "실 DB 연결 상태입니다. 테이블 카운트와 Storage만 확인하면 됩니다." : "Supabase 환경변수와 schema.sql 적용 여부를 먼저 확인해야 합니다.",
      href: "#database-checks",
      icon: Database,
      label: "1. DB 연결 확인",
      tone: system.mode === "production-db" ? "ready" : "warning"
    },
    {
      description: system.adminConfigured && system.customerConfigured ? "운영 계정이 설정되어 있습니다. 고객사별 계정 분리만 확인하세요." : "관리자/고객사 기본 계정이 남아 있으면 운영값으로 바꾸세요.",
      href: "/admin/accounts",
      icon: KeyRound,
      label: "2. 계정 설정 점검",
      tone: system.adminConfigured && system.customerConfigured ? "ready" : "warning"
    },
    {
      description: "고객사별 거래처 마스터와 매출 거래원장 업로드 이력을 확인합니다.",
      href: "/admin/uploads",
      icon: UploadCloud,
      label: "3. 업로드 검증",
      tone: "default"
    },
    {
      description: "고객사 데이터가 분리되어 보이는지 관리자 미리보기로 최종 확인합니다.",
      href: "/admin/companies",
      icon: LayoutDashboard,
      label: "4. 고객사 미리보기",
      tone: "default"
    }
  ] as const;

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="system" badge="System Check" session={session} subtitle="실서버 배포 전 DB, 인증, 환경변수 상태를 확인합니다" title="운영 설정 점검" />

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-4">
        <Card className={system.readyForOperations ? "border-primary/20 bg-primary/5" : "border-amber-200 bg-amber-50/70"}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <Badge className={system.readyForOperations ? "mb-3 bg-primary text-primary-foreground" : "mb-3 bg-amber-100 text-amber-900"}>
                  {system.readyForOperations ? "운영 가능" : "조치 필요"}
                </Badge>
                <h2 className="text-2xl font-black">운영 준비 상태</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  관리자, 고객사, 저장 상태, 첨부자료, 경로 계산에 필요한 설정을 기준으로 실제 운영 가능 여부를 점검합니다.
                </p>
              </div>
              <div className="w-full rounded-md border border-border bg-white p-4 lg:w-72">
                <div className="mb-3 flex items-end justify-between">
                  <p className="text-sm font-bold text-muted-foreground">준비도</p>
                  <p className="text-3xl font-black">{system.readinessScore}%</p>
                </div>
                <Progress value={system.readinessScore} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ReadinessList
                empty="필수 운영 항목이 준비되었습니다."
                icon="danger"
                items={system.blockingIssues}
                title="필수 조치"
              />
              <ReadinessList
                empty="권장 점검 항목이 없습니다."
                icon="warning"
                items={system.warningIssues}
                title="권장 점검"
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-black text-white shadow-sm transition hover:bg-teal-800" href="/admin/companies">
                <Users className="h-4 w-4" />
                고객사 데이터 확인
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-muted" href="/admin/uploads">
                <UploadCloud className="h-4 w-4" />
                업로드 이력 확인
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-muted" href="/admin/accounts">
                <KeyRound className="h-4 w-4" />
                계정 설정 점검
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>운영 오픈 판정표</CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">실사용 전 반드시 확인할 5가지 기준입니다. 모두 준비되면 고객사 운영 화면을 안정적으로 열 수 있습니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={launchReadyCount === launchGates.length ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}>
                  {launchReadyCount}/{launchGates.length} 준비 · {launchProgress}%
                </Badge>
                <Progress className="h-2 w-32" value={launchProgress} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {launchGates.map((gate) => (
              <LaunchGateCard key={gate.label} {...gate} />
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>운영 조치 순서</CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">점검 결과를 보고 바로 조치할 수 있는 관리자 작업 흐름입니다.</p>
              </div>
              <Badge className="w-fit bg-slate-100 text-slate-700">실운영 기준</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {priorityActions.map((action) => (
              <SystemActionCard key={action.label} {...action} />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Database} label="데이터 모드" value={system.mode === "production-db" ? "실 DB" : "저장 확인 필요"} />
          <Metric icon={ServerCog} label="앱 URL" value={system.appUrlConfigured ? "설정됨" : "미설정"} />
          <Metric icon={KeyRound} label="관리자 인증" value={system.adminConfigured && !credentialSafety.issues.some((issue) => issue.startsWith("관리자")) ? "안전" : "점검 필요"} />
          <Metric icon={ShieldAlert} label="고객사 인증" value={system.customerConfigured && !credentialSafety.issues.some((issue) => issue.startsWith("고객사")) ? "안전" : "점검 필요"} />
        </div>

        <Card className={credentialSafety.safe ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              자격증명·Secret 노출 안전 점검
            </CardTitle>
          </CardHeader>
          <CardContent>
            {credentialSafety.safe ? (
              <p className="text-sm font-bold leading-6 text-emerald-800">기본 자격증명을 사용하지 않으며 세션 시크릿 길이 기준을 충족합니다. 실제 값은 관리자 화면과 API 응답에 표시하지 않습니다.</p>
            ) : (
              <div className="grid gap-2">
                {credentialSafety.issues.map((issue) => (
                  <div className="flex items-start gap-2 text-sm font-bold leading-6 text-amber-900" key={issue}>
                    <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
                    <span>{issue}</span>
                  </div>
                ))}
                <p className="mt-2 text-xs font-semibold text-amber-800">환경변수 이름과 상태만 표시되며 저장된 값과 길이는 브라우저로 전달하지 않습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  민감 파일·위치정보 운영 상태
                </CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">민감 첨부파일 접근 통제와 직원 위치정보 보관·삭제 정책을 운영 기준으로 확인합니다.</p>
              </div>
              <Badge className={privacyOperations.every((item) => item.ready) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                {privacyOperations.filter((item) => item.ready).length}/{privacyOperations.length} 확인
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {privacyOperations.map((item) => (
              <div className={`rounded-md border p-4 ${item.ready ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`} key={item.label}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-slate-950">{item.label}</p>
                  {item.ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />}
                </div>
                <Badge className={`mt-3 ${item.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.ready ? "확인" : "조치 필요"}</Badge>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-primary" />
              배포 전 환경 점검 명령
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-md border border-border bg-muted/35 p-4">
              <p className="text-sm font-bold text-muted-foreground">로컬 또는 배포 직전 터미널에서 실행</p>
              <code className="mt-3 block overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-sm font-black text-white">
                npm run check:production-env
              </code>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Supabase, 관리자/고객사 인증, 회사 출발지, TMAP, Kakao Map, Production URL 환경변수 누락 여부를 한 번에 확인합니다.
              </p>
            </div>
            <div className="rounded-md border border-border bg-white p-4">
              <p className="font-black">통과 후 확인 순서</p>
              <div className="mt-3 grid gap-2 text-sm font-bold text-muted-foreground">
                <span>1. Vercel Production 환경변수 재확인</span>
                <span>2. Supabase SQL 마이그레이션 적용</span>
                <span>3. 관리자 시스템 점검에서 누락 0건 확인</span>
                <span>4. 고객사 대시보드와 코스 화면 접속 확인</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ServerCog className="h-5 w-5 text-primary" />
                  운영 헬스체크 API
                </CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  배포된 서비스가 실제 DB와 운영 환경값으로 동작하는지 서버 응답 기준으로 확인합니다.
                </p>
              </div>
              <Link
                className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
                href="/api/health"
                rel="noreferrer"
                target="_blank"
              >
                /api/health 열기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-3">
            {[
              ["200 OK", "운영 가능", "ok:true, mode:production-db, 필수 점검 항목이 준비된 상태입니다."],
              ["503 Service Unavailable", "조치 필요", "앱은 열리지만 DB, Storage, 인증값, 환경변수 중 운영 준비가 부족한 상태입니다."],
              ["500 Server Error", "로그 확인", "헬스체크 실행 중 예외가 발생한 상태입니다. Vercel Function 로그에서 stack trace를 확인하세요."]
            ].map(([code, label, description]) => (
              <div key={code} className="rounded-md border border-border bg-white p-4">
                <Badge className={code.startsWith("200") ? "bg-primary/10 text-primary" : code.startsWith("503") ? "bg-amber-100 text-amber-800" : "bg-destructive/10 text-destructive"}>
                  {code}
                </Badge>
                <p className="mt-3 text-base font-black">{label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
            <div className="rounded-md border border-dashed border-border bg-muted/35 p-4 lg:col-span-3">
              <p className="text-sm font-black text-slate-900">응답에서 확인할 핵심 필드</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["ok", "mode", "readinessScore", "blockingCount", "warningCount", "databaseChecks", "storageChecks"].map((field) => (
                  <code key={field} className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-border">
                    {field}
                  </code>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  고객사 데이터 기준 진단
                </CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  지도 홈, 거래처 원장, 지도 표시 가능 매장 수가 같은 companyId 기준으로 맞는지 확인합니다.
                </p>
              </div>
              <Link className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-muted" href="/admin/companies">
                고객사 선택
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-md border border-border bg-muted/35 p-4">
              <p className="text-sm font-black text-slate-900">진단 API</p>
              <code className="mt-3 block overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-sm font-black text-white">
                /api/customer/data-consistency?companyId=고객사_ID
              </code>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                고객사 로그인 상태에서는 쿼리 없이 본인 회사 기준으로 동작합니다. 관리자는 고객사 목록에서 companyId를 선택한 뒤 같은 기준으로 확인합니다.
              </p>
            </div>
            <div className="rounded-md border border-border bg-white p-4">
              <p className="font-black">확인 항목</p>
              <div className="mt-3 grid gap-2 text-sm font-bold text-muted-foreground">
                <span>1. 대시보드 거래처 수 ↔ 거래처 원장 수</span>
                <span>2. 거래처 원장 수 ↔ 코스 매장 수</span>
                <span>3. 코스 매장 수 ↔ 지도 표시 가능 매장 수</span>
                <span>4. 거래처 히스토리 방문/메모 데이터</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
              운영 로그 추적 순서
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["1. 화면 오류", "사용자가 본 URL, 시간, Digest 번호를 먼저 기록합니다."],
              ["2. Vercel Logs", "해당 시간대의 Function 로그에서 API route와 stack trace를 확인합니다."],
              ["3. Supabase Logs", "PostgREST 404, RLS, 테이블 누락, Storage 권한 오류를 확인합니다."],
              ["4. 데이터 재확인", "관리자 시스템 점검과 고객사 미리보기에서 같은 companyId 기준으로 재검증합니다."]
            ].map(([label, description]) => (
              <div key={label} className="rounded-md border border-border bg-white p-4">
                <p className="font-black">{label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileClock className="h-5 w-5 text-primary" />
                  최근 감사 로그
                </CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  고객사 계정, 직원 초대, 거래처 원장, 메모, 첨부자료처럼 운영 데이터에 영향을 주는 작업을 시간순으로 확인합니다.
                </p>
              </div>
              <Badge className={filteredAuditLogs.length ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}>
                {filteredAuditLogs.length ? `${filteredAuditLogs.length}/${auditLogs.length}건 표시` : "조건에 맞는 기록 없음"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {auditResult.error ? (
              <div className="mb-4 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                감사 로그 조회 실패: {auditResult.error}
              </div>
            ) : null}

            <form action="/admin/system" className="mb-4 grid gap-3 rounded-md border border-border bg-muted/30 p-4 md:grid-cols-[1fr_180px_180px_auto]" method="get">
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-muted-foreground">검색</span>
                <input className="h-10 rounded-md border border-input bg-white px-3 text-sm" defaultValue={singleParam(params.auditQuery)} name="auditQuery" placeholder="작업, 수행자, 고객사" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-muted-foreground">고객사</span>
                <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" defaultValue={auditCompany} name="auditCompany">
                  <option value="">전체 고객사</option>
                  {auditCompanies.map(([companyId, company]) => <option key={companyId} value={companyId}>{company}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-muted-foreground">작업 유형</span>
                <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" defaultValue={auditTone} name="auditTone">
                  <option value="">전체 작업</option>
                  <option value="account">계정/권한</option>
                  <option value="data">데이터 변경</option>
                  <option value="danger">민감 작업</option>
                  <option value="default">기타</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-black text-white" type="submit">조회</button>
                <Link className="inline-flex h-10 items-center rounded-md border border-border bg-white px-3 text-sm font-black text-slate-700" href="/admin/system">초기화</Link>
              </div>
            </form>

            {filteredAuditLogs.length ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <AuditSummaryTile label="계정/권한 작업" tone="account" value={accountAuditCount} />
                  <AuditSummaryTile label="데이터 변경 작업" tone="data" value={dataAuditCount} />
                  <AuditSummaryTile label="민감 변경 작업" tone="danger" value={sensitiveAuditCount} />
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  <div className="hidden grid-cols-[160px_1fr_160px_150px] gap-3 border-b border-border bg-muted/50 px-4 py-3 text-xs font-black text-muted-foreground md:grid">
                    <span>일시</span>
                    <span>작업 내용</span>
                    <span>고객사</span>
                    <span>수행자</span>
                  </div>
                  <div className="divide-y divide-border">
                    {filteredAuditLogs.map((log) => {
                      const tone = auditHasSensitiveChange(log.metadata) ? "danger" : auditActionTone(log.action);

                      return (
                        <div key={log.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[160px_1fr_160px_150px] md:items-center">
                          <span className="font-bold text-muted-foreground">{log.createdAt}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={auditToneClass(tone)}>{auditToneLabel(tone)}</Badge>
                              <p className="font-black text-slate-950">{auditActionLabel(log.action)}</p>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-muted-foreground">
                              {auditTargetTypeLabel(log.targetType)} · {auditMetadataSummary(log.metadata)}
                            </p>
                          </div>
                          <span className="truncate font-bold text-slate-700">{log.company}</span>
                          <span className="truncate font-bold text-slate-700">{log.actorName}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/35 p-4">
                <p className="text-sm font-black text-slate-900">표시할 감사 로그가 없습니다.</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {auditLogs.length ? "검색어나 필터 조건을 바꿔 다시 조회하세요." : "거래처 마스터나 매출 거래내역을 저장하면 변경 이력이 이곳에 남습니다."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>운영 환경변수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {system.requiredEnvironment.map((item) => (
                <div key={item.key} className="grid grid-cols-2 items-center gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_72px_72px_90px]">
                  <code className="col-span-2 min-w-0 truncate text-sm font-bold sm:col-span-1">{item.key}</code>
                  <Badge className={item.required ? "justify-center bg-slate-100 text-slate-700" : "justify-center bg-blue-50 text-blue-700"}>
                    {item.required ? "필수" : "선택"}
                  </Badge>
                  <Badge className={item.scope === "server" ? "justify-center" : "justify-center bg-accent/20 text-foreground"}>{item.scope}</Badge>
                  <Badge className={item.present ? "justify-center bg-primary/10 text-primary" : item.required ? "justify-center bg-destructive/10 text-destructive" : "justify-center bg-slate-100 text-slate-600"}>
                    {item.present ? "OK" : item.required ? "누락" : "기본값"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>서비스 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {system.services.map((service) => (
                <div key={service.name} className="rounded-md border border-border p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-black">{service.name}</p>
                    <Badge className={service.status === "ready" ? "bg-primary/10 text-primary" : "bg-accent/20 text-foreground"}>
                      {statusLabels[service.status]}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card id="database-checks">
          <CardHeader>
            <CardTitle>Supabase 데이터 점검</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {system.databaseChecks.map((check) => (
              <div key={check.name} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-black">{check.name}</p>
                  <Badge className={check.status === "ready" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}>
                    {statusLabels[check.status]}
                  </Badge>
                </div>
                <p className="text-2xl font-black">{check.count === null ? "-" : check.count.toLocaleString()}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{check.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Storage 점검</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {system.storageChecks.map((check) => (
              <div key={check.name} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-black">{check.name}</p>
                  <Badge className={check.status === "ready" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}>
                    {statusLabels[check.status]}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{check.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              실서버 전환 체크리스트
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {[
              ["DB", "Supabase 프로젝트 생성 및 schema.sql 실행"],
              ["DB", "20260725_customer_place_links.sql 실행 후 매장 외부 링크 컬럼 확인"],
              ["DB", "companies, normalized_customers, customer_imports 테이블 카운트 확인"],
              ["Storage", "customer-attachments 버킷 생성 및 파일 업로드 테스트"],
              ["Auth", "관리자 비밀번호와 세션 시크릿 운영값으로 교체"],
              ["Auth", "고객사별 계정은 고객사 관리에서 생성"],
              ["Deploy", "Vercel Production 환경변수 등록 및 재배포"],
              ["Data", "거래처 마스터 엑셀 업로드 후 업로드 이력 확인"],
              ["Data", "매출 거래원장 업로드 후 매출 원장 화면 확인"],
              ["Route", "출발지 주소와 TMAP API로 실제 경유 계산 확인"],
              ["Report", "운영 리포트가 선택 고객사 companyId 기준으로 열리는지 확인"]
            ].map(([group, item]) => (
              <div key={item} className="flex items-start gap-3 rounded-md border border-border bg-muted/35 p-3 text-sm font-bold">
                <Badge className="mt-0.5 shrink-0 bg-slate-100 text-slate-700">{group}</Badge>
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function ReadinessList({ empty, icon, items, title }: { empty: string; icon: "danger" | "warning"; items: string[]; title: string }) {
  const Icon = icon === "danger" ? ShieldAlert : AlertTriangle;
  const tone = icon === "danger" ? "text-destructive" : "text-amber-700";

  return (
    <div className="rounded-md border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <p className="font-black">{title}</p>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary">{empty}</div>
      )}
    </div>
  );
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    auth_credentials_updated: "로그인 계정 설정 변경",
    customer_attachment_created: "거래처 첨부자료 등록",
    customer_master_created: "거래처 관리 신규 등록",
    customer_master_updated: "거래처 관리 수정",
    customer_note_created: "거래처 메모 저장",
    excel_upload_analyzed: "엑셀 업로드 분석 및 원장 반영",
    managed_company_created: "고객사 계정 생성",
    managed_company_updated: "고객사 계정 수정",
    staff_invitation_created: "직원 초대 생성",
    staff_invitation_updated: "직원 초대/상태 수정"
  };

  return labels[action] || action;
}

function auditActionTone(action: string) {
  if (["auth_credentials_updated", "managed_company_created", "managed_company_updated", "staff_invitation_created", "staff_invitation_updated"].includes(action)) {
    return "account";
  }
  if (["customer_master_created", "customer_master_updated", "customer_note_created", "customer_attachment_created", "excel_upload_analyzed"].includes(action)) {
    return "data";
  }
  if (action.includes("password") || action.includes("secret")) return "danger";
  return "default";
}

function auditHasSensitiveChange(metadata: Record<string, unknown>) {
  return Boolean(metadata.adminPasswordChanged || metadata.customerPasswordChanged || metadata.secretChanged);
}

function auditToneClass(tone: string) {
  const classes: Record<string, string> = {
    account: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    data: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    default: "bg-slate-100 text-slate-700"
  };

  return classes[tone] || classes.default;
}

function auditToneLabel(tone: string) {
  const labels: Record<string, string> = {
    account: "계정/권한",
    danger: "민감",
    data: "데이터",
    default: "기록"
  };

  return labels[tone] || labels.default;
}

function auditTargetTypeLabel(targetType: string) {
  const labels: Record<string, string> = {
    auth_credentials: "로그인 계정",
    company: "고객사",
    customer_attachment: "첨부자료",
    customer_master: "거래처 관리",
    customer_note: "거래처 메모",
    staff_invitation: "직원 초대",
    upload_import: "업로드 분석",
    "대상 미확인": "대상 미확인"
  };

  return labels[targetType] || targetType;
}

function auditMetadataSummary(metadata: Record<string, unknown>) {
  const customerName = String(metadata.customerName || "");
  const attachmentType = String(metadata.attachmentType || "");
  const memoLength = Number(metadata.memoLength || 0);
  const noteType = String(metadata.noteType || "");
  const employeeName = String(metadata.employeeName || "");
  const companyName = String(metadata.companyName || "");
  const businessType = String(metadata.businessType || "");
  const ownerName = String(metadata.ownerName || "");
  const role = String(metadata.role || "");
  const status = String(metadata.status || "");
  const rows = Number(metadata.rows || 0);
  const rawRows = Number(metadata.rawRows || 0);
  const duplicateCount = Number(metadata.duplicateCount || 0);
  const qualityScore = Number(metadata.qualityScore || 0);
  const grade = String(metadata.grade || "");
  const parts = [
    companyName ? `고객사 ${companyName}` : "",
    businessType ? `업종 ${businessType}` : "",
    ownerName ? `대표 ${ownerName}` : "",
    customerName ? `거래처 ${customerName}` : "",
    grade ? `${grade}등급` : "",
    noteType ? `메모 ${noteType}` : "",
    memoLength ? `메모 ${memoLength.toLocaleString()}자` : "",
    attachmentType ? `첨부 ${attachmentTypeLabel(attachmentType)}` : "",
    employeeName ? `직원 ${employeeName}` : "",
    role ? `업무 ${role}` : "",
    status ? `상태 ${status}` : "",
    metadata.adminEmailChanged ? "관리자 이메일 변경" : "",
    metadata.adminPasswordChanged ? "관리자 비밀번호 변경" : "",
    metadata.customerEmailChanged ? "고객사 이메일 변경" : "",
    metadata.customerPasswordChanged ? "고객사 비밀번호 변경" : "",
    metadata.hasCustomerPassword ? "고객사 로그인값 저장" : "",
    rows ? `정제 ${rows.toLocaleString()}행` : "",
    rawRows ? `원본 ${rawRows.toLocaleString()}행` : "",
    qualityScore ? `품질 ${qualityScore}%` : "",
    duplicateCount ? `중복 ${duplicateCount.toLocaleString()}건` : ""
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "상세값 없음";
}

function AuditSummaryTile({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <Badge className={auditToneClass(tone)}>{auditToneLabel(tone)}</Badge>
      <p className="mt-3 text-sm font-black text-slate-700">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value.toLocaleString()}건</p>
    </div>
  );
}

function attachmentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    bank_account: "통장사본",
    business_license: "사업자등록증",
    etc: "기타",
    loading_position: "배송 적재위치"
  };

  return labels[type] || type;
}

function SystemActionCard({
  description,
  href,
  icon: Icon,
  label,
  tone
}: {
  description: string;
  href: string;
  icon: typeof Database;
  label: string;
  tone: "default" | "ready" | "warning";
}) {
  const toneClass =
    tone === "ready"
      ? "border-primary/20 bg-primary/5 text-primary"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-white text-slate-900";

  return (
    <Link className={`group rounded-md border p-4 transition hover:border-slate-300 hover:bg-slate-50 ${toneClass}`} href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/80">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-current opacity-60 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-sm font-black">{label}</p>
      <p className="mt-2 text-xs font-semibold leading-5 opacity-75">{description}</p>
    </Link>
  );
}

function LaunchGateCard({ description, label, ready }: { description: string; label: string; ready: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${ready ? "border-emerald-100 bg-emerald-50/70" : "border-amber-100 bg-amber-50/70"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">{label}</p>
        {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
      </div>
      <Badge className={ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{ready ? "준비" : "점검"}</Badge>
      <p className="mt-3 text-xs font-bold leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <Icon className="mb-4 h-5 w-5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}
