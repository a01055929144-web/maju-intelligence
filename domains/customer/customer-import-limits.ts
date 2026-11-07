export const CUSTOMER_IMPORT_MAX_ROWS = 5000;
export const CUSTOMER_IMPORT_MAX_MAPPINGS = 200;
export const CUSTOMER_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

export function getCustomerImportLimitMessage(input: { contentLength: number; mappingCount: number; rowCount: number }) {
  if (input.contentLength > CUSTOMER_IMPORT_MAX_BYTES) return "가져오기 요청은 25MB 이하여야 합니다.";
  if (input.rowCount > CUSTOMER_IMPORT_MAX_ROWS || input.mappingCount > CUSTOMER_IMPORT_MAX_MAPPINGS) {
    return "한 번에 거래처 5,000행과 열 매핑 200개까지만 저장할 수 있습니다.";
  }
  return null;
}
