// Transcript Sidebar —— 单文件插件脚本（IINA 的 JS 上下文不适合 ESM import）
const { core, mpv, event, sidebar, file, menu, console } = iina;

// ---------------------------------------------------------------- 语言
// 菜单/提示走三语；诊断日志一律英文（便于贴给开发者看）
const MSG = {
  en: { menu_reload: "Reload subtitle list", menu_show: "Show transcript sidebar",
        no_sub: "No subtitle file found", read_fail: "Failed to read: ",
        parsed_zero: "Parsed 0 cues — unrecognized format" },
  zh: { menu_reload: "重新载入字幕列表", menu_show: "显示字幕侧边栏",
        no_sub: "没找到字幕文件", read_fail: "读取失败：",
        parsed_zero: "解析到 0 条，格式可能不认识" },
  ja: { menu_reload: "字幕リストを再読み込み", menu_show: "字幕サイドバーを表示",
        no_sub: "字幕ファイルが見つかりません", read_fail: "読み込み失敗：",
        parsed_zero: "0 件しか解析できませんでした（形式不明）" }
};

function sysLangs() {
  try {
    const a = iina.utils.preferredLocalizations();
    if (a && a.length) return a;
  } catch (e) {}
  try { return [Intl.DateTimeFormat().resolvedOptions().locale]; } catch (e) {}
  return ["en"];
}

function pickLang(pref) {
  if (pref && pref !== "auto") return (pref === "zh" || pref === "ja") ? pref : "en";
  const arr = sysLangs();
  for (let i = 0; i < arr.length; i++) {
    const s = String(arr[i] || "").toLowerCase();
    if (s.indexOf("zh") === 0) return "zh";
    if (s.indexOf("ja") === 0) return "ja";
    if (s.indexOf("en") === 0) return "en";
  }
  return "en";
}

let LANG = pickLang(null);
function T(k) {
  const d = MSG[LANG] || MSG.en;
  return d[k] !== undefined ? d[k] : MSG.en[k];
}

const LOG = [];
function log(msg) {
  LOG.push(String(msg));
  try { console.log("[transcript-sidebar] " + msg); } catch (e) {}
}
function fail(stage, e) {
  const msg = stage + "：" + (e && e.message ? e.message : String(e));
  LOG.push(msg);
  try { sidebar.postMessage("err", { stage: stage, message: msg, log: LOG.slice(-12) }); } catch (e2) {}
}

// ---------------------------------------------------------------- 解析
function toSeconds(s) {
  const m = String(s).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4].padEnd(3, "0"), 10) / 1000;
}
function cleanText(s) {
  return String(s).replace(/\r/g, "").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function parseSubtitle(text, hint) {
  const t = String(text).replace(/\r\n/g, "\n");
  if (hint === "ass" || /^\[Script Info\]/m.test(t)) return parseASS(t);
  return parseBlocks(t);
}
function parseBlocks(t) {
  const out = [];
  const blocks = t.split(/\n\s*\n/);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split("\n").filter(function (l) { return l.trim() !== ""; });
    let idx = -1;
    for (let k = 0; k < lines.length; k++) if (lines[k].indexOf("-->") >= 0) { idx = k; break; }
    if (idx < 0) continue;
    const parts = lines[idx].split("-->");
    const start = toSeconds(parts[0] || "");
    if (start === null) continue;
    const end = toSeconds(parts[1] || "");
    const body = cleanText(lines.slice(idx + 1).join(" "));
    if (body) out.push({ start: start, end: end === null ? start + 2 : end, text: body });
  }
  return out;
}
function parseASS(t) {
  const out = [];
  let inEvents = false, fmt = null;
  const lines = t.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\[Events\]/i.test(line)) { inEvents = true; continue; }
    if (/^\[/.test(line)) { inEvents = false; continue; }
    if (!inEvents) continue;
    if (/^Format:/i.test(line)) { fmt = line.slice(7).split(",").map(function (x) { return x.trim().toLowerCase(); }); continue; }
    if (!/^Dialogue:/i.test(line)) continue;
    const cols = line.slice(9).split(",");
    let iS = 1, iE = 2, iT = cols.length - 1;
    if (fmt) {
      const a = fmt.indexOf("start"), b = fmt.indexOf("text");
      if (a >= 0) { iS = a; iE = a + 1; }
      if (b >= 0) iT = b;
    }
    const start = toSeconds(cols[iS] || "");
    if (start === null) continue;
    const end = toSeconds(cols[iE] || "");
    const body = cleanText(cols.slice(iT).join(","));
    if (body) out.push({ start: start, end: end === null ? start + 2 : end, text: body });
  }
  return out;
}

