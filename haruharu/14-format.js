/* 春日狂想曲·统一版 v10.6 · 14-format.js · 源脚本：[同层] 7 09-格式补全v1.1 */
/* ══════════════════════════════════════════════════════════════════
   09-格式补全v1.1 —— 正文 <content> 缺失时自动补全（v147：对话框显示下架）
   ──────────────────────────────────────────────────────────────────
   【为什么需要它】
   v147 起正文契约：模型用 <content>（或 game/gametext/maintext/正文/text）包裹正文。
   模型偶尔会忘（流式截断、被 stop 打断、正文写到一半）。
   一旦没有这个标签，对话框就是空的 —— 玩家看到「对话框不显示字」。

   【它做什么】
   ① 每2 秒轮询一次（跟变量自愈同一个节奏），检测**最新那一楼**能不能读出正文
      （六个正文标签 content / gametext / game / maintext / 正文 / text 任一个，
       或思维链 </think></thinking></thought> 收尾之后还有字）；
      ★ v140：**第 0 层（开场白）永不参与检测**，开局只有开场白时不报任何缺失；
      生成中一律不查（正文还在流，此刻查必误报）。
   ② 读不出 → 弹一条壳内轻提示（跟变量补全一模一样的交互，不弹面板、不挂起游戏）。
   ★ v109：顶栏那颗「📐 格式补全」按钮已**撤掉**（用户明确不要）。触发点改成**对话框本体**：
      读得出正文 → 正常展开对话框；读不出 → 打开「🩺 补全中心」面板，
      玩家点面板里的「💬 对话框不显示点我」才调 API。
   ③ 同一楼只提示一次；异常持续 1.9 秒才真弹（防流式中途误报）。
   ④ 玩家点「🩺 补全中心」面板里的「💬 对话框不显示点我」→ 调API 让 AI 识别哪段是正文、有没有正文标签，
      按规则输出补全后的整条回复，然后写回这一楼（swipes + save + MESSAGE_UPDATED）。
   ⑤ 默认用酒馆当前模型（generateRaw），不需要填 API。

   【补全规则（发给 AI 的提示词）】
   让它判断哪一段是正文；没有正文标签就用 <content> 包起来，已有就原样返回。
   正文一个字都不许改，只加一层 <content>；思维链留在 <content> 外面。
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var HOST = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
    return window;
  })();
  function getDoc() { return HOST.document || document; }

  /* ─────────── 配置 ─────────── */
  var POLL_MS = 2000;/* 轮询周期 */
  var CONFIRM_MS = 1900;         /* 异常持续这么久才真弹（防流式误报） */
  var TOAST_MS = 6000;           /* 提示停留时长 */
  var STORAGE_KEY = 'thGalFormatFixOn';
  var STORAGE_API = 'thGalFormatFixApi';

  /* ─────────── 状态 ─────────── */
  var _pendingKey = '', _pendingAt = 0;   /* 二次确认 */
  var _notifiedKey = '';                  /* 同一楼只提示一次 */
  var _pollAt = 0;
  var _busy = false;                      /* 正在补全 */
  var _lastResult = '';                   /* 上次补全结果，给玩家看 */
  var _btn = null;
  var _btnState = 'idle';                 /* idle | thinking | ok | fail */
  var _btnMsg = '';

  /* ═══════════════ 工具 ═══════════════ */
  function getStContext() {
    try { if (HOST.SillyTavern && typeof HOST.SillyTavern.getContext === 'function') return HOST.SillyTavern.getContext(); } catch (e) {}
    try { if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') return window.SillyTavern.getContext(); } catch (e) {}
    return null;
  }
  function TavernHelperRef() {
    try { if (HOST && HOST.TavernHelper) return HOST.TavernHelper; } catch (e) {}
    try { if (typeof window !== 'undefined' && window.TavernHelper) return window.TavernHelper; } catch (e) {}
    return null;
  }

  /* ═══════════════ ★ v118：当前篇章（去重键的维度）═══════════════
     为什么这个脚本要自己读篇章：
       本脚本没有读变量的能力（它只认楼层文本），但「同一楼只提示一次」这条去重
       必须带上篇章 —— 否则玩家在夏越村那一楼被提示过「读不出正文」，
       切成公寓后又回到同一楼，脚本认为"提示过了"，对话框空着也不再提醒。
     读不到就返回空串：宁可退回旧行为（不按篇章分），也绝不乱猜一个篇章名，
     乱猜会让标记永久对不上、该提示的永远不提示（比不区分还糟）。 */
  function arcOfNow() {
    var arc = '';
    /* ① 先问核心脚本（它有一份唯一实现，且已经处理了"变量还没落地"的空窗期） */
    try {
      if (typeof HOST.__thCurrentArc === 'function') arc = String(HOST.__thCurrentArc() || '');
    } catch (e1) {}
    /* ② 退路：自己读 MVU / 变量（核心脚本没加载或还没初始化时） */
    if (!arc) {
      try {
        var mvu = null;
        try { if (HOST.MVU) mvu = HOST.MVU; } catch (e2a) {}
        if (!mvu) { try { if (HOST.TavernHelper && HOST.TavernHelper.MVU) mvu = HOST.TavernHelper.MVU; } catch (e2b) {} }
        if (mvu && typeof mvu.getMvuData === 'function') {
          var d = mvu.getMvuData({ type: 'chat' });
          var b = d && (d.stat_data || d.sata_data);
          if (b && b.全局 && b.全局.当前篇章) arc = String(b.全局.当前篇章);
        }
      } catch (e3) {}
    }
    if (!arc) {
      try {
        if (typeof getVariables === 'function') {
          var v = getVariables() || {};
          var b2 = v.stat_data || v;
          if (b2 && b2.全局 && b2.全局.当前篇章) arc = String(b2.全局.当前篇章);
        }
      } catch (e4) {}
    }
    /* 归一化（跟核心 normArc 同口径：认「神社/鸟居/巫女」「公寓」） */
    var s = String(arc || '');
    if (s.indexOf('神社') !== -1 || s.indexOf('鸟居') !== -1 || s.indexOf('巫女') !== -1) return '神社';
    if (s.indexOf('公寓') !== -1) return '公寓';
    if (s) return '夏越村';
    return '';
  }
  /* 存档 id（跟核心 currentChatId 同口径：chat_metadata.chat_id 优先） */
  function chatIdNow() {
    try {
      var ctx = getStContext();
      if (ctx) {
        var m = ctx.chat_metadata || {};
        if (m.chat_id) return String(m.chat_id);
        if (m.file_name) return String(m.file_name);
        if (m.name) return String(m.name);
      }
    } catch (e) {}
    return 'default';
  }
  function showToast(msg, ms) {
    try {
      var doc = getDoc();
      var shell = doc.getElementById('th-gal-shell-root');
      if (!shell) return;
      var old = shell.querySelector('.th-gal-toast');
      if (old) old.remove();
      var node = doc.createElement('div');
      node.className = 'th-gal-toast';
      node.textContent = msg;
      shell.appendChild(node);
      setTimeout(function () { try { node.remove(); } catch (e) {} }, ms || TOAST_MS);
    } catch (e) {}
  }

  /* ═══════════════ 检测：最新那一楼能不能读出正文（v147 六标签穷举） ═══════════════ */
  /* 返回 { ok, key, index, raw, swipeId } */
  function inspectLatest() {
    var ctx = getStContext();
    var chat = ctx && ctx.chat;
    if (!chat || !chat.length) return { ok: true, key: '', index: -1, raw: '', swipeId: -1 };  /* 没楼层：不报 */
    /* 找最后一条 AI 消息。
       ★ v140：下界是 1 不是 0 —— 第 0 层是开场白（greeting），不是 AI 生成的回复，
         它本来就不带正文契约标签。开局还没进游戏时若拿它当「最新 AI 楼层」，
         必然误报「本楼读不出正文」并骚扰玩家。手动补全同样走这里，一并不再改写开场白。 */
    var idx = -1;
    for (var i = chat.length - 1; i >= 1; i--) {
      var m = chat[i];
      if (!m) continue;
      if (m.is_user === true || m.isUser === true) continue;
      if (m.is_system === true) continue;
      if (!m.mes && !(m.swipes && m.swipes.length)) continue;
      idx = i;
      break;
    }
    /* v140：idx<0 表示「除了开场白还没有任何 AI 回复」→ 静默不报 */
    if (idx <= 0) return { ok: true, key: '', index: -1, raw: '', swipeId: -1 };

    var msg = chat[idx];
    var sid = (msg.swipe_id != null) ? msg.swipe_id : 0;
    var raw = '';
    try {
      if (msg.swipe_info && msg.swipe_info[sid] && typeof msg.swipe_info[sid].mes === 'string') raw = msg.swipe_info[sid].mes;
      else if (msg.swipes && msg.swipes.length) {
        var cur = msg.swipes[sid];
        raw = (cur && typeof cur === 'object') ? (cur.mes != null ? cur.mes : '') : (cur == null ? '' : String(cur));
      }
    } catch (e) {}
    if (!raw) raw = String(msg.mes || '');

    /* ★★ v113：这里**必须**用严格判据（要求能配对闭合）。
       原来用裸正则 /<\s*对话框显示(?=[\s>])/i.test(raw) —— 只要有开标签就算「已有」（v147 已废弃），
       于是「流式被 stop 打断 / 正文截断」这种最常见的故障现场里，
       补全脚本会说「本楼已有正文标签，无需补全」而**直接拒绝**，
       而对话框系统那边（pickDialogBoxText 要求闭合）又什么都取不到 ——
       玩家看着空对话框，唯一能救命的按钮却被自己挡住了，死锁。
       现在与对话系统同源：有开标签但配不上闭合 = **当作没有**，交给补全去修。 */
    var has = hasClosedDialogueBox(raw);
    /* 流式生成到一半、标签刚打出来还没写完 → 也算「暂时没有」，等下一拍再判 */
    return {
      ok: has,
      broken: !has && hasLooseDialogueBoxTag(raw),   /* 有开标签没闭合 = 半截标签 */
      /* ★ v118：key 带上【存档 @ 篇章】。
         以前只有「楼层#swipe」—— 同一楼在夏越村提示过，切到公寓后回到这一楼就不再提示，
         而这楼当时缺标签、对话框还是空的，玩家等不到任何提醒。
         存档也要带：换存档不刷新页面，_notifiedKey 是内存变量，会带着上一条聊天。
         篇章读不到时 arcOfNow() 返回空串 → 退化成"存档#楼层#swipe"，不比以前差。 */
      key: chatIdNow() + '@' + arcOfNow() + '#' + String(idx) + '#' + sid,
      index: idx,
      raw: raw,
      swipeId: sid
    };
  }

  /* ═══════════════ 轮询嗅探 ═══════════════ */
  function poll() {
    var now = Date.now();
    if (now - _pollAt < POLL_MS) return;
    _pollAt = now;

    /* 生成中一律不查：正文还在流，标签多半是「还没轮到」 */
    try { if (typeof isGenerating === 'function' && isGenerating()) return; } catch (e) {}
    if (_busy) return;
    /* 开关 */
    try { if (HOST.localStorage && HOST.localStorage.getItem(STORAGE_KEY) === '0') return; } catch (e2) {}

    var r = inspectLatest();
    if (!r.key) { _pendingKey = ''; return; }

    if (r.ok) {
      _pendingKey = ''; _pendingAt = 0;
      return;
    }

    /* 二次确认：异常要持续 CONFIRM_MS 才认（流式中途会短暂没标签） */
    if (_pendingKey !== r.key) { _pendingKey = r.key; _pendingAt = now; return; }
    if (now - _pendingAt < CONFIRM_MS) return;

    /* 同一楼只提示一次 */
    if (_notifiedKey === r.key) return;
    _notifiedKey = r.key;

    try {
      console.warn('📐 [格式补全] 第 ' + r.index + ' 楼读不出正文内容 → 对话框会是空的');
    } catch (e3) {}
    showToast('⚠️ 本楼读不出正文内容，对话框会是空的 · 点顶栏「📐 格式补全」自动补 <content>', TOAST_MS);
  }

  /* ═══════════════ 补全提示词 ═══════════════ */
  function buildPrompt(raw) {
    return [
      '你是一个格式修复器。下面这段文本是 AI 角色卡的回复，但游戏对话框读不到正文，',
      '原因是缺少 `<content>` 标签。请你只做一件事：判断哪一段是「正文」，',
      '用 `<content>` 包起来。',
      '',
      '【规则】',
      '1. 先看有没有现成的正文标签（content / gametext / game / maintext / 正文 / text）。',
      '   · 已经有 → 不用你补，原样返回即可。',
      '   · 都没有 → 把正文用 <content> 包起来，输出 <content>正文</content>。',
      '2. 正文**只包一层** <content>，不要套别的包裹标签。',
      '3. 正文之外的契约标签（<UpdateVariable> / <Analysis> / <JSONPatch> / <后台推演> /',
      '   <重要记忆> / <插图> / <地点> / <在场人物> 等）**原样保留，一个字都不许改、不许删**。',
      '4. 正文一个字都不许改写、不许增删，只允许加 <content> 这一层包裹。',
      '5. 如果正文里嵌了思维链标签（<think> / <thinking> / <thought>），',
      '   思维链**留在 <content> 外面** —— 它在前面就在前面，别包进去。',
      '6. 正文内部如果还有别的标签（比如 <div>、<span>），**保持原样不要动**，',
      '   游戏会自己把标签连同里面的内容一起隐藏掉。',
      '',
      '【输出格式】只输出修复后的完整文本，不要任何解释、不要 markdown 代码块围栏。',
      '',
      '────── 待修复文本 ──────',
      raw,
      '────── 结束 ──────'
    ].join('\n');
  }

  /* ═══════════════ 调 API（复用外置AI 那套 generateRaw 兼容层） ═══════════════ */
  function callApi(prompt) {
    var TH = TavernHelperRef();
    if (TH && typeof TH.generateRaw === 'function') {
      var shapes = [
        function () { return TH.generateRaw({ ordered_prompts: [{ role: 'user', content: prompt }] }); },
        function () { return TH.generateRaw({ user_input: prompt }); },
        function () { return TH.generateRaw({ ordered_prompts: [prompt] }); },
        function () { return TH.generateRaw(prompt); }
      ];
      var idx = 0;
      function tryOne(fn) {
        return Promise.resolve().then(fn).then(function (out) {
          var s = String((out && (out.content || out.text)) || out || '');
          return s.trim() ? s : null;
        }).catch(function () { return null; });
      }
      function next() {
        if (idx >= shapes.length) return Promise.resolve(null);
        var f = shapes[idx++];
        return tryOne(f).then(function (got) { return got || next(); });
      }
      return next().then(function (txt) {
        txt = String(txt || '');
        if (!txt.trim()) throw new Error('酒馆模型没有返回内容');
        /* 认出「它根本没看懂任务」：通用问候一律当失败 */
        if (/^(fresh slate|How can I help|How may I help|怎么帮|需不需要我|有什么可以帮|请问有什么)/i.test(txt.trim())) {
          throw new Error('酒馆模型回了一句通用问候，没收到补全提示词');
        }
        return txt;
      });
    }
    /* 没有 generateRaw → 试用户自填的 API */
    var url = '', key = '', model = '';
    try {
      url = HOST.localStorage.getItem(STORAGE_API + 'Url') || '';
      key = HOST.localStorage.getItem(STORAGE_API + 'Key') || '';
      model = HOST.localStorage.getItem(STORAGE_API + 'Model') || '';
    } catch (e) {}
    if (!url || !key) {
      return Promise.reject(new Error('拿不到酒馆的 generateRaw（确认「酒馆助手」扩展已启用），也没填自备 API'));
    }
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    };
    return fetch(url, opts).then(function (res) {
      return res.json();
    }).then(function (j) {
      var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!c) throw new Error('API 没有返回内容');
      return String(c);
    });
  }

  /* ═══════════════ 清洗 AI 返回 ═══════════════ */
  function cleanReply(txt) {
    var s = String(txt || '').trim();
    /* 去掉 markdown 围栏 */
    s = s.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    s = s.trim();
    return s;
  }

  /* ═══════════════ 写回这一楼 ═══════════════ */
  function writeBack(index, sid, body) {
    var ctx = getStContext();
    if (!ctx || !ctx.chat || !ctx.chat[index]) throw new Error('找不到要写入的楼层');
    var m = ctx.chat[index];
    if (!Array.isArray(m.swipes) || !m.swipes.length) m.swipes = [m.mes || ''];
    var useSid = (typeof m.swipe_id === 'number' && m.swipe_id >= 0) ? m.swipe_id : 0;
    if (sid >= 0 && Array.isArray(m.swipes) && sid < m.swipes.length) useSid = sid;
    m.swipes[useSid] = body;
    m.mes = body;
    try { if (typeof ctx.saveChatDebounced === 'function') ctx.saveChatDebounced(); else if (typeof ctx.saveChat === 'function') ctx.saveChat(); } catch (e1) {}
    try { if (typeof ctx.updateMessageBlock === 'function') ctx.updateMessageBlock(index, m); } catch (e2) {}
    try {
      var et = ctx.eventTypes || ctx.event_types || {};
      if (ctx.eventSource && et.MESSAGE_UPDATED) ctx.eventSource.emit(et.MESSAGE_UPDATED, index);
    } catch (e3) {}
  }

  /* ═══════════════ 手动补全（玩家点按钮） ═══════════════ */
  function runFix() {
    if (_busy) { showToast('📐 格式补全正在跑，请稍候', 2400); return; }
    var r = inspectLatest();
    if (!r.key) { showToast('📐 还没找到 AI 回复，无法补全', 2600); return; }
    if (r.ok) { showToast('📐 本楼已能读出正文，无需补全（若对话框是空的请按 F12 看控制台日志）', 3200); return; }
    /* ★ v113：半截标签（流式被打断 / 正文截断）以前会被上面那句「已有，无需补全」挡回去，
       玩家看着空对话框却什么都做不了。现在明确告诉玩家这是哪种情况。 */
    if (r.broken) {
      showToast('📐 检测到正文标签不完整（正文被截断），仍需补全…', 4200);
    }
    if (!r.raw || !r.raw.trim()) { showToast('📐 本楼正文是空的，补不了', 2600); return; }

    _busy = true;
    paintBtn('thinking', '补全中…');
    showToast('📐 正在调 AI 识别正文并补 <content>，稍等几秒…', 9000);

    callApi(buildPrompt(r.raw)).then(function (txt) {
      var body = cleanReply(txt);
      /* 校验：补完之后必须**真的能读出正文**，否则宁可不写。
         ★ v147：以前这里查的是裸正则 /<\s*对话框显示/ —— 标签下架后这条
         永远不成立，AI 明明补好了 <content> 也会被当成失败丢掉，等于功能全废。
         现在改用跟对话框同一套判据（hasClosedDialogueBox），保证和产品同源。 */
      if (!hasClosedDialogueBox(body)) {
        throw new Error('AI 返回的内容里读不出正文（六个正文标签和思维链尾部都是空的），已放弃写入');
      }
      writeBack(r.index, r.swipeId, body);
      _notifiedKey = r.key;   /* 补完就别再提示这一楼了 */
      _pendingKey = ''; _pendingAt = 0;
      _lastResult = body;
      paintBtn('ok', '已补全');
      showToast('📐 已补全正文，对话框现在有字了', 5000);
      try { console.log('📐 [格式补全] 补全成功：' + body.slice(0, 120).replace(/\s+/g, ' ')); } catch (e4) {}
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      _lastResult = '';
      paintBtn('fail', '补全失败');
      showToast('📐 补全失败：' + msg.slice(0, 90), 8000);
      try { console.error('📐 [格式补全] 失败：' + msg); } catch (e5) {}
    }).then(function () {
      _busy = false;
      setTimeout(function () { paintBtn('idle', ''); }, 6000);
    });
  }

  /* ═══════════════ 顶栏按钮 ═══════════════ */
  function paintBtn(state, msg) {
    _btnState = state || 'idle';
    _btnMsg = msg || '';
    /* ★ v109：按钮已撤，所以状态一律走壳内toast 反馈。
       需求原文：「点击对话框这个按钮就会显示正在调用 api 进行补全」——
       「正在调用 API 进行补全…」这句就是给玩家看的进行中反馈。 */
    try {
      if (typeof showToast !== 'function') {
        if (typeof popToast === 'function') popToast(_btnMsg || '📐 ' + state);
        return;
      }
      if (state === 'thinking') showToast('📐 正在调用 API 进行补全…', 9000);
      else if (state === 'ok') showToast('📐 已补全正文，对话框现在有字了', 5000);
      else if (state === 'fail') showToast('❌ ' + (_btnMsg || '补全失败，原文未改动'), 6000);
    } catch (e) {}
  }

  /* ══ ★ v109：顶栏那颗「📐 格式补全」按钮**已按用户要求撤掉** ══
     现在触发点是**对话框本体**：
       · 读得出正文 → 直接展开对话框
       · 读不出         → 打开「🩺 补全中心」面板，点里面的
                          「💬 对话框不显示点我」才会调 API 补全。
     所以这个脚本不再自己建按钮，改为把 runFix 挂到 HOST 上，
     由 核心v88 的面板按钮来调（跨脚本调用走 window 全局最稳）。

     状态回报：paintBtn 原来改按钮文字，现在改成 toast——
     点完只能看到「正在调用 API 进行补全…」，这是需求里明确要的反馈。 */
  function decodeEntitiesLocal(s) {
    return String(s || '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }

  function exportRunFix() {
    try {
      HOST.__galFormatFixRun = runFix;
      return true;
    } catch (e) { return false; }
  }

  /* ══ ★ v113：本项目「有没有对话框正文」现在**只有两个判据**，都放在这里 ══
     hasLooseDialogueBoxTag  —— 只看开标签（用来告诉玩家「你这条是半截标签」）
     hasClosedDialogueBox    —— 要求能配对闭合且正文非空（**唯一权威**，与对话系统同源）

     原来的 hasDialogueBox(raw) 只做宽松判断，而且**定义了从没被调用过**，
     真正的判定 scattered 在 inspectLatest 里的裸正则 —— 判据不统一才出了 v113 这个死锁。 */

  /* ══ ★ v147：判据换成**穷举法**，与核心 parseContentWithLayer 同源 ══════
     用户原话：「对话框显示标签正式下架」「格式补全改为补全 content 标签」。

     为什么必须同源：以前 09 用「有没有 <对话框显示>」判，对话框系统也用同一个判，
     两边一致；现在对话框改穷举法（6 个正文标签 + 思维链尾部），
     09 若还盯着 <对话框显示>，就会出现
       · 对话系统读得出正文、09 却一直弹「缺标签」→ 骚扰
       · 或者反过来，两边判据打架 → 死锁
     ⇒ 这里**逐条复刻**核心的判据：任意一个正文标签能读出文字，或思维链尾部有字，就算有正文。 */

  /* 与核心 V147_TEXT_TAGS 保持同序 */
  var V147_TAGS = ['content', 'gametext', 'game', 'maintext', '正文', 'text'];
  var V147_CLOSERS = ['</thought>', '</thinking>', '</think>'];

  /* 吞标签：成对标签连内容整块剥（多轮，覆盖嵌套），再剥残余 */
  function v147Strip(inner) {
    var out = String(inner == null ? '' : inner);
    var prev = null, guard = 0;
    while (prev !== out && guard < 24) {
      prev = out;
      out = out.replace(/<([a-zA-Z0-9_\u4e00-\u9fa5]+)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '');
      guard++;
    }
    out = out.replace(/<([a-zA-Z0-9_\u4e00-\u9fa5]+)(?:\s[^>]*)?>[\s\S]*$/, '');
    out = out.replace(/<[^>]*>/g, '');
    return out;
  }

  /* 取某个正文标签内容（允许只开标签） */
  function v147Pick(txt, tag) {
    var esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = txt.match(new RegExp('<' + esc + '(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/' + esc + '\\s*>', 'i'));
    if (m && m[1]) return m[1];
    m = txt.match(new RegExp('<' + esc + '(?=[\\s>])[^>]*>([\\s\\S]*)$', 'i'));
    if (m && m[1]) return m[1];
    return '';
  }

  /* 思维链尾部之后 */
  function v147Tail(txt) {
    var best = -1, lower = txt.toLowerCase();
    for (var i = 0; i < V147_CLOSERS.length; i++) {
      var nd = V147_CLOSERS[i].toLowerCase();
      var from = 0, at = lower.indexOf(nd, from);
      while (at !== -1) {
        var p = at + nd.length;
        if (p > best) best = p;
        from = p;
        at = lower.indexOf(nd, from);
      }
    }
    if (best < 0) return '';
    return v147Strip(txt.slice(best));
  }

  /* 宽松：本楼里有没有正文标签（不管读不读得出字）—— 用来区分「半截标签」 */
  function hasLooseDialogueBoxTag(raw) {
    var txt = decodeEntitiesLocal(String(raw || ''));
    for (var i = 0; i < V147_TAGS.length; i++) {
      var esc = V147_TAGS[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('<' + esc + '(?=[\\s>])', 'i').test(txt)) return true;
    }
    return false;
  }

  /* 严格（权威）：**能不能读出正文内容** —— 与核心穷举法逐条对齐 */
  function hasClosedDialogueBox(raw) {
    var txt = decodeEntitiesLocal(String(raw || ''));
    /* 第一层：6 个正文标签 */
    for (var i = 0; i < V147_TAGS.length; i++) {
      var inner = v147Pick(txt, V147_TAGS[i]);
      if (!inner) continue;
      if (v147Strip(inner).replace(/\s+/g, ' ').trim()) return true;
    }
    /* 第二层：思维链尾部 */
    if (v147Tail(txt).replace(/\s+/g, ' ').trim()) return true;
    return false;
  }

  /* ═══════════════ 心跳（全局一份，热更不堆叠） ═══════════════ */
  function beat() {
    /* ★ v109：不再建按钮了，只保证 runFix 一直挂在 HOST 上（热更后重新挂） */
    try { exportRunFix(); } catch (e) {}
    try { poll(); } catch (e2) {}
  }
  try {
    HOST.__galFormatFixBeat = beat;
    if (!HOST.__galFormatFixTimer) {
      HOST.__galFormatFixTimer = setInterval(function () {
        try { if (typeof HOST.__galFormatFixBeat === 'function') HOST.__galFormatFixBeat(); } catch (e3) {}
      }, POLL_MS);
    }
  } catch (e4) {}

  /* 热更后立刻补一个按钮 */
})();