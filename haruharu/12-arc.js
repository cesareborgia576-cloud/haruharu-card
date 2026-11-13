/* 春日狂想曲·统一版 v1.50 · 12-arc.js · 源脚本：[同层] 篇章切换控制器 */
/* ============================================================
   篇章切换控制器 —— v116 顶栏扁框版

   以前：自己在 body 上挂一个 position:fixed 的紫色悬浮胶囊，
         可拖拽，并且自己写 getCurrentArc / nextArcOf / setCurrentArc 一整套判据。
   现在（用户要求「显示当前篇章那个悬浮球，改成内置在脚本里面，也就是扁框」）：
         · 外观 DOM 由核心的 buildShellDOM 负责（顶栏右侧一颗 .th-gal-btn-arc）
         · 外观刷新由核心的 paintArcBtn（导出为 __thPaintArcBtn）负责
         · 真正的换线由核心的 __thSwitchArc 负责
         · 这个脚本只干一件事：**接线**（谁点了 → 调核心换线 → 给个 toast）

   ⚠ 判据必须单一（铁律八）：
     本脚本**没有** getCurrentArc / setCurrentArc / 落地点表 / 变量写入，
     也没有第二份按钮外观代码。读用 __thCurrentArc / __thNextArc，
     写用 __thSwitchArc，刷外观用 __thPaintArcBtn —— 全部是核心那一份。

   ⚠ 为什么不再用 position:fixed 自己造按钮：
     ① 悬浮胶囊挡住游戏画面（全屏时尤其明显）；
     ② 壳被酒馆重画之后，body 上那颗还赖着不走，于是出现
        「切了篇章但按钮文字不更新」—— 根因是两颗按钮各刷各的。
     挂进壳里之后，壳重建按钮跟着重建，天然自愈。
   ============================================================ */
