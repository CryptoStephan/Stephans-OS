"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Download,
  FolderOpen,
  Globe2,
  HardDrive,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
import { lotw, HOME, type FsEntry } from "@/lib/lotw/client";
import { LegacyImport } from "./apps/LegacyImport";
import type { AppId } from "@/lib/desktop";

type Props = {
  app: AppId;
  wallpaper: string;
  onWallpaper: (name: string) => void;
  onOpen: (app: AppId, path?: string) => void;
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`;

function Settings({
  wallpaper,
  onWallpaper,
  onOpen,
}: Pick<Props, "wallpaper" | "onWallpaper" | "onOpen">) {
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>(
    {},
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    lotw
      .storage()
      .then(setStorage)
      .catch((e) => setMessage(errorText(e)));
  }, []);
  const protect = async () => {
    try {
      setMessage(
        (await navigator.storage.persist())
          ? "Persistent storage granted by your browser."
          : "Your browser has not granted persistent storage. You can still download important files.",
      );
    } catch (e) {
      setMessage(errorText(e));
    }
  };
  return (
    <div className="os-utility os-settings">
      <span className="os-eyebrow">MAKE IT YOURS</span>
      <h2>A place that feels like you.</h2>
      <p className="os-muted">Your preferences stay on this device.</p>
      <h3>Desktop appearance</h3>
      <div className="os-wallpaper-options">
        {["dusk", "forest", "midnight"].map((name) => (
          <button
            key={name}
            className={`wallpaper-${name} ${wallpaper === name ? "selected" : ""}`}
            onClick={() => onWallpaper(name)}
          >
            <span>{name}</span>
            {wallpaper === name && <Check size={17} />}
          </button>
        ))}
      </div>
      <h3>
        <HardDrive size={18} /> Local storage
      </h3>
      <div className="os-storage-card">
        <strong>
          {size(storage.usage || 0)} <small>used on this origin</small>
        </strong>
        <progress max={storage.quota || 1} value={storage.usage || 0} />
        <p>
          {storage.quota
            ? `${size(storage.quota)} estimated browser quota`
            : "Reading browser quota…"}
        </p>
        <button className="os-button" onClick={protect}>
          <ShieldCheck size={15} />
          Request persistent storage
        </button>
      </div>
      <p className="os-muted">
        Files live in this browser’s storage for this site. Clearing site data
        removes them. Download important work from Files.
      </p>
      <h3>Bring your old files along</h3>
      <LegacyImport onOpen={(app, path) => onOpen(app as AppId, path)} />
      <h3>Keyboard shortcuts</h3>
      <div className="os-shortcuts">
        <span>Open Terminal</span>
        <kbd>Ctrl Alt T</kbd>
        <span>Open Files</span>
        <kbd>Ctrl Alt E</kbd>
        <span>Find an application</span>
        <kbd>Ctrl Space</kbd>
        <span>Save a document</span>
        <kbd>Ctrl S</kbd>
        <span>Close active window</span>
        <kbd>Alt F4</kbd>
      </div>
      {message && (
        <p className="os-inline-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function About({ onOpen }: Pick<Props, "onOpen">) {
  return (
    <div className="os-utility os-about">
      <div className="os-about-logo">s.</div>
      <span className="os-eyebrow">A PERSONAL INTERNET</span>
      <h2>Hi, I’m Stephan.</h2>
      <p>
        I’m a Cornell University student who loves technology and thoughtful
        interfaces. This is my digital workspace: a little desktop you can
        explore, write in, and make your own.
      </p>
      <div className="os-about-actions">
        <button
          className="os-button primary"
          onClick={() => onOpen("terminal")}
        >
          <Terminal size={16} />
          Try the terminal
        </button>
        <a
          className="os-button"
          href="https://github.com/CryptoStephan/Stephans-OS"
          target="_blank"
          rel="noopener noreferrer"
        >
          View the source
          <ArrowUpRight size={15} />
        </a>
      </div>
      <hr />
      <h3>Built on good ideas.</h3>
      <p>
        Powered by the real{" "}
        <a
          href="https://github.com/linuxontheweb/linuxontheweb.github.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Linux on the Web
        </a>{" "}
        filesystem and shell, with window behavior adapted from Dustin Brett’s{" "}
        <a
          href="https://github.com/DustinBrett/daedalOS"
          target="_blank"
          rel="noopener noreferrer"
        >
          daedalOS
        </a>
        .
      </p>
      <div className="os-about-facts">
        <span>
          Persistent files<small>OPFS + IndexedDB</small>
        </span>
        <span>
          A programmable shell<small>Pipes, scripts & links</small>
        </span>
        <span>
          A familiar desktop<small>Your windows, your way</small>
        </span>
      </div>
      <p className="os-muted">
        Stephan’s OS · 0.2 · An evolving browser desktop
      </p>
    </div>
  );
}

function Browser() {
  const [address, setAddress] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const url = history[index];
  const navigate = (input: string) => {
    try {
      const target = new URL(
        input.includes("://") ? input : `https://${input}`,
      );
      if (!["http:", "https:"].includes(target.protocol))
        throw new Error("Please use an http or https address.");
      setHistory((prev) => [...prev.slice(0, index + 1), target.href]);
      setIndex(index + 1);
      setAddress(target.href);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="os-browser">
      <form
        className="os-browser-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(address);
        }}
      >
        <button
          type="button"
          aria-label="Back"
          disabled={index <= 0}
          onClick={() => {
            setIndex(index - 1);
            setAddress(history[index - 1]);
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={index >= history.length - 1}
          onClick={() => {
            setIndex(index + 1);
            setAddress(history[index + 1]);
          }}
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-label="Reload page"
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={15} />
        </button>
        <input
          aria-label="Website address"
          placeholder="Enter a website address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit" aria-label="Go to website">
          <ChevronRight size={18} />
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in a new tab"
          >
            <ArrowUpRight size={17} />
          </a>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {url ? (
        <>
          <div className="os-browser-notice">
            Some websites block embedding.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open this page in a new tab ↗
            </a>
          </div>
          <iframe
            key={`${index}-${reload}`}
            title={url}
            src={url}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
          />
        </>
      ) : (
        <div className="os-browser-home">
          <Globe2 size={46} strokeWidth={1} />
          <span className="os-eyebrow">A WINDOW TO THE WEB</span>
          <h2>Where to next?</h2>
          <p className="os-muted">
            Enter an address above or explore a project below.
          </p>
          <div>
            {[
              ["Stephan on GitHub", "https://github.com/CryptoStephan"],
              ["Linux on the Web", "https://linuxontheweb.github.io/"],
              ["daedalOS", "https://dustinbrett.com/"],
            ].map(([name, href]) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {name}
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Calculator() {
  const [display, setDisplay] = useState("0"),
    [stored, setStored] = useState<number | null>(null),
    [operator, setOperator] = useState(""),
    [fresh, setFresh] = useState(true);
  const calc = (a: number, b: number, op: string) =>
    op === "+"
      ? a + b
      : op === "−"
        ? a - b
        : op === "×"
          ? a * b
          : b === 0
            ? NaN
            : a / b;
  const press = (key: string) => {
    if (key === "C") {
      setDisplay("0");
      setStored(null);
      setOperator("");
      setFresh(true);
      return;
    }
    if (key === "⌫") {
      setDisplay((v) => (v.length > 1 ? v.slice(0, -1) : "0"));
      return;
    }
    if (key === "±") {
      setDisplay((v) => String(-Number(v)));
      return;
    }
    if (["+", "−", "×", "÷", "="].includes(key)) {
      const value = Number(display);
      const result =
        stored !== null && operator && !fresh
          ? calc(stored, value, operator)
          : value;
      setDisplay(
        Number.isFinite(result)
          ? String(Number(result.toPrecision(12)))
          : "Error",
      );
      setStored(key === "=" ? null : result);
      setOperator(key === "=" ? "" : key);
      setFresh(true);
      return;
    }
    if (key === "." && !fresh && display.includes(".")) return;
    setDisplay((v) =>
      fresh || v === "0" || v === "Error"
        ? key === "."
          ? "0."
          : key
        : v + key,
    );
    setFresh(false);
  };
  return (
    <div
      className="os-calculator"
      tabIndex={0}
      onKeyDown={(e) => {
        const map: Record<string, string> = {
          Enter: "=",
          Escape: "C",
          Backspace: "⌫",
          "*": "×",
          "/": "÷",
          "-": "−",
        };
        const k = map[e.key] || e.key;
        if (/^[0-9.+]$/.test(k) || Object.values(map).includes(k)) {
          e.preventDefault();
          press(k);
        }
      }}
    >
      <span className="os-eyebrow">STANDARD</span>
      <small>{stored !== null ? `${stored} ${operator}` : " "}</small>
      <output>{display}</output>
      <div>
        {[
          "C",
          "±",
          "⌫",
          "÷",
          "7",
          "8",
          "9",
          "×",
          "4",
          "5",
          "6",
          "−",
          "1",
          "2",
          "3",
          "+",
          "0",
          ".",
          "=",
        ].map((k) => (
          <button
            className={k === "=" ? "equals" : k === "0" ? "zero" : ""}
            key={k}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

type CalendarEvent = { id: string; date: string; title: string };
function Calendar() {
  const [month, setMonth] = useState(new Date()),
    [selected, setSelected] = useState(""),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const path = `${HOME}/.calendar.json`;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  useEffect(() => {
    setSelected(dateKey(new Date()));
    lotw
      .ready()
      .then(async () => {
        const entries = await lotw.list(HOME);
        if (entries.some((e) => e.name === ".calendar.json")) {
          const parsed = JSON.parse(await lotw.readText(path));
          if (!Array.isArray(parsed))
            throw new Error("Calendar data must be an array.");
          setEvents(
            parsed.filter(
              (e) =>
                e &&
                typeof e.id === "string" &&
                typeof e.title === "string" &&
                typeof e.date === "string",
            ),
          );
        }
        setLoaded(true);
      })
      .catch((e) => setError(errorText(e)));
  }, [path]);
  const save = async (next: CalendarEvent[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await lotw.writeFile(path, JSON.stringify(next, null, 2));
      setEvents(next);
      setTitle("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay(),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <div className="os-utility os-calendar">
      <div className="os-calendar-heading">
        <h2>
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          aria-label="Previous month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        >
          <ChevronLeft size={18} />
        </button>
        <button
          aria-label="Next month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="os-calendar-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <small key={i}>{d}</small>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = dateKey(
            new Date(month.getFullYear(), month.getMonth(), i + 1),
          );
          return (
            <button
              className={`${selected === key ? "selected" : ""} ${key === dateKey(new Date()) ? "today" : ""}`}
              key={key}
              onClick={() => setSelected(key)}
            >
              {i + 1}
              {events.some((e) => e.date === key) && <i />}
            </button>
          );
        })}
      </div>
      <h3>
        {selected} <span className="os-muted">· Your notes</span>
      </h3>
      <form
        className="os-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim())
            void save([
              ...events,
              { id: crypto.randomUUID(), date: selected, title: title.trim() },
            ]);
        }}
      >
        <input
          disabled={saving}
          aria-label="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Something to look forward to…"
          maxLength={240}
        />
        <button
          aria-label="Add calendar event"
          disabled={!loaded || saving || !title.trim()}
        >
          <Plus size={18} />
        </button>
      </form>
      {events
        .filter((e) => e.date === selected)
        .map((e) => (
          <div className="os-event" key={e.id}>
            <span>{e.title}</span>
            <button
              disabled={saving}
              aria-label={`Delete ${e.title}`}
              onClick={() => void save(events.filter((v) => v.id !== e.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      {!events.some((e) => e.date === selected) && (
        <p className="os-muted">A little breathing room. Nothing planned.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Memory() {
  const symbols = ["✦", "☀", "✿", "☾", "♠", "⚑", "◈", "♥"];
  const [cards, setCards] = useState<string[]>([]),
    [flipped, setFlipped] = useState<number[]>([]),
    [matched, setMatched] = useState<number[]>([]),
    [moves, setMoves] = useState(0),
    [best, setBest] = useState<number | null>(null);
  const reset = () => {
    const next = [...symbols, ...symbols];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setCards(next);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
  };
  useEffect(() => {
    reset();
    try {
      const saved = Number(localStorage.getItem("stephos.memory.best"));
      if (saved > 0) setBest(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const timer = setTimeout(() => {
      if (cards[a] === cards[b]) setMatched((m) => [...m, a, b]);
      setFlipped([]);
    }, 700);
    return () => clearTimeout(timer);
  }, [flipped, cards]);
  useEffect(() => {
    if (matched.length === 16 && (best === null || moves < best)) {
      setBest(moves);
      try {
        localStorage.setItem("stephos.memory.best", String(moves));
      } catch {}
    }
  }, [matched.length, moves, best]);
  return (
    <div className="os-utility os-memory">
      <span className="os-eyebrow">A LITTLE MENTAL STRETCH</span>
      <h2>
        {matched.length === 16 ? "Nicely matched." : "Find your other half."}
      </h2>
      <p className="os-muted">
        {moves} moves · {matched.length / 2}/8 pairs
        {best !== null ? ` · Best: ${best}` : ""}
      </p>
      <div className="os-memory-grid">
        {cards.map((card, i) => (
          <button
            key={i}
            className={
              matched.includes(i)
                ? "matched"
                : flipped.includes(i)
                  ? "flipped"
                  : ""
            }
            aria-label={
              matched.includes(i) || flipped.includes(i)
                ? `Card ${i + 1}: ${card}`
                : `Reveal card ${i + 1}`
            }
            disabled={
              flipped.length === 2 || matched.includes(i) || flipped.includes(i)
            }
            onClick={() => {
              setFlipped((f) => [...f, i]);
              if (flipped.length === 1) setMoves((v) => v + 1);
            }}
          >
            {matched.includes(i) || flipped.includes(i) ? card : "·"}
          </button>
        ))}
      </div>
      <button className="os-button" onClick={reset}>
        <RefreshCw size={15} />
        Start again
      </button>
    </div>
  );
}

type WeatherResult = {
  name: string;
  temperature: number;
  wind: number;
  code: number;
  time: string;
};
function Weather() {
  const [city, setCity] = useState("New York"),
    [result, setResult] = useState<WeatherResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const search = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
        { signal: c.signal },
      );
      if (!geo.ok) throw new Error("City lookup unavailable. Try again later.");
      const places = await geo.json();
      const place = places.results?.[0];
      if (!place) throw new Error("No matching city found.");
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`,
        { signal: c.signal },
      );
      if (!response.ok)
        throw new Error("Weather is unavailable. Try again later.");
      const data = await response.json();
      setResult({
        name: `${place.name}, ${place.country_code}`,
        temperature: data.current.temperature_2m,
        wind: data.current.wind_speed_10m,
        code: data.current.weather_code,
        time: data.current.time,
      });
    } catch (e) {
      if (!c.signal.aborted) setError(errorText(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  const conditions = (code: number) =>
    code === 0
      ? "Clear skies"
      : code <= 3
        ? "Partly cloudy"
        : code <= 48
          ? "Foggy"
          : code <= 67
            ? "Rain"
            : code <= 77
              ? "Snow"
              : code <= 82
                ? "Rain showers"
                : code <= 86
                  ? "Snow showers"
                  : "Thunderstorms";
  return (
    <div className="os-utility os-weather">
      <span className="os-eyebrow">OUTSIDE YOUR WINDOW</span>
      <form
        className="os-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Weather city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Search a city"
        />
        <button aria-label="Get weather" disabled={busy || !city.trim()}>
          <Search size={18} />
        </button>
      </form>
      <CloudSun size={76} strokeWidth={1} />
      {busy ? (
        <p>Checking the skies…</p>
      ) : result ? (
        <>
          <h2>{result.name}</h2>
          <strong>
            {Math.round(result.temperature)}°<small>F</small>
          </strong>
          <p>
            {conditions(result.code)} · Wind {result.wind} mph
          </p>
          <small>
            Observed {result.time.replace("T", " ")} · local time at location
          </small>
        </>
      ) : (
        <>
          <h2>A change of scenery.</h2>
          <p className="os-muted">Search a city for current conditions.</p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Weather data by Open-Meteo ↗
      </a>
    </div>
  );
}

function FileSearch({ onOpen }: Pick<Props, "onOpen">) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<FsEntry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const search = async () => {
    const gen = ++generation.current;
    setBusy(true);
    setError("");
    const found: FsEntry[] = [];
    let count = 0;
    const walk = async (path: string) => {
      for (const entry of await lotw.list(path)) {
        if (gen !== generation.current) return;
        if (++count > 5000)
          throw new Error(
            "Search reached 5,000 entries. Narrow the search from Files.",
          );
        if (entry.name.toLowerCase().includes(query.toLowerCase()))
          found.push(entry);
        if (entry.type === "directory") await walk(entry.path);
      }
    };
    try {
      await walk(HOME);
      if (gen === generation.current) setResults(found);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  };
  return (
    <div className="os-utility">
      <span className="os-eyebrow">SOMEWHERE AROUND HERE</span>
      <h2>Find your files.</h2>
      <form
        className="os-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="File search"
          placeholder="Search names in your home folder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button aria-label="Search files" disabled={busy || !query.trim()}>
          <Search size={18} />
        </button>
      </form>
      <p className="os-muted">
        {busy ? "Searching…" : `${results.length} matches`}
      </p>
      <div className="os-search-results">
        {results.map((e) => (
          <button
            key={e.path}
            onClick={() => {
              const browse =
                e.type === "symlink" ||
                /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|mp3|mp4|wav|webm|woff2?|exe|wasm|bin)$/i.test(
                  e.name,
                ) ||
                e.size > 2 * 1024 * 1024;
              onOpen(
                e.type === "directory" || browse ? "files" : "editor",
                browse
                  ? e.path.slice(0, e.path.lastIndexOf("/")) || "/"
                  : e.path,
              );
            }}
          >
            <FolderOpen size={17} />
            <span>
              {e.name}
              <small>{e.path}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function UtilityApp(props: Props) {
  switch (props.app) {
    case "settings":
      return <Settings {...props} />;
    case "about":
      return <About {...props} />;
    case "browser":
      return <Browser />;
    case "calculator":
      return <Calculator />;
    case "calendar":
      return <Calendar />;
    case "memory":
      return <Memory />;
    case "weather":
      return <Weather />;
    case "search":
      return <FileSearch {...props} />;
    default:
      return null;
  }
}
