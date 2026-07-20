import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardEdit, FileText, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesAssistantDrafts } from "@/lib/store";

const typeLabels = {
  "follow-up": "후속 메시지",
  quote: "견적 메모",
  summary: "방문 요약"
};

export default async function SalesAssistantPage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const drafts = await getSalesAssistantDrafts(companyId);
  const followUps = drafts.filter((draft) => draft.type === "follow-up").length;
  const quotes = drafts.filter((draft) => draft.type === "quote").length;
  const isAdminPreview = Boolean(adminSession && !customerSession);

  return (
    <CustomerAppShell
      active="assistant"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      rightAction={
        <Link className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-teal-600 to-blue-600 px-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(13,148,136,0.16)] transition hover:from-teal-700 hover:to-blue-700" href={customerSession ? "/dashboard" : "/admin/companies"}>
          돌아가기
        </Link>
      }
      subtitle="방문 결과를 바탕으로 메시지, 요약, 견적 요청 메모를 생성합니다."
      title="영업 후속 작업 초안"
      userName={customerSession?.name || "관리자"}
    >
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric icon={Sparkles} label="생성 초안" value={`${drafts.length}개`} />
          <Metric icon={MessageSquareText} label="후속 메시지" value={`${followUps}개`} />
          <Metric icon={FileText} label="견적 메모" value={`${quotes}개`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardEdit className="h-5 w-5 text-primary" />
              초안 목록
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-md border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary/10 text-primary">{typeLabels[draft.type]}</Badge>
                  <Badge>{draft.region}</Badge>
                  <span className="text-sm font-black">{draft.leadName}</span>
                </div>
                <p className="mb-2 font-black">{draft.title}</p>
                <p className="min-h-24 rounded-md bg-muted/35 p-3 text-sm leading-6 text-muted-foreground">{draft.body}</p>
                <p className="mt-3 text-xs font-bold text-muted-foreground">다음 액션: {draft.nextAction}</p>
              </div>
            ))}
            {!drafts.length ? (
              <div className="rounded-md border border-border bg-muted/35 p-6 text-center lg:col-span-2">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
                <p className="font-black">생성할 후속 초안이 없습니다.</p>
                <p className="mt-1 text-sm text-muted-foreground">방문 결과를 먼저 기록하면 초안이 생성됩니다.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <Icon className="mb-4 h-5 w-5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}
