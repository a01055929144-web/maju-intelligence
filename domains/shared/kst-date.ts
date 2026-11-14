// CC-47-3 한국(Asia/Seoul, UTC+9, 서머타임 없음) 날짜 공용 함수. 비즈니스 규칙 아님 — 서식·'오늘' 구하기만.
// `new Date().toISOString().slice(0, 10)`은 UTC라 한국 00:00~08:59에 하루 전 날짜가 된다 → 항상 이 파일 함수를 쓴다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
type DateInput = string | number | Date;

const pad = (value: number) => String(value).padStart(2, "0");
const toKst = (value: DateInput) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + KST_OFFSET_MS);
};

/** 한국 기준 날짜 "YYYY-MM-DD". 잘못된 값이면 "". */
export function kstDateKey(value: DateInput): string {
  const kst = toKst(value);
  return kst ? `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}` : "";
}

/** 한국 기준 오늘 "YYYY-MM-DD". now는 테스트용. */
export const kstToday = (now: Date = new Date()): string => kstDateKey(now);

/** short `11/14(토)` · long `2026. 11. 14.` · datetime `11/14(토) 22:38`. 잘못된 값이면 "". */
export function formatKstDate(value: DateInput, style: "short" | "long" | "datetime"): string {
  const kst = toKst(value);
  if (!kst) return "";
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  if (style === "long") return `${kst.getUTCFullYear()}. ${month}. ${day}.`;
  const short = `${pad(month)}/${pad(day)}(${WEEKDAYS[kst.getUTCDay()]})`;
  return style === "short" ? short : `${short} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/** 실제 있는 날짜의 "YYYY-MM-DD"인지(2026-02-30은 false). */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
