export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", version: process.env.GIT_SHA ?? "dev" });
}
