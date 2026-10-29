"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Loader2, Save, WrapText } from "lucide-react";
import { HOME, lotw } from "@/lib/lotw/client";
import { AppError, basename, errorMessage, parentPath } from "./shared";

const MAX_EDITOR_BYTES = 2 * 1024 * 1024;
const readEditorText = async (path: string): Promise<string> => {
  const info = await lotw.stat(path);
  if (info.size > MAX_EDITOR_BYTES)
    throw new Error(
      "This file is larger than the editor’s 2 MB limit. Download it from Files to open it on your computer.",
    );
  const bytes = await lotw.readFile(path);
  if (bytes.byteLength > MAX_EDITOR_BYTES)
    throw new Error(
      "This file is larger than the editor’s 2 MB limit. Download it from Files to open it on your computer.",
    );
  if (bytes.includes(0))
    throw new Error(
      "This file contains binary data. Download it from Files to open it with a compatible application.",
    );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "This file is not valid UTF-8 text. Download it from Files to open it with a compatible application.",
    );
  }
};

export const Editor = ({
  path,
  windowId,
  onPathChange,
}: {
  path?: string;
  windowId?: string;
  onPathChange?: (path: string) => void;
}) => {
  const [filePath, setFilePath] = useState(path || "");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(!!path);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saveAs, setSaveAs] = useState<string>();
  const [wrap, setWrap] = useState(true);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const dirty = content !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipNextPathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (path && path === skipNextPathRef.current) {
      skipNextPathRef.current = undefined;
      return;
    }
    let alive = true;
    setFilePath(path || "");
    setError("");
    setMessage("");
    setBlocked(false);
    if (!path) {
      setContent("");
      setSaved("");
      setLoading(false);
      return;
    }
    setLoading(true);
    void readEditorText(path)
      .then((text) => {
        if (alive) {
          setContent(text);
          setSaved(text);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(errorMessage(err));
          setBlocked(true);
          setContent("");
          setSaved("");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const beforeClose = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (
        detail?.id === windowId &&
        dirtyRef.current &&
        !window.confirm(
          "This document has unsaved changes. Close without saving?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("stephos:beforeclose", beforeClose);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("stephos:beforeclose", beforeClose);
    };
  }, [windowId]);

  useEffect(() => {
    if (!filePath) return;
    let alive = true;
    const unsubscribe = lotw.subscribe(() => {
      void readEditorText(filePath)
        .then((text) => {
          if (!alive) return;
          setBlocked(false);
          setError("");
          if (text === savedRef.current) return;
          if (dirtyRef.current)
            setMessage(
              "File changed on disk. Your unsaved edits are preserved.",
            );
          else {
            setContent(text);
            setSaved(text);
            setMessage("Updated from filesystem");
          }
        })
        .catch((err) => {
          if (alive) {
            setBlocked(true);
            setError(errorMessage(err));
          }
        });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [filePath]);

  const save = useCallback(
    async (target = filePath) => {
      if (blocked || loading || saving) return;
      if (!target) {
        setSaveAs(`${HOME}/Documents/Untitled.txt`);
        return;
      }
      if (
        !target.startsWith("/") ||
        target.endsWith("/") ||
        target.includes("\0")
      ) {
        setError(
          "Enter a complete file path, for example /home/me/Documents/notes.txt.",
        );
        return;
      }
      setSaving(true);
      setError("");
      try {
        let exclusive = false;
        // Recheck the backing file so an external binary replacement cannot be
        // silently decoded and overwritten from an older editor buffer.
        if (filePath && target === filePath) {
          try {
            await readEditorText(filePath);
          } catch (err) {
            setBlocked(true);
            throw err;
          }
        }
        if (target !== filePath) {
          const siblings = await lotw.list(parentPath(target));
          const exists = siblings.some(
            (entry) => entry.name === basename(target),
          );
          if (
            exists &&
            !window.confirm(`Replace the existing file “${basename(target)}”?`)
          )
            return;
          exclusive = !exists;
        }
        await lotw.writeFile(target, content, { exclusive });
        setSaved(content);
        setFilePath(target);
        setSaveAs(undefined);
        setMessage("Saved to this browser");
        if (target !== filePath) {
          skipNextPathRef.current = target;
          onPathChange?.(target);
        }
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [filePath, content, onPathChange, blocked, loading, saving],
  );

  const updatePosition = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const before = textarea.value.slice(0, textarea.selectionStart).split("\n");
    setPosition({
      line: before.length,
      column: before[before.length - 1].length + 1,
    });
  };
  const lines = content.split("\n").length;

  return (
    <div
      className="os-app-editor"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (blocked || loading || saving) return;
          if (event.shiftKey)
            setSaveAs(filePath || `${HOME}/Documents/Untitled.txt`);
          else void save();
        }
      }}
    >
      <div className="os-app-editor-toolbar">
        <div className="os-app-editor-title">
          <FileText size={16} />
          <span>{filePath ? basename(filePath) : "Untitled"}</span>
          {dirty && (
            <span
              className="os-app-dirty"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </div>
        <button
          className="is-primary"
          disabled={saving || loading || blocked}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="os-app-spin" size={15} />
          ) : (
            <Save size={15} />
          )}{" "}
          Save
        </button>
        <button
          disabled={saving || loading || blocked}
          onClick={() =>
            setSaveAs(filePath || `${HOME}/Documents/Untitled.txt`)
          }
        >
          Save as
        </button>
        <button
          aria-label="Toggle word wrap"
          aria-pressed={wrap}
          title="Word wrap"
          className={wrap ? "is-active" : ""}
          onClick={() => setWrap(!wrap)}
        >
          <WrapText size={17} />
        </button>
      </div>
      <AppError
        message={error}
        dismiss={blocked ? undefined : () => setError("")}
      />
      <div className="os-app-editor-path" title={filePath}>
        {filePath || "New text document"}
      </div>
      {loading ? (
        <div className="os-app-empty">
          <Loader2 className="os-app-spin" size={24} />
          <p>Opening document…</p>
        </div>
      ) : (
        <div className="os-app-editor-area">
          <div className="os-app-editor-gutter" aria-hidden="true">
            {Array.from({ length: Math.min(lines, 1000) }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            aria-label="Document content"
            readOnly={blocked}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap={wrap ? "soft" : "off"}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setMessage("");
              updatePosition();
            }}
            onClick={updatePosition}
            onKeyUp={updatePosition}
            onScroll={(event) => {
              const gutter = event.currentTarget.previousElementSibling;
              if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab" && !blocked) {
                event.preventDefault();
                const start = event.currentTarget.selectionStart;
                const end = event.currentTarget.selectionEnd;
                setContent(`${content.slice(0, start)}  ${content.slice(end)}`);
                requestAnimationFrame(() => {
                  textareaRef.current?.setSelectionRange(start + 2, start + 2);
                  updatePosition();
                });
              }
            }}
            placeholder={
              blocked
                ? "Open this file in Files and download it to your computer."
                : "A blank page. Make it yours."
            }
          />
        </div>
      )}
      <div className="os-app-editor-status">
        <span>
          {blocked
            ? "Editing unavailable"
            : dirty
              ? "Unsaved changes"
              : message || "Ready"}
        </span>
        <span>
          Ln {position.line}, Col {position.column} <i />{" "}
          {content.length.toLocaleString()} characters <i /> UTF-8
        </span>
      </div>
      {saveAs !== undefined && (
        <div className="os-app-dialog-shade">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Save document as"
            className="os-app-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void save(saveAs.trim());
            }}
          >
            <h3>Save document</h3>
            <label>
              Full file path
              <input
                autoFocus
                value={saveAs}
                onChange={(event) => setSaveAs(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSaveAs(undefined);
                }}
                required
              />
            </label>
            <p>The parent folder must already exist.</p>
            <AppError message={error} />
            <div className="os-app-dialog-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSaveAs(undefined)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="is-primary"
                disabled={saving || blocked}
              >
                {saving ? (
                  <Loader2 className="os-app-spin" size={15} />
                ) : (
                  <Check size={15} />
                )}{" "}
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
