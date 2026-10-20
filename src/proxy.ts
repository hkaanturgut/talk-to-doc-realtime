import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/server/access/cookie";
import { accessCode } from "@/server/access/config";
import { decide } from "@/server/access/gate";
import { ERROR_META, type ErrorCode } from "@/shared/errors";
import { MESSAGES } from "@/shared/messages";

/** Origin check and access gate for every page and API (feature 003, research R3 and R7). */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const decision = await decide({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    contentLength: request.headers.get("content-length"),
    cookie: request.cookies.get(ACCESS_COOKIE)?.value,
    code: accessCode(),
  });

  switch (decision.action) {
    case "pass":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, request.url), 307);
    case "too_large":
      return refuse(decision.code);
    case "forbidden":
      return refuse("FORBIDDEN");
    case "unauthorized":
      return refuse("UNAUTHORIZED");
  }
}

function refuse(code: ErrorCode): NextResponse {
  const { status, retryable } = ERROR_META[code];
  return NextResponse.json(
    { error: { code, message: MESSAGES[code], retryable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  // Skip only Next.js build assets; anchored so no other path can opt out of the gate.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};
