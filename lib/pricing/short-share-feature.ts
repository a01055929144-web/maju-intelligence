import { isId } from "@/domains/pricing/document";

const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$/;

export function shortShareLinksEnabled(companyId?: string) {
  if (!shortShareLinksGloballyEnabled() || !companyId || !isId(companyId)) return false;
  return (process.env.SHORT_SHARE_LINKS_COMPANY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(isId)
    .includes(companyId);
}

export function shortShareLinksGloballyEnabled() {
  return process.env.SHORT_SHARE_LINKS === "true";
}

export function isShortShareCode(value: string) {
  return CODE_PATTERN.test(value);
}

export function shortShareDevice(userAgent: string) {
  if (/ipad|tablet|kindle/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone/i.test(userAgent)) return "mobile";
  return userAgent ? "desktop" : "unknown";
}

export function isSharePreviewBot(userAgent: string) {
  return /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|naverbot|googlebot|bingbot/i.test(userAgent);
}
