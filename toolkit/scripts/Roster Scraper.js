// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: utensils;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: hamburger;

/**
 * Maccas Roster Widget
 * Shows upcoming shifts from roster.json (written by the roster scraper),
 * plus estimated gross pay per shift and per week.
 * Display only — rescraping and alarm management live in the "Roster
 * Scraper" Shortcut, which already does this properly (deletes old
 * "Maccas Shift" alarms by name, then recreates them; Scriptable has no
 * API to delete alarms at all, so it can't replicate that, and shouldn't
 * pretend to).
 *
 * SETUP (one-time):
 *   1. Fill in GH_USER, GH_REPO, GH_PATH below.
 *   2. Run the script once inside Scriptable. It asks for a GitHub token
 *      (Contents: Read on the repo is enough — this script only reads
 *      roster.json) and stores it in the iOS Keychain.
 *   3. Add a Scriptable widget to the Home Screen and pick this script.
 *
 * Tapping the widget runs the "Roster Scraper" Shortcut directly, passing
 * "Scriptable" as its text input, via Scriptable's real CallbackURL API.
 * This does briefly switch to the Shortcuts app: there is no way for a
 * widget tap to run a Shortcut with zero app switch on iOS. That's a
 * platform limit, not something this script is failing to avoid.
 *
 * Opening the script normally inside Scriptable (not via the widget tap)
 * shows a small preview/debug menu instead.
 *
 * Sizes: small = next shift, medium = next 3, large = this + next week.
 *
 * PAY NOTES:
 *   - Gross only (no tax/super).
 *   - Assumes full rostered time is paid (no unpaid break deducted).
 *   - Public holidays are treated as normal days.
 *   - Sat + Sun both use the weekend rate.
 *   - Weekly totals cover EVERY shift in that Mon-Sun week (past + upcoming),
 *     even though only upcoming shifts are listed.
 */

// ── CONFIG ───────────────────────────────────────────────────────────
const GH_USER = "Walter-CK";
const GH_REPO = "Roster-Scraper";
const GH_PATH = "roster.json"; // path inside the repo
const KEY_TOKEN = "maccas_roster_gh_token";
const KEY_LAST_ERROR = "maccas_roster_last_fetch_error";
const SHORTCUT_NAME = "Roster Scraper"; // must match the Shortcut's exact name

// Pay (AUD)
const RATE_WEEKDAY = 13.90;
const RATE_WEEKEND = 16.68;
const LAUNDRY = 1.28; // per shift, added on top of wages

// McDonald's red/yellow, kept dark to match the rest of walterck.com.
const C = {
  bg: new Color("#0a0705"),
  bg2: new Color("#1a0f08"),
  text: new Color("#f5efe6"),
  muted: new Color("#a89a8a"),
  accent: new Color("#ffc72c"),
  today: new Color("#ffc72c"),
};

// ── TOKEN ────────────────────────────────────────────────────────────
async function getToken() {
  if (Keychain.contains(KEY_TOKEN)) return Keychain.get(KEY_TOKEN);
  const a = new Alert();
  a.title = "GitHub token";
  a.message = "Fine-grained token, Contents: Read on your roster repo. Saved to Keychain.";
  a.addSecureTextField("github_pat_...");
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.present()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set(KEY_TOKEN, t);
  return t || null;
}

// ── FETCH ────────────────────────────────────────────────────────────
async function fetchRoster(token) {
  const req = new Request(
    `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${GH_PATH}`
  );
  req.headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "scriptable-roster-widget",
  };
  const data = await req.loadJSON();
  if (req.response.statusCode !== 200) {
    throw new Error(`GitHub ${req.response.statusCode}: check token, repo, or path`);
  }
  return data;
}

// Runs the "Roster Scraper" Shortcut with "Scriptable" as its text input,
// using Scriptable's CallbackURL API (the x-callback-url bridge Shortcuts
// supports) since there's no silent/backgrounded way to trigger a Shortcut
// from a widget tap. This still switches to the Shortcuts app briefly (an
// iOS platform limit), then returns here once the Shortcut finishes and
// calls back.
async function runRosterShortcut() {
  try {
    const cb = new CallbackURL("shortcuts://x-callback-url/run-shortcut");
    cb.addParameter("name", SHORTCUT_NAME);
    cb.addParameter("input", "text");
    cb.addParameter("text", "Scriptable");
    await cb.open();
  } catch (e) {
    const a = new Alert();
    a.title = "Couldn't run Shortcut";
    a.message = `"${SHORTCUT_NAME}" -- ${String(e.message || e)}\nCheck the name matches exactly (case-sensitive), and that it's not set to require confirmation before running (that can block the x-callback-url response and cause a timeout here).`;
    a.addCancelAction("OK");
    await a.present();
  }
}

