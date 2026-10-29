"use client";

import { useEffect, useRef, useState } from "react";
import { FolderInput, Loader2, Square } from "lucide-react";
import { importLegacyFiles, type LegacyImportReport } from "./legacy-import";
import { formatBytes } from "./shared";

export const LegacyImport = ({
  onOpen,
}: {
  onOpen?: (app: string, path?: string) => void;
}) => {
  const [includeLocalStorage, setIncludeLocalStorage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<LegacyImportReport>();
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const start = async () => {
    if (busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setReport(undefined);
    setProgress("Looking for files from the previous desktop…");
    const result = await importLegacyFiles({
      includeLocalStorage,
      signal: controller.signal,
      onProgress: (path, count) => {
        if (aliveRef.current) setProgress(`${count} files copied · ${path}`);
      },
    });
    if (aliveRef.current) {
      setReport(result);
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="os-app-legacy-import">
      <p>
        Recover files from the previous desktop on this website. Each import
        creates a separate folder in Home and leaves all original data
        untouched.
      </p>
      <label>
        <input
          type="checkbox"
          checked={includeLocalStorage}
          disabled={busy}
          onChange={(event) => setIncludeLocalStorage(event.target.checked)}
        />{" "}
        Include older localStorage files and desktop metadata
      </label>
      <div className="os-app-legacy-actions">
        <button onClick={() => void start()} disabled={busy}>
          {busy ? (
            <Loader2 className="os-app-spin" size={15} />
          ) : (
            <FolderInput size={15} />
          )}{" "}
          {busy ? "Importing…" : "Import old desktop files"}
        </button>
        {busy && (
          <button onClick={() => controllerRef.current?.abort()}>
            <Square size={13} /> Cancel
          </button>
        )}
      </div>
      {busy && (
        <p className="os-app-legacy-progress" role="status">
          {progress}
        </p>
      )}
      {report && (
        <div className="os-app-legacy-result" role="status">
          <strong>
            {report.cancelled
              ? "Import stopped"
              : report.errors.length
                ? "Import finished with issues"
                : report.destination
                  ? "Import complete"
                  : "No old files found on this website"}
          </strong>
          {report.destination && (
            <>
              <p>
                {report.files} files copied · {report.folders} folders created ·{" "}
                {formatBytes(report.bytes)}
              </p>
              <p className="os-app-legacy-path">{report.destination}</p>
              {onOpen && (
                <button onClick={() => onOpen("files", report.destination)}>
                  Open imported files
                </button>
              )}
            </>
          )}
          {!report.destination && (
            <p>
              Browser storage is specific to this website address and browser
              profile. Files stored on the old site are only accessible while
              using that same address and profile.
            </p>
          )}
          {report.cancelled && (
            <p>
              Files already copied remain in the import folder. Originals were
              not changed.
            </p>
          )}
          {!!report.errors.length && (
            <details open>
              <summary>
                {report.errors.length}{" "}
                {report.errors.length === 1 ? "issue" : "issues"}
              </summary>
              <ul>
                {report.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </details>
          )}
          {!!report.skipped.length && (
            <details>
              <summary>{report.skipped.length} storage notes</summary>
              <ul>
                {report.skipped.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
