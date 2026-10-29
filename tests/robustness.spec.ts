import { test, expect, type Page } from "@playwright/test";

const rpc = async <T>(
  page: Page,
  method: string,
  args: unknown[] = [],
): Promise<T> =>
  page.evaluate(
    ({ method, args }) =>
      new Promise((resolve, reject) => {
        const frame = document.querySelector<HTMLIFrameElement>(
          'iframe[title="Persistent filesystem engine"]',
        );
        if (!frame?.contentWindow)
          return reject(new Error("Filesystem frame is missing"));
        const id = `robustness-${crypto.randomUUID()}`;
        const timer = setTimeout(() => {
          window.removeEventListener("message", listener);
          reject(new Error(`${method} RPC timeout`));
        }, 45_000);
        const listener = (event: MessageEvent) => {
          if (
            event.origin !== location.origin ||
            event.source !== frame.contentWindow ||
            event.data?.channel !== "stephans-os:lotw" ||
            event.data.id !== id ||
            event.data.type !== "result"
          )
            return;
          clearTimeout(timer);
          window.removeEventListener("message", listener);
          if (event.data.error) reject(new Error(event.data.error));
          else
            resolve(
              event.data.value instanceof Uint8Array
                ? Array.from(event.data.value)
                : event.data.value,
            );
        };
        window.addEventListener("message", listener);
        frame.contentWindow.postMessage(
          { channel: "stephans-os:lotw", id, method, args },
          location.origin,
        );
      }),
    { method, args },
  ) as Promise<T>;

const ready = async (page: Page) =>
  expect(page.locator('.os-storage-dot[title="Workspace ready"]')).toHaveCount(
    1,
    { timeout: 30_000 },
  );
const editorWindow = (page: Page) =>
  page.getByRole("region", { name: "Text Editor window", exact: true });
const openHomeFile = async (page: Page, filename: string) => {
  const files = page.getByRole("region", { name: "Files window", exact: true });
  const item = files
    .getByRole("listitem")
    .filter({ has: page.locator(".os-app-file-name", { hasText: filename }) });
  await expect(item).toBeVisible();
  await item.dblclick();
  return editorWindow(page);
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
});

test("shell files appear on Desktop, open in Editor, and icon ordering persists", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Launch Terminal", exact: true })
    .click();
  const terminal = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  const input = terminal.getByRole("textbox", { name: "Terminal command" });
  await expect(input).toBeEnabled();
  await input.fill(
    'echo "from the shell" > ~/Desktop/first.txt; echo second > ~/Desktop/second.txt',
  );
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
  const desktop = page.getByRole("group", { name: "Desktop files" });
  await expect(
    desktop.getByRole("button", { name: "Desktop first.txt", exact: true }),
  ).toBeVisible();
  await expect(
    desktop.getByRole("button", { name: "Desktop second.txt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const second = desktop.getByRole("button", {
    name: "Desktop second.txt",
    exact: true,
  });
  await second.focus();
  await second.press("Alt+ArrowUp");
  await expect(desktop.getByRole("button").first()).toHaveAttribute(
    "aria-label",
    "Desktop second.txt",
  );
  await desktop
    .getByRole("button", { name: "Desktop first.txt", exact: true })
    .dblclick();
  await expect(
    editorWindow(page).getByRole("textbox", { name: "Document content" }),
  ).toHaveValue("from the shell\n");
  await page.reload();
  await ready(page);
  await expect(
    page
      .getByRole("group", { name: "Desktop files" })
      .getByRole("button")
      .first(),
  ).toHaveAttribute("aria-label", "Desktop second.txt");
  await expect(
    editorWindow(page).getByRole("textbox", { name: "Document content" }),
  ).toHaveValue("from the shell\n");
});

test("desktop file drops preserve binary contents and choose a fresh name for collisions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const dropFile = async () => {
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([0, 255, 128, 42])], "dropped.bin", {
          type: "application/octet-stream",
        }),
      );
      return data;
    });
    await page
      .locator("main.os-desktop")
      .dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
  };
  await dropFile();
  await expect(
    page.getByRole("button", { name: "Desktop dropped.bin", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 file saved to Desktop.", { exact: true }),
  ).toBeVisible();
  await dropFile();
  await expect(
    page.getByRole("button", { name: "Desktop dropped (1).bin", exact: true }),
  ).toBeVisible();
  expect(await rpc(page, "readFile", ["/home/me/Desktop/dropped.bin"])).toEqual(
    [0, 255, 128, 42],
  );
  expect(
    await rpc(page, "readFile", ["/home/me/Desktop/dropped (1).bin"]),
  ).toEqual([0, 255, 128, 42]);
});

