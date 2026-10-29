export const APP_IDS = [
  "terminal",
  "files",
  "editor",
  "settings",
  "about",
  "browser",
  "calculator",
  "calendar",
  "memory",
  "weather",
  "search",
] as const;
export type AppId = (typeof APP_IDS)[number];
export const APP_LABELS: Record<AppId, string> = {
  terminal: "Terminal",
  files: "Files",
  editor: "Text Editor",
  settings: "Settings",
  about: "About Stephan’s OS",
  browser: "Browser",
  calculator: "Calculator",
  calendar: "Calendar",
  memory: "Memory Game",
  weather: "Weather",
  search: "Search",
};
export type Rect = { x: number; y: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type WindowMode = "normal" | "maximized" | "left" | "right";
export type DesktopWindow = {
  id: string;
  app: AppId;
  title: string;
  rect: Rect;
  normalRect?: Rect;
  mode: WindowMode;
  minimized: boolean;
  path?: string;
  url?: string;
};
export type OpenOptions = Partial<
  Pick<DesktopWindow, "title" | "path" | "url">
> & {
  rect?: Partial<Rect>;
  singleton?: boolean;
};
export type WindowUpdate = Partial<
  Pick<DesktopWindow, "title" | "path" | "url">
>;
export type DesktopState = {
  windows: DesktopWindow[];
  activeId: string | null;
};
