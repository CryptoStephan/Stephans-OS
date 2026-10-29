"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Terminal,
  FolderOpen,
  FileText,
  Settings2,
  Globe2,
  UserRound,
  Calculator,
  CalendarDays,
  Gamepad2,
  CloudSun,
  Search,
  Minus,
  Square,
  X,
  PanelLeft,
  PanelRight,
  ArrowUpRight,
  LayoutGrid,
  Monitor,
  Wifi,
} from "lucide-react";
import {
  APP_LABELS,
  useWindowManager,
  type AppId,
  type DesktopWindow,
} from "@/lib/desktop";
import { lotw, HOME } from "@/lib/lotw/client";
import { AppContent } from "./apps";
import { UtilityApp } from "./UtilityApps";
import { DesktopFiles } from "./DesktopFiles";

export const APP_ICONS: Record<string, typeof Terminal> = {
  terminal: Terminal,
  files: FolderOpen,
  editor: FileText,
  settings: Settings2,
  about: UserRound,
  browser: Globe2,
  calculator: Calculator,
  calendar: CalendarDays,
  memory: Gamepad2,
  weather: CloudSun,
  search: Search,
};
const DESKTOP_APPS: AppId[] = [
  "files",
  "terminal",
  "editor",
  "browser",
  "about",
];
const ALL_APPS: AppId[] = [
  "files",
  "terminal",
  "editor",
  "browser",
  "calendar",
  "calculator",
  "memory",
  "weather",
  "search",
  "settings",
  "about",
];
type Manager = ReturnType<typeof useWindowManager>;

function DesktopShortcut({
  app,
  onOpen,
}: {
  app: AppId;
  onOpen: (app: AppId, path?: string) => void;
}) {
  const Icon = APP_ICONS[app];
  const activate = () => onOpen(app, app === "files" ? HOME : undefined);
  return (
    <button
      className="os-desktop-icon"
      onDoubleClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter") activate();
      }}
      title={`Open ${APP_LABELS[app]}`}
    >
      <span className={`os-app-icon ${app}`}>
        <Icon size={29} strokeWidth={1.6} />
      </span>
      <span>{APP_LABELS[app]}</span>
    </button>
  );
}

