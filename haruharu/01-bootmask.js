/* ============================================================
   《加载提醒 · 屏幕正中转圈》
   作者要求（2026-11-26）：新增一个加载提醒脚本，屏幕正中间转圈显示「加载脚本中」，
   照抄天元录的加载弹层。

   口径：
   · 挂在 **顶层文档**（脚本跑在各自的隐藏 iframe 里，挂自己 document 玩家看不见）。
   · pointer-events:none —— 只提示，不挡操作；忘了摘也不会把玩家锁死。
   · 成功：立刻摘掉（忘摘 = 屏幕正中一块永远的板子）。
   · 判「好了」：游戏壳 / 状态栏任一出现，或 10-core 的 thUiModeIs 就位并过了缓冲期。
   · 兜底：最长 25 秒一定摘掉，绝不因为某个脚本挂了就一直转圈。
   ============================================================ */
(function () {
  'use strict';

  /* ★ 2026-11-26：薄卡那边 loader 已经自己挂过遮罩了（它才是真正在下载脚本的人）。
     loader 一开始就把 __TH_LOADER_PRESENT__ 置上，拉完再置 __TH_LOADER_MASK_DONE__。
     看到任一个就直接退出 —— 遮罩归 loader 管，这里只服务「脚本已经内置在卡里」的本地卡。 */
  try {
    if (window.__TH_LOADER_PRESENT__ || window.__TH_LOADER_MASK_DONE__) return;
    if (window.top && (window.top.__TH_LOADER_PRESENT__ || window.top.__TH_LOADER_MASK_DONE__)) return;
  } catch (e0) {}

  var ID = 'th-boot-mask';
  var STYLE_ID = 'th-boot-mask-style';
  var T0 = Date.now();
  var HARD_MS = 12000;      /* 最长 12 秒（以前 25 秒，作者看到卡在加载中） */
  var MIN_MS = 1200;        /* 至少显示 1.2 秒，避免一闪而过 */
  var timer = null;

  function topDoc() {
    try { if (window.top && window.top.document && window.top.document.documentElement) return window.top.document; } catch (e0) {}
    try { if (window.parent && window.parent.document && window.parent.document.documentElement) return window.parent.document; } catch (e1) {}
    try { if (document && document.documentElement) return document; } catch (e2) {}
    return null;
  }

  function ensureStyle(d) {
    try {
      if (d.getElementById(STYLE_ID)) return;
      var st = d.createElement('style');
      st.id = STYLE_ID;
      st.textContent = '@keyframes thBootSpin{to{transform:rotate(360deg)}}'
        + '@keyframes thBootFade{from{opacity:0}to{opacity:1}}';
      (d.head || d.documentElement).appendChild(st);
    } catch (e) {}
  }

  function show(main, sub) {
    try {
      var d = topDoc(); if (!d) return;
      ensureStyle(d);
      var w = d.getElementById(ID);
      if (!w) {
        w = d.createElement('div');
        w.id = ID;
        w.setAttribute('style',
          'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;'
          + 'background:rgba(6,9,6,.62);pointer-events:none;animation:thBootFade .25s ease-out;');
        w.innerHTML =
          '<div id="th-boot-box" style="min-width:230px;max-width:80vw;padding:20px 26px;border-radius:14px;text-align:center;'
          + 'background:linear-gradient(160deg,rgba(24,30,18,.97),rgba(12,16,10,.98));'
          + 'border:1px solid rgba(214,190,110,.42);'
          + 'box-shadow:0 18px 48px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);">'
          + '<div style="width:34px;height:34px;margin:0 auto 14px;border-radius:50%;'
          + 'border:2px solid rgba(230,205,140,.20);border-top-color:#e8cb92;animation:thBootSpin .9s linear infinite;"></div>'
          + '<div id="th-boot-main" style="font-size:15px;letter-spacing:.08em;color:#efe6d2;'
          + 'font-family:system-ui,-apple-system,\'Noto Sans SC\',sans-serif;">脚本加载中…</div>'
          + '<div id="th-boot-sub" style="margin-top:7px;font-size:11px;line-height:1.6;color:rgba(214,201,174,.72);'
          + 'font-family:inherit;">正在准备卡牌脚本</div></div>';
        (d.body || d.documentElement).appendChild(w);
      }
      var a = d.getElementById('th-boot-main'); if (a && main) a.textContent = main;
      var b = d.getElementById('th-boot-sub'); if (b && sub) b.textContent = sub;
    } catch (e) {}
  }

  function hide() {
    try {
      var d = topDoc(); if (!d) return;
      var el = d.getElementById(ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) {}
  }

  function ready() {
    var d = topDoc();
    if (!d) return false;
    try {
      if (d.getElementById('th-gal-shell-root')) return true;   /* 游戏壳建好了 */
      if (d.querySelector('.hb-tabs')) return true;             /* 文字版状态栏出来了 */
    } catch (e0) {}
    /* ★ 2026-11-26（作者：卡死在「脚本加载中」）：原来这里还要求「等 6 秒」，
       结果状态栏一直没建出来就永远不满足，只能干等到 25 秒硬上限 —— 看起来就是卡死。
       现在只要**模式切换器已经跑起来**（thUiModeIs 出现）就算脚本就绪，
       这是整条加载链里最早、也最可靠的信号。 */
    try { if (typeof window.thUiModeIs === 'function') return true; } catch (e1) {}
    try { if (window.top && typeof window.top.thUiModeIs === 'function') return true; } catch (e2) {}
    try { if (window.parent && window.parent !== window && typeof window.parent.thUiModeIs === 'function') return true; } catch (e3) {}
    /* 最后兜底：聊天已经渲染出来（酒馆本身好了），也不再挡着 */
    try { if (d.querySelector('#chat .mes')) return true; } catch (e4) {}
    if (Date.now() - T0 > HARD_MS) return true;
    return false;
  }

  function tick() {
    try {
      if (Date.now() - T0 > HARD_MS) { hide(); return; }
      if ((Date.now() - T0) >= MIN_MS && ready()) { hide(); return; }
      timer = setTimeout(tick, 200);
    } catch (e) { hide(); }
  }

  /* 尽早显示：脚本执行时 body 可能还没解析出来，用 rAF + 短轮询兜一下 */
  show('脚本加载中…', '正在准备卡牌脚本');
  if (!topDoc()) setTimeout(function () { show('脚本加载中…', '正在准备卡牌脚本'); }, 60);
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { show('脚本加载中…', '正在准备卡牌脚本'); }, { once: true });
    }
  } catch (e3) {}
  setTimeout(function () { show('脚本加载中…', '正在准备卡牌脚本'); }, 300);
  tick();

  /* 10-core 那边准备好了可以主动喊一声，立刻摘掉（不依赖轮询） */
  try {
    window.addEventListener('th-scripts-ready', hide, false);
    if (window.top && window.top !== window) window.top.addEventListener('th-scripts-ready', hide, false);
  } catch (e4) {}

  /* ★ 2026-11-26：安全阀 —— 玩家一碰屏幕就摘掉。
     万一某个判据失灵，也绝不会让这块板子一直挂在屏幕上。 */
  try {
    var bail = function () { hide(); };
    window.addEventListener('pointerdown', bail, true);
    window.addEventListener('keydown', bail, true);
    if (window.top && window.top !== window) {
      window.top.addEventListener('pointerdown', bail, true);
      window.top.addEventListener('keydown', bail, true);
    }
  } catch (e5) {}
})();