// Cache last good roster so the widget still shows something if the fetch fails.
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "maccas_roster_cache.json");
function saveCache(d) { try { fm.writeString(cachePath, JSON.stringify(d)); } catch (e) {} }
function loadCache() {
  try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; }
  catch (e) { return null; }
}

// ── PARSING ──────────────────────────────────────────────────────────
// Tolerant parser. Handles "Wednesday 30/09/26", "25/09/26", "25/09/2026",
// "2026-09-25", and times like "4:30 PM", "4:30PM", "4:30 p.m.", "16:30",
// with any weird unicode whitespace (NBSP / narrow NBSP) mixed in.
function cleanStr(t) {
  return String(t).replace(/[\u00A0\u202F\u2009\u200B]/g, " ").trim();
}

function parseDateStr(str) {
  let t = cleanStr(str).replace(/^[A-Za-z]+\s+/, ""); // strip leading weekday name
  let m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return { d: Number(m[1]), m: Number(m[2]), y };
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return null;
}

function parseTimeStr(str) {
  const t = cleanStr(str);
  const m = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp])?\.?[Mm]?\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "p";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return { h, min };
}

// "3:00" / "3:15" / 3.25 (old decimal format) -> "3hrs" / "3hrs 15m" / "1hr" / "1hr 15m".
// Singular only when the hour count itself is exactly 1.
function formatDuration(raw) {
  let totalMins;
  if (typeof raw === "number") {
    totalMins = Math.round(raw * 60);
  } else {
    const [h, m] = cleanStr(raw).split(":").map(Number);
    totalMins = h * 60 + (m || 0);
  }
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const hLabel = h === 1 ? "hr" : "hrs";
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}m`;
}

// ── PAY ──────────────────────────────────────────────────────────────
// Splits by actual minutes, so overnight shifts crossing into Sat/Sun/Mon
// get the right rate for each part.
function calcPay(start, end) {
  let wd = 0, we = 0;
  for (let t = start.getTime(); t < end.getTime(); t += 60000) {
    const d = new Date(t).getDay();
    if (d === 0 || d === 6) we++; else wd++;
  }
  return (wd / 60) * RATE_WEEKDAY + (we / 60) * RATE_WEEKEND + LAUNDRY;
}
const money = (n) => "$" + n.toFixed(2);
const total = (list) => list.reduce((a, s) => a + s.pay, 0);
// Full pay for a Mon-Sun week (ws = weekStart timestamp), past AND upcoming shifts.
const weekPay = (all, ws) => total(all.filter((s) => weekStart(s.start) === ws));

function parseShift(s) {
  const dt = parseDateStr(s.date);
  const st = parseTimeStr(s.start);
  const en = parseTimeStr(s.end);
  if (!dt || !st || !en) {
    return { bad: true, raw: `${s.date} | ${s.start} | ${s.end}` };
  }
  const start = new Date(dt.y, dt.m - 1, dt.d, st.h, st.min);
  const end = new Date(dt.y, dt.m - 1, dt.d, en.h, en.min);
  if (end <= start) end.setDate(end.getDate() + 1); // overnight shift

  return {
    start, end,
    startTxt: cleanStr(s.start), endTxt: cleanStr(s.end),
    duration: formatDuration(s.hours),
    role: s.role ? cleanStr(s.role).split(":")[0] : null,
    pay: calcPay(start, end),
  };
}

let BAD_SHIFTS = [];
function flatten(roster) {
  const raw = roster.weeks
    ? roster.weeks.flatMap((w) => w.shifts)
    : roster.shifts || []; // old flat format fallback
  const parsed = raw.map(parseShift);
  BAD_SHIFTS = parsed.filter((p) => p.bad);
  return parsed.filter((p) => !p.bad).sort((a, b) => a.start - b.start);
}

// ── HELPERS ──────────────────────────────────────────────────────────
const sameDay = (a, b) => a.toDateString() === b.toDateString();

function dayLabel(d) {
  const now = new Date();
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, tmr)) return "Tomorrow";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.getTime();
}

function countdown(target) {
  const ms = target - new Date();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) {
    const hLabel = h === 1 ? "hr" : "hrs";
    const rem = mins % 60;
    return rem === 0 ? `${h}${hLabel}` : `${h}${hLabel} ${rem}m`;
  }
  const days = Math.floor(h / 24);
  return `${days}${days === 1 ? " day" : " days"}`;
}

function addText(stack, text, size, color, weight) {
  const t = stack.addText(text);
  t.font = weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

// ── WIDGET SHELL ─────────────────────────────────────────────────────
function baseWidget(family) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bg2, C.bg];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  const pad = family === "small" ? 16 : 14;
  w.setPadding(pad, pad, pad, pad);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  // There is no way to run a Shortcut from a widget tap without iOS
  // switching to an app first. So: tapping the widget re-runs THIS script
  // via Scriptable's own URL scheme; main() below detects that it was
  // launched this way (not as a widget preview) and immediately hands off
  // to the Shortcut with "Scriptable" as its input, rather than showing
  // any menu of ours first.
  w.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}&from=widgettap`;
  return w;
}

