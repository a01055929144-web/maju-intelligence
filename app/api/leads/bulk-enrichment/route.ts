import { after, NextRequest, NextResponse } from "next/server";
import { processLeadBulkJob } from "@/application/lead/run-bulk-enrichment";
import { isLeadBulkUuid, LEAD_BULK_MAX_ITEMS, normalizeLeadBulkIds, parseLeadBulkAction } from "@/domains/lead/bulk-enrichment";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { executeLeadBulkItem, leadBulkRepository } from "@/lib/lead-bulk-enrichment";
import { leadBulkDailyCap, leadBulkEnrichmentEnabled, leadBulkMinIntervalMs, leadBulkRunBudgetMs } from "@/lib/lead-bulk-enrichment-feature";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function scope(request: NextRequest, companyId?: string) {
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!scopeHasCapability(auth, "manage_customers")) {
    return { error: NextResponse.json({ message: "리드 일괄 작업 권한이 없습니다." }, { status: 403 }) };
  }
  if (!leadBulkEnrichmentEnabled(auth.companyId!)) {
    return { error: NextResponse.json({ message: "리드 일괄 작업을 사용할 수 없습니다." }, { status: 404 }) };
  }
  return { auth };
}

function continueJob(companyId: string, jobId: string) {
  after(() => processLeadBulkJob({
    companyId, jobId, repository: leadBulkRepository, execute: executeLeadBulkItem,
    dailyCap: leadBulkDailyCap(), minIntervalMs: leadBulkMinIntervalMs(), maxRunMs: leadBulkRunBudgetMs()
  }));
}

export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in checked) return checked.error;
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!isLeadBulkUuid(jobId)) return NextResponse.json({ message: "작업 ID를 확인해 주세요." }, { status: 400 });
  const job = await leadBulkRepository.getJob(checked.auth.companyId!, jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ message: "작업을 찾을 수 없습니다." }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown; companyId?: string; idempotencyKey?: unknown; jobId?: unknown; leadIds?: unknown; operation?: unknown;
  } | null;
  const checked = await scope(request, body?.companyId);
  if ("error" in checked) return checked.error;
  const companyId = checked.auth.companyId!;
  const operation = body?.operation || "start";

  try {
    if (operation === "cancel" || operation === "retry_failed" || operation === "resume") {
      if (!isLeadBulkUuid(body?.jobId)) return NextResponse.json({ message: "작업 ID를 확인해 주세요." }, { status: 400 });
      if (operation === "resume") {
        const job = await leadBulkRepository.getJob(companyId, body.jobId);
        if (!job) return NextResponse.json({ message: "작업을 찾을 수 없습니다." }, { status: 404 });
        if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
          return NextResponse.json({ message: "종료된 작업은 재개할 수 없습니다." }, { status: 409 });
        }
        continueJob(companyId, job.id);
        return NextResponse.json(job, { status: 202 });
      }
      const job = operation === "cancel"
        ? await leadBulkRepository.requestCancel(companyId, body.jobId)
        : await leadBulkRepository.retryFailed(companyId, body.jobId);
      if (operation === "retry_failed") continueJob(companyId, job.id);
      return NextResponse.json(job);
    }

    const action = parseLeadBulkAction(body?.action);
    const leadIds = normalizeLeadBulkIds(body?.leadIds);
    if (operation !== "start" || !action || !isLeadBulkUuid(body?.idempotencyKey) || !leadIds.length || leadIds.length > LEAD_BULK_MAX_ITEMS) {
      return NextResponse.json({ message: `작업 종류, 재시도 키와 리드 1~${LEAD_BULK_MAX_ITEMS.toLocaleString()}건을 확인해 주세요.` }, { status: 400 });
    }
    const actorName = resolveLeadContactActorName([
      getCustomerOperationalName(checked.auth.customerSession),
      checked.auth.customerSession?.name,
      checked.auth.adminSession?.name
    ]);
    const job = await leadBulkRepository.createJob({ action, actorName, companyId, idempotencyKey: body.idempotencyKey, leadIds });
    continueJob(companyId, job.id);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "일괄 작업을 시작하지 못했습니다.";
    if (/daily_limit_exceeded/.test(message)) return NextResponse.json({ message: "회사 일일 외부 조회 한도를 모두 사용했습니다." }, { status: 429 });
    if (/lead_not_found/.test(message)) return NextResponse.json({ message: "리드를 찾을 수 없습니다." }, { status: 404 });
    if (/job_not_found/.test(message)) return NextResponse.json({ message: "작업을 찾을 수 없습니다." }, { status: 404 });
    if (/job_cancelled/.test(message)) return NextResponse.json({ message: "취소된 작업은 다시 처리할 수 없습니다." }, { status: 409 });
    if (/no_failed_items/.test(message)) return NextResponse.json({ message: "다시 처리할 실패 항목이 없습니다." }, { status: 409 });
    return NextResponse.json({ message: "일괄 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

