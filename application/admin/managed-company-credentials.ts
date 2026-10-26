export function exposeManagedCompanyCredentialState(customerEmail: string | null | undefined, storedPassword: string | null | undefined) {
  return {
    customerEmail: customerEmail || "",
    hasPassword: Boolean(storedPassword)
  };
}
