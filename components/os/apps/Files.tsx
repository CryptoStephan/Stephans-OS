"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Home,
  List,
  Loader2,
  Pencil,
  Search,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { HOME, lotw, type FsEntry } from "@/lib/lotw/client";
import {
  AppError,
  basename,
  errorMessage,
  formatBytes,
  joinPath,
  parentPath,
  type AppContentProps,
} from "./shared";

type FileAction = "file" | "folder" | "rename" | "copy" | "move" | "delete";
type ActionState = { type: FileAction; entry?: FsEntry; value: string };
const validName = (name: string) =>
  !!name.trim() && !/[\/\0]/.test(name) && name !== "." && name !== "..";
const fileIcon = (entry: FsEntry) =>
  entry.type === "directory" ? (
    <Folder />
  ) : /\.(js|ts|tsx|jsx|json|css|html|sh|py)$/i.test(entry.name) ? (
    <FileCode2 />
  ) : /\.(txt|md|csv|log)$/i.test(entry.name) ? (
    <FileText />
  ) : (
    <FileIcon />
  );

export const Files = ({
  path = HOME,
  onOpen,
  onPathChange,
}: Omit<AppContentProps, "app">) => {
  const [current, setCurrent] = useState(path);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [selected, setSelected] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionState>();
  const [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const files = await lotw.list(current);
      if (id === requestId.current) {
        setEntries(
          files.sort(
            (a, b) =>
              Number(b.type === "directory") - Number(a.type === "directory") ||
              a.name.localeCompare(b.name),
          ),
        );
        setError("");
      }
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    setCurrent(path);
  }, [path]);
  useEffect(() => {
    setLoading(true);
    void refresh();
    return lotw.subscribe(() => {
      void refresh();
    });
  }, [refresh]);

  const navigate = (next: string) => {
    if (next === current) return;
    setHistory((prev) => [...prev, current]);
    setCurrent(next);
    setSelected(undefined);
    setQuery("");
    onPathChange?.(next);
  };
  const choose = async (entry: FsEntry) => {
    try {
      let resolved = entry;
      for (let depth = 0; resolved.type === "symlink"; depth++) {
        if (depth >= 40 || !resolved.linkTarget)
          throw new Error("The symbolic link is broken or contains a loop.");
        const target = resolved.linkTarget.startsWith("/")
          ? resolved.linkTarget
          : joinPath(parentPath(resolved.path), resolved.linkTarget);
        resolved = await lotw.stat(target);
      }
      if (resolved.type === "directory") navigate(entry.path);
      else if (
        /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|mp3|mp4|wav|webm|woff2?|exe|wasm)$/i.test(
          entry.name,
        ) ||
        entry.size > 2 * 1024 * 1024
      ) {
        setSelected(entry.path);
        setNotice(
          "Select Download to open this file with an application on your computer.",
        );
      } else onOpen("editor", entry.path);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const active = entries.find((entry) => entry.path === selected);
  const filtered = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const breadcrumb = current.split("/").filter(Boolean);

  const submit = async () => {
    if (!action) return;
    const value = action.value.trim();
    if (
      ["file", "folder", "rename"].includes(action.type) &&
      !validName(value)
    ) {
      setError("Use a name without slashes. The names . and .. are reserved.");
      return;
    }
    if (["move", "copy"].includes(action.type) && !value.startsWith("/")) {
      setError("Enter the complete destination path, starting with /.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action.type === "file" || action.type === "folder") {
        const target = joinPath(current, value);
        if (entries.some((entry) => entry.name === value))
          throw new Error("A file or folder with that name already exists.");
        if (action.type === "file")
          await lotw.writeFile(target, "", { exclusive: true });
        else await lotw.mkdir(target);
        setSelected(target);
      } else if (action.entry) {
        if (action.type === "delete") {
          await lotw.remove(action.entry.path, {
            recursive: action.entry.type === "directory",
          });
          setSelected(undefined);
        } else if (action.type === "copy")
          await lotw.copy(action.entry.path, value);
        else {
          const target =
            action.type === "rename" ? joinPath(current, value) : value;
          await lotw.move(action.entry.path, target);
          setSelected(target);
        }
      }
      setAction(undefined);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const download = async (entry: FsEntry) => {
    try {
      const bytes = await lotw.readFile(entry.path);
      const blob = new Blob([new Uint8Array(bytes).buffer]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = entry.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const upload = async (files: FileList | File[]) => {
    if (busy) return;
    setBusy(true);
    setError("");
    let count = 0;
    try {
      const names = new Set(entries.map((entry) => entry.name));
      for (const file of Array.from(files)) {
        let name = file.name;
        let suffix = 1;
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        while (names.has(name)) name = `${stem} (${suffix++})${ext}`;
        await lotw.writeFile(
          joinPath(current, name),
          new Uint8Array(await file.arrayBuffer()),
          { exclusive: true },
        );
        names.add(name);
        count++;
      }
      setNotice(`Imported ${count} ${count === 1 ? "file" : "files"}.`);
      await refresh();
    } catch (err) {
      setError(
        `${count ? `${count} files imported. ` : ""}${errorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="os-app-files"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          void upload(event.dataTransfer.files);
        }
      }}
    >
      <div className="os-app-toolbar">
        <button
          title="Back"
          aria-label="Back"
          disabled={!history.length}
          onClick={() => {
            const previous = history[history.length - 1];
            setCurrent(previous);
            onPathChange?.(previous);
            setHistory(history.slice(0, -1));
            setSelected(undefined);
            setQuery("");
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          title="Parent folder"
          aria-label="Parent folder"
          disabled={current === "/"}
          onClick={() => navigate(parentPath(current))}
        >
          <ArrowUp size={17} />
        </button>
        <nav className="os-app-breadcrumb" aria-label="Folder path">
          <button onClick={() => navigate("/")} title="Filesystem root">
            <HardDrive size={15} />
          </button>
          {breadcrumb.map((part, index) => (
            <span key={index}>
              <ChevronRight size={12} />
              <button
                onClick={() =>
                  navigate(`/${breadcrumb.slice(0, index + 1).join("/")}`)
                }
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
        <button
          className={view === "grid" ? "is-active" : ""}
          aria-label="Grid view"
          title="Grid view"
          onClick={() => setView("grid")}
        >
          <Grid2X2 size={16} />
        </button>
        <button
          className={view === "list" ? "is-active" : ""}
          aria-label="List view"
          title="List view"
          onClick={() => setView("list")}
        >
          <List size={17} />
        </button>
      </div>
      <div className="os-app-files-body">
        <aside className="os-app-files-sidebar">
          <span className="os-app-sidebar-label">FAVORITES</span>
          {[
            { name: "Home", path: HOME, icon: <Home size={17} /> },
            {
              name: "Desktop",
              path: `${HOME}/Desktop`,
              icon: <Grid2X2 size={17} />,
            },
            {
              name: "Documents",
              path: `${HOME}/Documents`,
              icon: <FileText size={17} />,
            },
            {
              name: "Downloads",
              path: `${HOME}/Downloads`,
              icon: <Download size={17} />,
            },
            { name: "Filesystem", path: "/", icon: <HardDrive size={17} /> },
          ].map((item) => (
            <button
              key={item.path}
              className={current === item.path ? "is-active" : ""}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              <span>{item.name}</span>
            </button>
          ))}
          <div className="os-app-sidebar-bottom">
            <span className="os-app-storage-dot" /> Local storage
            <br />
            <small>Files stay in this browser</small>
          </div>
        </aside>
        <main className="os-app-files-main">
          <div className="os-app-files-heading">
            <div>
              <h2>{current === HOME ? "Home" : basename(current)}</h2>
              <p>
                {entries.length} {entries.length === 1 ? "item" : "items"}
              </p>
            </div>
            <label className="os-app-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this folder"
                aria-label="Search this folder"
              />
            </label>
          </div>
          <div className="os-app-file-actions">
            <button
              disabled={busy}
              onClick={() => setAction({ type: "folder", value: "New folder" })}
            >
              <FolderPlus size={16} /> New folder
            </button>
            <button
              disabled={busy}
              onClick={() => setAction({ type: "file", value: "Untitled.txt" })}
            >
              <FilePlus2 size={16} /> New file
            </button>
            <button disabled={busy} onClick={() => uploadRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
            <button
              title="Open terminal here"
              aria-label="Open terminal here"
              onClick={() => onOpen("terminal", current)}
            >
              <Terminal size={16} />
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          <AppError message={error} dismiss={() => setError("")} />
          {notice && (
            <div className="os-app-notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="os-app-empty">
              <Loader2 className="os-app-spin" size={24} />
              <p>Opening folder…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="os-app-empty">
              <Folder size={42} />
              <h3>{query ? "No matching files" : "A little room to create"}</h3>
              <p>
                {query
                  ? "Try a different filename."
                  : "Create a file or drop files here to import them."}
              </p>
            </div>
          ) : (
            <div
              className={`os-app-file-grid ${view === "list" ? "os-app-file-list" : ""}`}
              role="list"
              aria-label="Files"
            >
              {filtered.map((entry) => (
                <button
                  key={entry.path}
                  role="listitem"
                  className={`os-app-file-item ${selected === entry.path ? "is-selected" : ""}`}
                  onClick={() => setSelected(entry.path)}
                  onDoubleClick={() => void choose(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void choose(entry);
                    }
                  }}
                  title={
                    entry.linkTarget
                      ? `${entry.name} → ${entry.linkTarget}`
                      : entry.name
                  }
                >
                  <span
                    className={`os-app-file-icon ${entry.type === "directory" ? "is-folder" : ""}`}
                  >
                    {fileIcon(entry)}
                    {entry.type === "symlink" && <small>↗</small>}
                  </span>
                  <span className="os-app-file-name">{entry.name}</span>
                  <span className="os-app-file-meta">
                    {entry.type === "directory"
                      ? "Folder"
                      : entry.type === "symlink"
                        ? "Link"
                        : formatBytes(entry.size)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
      <div className="os-app-files-status">
        <span>
          {busy
            ? "Working…"
            : active
              ? active.name
              : "Double-click a file to open it"}
        </span>
        {active && (
          <div>
            <button
              title="Open selected item"
              aria-label="Open selected item"
              onClick={() => void choose(active)}
            >
              <ChevronRight size={15} />
            </button>
            <button
              title="Rename"
              aria-label="Rename selected item"
              onClick={() =>
                setAction({ type: "rename", entry: active, value: active.name })
              }
            >
              <Pencil size={14} />
            </button>
            <button
              title="Copy to…"
              aria-label="Copy selected item"
              onClick={() =>
                setAction({
                  type: "copy",
                  entry: active,
                  value: joinPath(current, `${active.name}.copy`),
                })
              }
            >
              <Copy size={14} />
            </button>
            <button
              title="Move to…"
              aria-label="Move selected item"
              onClick={() =>
                setAction({ type: "move", entry: active, value: active.path })
              }
            >
              <ArrowUp size={14} />
            </button>
            {active.type !== "directory" && (
              <button
                title="Download"
                aria-label="Download selected file"
                onClick={() => void download(active)}
              >
                <Download size={14} />
              </button>
            )}
            <button
              title="Delete"
              aria-label="Delete selected item"
              onClick={() =>
                setAction({ type: "delete", entry: active, value: "" })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {action && (
        <div className="os-app-dialog-shade">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={
              action.type === "delete" ? "Delete item" : `${action.type} item`
            }
            className="os-app-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <h3>
              {action.type === "file"
                ? "New file"
                : action.type === "folder"
                  ? "New folder"
                  : action.type === "delete"
                    ? "Delete permanently?"
                    : `${action.type[0].toUpperCase()}${action.type.slice(1)} ${action.entry?.name}`}
            </h3>
            {action.type === "delete" ? (
              <p>
                “{action.entry?.name}”
                {action.entry?.type === "directory"
                  ? " and everything inside it"
                  : ""}{" "}
                will be permanently removed from this browser’s filesystem.
              </p>
            ) : (
              <label>
                {["copy", "move"].includes(action.type)
                  ? "Full destination path"
                  : "Name"}
                <input
                  autoFocus
                  value={action.value}
                  onChange={(event) =>
                    setAction({ ...action, value: event.target.value })
                  }
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setAction(undefined);
                  }}
                  required
                />
              </label>
            )}
            <AppError message={error} />
            <div className="os-app-dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                Cancel
              </button>
              <button
                className={
                  action.type === "delete" ? "is-danger" : "is-primary"
                }
                type="submit"
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="os-app-spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                {action.type === "delete" ? "Delete" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
