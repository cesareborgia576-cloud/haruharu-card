/* 春日狂想曲·统一版 v10.6 · 21-avatar.js · 源脚本：[非同层] 09-头像对白渲染 */
/* ============================================================
   《09-头像对白渲染 · v10》
   把正文里的 `{人物名}「对白」` 渲染成「左侧头像 + 姓名 + 右侧气泡」。

   设计约束（Administrator 2026-10-27 定）：
   1. **只做头像对话框**，不搬同层版那套 49KB 的 Galgame 全屏壳。
      那套要接管视口、盖住状态栏、和本卡的插图正则抢控制权。
   2. **就地替换每条对白**：正文里每个 {名}「话」 原地变成一条对话框，
      旁白段落照旧是自然段落，不抽到别处、不重排原顺序。
   3. **头像是立绘的上半部分**：立绘画像本身是 1:2 左右的半身透明 PNG，
      人物头部在顶部约 20% 处。头像框用 object-fit:cover +
      object-position:top 裁顶部正方形，脸正好在框里。
   4. **苦主（男性）不上头像**，只显示姓名牌 —— 同层版里那 9 位苦主
      共用两张普通照片，裁成方形头像会很怪，且 4 人同脸。
      （女角名单见 AVATAR_OK，其余一律只显名字。）

   实现要点：
   - 纯 DOM 后处理，不改 message 数据，不动 MVU，不碰 statusbar。
   - 幂等：给处理过的节点打 data-thdl="1"，重复扫描不会套娃。
   - 流式安全：只在 message 文本稳定后渲染；生成中先跳过，
     免得把半句话渲染成对话框再重排（会看到文字跳）。
   - 认不出的人名不渲染成对话框，原样保留（宁可不动，不可改错）。
   ============================================================ */
