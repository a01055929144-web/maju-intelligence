export const TMS_SERVICE_TIME_ZONE = "Asia/Seoul";

/**
 * Returns the business date used by TMS routes, completions, and GPS history.
 *
 * Browser-local dates are not safe here: a dispatcher outside Korea (or a
 * device with the wrong time-zone setting) can otherwise poll a different
 * route day around midnight. TMS business dates are always KST.
 */
export function getTmsServiceDateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("유효한 TMS 업무 시각이 필요합니다.");

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TMS_SERVICE_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
