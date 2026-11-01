export type PartnerPaymentAttempt = {
  companyId: string;
  partnerType: "customer" | "supplier";
  partnerId: string;
  entryDate: string;
  amount: number;
  paymentMethod: "cash" | "bank" | "card";
  idempotencyKey: string;
};

export function createPartnerPaymentAttempt(
  input: Omit<PartnerPaymentAttempt, "idempotencyKey">,
  createKey: () => string = () => crypto.randomUUID(),
): PartnerPaymentAttempt {
  return { ...input, idempotencyKey: createKey() };
}
