"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  UploadCloud,
  X,
} from "lucide-react";
import { lotw, HOME, type FsEntry } from "@/lib/lotw/client";
import type { AppId } from "@/lib/desktop";

const DESKTOP = `${HOME}/Desktop`;
const ORDER_KEY = "stephos.desktop-file-order.v1";
const DRAG_TYPE = "application/x-stephans-desktop-file";
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

export function DesktopFiles({
  onOpen,
}: {
  onOpen: (app: AppId, path?: string) => void;
}) {
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [rows, setRows] = useState(5);
  const [columns, setColumns] = useState(8);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const busyRef = useRef(false);
  const depth = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const files = await lotw.list(DESKTOP);
      if (current === revision.current) {
        setEntries(files);
        setError("");
      }
    } catch (reason) {
      if (current === revision.current) setError(messageOf(reason));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(ORDER_KEY) || "[]",
      );
      if (Array.isArray(saved))
        setOrder(
          saved.filter((value): value is string => typeof value === "string"),
        );
    } catch {
      /* Invalid saved icon order does not affect stored files. */
    }
    const resize = () => {
      setRows(Math.max(1, Math.floor((window.innerHeight - 168) / 98)));
      setColumns(Math.max(1, Math.floor((window.innerWidth - 148) / 99)));
    };
    resize();
    window.addEventListener("resize", resize);
    void refresh();
    const unsubscribe = lotw.subscribe(() => {
      void refresh();
    });
    return () => {
      revision.current++;
      unsubscribe();
      window.removeEventListener("resize", resize);
    };
  }, [refresh]);

  const arranged = [...entries].sort((a, b) => {
    const ai = order.indexOf(a.name),
      bi = order.indexOf(b.name);
    if (ai !== -1 || bi !== -1)
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    return a.name.localeCompare(b.name);
  });
  const reorder = (source: string, target: string) => {
    const next = arranged.map((entry) => entry.name);
    const from = next.indexOf(source),
      to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      setNotice("Icon order could not be saved. Your files are safe.");
    }
  };

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      let imported = 0;
      try {
        const known = new Set(
          (await lotw.list(DESKTOP)).map((entry) => entry.name),
        );
        for (const file of files) {
          if (!file.name || /[\/\0]/.test(file.name))
            throw new Error(`Invalid filename: ${file.name}`);
          const dot = file.name.lastIndexOf(".");
          const base = dot > 0 ? file.name.slice(0, dot) : file.name;
          const ext = dot > 0 ? file.name.slice(dot) : "";
          let name = file.name,
            suffix = 1;
          const bytes = new Uint8Array(await file.arrayBuffer());
          while (true) {
            while (known.has(name)) name = `${base} (${suffix++})${ext}`;
            try {
              await lotw.writeFile(`${DESKTOP}/${name}`, bytes, {
                exclusive: true,
              });
              break;
            } catch (reason) {
              if (!messageOf(reason).endsWith(": already exists")) throw reason;
              known.add(name);
            }
          }
          known.add(name);
          imported++;
          setSelected(name);
        }
        setNotice(
          `${imported} ${imported === 1 ? "file" : "files"} saved to Desktop.`,
        );
        await refresh();
      } catch (reason) {
        setError(
          `${messageOf(reason)}${imported ? ` ${imported} files were saved before this error.` : ""}`,
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    const isBackground = (event: DragEvent) =>
      event.target instanceof Element &&
      !!event.target.closest(".os-desktop") &&
      !event.target.closest(
        ".os-window,.os-taskbar,.os-launcher,.os-context-menu,.os-boot-error",
      );
    const hasFiles = (event: DragEvent) =>
      !!event.dataTransfer &&
      Array.from(event.dataTransfer.types).includes("Files");
    const enter = (event: DragEvent) => {
      if (isBackground(event) && hasFiles(event)) {
        event.preventDefault();
        depth.current++;
        setDragOver(true);
      }
    };
    const over = (event: DragEvent) => {
      if (isBackground(event) && hasFiles(event)) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = busyRef.current ? "none" : "copy";
        setDragOver(true);
      } else setDragOver(false);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current || !event.relatedTarget) setDragOver(false);
    };
    const drop = (event: DragEvent) => {
      depth.current = 0;
      setDragOver(false);
      if (!isBackground(event) || !hasFiles(event)) return;
      event.preventDefault();
      const items = Array.from(event.dataTransfer!.items);
      if (items.some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
        setError("Drop individual files here. Folder import is not supported.");
        return;
      }
      void importFiles(Array.from(event.dataTransfer!.files));
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", over);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", over);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
    };
  }, [importFiles]);

  const openEntry = async (entry: FsEntry) => {
    try {
      let resolved = entry;
      for (let i = 0; resolved.type === "symlink"; i++) {
        if (i >= 32 || !resolved.linkTarget)
          throw new Error("This shortcut is broken or contains a link loop.");
        resolved = await lotw.stat(
          resolved.linkTarget.startsWith("/")
            ? resolved.linkTarget
            : `${parentOf(resolved.path)}/${resolved.linkTarget}`,
        );
      }
      if (resolved.type === "directory") onOpen("files", entry.path);
      else if (
        /\.(png|jpe?g|gif|webp|svg|pdf|zip|mp3|mp4|wav|webm|exe|wasm)$/i.test(
          entry.name,
        ) ||
        resolved.size > 2 * 1024 * 1024
      ) {
        onOpen("files", DESKTOP);
        setNotice("Use Download in Files to open this file on your computer.");
      } else onOpen("editor", entry.path);
    } catch (reason) {
      setError(messageOf(reason));
    }
  };

  return (
    <>
      <div
        className="desktop-live-files"
        role="group"
        aria-label="Desktop files"
        aria-busy={loading || busy}
      >
        {loading && (
          <span className="desktop-file-status">Opening desktop files…</span>
        )}
        {arranged.slice(0, rows * columns).map((entry, index) => {
          const Icon =
            entry.type === "directory"
              ? FolderOpen
              : entry.type === "symlink"
                ? Link2
                : /\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name)
                  ? ImageIcon
                  : FileText;
          return (
            <button
              key={entry.path}
              draggable
              className={`os-desktop-icon live-file ${selected === entry.name ? "selected" : ""}`}
              style={{
                left: Math.floor(index / rows) * 99,
                top: (index % rows) * 98,
              }}
              aria-label={`Desktop ${entry.name}`}
              title={`${entry.path}\nDouble-click to open. Drag to rearrange, or use Alt + arrow keys.`}
              onClick={() => setSelected(entry.name)}
              onDoubleClick={() => {
                void openEntry(entry);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void openEntry(entry);
                }
                if (
                  event.altKey &&
                  ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  const step = ["ArrowLeft", "ArrowUp"].includes(event.key)
                    ? -1
                    : 1;
                  const target = arranged[index + step];
                  if (target) reorder(entry.name, target.name);
                }
              }}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, entry.name);
                event.dataTransfer.effectAllowed = "move";
                setSelected(entry.name);
              }}
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes(DRAG_TYPE)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                const source = event.dataTransfer.getData(DRAG_TYPE);
                if (source) {
                  event.preventDefault();
                  reorder(source, entry.name);
                }
              }}
            >
              <span
                className={`os-app-icon ${entry.type === "directory" ? "files" : "editor"}`}
              >
                <Icon size={28} strokeWidth={1.6} />
              </span>
              <span>{entry.name}</span>
            </button>
          );
        })}
        {arranged.length > rows * columns && (
          <button className="desktop-files-overflow" onClick={() => onOpen("files", DESKTOP)}>
            +{arranged.length - rows * columns} more · Open Desktop
          </button>
        )}
      </div>
      {dragOver && (
        <div className="desktop-drop-guide">
          <UploadCloud size={36} />
          <strong>Drop files onto your desktop</strong>
          <span>Saved in this browser. Existing files keep their names.</span>
        </div>
      )}
      {(notice || error || busy) && (
        <div
          className={`desktop-import-message ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{busy ? "Saving files to Desktop…" : error || notice}</span>
          {!busy && (
            <button
              aria-label="Dismiss desktop message"
              onClick={() => {
                setNotice("");
                setError("");
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <style jsx>{`
        .desktop-live-files {
          position: absolute;
          left: 120px;
          right: 28px;
          top: 82px;
          bottom: 76px;
          z-index: 3;
          pointer-events: none;
          overflow: hidden;
        }
        .live-file {
          position: absolute;
          pointer-events: auto;
          transition: background 0.15s;
          touch-action: manipulation;
        }
        .live-file.selected {
          background: #ffffff22;
          outline: 1px solid #ffffff2b;
        }
        .live-file:focus-visible {
          outline: 2px solid #dde4ff;
          outline-offset: 2px;
        }
        .desktop-file-status {
          font-size: 11px;
          color: #fff9;
          padding: 12px;
          display: block;
        }
        .desktop-files-overflow {
          position: absolute;
          right: 0;
          bottom: 0;
          padding: 8px 12px;
          background: #24333abf;
          border: 1px solid #ffffff30;
          border-radius: 7px;
          pointer-events: auto;
          font-size: 11px;
        }
        .desktop-drop-guide {
          position: absolute;
          inset: 65px 20px 70px;
          z-index: 12;
          border: 2px dashed #d9eee8aa;
          border-radius: 18px;
          background: #233b47b0;
          backdrop-filter: blur(8px);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 13px;
          color: #f2fbf8;
        }
        .desktop-drop-guide strong {
          font-size: 19px;
          font-weight: 500;
        }
        .desktop-drop-guide span {
          font-size: 12px;
          color: #e3eeeea0;
        }
        .desktop-import-message {
          position: absolute;
          z-index: 1001;
          right: 20px;
          bottom: 68px;
          max-width: min(430px, calc(100vw - 40px));
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 13px 15px;
          background: #253c3b;
          border: 1px solid #c1e3dc3b;
          border-radius: 9px;
          box-shadow: 0 8px 24px #0003;
          font-size: 12px;
          color: #eef8f4;
          word-break: break-word;
        }
        .desktop-import-message.error {
          background: #50303b;
          border-color: #d899ad6b;
        }
        .desktop-import-message button {
          display: flex;
          padding: 4px;
          border-radius: 4px;
        }
        .desktop-import-message button:hover {
          background: #ffffff18;
        }
        @media (max-width: 760px) {
          .desktop-live-files {
            left: 108px;
            right: 10px;
          }
          .desktop-drop-guide span {
            max-width: 220px;
            text-align: center;
          }
          .desktop-drop-guide strong {
            font-size: 16px;
          }
        }
      `}</style>
    </>
  );
}
