import { clampRect, modeRect } from "./geometry";
import {
  APP_IDS,
  APP_LABELS,
  type AppId,
  type DesktopState,
  type DesktopWindow,
  type Rect,
  type Viewport,
  type WindowMode,
} from "./types";

export const SESSION_KEY = "stephans-os:desktop:v2";
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isRect = (value: unknown): value is Rect =>
  isObject(value) &&
  ["x", "y", "width", "height"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
  ) &&
  Number(value.width) > 0 &&
  Number(value.height) > 0;

/** Session files are user-editable: accept only known apps and bounded plain data. */
export const deserializeSession = (
  json: string | null,
  viewport: Viewport,
): DesktopState => {
  const empty: DesktopState = { windows: [], activeId: null };
  if (!json || json.length > 200_000) return empty;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      !isObject(parsed) ||
      parsed.version !== 2 ||
      !Array.isArray(parsed.windows)
    )
      return empty;
    const seen = new Set<string>();
    const windows: DesktopWindow[] = [];
    for (const item of parsed.windows.slice(0, 32)) {
      if (
        !isObject(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        item.id.length > 150 ||
        seen.has(item.id) ||
        !APP_IDS.includes(item.app as AppId) ||
        !isRect(item.rect)
      )
        continue;
      seen.add(item.id);
      const app = item.app as AppId;
      const mode: WindowMode = ["maximized", "left", "right"].includes(
        String(item.mode),
      )
        ? (item.mode as WindowMode)
        : "normal";
      windows.push({
        id: item.id,
        app,
        title:
          typeof item.title === "string"
            ? item.title.slice(0, 300)
            : APP_LABELS[app],
        rect:
          mode === "normal"
            ? clampRect(item.rect, viewport)
            : modeRect(mode, viewport),
        normalRect: isRect(item.normalRect)
          ? clampRect(item.normalRect, viewport)
          : undefined,
        mode,
        minimized: item.minimized === true,
        path:
          typeof item.path === "string" ? item.path.slice(0, 4096) : undefined,
        url: typeof item.url === "string" ? item.url.slice(0, 8192) : undefined,
      });
    }
    const activeId =
      windows.find((entry) => entry.id === parsed.activeId && !entry.minimized)
        ?.id ??
      [...windows].reverse().find((entry) => !entry.minimized)?.id ??
      null;
    return { windows, activeId };
  } catch {
    return empty;
  }
};

export const serializeSession = (state: DesktopState): string =>
  JSON.stringify({ version: 2, ...state });
