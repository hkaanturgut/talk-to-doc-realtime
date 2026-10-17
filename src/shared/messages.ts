import type { ErrorCode } from "./errors";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 400_000;

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** User-facing message for every error code (spec FR-007, SC-007). */
export const MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: "The request could not be read. Please try again.",
  PDF_MISSING: "Choose a PDF file first.",
  PDF_TOO_LARGE: "This PDF is larger than the 25 MB limit. Try a smaller file.",
  PDF_NOT_PDF: "This file is not a valid PDF.",
  PDF_PASSWORD_PROTECTED: "This PDF is password-protected. Upload an unprotected copy.",
  PDF_NO_TEXT:
    "No text was found in this PDF. It looks scanned or image-only, and scanned documents are not supported yet.",
  PDF_INVALID: "This PDF could not be read. It may be damaged.",
  PDF_TIMEOUT: "This PDF took too long to process. Try a smaller or simpler file.",
  YOUTUBE_INVALID_URL:
    "That doesn't look like a YouTube link. Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  YOUTUBE_NO_CAPTIONS:
    "This video has no captions (live streams and premieres usually don't). Paste a transcript instead.",
  YOUTUBE_UNAVAILABLE: "This video is not available. It may be private or removed.",
  YOUTUBE_BLOCKED: "Captions could not be fetched from here. Paste the transcript instead.",
  TEXT_EMPTY: "Paste some text first.",
  TEXT_TOO_LARGE: "This text is longer than the 400,000 character limit.",
  DOCUMENT_NOT_FOUND: "This document has expired. Load it again to continue.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  REALTIME_UNAVAILABLE: "The voice service is busy. Try again in a moment.",
  REALTIME_AUTH: "Something went wrong on our side. Please try again later.",
  INTERNAL: "Something went wrong on our side. Please try again.",
  MIC_DENIED:
    "Microphone access was denied, so we switched to text chat. To use voice, allow the microphone for this site (iPhone: Settings → Apps → Safari → Microphone; Android: tap the lock icon → Permissions → Microphone), then reload.",
  MIC_UNAVAILABLE: "No microphone is available, so we switched to text chat.",
  WEBRTC_UNSUPPORTED:
    "This browser doesn't support live chat (WebRTC). Try a recent Safari, Chrome, Edge or Firefox.",
  TOKEN_EXPIRED: "Session credential expired, retrying.",
  MIC_LOST: "Microphone changed. Reconnecting audio…",
  CONNECTION_LOST: "Connection lost. Tap Reconnect to continue.",
  SESSION_CAP: "This session reached its 15-minute limit. Start a new session to keep talking.",
};

export function messageFor(code: ErrorCode): string {
  return MESSAGES[code];
}
