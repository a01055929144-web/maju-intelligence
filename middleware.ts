import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "maju_admin_session";
const CUSTOMER_COOKIE_NAME = "maju_customer_session";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hasAdminSession = Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const hasCustomerSession = Boolean(request.cookies.get(CUSTOMER_COOKIE_NAME)?.value);

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
  matcher: ["/", "/crm/:path*"]
};
