/** Enable only after the read-only issuer SQL is approved, applied and verified. */
export function readOnlyStoreLinksEnabled() {
  return process.env.READ_ONLY_STORE_LINKS_ENABLED === "true";
}
