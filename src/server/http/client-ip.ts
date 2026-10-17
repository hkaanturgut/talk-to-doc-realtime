import "server-only";

/**
 * Client IP for rate limiting. The ACA ingress appends the real peer address as the LAST
 * x-forwarded-for entry; earlier entries are client-controlled and can be spoofed.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    if (last) return last;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
