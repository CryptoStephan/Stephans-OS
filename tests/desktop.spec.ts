import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const terminalWindow = (page: Page) =>
  page.getByRole("region", { name: "Terminal window", exact: true });
const filesWindow = (page: Page) =>
  page.getByRole("region", { name: "Files window", exact: true });

const run = async (terminal: Locator, command: string) => {
  const input = terminal.getByRole("textbox", {
    name: "Terminal command",
    exact: true,
  });
  await expect(input).toBeEnabled();
  await input.fill(command);
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
};

const output = (terminal: Locator) =>
  terminal.getByRole("log", { name: "Terminal output" });
const stdout = (terminal: Locator) => output(terminal).locator(".is-stdout");
const fileItem = (files: Locator, name: string) =>
  files
    .getByRole("listitem")
    .filter({
      has: files
        .page()
        .locator(".os-app-file-name", {
          hasText: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
        }),
    });

/** Use the same typed RPC boundary as the apps for filesystem edge cases. */
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
        const id = `playwright-${crypto.randomUUID()}`;
        const timer = setTimeout(() => {
          window.removeEventListener("message", listener);
          reject(new Error(`${method} RPC timeout`));
        }, 20_000);
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
          else resolve(event.data.value);
        };
        window.addEventListener("message", listener);
        frame.contentWindow.postMessage(
          { channel: "stephans-os:lotw", id, method, args },
          location.origin,
        );
      }),
    { method, args },
  ) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.locator('.os-storage-dot[title="Workspace ready"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(filesWindow(page)).toBeVisible();
  await expect(
    filesWindow(page).getByRole("list", { name: "Files", exact: true }),
  ).toBeVisible();
});

