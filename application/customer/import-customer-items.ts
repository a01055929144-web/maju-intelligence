import { parseCustomerItemImport, type CustomerItemImportRow } from "../../domains/customer/customer-item-import";

export type CustomerItemsWriter = (companyId: string, rows: CustomerItemImportRow[]) => Promise<{ applied: number; skipped: number }>;

export function importCustomerItems(companyId: string, input: unknown, write: CustomerItemsWriter) {
  return write(companyId, parseCustomerItemImport(input));
}
