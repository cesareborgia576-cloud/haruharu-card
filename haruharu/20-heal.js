/* ═══════════════════════════════════════════════════════════════════════
   ★★ 2026-11-24（作者：「文字版的直接给老子删了，只能用游戏版的」）═══
   20-heal.js（文字版专用变量补全）已彻底下架。
   本文件现在是**转发垫片**：loader 的脚本清单嵌在卡里没法热更，
   所以老卡的文字版还会加载到这个文件 —— 它原地把自己的 URL 换成 10-core.js
   再注入一份，让文字版用上游戏版同一套变量检测 / 补全中心 / 版本显示。
   （重导过新卡的文字版由 loader 直接加载 10-core，垫片看到装载标记会自动让路，
    不会重复加载。原 20-heal 全文归档在 归档/备份-20261124/。） */
(function () {
  try {
    var w = (window.top && window.top.document) ? window.top : window;
    try { if (w.__TH_CORE_LOADED__) return; } catch (e0) {}
    try { if (document.querySelector("script[src*='10-core.js']")) return; } catch (e0b) {}
    var src = '';
    try { src = String(document.currentScript && document.currentScript.src || ''); } catch (e1) {}
    if (!src) {
      /* currentScript 不可用（异步注入）时兜底：按 loader 的命名规律拼 URL 不可靠，
         放弃转发 —— 这种情况只出现在非 loader 环境手动引用本文件时。 */
      try { console.warn('[20-heal 垫片] 拿不到自身 URL，无法转发 10-core。'); } catch (e1b) {}
      return;
    }
    var coreUrl = src.replace(/20-heal\.js(?:[?#].*)?$/, '10-core.js');
    if (coreUrl === src) { try { console.warn('[20-heal 垫片] URL 替换失败：' + src); } catch (e2) {} return; }
    var s = document.createElement('script');
    s.src = coreUrl;
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    try { console.log('[20-heal 垫片] 文字版 → 转发加载游戏版核心：' + coreUrl); } catch (e3) {}
  } catch (e) {}
})();
