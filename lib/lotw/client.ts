export const HOME = "/home/me";

export type FsEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  linkTarget?: string;
};

export type ShellOutput = {
  text: string;
  kind: "stdout" | "error" | "info" | "warning";
};
export type ShellResult = {
  code: number;
  cwd: string;
  output: ShellOutput[];
  clear?: boolean;
};
export type RuntimeInfo = {
  home: string;
  engine: string;
  revision: string;
  persistent: boolean;
};
export type StorageInfo = { usage: number; quota: number; persisted: boolean };
type Pending = {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onOutput?: (entry: ShellOutput) => void;
};

/** One isolated LOTW JavaScript realm, shared by every desktop application. */
class LotwClient {
  private frame?: HTMLIFrameElement;
  private boot?: Promise<RuntimeInfo>;
  private requests = new Map<string, Pending>();
  private listeners = new Set<() => void>();
  private sequence = 0;

  ready(): Promise<RuntimeInfo> {
    if (this.boot) return this.boot;
    this.boot = new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("The filesystem is available in the browser."));
        return;
      }
      const frame = document.createElement("iframe");
      frame.hidden = true;
      frame.title = "Persistent filesystem engine";
      frame.src = "/runtime/lotw/index.html";
      frame.setAttribute("aria-hidden", "true");
      this.frame = frame;
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Filesystem startup timed out. Reload this desktop to retry.",
            ),
          ),
        20000,
      );
      window.addEventListener("message", (event: MessageEvent) => {
        if (
          event.origin !== window.location.origin ||
          event.source !== frame.contentWindow ||
          event.data?.channel !== "stephans-os:lotw"
        )
          return;
        const message = event.data;
        if (message.type === "ready") {
          clearTimeout(timeout);
          resolve(message.value);
          return;
        }
        if (message.type === "boot-error") {
          clearTimeout(timeout);
          reject(new Error(message.error));
          return;
        }
        if (message.type === "changed") {
          this.listeners.forEach((listener) => listener());
          return;
        }
        const request = this.requests.get(message.id);
        if (!request) return;
        if (message.type === "output") {
          request.onOutput?.(message.value);
          return;
        }
        clearTimeout(request.timer);
        this.requests.delete(message.id);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message.value);
      });
      document.body.appendChild(frame);
    });
    return this.boot;
  }

  private async call<T>(
    method: string,
    args: unknown[] = [],
    onOutput?: (entry: ShellOutput) => void,
  ): Promise<T> {
    await this.ready();
    return new Promise<T>((resolve, reject) => {
      const id = String(++this.sequence);
      // Long running commands can be cancelled by the terminal; ordinary calls fail visibly.
      const timer = setTimeout(
        () => {
          this.requests.delete(id);
          if (method === "execute") {
            const sessionId =
              (args[1] as { sessionId?: string } | undefined)?.sessionId ||
              "default";
            this.frame?.contentWindow?.postMessage(
              {
                channel: "stephans-os:lotw",
                id: `timeout-${id}`,
                method: "cancel",
                args: [sessionId],
              },
              window.location.origin,
            );
          }
          reject(new Error(`${method} timed out.`));
        },
        method === "execute" ? 120000 : 30000,
      );
      this.requests.set(id, { resolve, reject, timer, onOutput });
      this.frame!.contentWindow!.postMessage(
        { channel: "stephans-os:lotw", id, method, args },
        window.location.origin,
      );
    });
  }

  list(path: string): Promise<FsEntry[]> {
    return this.call("list", [path]);
  }
  stat(path: string): Promise<FsEntry> {
    return this.call("stat", [path]);
  }
  readText(path: string): Promise<string> {
    return this.call("readText", [path]);
  }
  readFile(path: string): Promise<Uint8Array> {
    return this.call("readFile", [path]);
  }
  writeFile(
    path: string,
    value: string | Uint8Array,
    options: { exclusive?: boolean } = {},
  ): Promise<FsEntry> {
    return this.call("writeFile", [path, value, options]);
  }
  mkdir(path: string): Promise<FsEntry> {
    return this.call("mkdir", [path]);
  }
  move(source: string, target: string): Promise<void> {
    return this.call("move", [source, target]);
  }
  copy(source: string, target: string): Promise<void> {
    return this.call("copy", [source, target]);
  }
  remove(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    return this.call("remove", [path, options]);
  }
  link(
    source: string,
    target: string,
    options: { symbolic?: boolean } = {},
  ): Promise<FsEntry> {
    return this.call("link", [source, target, options]);
  }
  execute(
    command: string,
    options: {
      sessionId?: string;
      cwd?: string;
      onOutput?: (entry: ShellOutput) => void;
    } = {},
  ): Promise<ShellResult> {
    const { onOutput, ...serializable } = options;
    return this.call("execute", [command, serializable], onOutput);
  }
  cancel(sessionId: string): Promise<void> {
    return this.call("cancel", [sessionId]);
  }
  storage(): Promise<StorageInfo> {
    return this.call("storage");
  }
  persist(): Promise<boolean> {
    return this.call("persist");
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const lotw = new LotwClient();
