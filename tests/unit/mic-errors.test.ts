import { describe, expect, it } from "vitest";
import { FALLBACK_TO_TEXT, mapMediaError, preflightVoice } from "@/client/realtime/mic-errors";

const ok = { isSecureContext: true, hasMediaDevices: true, hasPeerConnection: true };

describe("mapMediaError", () => {
  it.each([
    ["NotAllowedError", "MIC_DENIED"],
    ["SecurityError", "MIC_DENIED"],
    ["NotFoundError", "MIC_UNAVAILABLE"],
    ["NotReadableError", "MIC_UNAVAILABLE"],
    ["OverconstrainedError", "MIC_UNAVAILABLE"],
    ["Whatever", "MIC_UNAVAILABLE"],
  ])("%s → %s", (name, code) => {
    expect(mapMediaError(new DOMException("x", name))).toBe(code);
  });
});

describe("preflightVoice", () => {
  it("allows voice in a capable secure context", () => expect(preflightVoice(ok)).toBeNull());
  it("flags missing RTCPeerConnection", () =>
    expect(preflightVoice({ ...ok, hasPeerConnection: false })).toBe("WEBRTC_UNSUPPORTED"));
  it("flags insecure contexts and missing mediaDevices", () => {
    expect(preflightVoice({ ...ok, isSecureContext: false })).toBe("MIC_UNAVAILABLE");
    expect(preflightVoice({ ...ok, hasMediaDevices: false })).toBe("MIC_UNAVAILABLE");
  });
  it("falls back to text for mic problems but not for missing WebRTC", () => {
    expect(FALLBACK_TO_TEXT.has("MIC_DENIED")).toBe(true);
    expect(FALLBACK_TO_TEXT.has("MIC_UNAVAILABLE")).toBe(true);
    expect(FALLBACK_TO_TEXT.has("WEBRTC_UNSUPPORTED")).toBe(false);
  });
});
