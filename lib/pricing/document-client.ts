export async function documentRequest<T>(
  companyId: string,
  action: string,
  payload: Record<string, unknown> = {},
  write = false,
): Promise<{ result: T; manager: boolean }> {
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
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || "문서 처리에 실패했습니다.");
  return body;
}
