export const OUTREACH_TEXT_CHANNELS = ["sms", "kakao", "instagram", "talktalk", "cafe_comment", "note"] as const;
export type OutreachTextChannel = (typeof OUTREACH_TEXT_CHANNELS)[number];

export const OUTREACH_TEXT_CHANNEL_LABEL: Record<OutreachTextChannel, string> = {
  sms: "문자",
  kakao: "카톡",
  instagram: "인스타 DM",
  talktalk: "네이버 톡톡",
  cafe_comment: "카페 댓글",
  note: "쪽지"
};

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function withOneLink(body: string, link?: string) {
  const cleanLink = link?.trim();
  const cleanBody = cleanLink ? body.split(cleanLink).join("").replace(/\n{3,}/g, "\n\n").trim() : body.trim();
  return cleanLink ? `${cleanBody}\n\n${cleanLink}`.trim() : cleanBody;
}

export function buildOutreachChannelText(channel: OutreachTextChannel, body: string, link?: string) {
  const trimmed = body.trim();
  let text: string;
  if (channel === "cafe_comment") {
    const withoutUrls = trimmed.replace(/https?:\/\/\S+/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const shortBody = withoutUrls.length > 80 ? `${withoutUrls.slice(0, 77).trimEnd()}…` : withoutUrls;
    text = withOneLink(shortBody, link);
  } else if (channel === "instagram" || channel === "talktalk" || channel === "note") {
    text = `안녕하세요.\n\n${withOneLink(trimmed, link)}`.trim();
  } else {
    text = withOneLink(trimmed, link);
  }
  const bytes = utf8ByteLength(text);
  return { bytes, longSms: channel === "sms" && bytes > 90, text };
}
