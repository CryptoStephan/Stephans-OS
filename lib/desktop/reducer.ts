/**
 * Immutable process updates adapted from daedalOS contexts/process/functions.ts.
 * Copyright (c) 2025 Dustin Brett. MIT; see LICENSE.daedalOS and PROVENANCE.md.
 */
import { cascadePosition, clampRect, minMaxSize, modeRect } from "./geometry";
import {
  APP_LABELS,
  type AppId,
  type DesktopState,
  type DesktopWindow,
  type OpenOptions,
  type Viewport,
  type WindowUpdate,
} from "./types";

export const EMPTY_DESKTOP: DesktopState = { windows: [], activeId: null };
export type DesktopAction =
  | { type: "restore"; state: DesktopState }
  | {
      type: "open";
      id: string;
      app: AppId;
      options?: OpenOptions;
      viewport: Viewport;
    }
  | { type: "focus" | "close" | "minimize"; id: string }
  | { type: "maximize"; id: string; viewport: Viewport }
  | { type: "snap"; id: string; side: "left" | "right"; viewport: Viewport }
  | { type: "move"; id: string; x: number; y: number; viewport: Viewport }
  | {
      type: "resize";
      id: string;
      width: number;
      height: number;
      x?: number;
      y?: number;
      viewport: Viewport;
    }
  | { type: "update"; id: string; patch: WindowUpdate }
  | { type: "viewport"; viewport: Viewport }
  | { type: "showDesktop" };

// Same immutable patch strategy as daedalOS setProcessSettings, with ordered windows.
const setWindowSettings = (
  state: DesktopState,
  id: string,
  patch: Partial<DesktopWindow>,
): DesktopState => ({
  ...state,
  windows: state.windows.map((entry) =>
    entry.id === id ? { ...entry, ...patch } : entry,
  ),
});

const nextFocusableId = (windows: DesktopWindow[]): string | null =>
  [...windows].reverse().find((entry) => !entry.minimized)?.id ?? null;

const focusWindow = (state: DesktopState, id: string): DesktopState => {
  const selected = state.windows.find((entry) => entry.id === id);
  if (!selected) return state;
  return {
    activeId: id,
    windows: [
      ...state.windows.filter((entry) => entry.id !== id),
      { ...selected, minimized: false },
    ],
  };
};

export const desktopReducer = (
  state: DesktopState,
  action: DesktopAction,
): DesktopState => {
  if (action.type === "restore") return action.state;
  if (action.type === "showDesktop")
    return {
      activeId: null,
      windows: state.windows.map((entry) => ({ ...entry, minimized: true })),
    };
  if (action.type === "viewport")
    return {
      ...state,
      windows: state.windows.map((entry) => ({
        ...entry,
        rect:
          entry.mode === "normal"
            ? clampRect(entry.rect, action.viewport)
            : modeRect(entry.mode, action.viewport),
        normalRect: entry.normalRect
          ? clampRect(entry.normalRect, action.viewport)
          : undefined,
      })),
    };
  if (action.type === "open") {
    const options = action.options ?? {};
    const existing = options.singleton
      ? state.windows.find((entry) => entry.app === action.app)
      : undefined;
    if (existing) {
      const patch: WindowUpdate = {};
      if (options.title !== undefined) patch.title = options.title;
      if (options.path !== undefined) patch.path = options.path;
      if (options.url !== undefined) patch.url = options.url;
      return focusWindow(
        setWindowSettings(state, existing.id, patch),
        existing.id,
      );
    }
    if (state.windows.some((entry) => entry.id === action.id))
      return focusWindow(state, action.id);
    const compact = action.app === "calculator" || action.app === "calendar";
    const size = minMaxSize(
      {
        width: compact ? 400 : 820,
        height: compact ? 520 : 560,
        ...options.rect,
      },
      action.viewport,
    );
    const position = cascadePosition(state.windows, size, action.viewport);
    const entry: DesktopWindow = {
      id: action.id,
      app: action.app,
      title: options.title || APP_LABELS[action.app],
      rect: clampRect(
        { ...position, ...size, ...options.rect },
        action.viewport,
      ),
      mode: "normal",
      normalRect: undefined,
      minimized: false,
      path: options.path,
      url: options.url,
    };
    return { activeId: entry.id, windows: [...state.windows, entry] };
  }
  const selected = state.windows.find((entry) => entry.id === action.id);
  if (!selected) return state;
  switch (action.type) {
    case "focus":
      return focusWindow(state, action.id);
    case "close": {
      const windows = state.windows.filter((entry) => entry.id !== action.id);
      return {
        windows,
        activeId:
          state.activeId === action.id
            ? nextFocusableId(windows)
            : state.activeId,
      };
    }
    case "minimize": {
      const next = setWindowSettings(state, action.id, { minimized: true });
      return {
        ...next,
        activeId:
          state.activeId === action.id
            ? nextFocusableId(next.windows)
            : state.activeId,
      };
    }
    case "maximize": {
      const restore = selected.mode === "maximized";
      return focusWindow(
        setWindowSettings(state, action.id, {
          mode: restore ? "normal" : "maximized",
          rect: restore
            ? clampRect(selected.normalRect ?? selected.rect, action.viewport)
            : modeRect("maximized", action.viewport),
          normalRect: restore
            ? undefined
            : (selected.normalRect ?? selected.rect),
        }),
        action.id,
      );
    }
    case "snap":
      return focusWindow(
        setWindowSettings(state, action.id, {
          mode: action.side,
          normalRect: selected.normalRect ?? selected.rect,
          rect: modeRect(action.side, action.viewport),
        }),
        action.id,
      );
    case "move":
      return setWindowSettings(state, action.id, {
        mode: "normal",
        normalRect: undefined,
        rect: clampRect(
          {
            ...(selected.normalRect ?? selected.rect),
            x: action.x,
            y: action.y,
          },
          action.viewport,
        ),
      });
    case "resize":
      return setWindowSettings(state, action.id, {
        mode: "normal",
        normalRect: undefined,
        rect: clampRect(
          {
            x: action.x ?? selected.rect.x,
            y: action.y ?? selected.rect.y,
            width: action.width,
            height: action.height,
          },
          action.viewport,
        ),
      });
    case "update":
      return setWindowSettings(state, action.id, action.patch);
  }
};
