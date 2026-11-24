/* ============================================================
   酒馆游戏壳·独立顶层全屏视窗劫持器
   功能：将游戏节点直接搬运至 body 顶层独立弹窗，彻底杜绝酒馆黑边，
         内存引用不变，变量/事件完全互通。
   ============================================================ */
(function () {
'use strict';
/* ★ 2026-11-25：统一清单后各自门禁 —— 只在游戏版运行 */
try {
  if (typeof window.thUiModeIs === 'function' && !window.thUiModeIs('game')) return;
} catch (eGate) {}

var P = 'th_stage_portal';
var PORTAL_ID = P + '-overlay';
var TRIGGER_ID = P + '-trigger';
var STYLE_ID = P + '-styles';

var SVG = {
  enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};

var HOST = (function () {
  try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
  try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
  return window;
})();

function getDoc() { return HOST.document || document; }
function qs(s, c) { return (c || getDoc()).querySelector(s); }
function qa(s, c) { return Array.from((c || getDoc()).querySelectorAll(s)); }

function toast(msg) {
  try {
    if (typeof toastr !== 'undefined') { toastr.info(msg); return; }
    if (HOST.toastr && typeof HOST.toastr.info === 'function') { HOST.toastr.info(msg); return; }
  } catch (e) {}
  console.log('[舞台弹窗] ' + msg);
}

var STYLES = '<style id="' + STYLE_ID + '">' +
'#' + TRIGGER_ID + ' {' +
'  position: fixed !important; top: 68vh; right: 16px; width: 40px !important; height: 40px !important;' +
/* ★★★ 2026-11-18 21:5x：作者指的就是这颗球（截图：深蓝圆球 + 青色角标）——
   它跟卡的金棕主题完全不搭，而且他说的「圆角正方形」也不是圆的。
   改成：40×40 圆角方块（9px）+ 金棕渐变 + 细金边 + 米金字，和顶栏那颗「全屏」同色系。 */
'  border-radius: 9px !important;' +
'  background: linear-gradient(160deg, rgba(122,94,28,.92), rgba(58,44,12,.94)) !important;' +
'  border: 1px solid rgba(226,184,87,.62) !important;' +
'  box-shadow: 0 4px 16px rgba(0,0,0,.6), 0 0 14px rgba(226,184,87,.22) !important;' +
'  z-index: 1000001 !important; cursor: grab; display: flex !important;' +
'  align-items: center; justify-content: center; color: #fef3c7;' +
'  touch-action: none; user-select: none; transition: transform .16s, border-color .16s, box-shadow .16s;' +
'}' +
'#' + TRIGGER_ID + ':hover { transform: translateY(-1px) scale(1.04); color: #fff; border-color: #fcd34d !important; box-shadow: 0 6px 18px rgba(0,0,0,.6), 0 0 16px rgba(252,211,77,.32) !important; }' +
'#' + TRIGGER_ID + '.is-opened { color: #ffe4e6; background: linear-gradient(160deg, rgba(185,28,28,.95), rgba(127,29,29,.96)) !important; border-color: rgba(255,150,150,.72) !important; box-shadow: 0 4px 16px rgba(120,0,0,.6) !important; }' +
'#' + PORTAL_ID + ' {' +
'  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important;' +
'  background: #000 !important; z-index: 1000000 !important;' +
'  display: none; flex-direction: column !important; justify-content: space-between !important;' +
'  overflow: hidden !important; margin: 0 !important; padding: 0 !important;' +
'}' +
'#' + PORTAL_ID + '.active { display: flex !important; }' +
/* 弹窗内部：将移植过来的游戏节点强行拉伸满整个弹窗宽度，彻底抹掉左右空隙 */
'#' + PORTAL_ID + ' > #th-gal-shell-root, #' + PORTAL_ID + ' > .th-gal-shell-root {' +
'  width: 100vw !important; max-width: 100vw !important;' +
'  height: 100% !important; max-height: 100% !important;' +
'  margin: 0 !important; border: none !important; border-radius: 0 !important;' +
'  box-shadow: none !important; flex: 1 1 auto !important;' +
'}' +
'#' + PORTAL_ID + ' .th-gal-shell-viewport {' +
'  width: 100vw !important; max-width: 100vw !important;' +
'  flex: 1 1 auto !important; height: auto !important; max-height: none !important;' +
'  aspect-ratio: auto !important;' +
'}' +
'#' + PORTAL_ID + ' .th-gal-shell-bg-img {' +
'  width: 100vw !important; height: 100% !important;' +
'  object-fit: cover !important; object-position: center !important;' +
'}' +
/* ★ 11-14 18:00：作者要求手机宽度下**只显示一个立绘**。
   这一条已经在 10-core.js 的渲染代码里做掉了（thIsNarrowScreen → 只生成左位、
   舞台切 is-solo），所以竖屏全屏下根本不会再出现 .is-duo 双人舞台。
   之前给双人位压 48% 宽的整套 CSS 随之撤掉 —— 留着就是死代码，还容易误导。
   下面只保留「单人立绘防超宽被 overflow 切掉」这一层兜底，不改人物大小。
   现场单人 / 说话立绘层两个来源都覆盖。 */
'@media (orientation: portrait) {' +
'#' + PORTAL_ID + '.active .th-gal-standing-stage.is-solo .th-gal-standing-img, ' +
'#' + PORTAL_ID + '.active .th-gal-dlg-char-layer .th-gal-standing-img {' +
'  max-width: 92% !important; max-height: 82% !important;' +
'  object-fit: contain !important; object-position: bottom center !important;' +
'}' +
'}' +
'</style>';

var originalParent = null;
var originalNextSibling = null;

function openStagePortal() {
  var doc = getDoc();
  var shell = doc.querySelector('#th-gal-shell-root');
  var portal = doc.getElementById(PORTAL_ID);

  if (!shell) {
    toast('尚未检测到游戏界面，请先等待楼层生成');
    return;
  }
  if (!portal) return;

  // 记录原本在楼层中的挂载位置，方便还原
  if (!portal.contains(shell)) {
    originalParent = shell.parentNode;
    originalNextSibling = shell.nextSibling;
    // 物理节点移动：直接把已有节点移入全屏弹窗，内存与所有事件完全保留
    portal.appendChild(shell);
  }

  portal.classList.add('active');
  /* ★ v141：让核心的层管治 CSS 知道「现在在全屏里」，把所有弹层抬到容器之上 */
  try { doc.body.classList.add('th-stage-portal-on'); } catch (eCls) {}
  updateTriggerBtn(true);
  toast('已开启沉浸全屏弹窗');
}

function closeStagePortal() {
  var doc = getDoc();
  var shell = doc.querySelector('#th-gal-shell-root');
  var portal = doc.getElementById(PORTAL_ID);

  if (portal) portal.classList.remove('active');
  try { doc.body.classList.remove('th-stage-portal-on'); } catch (eCls2) {}

  // 将节点放回楼层原位
  if (shell && originalParent && portal && portal.contains(shell)) {
    try {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(shell, originalNextSibling);
      } else {
        originalParent.appendChild(shell);
      }
    } catch (e) {
      if (originalParent) originalParent.appendChild(shell);
    }
  }

  updateTriggerBtn(false);
  toast('已退出独立弹窗模式');
}

function toggleStagePortal() {
  var portal = getDoc().getElementById(PORTAL_ID);
  if (portal && portal.classList.contains('active')) {
    closeStagePortal();
  } else {
    openStagePortal();
  }
}

function updateTriggerBtn(isOpen) {
  var trigger = qs('#' + TRIGGER_ID);
  if (!trigger) return;
  if (isOpen) {
    trigger.classList.add('is-opened');
    trigger.innerHTML = SVG.exit;
    trigger.title = '退出独立弹窗';
  } else {
    trigger.classList.remove('is-opened');
    trigger.innerHTML = SVG.enter;
    trigger.title = '开启无黑边独立弹窗';
  }
}

// 指针捕获与拖拽、点击分离机制
function initDrag(target, options) {
  options = options || {};
  var handle = options.handle ? target.querySelector(options.handle) : target;
  if (!handle) return;
  var sx, sy, ix, iy, moving = false, moved = false;
  handle.style.touchAction = 'none';

  handle.onpointerdown = function(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moving = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    var r = target.getBoundingClientRect();
    ix = r.left; iy = r.top;
    handle.setPointerCapture(e.pointerId);
  };
  handle.onpointermove = function(e) {
    if (!moving) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
    if (moved) {
      var winW = (HOST.innerWidth || window.innerWidth);
      var winH = (HOST.innerHeight || window.innerHeight);
      target.style.left = Math.max(0, Math.min(ix + dx, winW - target.offsetWidth)) + 'px';
      target.style.top = Math.max(0, Math.min(iy + dy, winH - target.offsetHeight)) + 'px';
      target.style.right = 'auto'; target.style.bottom = 'auto';
    }
  };
  handle.onpointerup = function(e) {
    if (!moving) return;
    moving = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!moved && options.onClick) options.onClick();
  };
  handle.onpointercancel = function() { moving = false; };
}

