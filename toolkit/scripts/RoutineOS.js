// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: tasks;
const APP_NAME = Script.name();
// Switched to iCloud for cross-device syncing
const fm = FileManager.iCloud();
const STATE_FILE = fm.joinPath(fm.documentsDirectory(), "routine_state.json");

// Theme
const ACCENT = new Color("#E6A24A");
const BG1 = new Color("#0A0607");
const BG2 = new Color("#14080A");
const CARD = new Color("#000"); 
const MUTED = new Color("#9BA3A8");

// Fonts
const TITLE_FONT = Font.semiboldSystemFont(12);
const STEP_FONT = Font.boldSystemFont(20);
const SUB_FONT = Font.regularSystemFont(9);

// ---- gradient helpers (top always black; bottom can vary per step) ----
function makeVerticalGradient(topColor, bottomColor) {
  const g = new LinearGradient();
  g.colors = [topColor, bottomColor];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(0, 1);
  return g;
}

// Default colors 
const TOP = new Color("#000000");          
const BOTTOM = new Color("#480a60");       
const WIDGET_GRADIENT = makeVerticalGradient(TOP, BOTTOM); 

// Parse a hex string into a Color, with robust fallback
function colorFromHex(hex, fallback) {
  try {
    if (typeof hex === "string" && hex.trim().length) {
      let h = hex.trim();
      if (!h.startsWith("#")) h = "#" + h;
      return new Color(h);
    }
  } catch (e) {}
  return fallback;
}

// Resolve gradient for a given step
function gradientForStep(step) {
  const top = new Color("#000000");
  const bottomHex = (step && (step.bg || step.bottom || step.gradientBottom || step.hex || step.color)) || null;
  const bottom = colorFromHex(bottomHex, BOTTOM);
  return makeVerticalGradient(top, bottom);
}

// Routines
const ROUTINES = {
  school: [
    { title: "Wake Up", time: "6:00", subtitle: "Water/Music", emoji: "🌅", bg: "1A1A2E" },
    { title: "Clean Room", time: "6:05", subtitle: "Momentum", emoji: "🧹", bg: "2E3B73" },
    { title: "Get Dressed & Pack Bag", time: "6:20", subtitle: "Formal?", emoji: "🎒", bg: "8C5A00" },
    { title: "Breakfast", time: "6:30", subtitle: "Quick egg", emoji: "🍳", bg: "FFB400" },
    { title: "Brush Teeth", time: "6:45", subtitle: "Fresh", emoji: "🦷", bg: "00A6FB" },
    { title: "Feed Annie", time: "6:50", subtitle: "And her water bowl", emoji: "🐈", bg: "7C3A2D" },
    { title: "Make Lunch", time: "6:55", subtitle: "Future you?", emoji: "🥪", bg: "6B2D5C" },
    { title: "Travel to School", time: "7:00", subtitle: "Get moving", emoji: "🚌", bg: "8B0000" },
    { title: "School", time: "8:45", subtitle: "Stack knowledge", emoji: "📚", bg: "4A9A80" },
    { title: "Travel Home", time: "2:45", subtitle: "Chill mode", emoji: "🚍", bg: "6B3E2E" },
    { title: "Afternoon Snack", time: "4:15", subtitle: "Boost energy", emoji: "🍫", bg: "F28C28" },
    { title: "Get Dressed", time: "4:20", subtitle: "Comfy clothes", emoji: "🧢", bg: "1976D2" },
    { title: "Work/Productive", time: "4:25", subtitle: "Focus time", emoji: "📝", bg: "4ADE80" },
    { title: "Dinner", time: "6:00", subtitle: "Refuel", emoji: "🍝", bg: "FF9800" },
    { title: "Shower & Brush Teeth", time: "6:30", subtitle: "Cold?", emoji: "🚿", bg: "7B1FA2" },
    { title: "Productive", time: "7:10", subtitle: "Finish tasks", emoji: "💻", bg: "35495E" },
    { title: "Sleep", time: "10:00", subtitle: "Dream consciously", emoji: "💤", bg: "0B132B" }
  ],

  break: [
    { title: "Wake up", time: "7:00", subtitle: "Water/Music", emoji: "🌅", bg: "1A1A2E" },
    { title: "Clean Room", time: "7:05", subtitle: "Start fresh", emoji: "🧹", bg: "2E3B73" },
    { title: "Get Dressed", time: "7:10", subtitle: "Fit check", emoji: "👕", bg: "8C5A00" },
    { title: "Productive", time: "7:25", subtitle: "Focuss", emoji: "📝", bg: "4ADE80" },
    { title: "Break & Feed Annie", time: "7:45", subtitle: "Snack & pet", emoji: "🐈", bg: "7C3A2D" },
    { title: "Productive/Family", time: "8:00", subtitle: "Work + chill", emoji: "👨‍👩‍👦", bg: "35495E" },
    { title: "Breakfast", time: "8:45", subtitle: "Fuel up", emoji: "🍳", bg: "FFB400" },
    { title: "Brush Teeth", time: "8:55", subtitle: "Fresh as", emoji: "😬", bg: "00A6FB" },
    { title: "Your Day", time: "9:00", subtitle: "Enjoy it", emoji: "🌇", bg: "FFB84D" },
    { title: "Dinner", time: "6:00", subtitle: "Refuel", emoji: "🍝", bg: "FF9800" },
    { title: "Shower & Brush Teeth", time: "6:30", subtitle: "Reset", emoji: "🚿", bg: "7B1FA2" },
    { title: "Productive", time: "7:10", subtitle: "Finish tasks", emoji: "💻", bg: "35495E" },
    { title: "Sleep", time: "10:00", subtitle: "Dream consciously", emoji: "💤", bg: "0B132B" }
  ]
};

