import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardEdit, FileText, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getSalesAssistantDrafts } from "@/lib/store";

const typeLabels = {
  "follow-up": "후속 메시지",
  quote: "견적 메모",
  summary: "방문 요약"
};

export default async function SalesAssistantPage() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");

  const drafts = await getSalesAssistantDrafts(customerSession?.companyId);
  const followUps = drafts.filter((draft) => draft.type === "follow-up").length;
  const quotes = drafts.filter((draft) => draft.type === "quote").length;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">AI Sales Assistant</Badge>
            <h1 className="text-2xl font-black">영업 후속 작업 초안</h1>
            <p className="mt-1 text-sm text-muted-foreground">방문 결과를 바탕으로 메시지, 요약, 견적 요청 메모를 생성합니다.</p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
            href={customerSession ? "/dashboard" : "/admin"}
          >
            돌아가기
          </Link>
        </div>
      </header>

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
    </main>
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

