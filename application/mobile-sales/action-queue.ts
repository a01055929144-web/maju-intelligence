export const MOBILE_SALES_ACTION_QUEUE_KEY = "maju:mobile-sales-action-queue:v1";

export type QueuedMobileSalesAction = {
  createdAt: string;
  id: string;
  leadId: string;
  payload: Record<string, unknown>;
};

export function readMobileSalesActionQueue(storage: Pick<Storage, "getItem">): QueuedMobileSalesAction[] {
  try {
    const value = JSON.parse(storage.getItem(MOBILE_SALES_ACTION_QUEUE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((item): item is QueuedMobileSalesAction => Boolean(item?.id && item?.leadId && item?.payload))
      : [];
  } catch {
    return [];
  }
}

export function writeMobileSalesActionQueue(storage: Pick<Storage, "setItem">, items: QueuedMobileSalesAction[]) {
  try {
    storage.setItem(MOBILE_SALES_ACTION_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // 저장 공간이 막힌 환경에서도 현재 화면의 영업 기록 흐름은 계속 사용합니다.
  }
}

export async function flushMobileSalesActionQueue(
  items: QueuedMobileSalesAction[],
  send: (item: QueuedMobileSalesAction) => Promise<boolean>
) {
  const remaining: QueuedMobileSalesAction[] = [];
  for (const item of items) {
    if (!(await send(item))) remaining.push(item);
  }
  return remaining;
}

