export async function documentRequest<T>(
  companyId: string,
  action: string,
  payload: Record<string, unknown> = {},
  write = false,
): Promise<{ result: T; manager: boolean; archiveAvailable?: boolean }> {
  const params = new URLSearchParams({ companyId, action });
  if (!write)
    for (const [key, value] of Object.entries(payload))
      if (value !== undefined && value !== null)
        params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  const response = await fetch(
    `/api/pricing-documents?${params}`,
    write
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        }
      : { cache: "no-store" },
  );
  let body: { result: T; manager: boolean; archiveAvailable?: boolean; message?: string };
  try { body = await response.json(); }
  catch { throw new Error("문서 응답을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요."); }
  if (!response.ok)
    throw new Error(body.message || "문서 처리에 실패했습니다.");
  return body;
}
