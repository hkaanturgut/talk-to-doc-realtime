import { MAX_PDF_BYTES } from "@/shared/messages";
import { verifyAccessCookie } from "./cookie";

export interface GateInput {
  method: string;
  pathname: string;
  search: string;
  host: string | null;
  origin: string | null;
  fetchSite: string | null;
  /** Declared request body size (Content-Length header), if any. */
  contentLength?: string | null;
  cookie: string | undefined;
  /** Configured access code; undefined turns the access gate off (FR-013). */
  code: string | undefined;
}

export type GateDecision =
  | { action: "pass" }
  | { action: "forbidden" }
  | { action: "too_large"; code: "PDF_TOO_LARGE" | "INVALID_REQUEST" }
  | { action: "unauthorized" }
  | { action: "redirect"; location: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PUBLIC_EXACT = new Set(["/access", "/api/access", "/api/health", "/robots.txt", "/favicon.ico"]);

const isRelay = (pathname: string) => pathname.startsWith("/api/relay/");
const isPublic = (pathname: string) => PUBLIC_EXACT.has(pathname) || isRelay(pathname);

const PDF_PATH = "/api/ingest/pdf";
/** next.config.ts raises the proxy body buffer for PDFs; every other API body stays far smaller. */
export const MAX_PDF_REQUEST_BYTES = MAX_PDF_BYTES + 64 * 1024;
export const MAX_API_REQUEST_BYTES = 2 * 1024 * 1024;

/** True when a browser tells us the request came from another site (research R7). */
function isCrossSite(input: GateInput): boolean {
  if (input.fetchSite === "cross-site") return true;
  if (input.origin === null) return false; // non-browser client or same-origin GET
  try {
    return new URL(input.origin).host !== input.host;
  } catch {
    return true; // "null" (sandboxed or privacy-redirected) and malformed origins
  }
}

/** Same-site path to return to after the access screen; anything else becomes "/". */
export function safeNext(next: string | null | undefined): string {
  // Browsers drop tabs and newlines in URLs, so "/\t/evil" would become "//evil": reject control
  // characters and backslashes anywhere.
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(next))
    return "/";
  if (next.startsWith("/access") || next.startsWith("/api/")) return "/";
  return next;
}

/** Pure decision for src/proxy.ts: origin check first, then the access gate. */
export async function decide(input: GateInput): Promise<GateDecision> {
  const { pathname } = input;
  // Refuse oversized declared bodies before Next buffers them (only the PDF route needs 25 MB).
  const declared = Number(input.contentLength ?? 0);
  if (!SAFE_METHODS.has(input.method) && pathname.startsWith("/api/")) {
    const isPdf = pathname === PDF_PATH;
    if (declared > (isPdf ? MAX_PDF_REQUEST_BYTES : MAX_API_REQUEST_BYTES)) {
      return { action: "too_large", code: isPdf ? "PDF_TOO_LARGE" : "INVALID_REQUEST" };
    }
  }

  if (
    !SAFE_METHODS.has(input.method) &&
    pathname.startsWith("/api/") &&
    !isRelay(pathname) &&
    isCrossSite(input)
  ) {
    return { action: "forbidden" };
  }

  if (!input.code || isPublic(pathname)) return { action: "pass" };
  if (await verifyAccessCookie(input.cookie, input.code)) return { action: "pass" };

  if (pathname.startsWith("/api/")) return { action: "unauthorized" };
  const next = safeNext(pathname + input.search);
  return { action: "redirect", location: `/access?next=${encodeURIComponent(next)}` };
}
