export type LeadBusinessHourInterval = {
  weekday: number;
  intervalIndex: number;
  opensAt?: string;
  closesAt?: string;
  isClosed: boolean;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function parseLeadBusinessHoursQuickInput(value: string): LeadBusinessHourInterval[] {
  const text = value.trim();
  if (!text) return [];
  const clauses = text.split(/\s*[·,]\s*/).filter(Boolean);
  if (clauses.length > 1) return clauses.flatMap(parseLeadBusinessHoursQuickInput).map((item, index, all) => ({
    ...item,
    intervalIndex: all.slice(0, index).filter((prior) => prior.weekday === item.weekday).length
  }));
  const targetDays = text.includes("매일")
    ? [0, 1, 2, 3, 4, 5, 6]
    : DAY_LABELS.flatMap((label, weekday) => text.includes(`${label} `) || text.startsWith(label) ? [weekday] : []);
  if (!targetDays.length) throw new Error("요일을 입력해 주세요. 예: 매일 또는 월");
  const time = text.match(/([01]?\d|2[0-3]):([0-5]\d)\s*[~～-]\s*([01]?\d|2[0-3]):([0-5]\d)/);
  const isBreak = /브레이크|휴게/.test(text);
  const isClosed = /휴무/.test(text) || isBreak;
  if (!time && !/휴무/.test(text)) throw new Error("시간을 HH:MM~HH:MM 형식으로 입력해 주세요.");
  return targetDays.map((weekday) => ({
    weekday,
    intervalIndex: 0,
    opensAt: time ? `${time[1].padStart(2, "0")}:${time[2]}` : undefined,
    closesAt: time ? `${time[3].padStart(2, "0")}:${time[4]}` : undefined,
    isClosed
  }));
}

export function getLeadVisitAvailability(intervals: LeadBusinessHourInterval[], now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const weekday = kst.getUTCDay();
  const minute = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const today = intervals.filter((item) => item.weekday === weekday);
  const toMinute = (time?: string) => time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : undefined;
  const allDayClosed = today.some((item) => item.isClosed && !item.opensAt);
  const inBreak = today.some((item) => {
    const start = toMinute(item.opensAt); const end = toMinute(item.closesAt);
    return item.isClosed && start !== undefined && end !== undefined && minute >= start && minute < end;
  });
  const openWindows = today.filter((item) => !item.isClosed && item.opensAt && item.closesAt);
  const inOpenWindow = !openWindows.length || openWindows.some((item) => {
    const start = toMinute(item.opensAt)!; const end = toMinute(item.closesAt)!;
    return minute >= start && minute < end;
  });
  return { hasBreakToday: today.some((item) => item.isClosed && Boolean(item.opensAt)), isVisitAvailableNow: !allDayClosed && !inBreak && inOpenWindow };
}

export function formatLeadBusinessHours(intervals: LeadBusinessHourInterval[]) {
  if (!intervals.length) return "미입력";
  return intervals.map((item) => `${DAY_LABELS[item.weekday]} ${item.opensAt && item.closesAt ? `${item.opensAt}~${item.closesAt} ${item.isClosed ? "브레이크" : "영업"}` : "휴무"}`).join(" · ");
}
