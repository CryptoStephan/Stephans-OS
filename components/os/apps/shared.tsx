"use client";

import { AlertCircle, X } from "lucide-react";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export const parentPath = (path: string): string =>
  path.slice(0, path.lastIndexOf("/")) || "/";
export const joinPath = (path: string, name: string): string =>
  `${path === "/" ? "" : path}/${name}`;
export const basename = (path: string): string =>
  path.split("/").filter(Boolean).pop() || "/";
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const AppError = ({
  message,
  dismiss,
}: {
  message: string;
  dismiss?: () => void;
}) =>
  message ? (
    <div className="os-app-error" role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
      {dismiss && (
        <button aria-label="Dismiss error" onClick={dismiss}>
          <X size={15} />
        </button>
      )}
    </div>
  ) : null;

export interface AppContentProps {
  app: string;
  path?: string;
  windowId?: string;
  onPathChange?: (path: string) => void;
  onOpen: (app: string, path?: string) => void;
}
