export function normalizeNameForDuplicateCheck(value: string) {
  return value
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function makeCustomerKey(customerName: string, address: string) {
  return `${customerName}-${address}`
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-zA-Z가-힣-]/g, "");
}
