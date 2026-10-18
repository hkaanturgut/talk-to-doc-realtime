import { createHash, timingSafeEqual } from "node:crypto";
import { accessCode } from "@/server/access/config";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, signAccessCookie } from "@/server/access/cookie";
import { safeNext } from "@/server/access/gate";
import { clientIp } from "@/server/http/client-ip";
import { accessLimiter } from "@/server/http/rate-limit";
import { trackEvent } from "@/server/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Equal-length digests, so neither the code's length nor a matching prefix leaks through timing. */
function codeMatches(presented: string, code: string): boolean {
  return timingSafeEqual(digest(presented), digest(code)) && presented.length > 0;
}

const MAX_FORM_BYTES = 8 * 1024;

async function readForm(request: Request): Promise<{ code: string; next: string | undefined }> {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_FORM_BYTES)
      return { code: "", next: undefined };
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      return {
        code: typeof body.code === "string" ? body.code : "",
        next: typeof body.next === "string" ? body.next : undefined,
      };
    }
    const form = await request.formData();
    const code = form.get("code");
    const next = form.get("next");
    return { code: typeof code === "string" ? code : "", next: typeof next === "string" ? next : undefined };
  } catch {
    return { code: "", next: undefined };
  }
}

/** Relative `Location`, so the redirect stays on whatever host the browser used. */
function seeOther(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", ...headers },
  });
}

/** Access screen submit (feature 003, contracts/access-api.md). */
export async function POST(request: Request): Promise<Response> {
  const code = accessCode();
  if (!code) return new Response(null, { status: 404 });

  const form = await readForm(request);
  const next = safeNext(form.next?.slice(0, 2048));
  const back = (error: string) => `/access?error=${error}&next=${encodeURIComponent(next)}`;

  if (!accessLimiter.take(clientIp(request))) {
    trackEvent("access_denied", { reason: "rate" });
    return seeOther(back("rate"));
  }
  if (!codeMatches(form.code.trim().slice(0, 200), code)) {
    trackEvent("access_denied", { reason: "code" });
    return seeOther(back("code"));
  }

  const secure =
    request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
  const cookie = [
    `${ACCESS_COOKIE}=${await signAccessCookie(code)}`,
    "Path=/",
    `Max-Age=${ACCESS_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  trackEvent("access_granted", {});
  return seeOther(next, { "Set-Cookie": cookie });
}
