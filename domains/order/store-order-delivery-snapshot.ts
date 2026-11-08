const limits = {
  deliveryCustomerNameSnapshot: 200,
  deliveryAddressSnapshot: 500,
  deliveryAddressDetailSnapshot: 500,
  deliveryRecipientPhoneSnapshot: 40,
  deliveryLoadingPositionSnapshot: 500,
} as const;

export function parseStoreOrderDeliverySnapshot(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("delivery_snapshot_required");
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some(key => !Object.hasOwn(limits, key))) throw new Error("delivery_snapshot_invalid");
  const result = {} as Record<keyof typeof limits, string | null>;
  for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
    const raw = source[key];
    if (raw != null && typeof raw !== "string") throw new Error("delivery_snapshot_invalid");
    const value = typeof raw === "string" ? raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") || null : null;
    if (value && Array.from(value).length > limits[key]) throw new Error("delivery_snapshot_invalid");
    result[key] = value;
  }
  if (!result.deliveryCustomerNameSnapshot || !result.deliveryAddressSnapshot) throw new Error("delivery_snapshot_required");
  return result;
}
