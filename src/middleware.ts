import { NextResponse } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";

const middleware = withAuth(
  (request: NextRequestWithAuth) => {
    const token = request.nextauth.token;
    const { pathname } = request.nextUrl;

    const isLoginPage = pathname === "/admin/login";
    const isAdminPage = pathname.startsWith("/admin");
    const isAdminApi = pathname.startsWith("/api/admin");

    if (isLoginPage && token) {
      return NextResponse.redirect(new URL("/admin/artists", request.url));
    }

    if ((isAdminPage || isAdminApi) && !token) {
      if (isAdminApi) {
        return NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "인증이 필요합니다.",
            },
          },
          { status: 401 },
        );
      }

      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: () => true,
    },
    pages: {
      signIn: "/admin/login",
    },
  },
);

export default middleware;

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
