import { after, NextRequest, NextResponse } from "next/server";
import { processLeadBulkJob } from "@/application/lead/run-bulk-enrichment";
import { normalizeLeadBulkIds, parseLeadBulkAction } from "@/domains/lead/bulk-enrichment";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { executeLeadBulkItem, leadBulkRepository } from "@/lib/lead-bulk-enrichment";
import { leadBulkDailyCap, leadBulkEnrichmentEnabled, leadBulkMinIntervalMs } from "@/lib/lead-bulk-enrichment-feature";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);

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
    dailyCap: leadBulkDailyCap(), minIntervalMs: leadBulkMinIntervalMs()
  }));
}

export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in checked) return checked.error;
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!uuid(jobId)) return NextResponse.json({ message: "작업 ID를 확인해 주세요." }, { status: 400 });
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
    if (operation === "cancel" || operation === "retry_failed") {
      if (!uuid(body?.jobId)) return NextResponse.json({ message: "작업 ID를 확인해 주세요." }, { status: 400 });
      const job = operation === "cancel"
        ? await leadBulkRepository.requestCancel(companyId, body.jobId)
        : await leadBulkRepository.retryFailed(companyId, body.jobId);
      if (operation === "retry_failed") continueJob(companyId, job.id);
      return NextResponse.json(job);
    }

    const action = parseLeadBulkAction(body?.action);
    const leadIds = normalizeLeadBulkIds(body?.leadIds);
    if (!action || !uuid(body?.idempotencyKey) || !leadIds.length || leadIds.length > 50) {
      return NextResponse.json({ message: "작업 종류, 재시도 키와 리드 1~50건을 확인해 주세요." }, { status: 400 });
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
    const status = /daily_limit_exceeded/.test(message) ? 429 : /lead_not_found|job_not_found/.test(message) ? 404 : 500;
    return NextResponse.json({ message: status === 429 ? "회사 일일 외부 조회 한도를 모두 사용했습니다." : message }, { status });
  }
}

