import type { ErrorCode } from "@/shared/errors";

export interface MediaEnv {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasPeerConnection: boolean;
}

export function currentMediaEnv(): MediaEnv {
  return {
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    hasPeerConnection: typeof RTCPeerConnection !== "undefined",
  };
}

/** Checks that apply before asking for the mic. Returns null when voice can be attempted. */
export function preflightVoice(env: MediaEnv): ErrorCode | null {
  if (!env.hasPeerConnection) return "WEBRTC_UNSUPPORTED";
  if (!env.isSecureContext || !env.hasMediaDevices) return "MIC_UNAVAILABLE";
  return null;
}

/** Maps a getUserMedia rejection to an error code (US3). */
export function mapMediaError(err: unknown): ErrorCode {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "MIC_DENIED";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "NotReadableError":
    case "AbortError":
    case "TypeError":
    default:
      return "MIC_UNAVAILABLE";
  }
}

/** Codes after which the app switches to text chat automatically. */
export const FALLBACK_TO_TEXT: ReadonlySet<ErrorCode> = new Set(["MIC_DENIED", "MIC_UNAVAILABLE"]);
