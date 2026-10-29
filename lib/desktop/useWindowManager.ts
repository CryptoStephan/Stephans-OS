"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FALLBACK_VIEWPORT } from "./geometry";
import { desktopReducer, EMPTY_DESKTOP, type DesktopAction } from "./reducer";
import { deserializeSession, serializeSession, SESSION_KEY } from "./session";
import type { AppId, OpenOptions, Viewport, WindowUpdate } from "./types";

const currentViewport = (): Viewport =>
  typeof window === "undefined"
    ? FALLBACK_VIEWPORT
    : { width: window.innerWidth, height: window.innerHeight };

export const useWindowManager = () => {
  const [state, dispatch] = useReducer(desktopReducer, EMPTY_DESKTOP);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sequence = useRef(0);

  useEffect(() => {
    try {
      dispatch({
        type: "restore",
        state: deserializeSession(
          localStorage.getItem(SESSION_KEY),
          currentViewport(),
        ),
      });
    } catch {
      /* Storage can be unavailable in a private or restricted browser. */
    }
    setReady(true);
    const onResize = () =>
      dispatch({ type: "viewport", viewport: currentViewport() });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(SESSION_KEY, serializeSession(state));
      } catch {
        /* Keep desktop usable when storage is full. */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(SESSION_KEY, serializeSession(stateRef.current));
      } catch {
        /* Best effort on page exit. */
      }
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  const open = useCallback((app: AppId, options: OpenOptions = {}) => {
    const existing = options.singleton
      ? stateRef.current.windows.find((entry) => entry.app === app)
      : undefined;
    const id =
      existing?.id ??
      `${app}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${++sequence.current}`}`;
    const action: DesktopAction = {
      type: "open",
      id,
      app,
      options,
      viewport: currentViewport(),
    };
    // Consecutive singleton launches in the same React batch return one real ID.
    stateRef.current = desktopReducer(stateRef.current, action);
    dispatch(action);
    return id;
  }, []);
  const focus = useCallback(
    (id: string) => dispatch({ type: "focus", id }),
    [],
  );
  const close = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    [],
  );
  const minimize = useCallback(
    (id: string) => dispatch({ type: "minimize", id }),
    [],
  );
  const maximize = useCallback(
    (id: string) =>
      dispatch({ type: "maximize", id, viewport: currentViewport() }),
    [],
  );
  const snap = useCallback(
    (id: string, side: "left" | "right") =>
      dispatch({ type: "snap", id, side, viewport: currentViewport() }),
    [],
  );
  const move = useCallback(
    (id: string, x: number, y: number) =>
      dispatch({ type: "move", id, x, y, viewport: currentViewport() }),
    [],
  );
  const resize = useCallback(
    (id: string, width: number, height: number, x?: number, y?: number) =>
      dispatch({
        type: "resize",
        id,
        width,
        height,
        x,
        y,
        viewport: currentViewport(),
      }),
    [],
  );
  const update = useCallback(
    (id: string, patch: WindowUpdate) =>
      dispatch({ type: "update", id, patch }),
    [],
  );
  const showDesktop = useCallback(() => dispatch({ type: "showDesktop" }), []);

  return {
    ...state,
    ready,
    open,
    focus,
    close,
    minimize,
    maximize,
    snap,
    move,
    resize,
    update,
    showDesktop,
  };
};
