/**
 * Host → UI message fan-out.
 *
 * The ported components expect the exact same host messages the VS Code
 * extension sent, in the same order. This module is the single place those
 * messages are published, and `useHostMessages` is the single place they are
 * fanned out into the Zustand stores.
 */

import { useEffect, useRef, useState } from "react";
import type { HostToWebviewMessage } from "@/types/hostMessages";

type Listener = (msg: HostToWebviewMessage) => void;

const listeners = new Set<Listener>();

/** Publish a host message to every subscriber, synchronously and in order. */
export function publishHostMessage(msg: HostToWebviewMessage): void {
  for (const listener of [...listeners]) {
    try {
      listener(msg);
    } catch (err) {
      console.error(`[Rachana] Host message listener failed for ${msg.type}:`, err);
    }
  }
}

/** Subscribe to every host message. */
export function subscribeHostMessages(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Subscribe to a subset of host message types.
 *
 * This replaces the original webview's `window.addEventListener("message")`
 * listeners that `Toolbar` and `LiveEditor` installed themselves.
 */
export function useHostMessage(
  types: readonly string[],
  handler: (msg: HostToWebviewMessage) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  // Join so callers can pass a literal array without re-subscribing every render.
  const key = types.join(",");

  useEffect(() => {
    const allowed = new Set(key.split(",").filter(Boolean));
    return subscribeHostMessages((msg) => {
      if (allowed.has(msg.type)) handlerRef.current(msg);
    });
  }, [key]);
}

/** React hook exposing the transient bridge state, kept in sync with messages. */
export function useHostMessageState<T>(initial: T, reducer: (state: T, msg: HostToWebviewMessage) => T): T {
  const [state, setState] = useState<T>(initial);
  const reducerRef = useRef(reducer);
  reducerRef.current = reducer;
  useEffect(() => subscribeHostMessages((msg) => setState((prev) => reducerRef.current(prev, msg))), []);
  return state;
}
