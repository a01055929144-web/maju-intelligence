import { documentShareLinkId } from "../../domains/pricing/document-share";

export function isShortPublicDocumentPath(pathname: string) {
  return pathname.startsWith("/s/") && documentShareLinkId(pathname.slice(3)) !== null;
}

export function isPublicDocumentPath(pathname: string) {
  return isShortPublicDocumentPath(pathname) || pathname === "/pricing-document" || /^\/q\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname);
}

/** Shared by the issuing UI and local QR renderer; short aliases have no fragment. */
export function isPublicDocumentUrl(url: URL) {
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  return (url.protocol === "https:" || local) && isPublicDocumentPath(url.pathname) && !url.search && !url.username && !url.password &&
    (isShortPublicDocumentPath(url.pathname) ? !url.hash : Boolean(url.hash) && url.hash.length <= 201);
}

/** Render locally: signed document/order tokens must never be sent to a third-party QR service. */
export async function documentOrderQr(url: string) {
  const parsed = new URL(url);
  const store = parsed.protocol === "https:" && parsed.pathname === "/store" && !parsed.search && !parsed.username && !parsed.password &&
    Boolean(parsed.hash) && parsed.hash.length <= 201;
  if (!isPublicDocumentUrl(parsed) && !store) throw new Error("주문 링크를 확인해 주세요.");
  const { toDataURL } = await import("qrcode");
  return toDataURL(url, { errorCorrectionLevel: "M", margin: 4, width: 512 });
}
