"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Loader2,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { HOME, lotw } from "@/lib/lotw/client";
import { errorMessage, parentPath } from "./shared";

interface TerminalLine {
  text: string;
  kind: "stdout" | "error" | "info" | "warning" | "command";
  cwd?: string;
}
const historyKey = "stephos:terminal-history:v1";
const displayPath = (path: string) =>
  path === HOME
    ? "~"
    : path.startsWith(`${HOME}/`)
      ? `~${path.slice(HOME.length)}`
      : path;
const commands = [
  "cat",
  "cd",
  "clear",
  "cp",
  "echo",
  "env",
  "grep",
  "help",
  "history",
  "ln",
  "ls",
  "mkdir",
  "mv",
  "pwd",
  "rm",
  "rmdir",
  "touch",
  "wc",
];

export const Terminal = ({
  path = HOME,
  onPathChange,
}: {
  path?: string;
  onPathChange?: (path: string) => void;
}) => {
  const sessionId = `terminal-${useId()}`;
  const [cwd, setCwd] = useState(path);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef("");
  const aliveRef = useRef(true);
  const executionRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    void lotw
      .ready()
      .then(() => {
        if (aliveRef.current) setReady(true);
      })
      .catch((err) => {
        if (aliveRef.current)
          setLines([{ text: errorMessage(err), kind: "error" }]);
      });
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (Array.isArray(saved))
        setHistory(
          saved
            .filter((value): value is string => typeof value === "string")
            .slice(-300),
        );
    } catch {
      /* History storage is optional. */
    }
    return () => {
      aliveRef.current = false;
      if (executionRef.current)
        void lotw.cancel(sessionId).catch(() => undefined);
    };
  }, [sessionId]);
  useEffect(() => {
    setCwd(path);
  }, [path]);
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines, busy]);
  useEffect(() => {
    if (ready && !busy) inputRef.current?.focus();
  }, [ready, busy]);

  const append = (line: TerminalLine) => {
    if (aliveRef.current)
      setLines((previous) => [...previous, line].slice(-2500));
  };
  const run = async (command = input) => {
    if (!command.trim() || busy || !ready) return;
    setInput("");
    setHistoryIndex(-1);
    draftRef.current = "";
    const nextHistory = [
      ...history.filter(
        (entry, index) => !(index === history.length - 1 && entry === command),
      ),
      command,
    ].slice(-300);
    setHistory(nextHistory);
    try {
      localStorage.setItem(historyKey, JSON.stringify(nextHistory));
    } catch {
      /* Continue without saved history. */
    }
    append({ text: command, kind: "command", cwd });
    if (command.trim() === "history") {
      append({
        text: nextHistory
          .map((entry, index) => `${String(index + 1).padStart(4)}  ${entry}`)
          .join("\n"),
        kind: "stdout",
      });
      return;
    }
    if (command.trim() === "clear") {
      setLines([]);
      return;
    }
    setBusy(true);
    executionRef.current = true;
    let streamed = 0;
    try {
      const result = await lotw.execute(command, {
        sessionId,
        cwd,
        onOutput: (line) => {
          streamed++;
          append(line);
        },
      });
      if (!aliveRef.current) return;
      if (result.clear) setLines(result.output);
      else if (!streamed) result.output.forEach(append);
      setCwd(result.cwd);
      if (result.cwd !== cwd) onPathChange?.(result.cwd);
      if (result.code && !result.output.some((line) => line.kind === "error"))
        append({
          text: `Process exited with status ${result.code}`,
          kind: "warning",
        });
    } catch (err) {
      append({ text: errorMessage(err), kind: "error" });
    } finally {
      executionRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };
  const cancel = async () => {
    if (!busy) {
      setInput("");
      return;
    }
    try {
      await lotw.cancel(sessionId);
      append({ text: "^C", kind: "warning" });
    } catch (err) {
      append({ text: errorMessage(err), kind: "error" });
    }
  };
  const complete = async () => {
    if (busy) return;
    const match = input.match(/(?:^|\s)([^\s"']*)$/);
    if (!match) return;
    const token = match[1];
    const prefix = input.slice(0, input.length - token.length);
    let matches: string[] = [];
    try {
      if (!prefix && !token.includes("/"))
        matches = commands.filter((command) => command.startsWith(token));
      if (prefix || token.includes("/") || matches.length === 0) {
        const expanded = token.startsWith("~/")
          ? `${HOME}${token.slice(1)}`
          : token;
        const absolute = expanded.startsWith("/")
          ? expanded
          : `${cwd === "/" ? "" : cwd}/${expanded}`;
        const folder = token.endsWith("/") ? absolute : parentPath(absolute);
        const start = token.endsWith("/")
          ? ""
          : token.slice(token.lastIndexOf("/") + 1);
        const kept = token.slice(0, token.lastIndexOf("/") + 1);
        matches = (await lotw.list(folder))
          .filter((entry) => entry.name.startsWith(start))
          .map(
            (entry) =>
              `${kept}${entry.name}${entry.type === "directory" ? "/" : ""}`,
          );
      }
      if (matches.length === 1)
        setInput(
          `${prefix}${matches[0].replace(/ /g, "\\ ")}${matches[0].endsWith("/") ? "" : " "}`,
        );
      else if (matches.length > 1) {
        const shared = matches.reduce((a, b) => {
          let i = 0;
          while (i < a.length && a[i] === b[i]) i++;
          return a.slice(0, i);
        });
        if (shared.length > token.length) setInput(`${prefix}${shared}`);
        else append({ text: matches.join("   "), kind: "info" });
      }
    } catch {
      /* An incomplete path is not a shell error. */
    }
  };
  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(
        lines
          .map((line) =>
            line.kind === "command" ? `${line.cwd} $ ${line.text}` : line.text,
          )
          .join("\n"),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      append({
        text: "Clipboard access unavailable. Select the output and copy it with your keyboard.",
        kind: "warning",
      });
    }
  };

  return (
    <div
      className="os-app-terminal"
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key.toLowerCase() === "l") {
          event.preventDefault();
          setLines([]);
        }
        if (
          event.ctrlKey &&
          event.key.toLowerCase() === "c" &&
          !window.getSelection()?.toString()
        ) {
          event.preventDefault();
          void cancel();
        }
      }}
    >
      <div className="os-app-terminal-toolbar">
        <span>
          <TerminalIcon size={14} /> {displayPath(cwd)}
        </span>
        <div>
          <span className="os-app-terminal-connected">
            {busy ? "Running" : ready ? "Connected" : "Starting shell"}
          </span>
          {busy && (
            <button
              aria-label="Stop command"
              title="Stop command (Ctrl+C)"
              onClick={() => void cancel()}
            >
              <Square size={13} />
            </button>
          )}
          <button
            aria-label="Copy terminal output"
            title={copied ? "Copied" : "Copy output"}
            onClick={() => void copyOutput()}
          >
            <Copy size={13} />
          </button>
          <button
            aria-label="Clear terminal"
            title="Clear (Ctrl+L)"
            onClick={() => setLines([])}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div
        className="os-app-terminal-output"
        ref={outputRef}
        onClick={(event) => {
          if (
            !window.getSelection()?.toString() &&
            event.target === event.currentTarget
          )
            inputRef.current?.focus();
        }}
      >
        <div className="os-app-terminal-welcome">
          <div className="os-app-terminal-wordmark">
            steph<span>OS</span> <small>/ shell</small>
          </div>
          <p>Your filesystem. Your workspace.</p>
          <p className="os-app-terminal-hint">
            Files are shared with Files and Editor. Tab completes paths. ↑
            recalls commands.
          </p>
          <div className="os-app-terminal-suggestions">
            {["ls", "pwd", 'echo "Hello, world" > hello.txt'].map((command) => (
              <button
                key={command}
                disabled={!ready || busy}
                onClick={() => {
                  setInput(command);
                  inputRef.current?.focus();
                }}
              >
                <ChevronRight size={12} />
                {command}
              </button>
            ))}
          </div>
        </div>
        <div
          className="os-app-terminal-lines"
          role="log"
          aria-label="Terminal output"
          aria-live="polite"
        >
          {lines.map((line, index) => (
            <div className={`os-app-terminal-line is-${line.kind}`} key={index}>
              {line.kind === "command" && (
                <>
                  <span className="os-app-terminal-user">me@stephos</span>
                  <span className="os-app-terminal-path">
                    {" "}
                    {displayPath(line.cwd || HOME)}
                  </span>
                  <span className="os-app-terminal-prompt"> ❯ </span>
                </>
              )}
              <span>{line.text}</span>
            </div>
          ))}
        </div>
        {busy && (
          <div className="os-app-terminal-running">
            <Loader2 className="os-app-spin" size={13} /> Command running ·
            Ctrl+C to stop
          </div>
        )}
        <form
          className="os-app-terminal-input-line"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <label htmlFor={sessionId}>
            <span className="os-app-terminal-user">me@stephos</span>
            <span className="os-app-terminal-path"> {displayPath(cwd)}</span>
            <span className="os-app-terminal-prompt"> ❯ </span>
          </label>
          <input
            id={sessionId}
            ref={inputRef}
            aria-label="Terminal command"
            value={input}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={!ready || busy}
            onChange={(event) => {
              setInput(event.target.value);
              setHistoryIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                void complete();
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (!history.length) return;
                if (historyIndex === -1) draftRef.current = input;
                const next =
                  historyIndex === -1
                    ? history.length - 1
                    : Math.max(0, historyIndex - 1);
                setHistoryIndex(next);
                setInput(history[next]);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (historyIndex === -1) return;
                if (historyIndex >= history.length - 1) {
                  setHistoryIndex(-1);
                  setInput(draftRef.current);
                } else {
                  setHistoryIndex(historyIndex + 1);
                  setInput(history[historyIndex + 1]);
                }
              }
            }}
          />
        </form>
      </div>
      <div className="os-app-terminal-status">
        <span>
          <span className="os-app-storage-dot" /> LOTW shell
        </span>
        <span>
          UTF-8 <i /> Browser-local filesystem
        </span>
      </div>
    </div>
  );
};
