import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

// 2026-08-26 보안 수정("고객사에 실제로 판매하려면 보완해야 할 점"): 로그인 비밀번호를 평문으로
// 저장·비교하던 것을 scrypt 기반 해시로 전환합니다. bcrypt/argon2 같은 별도 패키지를 추가하지 않고
// Node.js 내장 crypto.scrypt만으로 구현해 배포 파이프라인에 새 네이티브 의존성을 늘리지 않습니다.
//
// 이 모듈은 lib/auth.ts와 lib/store.ts 양쪽에서 순환 참조 없이 쓸 수 있도록 독립된 파일로 둡니다.
const scrypt = promisify(scryptCallback);

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

/** 새 비밀번호를 저장용 해시 문자열("scrypt$salt$hash")로 변환합니다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

/** 저장된 값이 이미 해시 형식인지 확인합니다(레거시 평문 비밀번호와 구분하기 위함). */
export function isHashedPassword(value: string): boolean {
  return value.startsWith(`${HASH_PREFIX}$`);
}

/**
 * 입력한 비밀번호가 저장된 값과 일치하는지 확인합니다. 저장된 값이 아직 해시로 전환되지 않은
 * 레거시 평문이면 문자열 비교로 한 번 더 허용하고, 호출부(lib/auth.ts)가 로그인 성공 시 그 자리에서
 * 해시로 재저장(레이지 마이그레이션)하도록 합니다.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashedPassword(stored)) {
    return password === stored;
  }

  const [, salt, hashHex] = stored.split("$");
  if (!salt || !hashHex) return false;

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}