(function () {
  'use strict';

  var VER = 'v14-nodiamond';   /* ★ v9.17：改版本号，逼 ensureStyles 重灌 CSS，清掉旧菱形 */
  var STYLE_ID = 'th-dialog-avatar-styles';
  var POLL_MS = 1200;          /* 常驻嗅探间隔 */
  var STABLE_MS = 500;         /* 文本稳定这么久才算写完，流式期间不渲染 */

  /* ══════════════════════════════════════════════════════════
     立绘表：名字 → 立绘 URL。
     与状态栏正则里的 CHAR_IMAGES 同源（都由 07-图床同步.js 维护），
     但不共享变量 —— 状态栏跑在正则沙箱里，这里跑在脚本沙箱里。
     ══════════════════════════════════════════════════════════ */
  var CHAR_IMAGES = {
  "春日久美子": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__立绘_01.png",
  "春日葵": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__立绘_01.png",
  "春日静奈": "https://a.imgckr.com/2026/10/10/XlnOh.png",
  "吉川美穗": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-village@main/mihou/mihou__立绘_01.png",
  "山上椿芽": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__立绘_01.png",
  "香本千玲": "https://a.imgckr.com/2026/10/10/XlW8R.png",
  "白坂结奈": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__立绘_01.png",
  "神谷奈绪": "https://a.imgckr.com/2026/10/10/Xlbes.png",
  "桃崎千鹤": "https://a.imgckr.com/2026/10/10/XlmES.png",
  "神代凛音": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__立绘_01.png",
  "月读澪": "https://a.imgckr.com/2026/10/10/Xl1QG.png",
  "斋宫若叶": "https://a.imgckr.com/2026/10/10/XlsZX.png",
  "山上左寻": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333896.png",
  "西村太郎": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333896.png",
  "吉川大田": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333896.png",
  "香本悠": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333896.png",
  "志腾上林": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333896.png",
  "春日大平": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333888.png",
  "吉川宏": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333888.png",
  "西村诚": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333888.png",
  "山上和也": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting@main/blog/1790812333888.png",
  "藤宫紫苑": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__立绘_01.png",
  "西村百花": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__立绘_01.png",
  /* ★ v9.17：同步同层版最新立绘（4 位此前气泡只有首字母占位） */
  "朝仓茜野": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__立绘_01.png",
  "御神木之灵": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__立绘_01.png",
  "水野千晴": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__立绘_01.png",
  "白蔵主": "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__立绘_01.png"
};

  /* 苦主（男性）：只显名字，不上头像。理由见文件头第 4 条。 */
  var MALE_ONLY = {
    '山上左寻': 1, '西村太郎': 1, '吉川大田': 1, '香本悠': 1,
    '志腾上林': 1, '春日大平': 1, '吉川宏': 1, '西村诚': 1, '山上和也': 1
  };

  /* ══════════════════════════════════════════════════════════
     解析：{人物名}「对白」
     - 名字里不许有花括号；对白里不许有右引号（避免跨句吞太多）。
     - 允许全角/半角括号混用、允许 {#} 代表玩家。
     ══════════════════════════════════════════════════════════ */
  var DIALOG_RE = /\{([^{}\n]{1,20})\}\s*[「“]([^」”\n]*)[」”]/g;

  /* 解析一个纯文本片段，返回 [{type:'text'|'dialog', ...}] 数组。
     这个函数是纯函数（不碰 DOM），04 的单测直接调它。 */
  function parseDialogs(text) {
    var out = [];
    var s = String(text == null ? '' : text);
    var last = 0, m;
    DIALOG_RE.lastIndex = 0;
    while ((m = DIALOG_RE.exec(s)) !== null) {
      var who = String(m[1] || '').trim();
      var say = String(m[2] || '');
      if (!who || !say) continue;
      if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
      out.push({ type: 'dialog', who: who, say: say });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
    return out;
  }

  /* 这个名字该不该上头像。玩家（# / user）永远不上头像。 */
  function avatarOf(name) {
    var n = String(name || '').trim();
    if (!n) return '';
    if (n === '#' || n.toLowerCase() === 'user' || n === '你') return '';
    if (MALE_ONLY[n]) return '';
    return CHAR_IMAGES[n] || '';
  }

  /* 姓名牌显示名：玩家叫「你」，其余就是名字本身 */
  function labelOf(name) {
    var n = String(name || '').trim();
    if (n === '#' || n.toLowerCase() === 'user') return '你';
    return n;
  }

  var CSS = [
    '.thdl-wrap{margin:10px 0;display:flex;gap:10px;align-items:flex-start;font-family:inherit;}',
    '.thdl-wrap.is-narr{display:block;margin:8px 0;}',
    /* 头像框：顶部正方形裁切 —— 立绘画像的头部就在顶部这段 */
    '.thdl-ava{flex:0 0 auto;width:56px;height:56px;border-radius:12px;overflow:hidden;',
    'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);',
    'box-shadow:0 2px 8px rgba(0,0,0,.35);position:relative;}',
    '.thdl-ava img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;}',
    /* 没头像的人（苦主/玩家）：用首字母占位，保持左边距一致不跳动 */
    '.thdl-ava.is-ph{display:flex;align-items:center;justify-content:center;',
    'font-size:15px;font-weight:600;color:rgba(255,255,255,.72);letter-spacing:.5px;}',
    '.thdl-main{flex:1 1 auto;min-width:0;}',
    '.thdl-name{font-size:12px;font-weight:600;line-height:1.4;margin:0 0 3px;',
    'color:#8ecdf7;letter-spacing:.3px;}',
    '.thdl-bubble{position:relative;border-radius:12px;padding:8px 12px;',
    'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);',
    'color:inherit;font-size:inherit;line-height:1.75;word-break:break-word;}',
    /* ★ v9.17：菱形小尖角已删。留一条 !important 兜底，盖掉热更前残留的旧 style */
    '.thdl-bubble::before{content:none !important;display:none !important;}',
    '.thdl-narr-text{font-size:inherit;line-height:1.78;}',
    /* 亮色主题下换个底，免得白底上白气泡看不见 */
    '@media (prefers-color-scheme: light){',
    '.thdl-bubble{background:rgba(0,0,0,.045);border-color:rgba(0,0,0,.12);}',
    '.thdl-ava{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.12);}',
    '.thdl-ava.is-ph{color:rgba(0,0,0,.55);}',
    '.thdl-name{color:#1a6fa8;}',
    '}'
  ].join('');

  /* ── 宿主（穿透 iframe） ── */
  var HOST = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
    return window;
  })();
  function getDoc() { try { return HOST.document || document; } catch (e) { return document; } }

  function ensureStyles() {
    var doc = getDoc();
    var old = doc.getElementById(STYLE_ID);
    /* ★ v9.17：旧版只判断 style 节点在不在，热更后旧 CSS 会一直留着，
       光在源码里删掉 ::before 定义，玩家那边菱形还在。改成按 VER 重灌。*/
    if (old && old.getAttribute && old.getAttribute('data-ver') === VER) return;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    if (st.setAttribute) st.setAttribute('data-ver', VER);
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  function el(tag, cls) {
    var doc = getDoc();
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ══════════════════════════════════════════════════════════
     把一段原始正文渲染成「旁白 + 对话框」的 DOM 片段。
     纯转换：给文本和解析结果，吐一个 DocumentFragment。单测可调。
     ══════════════════════════════════════════════════════════ */
  function buildFragment(rawText) {
    var doc = getDoc();
    var frag = doc.createDocumentFragment();
    var parts = parseDialogs(rawText);
    if (!parts.length) return { frag: frag, count: 0 };

    var count = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type === 'text') {
        var t = String(p.text || '').replace(/^\n+|\n+$/g, '');
        if (!t.trim()) continue;
        var nw = el('div', 'thdl-wrap is-narr');
        var nt = el('div', 'thdl-narr-text');
        nt.textContent = t;
        nw.appendChild(nt);
        frag.appendChild(nw);
      } else {
        count++;
        var row = el('div', 'thdl-wrap');
        var ava = el('div', 'thdl-ava');
        var url = avatarOf(p.who);
        if (url) {
          var img = el('img');
          img.src = url;
          img.alt = p.who;
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          /* 图挂了就把头像框降级成首字母，不留破图图标 */
          img.onerror = (function (box, nm) {
            return function () { degradeAvatar(box, nm); };
          })(ava, labelOf(p.who));
          ava.appendChild(img);
        } else {
          degradeAvatar(ava, labelOf(p.who));
        }
        var main = el('div', 'thdl-main');
        var nmEl = el('div', 'thdl-name');
        nmEl.textContent = labelOf(p.who);
        var bub = el('div', 'thdl-bubble');
        bub.textContent = p.say;
        main.appendChild(nmEl);
        main.appendChild(bub);
        row.appendChild(ava);
        row.appendChild(main);
        frag.appendChild(row);
      }
    }
    return { frag: frag, count: count };
  }

  function degradeAvatar(box, name) {
    try {
      box.className = 'thdl-ava is-ph';
      box.textContent = String(name || '?').slice(0, 1);
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     取消息正文。必须认 swipes —— 玩家编辑的是当前那张，
     m.mes 未必是它（同层版 v101 踩过这个坑）。
     ══════════════════════════════════════════════════════════ */
  function msgText(m) {
    try {
      if (Array.isArray(m.swipes) && m.swipes.length) {
        var i = (typeof m.swipe_id === 'number') ? m.swipe_id : 0;
        if (typeof m.swipes[i] === 'string') return m.swipes[i];
      }
    } catch (e) {}
    return typeof m.mes === 'string' ? m.mes : '';
  }

  /* ══════════════════════════════════════════════════════════
     渲染一条消息：**就地替换含对白的文本节点**，其余 DOM 一个都不碰。

     ★★★ v12 的核心改动，别再退回 v11 的写法 ★★★
     v10/v11 用的是这一套：
         box.innerHTML = '';           // 清空整个 .mes_text
         box.appendChild(buildFragment(raw).frag);
     用户实测（2026-10-27）后果是灾难性的：
       ① **状态栏不显示** —— 状态栏那整份 HTML 就挂在 .mes_text 里，
          被 innerHTML='' 一起删掉了。
       ② **变量标签爆在正文里** —— 重建的数据源是 ctx[idx].mes（**原始消息**），
          里面还带着 <UpdateVariable>…</UpdateVariable>；
          正则虽然已经从**显示层**删过它，但这里直接从原始数据重造，
          等于把变量块又请回来了。
       ③ **插图不显示** —— 重建时 <插图> 变成了纯文本（详见 10 的 v12 说明），
          反而要等这个脚本把它"救"回文本形态才能显示，所以表现为「开开就好」。

     正确做法：TreeWalker 遍历文本节点，只把「含 {名}「话」」的节点换成对话框。
     状态栏是**元素**（不是文本节点），天然不在遍历结果里 ⇒ 永远不会被删。
     变量块早已被正则删掉 ⇒ 不会从原始数据复活。
     ============================================================ */
  /* ⚠ 跳过名单里的类名必须和 10 真实产出的类名一致。
     10 的插图块是 `.thillu`（不是 .thillu-wrap）—— 写错就等于没跳过，
     反过来会把已经渲染好的插图块再当文本处理一遍。 */
  var SKIP_SEL = '.thdl-wrap,.thillu,iframe,#th-place-modal,.mes_text script,.mes_text style';

  /* ══════════════════════════════════════════════════════════
     ★★ v13 核心修正：酒馆会把「…」包进 <q>，把一句对白劈成两个节点 ★★

     这是 v9.6「对话框整个不显示」的唯一真凶，别再改回去。

     酒馆 public/script.js 的 messageFormatting 里，在 showdown **之前**
     跑了这么一条（约 1741 行）：

       mes.replace(/…|(\u300C.*?\u300D)|…/gim, … => `<q>「${…}」</q>`)

     注意是 \u300C = 「、\u300D = 」，也就是**每一对 「」 都会被包成 <q>**。
     于是 "{春日久美子}「你终于来了。」" 渲染出来的 DOM 是：

       <P> 2 children
         TXT "{春日久美子}"          ← 名字在这儿
         <Q> TXT "「你终于来了。」"    ← 对白被关进子元素

     而 DIALOG_RE 要求 {名} 和 「话」 在同一段字符串里 —— 跨节点永远匹配不到。
     旧版之所以能出，是因为它拿 box.textContent 整段匹配；v9.6 为了不误伤
     状态栏改成 TreeWalker 逐节点，反而把这个前提踩碎了。

     所以这里必须先把「被劈开的行内节点」重新缝成一段逻辑文本，再交给
     parseDialogs。跟 10 处理 </插图> 变成注释节点是同一个套路。
     ══════════════════════════════════════════════════════════ */

  /* 块级元素是天然的分段边界，缝到这里就必须停 —— 绝不能跨段抓别人的话 */
  var BLOCK_TAG = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TR|TD|TH|UL|OL|HR|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|FIGURE|FIGCAPTION)$/;

  /* 取一个节点的「行内文本」。返回 null 表示撞到块级边界，必须停止。 */
  function inlineTextOf(node) {
    if (!node) return null;
    if (node.nodeType === 3) return node.nodeValue || '';        /* 文本 */
    if (node.nodeType === 8) return '';                          /* 注释：占位不算字 */
    if (node.nodeType === 1) {
      var tag = String(node.tagName || '').toUpperCase();
      if (tag === 'BR') return '\n';                             /* 换行：当成空白继续缝 */
      if (BLOCK_TAG.test(tag)) return null;                      /* 块级：到此为止 */
      return node.textContent || '';
    }
    return null;
  }

  /* 缝一句对白：从含 {名} 的文本节点出发，把后续行内节点一路拼起来，
     直到凑出一条**完整闭合**的 {名}「话」。
     凑不齐就返回 null —— 一个节点都不动，宁可不动不可改错。 */
  function spliceDialog(startNode) {
    var text = String(startNode.nodeValue || '');
    var nodes = [startNode];
    var COMPLETE = /\{[^{}\n]{1,20}\}\s*[「“][^」”\n]*[」”]/;

    if (!COMPLETE.test(text)) {
      var cur = startNode;
      for (var g = 0; g < 12; g++) {
        var nx = cur.nextSibling;
        if (!nx) break;
        var add = inlineTextOf(nx);
        if (add === null) break;
        text += add;
        nodes.push(nx);
        cur = nx;
        if (COMPLETE.test(text)) break;
      }
    }
    if (!COMPLETE.test(text)) return null;
    return { text: text, nodes: nodes };
  }

  /* 这段节点是不是正好占满了一个段落容器？
     是的话就连容器一起换掉，免得 <p> 里套 <div> 多出一份段间距。 */
  function coversAll(holder, nodes) {
    if (!holder || !holder.parentNode) return false;
    if (!/^(P|DIV|SPAN|LI|BLOCKQUOTE)$/.test(holder.tagName || '')) return false;
    if (holder.childNodes.length < nodes.length) return false;
    var kids = holder.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      /* 纯空白文本、注释都算「已被覆盖」，不影响判断 */
      if (k.nodeType === 3 && !String(k.nodeValue || '').trim()) continue;
      if (k.nodeType === 8) continue;
      if (nodes.indexOf(k) < 0) return false;
    }
    return true;
  }

  function renderOne(mesEl) {
    if (!mesEl) return 0;
    if (mesEl.getAttribute('is_user') === 'true') return 0;
    var box = mesEl.querySelector('.mes_text');
    if (!box) return 0;

    /* 幂等：已经渲染过就跳过；但如果内容被酒馆重绘过（.thdl-wrap 没了）
       就把标记清掉重来 —— 否则编辑过 / 重新生成过的楼永远不更新。 */
    if (mesEl.getAttribute('data-thdl') === '1') {
      if (box.querySelector('.thdl-wrap')) return 0;
      mesEl.removeAttribute('data-thdl');
    }

    var doc = getDoc();
    if (!doc.createTreeWalker) return 0;

    var walker = doc.createTreeWalker(box, 4 /* SHOW_TEXT */, null, false);
    var targets = [];
    var tn;
    while ((tn = walker.nextNode())) {
      var v = tn.nodeValue;
      if (!v || v.indexOf('{') === -1) continue;
      /* ⚠ 这里**不能**要求同一节点里出现「 —— 酒馆把「」包进 <q>，
         名字和对白天生是两个节点，卡死在这上面等于功能全废。
         只要节点里有 {…} 就够了，完整性交给 spliceDialog 去缝。 */
      if (!/\{[^{}\n]{1,20}\}/.test(v)) continue;
      /* 祖先落在跳过名单里就别碰（对话框、插图块、状态栏里的 script/style） */
      var p = tn.parentNode, skip = false;
      while (p && p !== box) {
        try { if (p.matches && p.matches(SKIP_SEL)) { skip = true; break; } } catch (e0) {}
        p = p.parentNode;
      }
      if (skip) continue;
      targets.push(tn);
    }
    if (!targets.length) return 0;

    var total = 0;
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      if (!node.parentNode) continue;        /* 上一轮替换可能已经把它带走 */

      /* ★ 先缝：把 {名} 和它后面被 <q> 关起来的「话」拼成完整一句 */
      var sp;
      try { sp = spliceDialog(node); } catch (eSP) { continue; }
      if (!sp) continue;                     /* 凑不出完整对白：一个节点都不动 */

      var res;
      try { res = buildFragment(sp.text); } catch (e1) { continue; }
      if (!res.count) continue;              /* 纯旁白：整段原样不动 */

      /* 这段节点是否正好占满父容器（常见 <p> 里就一句对白）。
         是就连 <p> 一起换掉，避免 <p> 里塞 <div> 多出段间距。 */
      var holder = node.parentNode;
      var whole = null;
      if (coversAll(holder, sp.nodes)) whole = holder;

      /* 先插后删：一口气把整串节点换掉，中途断链也不会留下半句。 */
      try {
        if (whole) {
          whole.parentNode.replaceChild(res.frag, whole);
        } else {
          var first = sp.nodes[0];
          var parent = first.parentNode;
          if (!parent) continue;
          parent.insertBefore(res.frag, first);
          for (var k = 0; k < sp.nodes.length; k++) {
            var dead = sp.nodes[k];
            if (dead.parentNode) dead.parentNode.removeChild(dead);
          }
        }
        total += res.count;
      } catch (e2) {}
    }

    if (total) mesEl.setAttribute('data-thdl', '1');
    return total;
  }

  /* 扫描全部楼层。
     ★ v13：不能只认 `#chat .mes` —— 酒馆的容器 id 可能变（有的皮肤/插件会换），
     一旦选择器落空就「一张都不出」，而且完全静默、看不出原因。
     这里退一步：先按 #chat 找，找不到就直接全文档找 .mes。 */
  function allMes() {
    var doc = getDoc();
    var list = doc.querySelectorAll('#chat .mes');
    if (list.length) return list;
    return doc.querySelectorAll('.mes[mesid], .mes[data-mesid], .mes');
  }

  function scanAll() {
    var list = allMes();
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      try { total += renderOne(list[i]); } catch (e) {}
    }
    return total;
  }

  /* ══════════════════════════════════════════════════════════
     常驻嗅探：流式期间不渲染（等文本稳定），稳定后一次成型。
     心跳挂在宿主 window 上，全局只留一份，脚本热更不叠实例。
     ══════════════════════════════════════════════════════════ */
  function isBusy() {
    try {
      if (HOST.__thdlBusy) return true;
      var doc = getDoc();
      if (doc.querySelector('#stop_generating:not([style*="display: none"])')) return true;
      if (HOST.SillyTavern && HOST.SillyTavern.isGenerating) return true;
    } catch (e) {}
    return false;
  }

  /* ★ v12 起不能再用 [data-thdl="0"] / :not([data-thdl]) 选楼。
     理由：某楼打了 data-thdl="1" 之后，酒馆一重绘（编辑、重生成、切 swipes），
     .thdl-wrap 没了但 data-thdl 还在 —— 旧条件永远选不到它，等于再也不更新。
     现在改成「先挑出真正需要干的楼」，有才进 scanAll，没有就秒退。 */
  function needWork(m) {
    if (!m) return false;
    if (m.getAttribute('data-thdl') !== '1') return true;   /* 没渲染过 */
    var bx = m.querySelector('.mes_text');
    if (!bx) return true;
    if (!bx.querySelector('.thdl-wrap')) {                   /* 被重绘过 */
      m.removeAttribute('data-thdl');
      return true;
    }
    return false;
  }

  function beat() {
    try {
      if (isBusy()) return;      /* 生成中先不碰，等写完 */
      var list = allMes();
      var any = false;
      for (var i = 0; i < list.length; i++) {
        if (needWork(list[i])) { any = true; break; }
      }
      if (!any) return;
      scanAll();
    } catch (e) {}
  }

  function init() {
    try { ensureStyles(); } catch (eS) {}
    /* 生成开始 → 标记忙；生成结束 → 清标记并立刻渲染一次 */
    try {
      var w = HOST;
      if (w.eventOn) {
        w.eventOn('generation_started', function () { HOST.__thdlBusy = true; });
        w.eventOn('generation_stopped', function () { HOST.__thdlBusy = false; setTimeout(beat, 80); });
        w.eventOn('message_received', function () { HOST.__thdlBusy = false; setTimeout(beat, 80); });
        w.eventOn('chat_changed', function () { setTimeout(beat, 120); });
      }
    } catch (eE) {}
    try {
      if (HOST.__thdlTimer) clearInterval(HOST.__thdlTimer);
      HOST.__thdlTimer = setInterval(beat, POLL_MS);
    } catch (eT) {}
    /* 观察器也留一份，热更时先断旧的 */
    try {
      if (HOST.__thdlObs) HOST.__thdlObs.disconnect();
      var doc = getDoc();
      var target = doc.getElementById('chat') || doc.body;
      var ob = new MutationObserver(function () { setTimeout(beat, STABLE_MS); });
      ob.observe(target, { childList: true, subtree: true });
      HOST.__thdlObs = ob;
    } catch (eO) {}
    setTimeout(beat, 400);
  }

  /* 导出给 04 单测用（挂在 window 上不污染全局命名空间） */
  try {
    (HOST.__thDialogAvatar = {
      VER: VER,
      parseDialogs: parseDialogs,
      buildFragment: buildFragment,
      avatarOf: avatarOf,
      labelOf: labelOf,
      charImages: CHAR_IMAGES,
      maleOnly: MALE_ONLY,
      renderOne: renderOne,
      scanAll: scanAll,
      spliceDialog: spliceDialog,
      coversAll: coversAll,
      DIALOG_RE: DIALOG_RE
    });
  } catch (eX) {}

  init();
})();
