/* ============================================================
   《后台推演外置 AI》v1.0
   作用：玩家切换场景时，调一次外置 AI，推演「场外 NPC」接下来在哪、在做什么、在想什么。
     · 不生成正文，只要一小段 <后台推演>，所以可以用又快又便宜的模型（5 秒内出结果那种）。
     · 在场状态为 true 的人：不推演、也不输出（他们由正文与变量负责，推演脚本一个字都不改变量）。
     · 拿到闭合的 <后台推演>…</后台推演> 之后立刻注入酒馆（depth 0 / SYSTEM），主 AI 下一轮就照它写。
     · 同时把结果交给核心脚本（window.__thGalExternalDeduction + localStorage），立绘与面板马上能用到。
   界面上有一个悬浮球：看状态、看上次输出、手动推演、开关自动、改 API 设置。
   ============================================================ */
(function () {
  'use strict';

  /* ────────────── 默认设置 ────────────── */
  var DEFAULTS = {
    enabled: true,            /* 总开关 */
    injectOn: true,           /* ★ v1.8：把结果注入给正文 AI（只注入，不提取） */
    memoryToast: false,       /* ★ v1.23：收录重要记忆时要不要弹提示（默认关，免得挡画面） */
    memMax: 5,                /* ★ 重要记忆保留条数：默认 5 条，可在面板调整 */
    wantThinking: false,      /* ★ v1.19：默认不要 <思考>。模型自带的思维链面板里照样能看到，
                                  再要它写一段反而容易勾出自问自答。想开在面板上勾一下。 */
    devMode: false,           /* ★ v1.19：开发者模式。关着的时候面板只看结果，不堆提示词与返回。 */
    useBlurbs: true,          /* ★ v1.8：把所有人的精简性格喂给推演 AI */
    auto: true,               /* ★ 已取消这个开关，恒为 true（保留字段只为兼容旧设置） */
    trigger: 'advance',       /* 推演时机：advance = 每轮推进推一次（默认）；scene = 切场景推一次。两者互斥 */
    useHostModel: false,      /* ★ 方案 A：用当前酒馆的模型推演（不用填 API） */

    base: 'https://api.openai.com/v1',
    key: '',
    model: 'gpt-4o-mini',
    temperature: 0.85,
    maxTokens: 6000,   /* ★ v1.16：全场 15 人 + <思考> 大约 1000 到 2500 token，6000 留足余量。 */
    /*                  花的是真正输出出来的 token，不是这个上限，所以调大不额外花钱。 */
    /* ★ v1.6：只看最新一楼正文（用来找约定），不再喂最近 N 楼 */
    latestChars: 1200,        /* （v1.8 起不再读正文，这个字段留着不用） */
    memory: 1,                /* 老字段，留着兼容 */
    memoryChars: 700,
    debounceMs: 900,          /* 切场景后等一会儿再推，避免边走边推 */
    cooldownMs: 4000,         /* 两次推演之间至少隔这么久 */
    timeoutMs: 60000,   /* ★ v1.17：中转站慢的时候 30 秒不够，提到 60 秒 */
  };
  var KEY_SETTINGS = 'thGalDeduceSettings';
  var KEY_POS = 'thGalDeduceOrbPos';
  var KEY_LAST = 'thGalDeduction::';
  var INJECT_NAME = 'script_inject_external_deduction';
  

  var S = { settings: null, models: null, modelsOpen: false, memory: null, pacts: null, lastMove: null, lastReasoning: '', lastRaw: '', lastPrompt: '', previewPrompt: '', lastParsed: null, lastInjected: '', lastMs: 0, history: [], deckWatchdog: null, greeted: false, running: false, status: 'idle', statusText: '待机', lastAt: 0, lastText: '', lastError: '', orb: null, panel: null, watcher: null, lastSceneKey: '', lastRunAt: 0, pendingTimer: null };

  /* ────────────── 小工具 ────────────── */
  /* ★ v1.2：酒馆助手的脚本可能各自跑在自己的 window 里。
     所以「界面在哪个文档」不能想当然是自己这个：先找哪个 document 里有游戏壳子，
     再退一步拿最外层那个有 body 的文档（酒馆界面就在那儿）。 */
  function windows() {
    var out = [];
    try { if (typeof window !== 'undefined') out.push(window); } catch (e) {}
    try { if (window.parent && out.indexOf(window.parent) < 0) out.push(window.parent); } catch (e) {}
    try { if (window.top && out.indexOf(window.top) < 0) out.push(window.top); } catch (e) {}
    return out;
  }
  function findUiDoc() {
    var list = windows(), i, dd;
    for (i = 0; i < list.length; i++) {
      try { dd = list[i].document; if (dd && dd.getElementById && dd.getElementById('th-gal-shell-root')) return dd; } catch (e) {}
    }
    for (i = list.length - 1; i >= 0; i--) {
      try { dd = list[i].document; if (dd && dd.body) return dd; } catch (e) {}
    }
    try { if (typeof document !== 'undefined' && document && document.body) return document; } catch (e2) {}
    return null;
  }
  function doc() { return findUiDoc(); }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }
  function clamp(n, a, b) { n = Number(n); if (isNaN(n)) return a; return Math.min(b, Math.max(a, n)); }
  function escapeHtml(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    try {
      if (typeof toastr !== 'undefined' && toastr && toastr.info) { toastr.info(msg); return; }
    } catch (e) {}
    try {
      var d = doc();
      var n = d.createElement('div');
      n.textContent = msg;
      n.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483000;background:rgba(15,23,42,.92);color:#e2e8f0;padding:6px 12px;border-radius:8px;font-size:13px;border:1px solid rgba(148,163,184,.4)';
      d.body.appendChild(n);
      setTimeout(function () { try { n.remove(); } catch (e2) {} }, 2200);
    } catch (e3) {}
  }
  function getContext() {
    try { if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') return window.SillyTavern.getContext(); } catch (e) {}
    try { var t = window.parent || window.top; if (t && t.SillyTavern && typeof t.SillyTavern.getContext === 'function') return t.SillyTavern.getContext(); } catch (e2) {}
    return null;
  }
  function st() {
    try { if (window.SillyTavern) return window.SillyTavern; } catch (e) {}
    try { var t = window.parent || window.top; if (t && t.SillyTavern) return t.SillyTavern; } catch (e2) {}
    return null;
  }
  function chatId() {
    /* ★ 必须按【存档】区分，不能按角色：
       以前第一顺位用 ctx.chatId（那是角色 id），同一角色的不同存档完全一样，
       于是记忆 / 推演记录 / 各种缓存全部串在一起。
       顺序：存档自己的 chat_id → 存档文件名 → 存档名 → 角色 + 内容指纹 → default */
    try {
      var ctx = getContext();
      if (ctx) {
        var m = ctx.chat_metadata || {};
        if (m.chat_id) return String(m.chat_id);
        if (m.file_name) return String(m.file_name);
        if (m.name) return String(m.name);
      /* ★ 兜底键改成“每个聊天唯一”：先在 chat 作用域里存一个自造 key（随聊天保存），
         拿不到才退回本次页面的随机串 —— 绝不再用“内容指纹”（两个同开场的聊天会撞键，
         于是新聊天继承了旧聊天的推演记录 / 标题状态 / 位置，看着就是“有缓存”）。 */
      try {
        if (typeof getVariables === 'function' && typeof insertOrAssignVariables === 'function') {
          var g = getVariables({ type: 'chat' }) || {};
          if (g.__thChatKey) return String(g.__thChatKey);
          var nk = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          insertOrAssignVariables({ __thChatKey: nk }, { type: 'chat' });
          return nk;
        }
      } catch (eK) {}
      try { if (!window.__thSessionSalt) window.__thSessionSalt = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); return window.__thSessionSalt; } catch (eS) {}        if (ctx.chatId) return 'ch::' + String(ctx.chatId);
      }
    } catch (e) {}
    return 'default';
  }
  /* ★ 篇章过滤（出口处兜底）：非本篇章的地点/人物一律剔掉。
     保留“不许提 XX”这类规则行（含 不许/不要/禁止/没有 的不剔）。
     ★ v98：从「只区分公寓/乡村」扩成三篇章——神社篇要同时剔乡村词与公寓词。 */
  var ARC_BAD_WORDS = {
    '公寓': /小卖铺|春日|乡村|村里|村口|林间|大坝|伐木场|西村|山上|吉川|香本|白坂|智本|宅邸|久美子|静奈|大平|左寻|千玲|椿芽|百花|美穗|太郎|大田|神社|鸟居|巫女|神代|月读|斋宫|凛音|若叶|佛堂|神龛|大院|檐廊|参道|隔壁一家/,
    /* ★ v98：神社篇补上「村里 / 小区 / 隔壁一家 / 厨房 / 客厅」这些不直接带地名、但一看就知道是别的篇章的漏网词 */
    '神社': /小卖铺|春日|乡村|村里|村口|林间|大坝|伐木场|西村|山上|吉川|香本|白坂|智本|宅邸|久美子|静奈|大平|左寻|千玲|椿芽|百花|美穗|太郎|大田|公寓|301室|便利店|号门|松本|浅间|神谷|茉由|美咲|奈绪|千鹤|小区|隔壁一家|厨房|客厅|阳台/
  };
  function arcFilterLines(lines) {
    try {
      var cur = currentArcOf();
      var bad = ARC_BAD_WORDS[cur];
      if (!bad) return lines;                 /* 夏越村：不做过滤 */
      var keep = /不许|不要|禁止|没有|不得|别写|剔除/;
      return lines.filter(function (s) {
        var line = String(s || '');
        if (!bad.test(line)) return true;
        if (keep.test(line)) return true;
        return false;
      });
    } catch (e) { return lines; }
  }
  function chatArray() {
    try { var ctx = getContext(); if (ctx && Array.isArray(ctx.chat)) return ctx.chat; } catch (e) {}
    return [];
  }

  /* ★ v1.28：把面板上刚敲的内容收进设置并立刻存盘。
     以前只有「保存」按钮会收，填了地址 / 钥匙直接点「拉取模型」的话，
     拉取用的还是旧的（或空的）值，而且面板一重画就把你敲的字冲掉了。 */
  function pullInputsInto(panel) {
    if (!S.settings) loadSettings();
    if (!panel) return S.settings;
    var g = function (id) { var n = panel.querySelector('#' + id); return n ? n.value : null; };
    var v;
    v = g('th-deduce-base'); if (v !== null) S.settings.base = String(v).trim();
    v = g('th-deduce-key'); if (v !== null) S.settings.key = String(v).trim();
    v = g('th-deduce-model'); if (v !== null) S.settings.model = String(v).trim() || DEFAULTS.model;
    v = g('th-deduce-temp'); if (v !== null) S.settings.temperature = clamp(v, 0, 2);
    v = g('th-deduce-max'); if (v !== null) S.settings.maxTokens = clamp(v, 200, 4000);
    v = g('th-deduce-mem'); if (v !== null) S.settings.memory = clamp(v, 1, 8);
    saveSettings();
    return S.settings;
  }

  function loadSettings() {
    var raw = store(KEY_SETTINGS);
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    if (raw) {
      try {
        var got = JSON.parse(raw);
        for (var k2 in got) if (k2 in out) out[k2] = got[k2];
      } catch (e) {}
    }
    /* ★ v1.3：老设置里那个 900 会把输出截断（看起来就像「模型没吐闭合标签」），自动抬到 2000 */
    if (!(Number(out.maxTokens) >= 1200)) { out.maxTokens = DEFAULTS.maxTokens; saveSettingsSoon(out); }
    S.settings = out;
    return out;
  }
  function saveSettings() { try { store(KEY_SETTINGS, JSON.stringify(S.settings)); } catch (e) {} }
  function saveSettingsSoon(obj) { try { store(KEY_SETTINGS, JSON.stringify(obj)); } catch (e) {} }

  /* ────────────── 读正文 / 变量 ────────────── */
  function messageTextOf(m) {
    if (!m || typeof m !== 'object') return '';
    var swId = m.swipe_id != null ? m.swipe_id : 0;
    if (m.swipe_info && m.swipe_info[swId] && typeof m.swipe_info[swId].mes === 'string') return String(m.swipe_info[swId].mes);
    if (m.swipes && m.swipes.length) {
      var cur = m.swipes[swId];
      if (cur && typeof cur === 'object') return String(cur.mes != null ? cur.mes : '');
      return String(cur == null ? '' : cur);
    }
    return String(m.mes || '');
  }
  function stripTags(text) {
    return String(text || '')
      .replace(/<([a-zA-Z0-9_\u4e00-\u9fa5]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\t ]+/g, ' ');
  }
  function findMvu() {
    var cands = [window];
    try { if (window.parent) cands.push(window.parent); } catch (e) {}
    try { if (window.top) cands.push(window.top); } catch (e) {}
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && typeof cands[i].Mvu !== 'undefined') return cands[i].Mvu; } catch (e2) {}
    }
    return null;
  }
  function latestAiIds(limit) {
    var ids = [];
    var chat = chatArray();
    for (var i = chat.length - 1; i >= 0 && ids.length < (limit || 8); i--) {
      var m = chat[i];
      if (m && !m.is_user && !m.is_system && m.role !== 'user') ids.push(i);
    }
    return ids;
  }
  /* 变量：跟核心脚本同一套读法（最新消息层当底 → 旧消息层补缺 → chat 补缺），只读不写 */
  function fillMissing(base, overlay) {
    if (!overlay || typeof overlay !== 'object') return base;
    Object.keys(overlay).forEach(function (k) {
      var v = overlay[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!base[k] || typeof base[k] !== 'object' || Array.isArray(base[k])) base[k] = {};
        fillMissing(base[k], v);
      } else if (base[k] === undefined || base[k] === null || base[k] === '') {
        base[k] = v;
      }
    });
    return base;
  }
  function readState() {
    var mvu = findMvu();
    var merged = null;
    if (mvu && typeof mvu.getMvuData === 'function') {
      var pull = function (target) {
        try {
          var d = mvu.getMvuData(target);
          if (!d) return;
          var b = d.stat_data || d.sata_data;
          if (!b || typeof b !== 'object') return;
          if (merged === null) merged = JSON.parse(JSON.stringify(b));
          else fillMissing(merged, b);
        } catch (e) {}
      };
      latestAiIds(8).forEach(function (id) { pull({ type: 'message', message_id: id }); });
      pull({ type: 'chat' });
    }
    if (!merged) {
      try { if (typeof getVariables === 'function') { var v = getVariables(); merged = v && (v.stat_data || v); } } catch (e2) {}
    }
    if (!merged) {
      try { if (typeof getvar === 'function') merged = getvar('stat_data'); } catch (e3) {}
    }
    return merged || {};
  }
  /* ★ v1.24：同一宅邸（不同房间也算）或同一个户外地名 = 同一场；缺信息时保守算同一场。 */
  function sameScene(a, b) {
    var x = String(a || '').trim();
    var y = String(b || '').trim();
    if (!x || !y) return true;
    if (x === y) return true;
    var hx = x.split('·')[0];
    var hy = y.split('·')[0];
    if (x.indexOf('·') > 0 && y.indexOf('·') > 0 && hx === hy) return true;
    return false;
  }
  function presentList(sd) {
    var out = { on: [], off: [], rows: {} };
    ['主要角色列表', '苦主列表'].forEach(function (tableName) {
      var table = sd[tableName];
      if (!table || typeof table !== 'object') return;
      Object.keys(table).forEach(function (name) {
        var row = table[name] || {};
        out.rows[name] = row;
        var flag = row.在场状态 === true || String(row.在场状态).toLowerCase() === 'true';
        if (flag) { if (out.on.indexOf(name) < 0) out.on.push(name); }
        else if (out.off.indexOf(name) < 0) out.off.push(name);
      });
    });
    return out;
  }
  function lastDeductionFromChat() {
    /* ★ v1.11：主 AI 不再自己写 <后台推演> 了，所以正文里那份优先（万一还开着），
       没有的话就退回用「上一次外置推演的结果」，不然每轮都变成「这是第一次」。 */
    var chat = chatArray();
    for (var i = chat.length - 1; i >= 0; i--) {
      var m = chat[i];
      if (!m || m.is_user || m.is_system || m.role === 'user') continue;
      var txt = messageTextOf(m);
      var mm = txt.match(/<\s*后台推演[^>]*>([\s\S]*?)<\s*\/\s*后台推演\s*>/i);
      if (mm && mm[1] && mm[1].trim()) return { text: mm[1].trim(), fromMessage: i, fromRecord: false };
      break;   /* 只看最新的那一楼 */
    }
    try {
      var rec = null;
      if (window.__thGalExternalDeduction) rec = window.__thGalExternalDeduction;
      if (!rec) {
        var raw = store(lastKey());
        if (raw) rec = JSON.parse(raw);
      }
      if (rec && rec.text) {
        var body = String(rec.text).replace(/<\s*\/?\s*后台推演[^>]*>/gi, '').trim();
        if (body) return { text: body, fromMessage: -1, fromRecord: true };
      }
    } catch (e) {}
    return null;
  }
  /* ★ v1.6：记忆重新设计。
     每次都只看**最新一楼**的正文（就一层），用来找「约定」；除此之外不给它任何历史。
     正文里的非正文块（后台推演 / 变量）照旧先剥掉。 */
  function latestProse() {
    var chat = chatArray();
    for (var i = chat.length - 1; i >= 0; i--) {
      var m = chat[i];
      if (!m || m.is_system || m.is_user || m.role === 'user') continue;
      var raw = messageTextOf(m);
      if (!raw) continue;
      var body = stripTagBlocks(raw);           /* 先剥 <后台推演> / <UpdateVariable> */
      /* 注意：不能用「连内容一起剥」的那种剥法（那会把 <content>正文</content> 整段删掉） */
      var cm = body.match(/<\s*content(?=[\s>])[^>]*>([\s\S]*?)(?:<\s*\/\s*content\s*>|$)/i);
      if (cm && cm[1]) body = cm[1];
      var txt = body.replace(/<[^>]+>/g, '');   /* 只去尖括号，文字留下 */
      txt = txt.replace(/<\s*约定[^>]*>[\s\S]*?(<\s*\/\s*约定\s*>|$)/gi, '');   /* 约定段不算正文 */
      txt = txt.replace(/\[外置推演\][\s\S]*/g, '');
      txt = txt.replace(/\s+/g, ' ').trim();
      var limit = clamp(S.settings.latestChars, 300, 4000);
      if (txt.length > limit) txt = txt.slice(0, limit) + '…';
      return txt;
    }
    return '';
  }
  function stripTagBlocks(text) {
    var out = String(text || '');
    var tags = ['后台推演', 'UpdateVariable', 'Analysis', 'JSONPatch'];
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      out = out.replace(new RegExp('<\\s*' + t + '(?=[\\s>])[^>]*>[\\s\\S]*?<\\s*\\/\\s*' + t + '\\s*>', 'gi'), '');
      out = out.replace(new RegExp('<\\s*' + t + '(?=[\\s>])[^>]*>[\\s\\S]*$', 'i'), '');
    }
    return out;
  }

  /* ★ v1.8：重要记忆：正文 AI 用 <重要记忆> 标签写，脚本去重后永久保存，只能手动删。
     外置 AI 从此不读正文，也就不会因为正文是色色而破不了线。 */
  function normKey(t) {
    return String(t || '').replace(/[\s。，、；：！？.,;:!?"'「」『』（）()【】\[\]<>《》]/g, '').toLowerCase();
  }
  function loadMemory() {
    try {
      var raw = store(memoryKey());
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  /* ★ v1.9：只留最近 5 条。更远的事情本来也用不上，那是正文 AI 自己的事。 */
  /* ★ 记忆条数可调：设置里 memMax（默认 5，钳在 1~20） */
  function memMax() {
    var n = parseInt((S.settings || {}).memMax, 10);
    if (!(n >= 1)) n = 5;
    return Math.min(20, n);
  }
  var MEMORY_MAX = 5;
  var MEMORY_MAXLEN = 200;     /* ★ 一条记忆最多 200 字，留足空间给结构化要素 */
  var _memNotified = '';       /* ★ v1.23：上一次提示过的内容（防刷屏） */
  var _memNotifiedAt = 0;
  function saveMemory(list) {
    var arr = (list || []).slice();
    var mm = memMax();
    if (arr.length > mm) arr = arr.slice(arr.length - mm);   /* 从最远的（最旧的）开始删；条数可在面板调 */
    S.memory = arr;
    try { store(memoryKey(), JSON.stringify(S.memory)); } catch (e) {}
    return S.memory;
  }
  function memoryKey() { return 'thGalMemory::' + chatId() + arcSuffix(); }
  function memorySeenKey() { return 'thGalMemorySeen::' + chatId() + arcSuffix(); }
  /* ★ v118：缓存键统一带一个「@篇章」后缀。
     为什么必须带：同一个存档里从夏越村切到公寓，存档 id 一个字节都不变，
     于是所有按 chatId 分的键全部继续命中 ——
       · 记忆里攒的还是夏越村的人和事（吉川美惠、小卖铺），被当成公寓篇的背景喂进去
       · 「上次推演结果」还写着夏越村，AI 以为玩家还在村里
       · memorySeen 指纹一样，新篇章的重要记忆收不进来
     用户要的是「根据篇章变量实时区分」，所以键必须跟着 currentArcOf() 走。
     ⚠ 只隔离、不删除（用户明确要的）：切回夏越村时它自己那份记忆还在，接得上。 */
  function arcSuffix() {
    try { return '@' + currentArcOf(); } catch (e) { return '@夏越村'; }
  }
  /* 「上一次推演结果」的键 —— 只此一份实现，读和写都必须走它（铁律八：判据单一）。
     以前读的地方在 latestDeduction()、写的地方在 publish()，两处各拼一遍
     KEY_LAST + chatId()；加篇章维度时只要漏一处，写进去的读不出来（面板永远空着）。 */
  function lastKey() { return KEY_LAST + chatId() + arcSuffix(); }
  /* 把一段文本里的 <重要记忆> 抽出来（一条一行），并返回去掉该标签的剩余文本 */
  function splitMemoryTag(text) {
    var raw = String(text || '');
    var m = raw.match(/<\s*重要记忆[^>]*>([\s\S]*?)<\s*\/\s*重要记忆\s*>/i);
    var inner = m ? m[1] : '';
    var rest = raw.replace(/<\s*重要记忆[^>]*>[\s\S]*?(<\s*\/\s*重要记忆\s*>|$)/gi, '');
    var items = [];
    String(inner).split(/\n+/).forEach(function (line) {
      var t = String(line || '').replace(/^[-*·•\d.、)\s]+/, '').trim();
      if (!t) return;
      if (/^(无|暂无|没有|none)/i.test(t)) return;
      items.push(t);
    });
    return { items: items, rest: rest.trim(), hadTag: !!m };
  }
  /* 从最新的 AI 楼层里收重要记忆（去重、只有手动删才消失）。
     ★ v1.9b：同一楼、同一份内容只收一次。看门狗每 2 秒扫一遍，
     要是不记指纹，你刚在面板里删掉的那条马上又会被塞回来。
     force = true 时无视指纹（面板上那个「现在扫一遍」按钮走这条路）。 */
  function harvestMemory(silent, force) {
    var list = S.memory || loadMemory();
    var added = [];
    var chat = chatArray();
    for (var i = chat.length - 1; i >= 0; i--) {
      var m = chat[i];
      if (!m || m.is_system || m.is_user || m.role === 'user') continue;
      var got = splitMemoryTag(messageTextOf(m));
      var sig = i + '|' + normKey(got.items.join('|'));
      /* ★ v1.23：localStorage 万一写不进去（有些窗口是 srcdoc 沙箱），内存里也记一份，免得每轮重复收、重复提示 */
      if (!force && (store(memorySeenKey()) === sig || S.memorySeenSig === sig)) { S.memory = list; return []; }
      S.memorySeenSig = sig;
      store(memorySeenKey(), sig);
      S.memoryFloor = { index: i, total: chat.length };   /* ★ v1.15：这一批记忆是从第几楼读的 */
      /* ★ v1.23：一轮只收一条，多的行一律不要；每条截到 50 字 */
      var oneItem = got.items.length ? String(got.items[0]).trim() : '';
      if (oneItem.length > MEMORY_MAXLEN) oneItem = oneItem.slice(0, MEMORY_MAXLEN);
      if (oneItem) {
        var key = normKey(oneItem);
        var dup = false;
        for (var j = 0; j < list.length; j++) { if (normKey(list[j]) === key) { dup = true; break; } }
        if (!dup) { list.push(oneItem); added.push(oneItem); }
      }
      break;   /* 只看最新一楼的那个标签 */
    }
    if (added.length) {
      saveMemory(list);
      if (!silent) notifyMemory(added, i);
      renderPanel();
    } else {
      S.memory = list;
    }
    return added;
  }
  /* ★ v1.23：提示这件事要克制。默认不提示；开着的话同一批内容 30 秒内也只说一次。 */
  function notifyMemory(added, floorIndex) {
    if (S.settings && S.settings.memoryToast === false) return;
    var key = normKey(added.join('|'));
    if (_memNotified === key && (Date.now() - _memNotifiedAt) < 30000) return;
    _memNotified = key;
    _memNotifiedAt = Date.now();
    toast('📖 收录 ' + added.length + ' 条重要记忆（第 ' + (floorIndex + 1) + ' 楼）');
  }
  /* ★ v1.9 / v1.22：模型偶尔还是会把手边的人写进结果。这种人的那一段直接删掉：
     变量里 在场状态=true 的人不可能被推演移走，走不走是正文 AI 的事。 */
  function dropSkipped(text, skipNames) {
    var raw = String(text || '');
    var dropped = [];
    if (!skipNames || !skipNames.length) return { text: raw, dropped: dropped };
    var m = raw.match(/<\s*后台推演[^>]*>([\s\S]*?)(<\s*\/\s*后台推演\s*>|$)/i);
    if (!m) return { text: raw, dropped: dropped };
    var openTag = (raw.match(/<\s*后台推演[^>]*>/i) || ['<后台推演>'])[0];
    var out = [];
    var skipping = false;
    String(m[1]).split(/\n/).forEach(function (line) {
      var h = line.match(/^\s*\d+\s*[.、]\s*([^:：]+?)\s*[:：]\s*$/);
      if (h) {
        var who = h[1].trim();
        skipping = skipNames.indexOf(who) >= 0;
        if (skipping) { if (dropped.indexOf(who) < 0) dropped.push(who); return; }
        out.push(line);
        return;
      }
      if (skipping) return;
      out.push(line);
    });
    var body = out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (!dropped.length) return { text: raw, dropped: dropped };
    if (!body) return { text: '', dropped: dropped };   /* 全被拦光了：这份结果作废 */
    return { text: openTag + '\n' + body + '\n</后台推演>', dropped: dropped };
  }
  /* ★ v1.16：把一段 <后台推演> 拆成「每个人一段」，以及按名单顺序拼回去。
     截断补写、拦在场的人，都靠这两个。 */
  function splitSections(text) {
    var m = String(text || '').match(/<\s*后台推演[^>]*>([\s\S]*?)(<\s*\/\s*后台推演\s*>|$)/i);
    if (!m) return [];
    var out = [];
    var cur = null;
    String(m[1]).split(/\n/).forEach(function (line) {
      var h = line.match(/^\s*\d+\s*[.、]\s*([^:：]+?)\s*[:：]\s*$/);
      if (h) { cur = { name: h[1].trim(), lines: [] }; out.push(cur); return; }
      if (!cur) return;
      cur.lines.push(line);
    });
    return out;
  }
  function joinSections(sections, order) {
    var map = {};
    sections.forEach(function (s) { if (s && s.name && !map[s.name]) map[s.name] = s; });
    var names = (order && order.length ? order : Object.keys(map)).filter(function (n) { return map[n]; });
    var out = [];
    names.forEach(function (n, i) {
      out.push((i + 1) + '.' + n + ':');
      map[n].lines.forEach(function (l) { out.push(l); });
    });
    var body = out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    return '<后台推演>\n' + body + '\n</后台推演>';
  }
  /* ★ v1.16：只补写这几个人的小提示词（输出被截断时用） */
  function buildFillPrompt(missing) {
    if (!S.settings) loadSettings();
    var sd = arcFilterState(readState());
    var pres = presentList(sd);
    var bmap = S.settings.useBlurbs === false ? {} : blurbMap();
    var places = loadPlaces();
    var lines = [];
    lines.push('你上一次的输出被截断了，下面这几个人的那一段还没写完。');
    lines.push('**只补他们，别人一个字都不要写**，直接输出 <后台推演> 标签，里面只有这几个人：');
    lines.push('<后台推演>');
    missing.forEach(function (name, i) {
      lines.push((i + 1) + '.' + name + ':');
      lines.push('地点:');
      lines.push('正在做:');
      lines.push('具体正在做:');
      lines.push('心里话:');
    });
    lines.push('</后台推演>');
    lines.push('');
    lines.push('【他们现在的状态（照抄性格、好感度与恶堕值）】');
    missing.forEach(function (name) {
      var r = pres.rows[name] || {};
      lines.push('  · ' + name
        + '：性格 ' + trimDot(bmap[name])
        + '；地点 ' + (r.地点 || '未记录')
        + '；正在做 ' + (r.正在做 || '未记录')
        + '；好感度 ' + (r.好感度 == null ? '未记录' : r.好感度) + '；恶堕值 ' + (r.恶堕值 == null ? '未记录' : r.恶堕值)
        + (r.心理阶段 ? '；心理阶段 ' + r.心理阶段 : ''));
    });
    lines.push('');
    lines.push('- 地点只能从这些里一字不差地抄一个：' + (places.length ? places.join('、') : '见世界书「地点总表 夏越村」'));
    lines.push('- 一轮最多走一段（相邻两点约 10 分钟）。心里话 20~40 字，具体正在做 8~20 字。');
    /* ★ 只输出结果：不许写思考 / 推理 / 解释 / 自问自答 */
    lines.push('- **禁止输出任何思考、推理、分析、解释、自问自答、标题说明**。第一行就必须是 ［本回合移动检定］ 那一行，除此以外只输出模板里要求的那几行。多写的部分会被直接丢掉。');
    /* ★ 篇幅硬上限：别写成小说 */
    lines.push('- **极短**：每个角色最多 3 行（地点 / 正在做 / 具体正在做 / 心里话 这几项合起来不超过 3 行），输出尽量精炼但不受字数限制（乡村篇人物多时照实写全）。角色有几个就写几个，绝对不要多写别的人。');
    /* ★ 篇章隔离：别把另一条线的地点人物串进来 */
    lines.push('- **只写当前篇章里真实存在的地点与人物**：当前篇章是「公寓」时，不许出现任何乡村地点与乡村人物（没有小卖铺、没有春日家、没有乡村小路）；反之亦然。');
    lines.push('- **不许把这份提示词里的任何说明抄进输出**：像「标签，别的字不要写」「上一次毛病」「把下面这些人按顺序填完」「四栏都要写」「不少于 N 字」「需要输出」「自问自答」这些话，一个字都不许出现在你的答案里。你的输出里只允许有：［本回合移动检定］那一行，加上每个人的 姓名行 / 地点 / 正在做 / 具体正在做 / 心里话。');
    return arcFilterLines(lines).join('\n');
  }
  /* ★ v1.18：严格模式。模型开始念经（复述提示词 / 自问自答 / 没有标签）时用这份再要一次：
     又短又硬，只有模板 + 状态 + 地点表，不许写任何别的东西；禁止思考与解释。 */
  function buildStrictPrompt(note) {
    if (!S.settings) loadSettings();
    var sd = arcFilterState(readState());
    var pres = presentList(sd);
    var bmap = S.settings.useBlurbs === false ? {} : blurbMap();
    var places = loadPlaces();
    var todo = (S.lastTodo || []).slice();
    var lines = [];
    lines.push('你是填表机器，只输出一个 <后台推演> 标签，别的字一个都不要写。');
    if (note) lines.push('上一次的毛病：' + note);
    lines.push('把下面这些人按顺序填完，一个都不能少。四栏都要写，具体正在做不少于 8 字，心里话不少于 20 字。');
    lines.push('');
    lines.push('<后台推演>');
    todo.forEach(function (name, i) {
      lines.push((i + 1) + '.' + name + ':');
      lines.push('地点:');
      lines.push('正在做:');
      lines.push('具体正在做:');
      lines.push('心里话:');
    });
    lines.push('</后台推演>');
    lines.push('');
    lines.push('【他们现在的情况】');
    todo.forEach(function (name) {
      var r = pres.rows[name] || {};
      lines.push('· ' + name + '：性格 ' + trimDot(bmap[name]) + '；地点 ' + (r.地点 || '未记录')
        + '；正在做 ' + (r.正在做 || '未记录') + '；具体正在做 ' + (r.具体正在做 || '未记录')
        + '；好感度 ' + (r.好感度 == null ? '未记录' : r.好感度) + '；恶堕值 ' + (r.恶堕值 == null ? '未记录' : r.恶堕值) + (r.心理阶段 ? '；心理阶段 ' + r.心理阶段 : '')
        + '；心里话 ' + (r.心里话 || '未记录'));
    });
    lines.push('');
    if (isShrineArc()) {
      lines.push('【当前篇章：神社】{{user}} 是误闯这里并顺着鸟居走进这座神社的，进来之后才发现走不出去（沿着鸟居长廊往哪走都会回到前庭），他自己以为是在做梦。**这件事不许被解决，也不许被谁解释清楚**。三位都是巫女（神代凛音、月读澪、斋宫若叶），**没有丈夫、没有未婚夫、没有要瞒着的人**；本篇章不许出现任何乡村与公寓的地名人物，也不存在 NTR / 隐奸 / 苦主 / 被人撞见这类内容。三人都是**双线同态**：好感度与恶堕值表现一致，只看较高的那一档（< 30 初识、30-60 心动、≥ 60 恋人）。');
    } else if (isApartmentArc()) {
      /* ★ v165：这一段以前写死「本篇当前只有两位女主：神谷奈绪、桃崎千鹤」。
         v165 起公寓篇会补齐 5 位女主，写死的文案会直接和变量打架
         （AI 一边看到变量里有 5 个人，一边被要求「只有两位」）。
         现在改成从当前变量的名单里现算，名单变化自动跟上。 */
      var aptGirls = [];
      try {
        var sdA2 = arcFilterState(readState()) || {};
        aptGirls = Object.keys(sdA2.主要角色列表 || {});
      } catch (eApt) {}
      var aptLine;
      if (aptGirls.length) {
        aptLine = '**本篇当前的女主共 ' + aptGirls.length + ' 位：' + aptGirls.join('、') + '。**';
      } else {
        aptLine = '神谷奈绪（203）、桃崎千鹤（303）、白坂结奈（201）、水野千晴（305）、藤宫紫苑（407）。';
      }
      /* ★ 只认「五位女主」这张名单，苦主表不进正文：
         世界书《游戏模式》规定纯爱模式下苦主整体不存在，
         而苦主表里可能还留着上个存档的残留（v165 补人只在牛头模式补，但老存档不一定）。
         所以这里只报女主，苦主一律交给《苦主阶段》与变量自己说话。 */
      lines.push('【当前篇章：公寓】{{user}} 是租住在 301 的普通上班族（社畜），**不是管理员**；管理员是位女性，住户叫她「管理员小姐」。'
        + aptLine
        + ' 不得再写浅间茉由、松本美咲，也不要凭空造出别的住户。**本篇章不许出现任何乡村地点与乡村人物**（没有小卖铺、没有春日家、没有乡村小路、没有村民），也不许出现神社与巫女。'
        + '所有人都是**双线同态**：好感度与恶堕值表现一致，只看较高的那一档（< 30 初识、30-60 心动、≥ 60 恋人）。'
        + '**有没有苦主只看《游戏模式》**：纯爱模式下上面这些人全部单身，不许给谁安丈夫 / 男友。');
    } else {
      lines.push('【关系网】{{user}} 寄住在春日大平家，久美子是他的远房表姨；大平×久美子的女儿是静奈、葵；和也×椿芽的儿子是左寻；诚×百花（西村家）的儿子是太郎；宏×美穗的儿子是大田；香本家是小卖铺后面，千玲带弟弟悠。其他村民彼此都认识，不熟也不生。{{user}} 与女角色的关系先看她的好感度：不到 30 是客气（这时才看恶堕值：30-60 为难着照做、60-100 照做但躲你），30-60 她心甘情愿会自己找机会，60-100 她比你主动。');
    }
    lines.push('【地点只能从这些里一字不差地抄】' + (places.length ? places.join('、') : ''));
    lines.push('【正在做只能选一个】' + DOINGS.join(' / '));
    lines.push('【走动的规矩】一轮最多走一段（相邻两点约 10 分钟）；上一步在屋里的人，这一步要么还在屋里换房间，要么刚出门走到门口那段路（地点写路段名、正在做写「赶路」）。');
    lines.push('【名单】上面这些人就是全部要写的，多一个都不许加、少一个都不许漏。');
    lines.push('【开头】你的回答第一个字符必须是 <，直接开始写 <后台推演>。');
    return arcFilterLines(lines).join('\n');
  }
  /* ★ v1.20：关系网（优先读世界书「推演用 关系网」条目，读不到就用内置这份） */
  var RELATION_FALLBACK = ["##一、亲戚关系（先记这个，别写错）","- {{user}} 寄住在春日大平家。久美子是他的远房表姨（外婆妹妹的女儿），所以他管这一家叫「姨家」。","- 春日大平家：大平（户主，长途货车司机）与久美子是两口子；静奈是他们的大女儿（东京读大学，暑假回家）、葵是二女儿（高三）。久美子是这个家真正当家的那个。","- 山上左寻家：和也（木匠）与椿芽是两口子，儿子是左寻。和也常年在外做木工，家里就椿芽带左寻。","- 西村太郎家：诚（村公所职员）与百花是两口子，儿子是太郎。西村家在村里算大家族，房子最大。","- 吉川大田家：宏（镇上建材公司营业员）与美穗是两口子，儿子是大田。","- 香本家：住在小卖铺「三上商店」后面。千玲是长女，看店养家；悠是她弟弟，小学六年级。","- 旧事：{{user}} 小时候在美穗怀里吃过奶，还撞见过她洗澡，美穗没怪他。大田一直吃这个醋。","","##二、其他的人","- 除了上面这些亲戚与家人，村里剩下的人彼此都认识，关系是「不熟也不生」：见面点头、随口搭两句话，谈不上交情也谈不上有仇。","","##三、{{user}} 与女角色的关系，只看她的好感度与恶堕值","- 初识（好感度与恶堕值都 < 30）：就是普通同村的长辈 / 婶子 / 姐姐，客气、有分寸，把他当小辈看，不往别处想。","- 心动（30-60）：心里开始把他当异性看，会有点不自在，嘴上绝对不认；会主动找话、会留意他的反应，但还端着长辈的架子。","- 恋人（≥60）：已经承认自己动了心，私下会想他、会找机会单独待一会儿，在人前还要装得像没事；两个数再高就是彻底放下顾忌、在他面前不设防、甚至反过来主动。","- 写她们对 {{user}} 的态度时，一律以这三档为准：别停在上一档，也别跳过当前档。"].join('\n');
  /* ★ 公寓篇：大家互不认识，一面之缘（跟村里那套亲戚关系完全无关）
     v165：扩到 5 位女主，不再写「只有两位」。
     ★ 注意：这里**不写**苦主与女主的亲属关系 —— 世界书《人物总览》只定义了
     结奈的男友是智本大和，其余几位女住户的男伴关系**没有设定**，
     纯爱模式更是「一律单身、无配偶」。苦主一律由变量里的 `苦主列表` 说话，
     关系网这段不许自己编身份（编了会跟《游戏模式》打架）。 */
  var RELATION_FALLBACK_APARTMENT = ["## 公寓篇的人际关系（照这个写，别写成村里那一套）",
    "- {{user}} 是租住在 301 的普通上班族（社畜），每天早出晚归、经常加班，刚搬来没多久，**不是管理员**。",
    "- 公寓的管理员是一位四十来岁的女性（住户叫她「管理员小姐」），收租修东西都是她的事，不爱闲聊。",
    "- **本篇五位女主**：神谷奈绪（203）、桃崎千鹤（303）、白坂结奈（201）、水野千晴（305）、藤宫紫苑（407）。不得再写浅间茉由、松本美咲，也不要凭空造出别的住户。",
    "- 奈绪：住 203，一个人住，三无，面无表情、话极少，嘴里的「丈夫」是她演出来的，不是设定；她的接近方式是「认错人」。",
    "- 千鹤：住 303，{{user}} 的隔壁，温柔大姐姐，说话慢、尾音软，会主动搭话也会调侃两句。",
    "- 结奈：住 201，{{user}} 的亲姐姐，从小把他带大，说话直、爱逗他，警惕值低、恶堕值已经很高。",
    "- 千晴：住 305，温柔安静的持家型大姐姐，白天在家，声音轻、手很稳，习惯性多煮一份饭。",
    "- 紫苑：住 407，在家调香的调香师，寡言、眼睛厉害，看人像在试香。",
    "- 五位彼此只是邻居，来往不多；公寓篇没有亲戚、没有乡里乡亲。",
    "- **有没有男伴、有没有苦主，只看《游戏模式》与本局变量里的 `苦主列表`**：纯爱模式下所有人都单身；这段不替谁安排关系。",
    "- 写她们对 {{user}} 的态度，只看她自己的好感度与恶堕值（双线同态，取较高那一档）：< 30 客气有分寸，30-60 开始找机会靠近，≥ 60 主动且直白。"].join('\n');
  /* ★ v98：神社篇人际关系（封闭秘境，三人之间是同事/姐妹，对外来者好奇） */
  var RELATION_FALLBACK_SHRINE = ["## 神社篇的人际关系（照这个写，别写成村里或公寓那一套）","- {{user}} 是误闯这里并顺着鸟居一路走进来的外来者，**发现自己出不去了**，一开始以为自己在做梦。","- 三位巫女（神代凛音、月读澪、斋宫若叶）一起住在这座神社里，彼此熟得很，谁也说不上是谁的下属与上级。","- 三人都没有丈夫、没有未婚夫、没有要瞒着的人，也没人跟外界有来往。","- 她们对一个留在神社里的男人并不排斥，也不害怕，只是好奇；除了{{user}}，这个篇章里没有任何别的人会推门进来。","- 写她们对 {{user}} 的态度，只看她自己的好感度与恶堕值（双线同态，取较高那一档）：< 30 客气而疏远，30-60 开始找理由靠近，≥ 60 不再掩饰。"].join('\n');

  /* ★ v98：神社篇三人的精简性格（双线同态，纯爱向） */
  var BLURB_FALLBACK_SHRINE = [
    '神代凛音：三无 + 大姐姐。面无表情、语调平得像念账，开口就是结论；什么事都替你安排好，不说软话。',
    '月读澪：30 岁，三无 + 妈妈类型。一样面无表情，但照顾人是妈妈式的：添饭、掖被、收衣服，做完脸上什么也没有。',
    '斋宫若叶：温柔母性，说话慢，先照顾别人的感受。习惯体贴照顾来客，后来只照顾你一个。'
  ];

  /* 当前是不是公寓篇（自由文本，含「公寓」即公寓） */
  function isApartmentArc() {
    try {
      /* ★ 判定顺序（以前放宽成“名单里有公寓三人就算公寓”，结果乡村篇变量里
         还留着那三个人时被误判成公寓，乡村关系网被过滤掉、换成了公寓那份）：
         ① 变量写明「公寓」→ 公寓；写明别的（夏越村等）→ 乡村，直接定案；
         ② 变量为空时才用地点兜底；
         ③ 地点也读不到，才看名单，而且要求“只有公寓那三位、一个乡村人都没有”。 */
      var arc = '';
      /* ★ v98b：先走 readState()（读 MVU 实例的那条通的路），再退到 getvar / stat_data。
         以前只读后面那两条，在酒馆里读不到，完全靠地点兜底碰。 */
      try {
        var sdA = readState() || {};
        if (sdA.全局 && sdA.全局.当前篇章) arc = String(sdA.全局.当前篇章);
      } catch (e0) {}
      try {
        if (!arc && typeof getvar === 'function') { arc = getvar('全局.当前篇章') || getvar('stat_data.全局.当前篇章') || ''; }
        if (!arc) {
          var rt = (typeof stat_data !== 'undefined' && stat_data) ? stat_data : ((typeof v !== 'undefined' && v) ? (v.stat_data || v) : null);
          if (rt && rt.全局) arc = rt.全局.当前篇章 || '';
        }
      } catch (eA) {}
      arc = String(arc || '').trim();
      if (arc) return arc.indexOf('公寓') !== -1;      /* ① 变量说了算 */

      var loc = '';
      try {
        if (typeof getvar === 'function') loc = String(getvar('主角信息.地点') || getvar('stat_data.主角信息.地点') || '');
        if (!loc) {
          var rt2 = (typeof stat_data !== 'undefined' && stat_data) ? stat_data : ((typeof v !== 'undefined' && v) ? (v.stat_data || v) : null);
          if (rt2 && rt2.主角信息) loc = String(rt2.主角信息.地点 || '');
        }
      } catch (eL) {}
      loc = String(loc || '');
      if (/公寓|301室|便利店|号门|走廊/.test(loc)) return true;     /* ② 地点兜底 */
      if (/乡村|宅邸|小卖铺|林间|村口|大坝|伐木场|前院/.test(loc)) return false;

      /* ③ 只剩名单可用。
         ★ v165：以前要求「有公寓人、且一个乡村人都没有」。
         v165 起「进到哪个篇章就补齐那一篇的所有人」，名单里三篇的人会同时在，
         这个「没有乡村人」的前提永远不成立 → 兜底整条失效（公寓篇可能被判成乡村）。

         现在两级判断：
         ③-a 先看「谁在场」—— 在场的人就是玩家眼前的人，篇章必属他们那一边。
              这一条最准，也最不受「补人把名单撑大」的影响。
         ③-b 在场的人一个都没有时（玩家独自在走廊 / 空房间），才退到比名单人数。
              注意：这里**不能**单纯比总人数 —— 夏越村 19 人永远压过公寓 11 人，
              那样一旦两篇都补齐过，公寓就再也判不出来了。所以比的是「上限占比」
              没意义，直接按「公寓人是否自成多数」退化为旧行为，仅作最后兜底。 */
      try {
        var roster = (readState() || {}).主要角色列表 || {};
        var keys = Object.keys(roster)   /* ★ 绝不能在这里再调 arcFilterState：它内部会回调 isApartmentArc，会无限递归把页面卡死 */;
        var cntApt = 0, cntVil = 0, cntShr = 0;
        var hereApt = 0, hereVil = 0, hereShr = 0;
        for (var ki = 0; ki < keys.length; ki++) {
          var nmK = keys[ki];
          var isHere = false;
          try { isHere = !!(roster[nmK] && roster[nmK].在场状态 === true); } catch (eH) {}
          if (ARC_PEOPLE['公寓'].indexOf(nmK) >= 0) { cntApt++; if (isHere) hereApt++; }
          else if (ARC_PEOPLE['夏越村'].indexOf(nmK) >= 0) { cntVil++; if (isHere) hereVil++; }
          else if (ARC_PEOPLE['神社'].indexOf(nmK) >= 0) { cntShr++; if (isHere) hereShr++; }
        }
        /* ③-a：在场的人说了算 */
        if (hereApt || hereVil || hereShr) {
          return (hereApt > 0 && hereApt >= hereVil && hereApt >= hereShr);
        }
        /* ③-b：一个人都不在场，退到名单比例（旧行为） */
        if (cntApt > 0 && cntApt >= cntVil && cntApt >= cntShr) return true;
      } catch (eK) {}
      return false;
    } catch (e) { return false; }
  }

  /* ★ v98：当前篇章归一值（'夏越村' / '公寓' / '神社'）。
     以前只有「是不是公寓」二值判定，多了神社篇之后就分不开了。 */
  function currentArcOf() {
    var arc = '';
    /* ★ v98b：【重要】先走 readState() —— 它读的是 MVU 实例（mvu.getMvuData），这条路在酒馆里是通的。
       以前这里只读 getvar / stat_data，而那两个在酒馆脚本环境里读不到，
       于是无论哪个篇章都被判成「夏越村」——
       神社篇因此拿到整套乡村提示词（关系网 / 速查 / 地图 / 地点表），名单还被清空。 */
    try {
      var sd0 = readState() || {};
      if (sd0.全局 && sd0.全局.当前篇章) arc = String(sd0.全局.当前篇章);
    } catch (e0) {}
    /* 退路：getvar / stat_data */
    try {
      if (!arc && typeof getvar === 'function') { arc = getvar('全局.当前篇章') || getvar('stat_data.全局.当前篇章') || ''; }
      if (!arc) {
        var rt = (typeof stat_data !== 'undefined' && stat_data) ? stat_data : ((typeof v !== 'undefined' && v) ? (v.stat_data || v) : null);
        if (rt && rt.全局) arc = rt.全局.当前篇章 || '';
      }
    } catch (eA) {}
    arc = String(arc || '').trim();
    if (arc.indexOf('神社') !== -1 || arc.indexOf('鸟居') !== -1) return '神社';
    if (arc.indexOf('公寓') !== -1) return '公寓';
    if (arc) return '夏越村';
    /* 变量里真的没有篇章时，才用 {{user}} 当前地点兜底（同样走 readState） */
    var loc = '';
    try {
      var sd1 = readState() || {};
      if (sd1.主角信息 && sd1.主角信息.地点) loc = String(sd1.主角信息.地点);
    } catch (e1) {}
    if (!loc) {
      try {
        if (typeof getvar === 'function') loc = String(getvar('主角信息.地点') || getvar('stat_data.主角信息.地点') || '');
        if (!loc) {
          var rt2 = (typeof stat_data !== 'undefined' && stat_data) ? stat_data : ((typeof v !== 'undefined' && v) ? (v.stat_data || v) : null);
          if (rt2 && rt2.主角信息) loc = String(rt2.主角信息.地点 || '');
        }
      } catch (eL) {}
    }
    loc = String(loc || '');
    if (/鸟居|神龛|神社|巫女|佛堂|檐廊|大院/.test(loc)) return '神社';
    if (/公寓|301室|便利店|号门/.test(loc)) return '公寓';
    return '夏越村';
  }
  function isShrineArc() { return currentArcOf() === '神社'; }

  /* ★ 按篇章筛人：变量里可能还留着另一条线的人（换线没清干净），
     推演时一律只认当前篇章的人，别的名字一个都不要。 */
  /* ★ v165：这份名单必须和核心脚本的 TH_ARC_ROSTER_SEED 对齐。
     以前公寓只写了两位（奈绪 / 千鹤），神社篇之后又补了结奈 / 千晴 / 紫苑，
     v165 的核心开始「进到哪个篇章就补齐那一篇的所有人」，
     这里若还只认两位，补进来的人会被 arcFilterState 当成外篇人物剔出去 —— 推演里就永远看不到她们。
     现在：公寓 5 位女主 + 6 位苦主、夏越村 9 + 10、神社 3 + 0。
     改名单时两边要一起改（_v165_test_deduce_sync.js 会查）。 */
  var ARC_PEOPLE = {
    '公寓': ['神谷奈绪', '桃崎千鹤', '白坂结奈', '水野千晴', '藤宫紫苑',
             '神谷健太', '早川慎二', '白石恭介', '智本大和', '冈坂日川', '冈坂太郎'],
    '神社': ['神代凛音', '月读澪', '斋宫若叶', '白蔵主', '御神木之灵'],
    '夏越村': ['吉川美穗', '吉川大田', '吉川宏', '西村百花', '西村诚', '西村太郎', '山上椿芽', '山上和也', '山上左寻', '香本千玲', '香本悠', '春日久美子', '春日大平', '春日静奈', '春日葵', '白坂结奈', '智本大和']
  };
  function inArcName(n) {
    var name = String(n || '').trim();
    if (!name) return false;
    var cur = currentArcOf();
    if ((ARC_PEOPLE[cur] || []).indexOf(name) >= 0) return true;
    /* 在别的篇章名单里的，一律不算本篇章的人 */
    var arcs = Object.keys(ARC_PEOPLE);
    for (var i = 0; i < arcs.length; i++) {
      if (arcs[i] === cur) continue;
      if ((ARC_PEOPLE[arcs[i]] || []).indexOf(name) >= 0) return false;
    }
    return true;      /* 不在任何名单里的（例如管理员小姐）两边都保留 */
  }
  /* 把变量状态里不属于本篇章的人剔掉，后续名单 / 状态 / 速查全部跟着干净 */
  function arcFilterState(sd) {
    try {
      if (!sd || typeof sd !== 'object') return sd;
      /* ★ v98b：【致命修复】以前是 `var out = sd` —— 同一个引用！
         下面的 delete 会把【真的变量】直接删掉：篇章一旦判错（比如神社篇被判成夏越村），
         神代凛音 / 月读澪 / 斋宫若叶 就会被从存档里真删。
         现在只在深拷贝上过滤，原变量一根毫毛都不动。 */
      var out = null;
      try { out = JSON.parse(JSON.stringify(sd)); } catch (eC) { out = sd; }
      ['主要角色列表', '苦主列表'].forEach(function (tb) {
        if (!out[tb] || typeof out[tb] !== 'object') return;
        Object.keys(out[tb]).forEach(function (n) { if (!inArcName(n)) { try { delete out[tb][n]; } catch (e) {} } });
      });
      return out;
    } catch (e) { return sd; }
  }

  var RELATION_CACHE = null;
  function relationText() {
    if (RELATION_CACHE) return RELATION_CACHE;
    var got = '';
    var arcApart = isApartmentArc();
    try {
      var bookName = null;
      try {
        if (typeof getCharWorldbookNames === 'function') {
          var bn = getCharWorldbookNames('current');
          if (bn && bn.primary) bookName = bn.primary;
          else if (Array.isArray(bn) && bn.length) bookName = bn[0];
        }
      } catch (e) {}
      var entries = null;
      if (typeof getWorldbook === 'function') { try { entries = bookName ? getWorldbook(bookName) : getWorldbook(); } catch (e2) {} }
      if (Array.isArray(entries)) {
        var hitApart = '', hitVillage = '', hitShrine = '';
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i] || {};
          var nm = String(e.comment || e.name || '');
          if (nm.indexOf('关系网') < 0) continue;
          var body = String(e.content || '').trim();
          if (!body) continue;
          if (nm.indexOf('神社') !== -1) { if (!hitShrine) hitShrine = body; }
          else if (nm.indexOf('公寓') !== -1) { if (!hitApart) hitApart = body; }
          else if (!hitVillage) hitVillage = body;
        }
        var curRel = currentArcOf();
        got = (curRel === '神社') ? hitShrine : (curRel === '公寓' ? hitApart : hitVillage);
      }
    } catch (e3) {}
    {
      var curRel2 = currentArcOf();
      RELATION_CACHE = got || (curRel2 === '神社' ? RELATION_FALLBACK_SHRINE
                                 : (curRel2 === '公寓' ? RELATION_FALLBACK_APARTMENT : RELATION_FALLBACK));
    }
    return RELATION_CACHE;
  }
  /* ★ v1.18：所有人的精简性格（优先读世界书「推演用 人物速查」条目，读不到就用内置这份） */
  var BLURB_FALLBACK = [
    '西村百花：高冷，话少，规矩重，被撩到会恼羞，绝不会软下来求人。',
    '山上椿芽：温柔平然，会照顾人，什么难处都自己扛，情绪稳。',
    '春日久美子：害羞温柔，春日家的当家人，嗓门不高但话算数，管着一家老小。',
    '春日葵：平然狂野，短跑出身，大大咧咧，嘴上不饶人。',
    '春日静奈：温柔平然，安静，看书多，话说一句算一句。',
    '吉川美穗：妩媚诱人，笑起来眼尾弯，爱逗人，心里有数。',
    '香本千玲：三上商店看店的，冷静精算，讲道理，不慌。',
    '西村太郎：男孩，贪睡，贪玩，怕他娘。',
    '西村诚：跑运输的，爱面子，爱开玩笑，私底下小算盘多。',
    '山上左寻：男孩，皮，满村跑，天黑才回家。',
    '山上和也：伐木场的，老好人，怕事，遇事躲。',
    '吉川大田：男孩，爱玩游戏，怕热，蔫坏。',
    '吉川宏：伐木场的，力气大，酒量大，脾气来得快去得也快。',
    '春日大平：老实木讷的长途司机，话少，闷，什么都往肚子里咽。',
    '香本悠：男孩，小卖铺柜台后面写作业，黏姐姐。',
  ];
  /* 公寓篇的备用精简性格（纯爱线，三位住户都是单身；以世界书「推演用 人物速查（公寓篇）」为准） */
  var BLURB_FALLBACK_APARTMENT = [
    '神谷奈绪：三无，面无表情话少，会装认错人，一个人住在203。',
    '桃崎千鹤：温柔大姐姐，住 303，{{user}} 的隔壁，说话慢尾音软，会主动搭话也会调侃两句。',
  ];
  var BLURB_CACHE = null;
  /* 内联进一行时，把性格结尾的句号去掉，免得出现「…求人。；地点」 */
  function trimDot(s) {
    var t = String(s == null || s === '' ? '未记录' : s).trim();
    return t.replace(/[。．.；;、，,]+$/, '');
  }
  function blurbMap() {
    var map = {};
    charBlurbs().forEach(function (b) {
      var m = String(b).match(/^([^：:]{2,6})[：:]\s*([\s\S]*)$/);
      if (m) map[m[1].trim()] = m[2].trim();
    });
    return map;
  }
  function charBlurbs() {
    if (BLURB_CACHE) return BLURB_CACHE;
    var list = [];
    try {
      var bookName = null;
      try {
        if (typeof getCharWorldbookNames === 'function') {
          var bn = getCharWorldbookNames('current');
          if (bn && bn.primary) bookName = bn.primary;
          else if (Array.isArray(bn) && bn.length) bookName = bn[0];
        }
      } catch (e) {}
      var entries = null;
      if (typeof getWorldbook === 'function') { try { entries = bookName ? getWorldbook(bookName) : getWorldbook(); } catch (e2) {} }
      if (Array.isArray(entries)) {
        var wantShrine = (currentArcOf() === '神社');
        var wantApart = isApartmentArc();
        var picked = null;
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i] || {};
          var name = String(e.comment || e.name || '');
          if (name.indexOf('人物速查') < 0) continue;
          var isShrine = name.indexOf('神社') !== -1;
          var isApart = (!isShrine) && name.indexOf('公寓') !== -1;
          /* ★ v98：篇章对得上的那条优先，不能几条混着用 */
          if (isShrine === wantShrine && isApart === wantApart) { picked = e; break; }
          if (!picked) picked = e;
        }
        if (picked) {
          String(picked.content || '').split(/\n+/).forEach(function (line) {
            var t = String(line || '').replace(/^[-*·•\s]+/, '').trim();
            if (!t) return;
            if (t.charAt(0) === '#') return;                      /* 说明行不算 */
            if (!/^[\u4e00-\u9fa5]{2,5}[：:]/.test(t)) return;    /* 只收「姓名：性格」这种行 */
            list.push(t);
          });
        }
      }
    } catch (e3) {}
    BLURB_CACHE = list.length ? list
      : (currentArcOf() === '神社' ? BLURB_FALLBACK_SHRINE
         : (isApartmentArc() ? BLURB_FALLBACK_APARTMENT : BLURB_FALLBACK));
    return BLURB_CACHE;
  }
  /* 从模型输出里抽 <约定>…</约定>（也认「约定：」这种一行一行写的） */
  function splitPacts(text) {
    var raw = String(text || '');
    var block = raw.match(/<\s*约定[^>]*>([\s\S]*?)<\s*\/\s*约定\s*>/i);
    var inner = block ? block[1] : '';
    if (!block) {
      var loose = raw.match(/(?:^|\n)\s*(?:【?约定】?|约定记忆)\s*[:：]\s*([\s\S]*)$/);
      if (loose) inner = loose[1];
    }
    var clean = raw.replace(/<\s*约定[^>]*>[\s\S]*?(<\s*\/\s*约定\s*>|$)/gi, '');
    clean = clean.replace(/(?:^|\n)\s*(?:【?约定】?|约定记忆)\s*[:：][\s\S]*$/i, '');
    var list = [];
    String(inner).split(/\n+/).forEach(function (line) {
      var t = String(line || '').replace(/^[-*·•\d.、)\s]+/, '').trim();
      if (!t) return;
      if (/^(无|暂无|没有|none|无约定)/i.test(t)) return;
      if (list.indexOf(t) < 0) list.push(t);
    });
    return { text: clean.trim(), pacts: list, hadBlock: !!block || !!inner };
  }

  /* ────────────── 地点总表（从世界书里现读，不写死） ────────────── */
  /* ★ v1.18：读不到世界书时用这份内置的 56 个固值兜底（跟变量结构的枚举一模一样）。 */
  var PLACE_FALLBACK = [
    "开场白",
    "春日大平家·客厅",
    "春日大平家·厨房",
    "春日大平家·浴室",
    "春日大平家·主卧",
    "春日大平家·次卧1",
    "春日大平家·次卧2",
    "春日大平家·次卧3",
    "春日大平家·前院",
    "山上左寻家·客厅",
    "山上左寻家·厨房",
    "山上左寻家·浴室",
    "山上左寻家·主卧",
    "山上左寻家·次卧1",
    "山上左寻家·次卧2",
    "山上左寻家·次卧3",
    "山上左寻家·前院",
    "西村太郎家·客厅",
    "西村太郎家·厨房",
    "西村太郎家·浴室",
    "西村太郎家·主卧",
    "西村太郎家·次卧1",
    "西村太郎家·次卧2",
    "西村太郎家·次卧3",
    "西村太郎家·前院",
    "吉川大田家·客厅",
    "吉川大田家·厨房",
    "吉川大田家·浴室",
    "吉川大田家·主卧",
    "吉川大田家·次卧1",
    "吉川大田家·次卧2",
    "吉川大田家·次卧3",
    "吉川大田家·前院",
    "乡村小路",
    "小卖铺前",
    "小卖铺里",
    "林间小路",
    "林间庙宇前",
    "林间庙宇里",
    "乡村公园里",
    "林间小溪",
    "废弃大坝",
    "伐木场",
    "村口大门",
    "乡村小路-春日大平家通往山上左寻家",
    "乡村小路-山上左寻家通往吉川大田家",
    "乡村小路-吉川大田家通往西村太郎家",
    "乡村小路-通往小卖铺前",
    "乡村小路-通往乡村公园",
    "乡村小路-西村太郎家通往村口大门",
    "乡村小路-村口大门通往小卖铺前",
    "乡村小路-通往林间小路",
    "乡村小路-乡村公园通往伐木场",
    "乡村小路-山上左寻家通往伐木场",
    "林间小路通往林间小溪",
    "林间小溪通往废弃大坝",
  ];
  var PLACE_SOURCE = '';
  var PLACE_CACHE = null;
  /* 从一堆世界书条目里挑「地点总表」，把里面的地名抠出来 */
  function placesFromEntries(entries) {
    var list = [];
    if (!Array.isArray(entries)) return list;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      var name = String(e.comment || e.name || '');
      if (name.indexOf('地点总表') < 0) continue;
      String(e.content || '').split('\n').forEach(function (line) {
        var mm = /^-\s*(.+?)\s*$/.exec(line);
        if (!mm) return;
        var val = mm[1].trim();
        if (!val) return;
        if (/[：:。，,、；;（）()「」]/.test(val)) return;
        if (val.length > 18) return;
        if (list.indexOf(val) < 0) list.push(val);
      });
      if (list.length) return list;
    }
    return list;
  }
  /* ★ v1.18：角色卡内嵌的世界书也读一下（很多卡是把条目放在卡里的） */
  function placesFromCard() {
    var list = [];
    try {
      var ctx = getContext();
      var chid = ctx && (ctx.this_chid != null ? ctx.this_chid : ctx.characterId);
      var chars = ctx && ctx.characters;
      var card = chars && chid != null ? chars[chid] : null;
      var book = card && card.data && card.data.character_book;
      list = placesFromEntries(book && book.entries);
      if (list.length) { PLACE_SOURCE = '角色卡内嵌世界书'; return list; }
    } catch (e) {}
    try {
      var s = st();
      var chid2 = s && (s.this_chid != null ? s.this_chid : s.characterId);
      var chars2 = s && s.characters;
      var card2 = chars2 && chid2 != null ? chars2[chid2] : null;
      list = placesFromEntries(card2 && card2.data && card2.data.character_book && card2.data.character_book.entries);
      if (list.length) PLACE_SOURCE = '角色卡内嵌世界书';
    } catch (e2) {}
    return list;
  }
  /* ★ 推演用的“按篇章规则块”：优先读世界书条目「推演用 规则块（按篇章）」（条目里用 EJS 按篇章分流），
   读不到就返回空数组，调用处会退回原来写死的几条。
   ★ v98：神社篇改读它自己的那份「推演用 规则块（神社篇）」，两篇互不干扰。 */
  function ruleBlockText() {
    try {
      var wantName = (currentArcOf() === '神社') ? '推演用 规则块（神社篇）' : '推演用 规则块（按篇章）';
      var books = [];
      try {
        if (typeof getCharWorldbookNames === 'function') {
          var nms = getCharWorldbookNames('current');
          if (nms) { if (nms.primary) books.push(nms.primary); if (nms.additional) books = books.concat(nms.additional); }
        }
        if (typeof getChatWorldbookName === 'function') { var cw = getChatWorldbookName('current'); if (cw) books.push(cw); }
      } catch (eW0) {}
      var pools = [];
      try { if (typeof getWorldbook === 'function') { pools.push(getWorldbook()); } } catch (eW1) {}
      for (var bi = 0; bi < books.length; bi++) { try { pools.push(getWorldbook(books[bi])); } catch (eW2) {} }
      for (var pi = 0; pi < pools.length; pi++) {
        var list = pools[pi];
        if (!list || !list.length) continue;
        for (var li = 0; li < list.length; li++) {
          var nm = String((list[li] && (list[li].name || list[li].comment)) || '');
          if (nm.indexOf(wantName) === -1) continue;
          var body = String((list[li] && list[li].content) || '')
            .replace(/<[^>]*>/g, '')
            .replace(/<%/g, '').replace(/%>/g, '');
          var out = body.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return /^-\s/.test(s); });
          if (out.length) return out;
        }
      }
    } catch (eR) {}
    return [];
  }

  function loadPlaces() {
    /* ★ 按篇章取地点表：公寓篇读「地点总表 公寓篇」，乡村篇读「地点总表 夏越村」。
       以前不看篇章，公寓篇也从乡村表里抄地名 → 会冒出小卖铺、春日家这种不该出现的地名。 */
    try {
      var cur = currentArcOf();
      var wantName = (cur === '神社') ? '神社篇' : (cur === '公寓' ? '公寓篇' : '夏越村');
      var books = [];
      try {
        if (typeof getCharWorldbookNames === 'function') {
          var nms = getCharWorldbookNames('current');
          if (nms) { if (nms.primary) books.push(nms.primary); if (nms.additional) books = books.concat(nms.additional); }
        }
        if (typeof getChatWorldbookName === 'function') { var cw = getChatWorldbookName('current'); if (cw) books.push(cw); }
      } catch (eW1) {}
      var pools = [];
      try { if (typeof getWorldbook === 'function') { pools.push(getWorldbook()); } } catch (eW2) {}
      for (var bi = 0; bi < books.length; bi++) { try { pools.push(getWorldbook(books[bi])); } catch (eW3) {} }
      for (var pi = 0; pi < pools.length; pi++) {
        var list = pools[pi];
        if (!list || !list.length) continue;
        for (var li = 0; li < list.length; li++) {
          var nm = String((list[li] && (list[li].name || list[li].comment)) || '');
          if (nm.indexOf('地点总表') === -1) continue;
          if (nm.indexOf(wantName) === -1) continue;              /* 只要当前篇章那一张 */
          var content = String((list[li] && list[li].content) || '');
          var out = content.split(/\r?\n/).map(function (s) { return s.trim(); })
            .filter(function (s) { return /^-\s/.test(s); })
            .map(function (s) { return s.replace(/^-\s*/, '').replace(/（[^）]*）/g, '').replace(/[*`]/g, '').trim(); })
            .filter(Boolean);
          if (out.length) { PLACE_SOURCE = '世界书「' + nm + '」（' + out.length + ' 个）'; return out; }
        }
      }
    } catch (eAP) {}
    if (PLACE_CACHE) return PLACE_CACHE;
    var list = [];
    try {
      var bookName = null;
      try {
        if (typeof getCharWorldbookNames === 'function') {
          var bn = getCharWorldbookNames('current');
          if (bn && bn.primary) bookName = bn.primary;
          else if (Array.isArray(bn) && bn.length) bookName = bn[0];
          else if (bn && bn.additional && bn.additional.length) bookName = bn.additional[0];
        }
      } catch (e) {}
      var entries = null;
      if (typeof getWorldbook === 'function') {
        try { entries = bookName ? getWorldbook(bookName) : getWorldbook(); } catch (e2) {}
      }
      if (Array.isArray(entries)) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i] || {};
          var name = e.comment || e.name || '';
          if (String(name).indexOf('地点总表') < 0) continue;
          var lines = String(e.content || '').split('\n');
          for (var j = 0; j < lines.length; j++) {
            var mm = /^-\s*(.+?)\s*$/.exec(lines[j]);
            if (!mm) continue;
            var val = mm[1].trim();
            /* ★ v1.13：只收真正的地名。地点总表里还有「主干一路向西：…」这种说明行，
               它们带冒号/逗号/句号/顿号，一律不要。 */
            if (!val) continue;
            if (/[：:。，,、；;（）()「」]/.test(val)) continue;
            if (val.length > 18) continue;
            if (list.indexOf(val) < 0) list.push(val);
          }
          break;
        }
      }
    } catch (e3) {}
    /* ★ v1.18：世界书读不到就换两条路，最后用内置那份，保证「地点」这一栏永远有名单可抄 */
    if (!list.length) list = placesFromCard();
    if (!list.length) { list = PLACE_FALLBACK.slice(); PLACE_SOURCE = '脚本内置（世界书没读到）'; }
    if (!PLACE_SOURCE) PLACE_SOURCE = '世界书「地点总表」';
    PLACE_CACHE = list;
    return list;
  }

  /* ────────────── 提示词 ────────────── */
  /* ★ v1.6：把村里的路做成一张「路径链」，让 AI 一段一段走，不许瞬移。
     每一条的写法就是路段名本身（两端）+ 屋子里那 8 个点。 */
  var ROUTE_EDGES = [
    ['春日大平家', '山上左寻家', '乡村小路-春日大平家通往山上左寻家'],
    ['山上左寻家', '吉川大田家', '乡村小路-山上左寻家通往吉川大田家'],
    ['吉川大田家', '西村太郎家', '乡村小路-吉川大田家通往西村太郎家'],
    ['乡村小路', '小卖铺前', '乡村小路-通往小卖铺前'],
    ['乡村小路', '乡村公园里', '乡村小路-通往乡村公园'],
    ['西村太郎家', '村口大门', '乡村小路-西村太郎家通往村口大门'],
    ['村口大门', '小卖铺前', '乡村小路-村口大门通往小卖铺前'],
    ['乡村小路', '林间小路', '乡村小路-通往林间小路'],
    ['乡村公园里', '伐木场', '乡村小路-乡村公园通往伐木场'],
    ['山上左寻家', '伐木场', '乡村小路-山上左寻家通往伐木场'],
    ['林间小路', '林间小溪', '林间小路通往林间小溪'],
    ['林间小溪', '废弃大坝', '林间小溪通往废弃大坝'],
  ];
  var HOME_ROOMS = ['客厅', '厨房', '浴室', '主卧', '次卧1', '次卧2', '次卧3', '前院'];

  /* ★ v98：地图文案按篇章分支。以前这个函数写死了乡村（“村里就这些地方”、
     “每家都有客厅 / 厨房”、“跨到隔壁一家是 1 段”），神社篇会原样拿到乡村地图；
     而出口过滤的词表里没有“村里”这两个字，漏过去了。 */
  function mapText() {
    var out = [];
    var cur = currentArcOf();
    if (cur === '神社') {
      out.push('神社就这些地方，是连成一片的院落：');
      out.push('  鸟居长廊 ⇄ 神龛佛堂外（大院）');
      out.push('  神龛佛堂外 ⇄ 神龛佛堂里 / 神社客房 / 神社温泉 / 神社主卧外 / 神社小铺外');
      out.push('  神社主卧外 ⇄ 神社主卧 / 神社客房');
      out.push('  神社小铺外 ⇄ 神社小铺里');
      out.push('屋里：神社是一体化的，**没有厨房、没有客厅**；主卧是三位巫女合住的那一间，客房只有一间。');
      out.push('距离感：相邻两点 = 一段（大约 10 分钟）。从大院走到任何一间都是一段；沿着鸟居长廊一直走会绕回大院——这是结界，不是错。');
      return out.join('\n');
    }
    if (cur === '公寓') {
      out.push('公寓就这些地方，是这么连的：');
      out.push('  公寓楼下 ⇄ 公寓2楼走廊 / 便利店前 / 公寓对面公园');
      out.push('  公寓2楼走廊 ⇄ 公寓3楼走廊 / 公寓2楼走廊-201号门 / 公寓2楼走廊-203号门');
      out.push('  公寓3楼走廊 ⇄ 公寓4楼走廊 / 301室-门口 / 公寓3楼走廊-303号房 / 公寓3楼走廊-305号房');
      out.push('  301室-门口 ⇄ 301室-客厅（客厅通厨房 / 主卧 / 次卧1 / 浴室 / 杂物间 / 阳台）');
      out.push('距离感：相邻两点 = 一段（大约 10 分钟）。上下楼算一段；从楼下走到四楼要三一段。');
      return out.join('\n');
    }
    out.push('村里就这些地方，路是这么连的（括号里是那条路的路段名，走在路上时地点就写它）：');
    ROUTE_EDGES.forEach(function (e) { out.push('  ' + e[0] + ' ⇄ ' + e[1] + '（走这条路：' + e[2] + '）'); });
    out.push('屋里：每家都有 客厅 / 厨房 / 浴室 / 主卧 / 次卧1 / 次卧2 / 次卧3 / 前院 这 8 个点，在屋里换房间算小范围走动。');
    out.push('距离感：相邻两点 = 一段（大约 10 分钟）。屋里换房间不用算段数；跨到隔壁一家是 1 段；从最东头走到村口要三四段。');
    return out.join('\n');
  }

  var DOINGS = ['洗澡', '换衣服', '上厕所', '下厨', '娱乐', '与user互动', '与苦主互动', '做家务', '睡觉', '外出采购', '出村办事', '赶路', '上工'];

  function buildPrompt() {
    if (!S.settings) loadSettings();
    var sd = arcFilterState(readState());
    var t = sd.时间 || {};
    var hero = sd.主角信息 || {};
    var pres = presentList(sd);
    var lastDed = lastDeductionFromChat();
    var mem = S.memory || loadMemory();
    var places = loadPlaces();
    var blurbs = S.settings.useBlurbs === false ? [] : charBlurbs();
    var bmap = S.settings.useBlurbs === false ? {} : blurbMap();

    /* ★ v1.22：谁不推演？变量里 在场状态=true 的人（他们此刻就在 {{user}} 眼前）。
       <在场人物> 标签已经全面取消，不再读它。 */
    /* ★ v1.22：取消 <在场人物> 标签，名单回到看变量里的 在场状态：
       true 的人不推演、不输出；false / 没记录的人一律推演输出。
       ★ v1.24：但「在场」的定义是「和 {{user}} 待在同一个地方」，
       所以变量里写着 true、地点却明显在别处的人，判定为他其实已经走了（变量没改回来），
       这种人照样进推演名单，别让他卡在上一场。 */
    var heroLoc = String((hero.地点) || '').trim();
    var skipNames = [];
    var todoNames = [];
    var stalePresent = [];   /* 写着在场、其实已经走了的人 */
    Object.keys(pres.rows).forEach(function (n) {
      var r = pres.rows[n] || {};
      var loc = String(r.地点 || '').trim();
      if (pres.on.indexOf(n) >= 0 && loc && heroLoc && !sameScene(loc, heroLoc)) {
        stalePresent.push(n);
        todoNames.push(n);
        return;
      }
      if (pres.on.indexOf(n) >= 0) skipNames.push(n);
      else todoNames.push(n);
    });

    S.lastSkip = skipNames.slice();   /* ★ v1.9：留给 dropSkipped 用 */
    S.lastTodo = todoNames.slice();   /* ★ v1.16：截断补写时要照这份名单拼回去 */

    var lines = [];
    /* ① 身份 */
    lines.push('你是一个专门负责后台推演 NPC 行为的专职 AI。');
    lines.push('你不写正文，你只负责让场外 NPC 的行为活起来，而不是让游戏用死板的概率和函数去搬他们。');
    lines.push('');
    /* ② 五步指导（放在身份下面） */
    lines.push('【按这五步做，一步一步来】');
    lines.push('step1 读取：读《上一轮的 <后台推演>》确定每个人此刻在做什么；读《重要记忆》看有没有约定、承诺、关系变化；读《脚本扫好的名单》知道这一轮该写谁。');
    lines.push('step2 照着名单来：该写谁、不该写谁，脚本已经看变量算好了（见《脚本扫好的名单》），你不需要自己判断谁在场。名单外的人一个字都不要输出。');
    lines.push('step3 推演动向：对名单上每个人简短但有逻辑地推演他/她接下来会干什么、去哪里、在想什么。依据是时间（早/午/傍晚/夜）、身份与作息、上一轮的正在做、以及各人的性格与心理状态。');
    lines.push('     移动务必按《地图与走法》：这一步最多一段。上一轮在家里的人，这一步要么还在家（换房间可以），要么刚出门走到门口那条路上（地点写路段名、正在做写「赶路」）。');
    lines.push('step4 精细推演：想想会不会出现特别鲜活的情况（公寓篇：谁拎着便利店袋子回来、谁家的快递堆在门口；乡村篇：太晚了小孩还没回家、爸爸出门去找、谁收工顺路去了小卖铺；神社篇：长廊尽头的风、佛堂里没熄的香、小铺门口挂着的风铃、温泉边晚着的巫女服）。这类事偶尔发生就好，别每轮都来，也别每轮都同一个人。');
    lines.push('step5 结果输出：把名单上每个人按下面的格式填完，一个都不能少。');
    lines.push('');
    lines.push('【输出格式】');
    var wantThink = false;   /* ★ 思考功能下线：不再要求 <思考> */
    if (wantThink) {
      lines.push('先写一段 <思考>…</思考>：五六行内把你按上面五步走的过程写出来（现在什么时辰、{{user}} 在哪、名单上每个人动没动、没动的为什么没动、有没有记忆在生效）。**不要复述提示词，不要自问自答。**');
      lines.push('再写一个 <后台推演>…</后台推演>：姓名已经替你写好、序号也排好了，你只要把每个人的四栏填完。');
      lines.push('除了这两段，不要输出别的：不要写正文、不要写解释、不要 JSON。');
    } else {
      lines.push('只写一个 <后台推演>…</后台推演>：姓名已经替你写好、序号也排好了，你只要把每个人的四栏填完。');
      lines.push('不要思考段，不要正文，不要解释，不要复述这份提示词，不要自问自答。');
    }
    lines.push('');

    /* ★ 全角色一览（不论在不在场）：好感度 / 恶堕值 / 心理阶段浓缩句
       —— 后台 AI 由此知道“他们和 {{user}} 现在是什么关系”。 */
    try {
      var rowsAll = (arcFilterState(readState()).主要角色列表) || {};
      var oneLines = [];
      Object.keys(rowsAll).forEach(function (nm) {
        var r = rowsAll[nm] || {};
        var aff = (r.好感度 == null ? 20 : Number(r.好感度));
        var deg = (r.恶堕值 == null ? 0 : Number(r.恶堕值));
        var top = Math.max(aff, deg);
        var mood;
        if (top >= 60) mood = '一想起 {{user}} 就会开心、会心动，也会压不住身体的燥热，会主动来找、主动靠近';
        else if (top >= 30) mood = '开始留意 {{user}}，会自己找机会靠近，嘴上未必承认';
        else mood = (currentArcOf() === '夏越村') ? '客气有分寸的村里人，不往别处想' : '客气有分寸，不会主动来找';
        oneLines.push('- ' + nm + '：好感度 ' + aff + '／恶堕值 ' + deg + '　→ ' + mood);
      });
      if (oneLines.length) {
        lines.push('【全角色与 {{user}} 的关系（含不在场的人，照这个写心理）】');
        for (var oi = 0; oi < oneLines.length; oi++) lines.push(oneLines[oi]);
        lines.push('');
      }
    } catch (eAll) {}

    /* ★ 苦主们现在的心理阶段（含不在场）：乡村篇才有内容；公寓篇是空表，直接不出这一块 */
    try {
      var pr = (arcFilterState(readState()).苦主列表) || {};
      var pLines = [];
      Object.keys(pr).forEach(function (nm) {
        var st = String((pr[nm] || {}).心理阶段 || '').trim();
        if (!st) st = '阶段一-无敌意';
        var mood;
        if (st.indexOf('四') !== -1) mood = '已经确认了真相，幻想破掉，崩溃或彻底麻木';
        else if (st.indexOf('三') !== -1) mood = '醋意大发：明显不安、话里带刺、盯得更紧，但还没点破';
        else if (st.indexOf('二') !== -1) mood = '察觉到一点不对劲，开始留意，但自己找理由解释过去';
        else mood = '还蒙在鼓里，把你当正经人往来';
        pLines.push('- ' + nm + '：' + st + '　→ ' + mood);
      });
      if (pLines.length) {
        lines.push('【苦主们的心理阶段（含不在场，照着写他们的反应）】');
        for (var pl = 0; pl < pLines.length; pl++) lines.push(pLines[pl]);
        lines.push('');
      }
    } catch (ePeer) {}

    lines.push('【当前局面】');
    /* ★ v165c：时间落库回到 年/月/日/精确时间("HH:MM") 四件套。
       v164 曾把 精确时间 拆成 时 / 分 两个字段（用户评价：多此一举），现在合回去。
       为了兼容 v164 期间产生的存档，这里两种都能读：先看 精确时间，没有再从 时/分 拼。 */
    try {
      var _dd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      var _y = parseInt(t.年份, 10), _mo = parseInt(t.月份, 10), _dt = parseInt(t.日期, 10);
      var _hh = NaN, _mi = NaN;
      var _hmStr = (t.精确时间 == null) ? '' : String(t.精确时间).trim();
      if (_hmStr) {
        var _mhm = /^\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(_hmStr);
        if (_mhm) { _hh = parseInt(_mhm[1], 10); _mi = parseInt(_mhm[2], 10); }
      }
      if (!isFinite(_hh) || !isFinite(_mi)) {
        /* 兼容 v164 的 时 / 分 两件套 */
        _hh = parseInt(t.时, 10); _mi = parseInt(t.分, 10);
      }
      if (!isFinite(_y)) _y = 2018;
      if (!isFinite(_mo) || _mo < 1 || _mo > 12) _mo = 7;
      if (!isFinite(_dt) || _dt < 1 || _dt > 31) _dt = 26;
      if (!isFinite(_hh) || _hh < 0 || _hh > 23) _hh = 7;
      if (!isFinite(_mi) || _mi < 0 || _mi > 59) _mi = 40;
      var _wd = _dd[new Date(Date.UTC(_y, _mo - 1, _dt)).getUTCDay()];
      var _p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      lines.push('- ' + _y + '年' + _mo + '月' + _dt + '日（' + _wd + '） ' + _p2(_hh) + ':' + _p2(_mi));
    } catch (eT) {
      lines.push('- 时间未记录');
    }
    lines.push('- {{user}} 现在在：' + (hero.地点 || '未知地点'));
    lines.push('');
    lines.push('【脚本扫好的名单（照填，不用你判断）】');
    lines.push('- 这一轮要你推演并输出的（共 ' + todoNames.length + ' 人）：' + (todoNames.length ? todoNames.join('、') : '（没人，那就不推演）'));
    lines.push('- 不推演、一个字都不许输出的：' + (skipNames.length ? skipNames.join('、') : '（没有）')
      + '　原因：变量里他们的「在场状态」是 true，也就是说他们此刻就在 {{user}} 眼前，他们的状态由正文与变量负责。');

    if (stalePresent.length) {
      lines.push('- 另外这几个人：' + stalePresent.join('、'));
      lines.push('  变量里 在场状态 还写着 true，但地点明明不在 {{user}} 这一场，脚本判定他们其实已经走了（变量没改回来）。');
      lines.push('  他们**照样推演、照样输出**；顺手在正文里让他们各自忙自己的事。');
    }
    lines.push('- 以上名单是脚本照变量里的「在场状态」算出来的，直接照用。名单外的人一个都不要写。');
    lines.push('- 他们的现在状态（性格、好感度与恶堕值照抄，别推歪；地点/正在做仅供参考，允许你改）：');
    todoNames.forEach(function (name) {
      var r = pres.rows[name] || {};
      lines.push('  · ' + name
        + '：性格 ' + trimDot(bmap[name])
        + '；地点 ' + (r.地点 || '未记录')
        + '；正在做 ' + (r.正在做 || '未记录')
        + '；具体正在做 ' + (r.具体正在做 || '未记录')
        + '；好感度 ' + (r.好感度 == null ? '未记录' : r.好感度) + '；恶堕值 ' + (r.恶堕值 == null ? '未记录' : r.恶堕值)
        + (r.心理阶段 ? '；心理阶段 ' + r.心理阶段 : '')
        + '；心里话 ' + (r.心里话 || '未记录'));
    });
    lines.push('');
    if (skipNames.length) {
      lines.push('- 在场的人（变量里 在场状态=true，本轮不推演、一个字都不许输出；层次照抄，别在正文里写乱）：');
      skipNames.forEach(function (name) {
        var r = pres.rows[name] || {};
        lines.push('  · ' + name
          + '：性格 ' + trimDot(bmap[name])
          + '；好感度 ' + (r.好感度 == null ? '未记录' : r.好感度) + '；恶堕值 ' + (r.恶堕值 == null ? '未记录' : r.恶堕值)
          + (r.心理阶段 ? '；心理阶段 ' + r.心理阶段 : '')
          + '；地点 ' + (r.地点 || '未记录'));
      });
      lines.push('');
    }
    if (blurbs.length) {
      lines.push('【人物速查（精简性格，别写成另一个人）】');
      blurbs.forEach(function (b) { lines.push('- ' + b); });
      lines.push('');
    }
    lines.push('【关系网（照着写，别把亲戚关系写错）】');
    lines.push(relationText());
    lines.push('');
    lines.push('【上一轮的 <后台推演>】' + (lastDed && lastDed.fromRecord ? '（这是你上一次推的，接着来）' : ''));
    lines.push(lastDed ? lastDed.text : '（还没有，这是第一次，请按人设与时间从零推演）');
    lines.push('');
    lines.push('【重要记忆（只留最近 ' + MEMORY_MAX + ' 条，更远的脚本已经忘了；那是正文 AI 的事）】');
    if (mem.length) mem.forEach(function (x) { lines.push('- ' + x); });
    else lines.push('（暂无）');
    lines.push('');
    if (S.lastMove && S.lastMove.to) {
      lines.push('【刚刚发生的移动】{{user}} 从「' + S.lastMove.from + '」走到了「' + S.lastMove.to + '」，路上大约 10 分钟。');
      lines.push('这 10 分钟里，场外的人最多也就走一段路；别让他们在这一步里跑到很远的地方去。');
      lines.push('');
    }
    lines.push('【地图与走法（必须一段一段走，禁止瞬移）】');
    lines.push(mapText());
    lines.push('- 一轮最多前进一段（相邻两个点）。要到更远的地方，就分轮走：这一轮写成「在路上」（地点写路段名、正在做写「赶路」），轮到你走到时再写目的地。');
    var __rules = ruleBlockText();
    if (__rules.length) { for (var __ri = 0; __ri < __rules.length; __ri++) lines.push(__rules[__ri]); }
    else lines.push('- 谁在家里，这一步就只可能去同建筑的别的房间、院子 / 走廊；不可能一步跳到辖区外面去。');
    lines.push('');
    lines.push('<后台推演>');
    var numbered = todoNames.length ? todoNames : ['（没人要推演，这一节写「无」）'];
    numbered.forEach(function (name, i) {
      lines.push((i + 1) + '.' + name + ':');
      lines.push('地点:');
      lines.push('正在做:');
      lines.push('具体正在做:');
      lines.push('心里话:');
    });
    lines.push('</后台推演>');
    lines.push('');
    lines.push('名单上这 ' + todoNames.length + ' 个人**一个都不能少**，全部要填完。就算某人这一轮什么都没干，也要写：');
    lines.push('地点写他现在待着的地方、正在做写他原本在做的事、具体正在做照旧写清楚、心里话写他眼下的心思，让人看出「他没动，但他活着」。');
    lines.push('');
    lines.push('【字段规矩】');
    lines.push('- 地点：只能从下面这份固值地点表里一字不差地抄一个（含路段名）：' +
      (places.length ? places.join('、') : '见当前篇章对应的「地点总表」条目，只能从那张表里列出的固值里抄一个'));
    lines.push('- 地点一律照当前篇章那份「地点总表」的固值抄，一字不差，三个篇章的地名**绝对不能混**。');
    lines.push('- 正在做：只能是这 ' + DOINGS.length + ' 个之一：' + DOINGS.join(' / ') + '。');
    lines.push('- 具体正在做：一句话，不少于 8 字，是对「正在做」的补充，不许和它重复，不许写成心情或旁白。');
    lines.push('- 心里话：不少于 20 字，按这个人的性格与心理状态写。');
    lines.push(wantThink ? '- 只输出 <思考> 和 <后台推演> 两段，别的什么都不要。' : '- 只输出 <后台推演> 这一段，别的什么都不要。');
    return arcFilterLines(lines).join('\n');
  }

  /* ══════════════════════════════════════════════════════════════════
     ★ v1.24：API 拉取层重写 —— 抄《天元录》08-外置变量补全 的成熟设计
     ──────────────────────────────────────────────────────────────────
     玩家原话：「推演api的拉取还是填不了火山豆包，你直接去抄天元录的
     变量补全脚本就行了，看看它的拉取部分怎么设计的。」

     天元录那边踩过的坑，逐条搬过来（每条都是真机实测出来的，不是推测）：

     ① baseOf() 地址归一
        玩家常把**完整对话地址**粘进来（`.../v1/chat/completions`），
        旧代码直接在后面再接 `/chat/completions` ⇒ 拼成
        `.../chat/completions/chat/completions` ⇒ 404，而报错只说 HTTP 404，
        看着像 Key 填错。归一化剥掉尾巴才拼。

     ② 火山 Coding Plan 有两个 Base URL，同一份 Key
           /api/coding       → Anthropic 协议（/messages）
           /api/coding/v3    → OpenAI 协议（/chat/completions）
        我们只会说 OpenAI 协议 ⇒ 玩家粘了前者（从 Claude Code 那边抄来的），
        必须补成 `/v3`，否则拼出来是 `/api/coding/chat/completions`，必然 404。

     ③ 火山方舟的 /models **没有 CORS 头**（甚至常常 404）
        浏览器直连永远拉不到 ⇒ 必须走酒馆后端 / 酒馆助手。
        而它家的 /chat/completions 同样没有 CORS 头 ⇒ **对话也得走后端**。
        这就是「拉模型能成、测试连接报 Failed to fetch」的根因：
        两条路走的不是同一个通道。

     ④ 模型名两套，互不通用
           /api/v3        = 在线推理，ID 带 6 位日期（doubao-seed-2-1-pro-260915）
           /api/coding/v3 = Coding Plan，名字是 doubao-seed-code 这种
        填错必然 404（model not found），措辞看着像 Key 不对。

     ⑤ 豆包 2.1 默认开深度思考 ⇒ 思维链把 max_tokens 吃光，
        正文 `content` 是空串，全在 `reasoning_content` 里。
        推演是「编故事」不是「算账」，不需要思考 ⇒ 显式 `thinking:{type:'disabled'}`。

     ⑥ 错误翻译成人话
        InvalidSubscription / ModelNotOpen / SetLimitExceeded 原文夹着 request id，
        直接抛出去玩家只会以为"Key 又错了"。
     ══════════════════════════════════════════════════════════════════ */

  /* ── ① 地址归一 ──
     在 base 上剥掉 chat/completions、completions、messages、models 这些尾巴，
     再把火山的 /api/coding 补成 /api/coding/v3。 */
  function baseOf(u) {
    var b = String(u || '').trim().replace(/\/+$/, '');
    b = b.replace(/\/chat\/completions$/i, '').replace(/\/completions$/i, '');
    b = b.replace(/\/messages$/i, '');       /* Anthropic 协议的尾巴，粘进来也认 */
    b = b.replace(/\/models$/i, '');         /* 有人会把 /models 也粘进来 */
    b = b.replace(/\/+$/, '');
    if (/^https?:\/\/ark\.cn-beijing\.volces\.com\/api\/coding$/i.test(b)) b += '/v3';
    return b.replace(/\/+$/, '');
  }

  /* ── ③ 认得出「没有 CORS」的服务商 ──
     顺序即优先级：coding 必须排在通用火山规则之前（正则都会命中同一域名）。 */
  var NO_CORS_PROVIDERS = [
    { re: /ark\.cn-beijing\.volces\.com\/api\/coding/i, name: '火山方舟 Coding Plan' },
    { re: /volces\.com|volcengine|ark\.cn-beijing/i, name: '火山方舟（豆包）' }
  ];
  function knownNoCors(url) {
    for (var i = 0; i < NO_CORS_PROVIDERS.length; i++) {
      if (NO_CORS_PROVIDERS[i].re.test(String(url))) return NO_CORS_PROVIDERS[i].name;
    }
    return '';
  }

  /* ── ④ 两张名单不能混 ──
     来源：火山方舟官方「模型列表」+《套餐概览 · 支持的模型》，核对日期 2026-10-27。
     初版凭印象写的（塞了 doubao-seed-1-6-*、doubao-pro-32k）全都不在官方列表里，
     反而当前主推的 2.1 系列一个都没写 —— 给一串查不到的模型名，
     比给一个空白框更糟：玩家选中后只会得到一个看不懂的 404。 */
  var FALLBACK_MODELS = {
    '火山方舟（豆包）': [
      'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-lite-260915',
      'doubao-seed-2-1-turbo-260628', 'doubao-seed-evolving',
      'doubao-seed-2-1-pro-260628', 'doubao-seed-2-0-lite-260428',
      'doubao-seed-2-0-mini-260428',
      'doubao-seed-2-0-pro-260215'
    ],
    '火山方舟 Coding Plan': [
      'doubao-seed-2.1-pro', 'doubao-seed-2.1-lite',
      'doubao-seed-code', 'doubao-seed-2.0-code',
      'doubao-seed-2.0-pro', 'doubao-seed-2.0-lite',
      'deepseek-v3.2', 'glm-4.7', 'kimi-k2.5', 'minimax-m2.5',
      'ark-code-latest'
    ]
  };

  /* ── ⑥ 错误翻成人话 ──
     实测于 2026-10-27，用真 Key。原文都很长且夹着 request id。 */
  function arkHint(txt) {
    var t = String(txt || '');
    if (/InvalidSubscription/i.test(t)) {
      return '｜这份 Key **没有有效的 Coding Plan 订阅**（或已过期）。两条路：'
        + '① 去方舟控制台续订 Coding Plan；'
        + '② 把地址换成 https://ark.cn-beijing.volces.com/api/v3 走在线推理（按 token 计费）';
    }
    if (/ModelNotOpen/i.test(t)) {
      return '｜这个模型你的账号**没有开通**（方舟要求逐个开通，不是 Key 的问题）。'
        + '去 console.volcengine.com/ark 的开通管理页开通它，或换一个已开通的';
    }
    if (/InvalidEndpointOrModel/i.test(t)) {
      return '｜这个模型名**不存在**：确认拼写，或在「拉取模型」列表里重新选一个';
    }
    if (/SetLimitExceeded/i.test(t)) {
      return '｜这个模型**达到账号限额**了，换模型或去控制台提额度';
    }
    if (/InvalidAuthentication|AuthenticationError|invalid api key/i.test(t)) {
      return '｜Key 不被认（401）。Coding Plan 要单独的 Key（在开通管理页建），线上推理的 Key 不一定通用';
    }
    return '';
  }

  /* ── 找 TavernHelper（四个位置）──
     ★ 顺手修了一个真 bug：原代码用 `HOST.TavernHelper`，而**全文没有 `HOST` 这个变量**
       ⇒ 抛 ReferenceError ⇒ 被 try/catch 吞掉 ⇒ 「用当前酒馆模型」这条
       第一优先级永远拿不到 TH，只能靠第二句 `window.TavernHelper` 碰运气。
       现在把四个位置都找一遍，跟天元录 findTH() 一致。 */
  function thWindows() {
    var out = [];
    var push = function (w) { try { if (w && out.indexOf(w) < 0) out.push(w); } catch (e) {} };
    try { push(window); } catch (e0) {}
    try { if (window.parent) push(window.parent); } catch (e1) {}
    try { if (window.top) push(window.top); } catch (e2) {}
    try {
      var d = (function () { try { return (window.top && window.top.document) || document; } catch (e) { return document; } })();
      var ifrs = d.querySelectorAll('iframe');
      for (var i = 0; i < ifrs.length; i++) { try { push(ifrs[i].contentWindow); } catch (ei) {} }
    } catch (e3) {}
    return out;
  }
  function findTH() {
    var wins = thWindows();
    for (var i = 0; i < wins.length; i++) {
      try { if (wins[i].TavernHelper) return wins[i].TavernHelper; } catch (e) {}
    }
    try { if (typeof TavernHelper !== 'undefined' && TavernHelper) return TavernHelper; } catch (e2) {}
    return null;
  }

  /* ── ⑤ 酒馆宿主的请求头 ──
     ⚠ 必须走 `SillyTavern.getRequestHeaders()` + 现取 `/csrf-token`。
     实测：cookie + Origin 齐全但**不带 X-CSRF-Token** ⇒ 403 Forbidden（HTML 页面）；
     补上 token ⇒ 200。403 的根因是 token，不是地址或 Key。
     ⚠ 也别自己拼 origin：卡在 iframe 里 origin 可能是 opaque，拿不到会话 cookie。 */
  function stBase() {
    var wins = thWindows();
    for (var i = 0; i < wins.length; i++) {
      try {
        var st = wins[i].SillyTavern;
        if (st && typeof st.getRequestHeaders === 'function') return st;
      } catch (e) {}
    }
    return null;
  }
  function stOrigin() {
    var wins = thWindows();
    for (var i = 0; i < wins.length; i++) {
      try {
        var h = wins[i].location && wins[i].location.href;
        if (!h) continue;
        var u = new URL('.', String(h));
        if (/^https?:$/i.test(u.protocol)) return u.href.replace(/\/+$/, '');
      } catch (e) {}
    }
    return '';
  }
  function stHeaders() {
    var base = null;
    var st = stBase();
    try { if (st) { var h = st.getRequestHeaders(); if (h && typeof h === 'object') base = h; } } catch (e) {}
    return fetch('/csrf-token', { cache: 'no-store', credentials: 'include' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        var out = {};
        if (base) { for (var k in base) out[k] = base[k]; }
        out['Content-Type'] = 'application/json';
        if (j && j.token) out['X-CSRF-Token'] = j.token;
        return out;
      })
      .catch(function () { return base || { 'Content-Type': 'application/json' }; });
  }
  /* 同源接口：先用相对路径（iframe 的 base 会解析到酒馆），403/404 再试绝对地址。
     必须带 cookie，否则一样 403。 */
  function stApi(path, opts) {
    var o = opts || {};
    if (o.credentials === undefined) o.credentials = 'include';
    return fetch(path, o).then(function (r) {
      if (r && (r.status === 403 || r.status === 404)) {
        var org = stOrigin();
        if (org) return fetch(org + path, o);
      }
      return r;
    }, function (e) {
      var org = stOrigin();
      if (org) return fetch(org + path, o);
      throw e;
    });
  }

  /* ── ③ 对话走酒馆后端（火山唯一能走通的路）──
     `Failed to fetch` 是浏览器跨域的固定措辞。实测（带 Origin）：
        /api/coding/v3/chat/completions → 401，**没有任何 access-control-allow-origin**
        /api/v3/chat/completions        → 同样没有
     ⇒ 拉模型之所以能成，是走了酒馆后端；对话也必须走同一条路。
       浏览器直连这条路对火山永远不通，跟 Key、模型名都无关。 */
  function callViaBackendChat(cfg, messages, maxTokens, temp, wantThink) {
    if (!cfg.base) return Promise.reject(new Error('没有可用的 Base URL'));
    /* ══ ★ v165i：后端这条路怎么关掉豆包的深度思考 ══════════════════════════
       病根（这是「豆包填好了却推演不出来」的最后一处漏点）：

         直连那条路早就写了 `if (via) body.thinking = {type:'disabled'}`，
         但火山**根本走不了直连** —— 它不给 CORS 头，三条路里真正生不生效的是这里。
         而后端通道的请求体里，从头到尾没有过 thinking 这个键。

       于是实际发生的是：
         ① 填火山地址 + Key，点「测试连接」→ 走直连那段 → 带 thinking → 能过；
         ② 真推演走后端 → 不带 thinking → 豆包 2.1 默认开深度思考；
         ③ 思维链把 max_tokens 吃光 ⇒ content 空串，全在 reasoning_content；
         ④ 只报「返回里没有正文内容」，玩家以为是 Key 或模型名不对。

       ★ 我先写的版本用 `custom_include_body` 透传，**查了酒馆源码后撤回了**：
         SillyTavern 的 /api/backends/chat-completions/generate 里，
         `custom_include_body` 只在 `chat_completion_source === 'custom'` 分支被
         mergeObjectWithYaml 读取；'openai' 分支（我们用的这条，靠 reverse_proxy 指地址）
         **根本不读它** —— 那个字段会被静默忽略，看着像改好了、其实一个字节都没上去。
         这种「假修复」比不改更坏：下次再报错就没人会怀疑到这里。

       现在改成真能生效的两条：
         ① **优先 `source: 'custom'` 直接发**（见下面 callViaBackendCustom）——
            它是唯一官方支持透传额外 body 的通道，thinking 从这里上去是真的；
            代价是要填 custom_url（而不是 reverse_proxy），两个参数名不一样。
         ② 走不通就退回 'openai' + reverse_proxy，并且**明确告诉调用方「这次没关思考」**，
            让它按「content 可能为空、要从 reasoning_content 里捞」去处理，
            而不是假装一切正常。 */
    var noCors = knownNoCors(cfg.base);
    var wantOff = !!noCors && !wantThink;   /* 认得出的服务商 + 玩家没主动要思考 → 关掉 */
    return callViaBackendCustom(cfg, messages, maxTokens, temp, wantOff).then(null, function (eC) {
      /* custom 通道不通（老版本酒馆没有 custom 源、或代理没配）→ 退 openai */
      return callViaBackendOpenAI(cfg, messages, maxTokens, temp).then(function (r) {
        r.thinkOff = false;          /* ★ 如实标记：这条路没能关掉思考 */
        return r;
      }, function (eO) {
        throw new Error('酒馆后端的两种发法都不通：'
          + '｜custom 源：' + String((eC && eC.message) || eC)
          + '｜openai 源：' + String((eO && eO.message) || eO));
      });
    });
  }

  /* ── ③a-1 `source:'custom'`：唯一支持透传额外字段的后端通道 ──
     custom_url 与 reverse_proxy 是**两个不同参数**，值可以一样（都是 base 根地址），
     但字段名必须给对，否则后端会当成「没填地址」直接 400。 */
  function callViaBackendCustom(cfg, messages, maxTokens, temp, thinkOff) {
    var reqBody = {
      chat_completion_source: 'custom',   /* ← 关键：只有这个源读 custom_include_body */
      custom_url: cfg.base,
      model: cfg.model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temp,
      stream: false
    };
    /* custom 源取 Key 走的是 secret_id，不认 proxy_password。
       所以这里**只带字段不指望它生效**：真正用 custom 源的老玩家会在酒馆里
       配好 custom 的 Key；没配的会 401，然后自动退到 openai 那条。 */
    if (thinkOff) reqBody.custom_include_body = JSON.stringify({ thinking: { type: 'disabled' } });
    if (cfg.key) reqBody.custom_include_headers = JSON.stringify({ 'Authorization': 'Bearer ' + cfg.key });
    return backendGenerate(reqBody, 'custom 源').then(function (r) { r.thinkOff = !!thinkOff; return r; });
  }
  /* ── ③a-2 `source:'openai'` + reverse_proxy：老路，认 proxy_password ── */
  function callViaBackendOpenAI(cfg, messages, maxTokens, temp) {
    return backendGenerate({
      chat_completion_source: 'openai',
      reverse_proxy: cfg.base,        /* 后端自己拼 /chat/completions */
      proxy_password: cfg.key || '',  /* 后端只认这个字段名，别写成 key */
      model: cfg.model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temp,
      stream: false
    }, 'openai 源');
  }
  /* ── 两条路共用的发送 + 解析（只写一遍，省得改一处漏一处）── */
  function backendGenerate(reqBody, tag) {
    return stHeaders().then(function (headers) {
      return stApi('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: headers,
        cache: 'no-store',
        body: JSON.stringify(reqBody)
      });
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (!r.ok) throw new Error('酒馆后端（' + tag + '）HTTP ' + r.status + '：' + String(txt).slice(0, 160));
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { throw new Error('酒馆后端（' + tag + '）返回不是 JSON：' + String(txt).slice(0, 140)); }
        if (j && j.error) {
          var em = (j.error && (j.error.message || j.error.code)) || j.error;
          var rawErr = String(typeof em === 'string' ? em : JSON.stringify(em));
          throw new Error('酒馆后端（' + tag + '）报错：' + rawErr.slice(0, 180) + arkHint(rawErr));
        }
        var m = (j && j.choices && j.choices[0] && j.choices[0].message) || {};
        var one = m.content || (j && j.content) || '';
        /* ★ ⑤ content 为空退 reasoning_content —— 总比整轮推演直接失败好。
           ★ v165i：这是「没关成思考」时唯一还能救回一轮的兜底，别删。 */
        var rs = m.reasoning_content || '';
        if (!String(one).trim() && rs) one = rs;
        if (!String(one).trim()) throw new Error('酒馆后端（' + tag + '）返回里没有正文内容');
        return { text: String(one), reasoning: String(rs || ''), finish: String((j.choices && j.choices[0] && j.choices[0].finish_reason) || '') };
      });
    });
  }

  /* ── ③b 让酒馆助手替我们发（它跑在助手上下文里，带得动会话）──
     JS-Slash-Runner 的 `generateRaw` 支持 `custom_api`：
        generateRaw({ user_input, custom_api: { apiurl, key, model, source:'openai', max_tokens, temperature } })
     与 getModelList 是同一条通路 ⇒ 不会 403。 */
  function callViaHelperCustom(cfg, messages, maxTokens, temp) {
    return new Promise(function (resolve, reject) {
      var TH = findTH();
      var fn = (TH && typeof TH.generateRaw === 'function') ? TH.generateRaw : null;
      if (!fn) { reject(new Error('这个酒馆助手版本没有 generateRaw')); return; }
      var promptText = '';
      if (Array.isArray(messages)) {
        promptText = messages.map(function (m) {
          return (m.role === 'system' ? '【规则与格式要求】\n' + m.content : m.content);
        }).join('\n\n');
      } else {
        promptText = String(messages || '');
      }
      var api = {
        apiurl: cfg.base, key: cfg.key || '', model: cfg.model,
        source: 'openai', max_tokens: maxTokens, temperature: temp
      };
      /* ★ v165i：助手这条路也一样，认得出的服务商就带上 thinking:disabled。
         助手是把 custom_api 原样交给它自己的请求层，多一个字段不会被拒；
         不认这个键的服务商本来也不会走到这里（smartFetch 只对 noCors 启用本函数）。 */
      if (knownNoCors(cfg.base)) api.thinking = { type: 'disabled' };
      var out = null;
      try { out = fn.call(TH, { user_input: promptText, custom_api: api }); }
      catch (e1) { reject(new Error('助手 generateRaw 调用失败：' + ((e1 && e1.message) || e1))); return; }
      Promise.resolve(out).then(function (r) {
        var txt = String((r && (r.content || r.text)) || r || '');
        if (!txt.trim()) { reject(new Error('助手 generateRaw 返回空')); return; }
        resolve({ text: txt, reasoning: '', finish: '', thinkOff: !!api.thinking });
      }, function (e2) {
        reject(new Error('助手 generateRaw 报错：' + ((e2 && e2.message) || e2)));
      });
    });
  }

  /* ── ③c 包成 fetch 形状，让执行层一个字都不用改 ──
     顺序 = 后端优先 → 助手 → 浏览器直连。
     为什么后端第一：天元录 v420 实测过，助手 generateRaw 在某些版本返回 Forbidden
     （没带 CSRF），而后端这条路 CSRF 现取现覆盖，最可控。
     只对「认得出没有 CORS」的服务商启用；别家继续直连，省一层中转。 */
  function smartFetch(url, opts, cfg, messages, maxTokens, temp) {
    if (!knownNoCors(url)) return fetch(url, opts);
    var wrap = function (o) {
      /* ★ v165i：把「这条通道有没有关掉深度思考」记下来。
         没关掉的话，content 可能是空串、正文在 reasoning_content 里 ——
         解析层会照旧从 reasoning 捞，但面板上得让人知道发生了什么，
         否则玩家只会看到「推演内容像是模型的自言自语」。 */
      try { window.__thDeduceThinkOff = (o && o.thinkOff) ? 'on' : 'off'; } catch (eF) {}
      return {
        ok: true, status: 200,
        _th: o,
        text: function () {
          return Promise.resolve(JSON.stringify({
            choices: [{ message: { content: o.text, reasoning_content: o.reasoning || '' }, finish_reason: o.finish || '' }]
          }));
        }
      };
    };
    return callViaBackendChat(cfg, messages, maxTokens, temp).then(wrap, function (eB) {
      return callViaHelperCustom(cfg, messages, maxTokens, temp).then(wrap, function (eH) {
        return fetch(url, opts).catch(function (e2) {
          throw new Error('火山方舟三条路都不通：'
            + '｜酒馆后端：' + String((eB && eB.message) || eB)
            + '｜酒馆助手：' + String((eH && eH.message) || eH)
            + '｜浏览器直连：' + String((e2 && e2.message) || e2)
            + '（地址 ' + url + '）'
            + '。浏览器直连对火山**永远不通**（它不给 CORS 头），'
            + '所以真正要看的是前两条：确认在酒馆里打开、且「酒馆助手」扩展已启用。');
        });
      });
    });
  }

  /* ────────────────────────── 调 API ────────────────────────── */
  /* ★ v1.24：endpoint() 改成走 baseOf()，不再自己拼。
     旧实现只判了 `/chat/completions$`，玩家粘 `/v1/chat/completions/`（带尾斜杠）
     或 `/messages`、`/models` 的都会拼错。 */
  function endpoint() {
    var b = baseOf(S.settings.base);
    if (!b) return '';
    return b + '/chat/completions';
  }
  /* ── 模型名自动纠正（抄天元录 apiConfig 的 v389/v414/v418 三段规则）──
     这是「填不了豆包」的第四种形状，也是最容易被忽略的一种：
     玩家把地址和 Key 都填对了、也点了测试，结果报 404 说他 Key/地址不对，
     其实只是**模型名没换**（默认值是 OpenAI 的 gpt-4o-mini）。

     三条规矩：
       ① 地址是 Coding Plan，而模型名长得像「在线推理 ID」⇒ 一律清空重选。
          在线推理 ID 的形态：结尾 6 位日期 / `-32k` 这类上下文长度 / functioncall / preview。
          玩家自己填的正常 coding 名（doubao-seed-code、deepseek-v3.2、glm-4.7）都不含这些词，不会被误伤。
       ② 清空后、或模型名还等于默认值 ⇒ 换成该服务商名单的第一个。
       ③ 判断「没填过」用 DEFAULTS.model 比对，不许写死 'gpt-4o-mini' 字面量
          —— 默认值以后一改，这里就悄悄失效了。 */
  function resolveModel(ep, mdl) {
    var m = String(mdl || '').trim();
    var noCors = knownNoCors(ep);
    if (/\/api\/coding(\/|$)/i.test(ep)
      && (/-2\d{5}$/.test(m) || /-\d+k\b/i.test(m) || /functioncall/i.test(m) || /preview/i.test(m))) {
      m = '';
    }
    if (noCors && (!m || m === DEFAULTS.model)) {
      var fb = FALLBACK_MODELS[noCors] || [];
      if (fb.length) m = fb[0];
    }
    return m || DEFAULTS.model;
  }

  /* ★ v1.17：探活。只发一句话、最多 10 个 token，把结果或错误原样报出来。
     ★ v1.24：改走 smartFetch（火山走后端），加 baseOf 归一、thinking 关闭、
       模型名自动纠正、错误翻译。这就是「填不了火山豆包」的正解。 */
  function testApi() {
    var b = baseOf(S.settings.base);
    var url = b ? b + '/chat/completions' : '';
    var key = String(S.settings.key || '').trim();
    if (!url || !key) { toast('🎲 先填地址和钥匙'); return Promise.resolve(null); }
    var mdl = resolveModel(url, S.settings.model);
    setStatus('running', '测试接口中…');
    var via = knownNoCors(url);
    toast('🎲 正在测 ' + url + (via ? '（' + via + '，走酒馆后端）' : ''));
    var body = {
      model: mdl,
      messages: [{ role: 'user', content: '回复一个「通」字就行。' }],
      max_tokens: 16,
      stream: false,
    };
    /* ★ ⑤ 关掉深度思考：豆包 2.1 默认开着，思维链会把 max_tokens 吃光，
       正文 content 是空串。只对认得出的服务商加这个字段 —— 别家不认这个键，
       无脑塞进去可能被当成非法参数整单拒掉。 */
    if (via) body.thinking = { type: 'disabled' };
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) {}
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) };
    if (ctrl) opts.signal = ctrl.signal;
    var timer = null;
    var cfg = { base: b, key: key, model: mdl, endpoint: url };
    return new Promise(function (resolve) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e2) {} }
        resolve({ ok: false, msg: '连接超时（' + Math.round(clamp(S.settings.timeoutMs, 5000, 180000) / 1000) + ' 秒）：中转站没回应' });
      }, clamp(S.settings.timeoutMs, 5000, 180000));
      smartFetch(url, opts, cfg, body.messages, body.max_tokens, 0.3).then(function (res) {
        return res.text().then(function (txt) {
          if (timer) clearTimeout(timer);
          if (!res.ok) {
            /* ★ ⑥ 404 九成是模型名用了在线推理那一套，不是 Key 或地址错。
               光报 HTTP 404 会把人引到错方向。 */
            var hint = arkHint(txt);
            if (!hint && res.status === 404 && /\/api\/coding/i.test(url)) {
              hint = '｜这个地址是 Coding Plan：模型名要写 doubao-seed-code / doubao-seed-2.1-pro / '
                + 'deepseek-v3.2 这种，**不能**写 doubao-seed-2-1-pro-260915 这类在线推理 ID';
            }
            resolve({ ok: false, msg: 'HTTP ' + res.status + '：' + String(txt).slice(0, 160) + hint });
            return;
          }
          var one = '';
          var rs = '';
          try {
            var j = JSON.parse(txt);
            var msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
            one = msg.content || '';
            rs = msg.reasoning_content || '';
            if (!String(one).trim() && rs) one = rs;    /* ★ ⑤ content 空退思维链 */
          } catch (e3) {}
          resolve({
            ok: true,
            msg: '通了，模型回了：' + (String(one).trim() || '（空内容）')
              + '｜实际用了模型 ' + mdl
              + (via ? '｜通道：' + via + '（经酒馆后端）' : '｜通道：浏览器直连')
          });
        });
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        var raw = String((err && err.message) || err);
        if (err && (err.name === 'AbortError' || /aborted/i.test(raw))) {
          resolve({ ok: false, msg: '超时：' + Math.round(clamp(S.settings.timeoutMs, 5000, 180000) / 1000) + ' 秒内没等到回应（地址 ' + url + '）' });
          return;
        }
        resolve({ ok: false, msg: raw });
      });
    }).then(function (r) {
      S.lastTest = r;
      setStatus(r.ok ? 'done' : 'error', (r.ok ? '接口正常：' : '接口有问题：') + r.msg.slice(0, 70));
      toast((r.ok ? '✅ ' : '❌ ') + r.msg);
      renderPanel();
      return r;
    });
  }
  /* ★ v1.18：判断模型是不是在「念经」。返回一句人话（毛病），没毛病返回 ''。
     特征：没有 <后台推演> 标签、或者把提示词的段落抄了回去，或者出现「我们应输出 / 需要推演」这种自问自答。 */
  function isRambling(text) {
    var raw = String(text || '');
    if (!raw.trim()) return '返回是空的';
    /* ★ v1.18b：光提到「<后台推演>」这几个字不算写了标签，要看真有整块标签或真解析出段落 */
    var hasBlock = /<\s*后台推演[^>]*>[\s\S]*?<\s*\/\s*后台推演\s*>/i.test(raw);
    var sections = splitSections(raw).length;
    var echoed = ['【按这五步做', '【脚本扫好的名单', '【当前局面】', '【字段规矩】', '【地图与走法'].filter(function (h) { return raw.indexOf(h) >= 0; }).length;
    var selfTalk = (raw.match(/我们应|需要推演|可以不动|需要决定|咋办|先考虑|注意规则|不确定/g) || []).length;
    if (echoed >= 2) return '它把提示词抄了一遍';
    if (!hasBlock && !sections) {
      if (selfTalk >= 2) return '它在自问自答';
      if (raw.length > 600) return '它写了一大堆但没写 <后台推演> 标签';
      return '它没写 <后台推演> 标签';
    }
    return '';
  }
  function callApi(prompt) {
    /* ★ 方案 A：勾上「用当前酒馆模型」时，直接调酒馆正在用的模型，不用填 API。
       用酒馆助手注入的 generateRaw（主窗口的 TavernHelper 上有），拿到的就是纯文本。 */
    if (S.settings.useHostModel) {
      return new Promise(function (resolve, reject) {
        /* ★ v1.24：这里原来是 `HOST && HOST.TavernHelper`，而全文没有 HOST 变量
           ⇒ 抛 ReferenceError 被 catch 吞掉 ⇒ 第一优先级永远失效。
           改用 findTH()（当前 window → parent → top → 所有 iframe → 裸 TavernHelper）。 */
        var TH = findTH();
        if (!TH || typeof TH.generateRaw !== 'function') {
          reject(new Error('拿不到酒馆的 generateRaw（确认「酒馆助手」扩展已启用），或取消勾选「用当前酒馆模型」改填 API'));
          return;
        }
        Promise.resolve()
          /* ★ 酒馆助手的 generateRaw 各版本参数形态不一样：依次试三种，谁先吐东西用谁 */
          .then(function () {
            function tryOne(fn) {
              return Promise.resolve().then(fn).then(function (out) {
                var s = String((out && (out.content || out.text)) || out || '');
                if (s.trim()) return s;
                return null;
              }).catch(function () { return null; });
            }
            var shapes = [
              function () { return TH.generateRaw({ ordered_prompts: [{ role: 'user', content: prompt }] }); },
              function () { return TH.generateRaw({ user_input: prompt }); },
              function () { return TH.generateRaw({ ordered_prompts: [prompt] }); },
              function () { return TH.generateRaw(prompt); }
            ];
            var idx = 0;
            function next() {
              if (idx >= shapes.length) return null;
              var f = shapes[idx++];
              return tryOne(f).then(function (got) { return got || next(); });
            }
            return next();
          })
          .then(function (txt) {
            txt = String(txt || '');
            if (!txt.trim()) {
              reject(new Error('酒馆模型没有返回内容（generateRaw 的四种调用形态都没拿到）——可以取消勾选「用当前酒馆模型」改填 API'));
              return;
            }
            /* ★ 认出“它根本没看到提示词”：这种通用问候 / 自报家门的回复一律当失败，
               绝不把这种东西写进变量（之前就是它把“不知道要搞什么”的答复当成了推演结果）。 */
            var looksLost = !/［本回合移动检定］|\[本回合移动检定\]/.test(txt) &&
              /(fresh slate|How can I help|How may I help|怎么帮|需不需要我|有什么可以帮|请问有什么|assistant|我很乐意帮|我可以协助)/i.test(txt);
            if (looksLost) {
              reject(new Error('酒馆模型回了一句通用问候，说明它没收到推演提示词：请改用你自己填的 API（取消勾选「用当前酒馆模型」）'));
              return;
            }
            S.lastReasoning = '';
            S.lastFinish = 'stop';
            resolve(txt);
          })
          .catch(function (err) { reject(new Error('用酒馆模型推演失败：' + String((err && err.message) || err))); });
      });
    }
    var url = endpoint();
    var key = String(S.settings.key || '').trim();
    if (!url || !key) return Promise.reject(new Error('还没填 API 地址或钥匙（点按钮栏里的「🎲 推演」）'));
    var mdl = resolveModel(url, S.settings.model);
    var via = knownNoCors(url);
    var temp = clamp(S.settings.temperature, 0, 2);
    var maxTok = clamp(S.settings.maxTokens, 200, 32000);
    var body = {
      model: mdl,
      /* ★ v1.15：不发送 system（预设）。身份、五步、输出格式这些本来就在这条 user 消息里。 */
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: temp,
      /* ★ v1.16：上限从 4000 放开到 32000。以前这里把你想设的值硬钳在 4000，
         人多的时候 4000 确实会把名单截断。花的是实际输出，不是这个上限。 */
      max_tokens: maxTok,
      stream: false,
    };
    /* ★ ⑤ v1.24：关掉深度思考。
       豆包 2.1 系列默认开着，思维链会把 max_tokens 吃光 ⇒ `content` 可能是空串，
       正文全在 `reasoning_content` 里 ⇒ 旧代码只读 content ⇒ 报「返回里没有正文内容」，
       玩家看到的就是「豆包配好了但推演不出来」。
       推演是编故事，要的是发散不是推理链 —— 关掉既省 token 又快，
       而且**不会把「让我想想」这类草稿混进正文**。
       ⚠ 只对认得出的服务商加这个字段，别家不认这个键，塞进去可能被整单拒掉。 */
    if (via) body.thinking = { type: 'disabled' };
    var ctrl = null;
    var timer = null;
    try { ctrl = new AbortController(); } catch (e) {}
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(body),
    };
    if (ctrl) opts.signal = ctrl.signal;
    /* ★ v1.24：走 smartFetch —— 火山方舟三条路（酒馆后端 → 酒馆助手 → 直连），
       别家直接 fetch。没有这一层，火山永远是 `Failed to fetch`（它不给 CORS 头）。 */
    var cfg = { base: baseOf(S.settings.base), key: key, model: mdl, endpoint: url };
    return new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        reject(new Error('超时（' + S.settings.timeoutMs + 'ms）'));
      }, clamp(S.settings.timeoutMs, 5000, 180000));
      smartFetch(url, opts, cfg, body.messages, maxTok, temp).then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) throw new Error('HTTP ' + res.status + '：' + String(txt).slice(0, 200));
          var data = null;
          try { data = JSON.parse(txt); } catch (e) { throw new Error('返回不是 JSON：' + String(txt).slice(0, 160)); }
          var content = '';
          try { content = data.choices[0].message.content || ''; } catch (e2) {}
          if (!content) { try { content = data.choices[0].text || ''; } catch (e3) {} }
          /* ★ v1.3：有些代理 / 推理模型把东西放在 reasoning_content 里，或者 content 只有前半截 */
          var reasoning = '';
          try { reasoning = data.choices[0].message.reasoning_content || ''; } catch (e4) {}
          if (!content && reasoning) content = reasoning;
          S.lastReasoning = reasoning || '';   /* ★ v1.7：有些接口会把思维链放这儿，面板里也摊出来 */
          /* ★ v1.16：记下收尾原因。length = 撞到上限被截断了，这样面板能直接提醒你调大。 */
          try { S.lastFinish = String(data.choices[0].finish_reason || ''); } catch (e5) { S.lastFinish = ''; }
          if (content && !/<\s*后台推演/.test(content) && reasoning && /<\s*后台推演/.test(reasoning)) content = reasoning;
          if (!content) {
            /* ★ ⑤ 把「为什么是空的」说清楚，别再只说「没有正文内容」 */
            throw new Error('返回里没有正文内容'
              + (via ? '（' + via + ' 的思维链可能把 max_tokens 吃光了，' +
                '把「上限」调大，或确认模型名 ' + mdl + ' 是这个地址下可用的）' : ''));
          }
          resolve(String(content));
        });
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        /* ★ v1.17：把「连不上」和「格式不对」分开。网络类错误不重试，直接说清楚是哪个地址、该怎么办。 */
        var raw = String((err && err.message) || err);
        var e = new Error(raw);
        if (err && (err.name === 'AbortError' || /aborted/i.test(raw))) {
          e.netError = true;
          e.message = '连接超时：' + Math.round(clamp(S.settings.timeoutMs, 5000, 180000) / 1000) + ' 秒内没等到回应。'
            + '地址是 ' + url + '。中转站可能挂了或被墙，换个地址 / 开代理 / 把「超时」调大再试。'
            + (via ? '｜火山方舟要走酒馆后端，确认酒馆开着且「酒馆助手」扩展已启用。' : '');
        } else if (/^HTTP\s+\d/.test(raw)) {
          e.httpError = true;
          e.message = raw + '（地址 ' + url + '）。检查地址是不是少写或多写了 /v1、钥匙对不对、模型名在不在。'
            + (via ? '｜火山方舟模型名分两套：/api/v3 用带日期的（doubao-seed-2-1-pro-260915），'
              + '/api/coding/v3 用 doubao-seed-code 这种，混填必 404。' : '');
        } else if (/Failed to fetch|ERR_|NetworkError|net::|load failed/i.test(raw)) {
          e.netError = true;
          e.message = '连不上接口：' + raw + '。地址是 ' + url + '。检查网络 / 代理，以及 base 要不要带 /v1。'
            + (via ? '｜浏览器直连火山**永远不通**（它不给 CORS 头），必须走酒馆后端。' : '');
        }
        reject(e);   /* ★ v1.17b：这里是 Promise 构造器里面，要 reject，不能 throw（throw 没人接） */
      });
    });
  }
  /* ★ v1.3：解析放宽一点。以前「缺闭标签就不认」，结果模型一被截断（或者忘了收尾）就整轮白跑。
     现在按顺序试：① 完整的 <后台推演>…</后台推演>；② 只有开标签 → 拿后面的全部内容自动补上闭合；
     ③ 连标签都没有，但内容长得像推演（一堆「1.名字:」+「地点:」）→ 整段当推演，外面补上标签。
     返回 { text, soft }：soft=true 表示是补出来的（面板里会标一下，好让你知道模型有点不听话）。 */
  function parseDeduction(text) {
    var raw = String(text || '');
    /* 去掉代码块围栏（用 ` 写反引号，免得把脚本自己的模板字符串截断），免得标签被包在里面认不出 */
    raw = raw.replace(/[`]{3}[a-zA-Z]*\n?/g, '').replace(/[`]{3}/g, '');
    var strict = raw.match(/<\s*后台推演[^>]*>([\s\S]*?)<\s*\/\s*后台推演\s*>/i);
    if (strict && strict[1] && strict[1].trim()) {
      return { text: '<后台推演>\n' + strict[1].trim() + '\n</后台推演>', soft: false, path: '严格命中' };
    }
    var open = raw.match(/<\s*后台推演[^>]*>([\s\S]*)$/i);
    if (open && open[1] && open[1].trim() && /地点\s*[:：]/.test(open[1])) {
      return { text: '<后台推演>\n' + open[1].trim() + '\n</后台推演>', soft: true, path: '只有开标签，自动补闭合' };
    }
    /* 连标签都没写：内容里有一串「序号.名字:」和「地点:」就当它是推演 */
    if (/\d+\s*[.、]\s*[^\n:：]{1,12}\s*[:：]/.test(raw) && /地点\s*[:：]/.test(raw) && /正在做\s*[:：]/.test(raw)) {
      var body = raw.trim();
      if (body) return { text: '<后台推演>\n' + body + '\n</后台推演>', soft: true, path: '没写标签，按内容兜底' };
    }
    return null;
  }
  /* 老接口：只要正文（没有就 null） */
  /* ★ v1.5：把 {base}/models 拉下来，列给你点（OpenAI 兼容接口都有这个端点）
     ★ v1.24：改成走 baseOf()，跟 endpoint() 用同一套归一。 */
  function modelsUrl() {
    var b = baseOf(S.settings.base);
    if (!b) return '';
    return b + '/models';
  }

  /* ── ④ 拉模型：三级回退（抄天元录 fetchModels 的层级）──
     ① 酒馆助手的 getModelList（全局函数或 TH 方法）
        —— 它跑在助手上下文里，不受网页 CORS 限制，火山才真能"拉出列表来选"
     ② 酒馆后端 /api/backends/chat-completions/status（不依赖助手，最稳）
     ③ 浏览器直连 base + '/models'（带 CORS 的家仍然走这条）
     ★ 原本只有 ①→③，而 ① 在多数环境里根本不存在 ⇒ 直接掉到 ③
       ⇒ 火山必然被 CORS 拦 ⇒ 玩家看到「还是拉取不了」。
     ⚠ 拿不到一律 resolve(null) 静默回落，不许报错打断 ——
       玩家没开酒馆助手时，DeepSeek / 百炼 / 智谱 / Moonshot 这些带 CORS 的家照样要能拉。 */

  /* 找全局 getModelList —— 位置顺序有意为之：先把「宿主侧函数」找全，
     最后才用 TavernHelper 对象上的方法。
     ⚠ 必须判 typeof === 'function'：`typeof getModelList !== 'undefined'` 会命中
       一个同名但非函数的属性，调用时抛错、又被 catch 吞掉 ⇒ 看起来"没这个能力"。 */
  function findModelListFn() {
    var cands = [];
    try { cands.push(window); } catch (e0) {}
    var wins = thWindows();
    for (var j = 0; j < wins.length; j++) cands.push(wins[j]);
    for (var k = 0; k < cands.length; k++) {
      var w = cands[k];
      try {
        if (!w) continue;
        if (typeof w.getModelList === 'function') return { fn: w.getModelList, self: w };
      } catch (e5) {}
    }
    var TH = findTH();
    try {
      if (TH && typeof TH.getModelList === 'function') return { fn: TH.getModelList, self: TH };
    } catch (e6) {}
    return null;
  }

  function modelsViaHelper(base, key) {
    return new Promise(function (resolve) {
      if (!base) { resolve(null); return; }
      var hit = findModelListFn();
      var fn = hit && hit.fn;
      if (!fn) { resolve(null); return; }
      /* ⚠ apiurl 要传**根地址**（baseOf 归一过的），别把 /models 拼进去 ——
         助手侧自己会补；两边都补就变成 /models/models。 */
      var arg = { apiurl: base };
      if (key) arg.key = key;
      var out = null;
      try { out = fn.call(hit.self, arg); }
      catch (e3) { resolve(null); return; }
      Promise.resolve(out).then(function (r) {
        resolve(normModelArr(r));
      }, function () { resolve(null); });
    });
  }

  /* 统一清洗：字符串数组 / {id} 对象数组 / 嵌套 {data:[…]}，三种都收 */
  function normModelArr(r) {
    var arr = r;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.data)) arr = arr.data;
    if (!Array.isArray(arr)) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      var nm = String((typeof v === 'string') ? v : ((v && (v.id || v.name || v.model)) || '')).trim();
      if (nm && out.indexOf(nm) < 0) out.push(nm);
    }
    out.sort();
    return out.length ? out : null;
  }

  function modelsViaBackend(base, key) {
    if (!base) return Promise.resolve(null);
    return stHeaders().then(function (headers) {
      return stApi('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: headers,
        cache: 'no-store',
        body: JSON.stringify({
          reverse_proxy: base,          /* 原样传根地址，后端自己拼 /models */
          proxy_password: key || '',    /* 后端只认这个字段名，别写成 key */
          chat_completion_source: 'openai'
        })
      });
    }).then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.error) return null;
        return normModelArr(j.data);   /* 成功形状 { data: [ {id}, … ] }，也见过 {data:{data:[…]}} */
      })
      .catch(function () { return null; });
  }

  function modelsByHttp(base, key, noCors) {
    var url = String(base || '');
    if (!url) return Promise.resolve(null);
    if (url.charAt(url.length - 1) !== '/') url += '/';
    if (!/models\/?$/i.test(url)) url += 'models';
    return fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + key } })
      .then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) throw new Error('HTTP ' + res.status + '：' + String(txt).slice(0, 140));
          var j = null;
          try { j = JSON.parse(txt); } catch (e) { throw new Error('返回不是 JSON'); }
          return normModelArr((j && (j.data || j.models)) || []);
        });
      })
      .catch(function (err) {
        var raw = String((err && err.message) || err);
        /* CORS 被拦时浏览器只给 "Failed to fetch"，完全指不到方向。
           ★ 而且火山**根本没有 /models 这个端点**（实测 /api/v3/models → 404），
           某些环境（本地代理 / 关了 CORS 检查的 webview）会真的把 404 递进来
           ⇒ 对认得出的服务商，**不管走哪条失败路都摊出官方名单**。
           玩家要的是"能选"，不是"知道为什么不能选"。 */
        var isCors = /Failed to fetch|NetworkError|Load failed|network error/i.test(raw);
        var is404 = /HTTP\s*404/i.test(raw);
        if (!isCors && !(is404 && noCors)) return null;
        return null;
      });
  }

  /* 三级回退，最后不管哪条失败，只要认得出服务商就摊 FALLBACK_MODELS */
  function fetchModels() {
    var key = String(S.settings.key || '').trim();
    var base = baseOf(S.settings.base);
    if (!base) return Promise.reject(new Error('先填地址'));
    var url = base + '/models';
    var noCors = knownNoCors(url);
    S.lastModelVia = '';
    return modelsViaHelper(base, key).then(function (l1) {
      if (l1 && l1.length) { S.lastModelVia = '酒馆助手的 getModelList'; return l1; }
      return modelsViaBackend(base, key);
    }).then(function (l2) {
      if (l2 && l2.length) { S.lastModelVia = '酒馆后端（' + (stOrigin() || '同源') + '）'; return l2; }
      return modelsByHttp(base, key, noCors);
    }).then(function (l3) {
      if (l3 && l3.length) { S.lastModelVia = S.lastModelVia || '浏览器直连'; return l3; }
      /* 全失败 —— 认得出的服务商直接摊官方名单，别让下拉框空着 */
      if (noCors) {
        var fb = FALLBACK_MODELS[noCors] || [];
        if (fb.length) {
          S.lastModelVia = '官方文档名单（' + noCors + '）';
          toast('⚠️ ' + noCors + ' 拉不到列表（它不给 CORS 头、甚至没有 /models 端点），'
            + '已换成官方文档里的 ' + fb.length + ' 个模型名，直接选就行');
          return fb.slice();
        }
      }
      throw new Error('拉不到模型列表：这个接口没给 /models，或者被浏览器跨域拦了。手填模型名照样能用。');
    }).then(function (list) {
      S.models = list;
      S.modelsOpen = true;              /* ★ 拉回来就先摊开，想收起点一下「收起模型列表」 */
      return list;
    });
  }
  /* ★ v1.7：把 <思考> 段抽出来单独给人看（这就是你要的思维链），结果里不带它 */
  function splitThinking(text) {
    var raw = String(text || '');
    var m = raw.match(/<\s*思考[^>]*>([\s\S]*?)<\s*\/\s*思考\s*>/i);
    var thinking = m && m[1] ? m[1].trim() : '';
    if (!m) {
      var loose = raw.match(/<\s*思考[^>]*>([\s\S]*)$/i);
      if (loose && loose[1]) thinking = loose[1].trim();
    }
    var rest = raw.replace(/<\s*思考[^>]*>[\s\S]*?(<\s*\/\s*思考\s*>|$)/gi, '');
    /* ★ 模型把提示词里的说明抄回来时，整行丢掉（含「不要写/上一次毛病/一个都不能少/四栏/不少于/需要输出/自问自答…」这些特征） */
    try {
      var junkRe = /不要写|别的字|上一次毛病|一个都不能少|按顺序填完|四栏都要写|不少于|需要输出|自问自答|不要思考|禁止输出|只输出|不要正文|不要解释|复述|标准输出模板|输出格式|模板里|提示词/;
      rest = String(rest).split(/\r?\n/).filter(function (line) {
        var s = String(line || '');
        if (!s.trim()) return false;                     /* 空行也顺手去掉 */
        return !junkRe.test(s);
      }).join('\n');
    } catch (eJunk) {}
    return { thinking: thinking, rest: rest.trim() };
  }
  function extractDeduction(text) {
    var got = parseDeduction(text);
    return got ? got.text : null;
  }

  /* ────────────── 注入 + 交给核心脚本 ────────────── */
  /* ★ v1.8：把结果注入给正文 AI（只注入，不提取它的正文）。
     用途只有一个：让正文 AI 知道场外的人此刻在干什么、在往哪走。 */
  function injectToMain(text) {
    if (!S.settings || S.settings.injectOn === false) return false;
    /* ★ v1.9：原样把那段 <后台推演> 塞进提示词。正文 AI 认得这个标签，看到就不必自己再推一遍。
       不加 [外置推演] 这种前缀，免得它以为这是另一套东西。 */
    var payload = String(text || '').trim();
    if (payload.indexOf('<后台推演>') !== 0) payload = '<后台推演>\n' + payload + '\n</后台推演>';
    var ok = false;
    try {
      var s = st();
      if (s && typeof s.setExtensionPrompt === 'function') {
        s.setExtensionPrompt(INJECT_NAME, payload, 1 /* IN_CHAT */, 0 /* depth */, false, 0 /* SYSTEM */);
        ok = true;
      }
    } catch (e) {}
    if (!ok) {
      try {
        var ctx = getContext();
        if (ctx && typeof ctx.setExtensionPrompt === 'function') { ctx.setExtensionPrompt(INJECT_NAME, payload, 1, 0, false, 0); ok = true; }
      } catch (e2) {}
    }
    return ok;
  }
  function publish(text) {
    var rec = { text: text, at: Date.now(), chatId: chatId(), chatLen: chatArray().length, arc: (function () { try { return currentArcOf(); } catch (e) { return ''; } })() };
    try { window.__thGalExternalDeduction = rec; } catch (e) {}
    /* ★ v118：写钥匙必须和读钥匙同一个函数（lastKey），否则带篇章后缀之后面板就读不到了 */
    try { store(lastKey(), JSON.stringify(rec)); } catch (e2) {}
    try {
      var d = doc();
      if (d && typeof d.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        d.dispatchEvent(new CustomEvent('th-gal-external-deduction', { detail: rec }));
      }
    } catch (e3) {}
    return rec;
  }

  /* ────────────── 主流程 ────────────── */
  /* ★ v1.4：最近几次记录，面板里能一眼看出「哪次成功、命中哪种、多久、多少字」 */
  function pushHistory(rec) {
    try {
      rec.at = Date.now();
      S.history.unshift(rec);
      if (S.history.length > 8) S.history.length = 8;
    } catch (e) {}
  }
  function setStatus(status, text) {
    S.status = status;
    S.statusText = text || '';
    paintDeckButton();
  }
  function run(reason) {
    if (!S.settings) loadSettings();
    try { harvestMemory(true); } catch (e0) {}   /* ★ v1.8：推演之前先把新写的重要记忆收进来 */
    if (!S.settings.enabled) { setStatus('off', '已关闭'); return Promise.resolve(null); }
    if (S.running) return Promise.resolve(null);
    var now = Date.now();
    if (now - S.lastRunAt < clamp(S.settings.cooldownMs, 0, 60000)) { return Promise.resolve(null); }
    S.running = true;
    S.lastRunAt = now;
    S.usedStrict = false;   /* ★ v1.18c：这一轮有没有降级到严格模式 */
    setStatus('running', '推演中…');
    var prompt = '';
    try { prompt = buildPrompt(); } catch (e) { prompt = ''; }
    if (!prompt) { S.running = false; setStatus('error', '构造提示词失败'); return Promise.resolve(null); }
    /* ★ v1.18：直接把一段指定提示词发出去（严格模式用），走同一套解析与善后 */
    var attemptRaw = function (text, nth, tag) {
      S.lastPrompt = text;
      var t0 = Date.now();
      return callApi(text).then(function (raw) {
        S.lastRaw = String(raw || '');
        S.lastMs = Date.now() - t0;
        var parsed = parseDeduction(raw);
        if (!parsed) {
          pushHistory({ reason: reason, attempts: nth, ok: false, path: '严格模式也没解析出推演', rawLen: String(raw || '').length, ms: S.lastMs });
          var e = new Error('严格模式也没吐出 <后台推演>（返回 ' + String(raw || '').length + ' 字）');
          e.formatError = true;
          throw e;
        }
        parsed.attempts = nth;
        parsed.path = (parsed.path || '') + '｜' + tag;
        S.usedStrict = true;   /* ★ v1.18c：面板/状态里标出来 */
        parsed.truncated = (S.lastFinish === 'length');
        var cleaned2 = splitPacts(parsed.text);
        if (cleaned2.text) parsed.text = cleaned2.text;
        var think2 = splitThinking(S.lastRaw);
        parsed.thinking = think2.thinking || (S.lastReasoning || '');
        parsed.text = splitThinking(parsed.text).rest || parsed.text;
        return parsed;
      });
    };
    var attempt = function (extra, nth) {
      var p2 = extra ? (prompt + '\n\n【上一次你没按格式来，这次务必注意】' + extra) : prompt;
      S.lastPrompt = p2;
      var t0 = Date.now();
      return callApi(p2).then(function (raw) {
        S.lastRaw = String(raw || '');
        S.lastMs = Date.now() - t0;
        var parsed = parseDeduction(raw);
        if (!parsed) {
          pushHistory({ reason: reason, attempts: nth, ok: false, path: '没解析出推演', rawLen: String(raw || '').length, ms: S.lastMs });
          var e = new Error('模型没吐 <后台推演> 标签（第 ' + nth + ' 次，返回 ' + String(raw || '').length + ' 字，面板里能看到原样返回）');
          e.formatError = true;
          throw e;
        }
        parsed.attempts = nth;
        parsed.truncated = (S.lastFinish === 'length');   /* ★ v1.16b：接口说被截断了（null 检查之后才算） */
        /* v1.8：推演结果里不该有 <约定>；万一模型自己加了，清掉（记忆归正文 AI 的 <重要记忆> 管） */
        var cleaned = splitPacts(parsed.text);
        if (cleaned.text) parsed.text = cleaned.text;
        /* ★ v1.7：思维链单独留着看，结果里不带 */
        var think = splitThinking(S.lastRaw);
        parsed.thinking = think.thinking || (S.lastReasoning || '');
        parsed.text = splitThinking(parsed.text).rest || parsed.text;
        /* ★ v1.16：被截断就只补没写到的人，补完按名单顺序拼回去（人多的时候很常见） */
        if (parsed.truncated) {
          var have = {};
          splitSections(parsed.text).forEach(function (s) { have[s.name] = 1; });
          var missing = (S.lastTodo || []).filter(function (n) { return !have[n]; });
          if (missing.length) {
            setStatus('running', '输出被截断，正在补写 ' + missing.length + ' 个人…');
            return callApi(buildFillPrompt(missing)).then(function (raw2) {
              var two = parseDeduction(raw2);
              var merged = splitSections(parsed.text).concat(two ? splitSections(two.text) : []);
              if (merged.length > splitSections(parsed.text).length) {
                parsed.text = joinSections(merged, S.lastTodo);
                parsed.filled = missing.length;
              }
              return parsed;
            }).catch(function () { return parsed; });
          }
        }
        return parsed;
      });
    };
    var NUDGE = '只输出一个 <后台推演> 标签：第一个字符是 <，最后一个字符是 >，收尾必须是 </后台推演>；不要写任何别的话。';
    return attempt('', 1).catch(function (e1) {
      S.lastError = String((e1 && e1.message) || e1);
      /* ★ v1.17：连不上 / 状态码错就别再重试了，白等一个超时；只有「格式不对」才再要一次。 */
      if (e1 && (e1.netError || e1.httpError)) throw e1;
      /* ★ v1.18：先看它是不是在「念经」（复述提示词 / 自问自答 / 压根没写标签）。
         是的话别再用同一份长提示词去要，直接换成严格模式那份短提示词，成功率高得多。 */
      var rambled = isRambling(S.lastRaw);
      if (rambled) {
        setStatus('running', '模型在自问自答，换严格模式再要一次…');
        toast('🎲 模型没按格式来（' + rambled + '），已换成严格模式重试');
        return attemptRaw(buildStrictPrompt(rambled), 2, '严格模式');
      }
      setStatus('running', '格式不对，再要一次…');
      return attempt(NUDGE, 2);
    }).then(function (parsed) {
      var got = parsed.text;
      S.lastParsed = parsed;
      S.lastText = got;
      var guarded = dropSkipped(got, S.lastSkip || []);   /* ★ v1.9：把混进来的在场的人拦掉 */
      if (guarded.dropped.length) {
        if (!guarded.text) {
          S.lastError = '推演把在场的人全写进去了，已作废';
          setStatus('error', '这次推演全是场的人，已作废');
          toast('⚠ 这次推演把在场的人全写进去了，结果作废（没有注入、没有覆盖）');
          return null;
        }
        got = guarded.text;
        parsed.text = got;
        S.lastText = got;
        S.lastParsed = parsed;
        toast('⚠ 推演里混进了在场的人，已经拦下：' + guarded.dropped.join('、'));
      }
      harvestMemory(true);   /* ★ v1.8：把正文 AI 写的 <重要记忆> 收进来（去重） */

      pushHistory({ reason: reason, attempts: parsed.attempts, ok: true, path: (parsed.path || '') + (parsed.truncated ? '｜截断补写' : ''), soft: !!parsed.soft, rawLen: S.lastRaw.length, textLen: got.length, ms: S.lastMs });
      S.lastAt = Date.now();
      publish(got);
      /* ★ v1.7：不再往提示词里注入任何东西。结果直接交给核心脚本（publish 已经写好了）。 */
      S.lastInjected = got;
      var injected = injectToMain(got);
      setStatus('done', (S.usedStrict ? '严格模式｜' : '') + (injected ? '已推演并注入' : '已推演（未注入）')
        + (parsed.truncated ? '（输出被截断' + (parsed.filled ? '，已补写 ' + parsed.filled + ' 人' : '，建议调大最多输出') + '）' : '')
        + ' ' + new Date(S.lastAt).toLocaleTimeString());
      toast('🎲 推演完成：' + (parsed.path || '命中') + '，' + (S.lastMs / 1000).toFixed(1) + ' 秒，' + got.length + ' 字'
        + (injected ? '，已注入给正文 AI' : '（注入关着）'));
      renderPanel();
      return got;
    }).catch(function (err) {
      S.lastError = String((err && err.message) || err);
      setStatus('error', S.lastError.slice(0, 60));
      toast('🎲 后台推演失败：' + S.lastError + (S.lastRaw ? '（面板里有模型原样返回，看一眼就知道问题在哪）' : ''));
      renderPanel();
      return null;
    }).then(function (v) {
      S.running = false;
      return v;
    });
  }

  /* ────────────── 监听切场景 ────────────── */
  function shellNode() {
    var d = doc();
    if (!d) return null;
    try { return d.getElementById('th-gal-shell-root') || d.querySelector('#th-gal-shell-root'); } catch (e) { return null; }
  }
  function sceneKey() {
    var n = shellNode();
    if (!n) return '';
    try {
      return [n.getAttribute('data-scene') || '', n.getAttribute('data-current-house') || '', n.getAttribute('data-room') || ''].join('|');
    } catch (e) { return ''; }
  }
  /* ★ v1.26：换了聊天之后，不许把上一条聊天的推演结果 / 提示词 / 历史 / 记忆指纹带过来。
     记录本身是按 chatId 存的，窗口里那份是给核心脚本看的，换聊天就得丢掉。
     ★ v118：换【篇章】也算换局。同一个存档里从夏越村切到公寓，chatId 一个字节都不变，
     以前这里 return false，于是内存里 S.memory / S.lastText 全是夏越村的，
     面板上「上次推演」还写着村里的人和事 —— 键换了、内存没换，等于白改。
     现在把「存档 id + 篇章」一起当指纹，任一变就重置。 */
  var _lastChatId = null;
  var _lastArcSeen = null;
  function watchChatSwitch() {
    var now = chatId();
    var arcNow = '';
    try { arcNow = currentArcOf(); } catch (eA) { arcNow = ''; }
    /* 第一次只记基准。两个指纹要一起记，不然刚启动那一下 arcNow 还没读出来，
       下一拍读出来了就会被当成"换篇章"白重置一次。 */
    if (_lastChatId === null) { _lastChatId = now; _lastArcSeen = arcNow; return false; }
    var arcChanged = (_lastArcSeen !== null && arcNow && _lastArcSeen !== arcNow);
    if (now === _lastChatId && !arcChanged) return false;
    _lastChatId = now;
    _lastArcSeen = arcNow;
    try { window.__thGalExternalDeduction = null; } catch (e) {}
    S.lastParsed = null;
    S.lastPrompt = '';
    S.previewPrompt = '';
    S.lastRaw = '';
    S.lastReasoning = '';
    S.lastText = '';
    S.lastError = '';
    S.lastInjected = '';
    S.lastSceneKey = '';
    S.history = [];
    S.running = false;
    S.status = 'idle';
    S.statusText = '待机';
    S.memorySeenSig = '';
    /* ★ v118：换篇章后「上一次是哪一楼推的」也要归零，否则新篇章第一楼推进时
       advanceKey 和旧的一样就被当成"没变"，白白漏推一次。 */
    S.lastAdvanceKey = '';
    try { loadMemory(); } catch (e2) {}          /* 记忆是按「存档@篇章」存的，重新读这一份 */
    /* ★ v118：把本篇章自己上次的推演结果读回来（不是上一篇的、也不是别的存档的）。
       用户明确要求「同一个存档就不清，可以接上」，所以这里不是清空而是一直读到本篇为止。 */
    try {
      var rec0 = JSON.parse(store(lastKey()) || 'null');
      if (rec0 && rec0.text) { S.lastText = rec0.text; S.lastAt = rec0.at || 0; }
    } catch (e3) {}
    if (S.panel && !S.panel.hidden) { try { renderPanel(); } catch (e4) {} }
    try { paintDeckButton(); } catch (e5) {}
    return true;
  }

  /* ★ 推进信号：最新一条 AI 消息里 <UpdateVariable> 块已经写完（出现 </UpdateVariable>）
     就认为“这一轮推进结束了”，用「楼层号 + 长度 + 尾巴」做指纹，同一楼只推一次。 */
  function advanceKey() {
    try {
      /* ★ v1.24：原来这里用 `HOST.SillyTavern`，而全文没有 HOST 变量
         ⇒ ReferenceError 被 catch 吞掉 ⇒ 这段**永远拿不到 ctx**
         ⇒ advanceKey 恒为 '' ⇒ 「每轮推进推一次」这个触发条件从来没生效过
         （只能靠切场景那条路推）。改用 st()，它已经把 window / parent / top 都找过了。 */
      var ctx = null;
      try {
        var _st = st();
        if (_st && typeof _st.getContext === 'function') ctx = _st.getContext();
      } catch (e1) {}
      if (!ctx) { try { if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') ctx = window.SillyTavern.getContext(); } catch (e2) {} }
      var chat = ctx && ctx.chat;
      if (!chat || !chat.length) return '';
      for (var i = chat.length - 1; i >= 0; i--) {
        var m = chat[i];
        if (!m || m.is_user || !m.mes) continue;
        var t = String(m.mes);
        /* 变量块没写完就不算推进（等它写完再说） */
        if (t.indexOf('</UpdateVariable>') === -1 && t.indexOf('</JSONPatch>') === -1) return '';
        return i + '#' + t.length + '#' + t.slice(-24);
      }
    } catch (e) {}
    return '';
  }

  function watch() {
    if (S.watcher) return;
    S.lastAdvanceKey = S.lastAdvanceKey || '';
    S.watcher = setInterval(function () {
      /* ① 场景变化只用来记「这一步从哪走到哪」（写进提示词用），不再触发推演 */
      try {
        var key = sceneKey();
        if (key) {
          if (S.lastSceneKey === '') { S.lastSceneKey = key; }
          else if (key !== S.lastSceneKey) {
            var parts = key.split('|');
            var label = parts[0] === 'single-room'
              ? (({ bl: '春日大平家', tl: '山上左寻家', xn: '西村太郎家', jc: '吉川大田家' })[parts[1]] || '宅邸') + '·' +
                (({ living: '客厅', kitchen: '厨房', bath: '浴室', room_tl: '主卧', room_tr: '次卧1', room_bl: '次卧2', room_br: '次卧3', yard: '前院' })[parts[2]] || parts[2])
              : parts[0];
            if (!S.lastMove || S.lastMove.to !== label) S.lastMove = { from: (S.lastMove && S.lastMove.to) || label, to: label, at: Date.now() };
            S.lastSceneKey = key;
          }
        }
      } catch (e) {}

      /* ② 推演时机（互斥）：
         · trigger = 'advance'（默认）：每次「推进」（变量块写完的那一楼）推一次
         · trigger = 'scene'：每次切换场景推一次（老行为） */
      if (S.settings.trigger === 'scene') {
        var skey = sceneKey();
        if (!skey) return;
        if (S.lastSceneKeyForRun === '' || S.lastSceneKeyForRun == null) { S.lastSceneKeyForRun = skey; return; }   /* 基准 */
        if (skey === S.lastSceneKeyForRun) return;
        S.lastSceneKeyForRun = skey;
        if (!S.settings.enabled) return;   /* ★「自动推演」开关已取消：启用 + 时机二选一就够了 */
        if (S.pendingTimer) clearTimeout(S.pendingTimer);
        S.pendingTimer = setTimeout(function () { S.pendingTimer = null; run('切场景'); }, clamp(S.settings.debounceMs, 0, 10000));
        return;
      }
      var adv = advanceKey();
      if (!adv) return;
      if (S.lastAdvanceKey === '') { S.lastAdvanceKey = adv; return; }   /* 第一次只记基准 */
      if (adv === S.lastAdvanceKey) return;
      S.lastAdvanceKey = adv;
      if (!S.settings.enabled) return;   /* ★「自动推演」开关已取消：启用 + 时机二选一就够了 */
      if (S.pendingTimer) clearTimeout(S.pendingTimer);
      S.pendingTimer = setTimeout(function () { S.pendingTimer = null; run('推进'); }, clamp(S.settings.debounceMs, 0, 10000));
    }, 700);
  }
  /* ────────────── 悬浮球 + 面板 ────────────── */
  /* ══ ★ v163：整套换成和风配色 —— 与「小地图 / 村历」同一套语言 ══
     暗墨褐和纸底 + 细金线 + 暖米金字 + 朱印。
     以前是 slate 蓝灰 + 粉标题（#f9a8d4），和游戏里其它面板完全两个世界。 */
  var STYLE = [
    /* ── 面板本体：和纸底 ── */
    '#th-deduce-panel{position:fixed;right:14px;top:12%;z-index:2147483201;width:352px;max-width:92vw;max-height:74vh;overflow:auto;',
    'background:',
    'repeating-linear-gradient(90deg,rgba(255,236,180,.013) 0 1px,transparent 1px 3px),',
    'linear-gradient(158deg,rgba(20,17,13,.985),rgba(11,9,7,.99));',
    'border:1px solid rgba(252,211,77,.30);border-radius:5px;',
    'color:#e6d7b4;padding:0 0 10px;',
    'font-size:12px;line-height:1.62;',
    'box-shadow:0 14px 40px rgba(0,0,0,.72),inset 0 0 60px rgba(0,0,0,.42);',
    'scrollbar-width:thin;scrollbar-color:rgba(252,211,77,.28) transparent}',
    '#th-deduce-panel::-webkit-scrollbar{width:6px}',
    '#th-deduce-panel::-webkit-scrollbar-thumb{background:rgba(252,211,77,.26);border-radius:3px}',

    /* ── 标题：匾额题字 ── */
    '#th-deduce-panel h4{margin:14px 10px 6px;font-size:12.5px;font-weight:700;color:#f6e3b4;',
    'letter-spacing:2px;padding-bottom:5px;border-bottom:1px solid rgba(252,211,77,.20)}',
    '#th-deduce-panel>h4:first-child{margin-top:0;padding:11px 12px 9px;',
    'font-size:14px;letter-spacing:3px;',
    'background:linear-gradient(90deg,rgba(58,44,18,.95),rgba(18,16,13,.97));',
    'border-bottom:1px solid rgba(252,211,77,.26);border-radius:4px 4px 0 0;color:#f6e3b4}',

    /* ── 行 ── */
    '#th-deduce-panel .row{display:flex;gap:6px;align-items:center;margin:5px 10px;flex-wrap:wrap}',

    /* ── 分区卡片：金线框 + 极淡渐变 ── */
    '#th-deduce-panel .th-deduce-card{margin:7px 10px;padding:8px 10px 10px;',
    'border:1px solid rgba(252,211,77,.18);border-radius:4px;',
    'background:linear-gradient(170deg,rgba(38,33,26,.72),rgba(20,17,13,.82))}',
    '#th-deduce-panel .th-deduce-card h4{margin:0 0 7px;padding-bottom:5px;',
    'border-bottom:1px dashed rgba(252,211,77,.20)}',

    /* ── 分区标题行 + 「说明」按钮 ── */
    '#th-deduce-panel .th-deduce-hrow{display:flex;align-items:center;gap:7px;margin:0 0 7px}',
    '#th-deduce-panel .th-deduce-hrow h4{flex:1 1 auto;min-width:0;margin:0;padding:0;border:0}',
    '#th-deduce-panel .th-deduce-hbtn{flex:0 0 auto;',
    'border:1px solid rgba(252,211,77,.24);background:rgba(26,23,18,.9);',
    'color:#9c8d70;border-radius:3px;padding:1px 7px;font-size:10.5px;',
    'cursor:pointer;font-weight:600;letter-spacing:.5px;line-height:1.5}',
    '#th-deduce-panel .th-deduce-hbtn:hover{background:rgba(92,70,30,.72);color:#f6e3b4}',
    '#th-deduce-panel .th-deduce-hbtn.is-on{background:rgba(160,122,42,.8);border-color:#e2b857;color:#1a1408;font-weight:800}',

    /* ── 说明块：默认折叠 ── */
    '#th-deduce-panel .th-deduce-note{margin:2px 0 7px;padding:6px 9px;',
    'border-left:2px solid rgba(252,211,77,.34);',
    'background:rgba(252,211,77,.045);border-radius:0 3px 3px 0;',
    'color:#a9997a;font-size:11px;line-height:1.66}',
    '#th-deduce-panel .th-deduce-note[hidden]{display:none!important}',
    '#th-deduce-panel .th-deduce-note b{color:#d9c79a;font-weight:700}',

    /* ── 勾选胶囊 ── */
    '#th-deduce-panel .th-deduce-chip{display:inline-flex;align-items:center;gap:5px;',
    'padding:3px 10px;margin:2px 4px 2px 0;',
    'border:1px solid rgba(252,211,77,.22);border-radius:999px;',
    'background:rgba(26,23,18,.85);cursor:pointer;color:#d9c79a;font-size:11.5px}',
    '#th-deduce-panel .th-deduce-chip:hover{background:rgba(92,70,30,.55);color:#f6e3b4}',
    '#th-deduce-panel .th-deduce-chip input{margin:0;accent-color:#b8452f}',

    /* ── 输入框 ── */
    '#th-deduce-panel input[type=text],#th-deduce-panel input[type=password],#th-deduce-panel input[type=number],#th-deduce-panel textarea{',
    'flex:1;min-width:0;background:rgba(8,7,5,.85);color:#e6d7b4;',
    'border:1px solid rgba(252,211,77,.22);border-radius:3px;',
    'padding:4px 7px;font-size:11.5px;outline:none}',
    '#th-deduce-panel input:focus,#th-deduce-panel textarea:focus{border-color:rgba(226,184,87,.72);',
    'box-shadow:0 0 0 2px rgba(252,211,77,.10)}',

    /* ── 按钮 ── */
    '#th-deduce-panel button{background:rgba(26,23,18,.92);',
    'border:1px solid rgba(252,211,77,.24);color:#d9c79a;',
    'border-radius:3px;padding:4px 9px;cursor:pointer;font-size:11.5px;',
    'font-weight:600;letter-spacing:.4px;transition:background .12s,color .12s,border-color .12s}',
    '#th-deduce-panel button:hover{background:rgba(92,70,30,.72);color:#f6e3b4;border-color:rgba(252,211,77,.42)}',
    /* 主行动键：朱印 */
    '#th-deduce-panel button.primary{background:rgba(184,69,47,.82);border-color:#c9573c;color:#ffeede;font-weight:800}',
    '#th-deduce-panel button.primary:hover{background:#b8452f;color:#fff}',

    /* ── 输出框：墨底 ── */
    '#th-deduce-panel .out{white-space:pre-wrap;word-break:break-word;max-height:210px;overflow:auto;',
    'background:rgba(6,5,4,.9);border:1px solid rgba(252,211,77,.16);',
    'border-radius:3px;padding:7px 9px;margin-top:6px;',
    'color:#cdbb96;font-size:11px;line-height:1.62}',
    '#th-deduce-panel .muted{color:#8d7f66}',
    '#th-deduce-panel .stat{color:#cdbb96;margin:3px 0}',

    /* ── details：默认折叠块 ── */
    '#th-deduce-panel details{margin:5px 0;border:1px solid rgba(252,211,77,.16);',
    'border-radius:3px;padding:5px 8px;background:rgba(8,7,5,.55)}',
    '#th-deduce-panel summary{cursor:pointer;font-size:11.5px;color:#d9c79a;outline:none;',
    'font-weight:600;letter-spacing:.3px}',
    '#th-deduce-panel summary:hover{color:#f6e3b4}',
    '#th-deduce-panel details[open]>summary{color:#f6e3b4;margin-bottom:4px}',
    '#th-deduce-panel details .out{max-height:300px}',
  ].join('');

  function injectStyle() {
    var d = doc();
    if (!d || d.getElementById('th-deduce-style')) return;
    var s = d.createElement('style');
    s.id = 'th-deduce-style';
    s.textContent = STYLE;
    (d.head || d.body).appendChild(s);
  }
  /* ★ v1.1：入口在游戏按钮栏那一排（核心脚本加的 .th-gal-btn-deduce）。
     这里只负责：把状态画到那颗按钮上，以及开关面板。
     以前那个悬浮球撤了（全屏时容易被壳子盖住，也占地方）。 */
  function deckButton() {
    var d0 = doc();
    if (!d0) return null;
    try { return d0.querySelector('.th-gal-btn-deduce'); } catch (e) { return null; }
  }
  /* ★ v1.2：这颗按钮由我们自己绑。
     核心脚本也会给它接一次线（它那层可能拿不到我们），两边谁最后绑上都行；
     我们的看门狗每 2 秒对一次，被覆盖了就重新绑回来。 */
  function bindDeckButton() {
    var btn = deckButton();
    if (!btn) return false;
    if (btn.onclick === S.handler && S.handler) return true;
    var h = function (ev) {
      try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) {}
      togglePanel();
    };
    S.handler = h;
    btn.onclick = h;
    return true;
  }
  /* 跨窗口兜底：核心脚本拿不到 ThDeduce 时会往界面文档上发这个事件 */
  function listenOpenEvent() {
    var d0 = findUiDoc();
    if (!d0 || d0.__thDeduceHooked) return;
    try {
      d0.__thDeduceHooked = true;
      d0.addEventListener('th-gal-deduce-open', function () { togglePanel(); });
    } catch (e) {}
  }
  function paintDeckButton() {
    if (!S.settings) loadSettings();
    var btn = deckButton();
    if (!btn) return;
    var label = '🎲 推演';
    if (!S.settings.enabled) label = '🎲 推演:关';
    else if (S.status === 'running') label = '🎲 推演中…';
    else if (S.status === 'error') label = '🎲 推演:错';
    else if (S.status === 'done') label = '🎲 推演:好';
    if (btn.textContent !== label) btn.textContent = label;
    try {
      btn.classList.remove('is-running', 'is-done', 'is-error', 'is-off');
      if (!S.settings.enabled) btn.classList.add('is-off');
      else if (S.status === 'running') btn.classList.add('is-running');
      else if (S.status === 'error') btn.classList.add('is-error');
      else if (S.status === 'done') btn.classList.add('is-done');
    } catch (e) {}
    btn.title = '后台推演外置 AI：' + (S.settings.enabled ? (S.statusText || '待机') : '已关闭') + '（点一下开面板）';
    if (btn.onclick !== S.handler) bindDeckButton();
  }
  function togglePanel() {
    var d = doc();
    if (!d) return;
    if (!S.panel || !d.getElementById('th-deduce-panel')) {
      var p = d.createElement('div');
      p.id = 'th-deduce-panel';
      p.hidden = true;
      d.body.appendChild(p);
      S.panel = p;
    }
    S.panel.hidden = !S.panel.hidden;
    if (!S.panel.hidden) renderPanel();
  }
  /* ★ v1.25 面板美化：h4 起新卡片，后面的兄弟节点都收进这张卡；勾选框做成胶囊
     ★ v163：解释说明类（.th-deduce-help）全部收进本卡的 .th-deduce-note，
              默认折叠；卡标题右边挂一颗「说明」按钮来开合。
              面板上只留「能操作的东西」和「当前数据」，一眼看得清。 */
  function beautifyDeducePanel(root) {
    try {
      if (!root || !root.childNodes) return;
      var doc = root.ownerDocument || document;
      var kids = [];
      for (var i = 0; i < root.childNodes.length; i++) kids.push(root.childNodes[i]);
      var card = null;
      /* ★ v163：第一张卡之前的散节点（状态几行）也裹一层，不然贴在匾额下面很乱。
         **必须是局部变量**：root 就是 #th-deduce-panel，它在 renderPanel 里被复用；
         缓存在 root 上会指向上一轮已经脱离文档的旧节点，新节点 append 过去就整块消失。 */
      var topWrap = null;
      kids.forEach(function (node) {
        if (node.nodeType === 1 && node.tagName === 'H4') {
          card = doc.createElement('div');
          card.className = 'th-deduce-card';
          root.insertBefore(card, node);
          card.appendChild(node);
        } else if (card) {
          card.appendChild(node);
        } else if (node.nodeType === 1) {
          if (!topWrap) {
            topWrap = doc.createElement('div');
            topWrap.className = 'th-deduce-card';
            root.insertBefore(topWrap, node);
          }
          topWrap.appendChild(node);
        }
      });

      /* ══ ★ v163：每张卡把说明收进折叠块 ══ */
      var cards = root.querySelectorAll('.th-deduce-card');
      for (var ci = 0; ci < cards.length; ci++) {
        var cc = cards[ci];
        var helps = cc.querySelectorAll('.th-deduce-help');
        if (!helps.length) continue;

        /* 建说明块，把 help 节点全部搬进去 */
        var note = doc.createElement('div');
        note.className = 'th-deduce-note';
        note.hidden = true;
        for (var hi = 0; hi < helps.length; hi++) {
          var h = helps[hi];
          /* help 里如果已经包了 div.stat / span，就取它的内容 */
          note.appendChild(h);
        }

        /* 找到这张卡的 h4，把它和按钮塞进一行 */
        var title = cc.querySelector('h4');
        if (!title) { cc.insertBefore(note, cc.firstChild); continue; }

        var hrow = doc.createElement('div');
        hrow.className = 'th-deduce-hrow';
        cc.insertBefore(hrow, title);
        hrow.appendChild(title);

        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'th-deduce-hbtn';
        btn.textContent = '· 说明 ·';
        btn.title = '展开 / 收起这一段的说明';
        btn.onclick = (function (n, b) {
          return function (ev) {
            try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (eS) {}
            n.hidden = !n.hidden;
            b.classList.toggle('is-on', !n.hidden);
            b.textContent = n.hidden ? '· 说明 ·' : '· 收起 ·';
          };
        })(note, btn);
        hrow.appendChild(btn);

        /* 说明块插在标题行之后 */
        if (hrow.nextSibling) cc.insertBefore(note, hrow.nextSibling);
        else cc.appendChild(note);
      }

      var labels = root.querySelectorAll('label');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].querySelector && labels[j].querySelector('input[type=checkbox]')) {
          labels[j].classList.add('th-deduce-chip');
        }
      }
    } catch (e) {}
  }
  function renderPanel() {
    if (!S.settings) loadSettings();
    var p = S.panel || (doc() && doc().getElementById('th-deduce-panel'));
    if (!p || p.hidden) return;
    var st2 = S.settings;
    var hitLabel = S.lastParsed ? (S.lastParsed.path || '命中') + (S.lastParsed.soft ? ' ⚠' : ' ✅') + (S.lastParsed.attempts > 1 ? '（第 ' + S.lastParsed.attempts + ' 次）' : '') : '还没推演过';
    var html = '';
    html += '<h4>🎲 后台推演外置 AI</h4>';
    html += '<div class="stat">状态：' + escapeHtml(st2.enabled ? (S.statusText || '待机') : '已关闭') + '</div>';
    html += '<div class="stat">模型：' + escapeHtml(st2.model) + (st2.key ? '' : '（还没填钥匙）') + (S.usedStrict ? '　（上一轮走了严格模式）' : '') + '</div>';
    html += '<div class="stat">最多输出：' + escapeHtml(String(st2.maxTokens)) + ' token' + (Number(st2.maxTokens) < 4000 ? '　<b style="color:#e2b857">⚠ 偏小</b>' : '') + '</div>';
    /* ★ v163：这条建议收进「说明」折叠块 */
    if (Number(st2.maxTokens) < 4000) {
      html += '<div class="th-deduce-help">全场 15 人同时推演时，建议把「最多输出」调到 <b>6000 以上</b>；人特别多就 <b>8000</b>。调小了输出会被截断，脚本会尽量补写，但漏人难免。</div>';
    }
    if (S.lastParsed && S.lastParsed.truncated) {
      html += '<div class="stat">⚠ 上一次的输出被截断了' + (S.lastParsed.filled ? '，已经自动补写 ' + S.lastParsed.filled + ' 个人' : '')
        + '。人多的时候把「最多输出」调到 8000 更稳。</div>';
    }
    if (st2.devMode && S.lastParsed && S.lastParsed.thinking) {
      html += '<details><summary>🧠 模型自带的思考（' + S.lastParsed.thinking.length + ' 字）</summary>'
        + '<div class="out">' + escapeHtml(S.lastParsed.thinking) + '</div></details>';
    }
    html += '<div class="stat">上次：' + (S.lastAt ? new Date(S.lastAt).toLocaleTimeString() : '无')
      + '　耗时 ' + (S.lastMs ? (S.lastMs / 1000).toFixed(1) + 's' : '—')
      + '　命中 ' + escapeHtml(hitLabel) + '</div>';
    /* ★ v165i：火山 / 豆包这类「默认开深度思考」的服务商，如果这轮走的是
       没法透传 thinking 的通道，就把话说出来 —— 否则玩家看到的是
       「推演出来的东西像模型的内心独白」，根本想不到是这个原因。 */
    try {
      var __tOff = window.__thDeduceThinkOff;
      if (__tOff === 'off') {
        html += '<div class="stat">⚠ 这一轮走的是「酒馆后端 openai 源」，**没能关掉深度思考**。'
          + '豆包 2.1 这类模型会把 max_tokens 花在思维链上，正文可能被挤成空串或者只剩草稿。'
          + '要根治：在酒馆里把「自定义(OpenAI 兼容)」的地址和 Key 也填一份（源选 custom），'
          + '脚本会优先走那条能透传 thinking 的路。</div>';
      }
    } catch (eTO) {}
    html += '<div class="row"><label><input type="checkbox" id="th-deduce-enabled"' + (st2.enabled ? ' checked' : '') + '> 启用</label>' +
      '<label><input type="checkbox" id="th-deduce-inject"' + (st2.injectOn === false ? '' : ' checked') + '> 注入给正文 AI</label>' +
      '<label><input type="checkbox" id="th-deduce-blurbs"' + (st2.useBlurbs === false ? '' : ' checked') + '> 带上人物速查</label>' +
      '<label><input type="checkbox" id="th-deduce-memtoast"' + (st2.memoryToast === false ? '' : ' checked') + '> 收录记忆时提示</label></div>';
    /* ★ 方案 A：一键用当前酒馆模型（懒得填 API 时勾这个） */
    html += '<div class="row"><label><input type="checkbox" id="th-deduce-hostmodel"' + (st2.useHostModel ? ' checked' : '') + '> 🔌 用当前酒馆模型推演（不用填 API）</label></div>';
    /* ★ 推演时机：两个按钮互斥（默认：每次推进推一次） */
    html += '<div class="row" style="gap:6px"><span style="opacity:.8">推演时机：</span>' +
      '<button type="button" id="th-deduce-tr-adv">▶ 每次推进推一次</button>' +
      '<button type="button" id="th-deduce-tr-scene">🗺 每次切场景推一次</button></div>';
    html += '<div class="row"><button type="button" id="th-deduce-dev">' + (st2.devMode ? '🛠 开发者模式：开' : '🛠 开发者模式：关') + '</button>'
      + '</div>';
    /* ★ v1.19：这些都给开发者模式看着用，平时收起来 */
    if (st2.devMode) {
    /* ★ v1.4：把「这一次到底发生了什么」全摊开 */
    html += '<h4>这一轮发生了什么（开发者）</h4>';
    /* ★ v1.12：没发过请求的时候，现算一份当预览（原来这里是一片空白，看着像坏了） */
    var shownPrompt = S.lastPrompt;
    var previewNote = '';
    if (!shownPrompt) {
      try {
        shownPrompt = buildPrompt();
        S.previewPrompt = shownPrompt;
        previewNote = '　（预览：这就是下一次推演会发出去的内容）';
      } catch (e) {
        S.previewPrompt = '';
        previewNote = '　（预览失败：' + escapeHtml(String((e && e.message) || e)) + '）';
      }
    } else {
      S.previewPrompt = S.lastPrompt;
    }
    /* ★ v1.14：把「这条 prompt 里到底有什么」摊在面板上，省得以为内容丢了 */
    html += '<h4>两条消息分别是什么</h4>';
    html += '<div class="th-deduce-help">只发一条消息：<b>user（提示词）</b>。不发送 system / 预设 —— 所以推演 AI 完全不受你酒馆里的预设影响。</div>';
    if (shownPrompt) {
      var heads = (shownPrompt.match(/【[^】]{2,24}】/g) || []).map(function (h) { return h.replace(/[【】]/g, ''); });
      var idx = heads.filter(function (x, i, a) { return a.indexOf(x) === i; });
      html += '<div class="stat">user（提示词 ' + shownPrompt.length + ' 字）里有 ' + idx.length + ' 段：' + escapeHtml(idx.join(' · ')) + '</div>';
      html += '<div class="th-deduce-help">固定带：AI 身份 · 五步走 · &lt;思考&gt; 写法 · 当前局面 · 谁该推演与谁不许输出 · 每个人的性格与好感度 / 恶堕值 · 上一轮推演 · 重要记忆 · 地图与走法 · 输出格式模板 · 56 个固值地点 · 字段规矩</div>';
    }
    html += '<details' + (shownPrompt ? ' open' : '') + '><summary>📤 发出去的提示词（' + (shownPrompt ? shownPrompt.length : 0) + ' 字）'
      + escapeHtml(previewNote) + '　·　不含正文</summary>'
      + '<div class="out">' + (shownPrompt ? escapeHtml(shownPrompt) : '<span class="muted">构造失败，看上面的原因</span>') + '</div>'
      + '<div class="row"><button type="button" id="th-deduce-copyprompt">复制提示词</button>'
      + '<button type="button" id="th-deduce-refresh">刷新预览</button></div></details>';
    html += '<details open><summary>📥 模型原样返回（' + (S.lastRaw ? S.lastRaw.length : 0) + ' 字）　命中：' + escapeHtml(hitLabel) + '</summary>'
      + '<div class="out">' + (S.lastRaw ? escapeHtml(S.lastRaw) : '<span class="muted">还没有返回；点下面的「立即推演」试试</span>') + '</div>'
      + (S.lastRaw ? '<div class="row"><button type="button" id="th-deduce-copyraw">复制原样返回</button></div>' : '') + '</details>';
    html += '<details><summary>📌 重要记忆（' + ((S.memory || []).length) + ' 条，永久；面板上方可增删）</summary>'
      + '<div class="out">' + (((S.memory || []).length) ? escapeHtml((S.memory || []).map(function (x) { return '- ' + x; }).join('\n')) : '<span class="muted">暂无</span>') + '</div></details>';
    html += '<details><summary>🗺 地图（发给 AI 的路径链）</summary><div class="out">' + escapeHtml(mapText()) + '</div></details>';
    html += '<details><summary>✅ 解析出来的推演（交给核心脚本的那份，' + (S.lastText ? S.lastText.length : 0) + ' 字）</summary>'
      + '<div class="out">' + (S.lastText ? escapeHtml(S.lastText) : '<span class="muted">还没有</span>') + '</div>'
      + (S.lastText ? '<div class="row"><button type="button" id="th-deduce-copy">复制推演</button></div>' : '') + '</details>';
    html += '<details><summary>📊 最近 ' + S.history.length + ' 次记录</summary>';
    if (!S.history.length) html += '<div class="out"><span class="muted">还没有记录</span></div>';
    else {
      html += '<div class="out">';
      S.history.forEach(function (h, i) {
        html += (i + 1) + '. ' + new Date(h.at).toLocaleTimeString()
          + '　' + (h.ok ? '✅' : '❌') + ' ' + escapeHtml(h.path || '')
          + '　' + (h.ok ? ((h.textLen || 0) + ' 字') : ('返回 ' + (h.rawLen || 0) + ' 字'))
          + '　' + ((h.ms || 0) / 1000).toFixed(1) + 's'
          + '　' + escapeHtml(h.reason || '') + (h.attempts > 1 ? '（第 ' + h.attempts + ' 次）' : '') + '\n';
      });
      html += '</div>';
    }
    html += '</details>';
    html += '<div class="row"><button type="button" id="th-deduce-wide">' + (S.wide ? '缩小面板' : '放大面板') + '</button></div>';
    }   /* /开发者：这一轮发生了什么 */

    /* ★ v1.8：重要记忆 */
    html += '<h4>重要记忆（只留最近 ' + memMax() + ' 条，满了从最旧的开始删）</h4>';
    html += '<div class="row" style="gap:6px"><span class="muted">保留条数</span><input type="number" id="th-deduce-memmax" min="1" max="20" value="' + memMax() + '" style="max-width:65px"><span class="muted">条（默认 5，可填 1~20）</span></div>';
    html += '<div class="th-deduce-help">一轮只收一条、每条最多 <b>' + MEMORY_MAXLEN + ' 字</b>；自动收录默认不弹提示（上面那个勾可以打开）。</div>';
    html += '<div class="th-deduce-help">只读<b>最新那一条 AI 回复</b>里的 &lt;重要记忆&gt;，更早的 AI 楼层不再回头看'
      + (S.memoryFloor ? '。上一次收是第 ' + (S.memoryFloor.index + 1) + ' 楼（聊天一共 ' + S.memoryFloor.total + ' 楼）。' : '。')
      + '</div>';
    html += '<div class="out">' + (((S.memory || []).length) ? escapeHtml((S.memory || []).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n')) : '<span class="muted">还没有。正文 AI 写 <重要记忆> 就会自动收录。</span>') + '</div>';
    html += '<div class="row"><input type="text" id="th-deduce-mem-add" placeholder="手动加一条记忆，回车"><button type="button" id="th-deduce-mem-save">＋ 添加</button></div>';
    html += '<div class="row"><button type="button" id="th-deduce-mem-harvest">📖 现在扫一遍正文里的 <重要记忆></button>'
      + '<button type="button" id="th-deduce-mem-clear">清空全部记忆</button></div>';
    html += '<div class="row"><span class="muted">删单条：点下面的编号</span>';
    (S.memory || []).forEach(function (x, i) {
      html += '<button type="button" class="th-deduce-mem-del" data-i="' + i + '">✕ ' + (i + 1) + '</button>';
    });
    html += '</div>';

    html += '<h4>接口</h4>';
    html += '<div class="row"><span class="muted">地址</span><input type="text" id="th-deduce-base" value="' + escapeHtml(st2.base) + '" placeholder="https://…/v1"></div>';
    html += '<div class="row"><span class="muted">钥匙</span><input type="password" id="th-deduce-key" value="' + escapeHtml(st2.key) + '" placeholder="sk-…"></div>';
    if (st2.devMode) {
      html += '<div class="th-deduce-help">地点表：<b>' + (loadPlaces().length || 0) + ' 个固值</b>（来源：' + escapeHtml(PLACE_SOURCE || '还没读') + '）</div>';
      html += '<div class="th-deduce-help">会打这个地址：<b>' + escapeHtml(endpoint() || '（还没填地址）') + '</b></div>';
    }
    if (S.lastTest) html += '<div class="stat">上次测试：' + escapeHtml(S.lastTest.msg) + '</div>';
    html += '<div class="row"><button type="button" id="th-deduce-test">🔌 测试接口</button>'
      + '</div>';
    html += '<div class="row"><span class="muted">模型</span><input type="text" id="th-deduce-model" value="' + escapeHtml(st2.model) + '">' +
      '<button type="button" id="th-deduce-fetch-models">📥 拉取模型</button></div>';
    /* ★ v1.28：这里原来还有个「保存」按钮。现在改规则的：改了就一直算数，
       拉取 / 选模型都自动存，不需要手动保存。 */
    html += '<div class="th-deduce-help">地址 / 钥匙 / 模型<b>改完就自动存</b>，不用点保存；点「拉取模型」会先把你刚填的收进去再拉。</div>';
    if ((S.models || []).length) {
      html += '<div class="row"><button type="button" id="th-deduce-models-toggle">'
        + (S.modelsOpen ? '▲ 收起模型列表（' + S.models.length + ' 个）' : '▼ 展开模型列表（' + S.models.length + ' 个）') + '</button></div>';
      if (S.modelsOpen) {
        html += '<div class="row" style="flex-wrap:wrap;gap:4px">';
        S.models.slice(0, 80).forEach(function (m) {
          html += '<button type="button" class="th-deduce-model-pick" data-model="' + escapeHtml(m) + '">' + escapeHtml(m) + '</button>';
        });
        html += '</div>';
      }
    }
    html += '<div class="row"><span class="muted">温度</span><input type="number" step="0.05" id="th-deduce-temp" value="' + st2.temperature + '" style="max-width:70px">' +
      '<span class="muted">上限</span><input type="number" id="th-deduce-max" value="' + st2.maxTokens + '" style="max-width:80px">' +
      + (st2.devMode ? '<span class="muted">记忆楼数</span><input type="number" id="th-deduce-mem" value="' + st2.memory + '" style="max-width:60px">' : '')
      + '</div>';
    html += '<div class="row"><button type="button" class="primary" id="th-deduce-run">🎲 立即推演</button>' +
      '<button type="button" id="th-deduce-copy">复制上次输出</button>' +
      '<button type="button" id="th-deduce-close">关闭面板</button></div>';
    /* ★ v1.7：这里原来还有「上次输出」和「模型原样返回（最后 N 字）」两块，跟上面的 📥 / ✅ 重复了，删掉。 */
    if (S.lastError) html += '<div class="out" style="border-color:#ef4444">错误：' + escapeHtml(S.lastError) + '</div>';
    p.innerHTML = html;
    /* ★ v1.25：挂上之后再按结构裹卡片、点胶囊，不改动拼好的 html 字符串本身（字符串里的标签不一定闭合） */
    beautifyDeducePanel(p);

    var bind = function (id, ev, fn) { var n = p.querySelector('#' + id); if (n) n['on' + ev] = fn; };
    bind('th-deduce-hostmodel', 'change', function (e) { S.settings.useHostModel = e.target.checked; saveSettings(); toast(e.target.checked ? '已切换：用当前酒馆模型推演（不用填 API）' : '已切换：用你自己填的 API'); });
    bind('th-deduce-enabled', 'change', function (e) { S.settings.enabled = e.target.checked; saveSettings(); setStatus(S.settings.enabled ? 'idle' : 'off', S.settings.enabled ? '待机' : '已关闭'); });
    /* ★ 推演时机：两个按钮互斥（推进 / 切场景） */
    function syncTriggerBtns() {
      var a = p.querySelector('#th-deduce-tr-adv');
      var b = p.querySelector('#th-deduce-tr-scene');
      var mode = (S.settings.trigger === 'scene') ? 'scene' : 'advance';
      if (a) a.style.background = (mode === 'advance') ? 'rgba(56,189,248,.28)' : '';
      if (b) b.style.background = (mode === 'scene') ? 'rgba(56,189,248,.28)' : '';
    }
    bind('th-deduce-tr-adv', 'click', function (e) { e.stopPropagation(); S.settings.trigger = 'advance'; S.lastAdvanceKey = advanceKey(); saveSettings(); syncTriggerBtns(); toast('推演时机：每次推进推一次'); });
    bind('th-deduce-tr-scene', 'click', function (e) { e.stopPropagation(); S.settings.trigger = 'scene'; S.lastSceneKeyForRun = sceneKey(); saveSettings(); syncTriggerBtns(); toast('推演时机：每次切换场景推一次'); });
    syncTriggerBtns();
    /* ★ v1.28：输入框改完（失焦 / 回车）就自动收进设置并存盘，不用再点保存 */
    pullInputsInto(p);
    ['th-deduce-base', 'th-deduce-key', 'th-deduce-model', 'th-deduce-temp', 'th-deduce-max', 'th-deduce-mem'].forEach(function (id) {
      var node = p.querySelector('#' + id);
      if (!node) return;
      node.onchange = function () { pullInputsInto(p); };
      node.onblur = function () { pullInputsInto(p); };
      if (node.tagName === 'INPUT') {
        node.onkeydown = function (e) { if (e.key === 'Enter') { pullInputsInto(p); } };
      }
    });
    bind('th-deduce-fetch-models', 'click', function () {
      /* ★ v1.28：拉之前先把你刚敲进去的地址 / 钥匙收进设置，
         不然拉取用的还是旧值（填完直接点拉取会失败），面板一重画还会把你敲的字冲掉。 */
      pullInputsInto(p);
      var btn = p.querySelector('#th-deduce-fetch-models');
      if (btn) btn.textContent = '拉取中…';
      fetchModels().then(function (list) {
        S.modelsOpen = true;
        toast('🎲 拉到 ' + list.length + ' 个模型，点一个就填上');
        renderPanel();
      }).catch(function (err) {
        S.lastError = String((err && err.message) || err);
        toast('🎲 拉取模型失败：' + S.lastError);
        renderPanel();
      });
    });
    Array.prototype.forEach.call(p.querySelectorAll('.th-deduce-model-pick'), function (b) {
      b.onclick = function () {
        var name = b.getAttribute('data-model') || '';
        var input = p.querySelector('#th-deduce-model');
        pullInputsInto(p);              /* 先把面板上其它改动一起收进来 */
        S.settings.model = name;
        saveSettings();
        if (input) input.value = name;
        toast('🎲 模型已设为 ' + name + '，正在试连一次…');
        /* ★ v1.28：选完模型自动连一次（就是那颗「测试接口」干的事），连不上会告诉你原因 */
        setStatus('running', '连接中…');
        Promise.resolve()
          .then(function () { return testApi(); })
          .catch(function (err) { S.lastError = String((err && err.message) || err); })
          .then(function () { try { renderPanel(); } catch (e2) {} });
      };
    });
    bind('th-deduce-inject', 'change', function (e) { S.settings.injectOn = e.target.checked; saveSettings(); });
    bind('th-deduce-blurbs', 'change', function (e) { S.settings.useBlurbs = e.target.checked; saveSettings(); });
    bind('th-deduce-thinking', 'change', function (e) { S.settings.wantThinking = e.target.checked; saveSettings(); });
    bind('th-deduce-memtoast', 'change', function (e) { S.settings.memoryToast = e.target.checked; saveSettings(); });
    bind('th-deduce-memmax', 'change', function (e) {
      var v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 1) v = 5;
      if (v > 20) v = 20;
      S.settings.memMax = v;
      saveSettings();
      saveMemory(S.memory);
      toast('🎲 重要记忆保留上限已设为 ' + v + ' 条');
      renderPanel();
    });
    bind('th-deduce-dev', 'click', function () { S.settings.devMode = !S.settings.devMode; saveSettings(); renderPanel(); });
    bind('th-deduce-mem-add', 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAddMemory(); } });
    bind('th-deduce-mem-save', 'click', doAddMemory);
    function doAddMemory() {
      var n = p.querySelector('#th-deduce-mem-add');
      var v = n ? String(n.value || '').trim() : '';
      if (!v) return;
      var list = (S.memory || loadMemory()).slice();
      var key = normKey(v);
      var dup = list.some(function (x) { return normKey(x) === key; });
      if (!dup) list.push(v);
      saveMemory(list);
      if (n) n.value = '';
      toast(dup ? '🎲 这条已经有了' : '🎲 记下了');
      renderPanel();
    }
    bind('th-deduce-mem-harvest', 'click', function () {
      var added = harvestMemory(true, true);   /* 手动扫：无视指纹，硬扫一遍；提示由下面这句出 */
      toast(added.length ? ('📖 新收 ' + added.length + ' 条' + (added.length > 1 ? '（只收第一条，多的忽略）' : '')) : '📖 没有新的重要记忆');
      renderPanel();
    });
    bind('th-deduce-mem-clear', 'click', function () { saveMemory([]); toast('🎲 记忆已清空'); renderPanel(); });
    Array.prototype.forEach.call(p.querySelectorAll('.th-deduce-mem-del'), function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        var list = (S.memory || []).slice();
        if (i >= 0 && i < list.length) list.splice(i, 1);
        saveMemory(list);
        renderPanel();
      };
    });
    bind('th-deduce-models-toggle', 'click', function () { S.modelsOpen = !S.modelsOpen; renderPanel(); });
    bind('th-deduce-test', 'click', function () { testApi(); });
    bind('th-deduce-run', 'click', function () { run('手动'); });
    bind('th-deduce-copyraw', 'click', function () {
      try { navigator.clipboard.writeText(S.lastRaw || ''); toast('🎲 已复制原样返回'); } catch (e) { toast('复制失败，手动选吧'); }
    });
    bind('th-deduce-refresh', 'click', function () { S.lastPrompt = ''; renderPanel(); toast('🎲 预览已刷新'); });
    bind('th-deduce-copyprompt', 'click', function () {
      try { navigator.clipboard.writeText(S.previewPrompt || S.lastPrompt || ''); toast('🎲 已复制提示词'); } catch (e) { toast('复制失败，手动选吧'); }
    });
    bind('th-deduce-wide', 'click', function () {
      S.wide = !S.wide;
      try {
        var n2 = S.panel;
        if (n2) { n2.style.width = S.wide ? 'min(760px, 94vw)' : ''; n2.style.maxHeight = S.wide ? '84vh' : ''; }
      } catch (e2) {}
      renderPanel();
    });
    bind('th-deduce-copy', 'click', function () {
      try { navigator.clipboard.writeText(S.lastText || ''); toast('🎲 已复制'); } catch (e) { toast('复制失败，手动选吧'); }
    });
    bind('th-deduce-close', 'click', function () { p.hidden = true; });
    /* ★ 面板里改完开关就顺手把按钮栏那颗按钮重画一下，状态立刻一致 */
    paintDeckButton();
  }

  /* ────────────── 启动 ────────────── */
  /* ★ v1.1：按钮栏那颗按钮是核心脚本建的，可能比这个脚本晚出现（壳子还没挂载）。
     每 2 秒轻轻对一下状态文字就行，不折腾 DOM。 */
  function startDeckWatchdog() {
    if (S.deckWatchdog) return;
    S.deckWatchdog = setInterval(function () {
      try { watchChatSwitch(); } catch (eC) {}
      try { listenOpenEvent(); } catch (e) {}
      try { bindDeckButton(); } catch (e2) {}
      try { paintDeckButton(); } catch (e3) {}
      try { harvestMemory(false); } catch (e4) {}   /* ★ v1.8：顺手把新写的重要记忆收进来（有新条目会弹一条提示） */
    }, 2000);
  }
  function boot() {
    loadSettings();
    watchChatSwitch();
    injectStyle();
    listenOpenEvent();
    startDeckWatchdog();
    bindDeckButton();
    paintDeckButton();
    if (!S.greeted) {
      S.greeted = true;
      setTimeout(function () {
        paintDeckButton();
        toast(S.settings.enabled && S.settings.key
          ? '🎲 外置推演已就绪（按钮栏里的「🎲 推演」可以开面板）'
          : '🎲 外置推演已加载：按钮栏里点「🎲 推演」，填上 API 地址与钥匙');
      }, 1500);
    }
    watch();
    /* 聊天切换后把上次输出读回来（同一个聊天里刷新页面也能看到） */
    try {
      S.memory = loadMemory();
      var rec = JSON.parse(store(lastKey()) || 'null');
      if (rec && rec.text) { S.lastText = rec.text; S.lastAt = rec.at || 0; setStatus('done', '已注入 ' + new Date(S.lastAt).toLocaleTimeString()); }
    } catch (e) {}
  }
  if (typeof $ === 'function') { try { $(boot); } catch (e) { setTimeout(boot, 800); } } else { setTimeout(boot, 800); }

  /* 给核心脚本 / 控制台用的接口：在每一个能碰到的 window（自己 / parent / top）和 SillyTavern 上都挂一份，
     这样不管核心脚本跑在哪一层，点按钮都找得到我们。 */
  var API = {
    version: 'v1.2',
    togglePanel: function () { return togglePanel(), true; },
    openPanel: function () { if (!S.panel || S.panel.hidden) togglePanel(); return true; },
    closePanel: function () { if (S.panel && !S.panel.hidden) togglePanel(); return true; },
    panelOpen: function () { return !!(S.panel && !S.panel.hidden); },
    button: deckButton,
    paint: paintDeckButton,
    run: function (r) { return run(r); },
  };
  try {
    var __wins = windows();
    for (var __i = 0; __i < __wins.length; __i++) { try { __wins[__i].ThDeduce = API; } catch (e) {} }
    for (var __j = 0; __j < __wins.length; __j++) {
      try { if (__wins[__j].SillyTavern) __wins[__j].SillyTavern.ThDeduce = API; } catch (e2) {}
    }
  } catch (e3) {}
  try {
    window.ThDeduce = Object.assign({}, API, {
      settings: function () { return S.settings; },
      prompt: buildPrompt,
      places: loadPlaces,
      state: function () { return readState(); },
      last: function () { return S.lastText; },
      publish: publish,
      extract: extractDeduction,
      parse: parseDeduction,
      raw: function () { return S.lastRaw; },
      promptSent: function () { return S.lastPrompt; },
      preview: function () { try { return S.lastPrompt || buildPrompt(); } catch (e) { return ''; } },
      models: function () { return S.models || []; },
      testApi: testApi,
      isRambling: isRambling,
      strictPrompt: function () { try { return buildStrictPrompt(''); } catch (e) { return ''; } },
      placesSource: function () { loadPlaces(); return { count: loadPlaces().length, from: PLACE_SOURCE }; },
      lastTest: function () { return S.lastTest || null; },
      fetchModels: fetchModels,
      pullInputs: function () { return pullInputsInto(S.panel); },   /* v1.28：外部想手动触发收存也行 */
      memory: function () { return S.memory || loadMemory(); },
      setMemory: function (l) { return saveMemory(l || []); },
      harvest: function () { return harvestMemory(true, true); },   /* 强制扫（面板按钮那条路） */
      harvestAuto: function () { return harvestMemory(true); },      /* 看门狗那条路：同一楼只收一次 */
      dropSkipped: dropSkipped,
      blurbMap: blurbMap,
      memoryMax: function () { return MEMORY_MAX; },
      memoryFloor: function () { return S.memoryFloor || null; },
      blurbs: charBlurbs,
      relation: relationText,
      inject: injectToMain,
      pacts: function () { return []; },   /* 老名字，留着不报错 */
      setPacts: function () { return []; },
      latest: latestProse,
      map: mapText,
      splitPacts: splitPacts,
      thinking: function () { return (S.lastParsed && S.lastParsed.thinking) || ''; },
      setMove: function (from, to) { S.lastMove = { from: from, to: to, at: Date.now() }; return S.lastMove; },
      injected: function () { return S.lastInjected; },
      ms: function () { return S.lastMs; },
      history: function () { return S.history; },
      status: function () { return { status: S.status, text: S.statusText, at: S.lastAt, error: S.lastError }; },
    });
  } catch (e4) {}
})();