const DEFAULT_STATE = { mode: "school", index: 0, lastResetISO: new Date().toISOString(), lastTap: 0, lastActionId: "" };
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// helpers
function getParam() {
  try {
    if (typeof args !== "undefined") {
      if (args.queryParameters && args.queryParameters.parameter) return String(args.queryParameters.parameter).trim();
      if (args.queryParameters && args.queryParameters.p) return String(args.queryParameters.p).trim();
      if (args.widgetParameter) return String(args.widgetParameter).trim();
      if (args.shortcutParameter) return String(args.shortcutParameter).trim();
      if (args.plainTexts && args.plainTexts.length) return args.plainTexts.join(" ").trim();
    }
  } catch (e) {}
  return "";
}
function matchesResetParam(p) { if (!p) return false; return p.toLowerCase().startsWith("reset"); }
function containsWord(hay, word) { if (!hay) return false; return hay.toLowerCase().includes(word.toLowerCase()); }
function clampIndex(idx, mode) { const max = ROUTINES[mode].length - 1; if (idx < 0) return 0; if (idx > max) return max; return idx; }

// storage helpers 
function normalizeState(obj) {
  const s = Object.assign({}, DEFAULT_STATE, obj || {});
  if (!ROUTINES[s.mode]) s.mode = "school";
  s.index = clampIndex(typeof s.index === "number" ? s.index : 0, s.mode);
  if (typeof s.lastTap !== "number") s.lastTap = 0;
  if (typeof s.lastActionId !== "string") s.lastActionId = "";
  return s;
}
function readStateStringOrDefault() {
  try {
    if (!fm.fileExists(STATE_FILE)) return JSON.stringify(DEFAULT_STATE);
    return fm.readString(STATE_FILE);
  } catch (e) {
    return JSON.stringify(DEFAULT_STATE);
  }
}
function readStateOrDefault() {
  const s = readStateStringOrDefault();
  try { return normalizeState(JSON.parse(s)); } catch (e) { return Object.assign({}, DEFAULT_STATE); }
}
function loadStateForWidget() { return readStateOrDefault(); }

