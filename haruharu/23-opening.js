/* 春日狂想曲·统一版 v1.50 · 23-opening.js · 源脚本：[非同层] 12-开局设置 */
/* ============================================================
   《12-开局设置 · 非同层版》—— 参考天元录《07-开局脚本》的开局设置面板
   ============================================================
   职责：玩家在开局楼层（第 0 楼开场白）上直接完成开局设置，
        确认后一次性写入本局存档。完成后面板收成右下角悬浮章，
        点章可重新打开改设置（改完再确认会重写一遍）。

   ── 与同层版八屏向导的分工 ──
   非同层版没有 Galgame 壳、没有标题屏，开局就是第 0 楼开场白正文，
   所以面板照天元录的形态挂在楼层里，不另起标题屏。

   ── 设置项（对齐同层版）──
   ① 起始篇章（夏越村 / 公寓 / 神社）→ 拨第 0 楼的开场白 swipe
   ② 游戏模式（牛头 / 纯爱）        → 纯爱把苦主列表清成空表
   ③ 季节（春夏秋冬）              → 开局月日按季节对齐（同层版 v165i 口径）
   ④ 玩家信息（姓名/外貌身材/年龄/性格，全部可留空）
   ⑤ 开局类型（正常 / 梦幻）        → 梦幻 = 开场白种子里所有女角色好感 100

   ── 变量来源：开场白自己就是唯一真相源 ──
   三份开场白各带一份完整 <JSONPatch>（时间 / 主要角色列表 / 苦主列表 /
   主角信息 / 全局）。确认开局时从**目标开场白的文本**里现提取这份补丁，
   在它之上加工（清苦主 / 改月日 / 好感 100 / 追加设置字段）再整份落库。
   不另抄第二份人物种子 —— 抄一份就是两个真相，改一个忘一个就是「某人永远不出现」。

   ── 写入通道（照 08-变量自愈中心同一套）──
   ① MVU：getMvuData → deepMergeInto → replaceMvuData（chat + latest message）
   ② insertOrAssignVariables({stat_data}, {type:'chat'})
   ③ 脚本作用域内存 stat_data
   写完 900ms / 2400ms 各补写一拍「设置字段包」—— 防 MVU 异步 parseMessage
   开场白时用不带设置的旧种子把设置字段冲掉（同层版梦幻校正同款手段）。

   ── 天元录交过的学费，这里直接吸收 ──
   · 「点了没反应」家族：全部点击用**事件委托**（认 data-thso-* 属性），
     楼层被酒馆重画、节点重建都不丢绑定；选中态与汇总条**局部更新**，
     不整块重画面板 —— 有输入框的面板整块重画必打断输入。
   · 完成判据走 chat flag（thStartDone）+ 变量兜底 + 「楼层已聊起来」三路，
     老存档（没有 flag 但已有多楼）不自动弹面板，只有悬浮章。
   · 挂载自愈走心跳：面板/悬浮章被酒馆重画洗掉后下一拍自动回来。
   ============================================================ */
