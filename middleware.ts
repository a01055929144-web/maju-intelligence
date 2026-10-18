import { NextRequest, NextResponse } from "next/server";
import { areHoldModulesEnabled, CORE_LEADS_HREF, isHoldModulePath } from "@/lib/feature-modules";

const ADMIN_COOKIE_NAME = "maju_admin_session";
const CUSTOMER_COOKIE_NAME = "maju_customer_session";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hasAdminSession = Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const hasCustomerSession = Boolean(request.cookies.get(CUSTOMER_COOKIE_NAME)?.value);

  if (isHoldModulePath(pathname)) {
    const companyId = hasCustomerSession
      ? readUnsignedSessionCompanyId(request.cookies.get(CUSTOMER_COOKIE_NAME)?.value)
      : searchParams.get("companyId");
    if (!areHoldModulesEnabled(companyId)) return NextResponse.redirect(new URL(CORE_LEADS_HREF, request.url));
  }

  if (pathname === "/" || pathname.startsWith("/crm/")) {
    if (!hasAdminSession && !hasCustomerSession) {
      return NextResponse.redirect(new URL("/dashboard/login", request.url));
    }

    if (hasAdminSession && !hasCustomerSession && !searchParams.get("companyId")) {
      return NextResponse.redirect(new URL("/admin/companies", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/assistant/:path*", "/crm/:path*", "/operations/:path*", "/purchasing/:path*", "/reports/:path*", "/revenue/:path*", "/sales/performance/:path*"]
};

function readUnsignedSessionCompanyId(cookieValue?: string) {
  const payload = cookieValue?.split(".")[0];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const session = JSON.parse(atob(normalized)) as { companyId?: string };
    return session.companyId;
  } catch {
    return undefined;
  }
}