async function ensureStateFile() {
  try {
    if (!fm.fileExists(STATE_FILE)) {
      fm.writeString(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
      return Object.assign({}, DEFAULT_STATE);
    }
    try {
      const parsed = JSON.parse(fm.readString(STATE_FILE));
      return normalizeState(parsed);
    } catch (e) {
      fm.writeString(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
      return Object.assign({}, DEFAULT_STATE);
    }
  } catch (e) {
    try { fm.writeString(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2)); } catch(_) {}
    return Object.assign({}, DEFAULT_STATE);
  }
}

function saveStateSync(state) {
  const tmp = STATE_FILE + ".tmp";
  try {
    const payload = JSON.stringify(state, null, 2);
    fm.writeString(tmp, payload);
    const verify = fm.readString(tmp);
    JSON.parse(verify);
    try { if (fm.fileExists(STATE_FILE)) fm.remove(STATE_FILE); } catch(_) {}
    fm.writeString(STATE_FILE, verify);
    try { if (fm.fileExists(tmp)) fm.remove(tmp); } catch(_) {}
    return true;
  } catch (e) {
    try { if (fm.fileExists(tmp)) fm.remove(tmp); } catch(_) {}
    return false;
  }
}
async function saveState(state) { return saveStateSync(state); }

// concurrency-safe actions 
async function safeAdvance(actionId) {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const currentStr = readStateStringOrDefault();
    let current;
    try { current = normalizeState(JSON.parse(currentStr)); } catch (e) { current = Object.assign({}, DEFAULT_STATE); }

    if (actionId && current.lastActionId === actionId) {
      return { advanced: false, state: current, skipped: true, reason: "same-run" };
    }
    const now = Date.now();
    if (now - (current.lastTap || 0) < 1500) {
      return { advanced: false, state: current, skipped: true, reason: "recent" };
    }

    const candidate = Object.assign({}, current);
    candidate.lastTap = now;
    candidate.lastActionId = actionId || `${now}`;
    const max = ROUTINES[candidate.mode].length - 1;
    if (candidate.index < max) candidate.index = candidate.index + 1;

    const payload = JSON.stringify(candidate, null, 2);

    const latestStr = readStateStringOrDefault();
    if (latestStr !== currentStr) continue;

    try {
      const tmp = STATE_FILE + ".tmp";
      fm.writeString(tmp, payload);
      const verify = fm.readString(tmp);
      JSON.parse(verify);
      if (fm.fileExists(STATE_FILE)) try { fm.remove(STATE_FILE); } catch(e) {}
      fm.writeString(STATE_FILE, verify);
      try { if (fm.fileExists(tmp)) fm.remove(tmp); } catch(e) {}
    } catch (e) {
      try { if (fm.fileExists(STATE_FILE + ".tmp")) fm.remove(STATE_FILE + ".tmp"); } catch(_) {}
      continue;
    }

    const afterStr = readStateStringOrDefault();
    let after;
    try { after = normalizeState(JSON.parse(afterStr)); } catch (e) { after = candidate; }

    if (after.lastActionId === candidate.lastActionId) {
      const advanced = after.index > current.index;
      return { advanced: advanced, state: after, skipped: !advanced };
    }
  }

  const finalState = readStateOrDefault();
  return { advanced: false, state: finalState, skipped: true, reason: "concurrency" };
}

async function safeReset(modeHint, actionId) {
  const now = Date.now();
  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const currentStr = readStateStringOrDefault();
    let current;
    try { current = normalizeState(JSON.parse(currentStr)); } catch (e) { current = Object.assign({}, DEFAULT_STATE); }

    const newMode = modeHint ? (modeHint === "break" ? "break" : "school") : current.mode;
    const candidate = {
      mode: newMode,
      index: 0,
      lastResetISO: new Date().toISOString(),
      lastTap: now,
      lastActionId: actionId || `${now}`
    };
    const payload = JSON.stringify(normalizeState(candidate), null, 2);

    const latestStr = readStateStringOrDefault();
    if (latestStr !== currentStr) continue;

    try {
      const tmp = STATE_FILE + ".tmp";
      fm.writeString(tmp, payload);
      const verify = fm.readString(tmp);
      JSON.parse(verify);
      if (fm.fileExists(STATE_FILE)) try { fm.remove(STATE_FILE); } catch(e) {}
      fm.writeString(STATE_FILE, verify);
      try { if (fm.fileExists(tmp)) fm.remove(tmp); } catch(e) {}
    } catch (e) { try { if (fm.fileExists(STATE_FILE + ".tmp")) fm.remove(STATE_FILE + ".tmp"); } catch(_) {} continue; }

    const afterStr = readStateStringOrDefault();
    try { return normalizeState(JSON.parse(afterStr)); } catch (e) { return normalizeState(candidate); }
  }
  return readStateOrDefault();
}

