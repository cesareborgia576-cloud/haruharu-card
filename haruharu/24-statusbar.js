/* ══════════════════════════════════════════════════════════════════════════
   24-statusbar.js —— 文字版状态栏
   ★ 2026-11-25（作者：「状态栏直接全部删掉，把天元录的完全移植照抄过来」）

   完全照抄天元录《05-界面脚本》CORE-5 的**架构**：
     · 原生 DOM（#haru-status-host），**不用 iframe**
     · 挂在**最新 AI 楼的 .mes_text 里**（锚点后 / 否则最末端）
     · 1.5 秒 tick + **脏检查签名**（数据没变不重绘，绝不闪）
     · 事件**委托**在 host 上（节点重建也不丢点击）
     · 页签只渲染、不隐藏；切页签只改 state.tab，靠签名触发重绘
     · 数据源只读 MVU（Mvu.getMvuData）
   旧的那套（SB_HTML iframe + dock + 各种补丁）整份删除。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TOP = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e0) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e1) {}
    return window;
  })();
  function doc() { try { return TOP.document || document; } catch (e) { return document; } }

  var HOST_ID = 'haru-status-host';
  var STYLE_ID = 'haru-status-style';
  var MARK = 'data-haru-sb';
  var TABS = ['主角', '人物', '背包', '地点', '版本', '功能'];
  var state = { tab: 0, lastSig: '', busyUntil: 0 };

  var CSS = [
    '#' + HOST_ID + '{',
    '  --hb-bg:#171410; --hb-card:#211d16; --hb-line2:rgba(200,164,92,.22);',
    '  --hb-gold:#c8a45c; --hb-gold2:#e8cd96; --hb-text:#f0e6d2; --hb-muted:#b3a68c; --hb-dim:#8c8069;',
    '  position:relative; margin:10px 0 6px; padding:0; border-radius:14px;',
    '  width:100%; box-sizing:border-box;',
    '  background:linear-gradient(170deg,#1d1912,#15120d);',
    '  border:1px solid rgba(200,164,92,.28);',
    '  box-shadow:0 6px 20px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.02);',
    '  font-family:system-ui,-apple-system,"Noto Sans SC","Microsoft YaHei",sans-serif;',
    '  color:var(--hb-text); overflow:hidden; height:420px;',
    '}',
    '#' + HOST_ID + ' .hb-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;',
    '  background:linear-gradient(180deg,rgba(200,164,92,.08),rgba(200,164,92,.02));',
    '  border-bottom:1px solid var(--hb-line2);}',
    '#' + HOST_ID + ' .hb-tab{flex:0 0 auto;padding:5px 11px;border-radius:999px;cursor:pointer;',
    '  font-size:11.5px;font-weight:700;letter-spacing:.5px;color:var(--hb-muted);',
    '  border:1px solid transparent;user-select:none;line-height:1.4;}',
    '#' + HOST_ID + ' .hb-tab:hover{color:var(--hb-text);background:rgba(200,164,92,.08);}',
    '#' + HOST_ID + ' .hb-tab.on{color:#1a1610;background:linear-gradient(160deg,#e0b96f,#c8a45c);',
    '  border-color:#c8a45c;box-shadow:0 2px 8px rgba(200,164,92,.3);}',
    /* ★ 2026-11-25（作者）：有新版本时「版本」两个字必须发红光 */
    '#' + HOST_ID + ' .hb-tab.hb-new{color:#ff5f5f !important;',
    '  text-shadow:0 0 7px rgba(255,70,70,.95),0 0 14px rgba(255,40,40,.55);',
    '  animation:hbNewGlow 1.5s ease-in-out infinite;}',
    '@keyframes hbNewGlow{0%,100%{filter:drop-shadow(0 0 1px rgba(255,60,60,.5));}',
    '  50%{filter:drop-shadow(0 0 7px rgba(255,60,60,1));}}',
    '#' + HOST_ID + ' .hb-body{padding:8px 10px 9px;height:calc(420px - 44px);overflow-y:auto;box-sizing:border-box;}',
    '#' + HOST_ID + ' .hb-title{font-size:10.5px;font-weight:700;letter-spacing:1px;color:var(--hb-gold2);',
    '  margin:0 0 6px;}',
    '#' + HOST_ID + ' .hb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;}',
    '#' + HOST_ID + ' .hb-cell{padding:6px 9px;border-radius:9px;background:linear-gradient(165deg,#221d15,#1a1610);',
    '  border:1px solid rgba(200,164,92,.22);}',
    '#' + HOST_ID + ' .hb-k{font-size:10.5px;color:var(--hb-muted);letter-spacing:.4px;}',
    '#' + HOST_ID + ' .hb-v{font-size:12.5px;font-weight:700;color:var(--hb-text);margin-top:1px;word-break:break-all;}',
    '#' + HOST_ID + ' .hb-row{display:flex;align-items:center;gap:7px;padding:5px 2px;font-size:11.5px;',
    '  border-bottom:1px dashed rgba(200,164,92,.14);}',
    '#' + HOST_ID + ' .hb-row:last-child{border-bottom:0;}',
    '#' + HOST_ID + ' .hb-row b{flex:0 0 auto;color:var(--hb-muted);font-weight:600;min-width:62px;}',
    '#' + HOST_ID + ' .hb-row span{flex:1 1 auto;color:var(--hb-text);word-break:break-all;}',
    '#' + HOST_ID + ' .hb-btn{margin-left:auto;padding:4px 11px;border-radius:999px;cursor:pointer;',
    '  font-size:11px;font-weight:700;color:var(--hb-gold2);background:rgba(200,164,92,.14);',
    '  border:1px solid rgba(200,164,92,.45);}',
    '#' + HOST_ID + ' .hb-btn:hover{background:rgba(200,164,92,.26);color:#fff2d6;}',
    '#' + HOST_ID + ' .hb-char{padding:8px 10px;border-radius:10px;margin-bottom:7px;',
    '  background:linear-gradient(165deg,#221d15,#1a1610);border:1px solid rgba(200,164,92,.22);}',
    '#' + HOST_ID + ' .hb-char-h{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;}',
    '#' + HOST_ID + ' .hb-char-n{font-size:12.5px;font-weight:800;color:var(--hb-gold2);}',
    '#' + HOST_ID + ' .hb-pill{font-size:10px;padding:1px 7px;border-radius:999px;',
    '  background:rgba(159,192,138,.14);color:#b9d3a8;border:1px solid rgba(159,192,138,.35);}',
    '#' + HOST_ID + ' .hb-pill.off{background:rgba(255,255,255,.05);color:var(--hb-dim);border-color:rgba(255,255,255,.12);}',
    '#' + HOST_ID + ' .hb-mini{font-size:11px;color:var(--hb-muted);line-height:1.6;}',
    '#' + HOST_ID + ' .hb-empty{padding:18px 6px;text-align:center;font-size:11.5px;color:var(--hb-dim);}',
    '@media (max-width:480px){#' + HOST_ID + '{margin-top:9px;border-radius:12px;}',
    '  #' + HOST_ID + ' .hb-body{padding:8px 9px 10px;}',
    '  #' + HOST_ID + ' .hb-tab{padding:4px 9px;font-size:11px;}}',
    /* ★ 2026-11-26（作者：功能页要一个个格子，不要一条条） */
    '#' + HOST_ID + ' .hb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 2px;}',
    '#' + HOST_ID + ' .hb-cell{display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(200,164,92,.25);color:#f0e6d2;font-size:12.5px;cursor:pointer;text-align:center;line-height:1.3;}',
    '#' + HOST_ID + ' .hb-cell:hover{background:rgba(200,164,92,.14);}',
    '#' + HOST_ID + ' .hb-cell:active{transform:scale(.97);}',
    '#' + HOST_ID + ' .hb-cell.is-off{opacity:.55;}',
    '#' + HOST_ID + ' .hb-cell-st{margin-left:4px;font-style:normal;font-size:10.5px;padding:1px 6px;border-radius:999px;background:rgba(125,220,154,.2);color:#7ddc9a;}',
    '#' + HOST_ID + ' .hb-cell.is-off .hb-cell-st{background:rgba(200,120,120,.2);color:#d08b8b;}',
    /* ★ 2026-11-26（作者：气泡头像关闭后没关）：关气泡美化 = 去头像去气泡框，名字+话内联成普通正文 */
    'body.haru-no-bubble .thdl-wrap{display:block !important;margin:2px 0 !important;}',
    'body.haru-no-bubble .thdl-ava{display:none !important;}',
    'body.haru-no-bubble .thdl-main{display:inline !important;}',
    'body.haru-no-bubble .thdl-name{display:inline !important;font-size:inherit !important;font-weight:600 !important;color:inherit !important;margin:0 2px 0 0 !important;}',
    'body.haru-no-bubble .thdl-bubble{display:inline !important;background:none !important;border:0 !important;padding:0 !important;margin:0 !important;box-shadow:none !important;border-radius:0 !important;color:inherit !important;}'
  ].join('\n');

  /* ══════════ 正文美化：**完全照抄天元录《05-界面脚本》的卷轴美化** ══════════
     作者 2026-11-25：「正文美化只能照抄天元录的显现方式，别又自己造」。
     ── 天元录的做法（结构一个字节不改，只把配色换成本卡的暗金）──
       · 纸 = `.mes_text` 自己：加一个类，CSS 直接给 padding / 圆角 / 纸纹
       · 宿主楼层 `.mes` 也加类：清掉 padding / 圆角 / 底色 / 边框，隐藏头像占位列
       · 上下沿是**零高度装饰件**：插两个空 div，用绝对定位画细线与菱花结
       · 状态栏不塞进纸里（作者点名），挂纸外，铺满楼层宽度
     ⚠ 禁令（天元录原文）：① 不给纸加不对称 padding；② 不搬 .mes_text 子节点；
       ③ 不抢 .mes_text 的 ::before/::after。 */
  var INK_CLS = 'haru-ink-scroll';
  var INK_MES = 'haru-ink-mes';
  var INK_MARK = 'data-haru-ink';
  var TEXT_SKIN_CSS = [
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + '{',
    '  position:relative; box-sizing:border-box !important; max-width:100% !important;',
    '  padding:18px 20px 16px !important;',
    '  margin:0 !important;',
    '  border-radius:16px !important;',
    '  color:#f0dfb8 !important;',
    '  border:0 !important; border-image:none !important;',
    '  background-color:#1a150c !important;',
    '  background-image:',
    '    linear-gradient(180deg,rgba(0,0,0,.45) 0,rgba(0,0,0,0) 9%,rgba(0,0,0,0) 91%,rgba(0,0,0,.45) 100%),',
    '    repeating-linear-gradient(0deg,rgba(255,215,120,.016) 0 1px,rgba(0,0,0,0) 1px 3px),',
    '    repeating-linear-gradient(90deg,rgba(255,215,120,.016) 0 1px,rgba(0,0,0,0) 1px 5px),',
    '    radial-gradient(130% 100% at 50% -10%,#241d10 0%,#1a150c 52%,#14100a 100%) !important;',
    '  background-repeat:no-repeat,repeat,repeat,no-repeat !important;',
    '  background-size:100% 100%,100% 3px,5px 100%,100% 100% !important;',
    '  box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),inset 0 0 0 1.5px rgba(212,175,55,.26),inset 0 0 30px rgba(0,0,0,.34) !important;',
    '}',
    'body.haru-txt-mode .mes.' + INK_MES + '{',
    '  padding:0 !important; margin:10px 0 !important; border-radius:0 !important;',
    '  background:transparent !important; border-color:transparent !important; box-shadow:none !important;',
    '}',
    'body.haru-txt-mode .mes.' + INK_MES + ' .mes_block{padding:0 !important; margin:0 !important;}',
    'body.haru-txt-mode .mes.' + INK_MES + ' .mesAvatarWrapper{display:none !important;}',
    '.haru-ink-scroll q,.haru-ink-scroll q *{color:inherit !important;font-style:normal;}',
    '.haru-ink-top,.haru-ink-bot{position:relative;height:0;margin:0;}',
    '.haru-ink-top::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;',
    '  background:linear-gradient(90deg,rgba(0,0,0,0) 0,rgba(212,175,55,.55) 16px,rgba(212,175,55,.55) calc(100% - 16px),rgba(0,0,0,0) 100%);}',
    '.haru-ink-top::after{content:"";position:absolute;left:12%;right:12%;top:7px;height:1px;',
    '  background:linear-gradient(90deg,rgba(0,0,0,0),rgba(212,175,55,.22) 24%,rgba(212,175,55,.22) 76%,rgba(0,0,0,0));}',
    '.haru-ink-bot::before{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;',
    '  background:linear-gradient(90deg,rgba(0,0,0,0) 0,rgba(212,175,55,.55) 16px,rgba(212,175,55,.55) calc(100% - 16px),rgba(0,0,0,0) 100%);}',
    '.haru-ink-bot::after{content:"";position:absolute;left:50%;bottom:3px;width:7px;height:7px;',
    '  margin:0 0 0 -3.5px;transform:rotate(45deg);background:rgba(212,175,55,.55);',
    '  box-shadow:0 0 12px rgba(212,175,55,.3);}',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' b,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' strong{color:#ffe9a8 !important;}',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' em,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' i{color:#e8c884 !important;}',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' hr{border:0;border-top:1px solid rgba(212,175,55,.22);}',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' .bubble,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' .dialogue,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' .chat-bubble,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' blockquote{',
    '  background:rgba(212,175,55,.10) !important; border:1px solid rgba(212,175,55,.5) !important;',
    '  border-left:3px solid rgba(255,215,120,.75) !important; border-radius:12px !important;',
    '  padding:8px 12px !important; margin:8px 0 !important; color:#f6e7c2 !important;',
    '  box-shadow:0 2px 10px rgba(0,0,0,.45) !important;',
    '}',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' img,',
    'body.haru-txt-mode #chat .mes:not([is_user="true"]) .mes_text.' + INK_CLS + ' video{',
    '  max-width:100% !important; height:auto !important;',
    '  border:1px solid rgba(212,175,55,.45) !important; border-radius:12px !important; background:#14100a !important;',
    '}',
    'body.haru-no-skin #chat .mes .mes_text.' + INK_CLS + '{',
    '  padding:0 !important; margin:0 !important; border:0 !important; border-image:none !important;',
    '  border-radius:0 !important; background:none !important; box-shadow:none !important;',
    '  color:inherit !important;',
    '}',
    'body.haru-no-skin .haru-ink-top,body.haru-no-skin .haru-ink-bot{display:none !important;}'
  ].join('\n');

  function inkOn() {
    try { return localStorage.getItem('haru_no_skin') !== '1'; } catch (e) { return true; }
  }
  function inkHasBody(t) {
    try {
      if (!t) return false;
      if (String(t.textContent || '').trim()) return true;
      return !!(t.querySelector('img,iframe,video,canvas,table'));
    } catch (e) { return false; }
  }
  function inkStrip(mes, t) {
    try { mes.classList.remove(INK_MES); } catch (e0) {}
    try { t.classList.remove(INK_CLS); } catch (e1) {}
    try {
      var a = t.querySelectorAll('.haru-ink-top,.haru-ink-bot');
      for (var i = 0; i < a.length; i++) a[i].remove();
    } catch (e2) {}
    try { t.removeAttribute(INK_MARK); } catch (e3) {}
  }
  function inkApply() {
    var d = doc();
    if (!d || !d.body) return;
    var on = inkOn();
    /* 游戏版不装卷轴（body 没有 haru-txt-mode）—— 壳里那套界面不用正文美化 */
    try { if (!d.body.classList.contains('haru-txt-mode')) on = false; } catch (eMode) {}
    var list;
    try { list = d.querySelectorAll('#chat .mes'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var mes = list[i];
      try {
        if (mes.classList && mes.classList.contains('is_user')) continue;
        if (mes.getAttribute && mes.getAttribute('is_user') === 'true') continue;
      } catch (eU) {}
      var t = null;
      try { t = mes.querySelector('.mes_text'); } catch (eT) {}
      if (!t) continue;
      if (!on || !inkHasBody(t)) { inkStrip(mes, t); continue; }
      try {
        mes.classList.add(INK_MES);
        t.classList.add(INK_CLS);
        t.setAttribute(INK_MARK, '1');
        if (!t.querySelector('.haru-ink-top')) {
          var top = d.createElement('div');
          top.className = 'haru-ink-top';
          var first = null;
          for (var k = 0; k < t.childNodes.length; k++) {
            var nd = t.childNodes[k];
            if (nd.nodeType === 1) {
              var tn = String(nd.tagName || '').toLowerCase();
              if (tn === 'script' || tn === 'style' || tn === 'link') continue;
              first = nd; break;
            } else if (nd.nodeType === 3 && String(nd.nodeValue || '').trim()) { first = nd; break; }
          }
          if (first) t.insertBefore(top, first); else t.appendChild(top);
        }
        if (!t.querySelector('.haru-ink-bot')) {
          var bot = d.createElement('div');
          bot.className = 'haru-ink-bot';
          t.appendChild(bot);
        }
      } catch (eS) {}
    }
  }

  function injectTextSkin() {
    try {
      var d = doc();
      if (!d || !d.head || !d.body) return;
      if (!d.getElementById('haru-txt-skin')) {
        var st = d.createElement('style');
        st.id = 'haru-txt-skin';
        st.textContent = TEXT_SKIN_CSS;
        d.head.appendChild(st);
      }
      var hasGal = false;
      try { hasGal = !!d.getElementById('th-gal-shell-root'); } catch (eG) {}
      if (!hasGal) d.body.classList.add('haru-txt-mode');
      else d.body.classList.remove('haru-txt-mode');
      /* ★ 2026-11-25（作者：我原来的暗金正文美化呢）：默认就是暗金。
         樱花纸那套只有显式选了 haru_skin_variant=paper 才生效。 */
      var variant = 'gold';
      try { variant = localStorage.getItem('haru_skin_variant') || 'gold'; } catch (eV) {}
      d.body.classList.toggle('haru-skin-gold', variant !== 'paper');
      d.body.classList.toggle('haru-skin-paper', variant === 'paper');
      d.body.classList.toggle('haru-no-skin', localStorage.getItem('haru_no_skin') === '1');
      d.body.classList.toggle('haru-no-bubble', localStorage.getItem('haru_no_bubble') === '1');
    } catch (e) {}
  }

  /* ★ 2026-11-25（作者：状态栏为什么全是红字）：
     状态栏挂在 .mes_text 里，正文美化把 .mes_text 及所有 p/span/div 全刷成深红（#7a1f2b），
     而且 .mes_text 那条带 !important —— 状态栏自己的配色被整片压掉。
     这里给状态栏子树一套同样带 !important、但选择器更长（特异性更高）的色板，
     把「纸的红字」隔离在状态栏之外。 */
  var SKIN_FIX = [
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ',',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' *{color:#f0e6d2 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-k,',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-mini,',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-row b{color:#b3a68c !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-empty{color:#8c8069 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-title{color:#e8cd96 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-tab{color:#b3a68c !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-tab.on{color:#1a1610 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-tab.hb-new{color:#ff5f5f !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-char-n{color:#e8cd96 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-pill{color:#b9d3a8 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-pill.off{color:#8c8069 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-btn{color:#e8cd96 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-btn:hover{color:#fff2d6 !important;}',
    'body.haru-txt-mode #chat .mes #' + HOST_ID + ' .hb-toast{color:#fff2d6 !important;}'
  ].join('\n');

  function ensureStyle() {
    var d = doc();
    var old = d.getElementById(STYLE_ID);
    if (old && old.getAttribute && old.getAttribute('data-ver') === 'sb4') return;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = d.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('data-ver', 'sb4');
    st.textContent = CSS + '\n' + SKIN_FIX;
    (d.head || d.documentElement).appendChild(st);
  }

  function pickMvu() {
    var cands = [];
    try { cands.push(TOP); } catch (e0) {}
    cands.push(window);
    try { if (window.parent) cands.push(window.parent); } catch (e1) {}
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && cands[i].Mvu && typeof cands[i].Mvu.getMvuData === 'function') return cands[i].Mvu; } catch (e2) {}
    }
    try {
      var d = doc();
      var ifr = d.querySelectorAll('iframe');
      for (var j = 0; j < ifr.length; j++) {
        try {
          var w = ifr[j].contentWindow;
          if (w && w.Mvu && typeof w.Mvu.getMvuData === 'function') return w.Mvu;
        } catch (e3) {}
      }
    } catch (e4) {}
    return null;
  }
  function readSD() {
    try {
      var Mvu = pickMvu();
      if (!Mvu) return {};
      var d = null;
      try { d = Mvu.getMvuData({ type: 'message', message_id: 'latest' }); } catch (e1) {}
      if (!d) { try { d = Mvu.getMvuData({ type: 'chat' }); } catch (e2) {} }
      return (d && (d.stat_data || d.sata_data)) || {};
    } catch (e) { return {}; }
  }
  function pickFn(name) {
    var scopes = [];
    try { scopes.push(TOP); } catch (e0) {}
    scopes.push(window);
    try { if (window.parent) scopes.push(window.parent); } catch (e1) {}
    for (var i = 0; i < scopes.length; i++) {
      try { if (scopes[i] && scopes[i][name]) return scopes[i][name]; } catch (e2) {}
    }
    try {
      var d = doc();
      var ifr = d.querySelectorAll('iframe');
      for (var j = 0; j < ifr.length; j++) {
        try { var w = ifr[j].contentWindow; if (w && w[name]) return w[name]; } catch (e3) {}
      }
    } catch (e4) {}
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pageMain(sd) {
    var p = sd['主角信息'] || {};
    var g = sd['全局'] || {};
    var t = sd['时间'] || {};
    var loc = String(p['地点'] || '');
    var h = '<div class="hb-title">主角信息</div>';
    h += '<div class="hb-grid">';
    h += '<div class="hb-cell"><div class="hb-k">📍 当前地点</div><div class="hb-v">' + esc(loc || '—') + '</div></div>';
    h += '<div class="hb-cell"><div class="hb-k">💰 零花钱</div><div class="hb-v">¥' + esc(p['零花钱'] == null ? 0 : p['零花钱']) + '</div></div>';
    h += '<div class="hb-cell"><div class="hb-k">✨ 魅力值</div><div class="hb-v">' + esc(p['魅力值'] == null ? 0 : p['魅力值']) + ' / 100</div></div>';
    h += '<div class="hb-cell"><div class="hb-k">🔋 精力值</div><div class="hb-v">' + esc(p['精力值'] == null ? 0 : p['精力值']) + ' / 100</div></div>';
    h += '</div><div style="height:8px"></div>';
    var rows = [
      ['📅 第几天', t['第几天']],
      ['🌸 季节', g['季节']],
      ['🌤 天气', g['天气']],
      ['🕰 时间', (t['月份'] != null ? (t['月份'] + '/' + t['日期'] + ' ') : '') + (t['精确时间'] || '')],
      ['🗾 篇章', g['当前篇章']],
      ['🎭 模式', g['游戏模式']]
    ];
    for (var i = 0; i < rows.length; i++) {
      h += '<div class="hb-row"><b>' + rows[i][0] + '</b><span>' + esc(rows[i][1] == null || rows[i][1] === '' ? '—' : rows[i][1]) + '</span></div>';
    }
    /* ★ 2026-11-25（作者：信息也没展示完）：开局设置里填的玩家信息，之前一条都不显示。
       填了才出现，空着不占位。 */
    var player = [
      ['👤 姓名', p['玩家姓名']],
      ['🎂 年龄', p['玩家年龄']],
      ['🎭 性格', p['玩家性格']],
      ['👗 外貌', p['玩家外貌身材']]
    ];
    var hasP = false;
    for (var k = 0; k < player.length; k++) {
      if (player[k][1] != null && String(player[k][1]).trim() !== '') hasP = true;
    }
    if (hasP) {
      h += '<div class="hb-title" style="margin-top:9px;">玩家</div>';
      for (var j = 0; j < player.length; j++) {
        if (player[j][1] == null || String(player[j][1]).trim() === '') continue;
        h += '<div class="hb-row"><b>' + player[j][0] + '</b><span>' + esc(player[j][1]) + '</span></div>';
      }
    }
    return h;
  }

  function pageChars(sd) {
    var tbl = sd['主要角色列表'] || {};
    var names = Object.keys(tbl);
    var h = '<div class="hb-title">人物列表（' + names.length + '）</div>';
    if (!names.length) return h + '<div class="hb-empty">还没有角色</div>';
    var stFn = pickFn('__thStandingUrl');
    for (var i = 0; i < names.length; i++) {
      var n = names[i], c = tbl[n] || {};
      var on = c['在场状态'] === true;
      var pic = '';
      try { if (typeof stFn === 'function') pic = String(stFn(n) || ''); } catch (eP) {}
      h += '<div class="hb-char" style="display:flex;gap:9px;align-items:flex-start;">';
      if (pic) {
        h += '<div style="flex:0 0 auto;width:54px;height:66px;border-radius:9px;overflow:hidden;'
          + 'background:rgba(255,255,255,.04);border:1px solid rgba(200,164,92,.3);">'
          + '<img src="' + esc(pic) + '" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" loading="lazy" referrerpolicy="no-referrer">'
          + '</div>';
      }
      h += '<div style="flex:1 1 auto;min-width:0;">';
      h += '<div class="hb-char-h" style="margin-bottom:3px;"><span class="hb-char-n">' + esc(n) + '</span>'
        + '<span class="hb-pill' + (on ? '' : ' off') + '">' + (on ? '在场' : '不在场') + '</span></div>';
      h += '<div class="hb-mini">❤ 好感 ' + esc(c['好感度'] == null ? 0 : c['好感度'])
        + '　💀 恶堕 ' + esc(c['恶堕值'] == null ? 0 : c['恶堕值'])
        + '　⚠ 警惕 ' + esc(c['警惕值'] == null ? 0 : c['警惕值']) + '</div>';
      /* ★ 2026-11-25（作者：人物资料的心里话呢）：心里话是角色此刻的内心独白，展示完整 */
      if (c['心里话'] != null && String(c['心里话']).trim()) {
        h += '<div class="hb-mini" style="color:#e8c884;">💭 心里话：' + esc(c['心里话']) + '</div>';
      }
      h += '<div class="hb-mini">📍 ' + esc(c['地点'] || '—') + '　' + esc(c['正在做'] || '')
        + (c['具体正在做'] ? '：' + esc(c['具体正在做']) : '') + '</div>';
      h += '</div></div>';
    }
    return h;
  }

  function pageBag(sd) {
    var p = sd['主角信息'] || {};
    var bag = p['背包'] || {};
    var keys = Object.keys(bag);
    var h = '<div class="hb-title">背包（' + keys.length + '）</div>';
    if (!keys.length) return h + '<div class="hb-empty">背包是空的</div>';
    for (var i = 0; i < keys.length; i++) {
      var it = bag[keys[i]] || {};
      h += '<div class="hb-row"><b>' + esc(keys[i]) + '</b><span>'
        + esc(typeof it === 'object' ? (it['用途'] || it['物品名'] || '') : it) + '</span>'
        + '<span class="hb-btn" style="cursor:default">×' + esc(typeof it === 'object' ? (it['数量'] || 1) : 1) + '</span></div>';
    }
    return h;
  }

  function pagePlace(sd) {
    var p = sd['主角信息'] || {};
    var tbl = sd['主要角色列表'] || {};
    var here = String(p['地点'] || '');
    var h = '<div class="hb-title">地点</div>';
    var bg = '';
    try {
      var sf = pickFn('__thSceneBgUrl');
      if (typeof sf === 'function' && here) bg = String(sf(here) || '');
    } catch (eB) {}
    if (bg) {
      h += '<div style="border-radius:10px;overflow:hidden;border:1px solid rgba(200,164,92,.3);margin-bottom:8px;">'
        + '<img src="' + esc(bg) + '" style="width:100%;height:auto;display:block;" loading="lazy" referrerpolicy="no-referrer">'
        + '</div>';
    }
    h += '<div class="hb-cell" style="margin-bottom:8px"><div class="hb-k">📍 你在这里</div><div class="hb-v">' + esc(here || '—') + '</div></div>';
    h += '<div class="hb-row" style="border-bottom:0;padding:4px 2px;"><b>🗺 地图</b><span></span>'
      + '<span class="hb-btn" data-hb-act="map">打开地图</span></div>';
    var names = Object.keys(tbl).filter(function (n) { return tbl[n] && tbl[n]['在场状态'] === true; });
    h += '<div class="hb-title" style="margin-top:10px;">同场人物（' + names.length + '）</div>';
    if (!names.length) h += '<div class="hb-empty">没有同场的人</div>';
    for (var i = 0; i < names.length; i++) {
      var c = tbl[names[i]] || {};
      h += '<div class="hb-row"><b>' + esc(names[i]) + '</b><span>' + esc(c['地点'] || '—') + '　' + esc(c['正在做'] || '') + '</span></div>';
    }
    return h;
  }

  var LIVE = { text: '', seq: 0, at: 0 };
  function liveFetch() {
    try {
      var u = 'https://raw.githubusercontent.com/cesareborgia576-cloud/haruharu-card/main/haruharu/version.json?t=' + Date.now();
      fetch(u, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j) return;
        var t = String(j.label || j.version || '');
        if (t === LIVE.text) return;
        LIVE.text = t;
        LIVE.seq = Number(j.seq || 0) || 0;
        LIVE.at = Date.now();
        try { render(false); } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }
  function winGet(name) {
    var ws = [];
    try { ws.push(TOP); } catch (e0) {}
    ws.push(window);
    try { if (window.parent) ws.push(window.parent); } catch (e1) {}
    try {
      var d = doc();
      var ifr = d.querySelectorAll('iframe');
      for (var i = 0; i < ifr.length; i++) { try { ws.push(ifr[i].contentWindow); } catch (e2) {} }
    } catch (e3) {}
    for (var j = 0; j < ws.length; j++) {
      try { if (ws[j] && ws[j][name]) return ws[j][name]; } catch (e4) {}
    }
    return '';
  }
  function pageVersion() {
    /* ★ 2026-11-25：核心（10-core）在它自己的 iframe 里算好四项，广播到 top；
       状态栏只负责画。以前这里直接读 __SPR_*，作用域不同 ⇒ 卡版本/世界书全空。 */
    var snap = null;
    try {
      var fn = pickFn('__thStatusVer');
      if (typeof fn === 'function') snap = fn();
    } catch (e0) { snap = null; }
    var card = '', wb = '', run = '', live = '';
    if (snap) {
      card = String(snap.card || '');
      wb = String(snap.wb || '');
      run = String(snap.run || '');
      live = String(snap.live || '');
    }
    if (!card) card = String(winGet('__SPR_CARD_VER') || winGet('__SPR_CARD_VER__') || winGet('__TH_WB_EXPECT_VER__') || '');
    if (!wb) {
      var wbWant = String(winGet('__TH_WB_EXPECT_VER__') || '');
      wb = wbWant || '—';
    }
    if (!run) {
      var fx = Number(winGet('__SPR_HOT_FIXNO__') || 0) || Number(winGet('__SPR_LOCAL_FIXNO__') || 0) || 0;
      var ver = String(winGet('__SPR_HOT_VER__') || '');
      run = ver ? (ver + (fx ? '（第 ' + fx + ' 次更新）' : '')) : String(winGet('__SPR_CARD_LABEL__') || '');
    }
    if (!live) live = LIVE.text || String(winGet('__SPR_HOT_LABEL__') || '');
    var h = '<div class="hb-title">版本与变量</div>';
    h += '<div class="hb-row"><b>卡版本</b><span>' + esc(card || '—') + '</span></div>';
    h += '<div class="hb-row"><b>世界书</b><span>' + esc(wb || '—') + '</span></div>';
    h += '<div class="hb-row"><b>运行中</b><span>' + esc(run || '—') + '</span></div>';
    h += '<div class="hb-row"><b>线上版本</b><span>' + esc(live || '（读取中…）') + '</span></div>';
    return h;
  }

  function pageFunc() {
    var items = [
      ['🩺 变量自愈', 'heal'],
      ['🕘 历史楼层', 'floors'],
      ['🔧 修改器', 'cheat'],
      ['🕸 关系网', 'relnet'],
      ['📜 回忆', 'recall'],
      ['🚫 插图屏蔽', 'illblk'],
      ['🎨 正文美化', 'skin'],
      ['💬 气泡头像美化', 'bubble']
    ];
    var h = '<div class="hb-title">功能</div><div class="hb-grid">';
    for (var i = 0; i < items.length; i++) {
      var act = items[i][1], cls = 'hb-cell', st = '';
      /* 美化开关显示「开/关」状态；其余是「打开面板」 */
      if (act === 'skin') { var off = false; try { off = localStorage.getItem('haru_no_skin') === '1'; } catch (e) {} cls += off ? ' is-off' : ' is-on'; st = off ? '关' : '开'; }
      else if (act === 'bubble') { var off2 = false; try { off2 = localStorage.getItem('haru_no_bubble') === '1'; } catch (e) {} cls += off2 ? ' is-off' : ' is-on'; st = off2 ? '关' : '开'; }
      else if (act === 'illblk') { var bi = false; try { bi = localStorage.getItem('SPR_ILLUST_BLOCK') === '1'; } catch (e) {} cls += bi ? ' is-off' : ' is-on'; st = bi ? '屏蔽' : '显示'; }
      h += '<button type="button" class="' + cls + '" data-hb-act="' + act + '">' + items[i][0] + (st ? '<i class="hb-cell-st">' + st + '</i>' : '') + '</button>';
    }
    h += '</div>';
    return h;
  }

  function renderTab(sd) {
    try {
      switch (state.tab) {
        case 0: return pageMain(sd);
        case 1: return pageChars(sd);
        case 2: return pageBag(sd);
        case 3: return pagePlace(sd);
        case 4: return pageVersion();
        case 5: return pageFunc();
        default: return pageMain(sd);
      }
    } catch (e) { return '<div class="hb-empty">渲染出错：' + esc(e && e.message) + '</div>'; }
  }

  function lastAiMes() {
    try {
      var d = doc();
      var list = d.querySelectorAll('#chat .mes');
      for (var i = list.length - 1; i >= 0; i--) {
        var el = list[i];
        if (el.classList && el.classList.contains('is_user')) continue;
        if (el.getAttribute && el.getAttribute('is_user') === 'true') continue;
        return el;
      }
    } catch (e) {}
    return null;
  }

  function ensureHost() {
    var d = doc();
    var mes = lastAiMes();
    if (!mes) return null;
    /* ★ 2026-11-25（作者：正文美化把状态栏套进去了 / 别把状态栏弄窄）：
       以前挂在 .mes_text 里 ⇒ 纸的 padding(18px 22px) 把它挤窄，还整块被纸边框包住。
       现在挂到 .mes_text 的**兄弟位置**（.mes_block 末尾）：正文照旧是暗金纸，
       状态栏在纸外、占满整条消息宽度。
       ⚠ 已就位就绝不重排 —— 每 1.5 秒 tick 都把节点搬一次，聊天就会闪/回弹。 */
    var textEl = mes.querySelector('.mes_text') || null;
    var box = (textEl && textEl.parentNode) ? textEl.parentNode : mes;
    var host = d.getElementById(HOST_ID);
    if (!host) {
      host = d.createElement('div');
      host.id = HOST_ID;
      host.setAttribute(MARK, '1');
      if (textEl && textEl.parentNode === box) box.insertBefore(host, textEl.nextSibling);
      else box.appendChild(host);
      bindEvents(host);
    } else if (host.parentNode !== box) {
      /* 换楼/重建：搬一次就够，之后位置判定为「已就位」直接跳过 */
      try {
        if (textEl && textEl.parentNode === box) box.insertBefore(host, textEl.nextSibling);
        else box.appendChild(host);
      } catch (eM) {}
    } else if (textEl && textEl.nextElementSibling !== host) {
      /* 正文后面插进了别的东西（开局面板等）→ 只在真的不在原位时挪一次 */
      try { box.insertBefore(host, textEl.nextSibling); } catch (eOrd) {}
    }
    try {
      var all = d.querySelectorAll('#' + HOST_ID);
      for (var i = 0; i < all.length; i++) if (all[i] !== host) all[i].remove();
    } catch (eR) {}
    return host;
  }

  function bindEvents(host) {
    try {
      host.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var tab = t.closest ? t.closest('.hb-tab') : null;
        if (tab) {
          var idx = Number(tab.getAttribute('data-hb-tab'));
          if (isFinite(idx) && idx !== state.tab) {
            state.tab = idx;
            state.lastSig = '';
            render(true);
          }
          return;
        }
        var act = t.closest ? t.closest('[data-hb-act]') : null;
        if (act) {
          state.busyUntil = Date.now() + 700;
          runAct(act.getAttribute('data-hb-act'));
        }
      }, true);
    } catch (e) {}
  }

  function toast(msg) {
    try { if (typeof TOP.popToast === 'function') { TOP.popToast(msg); return; } } catch (e0) {}
    try { if (typeof TOP.showToast === 'function') { TOP.showToast(msg, 2400); return; } } catch (e1) {}
    try { console.log('[状态栏] ' + msg); } catch (e2) {}
  }

  function runAct(a) {
    try {
      if (a === 'heal') {
        var f = pickFn('__openMvuPanel');
        if (typeof f === 'function') { f(); return; }
        toast('变量自愈模块未就绪'); return;
      }
      if (a === 'relnet') {
        var r = pickFn('__TH_RELNET__');
        if (r && typeof r.open === 'function') { r.open(); return; }
        toast('关系网模块未就绪'); return;
      }
      if (a === 'floors' || a === 'recall') {
        /* ★ 2026-11-25（作者：查看历史楼层调用的是回忆的）：
           两条路彻底分开。floors = 游戏版 10-core 的 openHistorySheet（可看 / 改 / 删）；
           recall = 27-recall 的回忆播放。绝不再用 || 混着抓。 */
        var rc = (a === 'floors')
          ? pickFn('__TH_FLOORS__')
          : pickFn('__TH_RECALL__');
        if (rc && typeof rc.open === 'function') { rc.open(a === 'recall' ? 'recall' : 'history'); return; }
        toast((a === 'floors' ? '历史楼层' : '回忆') + '模块未就绪'); return;
      }
      if (a === 'reloadimg') {
        var d = doc();
        var imgs = d.querySelectorAll('#chat .mes_text img');
        for (var i = 0; i < imgs.length; i++) {
          var im = imgs[i], s = im.getAttribute('src');
          if (s) { im.removeAttribute('src'); (function (n, u) { setTimeout(function () { n.setAttribute('src', u); }, 30); })(im, s); }
        }
        toast('已重载 ' + imgs.length + ' 张图片'); return;
      }
      if (a === 'cheat') {
        var ch = pickFn('__TH_CHEAT__');
        if (ch && typeof ch.open === 'function') { ch.open(); return; }
        toast('修改器模块未就绪'); return;
      }
      if (a === 'map') {
        var mf = pickFn('__thMapOpen');
        if (typeof mf === 'function') { mf(); return; }
        toast('地图模块未就绪'); return;
      }
      if (a === 'illblk' || a === 'sprblk') {
        var isIll = (a === 'illblk');
        var on = pickFn(isIll ? 'thIllustBlockOn' : 'thSpriteBlockOn');
        var ap = pickFn('thApplyIllustBlock');
        var cur = false;
        try { cur = !!(on && on()); } catch (e2) {}
        try { localStorage.setItem(isIll ? 'SPR_ILLUST_BLOCK' : 'SPR_SPRITE_BLOCK', cur ? '0' : '1'); } catch (e3) {}
        try { if (typeof ap === 'function') ap(); } catch (e4) {}
        /* ★ 2026-11-26：正文里的插图块归 22 管，10-core 的 thApplyIllustBlock
           只管游戏版那一套 —— 文字版必须让 22 当场撤块重扫，不然按了没反应。 */
        try { var ab = pickFn('__thIlluApplyBlock'); if (typeof ab === 'function') ab(); } catch (e5) {}
        toast((isIll ? '插图屏蔽' : '立绘屏蔽') + '：' + (cur ? '已关闭' : '已开启'));
        try { render(true); } catch (eILR) {}
        return;
      }
      if (a === 'skin') {
        /* 正文美化（暗金卷轴）开关：关掉就撤纸，开回来就装纸 */
        var offSkin = false;
        try { offSkin = localStorage.getItem('haru_no_skin') === '1'; } catch (eS0) {}
        try { localStorage.setItem('haru_no_skin', offSkin ? '0' : '1'); } catch (eS1) {}
        try { injectTextSkin(); } catch (eS2) {}
        try { inkApply(); } catch (eS3) {}
        toast('正文美化：' + (offSkin ? '已开启' : '已关闭'));
        try { render(true); } catch (eSR) {}
        return;
      }
      if (a === 'bubble') {
        /* 气泡头像美化开关：切换 body.haru-no-bubble，并重渲染一遍 21-avatar 气泡 */
        var offBub = false;
        try { offBub = localStorage.getItem('haru_no_bubble') === '1'; } catch (eB0) {}
        try { localStorage.setItem('haru_no_bubble', offBub ? '0' : '1'); } catch (eB1) {}
        try { injectTextSkin(); } catch (eB2) {}
        try { var rr = pickFn('__thAvatarRerender'); if (typeof rr === 'function') rr(); } catch (eB3) {}
        toast('气泡头像美化：' + (offBub ? '已开启' : '已关闭'));
        try { render(true); } catch (eBR) {}
        return;
      }
      if (a === 'music') {
        var bc = pickFn('__thBgmCtrl');
        var on = null; try { on = (bc && bc.toggle) ? bc.toggle() : null; } catch (eM0) {}
        if (on === null) { toast('音乐模块未就绪'); return; }
        /* ★ 2026-11-26：状态一律以音频元素真实状态为准，别拿乐观返回值糊弄玩家 */
        var inf = {}; try { inf = bc.info ? bc.info() : {}; } catch (eM1) {}
        var playing = (typeof inf.playing === 'boolean') ? inf.playing : !!on;
        var msg = (playing ? '▶ 播放' : '⏸ 暂停') + (inf.name ? '：' + inf.name : '');
        if (!playing && on === true) msg = '浏览器拦截了自动播放，再点一次';
        toast(msg);
        try { render(true); } catch (eM2) {}
        return;
      }
    } catch (e) {}
  }

  /* ★ 2026-11-25：有没有新版本（「版本」两个字发红光用）。
     8 秒缓存 —— 快照会读世界书条目，不能每 1.5 秒都跑一遍。 */
  var verNew = { at: 0, has: false };
  function readVerNew() {
    var now = Date.now();
    if (verNew.at && (now - verNew.at) < 8000) return verNew.has;
    var has = false;
    try {
      var fn = pickFn('__thStatusVer');
      if (typeof fn === 'function') {
        var snap = fn();
        has = !!(snap && snap.newer);
      }
    } catch (e0) {}
    verNew.at = now; verNew.has = has;
    return has;
  }

  function render(force) {
    try {
      ensureStyle();
      injectTextSkin();
      if (!force && Date.now() < state.busyUntil) return;
      var sd = readSD();
      var host = ensureHost();
      if (!host) return;
      var isNew = readVerNew();
      var sig = JSON.stringify([state.tab, isNew, sd['主角信息'], sd['主要角色列表'], sd['背包'], sd['时间'], sd['全局']]);
      if (!force && sig === state.lastSig) return;
      state.lastSig = sig;
      var oldBody = host.querySelector('.hb-body');
      var keepTop = oldBody ? oldBody.scrollTop : 0;
      var tabs = '<div class="hb-tabs">';
      for (var i = 0; i < TABS.length; i++) {
        var cls = 'hb-tab';
        if (i === state.tab) cls += ' on';
        if (i === 4 && isNew) cls += ' hb-new';
        tabs += '<span class="' + cls + '" data-hb-tab="' + i + '"'
          + (i === 4 && isNew ? ' title="有新版本可用"' : '') + '>' + TABS[i] + '</span>';
      }
      tabs += '</div>';
      host.innerHTML = tabs + '<div class="hb-body">' + renderTab(sd) + '</div>';
      if (keepTop) {
        var nb = host.querySelector('.hb-body');
        if (nb) nb.scrollTop = keepTop;
      }
    } catch (e) {}
  }

  function tick() { try { inkApply(); } catch (e0) {} try { render(false); } catch (e) {} }

  try { render(true); } catch (e0) {}
  try { liveFetch(); setInterval(liveFetch, 60000); } catch (eLF) {}
  try { setInterval(tick, 1500); } catch (e1) {}
  try {
    var d0 = doc();
    if (d0 && d0.body && typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { try { render(false); } catch (e) {} });
      mo.observe(d0.body, { childList: true, subtree: true });
    }
  } catch (e2) {}
})();
