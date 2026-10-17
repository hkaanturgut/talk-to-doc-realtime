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

  // Browser events: release the mic on pagehide (iOS keeps the indicator otherwise), reconnect on
  // network changes, pause after a long background period, and swap the mic on device changes.
  useEffect(() => {
    if (!controller) return;
    const onHide = () => controller.stop();
    const onOffline = () => controller.onOffline();
    const onOnline = () => controller.onOnline();
    const onVisibility = () => controller.onVisibilityChange(document.visibilityState === "hidden");
    const onDevice = () => controller.onDeviceChange();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDevice);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDevice);
    };
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
