// CC-56: 회사 알림 목록 부품(components/ui/notification-list.tsx)이 쓰는 순수 규칙. 계약 = docs/sql-drafts/2026-11-17-store-profile-notifications.sql 의 public.company_notifications.
export type CompanyNotification = {
  readonly id: string;
  /** 예: new_order · new_store · store_review_required · store_profile_changed (text라 새 종류가 생겨도 마이그레이션 없음). */
  readonly notificationType: string;
  readonly createdAt: string;
  readonly readAt?: string | null;
  readonly processedAt?: string | null;
  /** 어느 매장·거래처인지 화면이 이름으로 바꿔 넘긴다(DB에는 id만 있음). */
  readonly subject?: string;
  readonly beforeValues?: Readonly<Record<string, unknown>>;
  readonly afterValues?: Readonly<Record<string, unknown>>;
};

export type NotificationStatus = "new" | "read" | "processed";

/** 처리됨 > 읽음 > 새 알림 순으로 우선. */
export function notificationStatus(item: Pick<CompanyNotification, "processedAt" | "readAt">): NotificationStatus {
  if (item.processedAt) return "processed";
  return item.readAt ? "read" : "new";
}

/** 목록 정렬: 처리 안 된 것 먼저(새 알림 → 읽음), 같은 묶음 안에서는 최신순. 입력은 바꾸지 않는다. */
export function sortNotifications<T extends Pick<CompanyNotification, "createdAt" | "processedAt" | "readAt">>(items: readonly T[]): T[] {
  const rank = { new: 0, read: 1, processed: 2 } as const;
  return [...items].sort((a, b) => rank[notificationStatus(a)] - rank[notificationStatus(b)] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** 안 읽은 알림 개수(처리된 것은 읽은 것으로 본다). */
export const unreadCount = (items: readonly Pick<CompanyNotification, "processedAt" | "readAt">[]) => items.filter((item) => notificationStatus(item) === "new").length;

/** 매장 정보 변경 알림 칸 이름(S-2b 계약의 JSON 키). 모르는 키는 키 그대로 보여 준다. */
export const STORE_PROFILE_FIELD_LABELS: Readonly<Record<string, string>> = {
  storeName: "매장명",
  representativeName: "대표자",
  baseAddress: "기본 주소",
  addressDetail: "상세 주소",
  accessNote: "출입 안내",
  deliveryContactPhone: "배송 연락처",
  preferredDeliveryTime: "희망 배송 시간"
};

export type NotificationDiffRow = { readonly key: string; readonly label: string; readonly before: string; readonly after: string };

const text = (value: unknown) => (value === null || value === undefined || value === "" ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));

/** 전후 비교: 값이 달라진 칸만, 키 이름순. 비어 있던 칸은 빈 문자열. */
export function diffNotificationValues(before: Readonly<Record<string, unknown>> = {}, after: Readonly<Record<string, unknown>> = {}, labels: Readonly<Record<string, string>> = STORE_PROFILE_FIELD_LABELS): NotificationDiffRow[] {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .sort()
    .map((key) => ({ key, label: labels[key] ?? key, before: text(before[key]), after: text(after[key]) }))
    .filter((row) => row.before !== row.after);
}
