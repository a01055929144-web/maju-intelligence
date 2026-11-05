/** Render locally: signed order tokens must never be sent to a third-party QR service. */
export async function documentOrderQr(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/store" || parsed.search || parsed.username || parsed.password || !parsed.hash || parsed.hash.length > 201)
    throw new Error("주문 링크를 확인해 주세요.");
  const { toDataURL } = await import("qrcode");
  return toDataURL(url, { errorCorrectionLevel: "M", margin: 4, width: 512 });
}