(function () {
  'use strict';

  var HOST = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
    return window;
  })();

  function getDoc() { return HOST.document || document; }

  function toast(msg, type) {
    type = type || 'info';
    try {
      if (typeof toastr !== 'undefined' && typeof toastr[type] === 'function') { toastr[type](msg); return; }
      if (HOST.toastr && typeof HOST.toastr[type] === 'function') { HOST.toastr[type](msg); return; }
    } catch (e) {}
    console.log('[篇章切换控制器] ' + msg);
  }

  /* 核心导出的接口：全部从 HOST 上取，取不到就是核心还没就绪 */
  function getApi() {
    var cands = [HOST, window];
    for (var i = 0; i < cands.length; i++) {
      var w = cands[i];
      if (w && typeof w.__thSwitchArc === 'function') {
        return {
          switchArc: w.__thSwitchArc,
          currentArc: (typeof w.__thCurrentArc === 'function') ? w.__thCurrentArc : null,
          nextArc: (typeof w.__thNextArc === 'function') ? w.__thNextArc : null,
          paint: (typeof w.__thPaintArcBtn === 'function') ? w.__thPaintArcBtn : null,
          /* ★ v117：切完往输入框追加那一行。文案在核心，这里只调。 */
          appendNote: (typeof w.__thAppendArcNote === 'function') ? w.__thAppendArcNote : null,
          /* 篇章显示名：核心那一份（arcDisplayName），这里绝不再抄一个 map */
          displayName: (typeof w.__thArcDisplayName === 'function') ? w.__thArcDisplayName : null
        };
      }
    }
    return null;
  }

  function shellEl() { return getDoc().querySelector('#th-gal-shell-root'); }
  function arcBtn() {
    var shell = shellEl();
    return shell ? shell.querySelector('.th-gal-btn-arc') : null;
  }

  /* 外观刷新：只调核心那一份，绝不自己抄一遍 */
  function repaint() {
    var api = getApi();
    var shell = shellEl();
    if (!shell) return;
    if (api && api.paint) { try { api.paint(shell); return; } catch (e) {} }
    /* 核心的 paintArcBtn 不在（老版本核心）：什么都不做，也不自己瞎写。
       这样至少不会出现「两处外观打架」，退化成「外观不刷」这种明显症状。 */
  }

  var busy = false;

  function onArcBtnClick(btn) {
    if (busy) return;
    var api = getApi();
    if (!api) {
      toast('核心脚本还没就绪，稍等一下再点（篇章切换要它来换场景）', 'warning');
      return;
    }
    var cur = api.currentArc ? api.currentArc() : '';
    var next = api.nextArc ? api.nextArc(cur) : '';
    if (!next) { toast('拿不到下一个篇章，这次点击已跳过', 'warning'); return; }

    busy = true;
    try { if (btn) btn.classList.add('is-switching'); } catch (eC) {}

    var res = null;
    try {
      /* ★ 关键：rewriteGreeting=false —— 只换线，不动当前这一楼的正文和第 0 楼开场白。
         玩家正玩着点一下按钮，不该把正在看的剧情冲掉。 */
      res = api.switchArc(next, { rewriteGreeting: false });
    } catch (eSw) {
      try { console.error('[篇章切换] 换线失败:', eSw); } catch (e1) {}
    }

    try { if (btn) btn.classList.remove('is-switching'); } catch (eC2) {}
    repaint();

    /* ★ v117：往输入框追加「已切换篇章【XXX】」。
       用户原话：「点击篇章切换按钮之后，会在输入框里追加一个已经切换篇章【xxxx】。
                 这样子正文 ai 就会知道是转移场景了。」
       为什么要往输入框塞：AI 看不见我们改的变量，只看得见聊天楼层。
       不告诉它一声，下一轮它还会接着在原来的地方写。
       ⚠ 只放进输入框，**不自动发送** —— 发不发、什么时候发归玩家。 */
    var noted = false;
    if (res && res.patchOk && api.appendNote) {
      try { noted = !!api.appendNote(next); } catch (eNote) {
        try { console.warn('[篇章切换] 追加输入框失败：' + eNote); } catch (eN2) {}
      }
    }

    var name = api.displayName ? api.displayName(next) : next;
    if (res && res.patchOk) {
      toast('已前往【' + name + '】一带\n三处地方在同一个世界里，人物与进度都没断，只换了落脚点。'
        + (noted ? '\n输入框里已追加一行切换提示，点发送 AI 就知道换地方了。' : ''), 'success');
    } else {
      toast('试过切换为【' + name + '】，但变量没写进去（看看 MVU 是不是卡住了）', 'warning');
    }

    setTimeout(function () { busy = false; }, 600);
  }

  /* ══ 接线：壳会被酒馆反复重画，所以不能只绑一次 ══
     用「事件委托 + 顶层挂一次」：任何时刻重建出来的 .th-gal-btn-arc 都会被接住，
     不会重复绑（以前每 mount 一次就 addEventListener 一次，点一下换三次篇章）。 */
  var BOUND_FLAG = '__thArcBtnDelegated';

  function bindDelegate() {
    var doc = getDoc();
    if (!doc || !doc.body) return false;
    if (doc[BOUND_FLAG]) return true;
    doc[BOUND_FLAG] = true;

    doc.addEventListener('click', function (ev) {
      var node = ev.target;
      for (var i = 0; i < 5 && node; i++) {
        if (node.classList && node.classList.contains('th-gal-btn-arc')) {
          ev.stopPropagation();
          ev.preventDefault();
          try { if (HOST.PixelAudio && typeof HOST.PixelAudio.playSelect === 'function') HOST.PixelAudio.playSelect(); } catch (eA) {}
          onArcBtnClick(node);
          return;
        }
        node = node.parentNode;
      }
    }, true);
    return true;
  }

  /* 只在「按钮还没被核心刷过」时补一次，避免跟核心的每轮刷新打架 */
  var PAINTED = 'data-arc-painted';
  function tick() {
    var api = getApi();
    if (!api || !api.paint) return;      /* 核心不在 / 没有外观函数 → 不碰按钮 */
    var btn = arcBtn();
    if (!btn) return;
    if (!btn.getAttribute(PAINTED)) {
      repaint();
      try { btn.setAttribute(PAINTED, '1'); } catch (e) {}
    }
  }

  function mount() {
    if (!bindDelegate()) return;
    try { tick(); } catch (eT) {}
  }

  if (getDoc().readyState === 'loading') {
    getDoc().addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  setTimeout(mount, 1200);
  /* ⚠ 这里故意**不再**每 2.5 秒重刷外观：外观归核心的 paintArcBtn（每轮 updateContainer 跑）。
     以前两边都刷，谁后跑谁说话，玩家看到的就是「按钮文字偶尔回退一下」。 */
  setInterval(function () { try { tick(); } catch (e) {} }, 1500);

  /* 调试入口：控制台能直接看这套接上没接上 */
  try {
    HOST.__thArcSwitcher = {
      version: 'v116-topbar',
      api: getApi,
      btn: arcBtn,
      click: function () { onArcBtnClick(arcBtn()); }
    };
  } catch (eDbg) {}
})();