function header(w, stale, compact) {
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addStack();
  title.centerAlignContent();
  addText(title, "〽️", compact ? 13 : 14, C.text);
  title.addSpacer(5);
  // Small widget is tight on width, especially with the "cached" pill
  // competing for space -- shorter label there avoids the ellipsis.
  addText(title, compact ? "Shifts" : "Maccas Shifts", compact ? 12 : 13, C.accent, "bold");
  head.addSpacer();
  if (stale) {
    // "cached" = the live GitHub fetch failed and this is the last saved
    // copy, not a statement about the phone's own connection.
    const pill = head.addStack();
    pill.backgroundColor = new Color("#000000", 0.25);
    pill.cornerRadius = 6;
    pill.setPadding(2, 6, 2, 6);
    addText(pill, "cached", 9, C.muted);
  }
  return head;
}

function errorWidget(family, msg) {
  const w = baseWidget(family);
  header(w, false, family === "small");
  w.addSpacer(10);
  const t = w.addText(msg);
  t.font = Font.systemFont(family === "small" ? 11 : 12);
  t.textColor = C.muted;
  w.addSpacer();
  return w;
}

function shiftRow(stack, s, big) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const isToday = sameDay(s.start, new Date());
  const day = row.addStack();
  day.layoutHorizontally();
  day.size = new Size(big ? 90 : 84, 0);
  addText(day, dayLabel(s.start), big ? 13 : 12, isToday ? C.today : C.text, "bold");
  day.addSpacer();

  const mid = row.addStack();
  addText(mid, `${s.startTxt} – ${s.endTxt}`, big ? 13 : 12, C.text);

  row.addSpacer();
  addText(row, s.duration, big ? 12 : 11, C.muted);
}

function buildWidget(shifts, family, stale) {
  const w = baseWidget(family);
  const now = new Date();
  const upcoming = shifts.filter((s) => s.end > now);

  header(w, stale, family === "small");
  w.addSpacer(family === "small" ? 12 : 10);

  if (upcoming.length === 0) {
    const last = shifts.length ? shifts[shifts.length - 1].end : null;
    let msg;
    if (BAD_SHIFTS.length > 0) {
      msg = `Couldn't parse ${BAD_SHIFTS.length} shift(s):\n${BAD_SHIFTS[0].raw}`;
    } else if (shifts.length === 0) {
      msg = "roster.json has 0 shifts.\nCheck the Actions run / path.";
    } else if (last < now) {
      msg = `Roster looks stale.\nLast shift ended ${last.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}.\nTap to rescrape.`;
    } else {
      msg = "No upcoming shifts 🎉";
    }
    const t = w.addText(msg);
    t.font = Font.systemFont(12);
    t.textColor = C.muted;
    w.addSpacer(6);
    addText(w, `${shifts.length} shifts in file`, 10, C.muted);
    w.addSpacer();
    return w;
  }

  if (family === "small") {
    const s = upcoming[0];
    addText(w, dayLabel(s.start), 15, sameDay(s.start, now) ? C.today : C.muted, "bold");
    w.addSpacer(6);
    addText(w, s.startTxt, 26, C.text, "bold");
    w.addSpacer(2);
    addText(w, `until ${s.endTxt}`, 12, C.muted);
    w.addSpacer();
    const foot = w.addStack();
    foot.centerAlignContent();
    addText(foot, money(weekPay(shifts, weekStart(s.start))), 12, C.accent, "bold");
    foot.addSpacer();
    addText(foot, `in ${countdown(s.start)}`, 11, C.muted);
    return w;
  }

  if (family === "medium") {
    const wk = weekStart(upcoming[0].start);
    const list = upcoming.filter((s) => weekStart(s.start) === wk).slice(0, 3);
    list.forEach((s, i) => {
      shiftRow(w, s, false);
      if (i < list.length - 1) w.addSpacer(8);
    });
    w.addSpacer();
    const foot = w.addStack();
    foot.centerAlignContent();
    addText(foot, `Next shift in ${countdown(upcoming[0].start)}`, 10, C.accent);
    foot.addSpacer();
    addText(foot, money(weekPay(shifts, wk)), 10, C.muted);
    return w;
  }

  // large: split into this week / next week / later
  const thisWk = weekStart(now);
  const weekKeys = [...new Set(upcoming.map((s) => weekStart(s.start)))].sort((a, b) => a - b);
  const groups = weekKeys.map((ws) => {
    const n = Math.round((ws - thisWk) / (7 * 864e5));
    const title = n === 0 ? "This Week"
      : n === 1 ? "Next Week"
      : "Week of " + new Date(ws).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    return [title, upcoming.filter((s) => weekStart(s.start) === ws), ws];
  });
  let rows = 0;
  let firstGroup = true;
  for (const [title, list, ws] of groups) {
    if (!list.length || rows >= 7) continue;
    if (!firstGroup) w.addSpacer(10);
    firstGroup = false;

    const gh = w.addStack();
    gh.centerAlignContent();
    addText(gh, title, 12, C.accent, "bold");
    gh.addSpacer();
    addText(gh, money(weekPay(shifts, ws)), 12, C.accent, "bold");
    w.addSpacer(6);

    for (const s of list) {
      if (rows >= 7) break;
      shiftRow(w, s, true);
      w.addSpacer(6);
      rows++;
    }
  }
  w.addSpacer();
  return w;
}

