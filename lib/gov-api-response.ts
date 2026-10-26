type GovApiHeader = { resultCode?: unknown; resultMsg?: unknown };

export type GovApiFailure = {
  resultCode: string | null;
  resultMessage: string | null;
};

function safeField(value: unknown, apiKey: string): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let text = String(value).trim();
  if (!text) return null;
  if (apiKey) text = text.replaceAll(apiKey, "[redacted]");
  text = text.replace(/(serviceKey[=:]\s*)[^\s&<>"']+/gi, "$1[redacted]");
  return text.slice(0, 300);
}

function readHeader(body: unknown): GovApiHeader | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const response = record.response && typeof record.response === "object"
    ? record.response as Record<string, unknown>
    : record;
  const header = response.header && typeof response.header === "object"
    ? response.header as GovApiHeader
    : response as GovApiHeader;
  return header.resultCode !== undefined || header.resultMsg !== undefined ? header : null;
}

/** Extract only documented error fields. Never return an upstream body or request URL. */
export function parseGovApiFailure(body: string, apiKey: string): GovApiFailure {
  let header: GovApiHeader | null = null;
  try {
    header = readHeader(JSON.parse(body));
  } catch {
    const resultCode = body.match(/<resultCode>([^<]*)<\/resultCode>/i)?.[1];
    const resultMsg = body.match(/<resultMsg>([^<]*)<\/resultMsg>/i)?.[1];
    header = resultCode || resultMsg ? { resultCode, resultMsg } : null;
  }
  return {
    resultCode: safeField(header?.resultCode, apiKey),
    resultMessage: safeField(header?.resultMsg, apiKey)
  };
}

export class GovApiResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly failure: GovApiFailure,
    public readonly elapsedMs: number
  ) {
    super(`정부 음식점 API HTTP ${status}${failure.resultCode ? ` (${failure.resultCode})` : ""}${failure.resultMessage ? `: ${failure.resultMessage}` : ""}`);
  }
}