(function () {
  'use strict';

  var TAG = '[春日·开局设置]';
  var HOST_ID = 'th-start-host';
  var CHIP_ID = 'th-start-chip';
  var STYLE_ID = 'th-start-style';
  var DONE_KEY = 'thStartDone';
  var REV = 'thso-v1';
  /* ★ v9.16 关键词触发（参考天元录 07）★
     开场白第 0 楼里放一个【开局 · xxx】标签；脚本扫到它才认定"这是开局楼"，
     把面板挂上去，再把标签文本抹掉（玩家看不到，AI 也不会把它当正文读）。
     ⚠ 不用 chatLen()<=1 猜楼层数：老档/多楼/上下文取不到时那种猜测恒假。*/
  var MARK_RE = /【开局(?:\s*[·・][^】]*)?】/;
  function scanStartMes(doc) {
    var list = null, firstAi = null, marked = null;
    try { list = doc.querySelectorAll('#chat .mes'); } catch (e1) {}
    if (!list || !list.length) { try { list = doc.querySelectorAll('.mes'); } catch (e2) {} }
    if (!list) return { firstAi: null, marked: null };
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      try {
        if (el.classList && el.classList.contains('is_user')) continue;
        if (el.getAttribute && el.getAttribute('is_user') === 'true') continue;
        var mt = el.querySelector('.mes_text');
        if (!mt) continue;
        if (!firstAi) firstAi = mt;
        if (!marked && MARK_RE.test(mt.textContent || '')) marked = mt;
      } catch (e3) {}
    }
    return { firstAi: firstAi, marked: marked };
  }
  /* 抹掉标签文本（只动 .mes_text 里的文本节点，绝不碰面板 DOM）*/
  function scrubMark(mesText) {
    try {
      var doc = getDoc();
      var host = doc.getElementById(HOST_ID);
      var walker = doc.createTreeWalker(mesText, 4 /* SHOW_TEXT */, null);
      var nodes = [], node;
      while ((node = walker.nextNode())) {
        if (host && host.contains(node)) continue;
        if (MARK_RE.test(node.nodeValue || '')) nodes.push(node);
      }
      for (var j = 0; j < nodes.length; j++) {
        var t = nodes[j];
        var next = String(t.nodeValue || '').replace(MARK_RE, '').replace(/^[ \t]+|[ \t]+$/g, '');
        if (next === '') { if (t.parentNode) t.parentNode.removeChild(t); }
        else t.nodeValue = next;
      }
    } catch (e) {}
  }

  /* ── 环境探测（照 08-变量自愈中心同构：自身 → parent → top）── */
  function getDoc() {
    /* ★ v10.5：脚本跑在独立 iframe，自己的 document 里没有 #chat .mes；
       必须先找宿主 document，否则 scanStartMes 永远扫不到【开局】标签。 */
    try { if (window.top && window.top.document && window.top.document.body) return window.top.document; } catch (e0) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent.document; } catch (e1) {}
    try { if (document && document.body) return document; } catch (e2) {}
    return document;
  }
  function getStContext() {
    var cands = [];
    try { cands.push(window.top); } catch (e0) {}
    try { cands.push(window.parent); } catch (e1) {}
    cands.push(window);
    for (var i = 0; i < cands.length; i++) {
      try {
        var w = cands[i];
        if (w && w.SillyTavern && typeof w.SillyTavern.getContext === 'function') {
          return w.SillyTavern.getContext();
        }
      } catch (e2) {}
    }
    try {
      if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        return window.SillyTavern.getContext();
      }
    } catch (e3) {}
    return null;
  }
  function findMvuGlobal() {
    var cands = [];
    try { cands.push(window.top); } catch (e0) {}
    try { cands.push(window.parent); } catch (e1) {}
    cands.push(window);
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && typeof cands[i].Mvu !== 'undefined') return cands[i].Mvu; } catch (e2) {}
    }
    return null;
  }
  function findTavernHelper() {
    var cands = [];
    try { cands.push(window.top); } catch (e0) {}
    try { cands.push(window.parent); } catch (e1) {}
    cands.push(window);
    try { if (typeof TavernHelper !== 'undefined' && TavernHelper) cands.push({ TavernHelper: TavernHelper }); } catch (e2) {}
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && cands[i].TavernHelper) return cands[i].TavernHelper; } catch (e3) {}
    }
    return null;
  }
  function deepMergeInto(target, source) {
    if (!source || typeof source !== 'object') return target;
    if (!target || typeof target !== 'object') return target;
    for (var k in source) {
      if (Object.prototype.hasOwnProperty.call(source, k)) {
        var sv = source[k];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
          if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
          deepMergeInto(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
    }
    return target;
  }
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  /* ══════════════ 常量 ══════════════ */
  /* 三个篇章的 swipe 序号 = 开场白在卡里的排位（0 主开场 / 1 备用1 / 2 备用2）。
     这不是抄来的：04-校验会拿卡里 alternate_greetings 的实际内容逐一核对，
     顺序被谁动了闸当场红。 */
  var ARCS = [
    { key: '夏越村', idx: 1, icon: '🌾', tag: '乡野田园', desc: '七位熟女与八位苦主 · 牛头模式的正篇' },
    { key: '公寓',   idx: 2, icon: '🏢', tag: '都会公寓', desc: '五位邻居 · 牛头 / 纯爱双线' },
    { key: '神社',   idx: 3, icon: '⛩️', tag: '神隐秘境', desc: '三位巫女与两位非人 · 任何模式都没有苦主' }
  ];
  var SEASON_META = {
    '春': { icon: '🌸', desc: '新绿与花 · 薄外套、湿润的风' },
    '夏': { icon: '☀️', desc: '盛夏与蝉鸣 · 暑假、夏越祭、烈日' },
    '秋': { icon: '🍁', desc: '落叶与丰收 · 长袖、金黄、凉风' },
    '冬': { icon: '❄️', desc: '雪与暖炉 · 厚衣、白气、早暗的天' }
  };
  /* 开局月日按季节对齐（同层版 v165i 同一份口径，两份必须一起改）：
     3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬。夏保持原值 7/26 —— 开场白正文写的就是盛夏。 */
  var SEASON_START_DATE = {
    '春': { 月份: 4, 日期: 5 },
    '夏': { 月份: 7, 日期: 26 },
    '秋': { 月份: 10, 日期: 20 },
    '冬': { 月份: 1, 日期: 6 }
  };
  var PLAYER_KEYS = ['玩家姓名', '玩家外貌身材', '玩家年龄', '玩家性格'];
  var PLAYER_PLACEHOLDER = {
    '玩家姓名': '留空＝不定义名字，正文只用「你」',
    '玩家外貌身材': '留空＝不描写你的外貌',
    '玩家年龄': '留空＝不暗示年纪',
    '玩家性格': '留空＝不替你定性格'
  };
  var PLAYER_LABEL = { '玩家姓名': '姓名', '玩家外貌身材': '外貌身材', '玩家年龄': '年龄', '玩家性格': '性格' };

  /* 五瓣樱花 SVG（瓣 = 椭圆绕花心转五次，蕊 = 暖黄圆）。标题与悬浮章共用这一朵。 */
  var SAKURA_SVG =
    '<svg viewBox="0 0 48 48" width="__SZ__" height="__SZ__" aria-hidden="true">' +
    '<g fill="#f5a8c4">' +
    '<ellipse cx="24" cy="13" rx="6.2" ry="8.6"/>' +
    '<ellipse cx="24" cy="13" rx="6.2" ry="8.6" transform="rotate(72 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="6.2" ry="8.6" transform="rotate(144 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="6.2" ry="8.6" transform="rotate(216 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="6.2" ry="8.6" transform="rotate(288 24 24)"/>' +
    '</g>' +
    '<g fill="#fce3ee" opacity=".55">' +
    '<ellipse cx="24" cy="13" rx="2.6" ry="5.4"/>' +
    '<ellipse cx="24" cy="13" rx="2.6" ry="5.4" transform="rotate(72 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="2.6" ry="5.4" transform="rotate(144 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="2.6" ry="5.4" transform="rotate(216 24 24)"/>' +
    '<ellipse cx="24" cy="13" rx="2.6" ry="5.4" transform="rotate(288 24 24)"/>' +
    '</g>' +
    '<circle cx="24" cy="24" r="4.2" fill="#ffd9a8"/>' +
    '<circle cx="24" cy="24" r="1.8" fill="#f7b267"/>' +
    '</svg>';
  function sakuraSvg(sz) { return SAKURA_SVG.replace(/__SZ__/g, String(sz || 20)); }

  /* ══════════════ 状态 ══════════════ */
  var state = {
    open: false,          /* 面板当前是否要出现 */
    busy: false,          /* 确认流程进行中（挡重入 + 挡心跳重挂） */
    done: false,          /* 本聊天已完成过开局 */
    inited: false         /* 默认草稿是否已按当前开场白初始化过 */
  };
  var draft = defaultDraft();

  function defaultDraft() {
    return {
      arc: arcBySwipeIdx(currentSwipeIdx()),
      mode: '牛头',
      season: '夏',
      startType: '正常开局',
      player: { '玩家姓名': '', '玩家外貌身材': '', '玩家年龄': '', '玩家性格': '' }
    };
  }
  function arcBySwipeIdx(idx) {
    for (var i = 0; i < ARCS.length; i++) { if (ARCS[i].idx === idx) return ARCS[i].key; }
    return '夏越村';
  }
  function arcOf(key) {
    for (var i = 0; i < ARCS.length; i++) { if (ARCS[i].key === key) return ARCS[i]; }
    return ARCS[0];
  }
  function normSeason(s) { return SEASON_META[s] ? s : '夏'; }
  function normMode(m) { return m === '纯爱' ? '纯爱' : '牛头'; }
  function normStartType(s) { return s === '梦幻开局' ? '梦幻开局' : '正常开局'; }

  /* ══════════════ 酒馆上下文读取 ══════════════ */
  function chatArr() {
    var ctx = getStContext();
    try { if (ctx && Array.isArray(ctx.chat)) return ctx.chat; } catch (e) {}
    return null;
  }
  function chatLen() { var c = chatArr(); return c ? c.length : 0; }
  function currentSwipeIdx() {
    var c = chatArr();
    try {
      var m0 = c && c[0];
      if (m0 && typeof m0.swipe_id === 'number' && m0.swipe_id >= 0) return m0.swipe_id;
    } catch (e) {}
    return 0;
  }
  /* 第 idx 条开场白的文本；读不到返回空串 */
  function greetingTextOf(idx) {
    var c = chatArr();
    try {
      var m0 = c && c[0];
      if (!m0) return '';
      if (Array.isArray(m0.swipes) && typeof m0.swipes[idx] === 'string') return m0.swipes[idx];
      if (idx === (typeof m0.swipe_id === 'number' ? m0.swipe_id : 0)) return String(m0.mes || '');
    } catch (e) {}
    return '';
  }

  /* ══════════════ 完成判据（三路，照天元录 guessDone 的兜底思路）══════════════
     ① chat flag thStartDone —— 本面板自己写的，最可信
     ② stat_data.全局.开局类型 —— 新聊天 MVU 落库后必有值
     ③ 楼层数 —— 老存档没有 flag 但已经聊起来了（>1 楼），不自动弹面板，只给悬浮章 */
  function readChatFlag() {
    try {
      if (typeof getVariables === 'function') {
        var o = getVariables({ type: 'chat' });
        if (o && o[DONE_KEY] !== undefined) return !!o[DONE_KEY];
      }
    } catch (e1) {}
    try {
      var ctx = getStContext();
      var lv = (ctx && ctx.chatMetadata && ctx.chatMetadata.variables) ? ctx.chatMetadata.variables[DONE_KEY] : undefined;
      if (lv !== undefined) return !!lv;
    } catch (e2) {}
    return undefined;
  }
  function readStatData() {
    var mvu = findMvuGlobal();
    try {
      if (mvu && typeof mvu.getMvuData === 'function') {
        var root = mvu.getMvuData({ type: 'chat' }) || mvu.getMvuData({ type: 'message', message_id: 'latest' });
        if (root && root.stat_data && typeof root.stat_data === 'object') return root.stat_data;
      }
    } catch (e1) {}
    try { if (typeof stat_data !== 'undefined' && stat_data && typeof stat_data === 'object') return stat_data; } catch (e2) {}
    return null;
  }
  function guessDone() {
    var f = readChatFlag();
    if (f !== undefined) return !!f;
    /* ★ v10.6：不再用 stat_data.全局.开局类型 当判据 —— schema 初始变量自带默认值，
       MVU 一挂载就为真，面板会弹出 1.5 秒后被自己拆掉（闪一下就没）。 */
    try { if (state.markSeen) return false; } catch (e2) {}
    try { var sm = scanStartMes(getDoc()); if (sm.marked) return false; } catch (e3) {}
    /* 老档：已经聊起来又没【开局】标签 → 认为开过局，不打扰 */
    try { return chatLen() > 1; } catch (e4) { return false; }
  }

  /* ══════════════ 补丁加工（纯函数，04-校验按括号配平抽出来单测）══════════════
     输入：目标开场白自带的 JSONPatch ops + 本次设置
     输出：加工后的 ops（先种子后设置；设置永远压在种子之上） */
  function thStartBuildPatch(ops, opt) {
    var arr = JSON.parse(JSON.stringify(ops || []));
    var mode = normMode(opt && opt.mode);
    var season = normSeason(opt && opt.season);
    var st = normStartType(opt && opt.startType);
    var pi = (opt && opt.player) || {};

    /* ① 纯爱：滤掉种子里所有 /苦主列表 的 op，再显式发一张空表。
       不滤直接 push 清空会看顺序 —— 种子的 insert 排在后面照样把人塞回来。 */
    if (mode === '纯爱') {
      arr = arr.filter(function (op) { return String(op.path || '').indexOf('/苦主列表') !== 0; });
      arr.push({ op: 'replace', path: '/苦主列表', value: {} });
    }

    /* ② 季节 → 开局月日。滤掉种子里写死的月份/日期（第几天保留），按季重写。
       月份与季节必须自洽（3-5春 / 6-8夏 / 9-11秋 / 12-2冬），否则下一轮
       「季节由月份推导」的推演会把玩家选的季节盖回去。 */
    (function () {
      var sd = SEASON_START_DATE[season] || SEASON_START_DATE['夏'];
      arr = arr.filter(function (op) {
        var p = String(op.path || '');
        return p !== '/时间/月份' && p !== '/时间/日期';
      });
      arr.push({ op: 'replace', path: '/时间/月份', value: sd.月份 });
      arr.push({ op: 'replace', path: '/时间/日期', value: sd.日期 });
    })();

    /* ③ 梦幻开局：种子里所有带「好感度」的建档一律 100。
       只动好感度，其余字段原样；本来就不带好感度的（神社两位非人）不硬塞。 */
    if (st === '梦幻开局') {
      arr.forEach(function (op) {
        if (/^\/主要角色列表\//.test(String(op.path || '')) &&
            op.value && typeof op.value === 'object' &&
            Object.prototype.hasOwnProperty.call(op.value, '好感度')) {
          op.value['好感度'] = 100;
        }
      });
    }

    /* ④ 设置字段（压在种子之上；这些字段 schema 里已声明，不写会被 MVU 当野字段整理掉） */
    arr.push({ op: 'insert', path: '/全局/游戏模式', value: mode });
    arr.push({ op: 'insert', path: '/全局/季节', value: season });
    arr.push({ op: 'insert', path: '/全局/开局类型', value: st });

    /* ⑤ 玩家信息四字段。空串也写 —— 留空是玩家的明确选择（不定义），
       不写的话 schema 归一后读回来还是空，两种情况等价，但写了才能从变量里看出「走过了开局」。 */
    PLAYER_KEYS.forEach(function (k) {
      var v = String(pi[k] == null ? '' : pi[k]).trim();
      arr.push({ op: 'insert', path: '/主角信息/' + k, value: v });
    });

    return arr;
  }

  /* JSONPatch ops → stat_data 树（照同层版 applyInitPatch 的合成法，~0 ~1 转义照 RFC 6901） */
  function opsToStatData(ops) {
    function unesc(s) { return String(s).replace(/~1/g, '/').replace(/~0/g, '~'); }
    var st = {};
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i] || {};
      var path = String(op.path || '').split('/');
      if (path.length < 2) continue;
      var cur = st;
      for (var d = 1; d < path.length - 1; d++) {
        var k = unesc(path[d]);
        if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      var last = unesc(path[path.length - 1]);
      if (op.op === 'remove') delete cur[last];
      else cur[last] = op.value;
    }
    return st;
  }
  /* 从开场白文本里提取 <JSONPatch> ops；没有返回 [] */
  function extractJsonPatch(text) {
    var m = /<JSONPatch>([\s\S]*?)<\/JSONPatch>/.exec(String(text || ''));
    if (!m) return [];
    try {
      var arr = JSON.parse(m[1].replace(/```(?:json)?/gi, '').replace(/```/g, '').trim());
      return Array.isArray(arr) ? arr : [];
    } catch (e) { warn('开场白 JSONPatch 解析失败', e); return []; }
  }

  /* ══════════════ 写库（照 08-变量自愈中心五通道的 MVU 部分）══════════════ */
  async function writeStatData(statObj) {
    var errs = [];
    var mvu = findMvuGlobal();
    if (mvu && typeof mvu.getMvuData === 'function' && typeof mvu.replaceMvuData === 'function') {
      var targets = [{ type: 'chat' }, { type: 'message', message_id: 'latest' }];
      for (var i = 0; i < targets.length; i++) {
        try {
          var root = mvu.getMvuData(targets[i]);
          if (!root || typeof root !== 'object') root = { stat_data: {} };
          var base = root.stat_data || root.sata_data;
          if (!base || typeof base !== 'object') { base = {}; root.stat_data = base; }
          deepMergeInto(base, statObj);
          var pr = mvu.replaceMvuData(root, targets[i]);
          if (pr && typeof pr.catch === 'function') {
            await pr.catch(function (eW) { errs.push('MVU: ' + String((eW && eW.message) || eW)); });
          }
        } catch (eMvu) { errs.push('MVU: ' + String((eMvu && eMvu.message) || eMvu)); }
      }
    } else {
      errs.push('MVU 未就绪（getMvuData/replaceMvuData 不可用）');
    }
    try {
      if (typeof insertOrAssignVariables === 'function') {
        var p2 = insertOrAssignVariables({ stat_data: statObj }, { type: 'chat' });
        if (p2 && typeof p2.catch === 'function') await p2.catch(function (eI) { errs.push('chat变量: ' + String((eI && eI.message) || eI)); });
      }
    } catch (eIns) { errs.push('chat变量: ' + String((eIns && eIns.message) || eIns)); }
    try { if (typeof stat_data !== 'undefined' && stat_data && typeof stat_data === 'object') deepMergeInto(stat_data, statObj); } catch (eSd) {}
    return errs;
  }

  /* 写完后的补写拍：只补「设置字段包」，不重发整份种子。
     MVU 异步 parseMessage 开场白时可能用不带设置的旧快照整份 replaceMvuData，
     把刚写的设置冲掉 —— 900ms / 2400ms 各补一拍，冲掉就捡回来。 */
  function reassertPack(d) {
    var pack = {
      全局: { 游戏模式: normMode(d.mode), 季节: normSeason(d.season), 开局类型: normStartType(d.startType) },
      主角信息: {}
    };
    PLAYER_KEYS.forEach(function (k) { pack.主角信息[k] = String(d.player[k] == null ? '' : d.player[k]).trim(); });
    if (normMode(d.mode) === '纯爱') pack.苦主列表 = {};
    return pack;
  }
  function scheduleReassert(d) {
    setTimeout(function () { writeStatData(reassertPack(d)); }, 900);
    setTimeout(function () { writeStatData(reassertPack(d)); }, 2400);
  }

  /* ══════════════ 拨开场白 swipe（数据层直改，照同层版 jumpToGreeting 数据层B）══════════════ */
  function swipeGreetingTo(idx) {
    var ctx = getStContext();
    try {
      var m0 = ctx && ctx.chat && ctx.chat[0];
      if (!m0) return false;
      if (!Array.isArray(m0.swipes) || m0.swipes.length <= idx) return false;
      if ((typeof m0.swipe_id === 'number' ? m0.swipe_id : 0) === idx) return true;   /* 已在目标 */
      m0.swipe_id = idx;
      m0.mes = m0.swipes[idx];
      try { if (typeof ctx.saveChatDebounced === 'function') ctx.saveChatDebounced(); else if (typeof ctx.saveChat === 'function') ctx.saveChat(); } catch (eS) {}
      try { if (typeof ctx.updateMessageBlock === 'function') ctx.updateMessageBlock(0, m0); } catch (eU) {}
      try {
        var et = ctx.eventTypes || ctx.event_types || {};
        if (ctx.eventSource && et.MESSAGE_UPDATED) ctx.eventSource.emit(et.MESSAGE_UPDATED, 0);
      } catch (eE) {}
      return true;
    } catch (e) { warn('拨 swipe 失败', e); return false; }
  }

  /* ══════════════ 确认开局 ══════════════ */
  async function confirmStart() {
    if (state.busy) return;
    var d = JSON.parse(JSON.stringify(draft));
    state.busy = true;
    paintBusy(true);
    try {
      var arc = arcOf(d.arc);

      /* ① 拨到目标篇章的开场白（已在目标就不动第 0 楼） */
      var swiped = swipeGreetingTo(arc.idx);

      /* ② 从目标开场白现提取种子补丁（单一真相源 = 开场白自己） */
      var text = greetingTextOf(arc.idx);
      var ops = extractJsonPatch(text);
      if (!ops.length) throw new Error('目标篇章的开场白里没有 <JSONPatch> 种子，不能开局');

      /* ③ 加工 + 合成 + 落库 */
      var patched = thStartBuildPatch(ops, d);
      var statObj = opsToStatData(patched);
      var errs = await writeStatData(statObj);

      /* ④ 完成标记（chat 级；写失败不拦 —— 变量兜底判据还在） */
      try {
        if (typeof insertOrAssignVariables === 'function') {
          var pf = {}; pf[DONE_KEY] = true;
          var pflag = insertOrAssignVariables(pf, { type: 'chat' });
          if (pflag && typeof pflag.catch === 'function') pflag.catch(function () {});
        }
      } catch (eF) {}

      state.done = true;
      state.markSeen = false;        /* ★ 清 latch，否则下一拍 tick 又把面板弹回来 */
      state.open = false;
      state.scrolled = false;
      scheduleReassert(d);

      /* ⑤ 界面：面板收起（不留悬浮球） */
      unmountPanel();
      unmountChip();

      var gm = normMode(d.mode);
      var se = normSeason(d.season);
      var st = normStartType(d.startType);
      toast('已开局 · ' + arc.key + '篇 · ' + gm + '模式 · ' + SEASON_META[se].icon + se + ' · ' + st +
        (swiped ? '' : '（本就在这条线）') + (errs.length ? ' ⚠ 变量通道有报错（见控制台）' : ''));
      if (errs.length) warn('写入通道报错：', errs.join('；'));
      else log('开局完成：', arc.key, gm, se, st);
    } catch (e) {
      toast('❌ 开局失败：' + String((e && e.message) || e));
      warn('开局失败', e);
    } finally {
      state.busy = false;
      paintBusy(false);
    }
  }
  function resetForm() {
    draft = defaultDraft();
    if (state.open) { refreshPanel(); }
    toast('已重置为默认设置');
  }
  function paintBusy(busy) {
    var doc = getDoc();
    var btn = doc.querySelector('#' + HOST_ID + ' [data-thso-act="confirm"]');
    if (btn) {
      btn.disabled = !!busy;
      btn.textContent = busy ? '写入中…' : '✓ 确认开局';
      btn.classList.toggle('is-busy', !!busy);
    }
  }

  /* ══════════════ 轻提示 ══════════════ */
  function toast(msg, ms) {
    try {
      var doc = getDoc();
      ensureStyle();
      var el = doc.getElementById('th-start-toast');
      if (!el) {
        el = doc.createElement('div');
        el.id = 'th-start-toast';
        (doc.body || doc.documentElement).appendChild(el);
      }
      el.textContent = String(msg == null ? '' : msg);
      el.classList.add('th-start-toast-show');
      if (el.__thHide) clearTimeout(el.__thHide);
      el.__thHide = setTimeout(function () { try { el.classList.remove('th-start-toast-show'); } catch (eH) {} }, Math.max(1500, ms || 3200));
    } catch (e) { log(msg); }
  }

  /* ══════════════ 样式 ══════════════ */
  /* ★ 美化口径（Administrator 2026-11-12 指定）：樱花主题。
     暗樱夜底（比纯黑暖、比蓝黑粉）+ 樱粉线 + 花瓣渐变 + 五瓣樱花 SVG。
     色板：
       暗樱底 rgba(58,32,44,.92)→rgba(30,18,26,.95)（165deg 夜樱渐变）
       樱粉线 rgba(248,187,208,.22~.6) / 主樱粉 #f48fb1 / 深樱 #ec6a9c
       粉白字 #fbe4ec #f5c6d8 / 瓣白 #ffd9e4 / 花蕊 #ffd9a8
     全套覆盖 input / button 的酒馆默认样式 —— 主文档里酒馆的 CSS 会渗进来。 */
  function ensureStyle() {
    var doc = getDoc();
    if (doc.getElementById(STYLE_ID)) return;
    var css = [
      '#' + STYLE_ID + ' { display: none; }',
      '#' + HOST_ID + ' { margin: 12px auto 6px; max-width: min(760px, 96vw); }',
      /* v1.2 日光配色：白底 + 深墨字 + 蓝灰主色（原夜樱深紫粉在白底上浅粉字看不清） */
      '.thso-card { background: linear-gradient(170deg, #ffffff, #f7f9fb) !important; border: 1px solid #d8dde3 !important; border-radius: 12px !important; padding: 14px 16px 13px !important; color: #23272c !important; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif !important; font-size: 13px !important; line-height: 1.6 !important; box-shadow: 0 10px 30px rgba(40,50,60,.10) !important; box-sizing: border-box !important; text-align: left !important; }',
      '.thso-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 2px 2px 8px !important; margin-bottom: 8px !important; border-bottom: 1px solid #e6eaee !important; background: transparent !important; }',
      '.thso-sakura { flex: 0 0 auto !important; display: block !important; }',
      '.thso-title { font-size: 15px !important; font-weight: 800 !important; color: #23272c !important; letter-spacing: 1px !important; line-height: 1.2 !important; }',
      '.thso-sub { font-size: 10.5px !important; color: #7b838c !important; letter-spacing: .4px; margin-left: auto !important; }',
      '.thso-sect { margin: 12px 0 2px !important; }',
      '.thso-sect-t { font-size: 11px !important; font-weight: 700 !important; color: #3d6f9e !important; margin-bottom: 6px !important; letter-spacing: .8px !important; line-height: 1.3 !important; }',
      '.thso-cards { display: flex !important; flex-wrap: wrap !important; gap: 10px !important; }',
      /* 季节四个一行放下（原来 3+1 换行） */
      /* 季节四列：12px 间隔，卡片本身去掉 min-width/flex —— grid 里两者会把 4 列挤成贴边 */
      '.thso-cards-4 { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 12px !important; }',
      '.thso-cards-4 .thso-item { min-width: 0 !important; flex: none !important; width: auto !important; }',
      '@media (max-width: 620px) { .thso-cards-4 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }',
      '.thso-item { flex: 1 1 158px !important; min-width: 148px !important; min-height: 46px !important; border: 1px solid #e0e4e9 !important; border-radius: 10px !important; padding: 8px 11px !important; cursor: pointer !important; background: #fbfcfd !important; transition: border-color .15s, background .15s, box-shadow .15s !important; box-sizing: border-box !important; user-select: none !important; -webkit-user-select: none !important; }',
      '.thso-item:hover { border-color: #9bb8d2 !important; background: #f2f7fb !important; }',
      '.thso-item.on { border-color: #3d6f9e !important; background: #eef4f9 !important; box-shadow: 0 0 0 2px rgba(61,111,158,.16) !important; }',
      '.thso-item-tag { font-size: 10.5px !important; color: #5c646d !important; line-height: 1.35 !important; }',
      '.thso-item.on .thso-item-tag { color: #3d6f9e !important; }',
      '.thso-item-name { font-size: 13px !important; font-weight: 700 !important; color: #23272c !important; line-height: 1.4 !important; }',
      '.thso-item-desc { font-size: 10.5px !important; color: #7b838c !important; line-height: 1.4 !important; margin-top: 1px !important; }',
      '.thso-grid2 { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px 10px !important; }',
      '.thso-field { min-width: 0 !important; }',
      '.thso-field label { display: block !important; font-size: 10.5px !important; color: #5c646d !important; margin-bottom: 3px !important; font-weight: 700 !important; letter-spacing: .5px; }',
      '.thso-field input { width: 100% !important; box-sizing: border-box !important; background: #ffffff !important; border: 1px solid #d4d8dd !important; border-radius: 8px !important; color: #23272c !important; padding: 8px 10px !important; font-size: 12.5px !important; font-family: inherit !important; outline: none !important; line-height: 1.4 !important; }',
      '.thso-field input:focus { border-color: #3d6f9e !important; box-shadow: 0 0 0 2px rgba(61,111,158,.14) !important; }',
      '.thso-field input::placeholder { color: #a3aab2 !important; }',
      '.thso-summary { margin: 14px 0 0 !important; border: 1px dashed #cfd6dd !important; border-radius: 10px !important; padding: 9px 12px !important; background: #f6f8fa !important; font-size: 12px !important; color: #3a4048 !important; }',
      '.thso-summary b { color: #3d6f9e !important; font-weight: 800 !important; }',
      '.thso-summary .thso-su-empty { color: #8a929b !important; }',
      '.thso-actions { display: flex !important; gap: 10px !important; margin-top: 12px !important; }',
      'button.thso-btn { flex: 1 1 auto !important; font-family: inherit !important; font-size: 13.5px !important; font-weight: 800 !important; padding: 10px 18px !important; border-radius: 10px !important; cursor: pointer !important; letter-spacing: 2px !important; transition: all .15s !important; line-height: 1.4 !important; }',
      'button.thso-btn-confirm { background: linear-gradient(135deg, #5584b0, #3d6f9e) !important; border: 1px solid #3d6f9e !important; color: #ffffff !important; box-shadow: 0 4px 14px rgba(61,111,158,.28) !important; flex: 2 1 auto !important; }',
      'button.thso-btn-confirm:hover:not(:disabled) { filter: brightness(1.06) !important; box-shadow: 0 6px 20px rgba(61,111,158,.4) !important; }',
      'button.thso-btn:disabled { opacity: .5 !important; cursor: not-allowed !important; }',
      'button.thso-btn-ghost { background: #ffffff !important; border: 1px solid #d0d5da !important; color: #3d6f9e !important; }',
      'button.thso-btn-ghost:hover { border-color: #3d6f9e !important; color: #2f5c86 !important; }',
      '.thso-note { margin-top: 9px !important; font-size: 10.5px !important; color: #7b838c !important; line-height: 1.5 !important; }',
      '#' + CHIP_ID + ' { position: fixed !important; right: 14px !important; bottom: 20px !important; width: 42px !important; height: 42px !important; border-radius: 50% !important; background: linear-gradient(160deg, #ffffff, #eef4f9) !important; border: 1px solid #cfd6dd !important; box-shadow: 0 4px 14px rgba(40,50,60,.18) !important; z-index: 9998 !important; cursor: grab !important; display: flex !important; align-items: center !important; justify-content: center !important; touch-action: none !important; user-select: none !important; -webkit-user-select: none !important; transition: transform .15s !important; }',
      '#' + CHIP_ID + ':hover { transform: scale(1.08) !important; border-color: #9bb8d2 !important; }',
      '#' + CHIP_ID + ' svg { display: block !important; }',
      '#th-start-toast { position: fixed !important; top: 14px !important; left: 50% !important; transform: translate(-50%, -14px) !important; z-index: 100000 !important; max-width: min(88vw, 560px) !important; box-sizing: border-box !important; padding: 10px 16px !important; border-radius: 10px !important; background: #ffffff !important; border: 1px solid #d8dde3 !important; box-shadow: 0 10px 28px rgba(40,50,60,.16) !important; color: #23272c !important; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif !important; font-size: 12.5px !important; line-height: 1.6 !important; text-align: left !important; opacity: 0 !important; pointer-events: none !important; transition: opacity .22s ease, transform .22s ease !important; }',
      '#th-start-toast.th-start-toast-show { opacity: 1 !important; transform: translate(-50%, 0) !important; }'
    ].join('\n');
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ══════════════ 面板渲染 ══════════════ */
  function itemHtml(group, val, tag, name, desc, on) {
    return '<div class="thso-item' + (on ? ' on' : '') + '" data-thso-pick="' + group + '" data-thso-val="' + val + '" role="button" tabindex="0">' +
      (tag ? '<div class="thso-item-tag">' + tag + '</div>' : '') +
      '<div class="thso-item-name">' + name + '</div>' +
      (desc ? '<div class="thso-item-desc">' + desc + '</div>' : '') +
      '</div>';
  }
  function summaryHtml() {
    var a = arcOf(draft.arc);
    var se = normSeason(draft.season);
    var name = String(draft.player['玩家姓名'] || '').trim();
    return '当前设置：<b>' + a.key + '篇</b> · <b>' + normMode(draft.mode) + '模式</b> · <b>' +
      SEASON_META[se].icon + ' ' + se + '</b> · <b>' + normStartType(draft.startType) + '</b> · 玩家姓名 ' +
      (name ? ('<b>' + escHtml(name) + '</b>') : '<span class="thso-su-empty">（留空）</span>') +
      '　—　确认后写入本局存档';
  }
  function panelHtml() {
    var a = arcOf(draft.arc);
    var h = '';
    h += '<div class="thso-card" data-thso-rev="' + REV + '">';
    h += '<div class="thso-head">' + sakuraSvg(22) +
      '<span class="thso-title">春日狂想曲 · 开局设置</span><span class="thso-sub">确认后写入本局存档</span></div>';

    /* ① 起始篇章 */
    h += '<div class="thso-sect"><div class="thso-sect-t">① 起始篇章</div><div class="thso-cards">';
    ARCS.forEach(function (x) {
      h += itemHtml('arc', x.key, x.icon + ' ' + x.tag, x.key + '篇', x.desc, draft.arc === x.key);
    });
    h += '</div></div>';

    /* ② 游戏模式 */
    h += '<div class="thso-sect"><div class="thso-sect-t">② 游戏模式</div><div class="thso-cards">';
    h += itemHtml('mode', '牛头', '🐂 有苦主', '牛头模式', '保留各篇章的苦主名单，按四阶段推进', draft.mode === '牛头');
    h += itemHtml('mode', '纯爱', '🌸 无苦主', '纯爱模式', '苦主列表清空，只写她们主动靠近', draft.mode === '纯爱');
    h += '</div></div>';

    /* ③ 季节 */
    h += '<div class="thso-sect"><div class="thso-sect-t">③ 季节</div><div class="thso-cards thso-cards-4">';
    ['春', '夏', '秋', '冬'].forEach(function (s) {
      var m = SEASON_META[s];
      var sd = SEASON_START_DATE[s];
      h += itemHtml('season', s, m.icon + ' ' + sd.月份 + '月' + sd.日期 + '日起', s, m.desc, draft.season === s);
    });
    h += '</div></div>';

    /* ④ 玩家信息 */
    h += '<div class="thso-sect"><div class="thso-sect-t">④ 玩家信息</div><div class="thso-grid2">';
    PLAYER_KEYS.forEach(function (k) {
      h += '<div class="thso-field"><label>' + PLAYER_LABEL[k] + '</label>' +
        '<input type="text" data-thso-field="' + k + '" value="' + escAttr(String(draft.player[k] || '')) + '" placeholder="' + escAttr(PLAYER_PLACEHOLDER[k]) + '" autocomplete="off" /></div>';
    });
    h += '</div></div>';

    /* ⑤ 开局类型 */
    h += '<div class="thso-sect"><div class="thso-sect-t">⑤ 开局类型</div><div class="thso-cards">';
    h += itemHtml('startType', '正常开局', '🌤 原始好感起步', '正常开局', '开场白种子里的好感原样生效（全员 20）', draft.startType === '正常开局');
    h += itemHtml('startType', '梦幻开局', '🌙 所有女角色好感 100', '梦幻开局', '种子里的每位女角色好感直接拉满', draft.startType === '梦幻开局');
    h += '</div></div>';

    h += '<div class="thso-summary" data-thso-summary="1">' + summaryHtml() + '</div>';
    h += '<div class="thso-actions">' +
      '<button type="button" class="thso-btn thso-btn-confirm" data-thso-act="confirm">✓ 确认开局</button>' +
      '<button type="button" class="thso-btn thso-btn-ghost" data-thso-act="reset">重置</button>' +
      '</div>';

    h += '</div>';
    return h;
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function escAttr(s) { return escHtml(s); }

  /* 选中态与汇总条局部更新 —— 不整块重画，输入框内容绝不被打断 */
  function refreshPanel() {
    var doc = getDoc();
    var host = doc.getElementById(HOST_ID);
    if (!host) return;
    host.querySelectorAll('[data-thso-pick]').forEach(function (el) {
      var g = el.getAttribute('data-thso-pick');
      var v = el.getAttribute('data-thso-val');
      var cur = (g === 'arc') ? draft.arc : (g === 'mode') ? draft.mode : (g === 'season') ? draft.season : draft.startType;
      el.classList.toggle('on', cur === v);
    });
    var su = host.querySelector('[data-thso-summary="1"]');
    if (su) su.innerHTML = summaryHtml();
  }

  /* 挂载：找第 0 楼（第一个 AI 楼）的 .mes_text 末尾 append。
     已挂且是本版本（rev 一致）就跳过 —— 输入框里的字不能被心跳打断。 */
  function findGreetingMes() {
    var r = scanStartMes(getDoc());
    /* 关键词触发优先：带【开局】标签的楼；标签被抹过/老档 → 兜底第一个 AI 楼 */
    return r.marked || r.firstAi;
  }
  function mountPanel() {
    var doc = getDoc();
    ensureStyle();
    var mesText = findGreetingMes();
    if (!mesText) return;
    var pre = doc.getElementById(HOST_ID);
    if (pre) {
      if (mesText.contains(pre) && pre.getAttribute('data-thso-rev') === REV) return;   /* 已在，别动输入中的面板 */
      if (pre.parentNode) pre.parentNode.removeChild(pre);
    }
    var host = doc.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-thso-rev', REV);
    host.innerHTML = panelHtml();
    mesText.appendChild(host);
    bindHost(host);
    scrubMark(mesText);          /* ★ 关键词用完即抹，玩家不看见 */
    /* 面板滚进视野（只在新弹时） */
    if (!state.scrolled && !state.busy) {
      state.scrolled = true;
      try { host.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { try { host.scrollIntoView(); } catch (e2) {} }
    }
  }
  function unmountPanel() {
    var doc = getDoc();
    var pre = doc.getElementById(HOST_ID);
    if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
  }
  /* 面板内容整体重画（重置 / 重新打开时才走；输入中的刷新走 refreshPanel） */
  function refreshPanelHard() {
    var doc = getDoc();
    var host = doc.getElementById(HOST_ID);
    if (!host) { mountPanel(); return; }
    host.innerHTML = panelHtml();
    bindHost(host);
  }

  /* ══════════════ 悬浮章（完成后入口；可拖拽，单击打开）══════════════ */
  function mountChip() {
    var doc = getDoc();
    ensureStyle();
    if (doc.getElementById(CHIP_ID)) return;
    var chip = doc.createElement('div');
    chip.id = CHIP_ID;
    chip.setAttribute('data-thso-chip', '1');
    chip.innerHTML = sakuraSvg(26);
    chip.title = '开局设置（点开可改篇章 / 模式 / 季节 / 开局类型后重新确认）';
    (doc.body || doc.documentElement).appendChild(chip);
    initChipDrag(chip);
  }
  function unmountChip() {
    var doc = getDoc();
    var chip = doc.getElementById(CHIP_ID);
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
  }
  function initChipDrag(chip) {
    var sx = 0, sy = 0, ix = 0, iy = 0, moving = false, moved = false;
    chip.style.touchAction = 'none';
    chip.onpointerdown = function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      moving = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      var r = chip.getBoundingClientRect();
      ix = r.left; iy = r.top;
      try { chip.setPointerCapture(e.pointerId); } catch (ec) {}
    };
    chip.onpointermove = function (e) {
      if (!moving) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
      if (moved) {
        var w = window.innerWidth || 800, h = window.innerHeight || 600;
        chip.style.left = Math.max(0, Math.min(ix + dx, w - chip.offsetWidth)) + 'px';
        chip.style.top = Math.max(0, Math.min(iy + dy, h - chip.offsetHeight)) + 'px';
        chip.style.right = 'auto'; chip.style.bottom = 'auto';
      }
    };
    chip.onpointerup = function (e) {
      if (!moving) return;
      moving = false;
      try { chip.releasePointerCapture(e.pointerId); } catch (er) {}
      if (!moved) {
        state.open = true;
        unmountChip();
        mountPanel();
      }
    };
    chip.onpointercancel = function () { moving = false; };
  }

  /* ══════════════ 事件（全部委托 —— 楼层被重画、节点被重建都不丢）══════════════ */
  function bindHost(host) {
    if (host.__thsoBound) return;
    host.__thsoBound = true;
    host.addEventListener('click', function (ev) {
      var el = ev.target;
      var pick = el && el.closest ? el.closest('[data-thso-pick]') : null;
      if (pick) {
        ev.stopPropagation();
        var g = pick.getAttribute('data-thso-pick');
        var v = pick.getAttribute('data-thso-val');
        if (g === 'arc') draft.arc = arcOf(v).key;
        else if (g === 'mode') draft.mode = normMode(v);
        else if (g === 'season') draft.season = normSeason(v);
        else if (g === 'startType') draft.startType = normStartType(v);
        refreshPanel();
        return;
      }
      var act = el && el.closest ? el.closest('[data-thso-act]') : null;
      if (act) {
        ev.stopPropagation();
        var a = act.getAttribute('data-thso-act');
        if (a === 'confirm') confirmStart();
        else if (a === 'reset') resetForm();
      }
    });
    host.addEventListener('input', function (ev) {
      var t = ev.target;
      try {
        var k = t.getAttribute && t.getAttribute('data-thso-field');
        if (k && draft.player && (k in draft.player)) draft.player[k] = String(t.value || '');
      } catch (e) {}
    });
    /* 输入框里打字不许触发酒馆的快捷键（天元录 installDocGuards 同款防线） */
    host.addEventListener('keydown', function (ev) {
      try {
        var tag = (ev.target && ev.target.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') ev.stopPropagation();
      } catch (e) {}
    });
    host.addEventListener('keydown', function (ev) {
      /* 卡片支持键盘：Enter / Space 选中 */
      var pick = ev.target && ev.target.closest ? ev.target.closest('[data-thso-pick]') : null;
      if (pick && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        pick.click();
      }
    });
  }

  /* ══════════════ 心跳：挂载 / 摘除 / 自愈 ══════════════
     面板开着 → 每拍确保挂着（被酒馆重画洗掉就回来，已挂着且版本一致就跳过）；
     完成 → 面板摘掉、悬浮章挂上；
     未完成且只有 1 楼（新聊天还没开局）→ 自动弹面板；
     未完成但已聊起来（老档 / 玩家有意跳过）→ 不骚扰，只给悬浮章。 */
  function tick() {
    try {
      if (state.busy) return;                    /* 确认流程中不动界面（拨 swipe 会重画楼层） */
      /* ★ v10.6：先扫【开局】标签，再判 done —— 顺序反了会把该弹的面板拆掉。
         关键词触发 latch：这一楼曾带【开局】标签就认定该弹面板，
         标签被 scrub 抹掉后依然成立。 */
      try {
        var sm = scanStartMes(getDoc());
        if (sm.marked) state.markSeen = true;
      } catch (eMark) {}
      state.done = guessDone();
      /* 楼里还带【开局】标签 = 明确没开局 → 面板锁死常驻。
         状态栏 iframe / 气泡渲染重画楼层把面板洗掉时，下一拍自动挂回来。 */
      if (state.markSeen && !state.done) state.open = true;
      if (state.open) { mountPanel(); unmountChip(); return; }
      unmountPanel();
      if (state.done) { unmountChip(); return; }
      if (chatLen() <= 1) { state.open = true; mountPanel(); unmountChip(); return; }
      unmountChip();
    } catch (e) { warn('tick 异常', e); }
  }

  /* ══════════════ 启动 ══════════════ */
  /* 首次草稿按「当前开场白是哪条 swipe」初始化（玩家手动切过开场白时跟着走）。
     只在脚本装入后做一次；之后重置也回这份。 */
  try {
    if (!state.inited) { draft = defaultDraft(); state.inited = true; }
  } catch (eInit) {}

  try { tick(); } catch (e0) {}
  if (window.__thStartTickTimer) clearInterval(window.__thStartTickTimer);
  window.__thStartTickTimer = setInterval(tick, 1500);

  /* 换聊天 / swipe 切换后立刻对一次表（不等下一拍） */
  try {
    var w0 = [];
    try { w0.push(window.top); } catch (eW0) {}
    try { w0.push(window.parent); } catch (eW1) {}
    w0.push(window);
    w0.forEach(function (w) {
      try {
        if (w && w.eventOn) {
          w.eventOn('chat_changed', function () { state.open = false; state.markSeen = false; unmountPanel(); draft = defaultDraft(); tick(); });
          w.eventOn('MESSAGE_UPDATED', function () { if (!state.busy) tick(); });
        }
      } catch (eE) {}
    });
  } catch (eEv) {}

  /* 调试出口：控制台手动开面板 / 看状态 */
  try {
    window.__thStartDebug = {
      open: function () { state.open = true; tick(); },
      close: function () { state.open = false; tick(); },
      state: function () { return JSON.parse(JSON.stringify({ open: state.open, busy: state.busy, done: state.done, draft: draft })); },
      buildPatch: thStartBuildPatch,
      opsToStatData: opsToStatData
    };
  } catch (eDbg) {}
})();