// ── SMALL IN-APP MENU (display-only helpers, no rescrape/alarm logic) ──
async function runMenu(shifts, roster, stale) {
  const a = new Alert();
  a.title = "〽️ Maccas Shifts";
  a.message = "Rescraping and alarms are handled by the \"Roster Scraper\" Shortcut — tap the widget itself on your Home Screen to run that. This menu is just for previewing the widget and debugging the data.";
  a.addAction("Preview small");
  a.addAction("Preview medium");
  a.addAction("Preview large");
  a.addAction("Debug: show parsed data");
  a.addDestructiveAction("Reset saved token");
  a.addCancelAction("Close");
  const i = await a.present();

  if (i === 0) return buildWidget(shifts, "small", stale).presentSmall();
  if (i === 1) return buildWidget(shifts, "medium", stale).presentMedium();
  if (i === 2) return buildWidget(shifts, "large", stale).presentLarge();

  if (i === 3) {
    const d = new Alert();
    d.title = "Debug";
    const first = shifts[0], last = shifts[shifts.length - 1];
    const lastErr = Keychain.contains(KEY_LAST_ERROR) ? Keychain.get(KEY_LAST_ERROR) : null;
    const upcomingPay = total(shifts.filter((s) => s.end > new Date()));
    d.message =
      `Top-level keys: ${Object.keys(roster).join(", ")}\n` +
      `last_updated: ${roster.last_updated}\n` +
      `Shifts parsed: ${shifts.length}, unparseable: ${BAD_SHIFTS.length}\n` +
      (BAD_SHIFTS[0] ? `Bad row: ${BAD_SHIFTS[0].raw}\n` : "") +
      `Upcoming gross pay: ${money(upcomingPay)}\n` +
      `Now: ${new Date().toString()}\n` +
      (first ? `First: ${first.start}\n` : "") +
      (last ? `Last end: ${last.end}\n` : "") +
      (lastErr ? `\nLast fetch failure:\n${lastErr}` : "\nNo recorded fetch failures since last success.");
    d.addCancelAction("Close");
    await d.present();
    return;
  }

  if (i === 4) { Keychain.remove(KEY_TOKEN); }
}

// ── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  // Tapped from the Home Screen widget -- hand off to the Shortcut
  // immediately and stop. Doesn't touch the token/fetch/parse logic at
  // all, since this run's only job is to launch the Shortcut.
  if (args.queryParameters && args.queryParameters.from === "widgettap") {
    await runRosterShortcut();
    return Script.complete();
  }

  const family = config.widgetFamily || "medium";
  let roster, stale = false;

  const token = await getToken();
  if (!token) {
    const w = errorWidget(family, "No token saved. Run the script in Scriptable to set it up.");
    if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
    return Script.complete();
  }

  try {
    roster = await fetchRoster(token);
    saveCache(roster);
    Keychain.remove(KEY_LAST_ERROR); // clear any previously recorded failure once a fetch succeeds
  } catch (e) {
    roster = loadCache();
    stale = true;
    // Persist the real error even when falling back to cache, so it's
    // visible via the debug menu later instead of being silently dropped
    // the moment a cached copy papers over the failure.
    Keychain.set(KEY_LAST_ERROR, `${new Date().toString()}: ${String(e.message || e)}`);
    if (!roster) {
      const w = errorWidget(family, String(e.message || e));
      if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
      return Script.complete();
    }
  }

  const shifts = flatten(roster);
  const widget = buildWidget(shifts, family, stale);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    // Running in Scriptable directly (not via the widget's tap-through,
    // which goes straight to the Shortcut) -- show the display/debug menu.
    await runMenu(shifts, roster, stale);
  }
  Script.complete();
}

await main();