async function setIndex(i) {
  const candidate = normalizeState(await ensureStateFile());
  candidate.index = clampIndex(i, candidate.mode);
  candidate.lastTap = Date.now();
  candidate.lastActionId = RUN_ID;
  await saveState(candidate);
  return candidate;
}

// widget renderer 
function createWidgetFromState(state) {
  try {
    const mode = state && state.mode ? state.mode : "school";
    const index = (state && typeof state.index === "number") ? clampIndex(state.index, mode) : 0;
    const list = ROUTINES[mode] || ROUTINES.school;
    const step = list[index] || { title: "No step", subtitle: "", emoji: "❗" };

    const w = new ListWidget();
    w.setPadding(18, 18, 18, 18);
    w.backgroundGradient = gradientForStep(step);

    // header
    const header = w.addStack();
    header.layoutHorizontally();
    const left = header.addStack();
    left.layoutVertically();
    const title = left.addText(mode === "break" ? "Break • Routine" : "School • Routine");
    title.font = TITLE_FONT; 
    title.textColor = MUTED; 
    title.lineLimit = 1;
    title.shadowColor = new Color("#000000", 0.6);
    title.shadowOffset = new Point(0, 1);

    const date = left.addText((new Date()).toLocaleDateString(undefined, { weekday:"short", hour:"numeric", minute:"numeric" }));
    date.font = Font.regularSystemFont(9); 
    date.textColor = new Color("#6E7A81");
    date.shadowColor = new Color("#000000", 0.6);
    date.shadowOffset = new Point(0, 1);

    header.addSpacer();

    const now = new Date();
    const minutesToday = now.getHours() * 60 + now.getMinutes();
    const percent = Math.round((minutesToday / (24 * 60)) * 100);
    const pstack = header.addStack(); 
    pstack.layoutVertically();
    const pc = pstack.addText(`${percent}%`); 
    pc.font = Font.semiboldSystemFont(10); 
    pc.textColor = ACCENT; 
    pc.centerAlignText();
    pc.shadowColor = new Color("#000000", 0.6);
    pc.shadowOffset = new Point(0, 1);

    w.addSpacer(8);

    // card — transparent
    const card = w.addStack();
    card.backgroundColor = new Color("#000000", 0); 
    card.cornerRadius = 14;
    card.setPadding(2, 50, 12, 12);
    card.layoutHorizontally();

    const leftCard = card.addStack();
    leftCard.size = new Size(72, 72);
    leftCard.layoutVertically();
    leftCard.centerAlignContent();
    const emoji = leftCard.addText(step.emoji || "⭐");
    emoji.font = Font.regularSystemFont(42);
    emoji.centerAlignText();
    emoji.shadowColor = new Color("#000000", 0.6);
    emoji.shadowOffset = new Point(0, 1);

    card.addSpacer(12);

    const mid = card.addStack();
    mid.layoutVertically();
    mid.size = new Size(0, 72);

    const t = mid.addText(step.title);
    t.font = STEP_FONT; 
    t.textColor = Color.white(); 
    t.minimumScaleFactor = 0.6; 
    t.lineLimit = 2;
    t.shadowColor = new Color("#000000", 0.6);
    t.shadowOffset = new Point(0, 1);

    mid.addSpacer(6);
    if (step.time) {
      const timeTxt = mid.addText(step.time);
      timeTxt.font = Font.regularSystemFont(11);
      timeTxt.textColor = MUTED;
      timeTxt.lineLimit = 1;
      timeTxt.shadowColor = new Color("#000000", 0.6);
      timeTxt.shadowOffset = new Point(0, 1);
    }

    mid.addSpacer(6);
    const sub = mid.addText(step.subtitle || "");
    sub.font = SUB_FONT; 
    sub.textColor = MUTED; 
    sub.lineLimit = 2;
    sub.shadowColor = new Color("#000000", 0.6);
    sub.shadowOffset = new Point(0, 1);

    card.addSpacer();
    w.addSpacer(0);

    // footer
    const foot = w.addStack();
    foot.layoutHorizontally();
    const leftFoot = foot.addText(`Step ${index + 1}/${list.length}`); 
    leftFoot.font = Font.regularSystemFont(9); 
    leftFoot.textColor = MUTED;
    leftFoot.shadowColor = new Color("#000000", 0.6);
    leftFoot.shadowOffset = new Point(0, 1);

    foot.addSpacer();
    const hint = foot.addText("Tap to advance"); 
    hint.font = Font.regularSystemFont(9); 
    hint.textColor = ACCENT;
    hint.shadowColor = new Color("#000000", 0.6);
    hint.shadowOffset = new Point(0, 1);

    const nonce = Date.now();
    w.url = `scriptable:///run/${encodeURIComponent(APP_NAME)}?parameter=advance&nonce=${nonce}`;

    return w;
  } catch (e) {
    const w = new ListWidget();
    w.backgroundGradient = WIDGET_GRADIENT;
    const t = w.addText("Routine load error");
    t.textColor = Color.white(); 
    t.font = Font.semiboldSystemFont(12);
    const s = w.addText(String(e).slice(0, 80));
    s.textColor = MUTED; 
    s.font = Font.regularSystemFont(10);
    return w;
  }
}

