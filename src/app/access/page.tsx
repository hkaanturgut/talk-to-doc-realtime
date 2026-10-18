import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { accessCode } from "@/server/access/config";
import { safeNext } from "@/server/access/gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access · Talk to a Doc", robots: { index: false } };

const ERRORS: Record<string, string> = {
  code: "That code is not right. Check the email and try again.",
  rate: "Too many attempts. Wait a minute and try again.",
};

/** Access screen (feature 003). A plain form, so it works before any JavaScript loads. */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(one(params.next));
  if (!accessCode()) redirect(next);
  const error = ERRORS[one(params.error) ?? ""];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Talk to a Doc</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This demo is shared privately. Enter the access code from the invitation email.
        </p>
      </header>

      <form method="post" action="/api/access" className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="access-code" className="text-sm font-medium">
          Access code
        </label>
        <input
          id="access-code"
          name="code"
          type="password"
          required
          maxLength={200}
          autoComplete="current-password"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "access-error" : undefined}
          className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {error && (
          <p id="access-error" role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white"
        >
          Continue
        </button>
      </form>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        You stay signed in on this device for 7 days.
      </p>
    </main>
  );
}
