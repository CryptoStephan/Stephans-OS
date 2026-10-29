"use client";

import { Editor } from "./Editor";
import { Files } from "./Files";
import { Terminal } from "./Terminal";
import type { AppContentProps } from "./shared";

export type { AppContentProps } from "./shared";
export const AppContent = ({
  app,
  path,
  windowId,
  onOpen,
  onPathChange,
}: AppContentProps) => {
  if (app === "terminal")
    return <Terminal path={path} onPathChange={onPathChange} />;
  if (app === "files")
    return <Files path={path} onOpen={onOpen} onPathChange={onPathChange} />;
  if (app === "editor")
    return (
      <Editor path={path} windowId={windowId} onPathChange={onPathChange} />
    );
  return null;
};
