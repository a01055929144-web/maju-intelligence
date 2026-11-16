/** Supabase Storage object key에 쓸 수 있도록 확장자를 보존해 파일명을 정리합니다. */
export function sanitizeStorageFilename(filename: string) {
  const fallback = "attachment";
  const normalized = filename.normalize("NFKC").trim();
  const lastDotIndex = normalized.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < normalized.length - 1;
  const base = hasExtension ? normalized.slice(0, lastDotIndex) : normalized;
  const extension = hasExtension ? normalized.slice(lastDotIndex + 1) : "";

  const safeBase =
    base
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback;
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

export function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
