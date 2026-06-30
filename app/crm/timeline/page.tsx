import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ClipboardCheck, MessageSquareText, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getVisitTimeline } from "@/lib/store";

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

export default async function CrmTimelinePage() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");

  const timeline = await getVisitTimeline(customerSession?.companyId);
  const quoteRequests = timeline.filter((item) => item.result === "quote-requested").length;
  const interested = timeline.filter((item) => item.result === "interested").length;
  const expectedRevenue = timeline.reduce((total, item) => total + item.expectedRevenue, 0);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">CRM Intelligence</Badge>
            <h1 className="text-2xl font-black">방문 결과 타임라인</h1>
            <p className="mt-1 text-sm text-muted-foreground">방문 결과와 다음 액션을 누적해 영업 히스토리를 만듭니다.</p>
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
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={ClipboardCheck} label="방문 기록" value={`${timeline.length}건`} />
          <Metric icon={MessageSquareText} label="견적 요청" value={`${quoteRequests}건`} />
          <Metric icon={Target} label="관심 리드" value={`${interested}건`} />
          <Metric icon={CalendarClock} label="예상 월매출" value={`${expectedRevenue.toLocaleString()}만원`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>최근 방문 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {timeline.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_120px_120px] md:items-center">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-black">{item.leadName}</p>
                    <Badge>{item.region}</Badge>
                    <Badge className="bg-primary/10 text-primary">{resultLabels[item.result] || item.result}</Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{item.memo || "메모 없음"}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">다음 액션: {item.nextAction || "미정"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">예상 월매출</p>
                  <p className="text-xl font-black text-primary">{item.expectedRevenue.toLocaleString()}만원</p>
                </div>
                <p className="text-xs font-bold text-muted-foreground md:text-right">{item.visitedAt}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardCheck; label: string; value: string }) {
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

