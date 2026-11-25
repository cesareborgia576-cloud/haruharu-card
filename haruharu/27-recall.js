/* ══ 回忆模式（[共用] · 两种模式都加载）════════════════════════════════
   作者：「回忆模式就是类似于黄油那种，就纯看对话，纯看 cg，其他界面区别没有，
   点击退出插图就是等于退出回忆模式，此时回到那个楼层界面。」

   ── 怎么做的 ──
   · 楼层列表：读 chat，只列 AI 楼层，每层显示摘要 + 这一层有哪些插图（动作名照原样）；
   · 点「回忆」：把那一楼的原文喂回**同一个**对话阅读器（DialogueReader）与**同一套**插图队列，
     所以界面和正常游玩一模一样，只是不放变量更新、不产生新楼层；
   · 退出：插图那颗 ✕（onCloseCg）→ 回忆模块收到 onCgClosed → 恢复最新一楼 + 重新打开楼层列表。
   ── 为什么必须走宿主桥 ──
   酒馆助手给每个脚本一个独立 iframe，DialogueReader 在核心那个 iframe 里，
   这里只能通过 window.top 上的 `__TH_RECALL_API__` / `__sprIllust` 去调。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var AT = null;
  var GROUPS = [];   /* 楼层分组：一次回复可能有多条消息，合成一层 */          /* 正在回忆第几楼；null = 没在回忆 */
  var MASK_ID = 'th-recall-mask';

  function TOP() { try { return window.top || window; } catch (e) { return window; } }
  function DOC() {
    try { if (window.top && window.top.document && window.top.document.body) return window.top.document; } catch (e) {}
    return document;
  }
  function pick(name) {
    var w = TOP();
    try { if (w[name]) return w[name]; } catch (e) {}
    try { if (window[name]) return window[name]; } catch (e2) {}
    return null;
  }
  function ctx() {
    try {
      var w = TOP();
      if (w.SillyTavern && typeof w.SillyTavern.getContext === 'function') return w.SillyTavern.getContext();
    } catch (e) {}
    try {
      if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') return window.SillyTavern.getContext();
    } catch (e2) {}
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* 这一楼有哪些插图：动作名照原样列出（手交就写手交） */
  function tagsOf(text) {
    var out = [], re = /<\s*插图\s*>([\s\S]*?)(?:<\s*\/\s*插图\s*>|$)/gi, m, guard = 0;
    while ((m = re.exec(String(text || ''))) !== null) {
      if (++guard > 64) break;
      var p = String(m[1] || '').split(/[|｜]/);
      if (p.length < 2) continue;
      out.push({ who: String(p[0] || '').trim(), act: String(p[1] || '').trim() });
    }
    return out;
  }
  function plain(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{[^{}\n]{1,24}\}/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function closeMask() {
    var d = DOC();
    var m = d.getElementById(MASK_ID);
    if (m) { try { m.remove(); } catch (e) {} }
  }

  function open() {
    var d = DOC();
    if (!d || !d.body) return;
    closeMask();
    var c = ctx();
    var chat = (c && c.chat) || [];

    /* ★ 2026-11-19：作者「一层楼分成了三楼」—— 一次回复在 chat 里可能是**多条**消息
       （思维链 / 正文 / 状态栏分开存，或模型一次吐了三条），逐条列就会一层变三层。
       现在按「**两个 user 之间算一层**」分组：连续的 AI 消息合成一层再列，播放也合成一段。 */
    /* ★★ 2026-11-19：一层还是三层的真因 ——
       每一轮除了正文，还有「极简要解读用户输入」这种**推演消息**，
       它们也是独立楼层（is_user=false）。按旧规则它们会各自成一层 ⇒ 一层变三层。
       现在：推演 / 解读消息不单独成层，先攒着，并入**下一层正文**；
       不带 <content> 且看不出是推演的，才当一层。 */
    function isDeduce(t) {
      var x = String(t || '');
      if (/<\s*content/i.test(x)) return false;
      return /极简要|解读用户输入|后台推演|推演结果/.test(x);
    }
    var groups = [];
    var cur = null;
    var pending = [];
    for (var gi = 0; gi < chat.length; gi++) {
      var gm = chat[gi];
      if (!gm) continue;
      if (gm.is_user) { cur = null; pending = []; continue; }
      var gt = String(gm.mes || '');
      if (!gt.trim()) continue;
      if (isDeduce(gt)) { pending.push(gt); continue; }
      if (!cur) { cur = { start: gi, texts: [] }; groups.push(cur); }
      if (pending.length) { cur.texts = cur.texts.concat(pending); pending = []; }
      cur.texts.push(gt);
    }

    GROUPS = groups;

    var rows = '';
    var idx = 0;
    for (var oi = 0; oi < groups.length; oi++) {
      var i = groups[oi].start;
      var t = groups[oi].texts.join('\n');
      idx++;
      var tags = tagsOf(t);
      /* 摘要优先取正文（带 <content> 的那段），拿不到才用整组 */
      var _body = '';
      for (var _bi = 0; _bi < groups[oi].texts.length; _bi++) {
        var _bt = groups[oi].texts[_bi];
        var _cm = /<\s*content[^>]*>([\s\S]*?)<\s*\/\s*content\s*>/i.exec(_bt);
        if (_cm && String(_cm[1]).trim()) { _body = String(_cm[1]); break; }
      }
      var snip = plain(_body || t).slice(0, 46).replace(/\n/g, ' ');
      var chips = tags.map(function (x) {
        return '<span style="display:inline-block;margin:2px 4px 0 0;padding:1px 7px;border-radius:999px;'
          + 'border:1px solid rgba(226,184,87,.5);background:rgba(122,94,28,.28);color:#fef3c7;font-size:10.5px;">'
          + esc(x.act) + '</span>';
      }).join('');
      rows += '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border-radius:10px;'
        + 'background:rgba(255,255,255,.03);border:1px solid rgba(217,187,122,.16);margin-bottom:7px;">'
        + '<div style="flex:0 0 34px;text-align:center;color:#c9bfae;font-size:11px;line-height:1.5;">'
        + '<div style="font-weight:800;color:#e6c884;">' + idx + '</div><div style="opacity:.6;">楼</div></div>'
        + '<div style="flex:1 1 auto;min-width:0;">'
        + '<div style="color:#ded4c4;font-size:12.5px;line-height:1.6;word-break:break-all;">' + esc(snip) + (plain(t).length > 46 ? '…' : '') + '</div>'
        + (chips ? '<div style="margin-top:4px;">' + chips + '</div>' : '')
        + '</div>'
        + '<button type="button" data-recall="' + oi + '" style="flex:0 0 auto;padding:5px 12px;border-radius:999px;'
        + 'border:1px solid rgba(226,184,87,.6);background:linear-gradient(160deg,rgba(122,94,28,.95),rgba(58,44,12,.95));'
        + 'color:#fef3c7;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">回忆</button>'
        + '</div>';
    }
    if (!rows) rows = '<div style="padding:26px;text-align:center;color:#8b8175;">还没有可以回忆的楼层</div>';

    var mask = d.createElement('div');
    mask.id = MASK_ID;
    mask.setAttribute('style', 'position:fixed;inset:0;z-index:2147483620;background:rgba(8,8,12,.74);'
      + 'display:flex;align-items:center;justify-content:center;padding:18px;');
    mask.innerHTML = '<div style="width:min(560px,94vw);max-height:78vh;display:flex;flex-direction:column;'
      + 'background:linear-gradient(160deg,#16131c,#211a28);border:1px solid rgba(217,187,122,.45);'
      + 'border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.7);overflow:hidden;color:#f2e9dc;'
      + 'font-family:system-ui,\"Microsoft YaHei\",sans-serif;">'
      + '<div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid rgba(217,187,122,.22);">'
      + '<b style="flex:1 1 auto;font-size:15px;color:#e6c884;letter-spacing:.5px;">🎬 回忆模式</b>'
      + '<span style="font-size:11px;color:#8b8175;">点「回忆」重看那一楼 · 看插图时点 ✕ 回来</span>'
      + '<button type="button" id="th-recall-x" style="background:none;border:0;color:#9a8f80;font-size:16px;cursor:pointer;padding:2px 6px;">✕</button>'
      + '</div>'
      + '<div style="padding:12px 14px;overflow-y:auto;flex:1 1 auto;">' + rows + '</div></div>';
    mask.addEventListener('click', function (e) { if (e.target === mask) closeMask(); });
    d.body.appendChild(mask);
    var x = d.getElementById('th-recall-x');
    if (x) x.onclick = closeMask;
    Array.prototype.forEach.call(mask.querySelectorAll('[data-recall]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        play(Number(b.getAttribute('data-recall')));
      };
    });
  }

  function play(i) {
    var g = GROUPS[i];
    if (!g) return;
    var t = g.texts.join('\n');
    AT = i;
    closeMask();
    try { var api = pick('__TH_RECALL_API__'); if (api && api.playText) api.playText(t); } catch (e) {}
    try {
      var ill = pick('__sprIllust');
      if (ill && ill.play) ill.play(t);
    } catch (e2) {}
    try { var im = pick('__sprImmersive'); if (im && im.enter) im.enter(); } catch (e3) {}
  }

  /* 插图 ✕（退出插图）时由 13-gal 调回来：等于退出回忆模式，回到楼层列表 */
  function onCgClosed() {
    if (AT == null) return false;
    AT = null;
    try { var api = pick('__TH_RECALL_API__'); if (api && api.restore) api.restore(); } catch (e) {}
    setTimeout(open, 60);
    return true;
  }

  var API = { open: open, play: play, onCgClosed: onCgClosed, isOn: function () { return AT != null; } };
  try { window.__TH_RECALL__ = API; } catch (e4) {}
  try { if (window.top) window.top.__TH_RECALL__ = API; } catch (e5) {}
})();