test("filesystem reads stay responsive during sleep and cancelling queued shell work prevents writes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Launch Terminal", exact: true })
    .click();
  const terminal = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  const input = terminal.getByRole("textbox", { name: "Terminal command" });
  await expect(input).toBeEnabled();
  await input.fill("sleep 30");
  await input.press("Enter");
  await expect(
    terminal.getByRole("button", { name: "Stop command", exact: true }),
  ).toBeVisible();
  const started = Date.now();
  const entries = await rpc<Array<{ name: string }>>(page, "list", [
    "/home/me",
  ]);
  expect(entries.some((entry) => entry.name === "Documents")).toBe(true);
  expect(Date.now() - started).toBeLessThan(4000);
  const queued = rpc<{ code: number }>(page, "execute", [
    "echo forbidden > /home/me/must-not-exist.txt",
    { sessionId: "queued-cancel", cwd: "/home/me" },
  ]);
  await rpc(page, "cancel", ["queued-cancel"]);
  await terminal
    .getByRole("button", { name: "Stop command", exact: true })
    .click();
  await expect(input).toBeEnabled();
  expect((await queued).code).toBe(130);
  await expect(
    rpc(page, "stat", ["/home/me/must-not-exist.txt"]),
  ).rejects.toThrow();
});

test("special filenames and a reset blob counter preserve previously stored data", async ({
  page,
}) => {
  await rpc(page, "writeFile", [
    "/home/me/__proto__",
    "special filename remains a file",
  ]);
  await rpc(page, "writeFile", [
    "/home/me/before-counter-reset.txt",
    "do not overwrite this data",
  ]);
  await page.evaluate(() =>
    localStorage.setItem("stephans-os-next-blob-id-v1", "100"),
  );
  await rpc(page, "writeFile", [
    "/home/me/after-counter-reset.txt",
    "new independent data",
  ]);
  expect(await rpc(page, "readText", ["/home/me/__proto__"])).toBe(
    "special filename remains a file",
  );
  expect(
    await rpc(page, "readText", ["/home/me/before-counter-reset.txt"]),
  ).toBe("do not overwrite this data");
  expect(
    await rpc(page, "readText", ["/home/me/after-counter-reset.txt"]),
  ).toBe("new independent data");
  await page.reload();
  await ready(page);
  expect(await rpc(page, "readText", ["/home/me/__proto__"])).toBe(
    "special filename remains a file",
  );
  expect(
    await rpc(page, "readText", ["/home/me/before-counter-reset.txt"]),
  ).toBe("do not overwrite this data");
});

test("the editor rejects invalid UTF-8 and cannot overwrite original binary bytes", async ({
  page,
}) => {
  await rpc(page, "writeFile", ["/home/me/disguised.txt", [255, 254, 128]]);
  const editor = await openHomeFile(page, "disguised.txt");
  await expect(editor.getByRole("alert")).toContainText("not valid UTF-8");
  await expect(
    editor.getByRole("textbox", { name: "Document content" }),
  ).toHaveAttribute("readonly", "");
  await expect(
    editor.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "Save as", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("textbox", { name: "Document content" })
    .press("Control+s");
  expect(await rpc(page, "readFile", ["/home/me/disguised.txt"])).toEqual([
    255, 254, 128,
  ]);
});

test("new document Save As records its path, keeps subsequent edits and restores after reload", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Desktop shortcuts" })
    .getByRole("button", { name: "Text Editor", exact: true })
    .dblclick();
  let editor = editorWindow(page);
  let content = editor.getByRole("textbox", { name: "Document content" });
  await content.fill("first saved version");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const saveDialog = editor.getByRole("dialog", { name: "Save document as" });
  await saveDialog
    .getByRole("textbox", { name: "Full file path" })
    .fill("/home/me/Documents/new draft.txt");
  await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saveDialog).toBeHidden();
  await expect(
    editor.getByText("Saved to this browser", { exact: true }),
  ).toBeVisible();
  await content.fill("second version with newer edits");
  await rpc(page, "writeFile", [
    "/home/me/unrelated.txt",
    "trigger a filesystem notification",
  ]);
  await expect(content).toHaveValue("second version with newer edits");
  await expect(
    editor.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await content.press("Control+s");
  await expect(
    editor.getByText("Saved to this browser", { exact: true }),
  ).toBeVisible();
  expect(
    await rpc(page, "readText", ["/home/me/Documents/new draft.txt"]),
  ).toBe("second version with newer edits");
  await page.reload();
  await ready(page);
  editor = editorWindow(page);
  content = editor.getByRole("textbox", { name: "Document content" });
  await expect(editor.locator(".os-app-editor-path")).toHaveText(
    "/home/me/Documents/new draft.txt",
  );
  await expect(content).toHaveValue("second version with newer edits");
});
