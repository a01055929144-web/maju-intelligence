/** Deployment opt-in only; SQL approval/application must precede activation. */
export const PRICE_SHEETS_ENABLED = false;
export function priceSheetsEnabled(value = process.env.PRICE_SHEETS_ENABLED) {
  return value === "true";
}
