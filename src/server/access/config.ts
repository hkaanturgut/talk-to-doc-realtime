/**
 * The configured access code, or undefined when the gate is off. Read straight from the environment
 * (not `getEnv()`) so proxy.ts has no dependency on unrelated settings; env.ts still validates it.
 */
export function accessCode(env: Record<string, string | undefined> = process.env): string | undefined {
  const code = env.ACCESS_CODE?.trim();
  return code ? code : undefined;
}
