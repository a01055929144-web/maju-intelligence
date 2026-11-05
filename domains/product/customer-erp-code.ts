/** MAJU's generated product code is an internal identifier, not the customer's ERP code. */
export function customerErpCode(code: string | null | undefined): string {
  const value = code?.trim() || "";
  return /^P-\d{6,}$/.test(value) ? "" : value;
}