function initPlugin() {
  var doc = getDoc();
  qa('#' + TRIGGER_ID + ', #' + PORTAL_ID + ', #' + STYLE_ID, doc).forEach(function(el) { el.remove(); });

  doc.head.insertAdjacentHTML('beforeend', STYLES);

  // 1. 建立独立的全屏弹窗视口，直接挂在 document.body 底下
  var portal = doc.createElement('div');
  portal.id = PORTAL_ID;
  doc.body.appendChild(portal);

  // 2. 建立入口悬浮球
  var trigger = doc.createElement('div');
  trigger.id = TRIGGER_ID;
  trigger.innerHTML = SVG.enter;
  doc.body.appendChild(trigger);

  initDrag(trigger, {
    onClick: function() {
      toggleStagePortal();
    }
  });

  // 支持键盘快捷键 Alt + F 快速唤出/关闭
  doc.addEventListener('keydown', function(e) {
    if (e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      toggleStagePortal();
    }
  });
}

/* ★ 11-14 17:20：给标题屏的「手机模式 / 电脑模式」一个可靠入口。
   以前 open/close 是 IIFE 私有函数，外部只能去模拟点击悬浮球，
   而悬浮球可能被拖动 / 被重画，点不中就是"点了没反应"。 */
try {
  (HOST || window).__TH_STAGE_PORTAL__ = {
    open: openStagePortal,
    close: closeStagePortal,
    toggle: toggleStagePortal,
    isOpen: function () {
      var p = getDoc().getElementById(PORTAL_ID);
      return !!(p && p.classList.contains('active'));
    }
  };
} catch (eApi) {}

if (getDoc().readyState === 'loading') {
  getDoc().addEventListener('DOMContentLoaded', initPlugin);
} else {
  initPlugin();
}
})();