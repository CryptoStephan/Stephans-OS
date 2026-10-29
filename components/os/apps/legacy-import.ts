import { HOME, lotw } from "@/lib/lotw/client";

export interface LegacyImportReport {
  destination?: string;
  files: number;
  folders: number;
  bytes: number;
  skipped: string[];
  errors: string[];
  cancelled: boolean;
}

interface ImportOptions {
  includeLocalStorage?: boolean;
  signal?: AbortSignal;
  onProgress?: (path: string, files: number) => void;
}

type Directory = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<
    FileSystemFileHandle | FileSystemDirectoryHandle
  >;
};
interface LegacyRecord {
  id?: string;
  parent?: string | null;
  name?: string;
  type?: string;
  content?: unknown;
}
const INTERNAL_DIRECTORIES = new Set([
  "stephans-os-blobs-v1",
  "blobs",
  ".lotw",
  ".lots",
]);
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const safeName = (name: string) =>
  name.replace(/[\/\u0000-\u001f]/g, "_").replace(/^\.{1,2}$/, "_") ||
  "Untitled";

/** Explicit, non-destructive migration of the original direct-OPFS implementation. */
export const importLegacyFiles = async ({
  includeLocalStorage = true,
  signal,
  onProgress,
}: ImportOptions = {}): Promise<LegacyImportReport> => {
  const report: LegacyImportReport = {
    files: 0,
    folders: 0,
    bytes: 0,
    skipped: [],
    errors: [],
    cancelled: false,
  };
  const checkpoint = () => {
    if (signal?.aborted)
      throw new DOMException("Import cancelled", "AbortError");
  };
  const rethrowCancellation = (error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
  };
  const children = new Map<string, Set<string>>();
  const uniquePath = async (parent: string, requestedName: string) => {
    checkpoint();
    if (!children.has(parent))
      children.set(
        parent,
        new Set((await lotw.list(parent)).map((entry) => entry.name)),
      );
    const names = children.get(parent)!;
    const name = safeName(requestedName);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    let chosen = name;
    let index = 2;
    while (names.has(chosen)) chosen = `${stem} (${index++})${extension}`;
    names.add(chosen);
    return `${parent}/${chosen}`;
  };
  const directory = async (parent: string, name: string) => {
    const path = await uniquePath(parent, name);
    await lotw.mkdir(path);
    report.folders++;
    children.set(path, new Set());
    return path;
  };
  const file = async (
    parent: string,
    name: string,
    bytes: Uint8Array | string,
  ) => {
    const path = await uniquePath(parent, name);
    checkpoint();
    onProgress?.(path, report.files);
    await lotw.writeFile(path, bytes, { exclusive: true });
    report.files++;
    report.bytes +=
      typeof bytes === "string"
        ? new TextEncoder().encode(bytes).length
        : bytes.byteLength;
    onProgress?.(path, report.files);
  };

  try {
    checkpoint();
    // Snapshot roots before writing. The new runtime's blob store is never traversed.
    const roots: Array<FileSystemFileHandle | FileSystemDirectoryHandle> = [];
    try {
      if (!navigator.storage?.getDirectory)
        throw new Error(
          "This browser does not expose the original OPFS storage.",
        );
      const root = (await navigator.storage.getDirectory()) as Directory;
      for await (const handle of root.values()) {
        if (
          handle.kind === "directory" &&
          INTERNAL_DIRECTORIES.has(handle.name)
        )
          report.skipped.push(`Internal storage directory: ${handle.name}`);
        else roots.push(handle);
      }
    } catch (error) {
      report.errors.push(`Reading old OPFS: ${messageOf(error)}`);
    }

    const snapshots: Array<{ key: string; text: string }> = [];
    if (includeLocalStorage) {
      for (const key of ["filesystemData", "desktopItems"]) {
        try {
          const text = localStorage.getItem(key);
          if (text !== null) snapshots.push({ key, text });
        } catch (error) {
          report.errors.push(`Reading ${key}: ${messageOf(error)}`);
        }
      }
    }
    if (!roots.length && !snapshots.length) return report;
    await lotw.ready();
    checkpoint();
    report.destination = await directory(HOME, "Imported from old desktop");

    if (roots.length) {
      const opfsTarget = await directory(report.destination, "OPFS");
      const copyHandle = async (
        handle: FileSystemFileHandle | FileSystemDirectoryHandle,
        parent: string,
        originalPath: string,
      ): Promise<void> => {
        checkpoint();
        onProgress?.(originalPath, report.files);
        try {
          if (handle.kind === "directory") {
            const target = await directory(parent, handle.name);
            for await (const child of (handle as Directory).values())
              await copyHandle(child, target, `${originalPath}/${child.name}`);
          } else {
            const source = await (handle as FileSystemFileHandle).getFile();
            const bytes = new Uint8Array(await source.arrayBuffer());
            await file(parent, source.name, bytes);
          }
        } catch (error) {
          rethrowCancellation(error);
          report.errors.push(`${originalPath}: ${messageOf(error)}`);
        }
      };
      for (const handle of roots)
        await copyHandle(handle, opfsTarget, `OPFS/${handle.name}`);
    }

    if (snapshots.length) {
      const localTarget = await directory(report.destination, "Local storage");
      const metadataTarget = await directory(localTarget, "Original snapshots");
      // Preserve raw JSON even when older or malformed schemas cannot be reconstructed.
      for (const snapshot of snapshots) {
        try {
          await file(metadataTarget, `${snapshot.key}.json`, snapshot.text);
        } catch (error) {
          rethrowCancellation(error);
          report.errors.push(`${snapshot.key} snapshot: ${messageOf(error)}`);
        }
      }
      const data = snapshots.find(
        (snapshot) => snapshot.key === "filesystemData",
      );
      if (data) {
        try {
          const parsed: unknown = JSON.parse(data.text);
          if (!Array.isArray(parsed))
            throw new Error(
              "filesystemData is not an array; the original snapshot was preserved.",
            );
          const records = parsed as LegacyRecord[];
          const filesTarget = await directory(localTarget, "Files");
          const paths = new Map<number, string>();
          const idToIndex = new Map<string, number>();
          records.forEach((record, index) => {
            if (
              record &&
              typeof record.id === "string" &&
              !idToIndex.has(record.id)
            )
              idToIndex.set(record.id, index);
          });
          const importRecord = async (
            index: number,
            ancestors = new Set<number>(),
          ): Promise<string> => {
            checkpoint();
            if (paths.has(index)) return paths.get(index)!;
            if (ancestors.has(index))
              throw new Error(
                "Circular parent references; item is preserved in the original snapshot.",
              );
            const record = records[index];
            if (
              !record ||
              typeof record !== "object" ||
              typeof record.name !== "string"
            )
              throw new Error(
                "Invalid item; preserved in the original snapshot.",
              );
            const nextAncestors = new Set(ancestors).add(index);
            let parent = filesTarget;
            if (typeof record.parent === "string") {
              const parentIndex = idToIndex.get(record.parent);
              if (
                parentIndex !== undefined &&
                records[parentIndex]?.type === "folder"
              )
                parent = await importRecord(parentIndex, nextAncestors);
              else
                report.skipped.push(
                  `${record.name}: missing parent; recovered at the top level.`,
                );
            }
            if (record.type === "folder") {
              const target = await directory(parent, record.name);
              paths.set(index, target);
              return target;
            }
            if (record.type !== "file")
              throw new Error(
                "Non-file item preserved in the original snapshot only.",
              );
            if (
              record.content !== undefined &&
              typeof record.content !== "string"
            )
              throw new Error(
                "Non-text content preserved in the original snapshot only.",
              );
            const target = await uniquePath(parent, record.name);
            const text =
              typeof record.content === "string" ? record.content : "";
            checkpoint();
            onProgress?.(target, report.files);
            await lotw.writeFile(target, text, { exclusive: true });
            report.files++;
            report.bytes += new TextEncoder().encode(text).length;
            paths.set(index, target);
            return target;
          };
          for (let index = 0; index < records.length; index++) {
            try {
              await importRecord(index);
            } catch (error) {
              rethrowCancellation(error);
              report.errors.push(
                `Local item ${records[index]?.name || index}: ${messageOf(error)}`,
              );
            }
          }
        } catch (error) {
          rethrowCancellation(error);
          report.errors.push(
            `Local filesystem reconstruction: ${messageOf(error)}`,
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      report.cancelled = true;
    else report.errors.push(messageOf(error));
  }
  return report;
};
