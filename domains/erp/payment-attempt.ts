export type PartnerPaymentAttempt = {
  companyId: string;
  partnerType: "customer" | "supplier";
  partnerId: string;
  entryDate: string;
  amount: number;
  paymentMethod: "cash" | "bank" | "card";
  idempotencyKey: string;
};

type PaymentAttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PAYMENT_ATTEMPT_PREFIX = "maju:partner-payment:v1:";

export function createPartnerPaymentAttempt(
  input: Omit<PartnerPaymentAttempt, "idempotencyKey">,
  createKey: () => string = () => crypto.randomUUID(),
): PartnerPaymentAttempt {
  return { ...input, idempotencyKey: createKey() };
}

export function partnerPaymentAttemptStorageKey(
  scope: Pick<PartnerPaymentAttempt, "companyId" | "partnerType" | "partnerId">,
) {
  return `${PAYMENT_ATTEMPT_PREFIX}${encodeURIComponent(scope.companyId)}:${scope.partnerType}:${encodeURIComponent(scope.partnerId)}`;
}

function parsePartnerPaymentAttempt(value: string | null): PartnerPaymentAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PartnerPaymentAttempt>;
    if (
      typeof parsed.companyId !== "string" || !parsed.companyId
      || (parsed.partnerType !== "customer" && parsed.partnerType !== "supplier")
      || typeof parsed.partnerId !== "string" || !parsed.partnerId
      || typeof parsed.entryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.entryDate)
      || typeof parsed.amount !== "number" || !Number.isFinite(parsed.amount) || parsed.amount <= 0
      || (parsed.paymentMethod !== "cash" && parsed.paymentMethod !== "bank" && parsed.paymentMethod !== "card")
      || typeof parsed.idempotencyKey !== "string" || !parsed.idempotencyKey
    ) return null;
    return {
      companyId: parsed.companyId,
      partnerType: parsed.partnerType,
      partnerId: parsed.partnerId,
      entryDate: parsed.entryDate,
      amount: parsed.amount,
      paymentMethod: parsed.paymentMethod,
      idempotencyKey: parsed.idempotencyKey,
    };
  } catch {
    return null;
  }
}

export function savePartnerPaymentAttempt(storage: PaymentAttemptStorage, attempt: PartnerPaymentAttempt) {
  try {
    storage.setItem(partnerPaymentAttemptStorageKey(attempt), JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function loadPartnerPaymentAttempt(
  storage: PaymentAttemptStorage,
  scope: Pick<PartnerPaymentAttempt, "companyId" | "partnerType" | "partnerId">,
) {
  try {
    const attempt = parsePartnerPaymentAttempt(storage.getItem(partnerPaymentAttemptStorageKey(scope)));
    if (!attempt) return null;
    if (attempt.companyId !== scope.companyId || attempt.partnerType !== scope.partnerType || attempt.partnerId !== scope.partnerId) return null;
    return attempt;
  } catch {
    return null;
  }
}

export function findCompanyPartnerPaymentAttempt(storage: PaymentAttemptStorage, companyId: string) {
  try {
    const companyPrefix = `${PAYMENT_ATTEMPT_PREFIX}${encodeURIComponent(companyId)}:`;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(companyPrefix)) continue;
      const attempt = parsePartnerPaymentAttempt(storage.getItem(key));
      if (attempt?.companyId === companyId && partnerPaymentAttemptStorageKey(attempt) === key) return attempt;
    }
  } catch {
    return null;
  }
  return null;
}

export function removePartnerPaymentAttempt(storage: PaymentAttemptStorage, attempt: PartnerPaymentAttempt) {
  try {
    storage.removeItem(partnerPaymentAttemptStorageKey(attempt));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
