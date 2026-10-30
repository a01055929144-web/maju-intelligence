import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_PATTERN = /^([0-9a-f]{8}-[0-9a-f-]{27,})\.([0-9a-f]{32})\.([0-9a-f]{64})$/i;

function secret() {
  const value = process.env.STORE_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("매장 링크 설정이 준비되지 않았습니다.");
  return value;
}

function signature(id: string, nonce: string) {
  return createHmac("sha256", secret()).update(`store-link-v1:${id}:${nonce}`).digest("hex");
}

export function issueStoreLinkToken(id: string, nonce = randomBytes(16).toString("hex")) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) || !/^[0-9a-f]{32}$/.test(nonce))
    throw new Error("매장 링크 번호를 확인해 주세요.");
  const token = `${id}.${nonce}.${signature(id, nonce)}`;
  return { token, nonce, hash: createHash("sha256").update(token).digest("hex") };
}

export function verifyStoreLinkToken(value: string) {
  const match = TOKEN_PATTERN.exec(value);
  if (!match) return null;
  try {
    const expected = Buffer.from(signature(match[1], match[2]), "hex");
    const given = Buffer.from(match[3], "hex");
    if (!timingSafeEqual(expected, given)) return null;
    return { id: match[1], nonce: match[2], hash: createHash("sha256").update(value).digest("hex") };
  } catch { return null; }
}
