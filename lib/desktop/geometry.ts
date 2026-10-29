/**
 * Adapted from daedalOS components/system/Window/functions.ts.
 * Copyright (c) 2025 Dustin Brett. MIT; see LICENSE.daedalOS and PROVENANCE.md.
 * Uses explicit viewport arguments so geometry is deterministic and testable.
 */
import type { DesktopWindow, Rect, Viewport, WindowMode } from "./types";

export const TASKBAR_HEIGHT = 52;
export const MIN_WINDOW_WIDTH = 320;
export const MIN_WINDOW_HEIGHT = 220;
export const FALLBACK_VIEWPORT: Viewport = { width: 1280, height: 800 };

export const workArea = (viewport: Viewport): Viewport => ({
  width: Math.max(1, viewport.width),
  height: Math.max(1, viewport.height - TASKBAR_HEIGHT),
});

// daedalOS minMaxSize, adapted to fit small/mobile viewports too.
export const minMaxSize = (
  size: Pick<Rect, "width" | "height">,
  viewport: Viewport,
) => {
  const area = workArea(viewport);
  return {
    width: Math.min(area.width, Math.max(MIN_WINDOW_WIDTH, size.width)),
    height: Math.min(area.height, Math.max(MIN_WINDOW_HEIGHT, size.height)),
  };
};

export const centerPosition = (
  size: Pick<Rect, "width" | "height">,
  viewport: Viewport,
) => {
  const area = workArea(viewport);
  return {
    x: Math.floor((area.width - size.width) / 2),
    y: Math.floor((area.height - size.height) / 2),
  };
};

export const clampRect = (rect: Rect, viewport: Viewport): Rect => {
  const area = workArea(viewport);
  const size = minMaxSize(rect, viewport);
  return {
    ...size,
    x: Math.max(0, Math.min(rect.x, area.width - size.width)),
    y: Math.max(0, Math.min(rect.y, area.height - size.height)),
  };
};

// daedalOS cascadePosition checks the visible work area before cascading.
export const cascadePosition = (
  windows: DesktopWindow[],
  size: Pick<Rect, "width" | "height">,
  viewport: Viewport,
  offset = 28,
) => {
  const previous = [...windows]
    .reverse()
    .find((entry) => !entry.minimized && entry.mode === "normal");
  const area = workArea(viewport);
  if (previous) {
    const x = previous.rect.x + offset;
    const y = previous.rect.y + offset;
    if (x + size.width <= area.width && y + size.height <= area.height)
      return { x, y };
  }
  return centerPosition(size, viewport);
};

export const modeRect = (
  mode: Exclude<WindowMode, "normal">,
  viewport: Viewport,
): Rect => {
  const area = workArea(viewport);
  if (mode === "maximized") return { x: 0, y: 0, ...area };
  const leftWidth = Math.floor(area.width / 2);
  return {
    x: mode === "right" ? leftWidth : 0,
    y: 0,
    width: mode === "right" ? area.width - leftWidth : leftWidth,
    height: area.height,
  };
};
