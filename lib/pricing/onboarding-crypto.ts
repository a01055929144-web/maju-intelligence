import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ProtectedRecord } from "../../domains/order/onboarding-protection";
import type { VaultEnvelope } from "../../application/order/onboarding-vault";
type Binding = Pick<
  ProtectedRecord,
  "id" | "companyId" | "customerId" | "kind"
>;
function aad(record: Binding, keyId: string) {
  return Buffer.from(
    JSON.stringify([
      "onboarding-v1",
      record.companyId,
      record.customerId,
      record.id,
      record.kind,
      keyId,
    ]),
  );
}
function key(value: Uint8Array) {
  if (value.length !== 32) throw new Error("자료 암호화 키를 확인해 주세요.");
  return value;
}
function decode(value: string, length?: number) {
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.toString("base64") !== value ||
    (length !== undefined && bytes.length !== length)
  )
    throw new Error("암호문 형식을 확인해 주세요.");
  return bytes;
}
/** Keys are supplied by a dedicated server key store; there is no env/link-secret fallback. */
export function encryptEntrance(
  value: string,
  record: Binding,
  keyId: string,
  secret: Uint8Array,
): VaultEnvelope {
  if (
    record.kind !== "entrance" ||
    !value.trim() ||
    Buffer.byteLength(value) > 2048 ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)
  )
    throw new Error("출입 정보를 확인해 주세요.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(aad(record, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    keyId,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function decryptEntrance(
  envelope: VaultEnvelope,
  record: Binding,
  keys: ReadonlyMap<string, Uint8Array>,
) {
  try {
    const secret = keys.get(envelope.keyId);
    if (
      record.kind !== "entrance" ||
      envelope.version !== 1 ||
      !secret ||
      envelope.ciphertext.length > 2800
    )
      throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      decode(envelope.iv, 12),
    );
    decipher.setAAD(aad(record, envelope.keyId));
    decipher.setAuthTag(decode(envelope.tag, 16));
    return Buffer.concat([
      decipher.update(decode(envelope.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("출입 정보를 복호화할 수 없습니다.");
  }
}
