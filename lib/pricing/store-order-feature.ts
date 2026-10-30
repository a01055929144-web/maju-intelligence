/** P2 stays dormant until its schema and the P0/P1 schemas are approved and applied. */
export function storeOrderingEnabled() {
  if (process.env.STORE_ORDERING_ENABLED !== "true" ||
    (process.env.STORE_LINK_SECRET?.length ?? 0) < 32 ||
    !process.env.STORE_PUBLIC_BASE_URL) return false;
  try {
    const url = new URL(process.env.STORE_PUBLIC_BASE_URL);
    return url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch { return false; }
}