function Frame({
  item,
  manager,
  index,
  children,
}: {
  item: DesktopWindow;
  manager: Manager;
  index: number;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [snapPreview, setSnapPreview] = useState<
    "left" | "right" | "maximized" | null
  >(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const Icon = APP_ICONS[item.app] || Monitor;
  const close = () => {
    const event = new CustomEvent("stephos:beforeclose", {
      detail: { id: item.id },
      cancelable: true,
    });
    if (document.dispatchEvent(event)) manager.close(item.id);
  };
  const interact = (event: PointerEvent, edge?: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    if (edge && item.mode !== "normal") return;
    event.preventDefault();
    manager.focus(item.id);
    const start = { ...(item.normalRect || item.rect) };
    if (item.mode !== "normal") {
      start.x =
        event.clientX -
        Math.min(
          start.width - 30,
          Math.max(
            30,
            ((event.clientX - item.rect.x) / item.rect.width) * start.width,
          ),
        );
      start.y = Math.max(0, event.clientY - 20);
      manager.move(item.id, start.x, start.y);
    }
    const startX = event.clientX,
      startY = event.clientY;
    setDragging(true);
    document.body.classList.add("os-dragging");
    let snap: typeof snapPreview = null;
    const move = (e: globalThis.PointerEvent) => {
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      if (edge) {
        const minW = Math.min(360, window.innerWidth),
          minH = Math.min(240, window.innerHeight - 52);
        const width = Math.max(
          minW,
          start.width +
            (edge.includes("w") ? -dx : edge.includes("e") ? dx : 0),
        );
        const height = Math.max(
          minH,
          start.height +
            (edge.includes("n") ? -dy : edge.includes("s") ? dy : 0),
        );
        manager.resize(
          item.id,
          width,
          height,
          edge.includes("w") ? start.x + start.width - width : start.x,
          edge.includes("n") ? start.y + start.height - height : start.y,
        );
      } else {
        manager.move(item.id, start.x + dx, start.y + dy);
        snap =
          e.clientY < 12
            ? "maximized"
            : e.clientX < 16
              ? "left"
              : e.clientX > window.innerWidth - 16
                ? "right"
                : null;
        setSnapPreview(snap);
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDragging(false);
      setSnapPreview(null);
      document.body.classList.remove("os-dragging");
      cleanup.current = null;
      if (snap === "maximized") manager.maximize(item.id);
      else if (snap) manager.snap(item.id, snap);
    };
    cleanup.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  return (
    <>
      {snapPreview && <div className={`os-snap-preview ${snapPreview}`} />}
      <section
        aria-label={`${item.title} window`}
        className={`os-window ${manager.activeId === item.id ? "active" : ""} ${dragging ? "moving" : ""} ${item.mode !== "normal" ? "snapped" : ""}`}
        style={{
          left: item.rect.x,
          top: item.rect.y,
          width: item.rect.width,
          height: item.rect.height,
          zIndex: 20 + index,
          display: item.minimized ? "none" : undefined,
        }}
        onPointerDownCapture={() =>
          manager.activeId !== item.id && manager.focus(item.id)
        }
      >
        <header
          className="os-titlebar"
          onPointerDown={(e) => interact(e)}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest("button"))
              manager.maximize(item.id);
          }}
        >
          <span className={`os-title-icon ${item.app}`}>
            <Icon size={15} />
          </span>
          <span className="os-window-title">{item.title}</span>
          <div className="os-window-actions">
            <button
              aria-label={`Snap ${item.title} left`}
              title="Snap left"
              onClick={() => manager.snap(item.id, "left")}
            >
              <PanelLeft size={13} />
            </button>
            <button
              aria-label={`Snap ${item.title} right`}
              title="Snap right"
              onClick={() => manager.snap(item.id, "right")}
            >
              <PanelRight size={13} />
            </button>
            <button
              aria-label={`Minimize ${item.title}`}
              title="Minimize"
              onClick={() => manager.minimize(item.id)}
            >
              <Minus size={15} />
            </button>
            <button
              aria-label={`Maximize ${item.title}`}
              title="Maximize / restore"
              onClick={() => manager.maximize(item.id)}
            >
              <Square size={12} />
            </button>
            <button
              className="os-close"
              aria-label={`Close ${item.title}`}
              title="Close"
              onClick={close}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="os-window-content">{children}</div>
        {item.mode === "normal" &&
          ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((edge) => (
            <div
              key={edge}
              className={`os-resize os-resize-${edge}`}
              onPointerDown={(e) => interact(e, edge)}
            />
          ))}
      </section>
    </>
  );
}

export default function Desktop() {
  const manager = useWindowManager();
  const [launcher, setLauncher] = useState(false);
  const [query, setQuery] = useState("");
  const [time, setTime] = useState<Date | null>(null);
  const [status, setStatus] = useState("Starting your workspace…");
  const [bootError, setBootError] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [wallpaper, setWallpaper] = useState("dusk");
  const [online, setOnline] = useState(true);
  const booted = useRef(false);
  const open = useCallback(
    (app: AppId, path?: string) => {
      manager.open(app, {
        path,
        singleton: [
          "settings",
          "about",
          "weather",
          "calendar",
          "memory",
          "calculator",
        ].includes(app),
      });
      setLauncher(false);
      setQuery("");
      setMenu(null);
    },
    [manager.open],
  );
  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    try {
      setWallpaper(localStorage.getItem("stephos.wallpaper") || "dusk");
    } catch {}
    const network = () => setOnline(navigator.onLine);
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    lotw
      .ready()
      .then(() => setStatus("Workspace ready"))
      .catch((e) => {
        setBootError(String(e.message || e));
        setStatus("Storage unavailable");
      });
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    if (!manager.ready || booted.current) return;
    booted.current = true;
    if (!manager.windows.length)
      manager.open("files", {
        path: HOME,
        rect: {
          x: Math.min(160, window.innerWidth * 0.1),
          y: 72,
          width: 800,
          height: 530,
        },
      });
  }, [manager.ready, manager.windows.length, manager.open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        open("terminal");
      }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        open("files", HOME);
      }
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        setLauncher((v) => !v);
      }
      if (e.key === "Escape") {
        setLauncher(false);
        setMenu(null);
      }
      if (e.altKey && e.key === "F4" && manager.activeId) {
        e.preventDefault();
        const ev = new CustomEvent("stephos:beforeclose", {
          detail: { id: manager.activeId },
          cancelable: true,
        });
        if (document.dispatchEvent(ev)) manager.close(manager.activeId);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, manager.activeId, manager.close]);
  const changeWallpaper = (name: string) => {
    setWallpaper(name);
    try {
      localStorage.setItem("stephos.wallpaper", name);
    } catch {}
  };
  return (
    <main
      className={`os-desktop wallpaper-${wallpaper}`}
      onContextMenu={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).closest(
            ".os-desktop-icons,.os-desktop-brand",
          )
        ) {
          e.preventDefault();
          setMenu({
            x: Math.min(e.clientX, window.innerWidth - 235),
            y: Math.min(e.clientY, window.innerHeight - 285),
          });
        }
      }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest(".os-launcher,.os-start-button"))
          setLauncher(false);
        if (!(e.target as HTMLElement).closest(".os-context-menu"))
          setMenu(null);
      }}
    >
      <div className="os-wallpaper-shape one" />
      <div className="os-wallpaper-shape two" />
      <div className="os-wallpaper-shape three" />
      <div className="os-desktop-topline">
        <span>
          <span className="os-brand-mark">s.</span> stephan’s os{" "}
          <span className="os-version">02</span>
        </span>
        <span>
          {time?.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>
      <nav className="os-desktop-icons" aria-label="Desktop shortcuts">
        {DESKTOP_APPS.map((app) => (
          <DesktopShortcut key={app} app={app} onOpen={open} />
        ))}
      </nav>
      <DesktopFiles onOpen={open} />
      <div className="os-desktop-brand">
        <span>YOUR VERY OWN CORNER OF THE INTERNET</span>
        <h1>
          Make yourself
          <br />
          at home<span>.</span>
        </h1>
        <p>A space to explore, create, and leave things open.</p>
        <button onClick={() => open("about")}>
          A little about this place <ArrowUpRight size={14} />
        </button>
      </div>
      {bootError && (
        <div className="os-boot-error" role="alert">
          <strong>Your files could not be opened.</strong>
          <p>{bootError}</p>
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      )}
      {manager.windows.map((item, index) => (
        <Frame key={item.id} item={item} index={index} manager={manager}>
          {["terminal", "files", "editor"].includes(item.app) ? (
            <AppContent
              app={item.app}
              path={item.path}
              windowId={item.id}
              onOpen={(app, path) => open(app as AppId, path)}
              onPathChange={(path) => manager.update(item.id, { path })}
            />
          ) : (
            <UtilityApp
              app={item.app}
              wallpaper={wallpaper}
              onWallpaper={changeWallpaper}
              onOpen={open}
            />
          )}
        </Frame>
      ))}
      {menu && (
        <div
          className="os-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <span>WORKSPACE</span>
          <button onClick={() => open("terminal")}>
            <Terminal size={15} />
            Open terminal<kbd>⌃⌥T</kbd>
          </button>
          <button onClick={() => open("files", HOME)}>
            <FolderOpen size={15} />
            Open home folder
          </button>
          <button onClick={() => open("editor")}>
            <FileText size={15} />
            New document
          </button>
          <hr />
          <button
            onClick={() => {
              manager.showDesktop();
              setMenu(null);
            }}
          >
            <Monitor size={15} />
            Show desktop
          </button>
          <button onClick={() => open("settings")}>
            <Settings2 size={15} />
            Personalize
          </button>
        </div>
      )}
      {launcher && (
        <section className="os-launcher" aria-label="Application launcher">
          <div className="os-launcher-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Search applications"
              placeholder="Find an app. Make something."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>esc</kbd>
          </div>
          <div className="os-launcher-heading">
            YOUR APPLICATIONS <span>{ALL_APPS.length} apps</span>
          </div>
          <div className="os-launcher-grid">
            {ALL_APPS.filter((a) =>
              APP_LABELS[a].toLowerCase().includes(query.toLowerCase()),
            ).map((app) => {
              const Icon = APP_ICONS[app];
              return (
                <button key={app} onClick={() => open(app)}>
                  <span className={`os-app-icon ${app}`}>
                    <Icon size={25} />
                  </span>
                  {APP_LABELS[app]}
                </button>
              );
            })}
          </div>
          <footer>
            <span className="os-avatar">S</span>
            <span>
              Stephan<small>Personal workspace</small>
            </span>
            <button
              title="Settings"
              aria-label="Open settings"
              onClick={() => open("settings")}
            >
              <Settings2 size={18} />
            </button>
          </footer>
        </section>
      )}
      <footer className="os-taskbar">
        <button
          className={`os-start-button ${launcher ? "selected" : ""}`}
          aria-label="Open application launcher"
          onClick={() => setLauncher((v) => !v)}
        >
          <LayoutGrid size={22} />
        </button>
        <button
          className="os-task-search"
          aria-label="Search apps and files"
          onClick={() => {
            setLauncher(true);
            setQuery("");
          }}
        >
          <Search size={17} />
          <span>Search</span>
        </button>
        <div className="os-taskbar-divider" />
        <nav className="os-taskbar-apps" aria-label="Running applications">
          {(["files", "terminal", "browser"] as AppId[]).map((app) => {
            const Icon = APP_ICONS[app];
            return (
              <button
                key={app}
                title={`New ${APP_LABELS[app]}`}
                aria-label={`Launch ${APP_LABELS[app]}`}
                className={`os-pinned ${app}`}
                onClick={() => open(app)}
              >
                <Icon size={22} />
              </button>
            );
          })}
          {manager.windows.length > 0 && <div className="os-taskbar-divider" />}
          {manager.windows.map((item) => {
            const Icon = APP_ICONS[item.app] || Monitor;
            return (
              <button
                key={item.id}
                className={`os-task ${manager.activeId === item.id && !item.minimized ? "selected" : ""} ${item.minimized ? "minimized" : ""}`}
                title={item.title}
                aria-label={`Switch to ${item.title}`}
                onClick={() =>
                  manager.activeId === item.id && !item.minimized
                    ? manager.minimize(item.id)
                    : manager.focus(item.id)
                }
              >
                <Icon size={18} />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>
        <div className="os-system-tray">
          <span className="os-storage-dot" title={status} />
          <Wifi
            size={16}
            aria-label={online ? "Online" : "Offline"}
            style={{ opacity: online ? 1 : 0.35 }}
          />
          <button
            aria-label="Open calendar"
            onClick={() => open("calendar")}
            className="os-clock"
          >
            <span>
              {time?.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <small>
              {time?.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </small>
          </button>
          <button
            className="os-show-desktop"
            title="Show desktop"
            aria-label="Show desktop"
            onClick={manager.showDesktop}
          />
        </div>
      </footer>
    </main>
  );
}
