"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fetchSession } from "@/client/api";
import { connect, type ConnectFn } from "@/client/realtime/connection";
import { SessionController } from "@/client/realtime/controller";
import { installFakeRealtime } from "@/client/realtime/fake";
import { initialState } from "@/client/realtime/reducer";
import type { SessionMode } from "@/shared/schemas";

function pickConnect(): ConnectFn {
  if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined")
    return installFakeRealtime().connect;
  return connect;
}

const serverSnapshot = initialState();

export function useVoiceSession(
  doc: { documentId: string; title: string } | null,
  initialMode: SessionMode = "voice",
) {
  // Plain holder (not a React ref) so the controller can read the element lazily.
  const [audio] = useState(() => new AudioElementHolder());
  const audioRef = useCallback((el: HTMLAudioElement | null) => audio.set(el), [audio]);

  const controller = useMemo(() => {
    if (!doc) return null;
    return new SessionController({
      documentId: doc.documentId,
      title: doc.title,
      fetchSession,
      connect: pickConnect(),
      getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
      audioEl: () => audio.el,
      initialMode,
    });
    // initialMode only seeds a new controller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.documentId]);

  useEffect(() => () => controller?.dispose(), [controller]);

  // Release the microphone when the page goes away (iOS keeps the mic indicator otherwise).
  useEffect(() => {
    if (!controller) return;
    const onHide = () => controller.stop();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [controller]);

  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getState ?? (() => serverSnapshot),
    () => serverSnapshot,
  );

  const start = useCallback(() => {
    // Unlock audio playback inside the tap (iOS autoplay policy); the remote stream attaches later.
    audio.el?.play().catch(() => undefined);
    void controller?.start();
  }, [controller, audio]);

  return {
    state,
    audioRef,
    controller,
    start,
    stop: useCallback(() => controller?.stop(), [controller]),
    toggleMute: useCallback(() => controller?.toggleMute(), [controller]),
    sendText: useCallback((text: string) => controller?.sendText(text) ?? false, [controller]),
    setMode: useCallback(async (mode: SessionMode) => controller?.setMode(mode), [controller]),
    endForCap: useCallback(() => controller?.endForCap(), [controller]),
  };
}

const noopSubscribe = () => () => undefined;

/** Holds the <audio> element outside React state so the controller can read it lazily. */
class AudioElementHolder {
  el: HTMLAudioElement | null = null;
  set(el: HTMLAudioElement | null): void {
    this.el = el;
  }
}
