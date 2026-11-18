// supabaseRequest wraps the PostgREST body in Error.message. Never expose its
// details/hint (which may contain document data) or log the original Error.
export function documentRequestError(error: unknown, write: boolean) {
  let databaseCode: string | undefined;
  let reason = error instanceof Error ? error.message : "";
  const body = reason.match(/^Supabase request failed: \d{3} (\{[\s\S]*\})$/)?.[1];
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && "code" in parsed && "message" in parsed) {
        if (typeof parsed.code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(parsed.code)) databaseCode = parsed.code;
        reason = databaseCode === "P0001" && typeof parsed.message === "string" ? parsed.message : "";
      } else reason = "";
    } catch { reason = ""; }
  }
  const known: Record<string, [number, string, string]> = {
    "Stale document": [409, "document_conflict", "다른 화면에서 문서가 변경됐습니다. 편집 내용을 따로 보관한 뒤 문서 목록에서 다시 열어 주세요."],
    "Stale promotion": [409, "promotion_conflict", "행사가 변경됐습니다. 입력 내용을 따로 보관한 뒤 행사 목록을 다시 열어 주세요."],
    "Stale profile": [409, "profile_conflict", "인쇄 기본값이 변경됐습니다. 입력 내용을 보관한 뒤 다시 열어 주세요."],
    "Document not found": [404, "document_not_found", "문서를 찾을 수 없거나 접근할 수 없습니다. 편집 내용을 보관한 뒤 문서 목록을 확인해 주세요."],
    "Set not found": [404, "set_not_found", "묶음을 찾을 수 없습니다. 목록을 다시 확인해 주세요."],
    "Promotion not found": [400, "promotion_not_found", "문서에 담은 행사를 찾을 수 없습니다. 행사·임박 품목을 확인하고 삭제된 행사를 문서에서 빼거나 다시 담아 주세요."],
    "Promotion not enabled for sheets": [400, "promotion_sheet_disabled", "단가표 표시가 허용되지 않은 행사가 있습니다. 행사에서 ‘단가표 표시’를 허용하거나 해당 행사를 문서에서 빼 주세요."],
    "Product not found in company": [400, "product_unavailable", "문서에 삭제되었거나 비활성인 상품이 있습니다. 해당 품목을 빼고 현재 상품을 다시 담아 주세요."],
    "Product not found": [400, "product_unavailable", "상품을 찾을 수 없습니다. 활성 상품을 다시 선택해 주세요."],
    "No visible products": [400, "no_visible_products", "표시할 품목이 없습니다. 한 품목 이상 표시한 뒤 저장해 주세요."],
    "Duplicate product": [400, "duplicate_product", "중복 품목이 있습니다. 같은 상품·행사는 한 줄만 남겨 주세요."],
    "Expired document": [400, "document_expired", "문서 유효기간이 지났습니다. 기간을 수정해 저장한 뒤 다시 발행해 주세요."],
    "No available lines": [400, "no_available_lines", "발행 가능한 품목이 없습니다. 행사 기간·재고와 표시할 품목을 확인해 주세요."],
    "Manager required": [403, "manager_required", "관리 권한이 필요합니다. 대표·관리자에게 요청해 주세요."],
    "Invalid printable line": [400, "invalid_document_line", "품목 이름·단가·과세 구분을 확인한 뒤 다시 저장해 주세요."],
    "Invalid document fields": [400, "invalid_document_fields", "문서 품목 수와 표시 설정을 확인한 뒤 다시 저장해 주세요."],
    "Invalid header": [400, "invalid_document_header", "문서 제목·회사명·연락처·비고의 입력 길이를 확인해 주세요."],
    "Invalid expiry": [400, "invalid_document_expiry", "문서 유효기간을 확인한 뒤 다시 저장해 주세요."],
  };
  const match = Object.hasOwn(known, reason) ? known[reason] : undefined;
  const [status, code, message]: [number, string, string] = match ?? [write ? 503 : 500, "document_storage_failed",
    write ? "서버 저장 오류로 저장 결과를 확인하지 못했습니다. 편집 내용을 유지하고 같은 내용으로 다시 저장해 주세요. 반복되면 관리자에게 오류 코드를 알려 주세요."
      : "서버 조회 오류로 문서를 불러오지 못했습니다. 다시 시도해 주세요. 반복되면 관리자에게 오류 코드를 알려 주세요."];
  return { status, code, message: databaseCode && !match ? `${message} (${databaseCode})` : message, ...(databaseCode ? { databaseCode } : {}) };
}
