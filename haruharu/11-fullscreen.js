/* 春日狂想曲·统一版 v1.51 · 11-fullscreen.js · 源脚本：[同层] 全屏 */
/* ============================================================
   酒馆游戏壳·独立顶层全屏视窗劫持器
   功能：将游戏节点直接搬运至 body 顶层独立弹窗，彻底杜绝酒馆黑边，
         内存引用不变，变量/事件完全互通。
   ============================================================ */
(function () {
'use strict';

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
'  position: fixed !important; top: 68vh; right: 16px; width: 38px !important; height: 38px !important;' +
'  border-radius: 50% !important; background: rgba(8, 14, 30, 0.9) !important;' +
'  border: 1.5px solid rgba(56, 189, 248, 0.45) !important;' +
'  box-shadow: 0 4px 16px rgba(0,0,0,0.6), 0 0 14px rgba(56,189,248,0.3) !important;' +
'  z-index: 1000001 !important; cursor: grab; display: flex !important;' +
'  align-items: center; justify-content: center; color: #38bdf8;' +
'  touch-action: none; user-select: none; transition: transform 0.2s;' +
'}' +
'#' + TRIGGER_ID + ':hover { transform: scale(1.1); color: #fbbf24; }' +
'#' + TRIGGER_ID + '.is-opened { color: #ef4444; border-color: rgba(239, 68, 68, 0.6); }' +
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

if (getDoc().readyState === 'loading') {
  getDoc().addEventListener('DOMContentLoaded', initPlugin);
} else {
  initPlugin();
}
})();