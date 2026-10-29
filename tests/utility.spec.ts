import { test, expect, type Page, type Locator } from "@playwright/test";

const ready = async (page: Page) => {
  await expect(
    page.locator('.os-storage-dot[title="Workspace ready"]'),
  ).toHaveCount(1, { timeout: 30_000 });
};
const launch = async (page: Page, name: string) => {
  await page
    .getByRole("button", { name: "Open application launcher", exact: true })
    .click();
  const launcher = page.getByRole("region", {
    name: "Application launcher",
    exact: true,
  });
  await launcher
    .getByRole("textbox", { name: "Search applications" })
    .fill(name);
  await launcher.getByRole("button", { name, exact: true }).click();
  const app = page.getByRole("region", { name: `${name} window`, exact: true });
  await expect(app).toBeVisible();
  return app;
};
const inViewport = async (locator: Locator, page: Page) => {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
});

test("launcher filters applications and wallpaper preference survives reload", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Open application launcher", exact: true })
    .click();
  const launcher = page.getByRole("region", { name: "Application launcher" });
  const search = launcher.getByRole("textbox", { name: "Search applications" });
  await search.fill("calc");
  await expect(launcher.locator(".os-launcher-grid button")).toHaveCount(1);
  await expect(
    launcher.getByRole("button", { name: "Calculator", exact: true }),
  ).toBeVisible();
  await search.fill("does not exist");
  await expect(launcher.locator(".os-launcher-grid button")).toHaveCount(0);
  await search.press("Escape");
  await expect(launcher).toBeHidden();
  const settings = await launch(page, "Settings");
  await settings.getByRole("button", { name: "forest", exact: true }).click();
  await expect(page.locator("main.os-desktop")).toHaveClass(/wallpaper-forest/);
  await page.reload();
  await ready(page);
  await expect(page.locator("main.os-desktop")).toHaveClass(/wallpaper-forest/);
  await expect(
    page
      .getByRole("region", { name: "Settings window" })
      .getByRole("button", { name: "forest", exact: true }),
  ).toHaveClass(/selected/);
});

test("calendar notes persist in the shared filesystem and deletion persists", async ({
  page,
}) => {
  let calendar = await launch(page, "Calendar");
  const title = "QA calendar note";
  await calendar.getByRole("textbox", { name: "Event title" }).fill(title);
  await calendar.getByRole("button", { name: "Add calendar event" }).click();
  await expect(
    calendar.locator(".os-event").getByText(title, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  calendar = page.getByRole("region", { name: "Calendar window", exact: true });
  await expect(
    calendar.locator(".os-event").getByText(title, { exact: true }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(
    calendar.locator(".os-event").getByText(title, { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("region", { name: "Calendar window" }).locator(".os-event"),
  ).toHaveCount(0);
});

test("calculator handles divide by zero and recovers for decimal arithmetic", async ({
  page,
}) => {
  const calculator = await launch(page, "Calculator");
  for (const key of ["8", "÷", "0", "="])
    await calculator.getByRole("button", { name: key, exact: true }).click();
  await expect(calculator.locator("output")).toHaveText("Error");
  for (const key of ["C", "1", ".", "5", "+", "2", ".", "5", "="])
    await calculator.getByRole("button", { name: key, exact: true }).click();
  await expect(calculator.locator("output")).toHaveText("4");
  await calculator.locator(".os-calculator").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.type("9/3");
  await page.keyboard.press("Enter");
  await expect(calculator.locator("output")).toHaveText("3");
});

test("memory game cannot pair a card with itself and restart cancels pending pairs", async ({
  page,
}) => {
  const memory = await launch(page, "Memory Game");
  const first = memory.getByRole("button", {
    name: "Reveal card 1",
    exact: true,
  });
  await first.dblclick();
  await expect(memory.locator(".os-memory-grid .flipped")).toHaveCount(1);
  await expect(memory.locator(".os-memory-grid button").first()).toBeDisabled();
  await expect(
    memory.getByText("0 moves · 0/8 pairs", { exact: true }),
  ).toBeVisible();
  await memory
    .getByRole("button", { name: "Reveal card 2", exact: true })
    .click();
  await expect(memory.locator(".os-memory-grid button:disabled")).toHaveCount(
    16,
  );
  await expect(
    memory.getByText("1 moves · 0/8 pairs", { exact: true }),
  ).toBeVisible();
  await memory
    .getByRole("button", { name: "Start again", exact: true })
    .click();
  await expect(
    memory.getByRole("button", { name: /^Reveal card / }),
  ).toHaveCount(16);
  await expect(memory.locator(".os-memory-grid button:disabled")).toHaveCount(
    0,
  );
  await expect(
    memory.getByText("0 moves · 0/8 pairs", { exact: true }),
  ).toBeVisible();
});

test("weather uses forecast response and exposes city lookup failures", async ({
  page,
}) => {
  await page.route(
    "https://geocoding-api.open-meteo.com/v1/search?**",
    async (route) => {
      const query = new URL(route.request().url()).searchParams.get("name");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          query === "Missing"
            ? { results: [] }
            : {
                results: [
                  {
                    name: "Ithaca",
                    country_code: "US",
                    latitude: 42.44,
                    longitude: -76.5,
                  },
                ],
              },
        ),
      });
    },
  );
  await page.route("https://api.open-meteo.com/v1/forecast?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        current: {
          temperature_2m: 53.4,
          weather_code: 3,
          wind_speed_10m: 7.2,
          time: "2026-10-28T14:15",
        },
      }),
    }),
  );
  const weather = await launch(page, "Weather");
  await weather.getByRole("textbox", { name: "Weather city" }).fill("Ithaca");
  await weather.getByRole("button", { name: "Get weather" }).click();
  await expect(
    weather.getByRole("heading", { name: "Ithaca, US" }),
  ).toBeVisible();
  await expect(weather.locator("strong")).toHaveText("53°F");
  await expect(
    weather.getByText("Partly cloudy · Wind 7.2 mph", { exact: true }),
  ).toBeVisible();
  await weather.getByRole("textbox", { name: "Weather city" }).fill("Missing");
  await weather.getByRole("button", { name: "Get weather" }).click();
  await expect(weather.getByRole("alert")).toHaveText(
    "No matching city found.",
  );
  await expect(
    weather.getByRole("heading", { name: "Ithaca, US" }),
  ).toHaveCount(0);
});