test("real LOTW shell, Files and Editor share space-named files, pipelines and links across reload", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Launch Terminal", exact: true })
    .click();
  let terminal = terminalWindow(page);
  await run(terminal, 'echo alpha > "qa notes.txt"');
  await run(terminal, 'echo beta >> "qa notes.txt"');
  await run(terminal, 'cat "qa notes.txt" | grep beta > filtered.txt');
  await run(terminal, "cat filtered.txt");
  await expect(stdout(terminal).last()).toHaveText("beta");
  await run(terminal, 'ln -s "/home/me/qa notes.txt" "/home/me/qa alias.txt"');
  await run(terminal, 'cat "qa alias.txt"');
  await expect(stdout(terminal).last()).toContainText("beta");
  await expect(output(terminal).locator(".is-error")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Switch to Files", exact: true })
    .click();
  const files = filesWindow(page);
  await expect(fileItem(files, "qa notes.txt")).toBeVisible();
  await fileItem(files, "qa notes.txt").dblclick();
  const editor = page.getByRole("region", {
    name: "Text Editor window",
    exact: true,
  });
  const content = editor.getByRole("textbox", { name: "Document content" });
  await expect(content).toHaveValue(/alpha\nbeta/);
  await content.fill("edited in the graphical editor\n");
  await content.press("Control+s");
  await expect(
    editor.getByText("Saved to this browser", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Switch to Terminal", exact: true })
    .click();
  await run(terminal, 'cat "qa alias.txt"');
  await expect(stdout(terminal).last()).toHaveText(
    "edited in the graphical editor",
  );

  await page.reload();
  await expect(
    page.locator('.os-storage-dot[title="Workspace ready"]'),
  ).toBeVisible({ timeout: 30_000 });
  terminal = terminalWindow(page);
  await expect(terminal).toBeVisible();
  await run(terminal, 'cat "qa notes.txt"');
  await expect(stdout(terminal).last()).toHaveText(
    "edited in the graphical editor",
  );
  await run(terminal, 'cat "qa alias.txt"');
  await expect(stdout(terminal).last()).toHaveText(
    "edited in the graphical editor",
  );
  const input = terminal.getByRole("textbox", { name: "Terminal command" });
  await input.press("ArrowUp");
  await expect(input).toHaveValue('cat "qa alias.txt"');
});

test("Files creates and renames a document and launches a terminal in that folder", async ({
  page,
}) => {
  const files = filesWindow(page);
  await files.getByRole("button", { name: "New folder", exact: true }).click();
  let dialog = files.getByRole("dialog", { name: "folder item" });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("qa folder");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await fileItem(files, "qa folder").dblclick();
  await files.getByRole("button", { name: "New file", exact: true }).click();
  dialog = files.getByRole("dialog", { name: "file item" });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("empty.txt");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(fileItem(files, "empty.txt")).toBeVisible();
  await fileItem(files, "empty.txt").click();
  await files.getByRole("button", { name: "Rename selected item" }).click();
  dialog = files.getByRole("dialog", { name: "rename item" });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("renamed notes.txt");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(fileItem(files, "renamed notes.txt")).toBeVisible();
  await expect(fileItem(files, "empty.txt")).toHaveCount(0);
  await fileItem(files, "renamed notes.txt").dblclick();
  const editor = page.getByRole("region", {
    name: "Text Editor window",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Document content" })
    .fill("created by the desktop");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    editor.getByText("Saved to this browser", { exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Close Text Editor", exact: true })
    .click();
  await files.getByRole("button", { name: "Open terminal here" }).click();
  const terminal = terminalWindow(page);
  await run(terminal, "pwd");
  await expect(stdout(terminal).last()).toHaveText("/home/me/qa folder");
  await run(terminal, 'cat "renamed notes.txt"');
  await expect(stdout(terminal).last()).toHaveText("created by the desktop");
});

test("filesystem links, empty hard links, recursive folders, copy and rename retain data", async ({
  page,
}) => {
  await rpc(page, "writeFile", ["/home/me/empty source.txt", ""]);
  await rpc(page, "link", [
    "/home/me/empty source.txt",
    "/home/me/hard link.txt",
    { symbolic: false },
  ]);
  await rpc(page, "writeFile", ["/home/me/hard link.txt", "shared inode"]);
  expect(await rpc(page, "readText", ["/home/me/empty source.txt"])).toBe(
    "shared inode",
  );
  await rpc(page, "link", [
    "/home/me/empty source.txt",
    "/home/me/soft link.txt",
    { symbolic: true },
  ]);
  await rpc(page, "remove", ["/home/me/soft link.txt"]);
  expect(await rpc(page, "readText", ["/home/me/empty source.txt"])).toBe(
    "shared inode",
  );
  await rpc(page, "remove", ["/home/me/empty source.txt"]);
  expect(await rpc(page, "readText", ["/home/me/hard link.txt"])).toBe(
    "shared inode",
  );

  const shell = await rpc<{ code: number; output: unknown[] }>(
    page,
    "execute",
    [
      'mkdir -p "/home/me/nested dir/inner"',
      { sessionId: "filesystem-tests", cwd: "/home/me" },
    ],
  );
  expect(shell.code, JSON.stringify(shell.output)).toBe(0);
  await rpc(page, "writeFile", [
    "/home/me/nested dir/inner/source.txt",
    "preserved through copy and move",
  ]);
  await rpc(page, "copy", [
    "/home/me/nested dir/inner/source.txt",
    "/home/me/nested dir/inner/copy.txt",
  ]);
  await rpc(page, "move", [
    "/home/me/nested dir/inner/copy.txt",
    "/home/me/nested dir/renamed.txt",
  ]);
  expect(await rpc(page, "readText", ["/home/me/nested dir/renamed.txt"])).toBe(
    "preserved through copy and move",
  );
  await rpc(page, "remove", ["/home/me/nested dir", { recursive: true }]);
  await expect(rpc(page, "stat", ["/home/me/nested dir"])).rejects.toThrow();
});

test("binary host imports avoid overwrites and download byte-for-byte after reload", async ({
  page,
}) => {
  const bytes = Buffer.from([0, 255, 128, 1, 10, 13, 240, 159, 146, 190]);
  let files = filesWindow(page);
  const hostFile = {
    name: "binary data.bin",
    mimeType: "application/octet-stream",
    buffer: bytes,
  };
  await files.locator('input[type="file"]').setInputFiles(hostFile);
  await expect(fileItem(files, "binary data.bin")).toBeVisible();
  await files.locator('input[type="file"]').setInputFiles(hostFile);
  await expect(fileItem(files, "binary data (1).bin")).toBeVisible();
  await page.reload();
  await expect(
    page.locator('.os-storage-dot[title="Workspace ready"]'),
  ).toBeVisible({ timeout: 30_000 });
  files = filesWindow(page);
  await fileItem(files, "binary data.bin").click();
  const downloading = page.waitForEvent("download");
  await files.getByRole("button", { name: "Download selected file" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("binary data.bin");
  const downloaded = await download.path();
  expect(downloaded).toBeTruthy();
  expect(await readFile(downloaded!)).toEqual(bytes);
});

test("window controls minimize, restore, snap, resize and persist desktop layout", async ({
  page,
}) => {
  const files = filesWindow(page);
  const original = await files.boundingBox();
  expect(original).not.toBeNull();
  await files
    .getByRole("button", { name: "Minimize Files", exact: true })
    .click();
  await expect(files).toBeHidden();
  await page
    .getByRole("button", { name: "Switch to Files", exact: true })
    .click();
  await expect(files).toBeVisible();
  await files
    .getByRole("button", { name: "Snap Files left", exact: true })
    .click();
  await expect.poll(async () => (await files.boundingBox())?.x).toBe(0);
  await expect.poll(async () => (await files.boundingBox())?.width).toBe(720);
  await files
    .getByRole("button", { name: "Snap Files right", exact: true })
    .click();
  await expect.poll(async () => (await files.boundingBox())?.x).toBe(720);
  await files
    .getByRole("button", { name: "Maximize Files", exact: true })
    .click();
  await expect.poll(async () => (await files.boundingBox())?.width).toBe(1440);
  await files
    .getByRole("button", { name: "Maximize Files", exact: true })
    .click();
  await expect
    .poll(async () => (await files.boundingBox())?.width)
    .toBe(original!.width);
  const handle = await files.locator(".os-resize-se").boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 + 70,
    handle!.y + handle!.height / 2 + 40,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await files.boundingBox())?.width)
    .toBe(original!.width + 70);
  await page.reload();
  await expect(filesWindow(page)).toBeVisible();
  await expect
    .poll(async () => (await filesWindow(page).boundingBox())?.width)
    .toBe(original!.width + 70);
});
