import { describe, expect, it } from "vitest";
import { encodeStoragePath, sanitizeStorageFilename } from "./storage-path";

describe("sanitizeStorageFilename", () => {
  it("keeps safe ASCII names and normalizes the extension", () => {
    expect(sanitizeStorageFilename("  Quote_Final.PDF  ")).toBe("Quote_Final.pdf");
  });

  it("removes unsupported characters and keeps a safe fallback", () => {
    expect(sanitizeStorageFilename("거래처 통장사본 (최종).PNG")).toBe("attachment.png");
    expect(sanitizeStorageFilename("한글파일")).toBe("attachment");
  });
});

describe("encodeStoragePath", () => {
  it("encodes each segment without losing path separators", () => {
    expect(encodeStoragePath("company/profile/견적서 #1.pdf")).toBe("company/profile/%EA%B2%AC%EC%A0%81%EC%84%9C%20%231.pdf");
  });
});