test("legacy import preserves source OPFS bytes and reconstructs localStorage files without overwriting", async ({
  page,
}) => {
  const legacySnapshot = JSON.stringify([
    { id: "old-folder", name: "Old docs", type: "folder" },
    {
      id: "old-file",
      parent: "old-folder",
      name: "old.txt",
      type: "file",
      content: "preserve me",
    },
  ]);
  await page.evaluate(async (snapshot) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle("legacy-folder", {
      create: true,
    });
    const source = await folder.getFileHandle("binary.bin", { create: true });
    const writer = await source.createWritable();
    await writer.write(new Uint8Array([0, 255, 1, 128]));
    await writer.close();
    localStorage.setItem("filesystemData", snapshot);
  }, legacySnapshot);
  const settings = await launch(page, "Settings");
  await settings
    .getByRole("button", { name: "Import old desktop files", exact: true })
    .click();
  await expect(
    settings.getByText("Import complete", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText("/home/me/Imported from old desktop", { exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(async () => {
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Persistent filesystem engine"]',
    )!;
    const request = (method: string, args: unknown[]) =>
      new Promise<unknown>((resolve, reject) => {
        const id = `legacy-check-${crypto.randomUUID()}`;
        const timer = setTimeout(() => {
          window.removeEventListener("message", listener);
          reject(new Error("RPC timed out"));
        }, 15_000);
        const listener = (event: MessageEvent) => {
          if (
            event.origin !== location.origin ||
            event.source !== frame.contentWindow ||
            event.data?.channel !== "stephans-os:lotw" ||
            event.data.type !== "result" ||
            event.data.id !== id
          )
            return;
          clearTimeout(timer);
          window.removeEventListener("message", listener);
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.value);
        };
        window.addEventListener("message", listener);
        frame.contentWindow!.postMessage(
          { channel: "stephans-os:lotw", id, method, args },
          location.origin,
        );
      });
    const prefix = "/home/me/Imported from old desktop";
    const binary = (await request("readFile", [
      `${prefix}/OPFS/legacy-folder/binary.bin`,
    ])) as Uint8Array;
    const text = await request("readText", [
      `${prefix}/Local storage/Files/Old docs/old.txt`,
    ]);
    const snapshot = await request("readText", [
      `${prefix}/Local storage/Original snapshots/filesystemData.json`,
    ]);
    const root = await navigator.storage.getDirectory();
    const original = await (
      await (
        await root.getDirectoryHandle("legacy-folder")
      ).getFileHandle("binary.bin")
    ).getFile();
    return {
      binary: Array.from(binary),
      text,
      snapshot,
      original: Array.from(new Uint8Array(await original.arrayBuffer())),
      originalSnapshot: localStorage.getItem("filesystemData"),
    };
  });
  expect(data).toEqual({
    binary: [0, 255, 1, 128],
    text: "preserve me",
    snapshot: legacySnapshot,
    original: [0, 255, 1, 128],
    originalSnapshot: legacySnapshot,
  });
  await settings
    .getByRole("button", { name: "Import old desktop files", exact: true })
    .click();
  await expect(
    settings.getByText("/home/me/Imported from old desktop (2)", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    settings.getByText("Import complete", { exact: true }),
  ).toBeVisible();
});

test("390px viewport supports file creation, terminal commands and reachable window controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const files = page.getByRole("region", { name: "Files window", exact: true });
  await inViewport(files, page);
  const newFile = files.getByRole("button", { name: "New file", exact: true });
  await inViewport(newFile, page);
  await newFile.click();
  const dialog = files.getByRole("dialog", { name: "file item" });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("phone notes.txt");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    files.getByRole("listitem").filter({ hasText: "phone notes.txt" }),
  ).toBeVisible();
  await files
    .getByRole("button", { name: "Minimize Files", exact: true })
    .click();
  await expect(files).toBeHidden();
  await page
    .getByRole("button", { name: "Launch Terminal", exact: true })
    .click();
  const terminal = page.getByRole("region", {
    name: "Terminal window",
    exact: true,
  });
  await inViewport(terminal, page);
  const input = terminal.getByRole("textbox", { name: "Terminal command" });
  await expect(input).toBeEnabled();
  await input.fill('echo mobile > "phone notes.txt"');
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
  await input.fill('cat "phone notes.txt"');
  await input.press("Enter");
  await expect(
    terminal.getByRole("log").locator(".is-stdout").last(),
  ).toHaveText("mobile");
  await inViewport(
    terminal.getByRole("button", { name: "Close Terminal", exact: true }),
    page,
  );
  await terminal
    .getByRole("button", { name: "Close Terminal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to Files", exact: true })
    .click();
  await expect(files).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
