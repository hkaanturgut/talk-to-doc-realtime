import "server-only";
import { AppError } from "@/shared/errors";
import { accessCode } from "./config";
import { ACCESS_COOKIE, verifyAccessCookie } from "./cookie";

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * Second check inside routes that spend money (session, ingest): proxy.ts is the main gate, but
 * Next.js advises not to rely on the proxy alone for authorization.
 */
export async function requireAccess(request: Request): Promise<void> {
  const code = accessCode();
  if (!code) return;
  if (!(await verifyAccessCookie(readCookie(request, ACCESS_COOKIE), code)))
    throw new AppError("UNAUTHORIZED");
}