//  UI
async function presentMenuAndAct() {
  const s = await ensureStateFile();
  const list = ROUTINES[s.mode];
  const idx = clampIndex(s.index, s.mode);
  const step = list[idx];

  const alert = new Alert();
  alert.title = `${s.mode === "break" ? "Break" : "School"} Routine`;
  const timeLine = step.time ? `Time: ${step.time}\n\n` : "";
  alert.message = `${timeLine}${step.emoji || ""}  ${step.title}\n\n${step.subtitle || ""}\n\nStep ${idx + 1} of ${list.length}`;
  alert.addAction("Advance step");
  alert.addAction("Preview widget");
  alert.addAction("Reset (keep mode)");
  alert.addAction("Reset → Break");
  alert.addAction("Reset → School");
  alert.addAction("Set step manually");
  alert.addCancelAction("Cancel");
  const choice = await alert.presentSheet();

  if (choice === 0) { // Advance step 
    const res = await safeAdvance(RUN_ID);
    const done = new Alert();
    if (res.skipped) {
      done.title = "Skipped duplicate";
      done.message = `No advance. Still Step ${res.state.index + 1}`;
    } else {
      done.title = res.advanced ? "Advanced" : "Already last step";
      done.message = res.advanced ? `Now step ${res.state.index + 1}` : `Step ${res.state.index + 1}`;
    }
    done.addAction("Nice");
    await done.presentAlert();
    Script.complete();
    return;
  }

  if (choice === 1) { // Preview widget
    const state = await ensureStateFile();
    const w = createWidgetFromState(state);
    await w.presentMedium();
    Script.complete();
    return;
  }

  if (choice === 2) { // Reset (keep mode)
    await safeReset(null, RUN_ID);
    const a = new Alert(); a.title = "Reset"; a.message = "Step reset to 1 for current mode."; a.addAction("Cool"); await a.presentAlert();
    Script.complete();
    return;
  }

  if (choice === 3) { // Reset → Break
    await safeReset("break", RUN_ID);
    const a = new Alert(); a.title = "Reset → Break"; a.message = "Mode set to Break and step reset."; a.addAction("Got it"); await a.presentAlert();
    Script.complete();
    return;
  }

  if (choice === 4) { // Reset → School
    await safeReset("school", RUN_ID);
    const a = new Alert(); a.title = "Reset → School"; a.message = "Mode set to School and step reset."; a.addAction("Got it"); await a.presentAlert();
    Script.complete();
    return;
  }

  if (choice === 5) { // Set step manually
    const pick = new Alert();
    pick.title = "Set step";
    pick.message = `Enter step number (1 to ${list.length})`;
    pick.addTextField(String(idx + 1));
    pick.addAction("Set");
    pick.addCancelAction("Cancel");
    const r = await pick.presentAlert();
    if (r === 0) {
      const val = parseInt(pick.textFieldValue(0));
      if (!isNaN(val)) { await setIndex(val - 1); const ok = new Alert(); ok.title = "Set"; ok.message = `Step set to ${val}`; ok.addAction("Nice"); await ok.presentAlert(); }
    }
    Script.complete();
    return;
  }

  Script.complete();
}