// ---------------------------------------------------------------- 找字幕
let cues = [], source = "", lastPos = -1, lastPref = "";

function siblings() {
  let url = String(core.status.url || "").replace(/^file:\/\//, "");
  try { url = decodeURIComponent(url); } catch (e) {}   // IINA 给的是 percent-encoded URL
  const m = url.match(/^(.*)\.[^.\/]+$/);
  if (!m) return [];
  return ["srt", "vtt", "ass", "ssa"].map(function (e) { return m[1] + "." + e; });
}

function findSubtitle() {
  const tried = [];
  try {
    const list = mpv.getNative("track-list") || [];
    const subs = list.filter(function (t) { return t && t.type === "sub"; });
    for (let k = 0; k < subs.length; k++) {
      const p = subs[k]["external-filename"];
      if (p) { tried.push("track-list 命中:" + p); return { path: p, tried: tried }; }
    }
    tried.push("track-list 有 " + subs.length + " 条字幕轨，但无外挂文件路径");
  } catch (e) { tried.push("track-list 读取失败 " + e); }

  try {
    const p = mpv.getString("current-tracks/sub/external-filename");
    if (p) { tried.push("属性命中:" + p); return { path: p, tried: tried }; }
  } catch (e) { tried.push("属性读取失败 " + e); }

  const cands = siblings();
  for (let k = 0; k < cands.length; k++) {
    try {
      if (file.exists(cands[k])) { tried.push("同名字幕命中:" + cands[k]); return { path: cands[k], tried: tried }; }
    } catch (e) {}
  }
  tried.push("同目录同名 .srt/.vtt/.ass 都不存在");
  return { path: null, tried: tried };
}

function prefs() {
  let bg = "frosted", fs = 12, lp = "auto", dg = false;
  try { bg = iina.preferences.get("bg") || "frosted"; } catch (e) {}
  try { fs = Number(iina.preferences.get("fontSize")) || 12; } catch (e) {}
  try { lp = iina.preferences.get("lang") || "auto"; } catch (e) {}
  try { dg = iina.preferences.get("diagnostics") === true; } catch (e) {}
  LANG = pickLang(lp);
  return { bg: bg, fontSize: fs, lang: LANG, diagnostics: dg };
}

function pushData(note) {
  sidebar.postMessage("data", {
    cues: cues, source: source, note: note || "",
    log: LOG.slice(-14), url: String(core.status.url || ""),
    pref: prefs()
  });
}

function loadSubtitles() {
  try {
    log("载入开始 url=" + core.status.url);
    const found = findSubtitle();
    for (let i = 0; i < found.tried.length; i++) log(found.tried[i]);
    if (!found.path) { cues = []; pushData(T("no_sub")); return; }
    let raw = "";
    try { raw = file.read(found.path); }
    catch (e) { cues = []; pushData(T("read_fail") + found.path + " (" + e + ")"); return; }
    log("读到 " + raw.length + " 字符");
    const hint = /\.(ass|ssa)$/i.test(found.path) ? "ass" : undefined;
    cues = parseSubtitle(raw, hint);
    source = found.path.split("/").pop() || found.path;
    log("解析出 " + cues.length + " 条");
    pushData(cues.length ? "" : T("parsed_zero"));
  } catch (e) {
    fail("载入字幕", e);
  }
}

// ---------------------------------------------------------------- 位置同步
function pushPref() {
  try {
    const cur = prefs();
    const key = cur.bg + "/" + cur.fontSize + "/" + cur.lang + "/" + cur.diagnostics;
    if (key !== lastPref) { lastPref = key; sidebar.postMessage("pref", cur); }
  } catch (e) {}
}

function tick() {
  if (!mounted) return;
  pushPref();                       // 必须独立于播放状态：暂停时位置不变，不能早退
  try {
    const p = core.status.position;
    if (p === null || p === undefined) return;
    if (Math.abs(p - lastPos) < 0.25) return;
    lastPos = p;
    sidebar.postMessage("pos", { t: p, paused: core.status.paused });
  } catch (e) {}
}

// ---------------------------------------------------------------- 装配
// 关键：sidebar.loadFile 必须在主窗口加载完成后调用，否则 IINA 直接抛错、侧边栏永久空白
// （源码 JavascriptAPISidebarView.loadFile: "guard player.mainWindow.loaded"）
// 而且 loadFile 内部会 clearListeners()，所以 onMessage 必须在 loadFile 之后注册。
let mounted = false;

function mountSidebar() {
  if (mounted) return;
  try {
    sidebar.loadFile("ui/sidebar.html");
  } catch (e) {
    fail("loadFile", e);
    return;
  }
  mounted = true;
  try {
    sidebar.onMessage("ready", function () { log("收到 ready"); loadSubtitles(); });
    sidebar.onMessage("reload", function () { log("收到 reload"); loadSubtitles(); });
    sidebar.onMessage("seek", function (d) { const t = Number(d && d.t); if (!isNaN(t)) core.seekTo(t); });
    sidebar.onMessage("ping", function () { sidebar.postMessage("pong", { log: LOG.slice(-14) }); });
    sidebar.onMessage("savePref", function (d) {
      try {
        if (d && d.bg) iina.preferences.set("bg", d.bg);
        if (d && d.fontSize) iina.preferences.set("fontSize", Number(d.fontSize));
        if (d && d.lang) iina.preferences.set("lang", d.lang);
        if (d && d.diagnostics !== undefined) iina.preferences.set("diagnostics", !!d.diagnostics);
        iina.preferences.sync();
        lastPref = (d.bg || "frosted") + "/" + (d.fontSize || 12) + "/" + (d.lang || "auto");
        LANG = pickLang(d && d.lang ? d.lang : "auto");
        buildMenu();                 // 菜单跟着语言走，不必重启
        log("prefs saved " + lastPref);
      } catch (e) { fail("保存偏好", e); }
    });
    log("sidebar 已挂载，消息处理器已注册");
  } catch (e) { fail("注册消息", e); }
  loadSubtitles();
}

try {
  event.on("iina.window-loaded", function () { log("window-loaded"); setTimeout(mountSidebar, 50); });
  log("window-loaded 监听已注册");
} catch (e) { fail("注册事件", e); }

try {
  event.on("iina.file-loaded", function () { cues = []; lastPos = -1; log("file-loaded"); if (mounted) loadSubtitles(); });
  log("file-loaded 监听已注册");
} catch (e) { fail("注册事件", e); }

function buildMenu() {
  // removeAllItems 与 addItem 分开 try：菜单重建失败也不能让菜单消失
  try { menu.removeAllItems(); } catch (e) { log("menu clear error: " + e); }
  try {
    menu.addItem(menu.item(T("menu_reload"), function () { loadSubtitles(); }));
    menu.addItem(menu.item(T("menu_show"), function () { mountSidebar(); sidebar.show(); }));
  } catch (e) { log("menu add error: " + e); }
}
buildMenu();

// 窗口可能早就加载完了（插件在播放中装载），也试一次
setTimeout(mountSidebar, 400);
setInterval(tick, 500);
log("插件初始化完成");
