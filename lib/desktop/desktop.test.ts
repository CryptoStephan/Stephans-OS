import test from "node:test";
import assert from "node:assert/strict";
import { clampRect, modeRect, TASKBAR_HEIGHT } from "./geometry";
import { desktopReducer, EMPTY_DESKTOP } from "./reducer";
import { deserializeSession, serializeSession } from "./session";
import type { AppId, DesktopState } from "./types";

const viewport = { width: 1280, height: 800 };
const open = (state: DesktopState, id: string, app: AppId = "terminal") =>
  desktopReducer(state, { type: "open", id, app, viewport });

test("new windows cascade, gain focus, and preserve unique instances", () => {
  const first = open(EMPTY_DESKTOP, "terminal-1");
  const second = open(first, "terminal-2");
  assert.equal(second.windows.length, 2);
  assert.equal(second.activeId, "terminal-2");
  assert.equal(second.windows[1].rect.x, first.windows[0].rect.x + 28);
  assert.equal(first.windows.length, 1, "updates do not mutate prior states");
});

test("focusing an older window brings it to front without duplicating it", () => {
  const original = open(open(EMPTY_DESKTOP, "a"), "b");
  const focused = desktopReducer(original, { type: "focus", id: "a" });
  assert.deepEqual(
    focused.windows.map((entry) => entry.id),
    ["b", "a"],
  );
  assert.equal(focused.activeId, "a");
});

test("minimize and close choose the next visible window; focus restores", () => {
  let state = open(open(EMPTY_DESKTOP, "a"), "b");
  state = desktopReducer(state, { type: "minimize", id: "b" });
  assert.equal(state.activeId, "a");
  state = desktopReducer(state, { type: "focus", id: "b" });
  assert.equal(state.activeId, "b");
  assert.equal(state.windows[1].minimized, false);
  state = desktopReducer(state, { type: "close", id: "b" });
  assert.equal(state.activeId, "a");
  state = desktopReducer(state, { type: "close", id: "a" });
  assert.equal(state.activeId, null);
});

test("maximize and restore retain the normal rectangle", () => {
  const first = open(EMPTY_DESKTOP, "a");
  const maximized = desktopReducer(first, {
    type: "maximize",
    id: "a",
    viewport,
  });
  assert.deepEqual(maximized.windows[0].rect, {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height - TASKBAR_HEIGHT,
  });
  const restored = desktopReducer(maximized, {
    type: "maximize",
    id: "a",
    viewport,
  });
  assert.deepEqual(restored.windows[0].rect, first.windows[0].rect);
  assert.equal(restored.windows[0].mode, "normal");
});

test("snap uses the entire work area without an odd-width gap", () => {
  const oddViewport = { width: 1001, height: 800 };
  const left = modeRect("left", oddViewport);
  const right = modeRect("right", oddViewport);
  assert.equal(left.width + right.width, 1001);
  assert.equal(right.x, left.width);
  const first = open(EMPTY_DESKTOP, "a");
  const snapped = desktopReducer(first, {
    type: "snap",
    id: "a",
    side: "right",
    viewport,
  });
  const maximized = desktopReducer(snapped, {
    type: "maximize",
    id: "a",
    viewport,
  });
  const restored = desktopReducer(maximized, {
    type: "maximize",
    id: "a",
    viewport,
  });
  assert.deepEqual(
    restored.windows[0].rect,
    first.windows[0].rect,
    "snapping does not erase the normal rectangle",
  );
});

test("singleton launch updates its document and restores its existing ID", () => {
  let state = open(EMPTY_DESKTOP, "settings-1", "settings");
  state = desktopReducer(state, { type: "minimize", id: "settings-1" });
  state = desktopReducer(state, {
    type: "open",
    id: "unused",
    app: "settings",
    options: { singleton: true, path: "/home/user" },
    viewport,
  });
  assert.equal(state.windows.length, 1);
  assert.equal(state.activeId, "settings-1");
  assert.equal(state.windows[0].path, "/home/user");
  assert.equal(state.windows[0].minimized, false);
});

test("moving a maximized window restores its size and clamps its position", () => {
  const first = open(EMPTY_DESKTOP, "a");
  const maximized = desktopReducer(first, {
    type: "maximize",
    id: "a",
    viewport,
  });
  const moved = desktopReducer(maximized, {
    type: "move",
    id: "a",
    x: -100,
    y: 5000,
    viewport,
  });
  assert.equal(moved.windows[0].mode, "normal");
  assert.equal(moved.windows[0].rect.width, first.windows[0].rect.width);
  assert.equal(moved.windows[0].rect.x, 0);
  assert.equal(
    moved.windows[0].rect.y + moved.windows[0].rect.height,
    viewport.height - TASKBAR_HEIGHT,
  );
});

test("small screens constrain dimensions below desktop minimums", () => {
  const small = { width: 280, height: 240 };
  const rect = clampRect({ x: 90, y: 80, width: 820, height: 560 }, small);
  assert.deepEqual(rect, { x: 0, y: 0, width: 280, height: 188 });
  const shrunk = desktopReducer(open(EMPTY_DESKTOP, "a"), {
    type: "viewport",
    viewport: small,
  });
  assert.deepEqual(shrunk.windows[0].rect, rect);
});

test("show desktop keeps sessions alive while clearing focus", () => {
  const state = desktopReducer(open(open(EMPTY_DESKTOP, "a"), "b"), {
    type: "showDesktop",
  });
  assert.equal(state.activeId, null);
  assert.equal(state.windows.length, 2);
  assert.ok(state.windows.every((entry) => entry.minimized));
});

test("session round trip preserves windows, focus, and document paths", () => {
  const state = desktopReducer(EMPTY_DESKTOP, {
    type: "open",
    id: "editor-1",
    app: "editor",
    options: { path: "/home/user/Documents/notes.txt" },
    viewport,
  });
  assert.deepEqual(
    deserializeSession(serializeSession(state), viewport),
    state,
  );
});

test("session restore rejects malformed apps, duplicate IDs and invalid rectangles", () => {
  const valid = open(EMPTY_DESKTOP, "valid").windows[0];
  const json = JSON.stringify({
    version: 2,
    activeId: "missing",
    windows: [
      valid,
      { ...valid },
      { ...valid, id: "bad-app", app: "script" },
      {
        ...valid,
        id: "bad-rect",
        rect: { x: 0, y: 0, width: -10, height: 300 },
      },
    ],
  });
  const result = deserializeSession(json, viewport);
  assert.equal(result.windows.length, 1);
  assert.equal(result.activeId, "valid");
  assert.deepEqual(deserializeSession("{broken", viewport), EMPTY_DESKTOP);
  assert.deepEqual(
    deserializeSession('{"version":1,"windows":[]}', viewport),
    EMPTY_DESKTOP,
  );
});

test("restored layouts are clamped to a changed monitor and minimized focus is repaired", () => {
  const normal = open(EMPTY_DESKTOP, "a");
  const minimized = desktopReducer(normal, { type: "minimize", id: "a" });
  const restored = deserializeSession(
    serializeSession({ ...minimized, activeId: "a" }),
    { width: 400, height: 400 },
  );
  assert.equal(restored.activeId, null);
  assert.equal(restored.windows[0].rect.width, 400);
  assert.equal(restored.windows[0].rect.height, 348);
});
