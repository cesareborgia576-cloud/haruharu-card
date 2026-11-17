/* ══════════════════════════════════════════════════════════════════════════
   春日狂想曲 · 玩家通道【故障挡板】

   为什么存在（作者 2026-11-17）：
     先是「赶紧全面停用老版本，宁愿不给玩」，随即改为
     「改为显示发生故障，正在修复中」。

   背景：腾讯云欠费。老卡的 00-switcher 里有颗心跳，每 45 秒下一次 566KB 的
   条目包（`?t=Date.now()` 绕开缓存）。11-16 账单 5.94 元 ≈ 11.9 GB，全是这颗心跳。
   修好的代码只推在 chunri-dev/，玩家的卡指向 chunri/ —— 他们刷新一百次也拿不到修复。

   所以这个文件**替换掉 chunri/00-switcher.js**，成为玩家通道唯一会跑的业务脚本：
     · 立刻画一屏「发生故障 · 正在修复中」，盖住一切（z-index 拉满）
     · 一个网络请求都不发（没有心跳、没有同步、没有版本巡查）
     · 不写存档、不碰世界书、不碰任何 DOM 以外的状态

   为什么不干脆让文件 404：
     loader 拿不到 ver.js ⇒ BASES 为空 ⇒ 13 个脚本一个都不加载 ⇒
     **没有任何脚本能画这屏**，玩家看到的是空壳/白屏。记忆里那条铁律就是
     「不许让卡变成白屏」。所以必须留一个能跑、但只画挡板的脚本。

   两块必须留的口子（都踩过）：
     · 挡板 pointer-events:none —— 否则连酒馆左侧菜单都点不到，玩家没法删卡/换卡
     · 键盘**不拦** —— 拦了整个 SillyTavern 都打不出字

   ⚠ 恢复办法：`node _cos_push_chunri.mjs` 把 热更/ 的原件推回去
     （本地 version.json 的 seq 已经预先加大，恢复时不会撞缓存）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 本脚本在酒馆助手的 iframe 里跑，UI 必须画在宿主（top）那页。
     裸写 document 就会画进隐藏 iframe —— 玩家什么都看不到（踩过）。 */
  function getDoc() {
    try { if (window.top && window.top.document) return window.top.document; } catch (e0) {}
    try { if (window.parent && window.parent.document) return window.parent.document; } catch (e1) {}
    return document;
  }

  var ID = 'spr-closed-wall';

  function verLine() {
    var oss = '', card = '';
    try { oss = String(window.__CQ_OSS_VER__ || (window.top && window.top.__CQ_OSS_VER__) || ''); } catch (e0) {}
    try { card = String(window.__SPR_CARD_VER__ || (window.top && window.top.__SPR_CARD_VER__) || ''); } catch (e1) {}
    var bits = [];
    if (card) bits.push('卡内 ' + card);
    if (oss) bits.push('线上 ' + oss);
    return bits.join(' · ');
  }

  /* ── 尺寸自检（手机端就是靠这一段救回来的）───────────────────────────
     ★★ 2026-11-17 11:5x 真凶（在仿酒馆布局里复现出来了）：
        本脚本跑在**酒馆助手给的 iframe** 里，`window.innerHeight` 是 iframe
        的高度（实测 420px），不是屏幕高度（844px）。我上一版拿它去
        `el.style.height = vh + 'px'` ⇒ 挡板只盖住 420px，下面露出酒馆界面，
        玩家看到的就是「藏在酒馆底下」。
     ⇒ 一切尺寸只能问**被画进去的那个文档的 window**（d.defaultView），
        不许用自己这个 iframe 的 window。
     ⇒ 而且不再无条件钉高度：position:fixed + 四边贴 0 本来就该铺满，
        只有量出来明显偏小（被塞进小容器）才补救一次。 */
  function fitEl(el, d) {
    try {
      var win = null;
      try { win = d.defaultView || window; } catch (eW) { win = window; }
      var vw = 0, vh = 0;
      try { vw = win.innerWidth || 0; vh = win.innerHeight || 0; } catch (eS) {}
      if (!vw) vw = (d.documentElement && d.documentElement.clientWidth) || 0;
      if (!vh) vh = (d.documentElement && d.documentElement.clientHeight) || 0;

      var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      var small = !!r && vh > 0 && (r.height < vh * 0.9 || r.width < vw * 0.9);
      if (small && d.documentElement && d.documentElement.appendChild) {
        try { d.documentElement.appendChild(el); } catch (eM) {}
        r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      }
      /* 仍然偏小才显式钉一次高度（钉的是宿主窗口的高度，不是 iframe 的） */
      if (r && vh > 0 && r.height < vh * 0.9) el.style.height = vh + 'px';
    } catch (eF) {}
  }

  function paint() {
    var d = null;
    try { d = getDoc(); } catch (e) { return false; }
    if (!d || !d.body) return false;
    /* 已经画过就只重钉尺寸 —— 手机旋转/地址栏收放会走到这里 */
    var ex = null;
    try { ex = d.getElementById(ID); } catch (e2) {}
    if (ex) { fitEl(ex, d); return true; }

    var el = null;
    try { el = d.createElement('div'); } catch (e3) { return false; }
    el.id = ID;
    el.setAttribute('style', [
      'position:fixed', 'left:0', 'top:0', 'right:0', 'bottom:0',
      'width:100%', 'height:100%', 'max-height:100%',
      'z-index:2147483647',
      /* ★ pointer-events:none 是刻意的：玩家要能点到酒馆左侧菜单。
         挡板只挡「看」，不挡「操作酒馆」。里面的卡片单独 auto。 */
      'pointer-events:none',
      'background:linear-gradient(160deg,#141018 0%,#1d1520 55%,#241a1c 100%)',
      'color:#f2e9e4',
      /* ★ 手机端踩过的坑（两条，都验证过）：
         ① flex + align-items:center 居中时，内容一旦高过一屏，**顶部被裁且滚不到**
            —— 窄屏上看起来就是「超出屏幕 / 藏在酒馆底下」。
            改成「外层滚动 + 内层 min-height:100% 居中」，高过一屏自然滚。
         ② `env(safe-area-inset-*)` 在老 Android WebView 里不认，
            写在 calc() 里会让**整条 padding 声明失效**（等于 0），字直接贴边。
            所以先给一条普通 padding 兜底，再让带 env 的覆盖它。 */
      'display:block',
      'overflow-x:hidden', 'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'overscroll-behavior:contain',
      'touch-action:pan-y',
      '-webkit-text-size-adjust:100%',
      'box-sizing:border-box',
      'padding:16px',
      'padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
    ].join(';'));

    el.innerHTML = [
      '<div style="min-height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">',
      '<div style="width:100%;max-width:560px;box-sizing:border-box;text-align:center;pointer-events:auto;padding:4px 0;">',
      '<div style="font-size:clamp(11px,3.2vw,12px);letter-spacing:.14em;color:#a98f6a;">脚本故障，暂时停止使用</div>',
      '<div style="font-size:14px;color:#c9a227;letter-spacing:.16em;margin-top:12px;">春 日 狂 想 曲</div>',
      '<h1 style="font-size:clamp(26px,8vw,34px);line-height:1.3;margin:14px 0 0;font-weight:600;letter-spacing:.03em;">发生故障</h1>',
      '<p style="font-size:clamp(15px,4.4vw,17px);line-height:1.6;margin:10px 0 0;color:#e8d9c0;letter-spacing:.1em;">正在修复中</p>',
      '<div style="height:1px;background:linear-gradient(90deg,transparent,#4a3f47,transparent);margin:20px 0;"></div>',
      '<p style="font-size:clamp(14px,4vw,15px);line-height:1.85;color:#dcd2d8;margin:0;word-break:break-word;">',
      '这张卡现在暂时没法运行。<br>',
      '不是你的问题，也<b style="color:#f2e9e4;">不是存档的问题</b>。',
      '</p>',
      '<div style="margin-top:18px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);box-sizing:border-box;">',
      '<p style="font-size:clamp(12px,3.6vw,13px);line-height:1.85;color:#a99fa6;margin:0;text-align:left;word-break:break-word;">',
      '服务器资源出了状况，正在处理，处理完会在这里更新。<br>',
      '<span style="color:#8f858c;">你的存档和聊天记录都完好，先别删，等修好就能继续。</span>',
      '</p>',
      '</div>',
      '<p style="font-size:clamp(11px,3.4vw,12px);line-height:1.8;color:#7d7379;margin:18px 0 0;">',
      '给你添麻烦了。可以先去做别的，过一会儿再回来看看。',
      '</p>',
      '<p style="font-size:11px;color:#5f575c;margin:14px 0 0;word-break:break-all;">', verLine(), '</p>',
      '</div>',
      '</div>',
    ].join('');

    try { d.body.appendChild(el); } catch (e4) { return false; }
    fitEl(el, d);
    return true;
  }

  /* 酒馆助手偶尔会把 body 整个换掉（切楼层 / 重渲染）—— 补几次，幂等 */
  function boot() {
    paint();
    try { setTimeout(paint, 600); } catch (e0) {}
    try { setTimeout(paint, 2400); } catch (e1) {}
    try { setTimeout(paint, 6000); } catch (e2) {}
  }

  /* 手机端：地址栏收放 / 旋转 / 键盘弹出都会改变可用高度，重钉一次高度、
     必要时把挡板重新挂到 html 上（iOS 上 position:fixed 最容易在这一刻错位）。 */
  try {
    var _vv = window.visualViewport;
    if (_vv && _vv.addEventListener) {
      _vv.addEventListener('resize', function () { paint(); });
      _vv.addEventListener('scroll', function () { paint(); });
    }
    window.addEventListener('orientationchange', function () { setTimeout(paint, 300); });
    window.addEventListener('resize', function () { paint(); });
  } catch (eRS) {}

  /* ⚠ 键盘**不拦**。拦了连酒馆自己的输入框都打不出字 ——
     挡板只负责「这张卡暂时不能用」，不该把整个 SillyTavern 一起锁死。 */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  try { console.info('[春日狂想曲] 玩家通道维护中：本版只显示「发生故障 · 正在修复中」，不发起任何网络请求。'); } catch (eC) {}
})();
