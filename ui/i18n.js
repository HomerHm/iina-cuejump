// 三语文案（en / zh-Hans / ja）。侧边栏与设置页共用；main.js 里另有一小份（菜单/OSD）。
(function () {
  const DICT = {
    en: {
      search_ph: "Search subtitles…   ⌘F",
      reload_title: "Reload subtitles",
      follow: "Follow",
      follow_title: "Auto-scroll to the line being played",
      font_small: "Smaller text",
      font_big: "Larger text",
      bg_title: "Background: glass / frosted / solid",
      bg_glass: "Glass",
      bg_frosted: "Frosted",
      bg_solid: "Solid",
      no_resp: "Plugin is not responding. Click to retry.",
      err_prefix: "Plugin error: ",
      diag: "Diagnostics",
      p_bg: "Sidebar background",
      p_bg_glass: "Glass (fully transparent, shows the video)",
      p_bg_frosted: "Frosted (semi-transparent, recommended)",
      p_bg_solid: "Solid",
      p_bg_hint: "Glass uses IINA's own liquid glass. Frosted adds one translucent layer so text stays readable over bright frames.",
      p_font: "Text size",
      p_lang: "Language",
      p_lang_auto: "Follow system",
      p_src: "Current subtitle file",
      p_diag: "Show diagnostics",
      p_diag_hint: "Shows the plugin's internal log at the bottom of the sidebar, for troubleshooting."
    },
    zh: {
      search_ph: "搜索字幕…   ⌘F",
      reload_title: "重新载入字幕",
      follow: "跟随",
      follow_title: "自动滚动到正在播放的那一句",
      font_small: "字号更小",
      font_big: "字号更大",
      bg_title: "切换背景：玻璃 / 磨砂 / 不透明",
      bg_glass: "玻璃",
      bg_frosted: "磨砂",
      bg_solid: "不透明",
      no_resp: "插件没有回应，点这里重试。",
      err_prefix: "插件报错：",
      diag: "诊断信息",
      p_bg: "侧边栏背景",
      p_bg_glass: "玻璃（完全透明，透出视频）",
      p_bg_frosted: "磨砂（半透明，推荐）",
      p_bg_solid: "不透明",
      p_bg_hint: "玻璃 = 完全交给 IINA 的液态玻璃；磨砂 = 自己再叠一层半透明模糊，亮画面上更好读。",
      p_font: "字号",
      p_lang: "语言",
      p_lang_auto: "跟随系统",
      p_src: "当前字幕来源",
      p_diag: "显示诊断信息",
      p_diag_hint: "在侧边栏底部显示插件内部日志，用于排查问题。"
    },
    ja: {
      search_ph: "字幕を検索…   ⌘F",
      reload_title: "字幕を再読み込み",
      follow: "追従",
      follow_title: "再生中の行まで自動スクロール",
      font_small: "文字を小さく",
      font_big: "文字を大きく",
      bg_title: "背景：ガラス / つや消し / 不透明",
      bg_glass: "ガラス",
      bg_frosted: "つや消し",
      bg_solid: "不透明",
      no_resp: "プラグインが応答しません。クリックで再試行。",
      err_prefix: "プラグインエラー：",
      diag: "診断情報",
      p_bg: "サイドバーの背景",
      p_bg_glass: "ガラス（完全に透明、映像が透ける）",
      p_bg_frosted: "つや消し（半透明、推奨）",
      p_bg_solid: "不透明",
      p_bg_hint: "ガラスは IINA 本来のリキッドグラス。つや消しは半透明の層を重ね、明るい映像でも読みやすくします。",
      p_font: "文字サイズ",
      p_lang: "言語",
      p_lang_auto: "システムに従う",
      p_src: "現在の字幕ファイル",
      p_diag: "診断情報を表示",
      p_diag_hint: "サイドバー下部にプラグイン内部のログを表示します。問題の切り分け用。"
    }
  };

  // "zh-Hans-CN" / "zh-TW" / "ja-JP" / "en-US" → 语言键
  function resolve(tag) {
    const s = String(tag || "").toLowerCase();
    if (s.indexOf("zh") === 0) return "zh";
    if (s.indexOf("ja") === 0) return "ja";
    return "en";
  }

  function t(lang, key) {
    const d = DICT[lang] || DICT.en;
    return d[key] !== undefined ? d[key] : (DICT.en[key] !== undefined ? DICT.en[key] : key);
  }

  // 遍历带 data-i18n* 的元素（textContent / title / placeholder）
  function apply(lang) {
    const root = document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(lang, el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.title = t(lang, el.getAttribute("data-i18n-title"));
    });
    root.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.placeholder = t(lang, el.getAttribute("data-i18n-ph"));
    });
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  }

  window.I18N = { dict: DICT, resolve: resolve, t: t, apply: apply };
})();
