import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileSpreadsheet, Gauge, Rows3, ServerCog, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminSession } from "@/lib/auth";
import { getUploadHistory, UploadHistoryItem } from "@/lib/store";

const statusCopy = {
  completed: "완료",
  failed: "실패",
  running: "진행중"
};

export default async function AdminUploadsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const uploads = await getUploadHistory();
  const completed = uploads.filter((item) => item.status === "completed").length;
  const failed = uploads.filter((item) => item.status === "failed").length;
  const processedRows = uploads.reduce((sum, item) => sum + item.rows, 0);
  const avgQuality = uploads.length ? Math.round(uploads.reduce((sum, item) => sum + item.qualityScore, 0) / uploads.length) : 0;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">Operations</Badge>
            <h1 className="text-2xl font-black">업로드/분석 이력</h1>
            <p className="mt-1 text-sm text-muted-foreground">거래처 마스터와 매출 거래내역의 적재 상태, 품질, 리포트 생성 여부를 확인합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted" href="/admin/system">
              시스템 점검
            </Link>
            <Link className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800" href="/admin">
              관리자 홈
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={FileSpreadsheet} label="최근 업로드" value={`${uploads.length.toLocaleString()}건`} />
          <Metric icon={Rows3} label="처리 행 수" value={processedRows.toLocaleString()} />
          <Metric icon={Gauge} label="평균 품질" value={`${avgQuality}%`} />
          <Metric icon={AlertTriangle} label="실패 건수" value={`${failed.toLocaleString()}건`} />
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>최근 데이터 적재 내역</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">최신순 12건 기준입니다. 회사별 전체 이력은 고객사 관리 화면에서도 확인할 수 있습니다.</p>
            </div>
            <Badge className="w-fit bg-primary/10 text-primary">완료 {completed}건</Badge>
          </CardHeader>
          <CardContent>
            {uploads.length ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[1.4fr_1fr_100px_110px_100px_100px_120px] bg-muted/70 px-4 py-3 text-xs font-black text-muted-foreground">
                    <span>파일</span>
                    <span>고객사</span>
                    <span className="text-right">행 수</span>
                    <span>상태</span>
                    <span className="text-right">품질</span>
                    <span className="text-right">중복</span>
                    <span className="text-center">리포트</span>
                  </div>
                  <div className="divide-y divide-border">
                    {uploads.map((upload) => (
                      <UploadRow key={upload.id} upload={upload} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
                <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-black">아직 업로드 이력이 없습니다.</p>
                <p className="mt-2 text-sm text-muted-foreground">거래처 마스터 또는 매출 거래내역을 등록하면 이곳에서 처리 결과를 확인할 수 있습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-primary" />
              운영 확인 기준
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {[
              ["저장 여부", "업로드 후 이 화면에 이력이 생기면 서버 저장 흐름이 동작한 것입니다."],
              ["품질 점수", "주소/지역/필수 컬럼 완성도가 낮으면 매핑과 원본 파일을 다시 확인합니다."],
              ["중복 건수", "사업자번호 또는 거래처명+주소 기준으로 중복 후보를 확인합니다."]
            ].map(([title, description]) => (
              <div key={title} className="rounded-md border border-border bg-muted/30 p-4">
                <p className="font-black">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function UploadRow({ upload }: { upload: UploadHistoryItem }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_100px_110px_100px_100px_120px] items-center px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-black">{upload.filename}</p>
        <p className="mt-1 text-xs text-muted-foreground">{upload.createdAt}</p>
      </div>
      <p className="truncate font-bold">{upload.company}</p>
      <p className="text-right font-black">{upload.rows.toLocaleString()}</p>
      <Badge className={statusClass(upload.status)}>{statusCopy[upload.status]}</Badge>
      <div className="text-right">
        <p className="font-black">{upload.qualityScore}%</p>
        <Progress className="mt-1 h-1.5" value={upload.qualityScore} />
      </div>
      <p className="text-right font-black">{upload.duplicateCount.toLocaleString()}건</p>
      <div className="text-center">
        {upload.reportId ? (
          <Link className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted" href={`/reports/${upload.reportId}`}>
            보기
          </Link>
        ) : (
          <span className="text-xs font-bold text-muted-foreground">미생성</span>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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

function statusClass(status: UploadHistoryItem["status"]) {
  if (status === "completed") return "w-fit justify-center bg-primary/10 text-primary";
  if (status === "failed") return "w-fit justify-center bg-destructive/10 text-destructive";
  return "w-fit justify-center bg-amber-100 text-amber-800";
}
