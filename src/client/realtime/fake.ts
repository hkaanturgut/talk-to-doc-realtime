// E2E-only fake transport (enabled when NEXT_PUBLIC_E2E=1). Playwright drives it through
// window.__TEST_REALTIME__ to emit scripted server events and connection state changes.
import type { ConnectFn, ConnectionState, RealtimeConnection } from "./connection";

export interface FakeRealtimeHandle {
  connect: ConnectFn;
  emit(event: Record<string, unknown>): void;
  setState(state: ConnectionState): void;
  sent: Record<string, unknown>[];
  connects: number;
  failNext?: boolean;
}

declare global {
  interface Window {
    __TEST_REALTIME__?: FakeRealtimeHandle;
  }
}

export function installFakeRealtime(): FakeRealtimeHandle {
  if (window.__TEST_REALTIME__) return window.__TEST_REALTIME__;
  let current: { events: Set<(d: string) => void>; states: Set<(s: ConnectionState) => void> } | undefined;
  const handle: FakeRealtimeHandle = {
    sent: [],
    connects: 0,
    emit(event) {
      for (const cb of current?.events ?? []) cb(JSON.stringify(event));
    },
    setState(state) {
      for (const cb of current?.states ?? []) cb(state);
    },
    connect: async () => {
      handle.connects += 1;
      if (handle.failNext) {
        handle.failNext = false;
        throw new Error("fake connect failure");
      }
      const conn = {
        events: new Set<(d: string) => void>(),
        states: new Set<(s: ConnectionState) => void>(),
      };
      current = conn;
      const api: RealtimeConnection = {
        send: (e) => void handle.sent.push(e),
        onEvent: (cb) => {
          conn.events.add(cb);
          return () => conn.events.delete(cb);
        },
        onStateChange: (cb) => {
          conn.states.add(cb);
          setTimeout(() => cb("open"), 50);
          return () => conn.states.delete(cb);
        },
        replaceMicTrack: async () => undefined,
        close: () => {
          if (current === conn) current = undefined;
        },
      };
      return api;
    },
  };
  window.__TEST_REALTIME__ = handle;
  return handle;
}
