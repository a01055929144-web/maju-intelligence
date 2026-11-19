/** Render locally: signed document/order tokens must never be sent to a third-party QR service. */
export function isPublicDocumentPath(pathname: string) {
  return pathname === "/pricing-document" || /^\/q\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname);
}

export async function documentOrderQr(url: string) {
  const parsed = new URL(url);
  const publicDocument = isPublicDocumentPath(parsed.pathname);
  const localPublicPreview = publicDocument && parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localPublicPreview) || (!publicDocument && parsed.pathname !== "/store") || parsed.search || parsed.username || parsed.password || !parsed.hash || parsed.hash.length > 201)
    throw new Error("주문 링크를 확인해 주세요.");
  const { toDataURL } = await import("qrcode");
  return toDataURL(url, { errorCorrectionLevel: "M", margin: 4, width: 512 });
}
