import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "../../../lib/auth";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { priceSheetsEnabled } from "../../../lib/pricing/feature";
import { canManagePriceSheets } from "../../../domains/pricing/access";
import { pricingDocuments } from "../../../application/pricing/documents";
import { pricingDocumentsRepository } from "../../../lib/pricing/documents-repository";
import { documentArchiveEnabled } from "../../../lib/pricing/document-archive";
import { DocumentSendError } from "../../../domains/pricing/document-send";
export const dynamic = "force-dynamic";
const documents = pricingDocuments(pricingDocumentsRepository);
async function handle(request: NextRequest, write: boolean) {
  if (!priceSheetsEnabled())
    return NextResponse.json(
      { message: "사용할 수 없는 기능입니다." },
      { status: 404 },
    );
  if (write && request.headers.get("origin")) {
    let sameOrigin = false;
    try {
      const origin = new URL(request.headers.get("origin")!);
      sameOrigin =
        ["http:", "https:"].includes(origin.protocol) &&
        origin.host.toLowerCase() ===
          (request.headers.get("host") || request.nextUrl.host).toLowerCase();
    } catch {
      /* malformed Origin is rejected */
    }
    if (!sameOrigin)
      return NextResponse.json(
        { message: "같은 화면에서 다시 시도해 주세요." },
        { status: 403 },
      );
  }
  const auth = await getRequestAuthScope(request);
  if (!auth.ok)
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  if (!auth.companyId || !isFeatureEnabled("PRICING", auth.companyId))
    return NextResponse.json(
      { message: "사용할 수 없는 기능입니다." },
      { status: 404 },
    );
  const manager =
    !auth.customerSession || canManagePriceSheets(auth.customerSession);
  if (!manager && auth.customerSession?.workspaceRole !== "sales")
    return NextResponse.json(
      { message: "문서 작성 권한이 없습니다." },
      { status: 403 },
    );
  const identity =
    auth.customerSession?.userId ||
    auth.customerSession?.companyMemberId ||
    auth.customerSession?.email ||
    auth.adminSession?.email;
  if (!identity)
    return NextResponse.json(
      { message: "작성자를 확인할 수 없습니다. 다시 로그인해 주세요." },
      { status: 403 },
    );
  const scope = {
    companyId: auth.companyId,
    actor: createHash("sha256")
      .update(
        `${auth.companyId}:${auth.customerSession ? "customer" : "admin"}:${identity}`,
      )
      .digest("hex"),
    manager,
    ...(documentArchiveEnabled() ? { archiveEnabled: true } : {}),
  };
  let recordSend = false;
  try {
    const page = Number(request.nextUrl.searchParams.get("page") || 1),
      // 11/4: 화면은 search 로 보내 왔는데 q 만 읽어 검색이 안 되던 문제 — 둘 다 받습니다.
      search = (request.nextUrl.searchParams.get("search") || request.nextUrl.searchParams.get("q") || "").trim();
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      search.length > 100
    )
      return NextResponse.json(
        { message: "검색 조건을 확인해 주세요." },
        { status: 400 },
      );
    const input: unknown = write ? await request.json() : null;
    recordSend = Boolean(input && typeof input === "object" && "action" in input && input.action === "record-send");
    const result = write
      ? await documents.execute(scope, input)
      : await documents.read(
          scope,
          request.nextUrl.searchParams.get("action") || "list",
          {
            page,
            search,
            archived: request.nextUrl.searchParams.get("archived") === "true",
            id: request.nextUrl.searchParams.get("id"),
            productIds: request.nextUrl.searchParams
              .get("productIds")
              ?.split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            productCodes: request.nextUrl.searchParams
              .get("productCodes")
              ?.split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        );
    return NextResponse.json(
      { result, manager, ...(scope.archiveEnabled ? { archiveAvailable: true } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DocumentSendError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (recordSend) return NextResponse.json({ message: "전달 기록을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요." }, { status: 503 });
    console.error("Pricing P1 request failed", error);
    return NextResponse.json(
      {
        message: write
          ? "저장하지 못했습니다. 입력값과 최신 버전을 확인하고 다시 시도해 주세요."
          : "문서를 불러오지 못했습니다. 다시 시도해 주세요.",
      },
      {
        status:
          error instanceof Error &&
          /Document not found|Set not found/.test(error.message)
            ? 404
            : write
              ? 409
              : 500,
      },
    );
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