function buildTimeDictionary(mode) {
  const list = ROUTINES[mode] || [];
  const dict = {};
  let passedNoon = false;
  let prevHour = null;

  for (let i = 0; i < list.length; i++) {
    const step = list[i];
    if (!step.time) continue;

    let [h, m] = step.time.split(":").map(Number);

    if (prevHour !== null && h < prevHour) {
      passedNoon = true;
    }
    prevHour = h;

    const suffix = passedNoon ? "pm" : "am";

    let hour12 = h;
    if (hour12 === 0) hour12 = 12;
    else if (hour12 > 12) hour12 = hour12 - 12;

    const timeStr = `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;

    dict[timeStr] = i + 1; 
  }

  return dict;
}

// --------- entrypoint ---------
(async () => {
  const rawParam = getParam();
  if (rawParam && rawParam.toLowerCase() === "dictionary") {
    const state = readStateOrDefault();
    const mode = state.mode === "break" ? "break" : "school";
    const dict = buildTimeDictionary(mode);

    Script.setShortcutOutput(dict);
    Script.complete();
    return;
  }
  const lowParam = rawParam ? rawParam.toLowerCase() : "";

  if (lowParam.startsWith("setstep")) {
    const numStr = lowParam.replace("setstep", "").trim();
    const stepNum = parseInt(numStr, 10);
    if (!isNaN(stepNum)) {
      await setIndex(stepNum - 1);
    }
    Script.complete();
    return;
  }

  if (config.runsInWidget) {
    try {
      const state = loadStateForWidget();
      const widget = createWidgetFromState(state);
      
      // Cleaned URL scheme - directly advances
      widget.url = `scriptable:///run/${encodeURIComponent(APP_NAME)}?parameter=advanceAndShortcut`;

      Script.setWidget(widget);
    } catch (e) {
      const fallback = new ListWidget();
      fallback.backgroundGradient = WIDGET_GRADIENT;
      const t = fallback.addText("Routine load error");
      t.textColor = Color.white();
      t.font = Font.semiboldSystemFont(12);
      fallback.addSpacer(6);
      fallback.addText(String(e).slice(0, 100)).textColor = MUTED;
      Script.setWidget(fallback);
    }
    Script.complete();
    return;
  }

  if (lowParam.startsWith("advanceandshortcut")) {
    try { await safeAdvance(RUN_ID); } catch(e) {}
    App.close(); 
    return;
  }

  if (lowParam === "advance" || lowParam === "next" || lowParam === "silent") {
    try { await safeAdvance(RUN_ID); } catch(e) {}
    Script.complete();
    return;
  }

  try {
    if (typeof args !== "undefined" && args.queryParameters && args.queryParameters.nonce && !lowParam) {
      try { await safeAdvance(RUN_ID); } catch(e) {}
      Script.complete();
      return;
    }
  } catch (e) {}

  if (matchesResetParam(lowParam)) {
    let modeHint = null;
    if (containsWord(lowParam, "break")) modeHint = "break";
    else if (containsWord(lowParam, "school")) modeHint = "school";
    try { await safeReset(modeHint, RUN_ID); } catch(e) {}
    Script.complete();
    return;
  }

  await presentMenuAndAct();
  Script.complete();
})();
