/* ══════════════════════════════════════════════════════════════════════
   [共用] 00-模式切换 · 悬浮球  v10.1
   ──────────────────────────────────────────────────────────────────────
   常驻脚本，两种模式都开启。宿主文档右下角挂一颗悬浮球：
     点击 → 展开弹层 → 选「游戏版 / 文字版」→ 点「确定切换」
       → 写入卡数据（脚本 enabled / 正则 disabled / 世界书 enabled / 开场白）
       → 写 localStorage → 自动 location.reload() 清缓存。

   写入通道（已在 JS-Slash-Runner v4.11.2 源码核对）：
     · SillyTavern.getContext() → { characters, characterId, ... }
     · predefine.js 往 getContext() 注入了 writeExtensionField = _th_impl.writeExtensionField
       function Rk(chid, path, value) {
         _.set(characters[chid].data.extensions, path, value);
         POST /api/characters/edit  ← 带整个 data.extensions + data.first_mes
       }
       所以：先在内存改好 regex_scripts / first_mes / character_book，
            再调一次 writeExtensionField(chid,'tavern_helper.scripts',新数组) 即可整体落盘。
     · 运行时世界书（独立 lorebook 文件）走
       TavernHelper.getCurrentCharPrimaryLorebook / getLorebookEntries /
       updateLorebookEntriesWith。内嵌 character_book 也同步改，双保险。
     · 任一写入失败 → 不刷新、不写 localStorage，弹层给出手动清单，绝不假成功。

   配置常量由 _build_v101.mjs 在打包时注入，保证清单与卡数据永远一致。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'SPR_UNIFIED_MODE';
  var LOCK = '__SPR_SWITCHER_LOCK__';
  var CFG = {"defaultMode":"game","gameFirstMes":"<content>\n【开局 · 春日狂想曲】\n</content>","textFirstMes":"<content>\n【开局 · 春日狂想曲】\n</content>","bookOffInText":["连携判定","内置思维链","格式","[mvu_update]变量更新规则","[mvu_update]变量输出格式","[InitVar]初始变量","小地图与快速跳转","插图版本","人物速查"],"bookNonOnly":["内置思维链·非同层","格式·非同层","[mvu_update]变量更新规则·非同层","[InitVar]初始变量·非同层","插图系统·非同层","人物速查·非同层","user身份·非同层","主要角色行为·非同层","暴露机制·非同层","关系·非同层","人物总览·非同层","[mvu_update]变量输出格式强调"]};
  var GAME = 'game', TEXT = 'text';

  /* ── 宿主 window / document（脚本跑在酒馆助手 iframe 里） ────────── */
  function hostWin() {
    try { if (window.top && window.top.document) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document) return window.parent; } catch (e) {}
    return window;
  }
  var HW = hostWin();
  var HD;
  try { HD = HW.document; } catch (e) { HD = document; }
  if (!HD) return;

  function readMode() {
    /* ★ v10.9：先读玩家自己选的那个。
       旧逻辑靠「[同层] 脚本里有 enabled=true」判模式，但热更卡把 13 个业务脚本
       全部设成冷备 enabled=false —— 这个判据永远返回 false，
       于是不管在游戏版还是文字版，嗅探一律返回文字版（球显示错、加载错脚本）。
       现在：localStorage 优先；script_trees / 卡数据只在「确实存在启用的 [同层]」
       时才判 GAME，全禁用视为热更卡正常态，跳过不判。 */
    try {
      var vL = HW.localStorage.getItem(KEY);
      if (vL === GAME || vL === TEXT) return vL;
    } catch (eL) {}

    var TH = pickTH();
    if (TH && typeof TH.getScriptTrees === 'function') {
      try {
        var trees = TH.getScriptTrees({ type: 'character' });
        var flat = flattenTrees(trees);
        var on0 = flat.filter(function (s) {
          return String(s.name || '').indexOf('[同层]') === 0 && s.enabled;
        });
        if (on0.length) return GAME;
      } catch (e0) {}
    }
    try {
      var ctx0 = pickCtx();
      if (ctx0) {
        var cid0 = chidOf(ctx0, TH);
        if (cid0 !== null && ctx0.characters[cid0]) {
          var ss0 = (ctx0.characters[cid0].data.extensions.tavern_helper.scripts) || [];
          var on1 = ss0.some(function (s) {
            return String(s.name || '').indexOf('[同层]') === 0 && s.enabled;
          });
          if (on1) return GAME;
        }
      }
    } catch (e1) {}
    return CFG.defaultMode;
  }
  function flattenTrees(list, out) {
    out = out || [];
    (list || []).forEach(function (t) {
      if (!t) return;
      if (Array.isArray(t.scripts)) flattenTrees(t.scripts, out);
      else out.push(t);
    });
    return out;
  }
  function theme() {
    var keys = ['spr_sb_theme', 'th_sb_theme', 'spr-sb-theme', 'sbTheme'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var t = HW.localStorage.getItem(keys[i]);
        if (/light|day|日光|浅/i.test(t || '')) return 'light';
        if (/dark|深/i.test(t || '')) return 'dark';
      } catch (e) {}
    }
    try {
      return (HW.matchMedia && HW.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    } catch (e) { return 'dark'; }
  }
  var LABEL = {};
  LABEL[GAME] = { icon: '🎮', name: '游戏版', sub: 'Galgame 全屏壳 · 连携 / 推演 / 立绘 / 标题界面' };
  LABEL[TEXT] = { icon: '📖', name: '文字版', sub: '酒馆原生气泡 · 状态栏 · 小地图追加输入框' };

  /* ── 找 SillyTavern / TavernHelper（多处探测，iframe 与宿主都试） ── */
  function pickCtx() {
    var cands = [];
    try { if (typeof SillyTavern !== 'undefined') cands.push(SillyTavern); } catch (e) {}
    try { cands.push(window.SillyTavern); } catch (e) {}
    try { cands.push(HW.SillyTavern); } catch (e) {}
    try { cands.push(window.parent && window.parent.SillyTavern); } catch (e) {}
    var first = null;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c) continue;
      var ctx = null;
      try { ctx = (typeof c.getContext === 'function') ? c.getContext() : c; } catch (e) { continue; }
      if (ctx && ctx.characters) {
        if (ctx.characters.length) return ctx;   /* 优先有角色数据的候选 */
        if (!first) first = ctx;
      }
    }
    return first;
  }
  function pickTH() {
    var cands = [];
    try { if (typeof TavernHelper !== 'undefined') cands.push(TavernHelper); } catch (e) {}
    try { cands.push(window.TavernHelper); } catch (e) {}
    try { cands.push(HW.TavernHelper); } catch (e) {}
    try { cands.push(window.parent && window.parent.TavernHelper); } catch (e) {}
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c && typeof c.getCurrentCharPrimaryLorebook === 'function') return c;
    }
    return null;
  }
  function chidOf(ctx, TH) {
    /* 真实环境 getContext().characterId 可能是字符串 "0"，不能只认 number */
    var cands = [ctx.characterId, ctx.this_chid, ctx.chid, ctx.character_id];
    for (var i = 0; i < cands.length; i++) {
      var v = cands[i];
      if (typeof v === 'number' && isFinite(v)) return v;
      if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
    }
    /* 兜底 1：用当前角色名在 characters 里反查下标 */
    var arr = ctx.characters || [];
    try {
      var nm = (TH && typeof TH.getCurrentCharacterName === 'function') ? TH.getCurrentCharacterName() : null;
      if (nm) {
        for (var j = 0; j < arr.length; j++) {
          if (arr[j] && (arr[j].name === nm || (arr[j].data && arr[j].data.name === nm))) return j;
        }
      }
    } catch (e) {}
    /* 兜底 2：只有一张卡时直接用 0 */
    if (arr.length === 1) return 0;
    return null;
  }
  function chidInfo(ctx) {
    return 'characterId=' + String(ctx.characterId) + '(' + typeof ctx.characterId + ')' +
      ', this_chid=' + String(ctx.this_chid) + '(' + typeof ctx.this_chid + ')' +
      ', characters=' + ((ctx.characters && ctx.characters.length) || 0);
  }
  /* writeExtensionField = _th_impl.writeExtensionField（Rk）。
     predefine.js 往 getContext() 里注入了它；若脚本跑在宿主 window 上则没有，
     这时从 TavernHelper._th_impl 取同一个函数，避免走不可靠的降级分支。 */
  function pickWriter(ctx, TH) {
    if (ctx && typeof ctx.writeExtensionField === 'function') return ctx.writeExtensionField;
    var cands = [];
    try { cands.push(window.TavernHelper); } catch (e) {}
    try { cands.push(HW.TavernHelper); } catch (e) {}
    try { cands.push(window.parent && window.parent.TavernHelper); } catch (e) {}
    if (TH) cands.push(TH);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c && c._th_impl && typeof c._th_impl.writeExtensionField === 'function') {
        return c._th_impl.writeExtensionField;
      }
    }
    return null;
  }

  /* ── 核心：写入模式 ───────────────────────────────────────────── */
  function wantedEnabled(name, mode) {
    if (name.indexOf('[共用]') === 0) return true;
    if (name.indexOf('[同层]') === 0) return mode === GAME;
    if (name.indexOf('[非同层]') === 0) return mode === TEXT;
    return null;
  }
  function wantedDisabled(scriptName, oldValue, mode) {
    if (scriptName.indexOf('[同层]') === 0) return mode !== GAME;
    if (scriptName.indexOf('[非同层]') === 0) {
      /* 「没闭合」那条原本就是关的，两种模式都保持关 */
      if (scriptName.indexOf('没闭合') >= 0) return true;
      return mode !== TEXT;
    }
    return !!oldValue;
  }
  function wantedBook(comment, mode, oldValue) {
    if (CFG.bookOffInText.indexOf(comment) >= 0) return mode === GAME;
    if (CFG.bookNonOnly.indexOf(comment) >= 0) return mode === TEXT;
    return !!oldValue;
  }

  /* ── 第 0 楼开场白改写 ─────────────────────────────────────────
     只改「还没真正开场」的聊天：第 0 楼是「（标题界面）」或带【开局】标签。
     已经聊了很久的（第 0 楼是某篇章的正式开场白）一律不动，避免吞剧情。 */
  async function rewriteOpening(mode, ctx) {
    var text = '';
    /* 优先直接从 getContext().chat 读第 0 楼，比 API 稳 */
    try {
      var cid = chidOf(ctx, pickTH());
      if (cid !== null && ctx.chat && ctx.chat[0]) {
        text = String(ctx.chat[0].mes || ctx.chat[0].message || '');
      }
    } catch (e0) {}
    if (!text) {
      var TH0 = pickTH();
      if (TH0 && typeof TH0.getChatMessages === 'function') {
        try {
          var msgs = await TH0.getChatMessages('0-0');
          if (msgs && msgs[0]) text = String(msgs[0].message || msgs[0].mes || '');
        } catch (e1) {}
      }
    }
    if (!text) return 'empty';
    if (!/（标题界面）|【开局\s*·\s*春日狂想曲】/.test(text)) return 'skip-long';
    var target = (mode === GAME) ? CFG.gameFirstMes : CFG.textFirstMes;
    if (text === target) return 'same';
    /* 用 chat 数组直接改 + 走 setChatMessage 落盘 */
    try {
      if (ctx.chat && ctx.chat[0]) ctx.chat[0].mes = target;
    } catch (e2) {}
    var TH = pickTH();
    if (TH && typeof TH.setChatMessage === 'function') {
      await TH.setChatMessage(0, { message: target }, { refresh: 'all' });
    }
    return 'ok';
  }

  async function applyMode(mode) {
    var oks = [], errs = [];
    var ctx = pickCtx();
    if (!ctx) throw new Error('拿不到 SillyTavern.getContext()（characters）');
    var TH = pickTH();
    var writer = pickWriter(ctx, TH);
    var chid = chidOf(ctx, TH);
    if (chid === null || !ctx.characters[chid]) {
      throw new Error('拿不到当前角色 characterId（' + chidInfo(ctx) +
        '）。请确认已进入该角色的聊天，刷新网页后重试');
    }
    /* 角色数据可能是浅加载（只有 name/avatar，没有 data.extensions）。
       writeExtensionField 内部会 await unshallowCharacter，先借它把 data 拉全。 */
    var chObj = ctx.characters[chid];
    if ((!chObj.data || !chObj.data.extensions) && writer) {
      try { await writer(chid, 'spr_mode_synced', mode + ':' + Date.now()); } catch (e) {}
      chObj = ctx.characters[chid];
    }
    var data = chObj && chObj.data;
    if (!data || !data.extensions || !data.extensions.tavern_helper) {
      throw new Error('角色卡 data 未加载（data=' + !!data + ', extensions=' + !!(data && data.extensions) +
        '），刷新网页后重试');
    }

    /* 1. 目标脚本数组（深拷贝，只改 enabled；其余字段一律保留，防 0 脚本） */
    var cur = data.extensions.tavern_helper.scripts || [];
    var newScripts = cur.map(function (s) {
      var x = JSON.parse(JSON.stringify(s));
      var w = wantedEnabled(String(x.name || ''), mode);
      if (w !== null) x.enabled = w;
      return x;
    });
    if (!newScripts.length) throw new Error('脚本数组为空，拒绝写入');

    /* 2. 内存里改正则 / 开场白 / 内嵌世界书 —— 稍后由 Rk 一起提交 */
    var curRegex = data.extensions.regex_scripts || [];
    var newRegex = curRegex.map(function (r) {
      var x = JSON.parse(JSON.stringify(r));
      x.disabled = wantedDisabled(String(x.scriptName || ''), !!r.disabled, mode);
      return x;
    });
    data.extensions.regex_scripts = newRegex;
    data.first_mes = (mode === GAME) ? CFG.gameFirstMes : CFG.textFirstMes;
    var embedded = 0;
    if (data.character_book && Array.isArray(data.character_book.entries)) {
      data.character_book.entries.forEach(function (e) {
        e.enabled = wantedBook(String(e.comment || ''), mode, e.enabled);
        embedded++;
      });
    }

    /* 3a. ★ 关键：酒馆助手运行时读的是 script_trees（角色对象 settings.scripts，
       持久化在 SillyTavern 的 settings.json）。卡数据里的 scripts 只是导出备份，
       只改卡数据会导致「刷新/新聊天后脚本又变回去」。必须先改这一层。 */
    if (TH && typeof TH.updateScriptTreesWith === 'function') {
      try {
        await TH.updateScriptTreesWith(function (trees) {
          (function walk(list) {
            (list || []).forEach(function (t) {
              if (!t) return;
              if (Array.isArray(t.scripts)) { walk(t.scripts); return; }
              var w = wantedEnabled(String(t.name || ''), mode);
              if (w !== null) t.enabled = w;
            });
          })(trees);
          return trees;
        }, { type: 'character' });
        oks.push('酒馆助手脚本树（刷新后不回退）');
      } catch (eT) {
        errs.push('script_trees 写入失败：' + (eT && eT.message ? eT.message : String(eT)));
      }
    } else {
      errs.push('拿不到 updateScriptTreesWith（酒馆助手版本过旧？）');
    }

    /* 3. 落盘：writeExtensionField 一次提交整个 data.extensions + data.first_mes。
       ★ Rk 内部有 _.isEqual(旧值, 新值) 短路：脚本开关本来就对时会直接 return，
         导致已改好的 regex / first_mes 不落盘、刷新后回退。
         所以先写一次必定变化的同步戳，强制提交一次，再写脚本数组。 */
    if (writer) {
      await writer(chid, 'spr_mode_synced', mode + ':' + Date.now());
      await writer(chid, 'tavern_helper.scripts', newScripts);
      oks.push('脚本开关 / 正则 / 开场白（已落盘）');
    } else {
      data.extensions.tavern_helper.scripts = newScripts;
      if (TH && typeof TH.replaceTavernRegexes === 'function') {
        await TH.replaceTavernRegexes(newRegex, { scope: 'character' });
        oks.push('正则（官方通道）');
        errs.push('未找到 writeExtensionField，脚本开关只改了内存，刷新后可能回退');
      } else if (typeof ctx.saveCharacterDebounced === 'function') {
        await ctx.saveCharacterDebounced();
        oks.push('角色卡（防抖保存）');
      } else {
        errs.push('未找到任何落盘接口，改动只在内存，刷新后会丢失');
      }
    }

    /* 4. 运行时世界书（独立 lorebook 文件才是提示词真正读取的源） */
    if (TH && typeof TH.getLorebookEntries === 'function' &&
        typeof TH.updateLorebookEntriesWith === 'function') {
      try {
        var wb = (typeof TH.getCurrentCharPrimaryLorebook === 'function')
          ? await TH.getCurrentCharPrimaryLorebook() : null;
        if (!wb && typeof TH.getCharWorldbookNames === 'function') {
          var names = await TH.getCharWorldbookNames();
          if (names && names.length) wb = names[0];
        }
        if (wb) {
          var before = await TH.getLorebookEntries(wb);
          var hit = 0;
          var _legacyOff = 0;
          var _present = {};
          await TH.updateLorebookEntriesWith(wb, function (es) {
            return (es || []).map(function (e) {
              var c = String(e.comment || '');
              if (CFG.bookOffInText.indexOf(c) >= 0 || CFG.bookNonOnly.indexOf(c) >= 0) { hit++; _present[c] = 1; }
              /* ★ 08:08 作者要求：新卡里已经没有「创作要求」这个条目，
                 但旧卡导入时留在世界书里的那份还在生效 —— 见到就关掉。 */
              if (c === '创作要求' || c === '创作要求（旧）') {
                e.enabled = false;
                _legacyOff++;
                return e;
              }
              e.enabled = wantedBook(c, mode, e.enabled);
              return e;
            });
          });
          oks.push('世界书条目 ' + hit + '/' + (CFG.bookOffInText.length + CFG.bookNonOnly.length) + ' 条命中【切换器 s48】');
          if (_legacyOff > 0) oks.push('已关闭旧条目「创作要求」' + _legacyOff + ' 条');

          /* ★ 07:55：绑定的世界书可能是早期导入的旧副本，缺条目（玩家看到的 8/21）。
             这里把**卡内 character_book 里存在、绑定书里却没有**的那几条补进去。
             只增不删、只碰这 21 个具名条目，不动玩家自己的条目。 */
          try {
            var _wantAll = CFG.bookOffInText.concat(CFG.bookNonOnly);
            var _embedded = (data.character_book && data.character_book.entries) || [];
            var _add = [];
            var _missNames = [];
            _wantAll.forEach(function (nm) {
              if (_present[nm]) return;
              _missNames.push(nm);
              for (var i = 0; i < _embedded.length; i++) {
                if (String(_embedded[i].comment || '') === nm) {
                  var cp = JSON.parse(JSON.stringify(_embedded[i]));
                  cp.enabled = wantedBook(nm, mode, false);
                  _add.push(cp);
                  break;
                }
              }
            });
            /* ★ 08:02：酒馆导入后常把内嵌世界书抽成独立文件，character_book 会被清空，
               这时 _add 是 0 条 —— 上面那条"补入"永远不会打印（玩家看到的 8/21 就是这个原因）。
               所以再兜一层：从 COS 上取这 21 条的原文来补。 */
            if (!_add.length && _missNames.length) {
              /* ★ 08:04：上一版用 fetch 拉 JSON，报 Failed to fetch —— 因为 COS 桶没配跨域头，
                 fetch 是"要许可"的请求，会被浏览器直接拒掉。
                 所以改成**注入 <script>**（JSONP 式）：script 标签不受 CORS 约束，
                 线上那个文件就是把数组赋给 window.__TH_WBPATCH__。 */
              try {
                var _plist = await new Promise(function (res) {
                  var el = document.createElement('script');
                  el.src = 'https://123-1532053135.cos.ap-guangzhou.myqcloud.com/chunri/wbpatch.js?t=' + Date.now();
                  var done = false;
                  el.onload = function () { if (done) return; done = true; try { res(window.__TH_WBPATCH__ || []); } catch (eL) { res([]); } };
                  el.onerror = function () { if (done) return; done = true; res([]); };
                  (document.head || document.documentElement).appendChild(el);
                  setTimeout(function () { if (done) return; done = true; try { res(window.__TH_WBPATCH__ || []); } catch (eT) { res([]); } }, 6000);
                });
                (_plist || []).forEach(function (e) {
                  var nm = String(e.comment || '');
                  if (_missNames.indexOf(nm) < 0) return;
                  var cp = JSON.parse(JSON.stringify(e));
                  cp.enabled = wantedBook(nm, mode, false);
                  _add.push(cp);
                });
                oks.push('从线上取回条目原文 ' + _add.length + ' 条');
              } catch (eFp) {
                errs.push('线上条目原文拉取失败：' + (eFp && eFp.message || eFp));
              }
            }
            if (_add.length) {
              var _done = false;
              if (typeof TH.createLorebookEntries === 'function') {
                try { await TH.createLorebookEntries(wb, _add); _done = true; } catch (eC1) { _done = false; }
              }
              if (!_done) {
                await TH.updateLorebookEntriesWith(wb, function (es) {
                  var out = (es || []).slice();
                  _add.forEach(function (n) { out.push(n); });
                  return out;
                });
              }
              /* 回读确认：补完再数一次，让玩家看到到底进没进去 */
              var _hit2 = 0;
              try {
                var _after = await TH.getLorebookEntries(wb);
                var _has = {};
                (_after || []).forEach(function (e) { _has[String(e.comment || '')] = 1; });
                _wantAll.forEach(function (nm) { if (_has[nm]) _hit2++; });
              } catch (eChk) { _hit2 = -1; }
              oks.push('补入缺失条目 ' + _add.length + ' 条' + (_hit2 >= 0 ? '（回读 ' + _hit2 + '/21）' : ''));
            }
          } catch (eAdd) {
            errs.push('补入缺失条目失败：' + (eAdd && eAdd.message || eAdd));
          }
          if (hit === 0) errs.push('世界书里没匹配到任何模式条目，请确认卡内世界书已绑定');
          void before;
        } else {
          errs.push('没找到当前角色主世界书，内嵌 character_book 已改 ' + embedded + ' 条');
        }
      } catch (e) {
        errs.push('世界书写入失败：' + (e && e.message ? e.message : String(e)));
      }
    } else {
      errs.push('TavernHelper 世界书接口不可用，内嵌 character_book 已改 ' + embedded + ' 条');
    }

    /* 5. 回读校验：脚本 enabled 与开场白必须真的变了 */
    try {
      var back = (ctx.characters[chid].data.extensions.tavern_helper.scripts || []);
      var bad = back.filter(function (s) {
        var w = wantedEnabled(String(s.name || ''), mode);
        return w !== null && s.enabled !== w;
      });
      if (bad.length) errs.push('回读校验：' + bad.length + ' 个脚本 enabled 未生效');
      else oks.push('回读校验通过');
      if (ctx.characters[chid].data.first_mes !== ((mode === GAME) ? CFG.gameFirstMes : CFG.textFirstMes)) {
        errs.push('回读校验：first_mes 未生效');
      }
    } catch (e) {
      errs.push('回读校验异常：' + (e && e.message ? e.message : String(e)));
    }

    /* 6. 第 0 楼：只在还没真正开场时改写成目标模式的开场白（触发对应开局脚本） */
    var openRes = 'skip';
    try { openRes = await rewriteOpening(mode, ctx); }
    catch (e) { openRes = 'err:' + (e && e.message ? e.message : String(e)); }
    if (openRes === 'ok') oks.push('第 0 楼开场白');
    else if (openRes.indexOf('err:') === 0) errs.push('第 0 楼改写失败：' + openRes.slice(4));

    return { oks: oks, errs: errs, fatal: errs.some(function (x) { return /未生效|回退|丢失|没匹配到|script_trees 写入失败|拿不到 updateScriptTreesWith/.test(x); }) };
  }

  /* ── 手动清单（写入失败时兜底展示） ───────────────────────────── */
  function manualText(mode) {
    var g = mode === GAME;
    return [
      '1. 酒馆助手脚本：' + (g ? '开启全部 [同层] 6 个、关闭全部 [非同层] 5 个'
                              : '关闭全部 [同层] 6 个、开启全部 [非同层] 5 个') + '；[共用] 保持开。',
      '2. 正则：' + (g ? '开启 [同层] 5 条、关闭 [非同层] 5 条'
                       : '关闭 [同层] 5 条、开启 [非同层] 5 条（「没闭合」那条保持关）') + '。',
      '3. 世界书：' + (g ? '开启 ' + CFG.bookOffInText.join('、') + '；关闭带「·非同层」后缀的条目'
                         : '关闭 ' + CFG.bookOffInText.join('、') + '；开启带「·非同层」后缀的条目') + '。',
      '4. 开场白：换成' + (g ? '「（标题界面）」那条' : '带【开局 · 春日狂想曲】标签那条') + '。',
      '5. 刷新网页，并新开一个聊天。'
    ].join('\n');
  }

  /* ── UI ──────────────────────────────────────────────────────── */
  var CSS = [
    /* v1.2：z-index 拉满 —— 同层全屏壳最高用到 2147483646，原来 2147483600 会被整个盖住
       （桌面端文字版没事，手机端默认游戏版就看不见球）。 */
    '#spr-sw-root{position:fixed!important;',
    '  right:calc(16px + env(safe-area-inset-right,0px))!important;',
    '  bottom:calc(16px + env(safe-area-inset-bottom,0px))!important;',
    '  z-index:2147483647!important;',
    '  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif!important;',
    '  font-size:13px!important;line-height:1.55!important;color:var(--sw-tx)!important;user-select:none!important;',
    '  touch-action:none!important;}',
    /* 手机端：避开底部输入框与手势条，球略小 */
    '@media (max-width: 820px){',
    '  #spr-sw-root{right:10px!important;bottom:calc(84px + env(safe-area-inset-bottom,0px))!important;}',
    '  #spr-sw-ball{width:46px!important;height:46px!important;}',
    '  #spr-sw-panel{width:min(88vw,330px)!important;}',
    '}',
    '#spr-sw-root #spr-sw-panel{touch-action:auto!important;}',
    '#spr-sw-root[data-theme="dark"]{--sw-bg:#1e1f22;--sw-tx:#ecebe7;--sw-bd:#3a3b40;--sw-hi:#2b2c31;--sw-ac:#d9c7a3;--sw-dim:#a5a39c;}',
    '#spr-sw-root[data-theme="light"]{--sw-bg:#faf9f5;--sw-tx:#26241f;--sw-bd:#d8d5cc;--sw-hi:#f0eee7;--sw-ac:#7a6843;--sw-dim:#6d6a62;}',
    '#spr-sw-ball{width:52px!important;height:52px!important;border-radius:50%!important;cursor:grab!important;touch-action:none!important;',
    '  background:var(--sw-bg)!important;border:1px solid var(--sw-bd)!important;box-shadow:0 6px 20px rgba(0,0,0,.28)!important;',
    '  display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;',
    '  transition:transform .18s ease,box-shadow .18s ease!important;}',
    '#spr-sw-ball:hover{transform:translateY(-2px)!important;box-shadow:0 9px 26px rgba(0,0,0,.34)!important;}',
    '#spr-sw-root.sw-drag #spr-sw-ball{cursor:grabbing!important;transform:none!important;transition:none!important;}',
    '#spr-sw-ball .sw-ico{font-size:19px!important;line-height:1!important;}',
    '#spr-sw-ball .sw-tag{font-size:9px!important;letter-spacing:.5px!important;color:var(--sw-dim)!important;margin-top:2px!important;}',
    '#spr-sw-panel{position:absolute!important;right:0!important;bottom:64px!important;width:330px!important;',
    '  background:var(--sw-bg)!important;border:1px solid var(--sw-bd)!important;border-radius:14px!important;',
    '  box-shadow:0 14px 44px rgba(0,0,0,.38)!important;padding:16px!important;display:none!important;}',
    '#spr-sw-panel.sw-open{display:block!important;}',
    '#spr-sw-panel h3{margin:0 0 2px!important;font-size:15px!important;font-weight:600!important;color:var(--sw-tx)!important;}',
    '.sw-now{font-size:11px!important;color:var(--sw-dim)!important;margin-bottom:12px!important;}',
    '.sw-opt{display:block!important;padding:10px 11px!important;margin-bottom:8px!important;border-radius:9px!important;',
    '  border:1px solid var(--sw-bd)!important;cursor:pointer!important;background:transparent!important;',
    '  transition:background .15s,border-color .15s!important;}',
    '.sw-opt:hover{background:var(--sw-hi)!important;}',
    '.sw-opt.sw-sel{border-color:var(--sw-ac)!important;background:var(--sw-hi)!important;}',
    '.sw-opt .sw-t{font-weight:600!important;color:var(--sw-tx)!important;font-size:13px!important;}',
    '.sw-opt .sw-s{font-size:11px!important;color:var(--sw-dim)!important;margin-top:2px!important;}',
    '.sw-tip{font-size:11px!important;color:var(--sw-dim)!important;margin:10px 0 12px!important;',
    '  border-top:1px solid var(--sw-bd)!important;padding-top:10px!important;}',
    '.sw-row{display:flex!important;gap:8px!important;justify-content:flex-end!important;}',
    '.sw-btn{padding:7px 14px!important;border-radius:8px!important;border:1px solid var(--sw-bd)!important;',
    '  background:transparent!important;color:var(--sw-tx)!important;cursor:pointer!important;font-size:12px!important;',
    '  font-family:inherit!important;}',
    '.sw-btn:hover{background:var(--sw-hi)!important;}',
    '.sw-btn.sw-primary{border-color:var(--sw-ac)!important;color:var(--sw-ac)!important;font-weight:600!important;}',
    '.sw-btn:disabled{opacity:.42!important;cursor:not-allowed!important;}',
    '#sw-msg{font-size:11px!important;margin-top:10px!important;white-space:pre-wrap!important;color:var(--sw-dim)!important;}',
    '#sw-msg.sw-ok{color:var(--sw-ac)!important;} #sw-msg.sw-err{color:#d98b7a!important;}',
    '#sw-manual{font-size:10px!important;color:var(--sw-dim)!important;margin-top:8px!important;}',
    '#sw-manual pre{white-space:pre-wrap!important;word-break:break-all!important;margin:6px 0 0!important;',
    '  font-family:inherit!important;font-size:10px!important;line-height:1.5!important;}'
  ].join('\n');

  function build() {
    if (HD.getElementById('spr-sw-root')) return;
    if (!HD.head) return;
    var st = HD.createElement('style');
    st.id = 'spr-sw-style';
    st.textContent = CSS;
    HD.head.appendChild(st);

    var root = HD.createElement('div');
    root.id = 'spr-sw-root';
    root.setAttribute('data-theme', theme());
    root.innerHTML = [
      '<div id="spr-sw-panel">',
      '  <h3>游玩模式</h3>',
      '  <div class="sw-now" id="sw-now"></div>',
      '  <div class="sw-opt" data-mode="game"><div class="sw-t">🎮 游戏版</div>',
      '    <div class="sw-s">Galgame 全屏壳 · 连携 / 推演 / 立绘 / 标题界面</div></div>',
      '  <div class="sw-opt" data-mode="text"><div class="sw-t">📖 文字版</div>',
      '    <div class="sw-s">酒馆原生气泡 · 状态栏 · 小地图追加输入框</div></div>',
      '  <div class="sw-tip">切换会写入卡数据并<b>自动刷新网页</b>以清理缓存。<br>',
      '    建议在新聊天中切换；当前聊天已发出的第 0 楼不会变。</div>',
      '  <div class="sw-row"><button class="sw-btn" id="sw-cancel">取消</button>',
      '    <button class="sw-btn sw-primary" id="sw-ok">确定切换</button></div>',
      '  <div id="sw-msg"></div>',
      '  <details id="sw-manual" style="display:none"><summary>手动切换清单</summary><pre id="sw-manual-txt"></pre></details>',
      '</div>',
      '<div id="spr-sw-ball" title="切换游玩模式"><span class="sw-ico"></span><span class="sw-tag"></span></div>'
    ].join('');
    (HD.body || HD.documentElement).appendChild(root);

    var ball = HD.getElementById('spr-sw-ball');
    var panel = HD.getElementById('spr-sw-panel');
    var msg = HD.getElementById('sw-msg');
    var btnOk = HD.getElementById('sw-ok');
    var btnCancel = HD.getElementById('sw-cancel');
    var opts = root.querySelectorAll('.sw-opt');
    var picked = readMode();
    var busy = false;
    var suppressClick = false;   /* 刚拖完的那一下 click 要吞掉，不然会误开弹层 */

    function paint() {
      var cur = readMode();
      try { HW.localStorage.setItem(KEY, cur); } catch (eLS) {}   /* 缓存对齐真值，防残留误导 */
      var L = LABEL[cur];
      ball.querySelector('.sw-ico').textContent = L.icon;
      ball.querySelector('.sw-tag').textContent = L.name;
      HD.getElementById('sw-now').textContent = '当前：' + L.icon + ' ' + L.name + ' · ' + L.sub;
      for (var i = 0; i < opts.length; i++) {
        var on = opts[i].getAttribute('data-mode') === picked;
        opts[i].classList.toggle('sw-sel', on);
      }
      btnOk.disabled = busy || (picked === cur);
      btnOk.textContent = busy ? '切换中…' : (picked === cur ? '已是当前模式' : '确定切换');
    }
    function say(text, cls) {
      msg.textContent = text || '';
      msg.className = cls || '';
    }
    for (var i = 0; i < opts.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          if (busy) return;
          picked = el.getAttribute('data-mode');
          say('');
          paint();
        });
      })(opts[i]);
    }
    ball.addEventListener('click', function () {
      if (busy) return;
      if (suppressClick) { suppressClick = false; return; }   /* 拖拽结束不触发弹层 */
      panel.classList.toggle('sw-open');
      if (panel.classList.contains('sw-open')) { picked = readMode(); paint(); say(''); }
    });
    btnCancel.addEventListener('click', function () {
      if (busy) return;
      panel.classList.remove('sw-open');
      say('');
    });
    btnOk.addEventListener('click', async function () {
      if (busy || picked === readMode()) return;
      busy = true;
      paint();
      say('正在写入卡数据…');
      var target = picked;
      var r;
      try { r = await applyMode(target); }
      catch (e) { r = { oks: [], errs: [String(e && e.message ? e.message : e)], fatal: true }; }

      if (r.fatal) {
        busy = false;
        say('✗ 切换未完全生效，未刷新网页，避免假成功。\n' + r.errs.join('\n'), 'sw-err');
        HD.getElementById('sw-manual').style.display = 'block';
        HD.getElementById('sw-manual-txt').textContent = manualText(target);
        paint();
        return;
      }
      try { HW.localStorage.setItem(KEY, target); } catch (e) {}
      var tail = r.errs.length ? ('\n提示：' + r.errs.join('；')) : '';
      say('✓ ' + r.oks.join('、') + '\n已切换为「' + LABEL[target].name + '」，即将自动刷新网页…' + tail, 'sw-ok');
      if (r.errs.length) {
        HD.getElementById('sw-manual').style.display = 'block';
        HD.getElementById('sw-manual-txt').textContent = manualText(target);
      }
      setTimeout(function () {
        try { HW.location.reload(); }
        catch (e) { try { window.location.reload(); } catch (e2) {} }
      }, 900);
    });
    /* ── v10.6：悬浮球可拖动 ────────────────────────────────────────
       原来只有 CSS 的 right/bottom，球是钉死的。这里补一套指针拖拽：
       · 位置写 localStorage，刷新后还在原处；
       · 拖拽时加 .sw-drag 去掉 hover 位移，跟手；
       · 位置变更后弹层自动换成「朝上 / 朝下、左对齐 / 右对齐」，
         球拖到左上角也不会让 330px 的弹层飞出屏幕。 */
    (function initBallDrag() {
      var POS_KEY = 'SPR_SW_BALL_POS';
      var dragging = false, moved = false, sx = 0, sy = 0, ix = 0, iy = 0;

      function setImp(el, k, v) {
        try { el.style.setProperty(k, v, 'important'); } catch (e) { try { el.style[k] = v; } catch (e2) {} }
      }
      function applyPos(x, y) {
        var w = HW.innerWidth || HD.documentElement.clientWidth || 800;
        var h = HW.innerHeight || HD.documentElement.clientHeight || 600;
        var bw = ball.offsetWidth || 52, bh = ball.offsetHeight || 52;
        x = Math.max(4, Math.min(x, w - bw - 4));
        /* 移动端底部有输入框和手势条：可用区收到 78%，别让球停在那儿 */
        var maxY = h - bh - 4;
        if (w < 820) maxY = Math.min(maxY, Math.round(h * 0.78));
        y = Math.max(4, Math.min(y, maxY));
        setImp(root, 'left', x + 'px');
        setImp(root, 'top', y + 'px');
        setImp(root, 'right', 'auto');
        setImp(root, 'bottom', 'auto');
        /* 弹层方向：球在上半屏往下弹、下半屏往上弹；左半屏左对齐、右半屏右对齐 */
        var up = y > h * 0.42;
        setImp(panel, 'bottom', up ? (bh + 12) + 'px' : 'auto');
        setImp(panel, 'top', up ? 'auto' : (bh + 12) + 'px');
        var rightSide = (x + bw / 2) > w * 0.45;
        setImp(panel, 'right', rightSide ? '0' : 'auto');
        setImp(panel, 'left', rightSide ? 'auto' : '0');
      }
      function savePos() {
        try {
          var r = root.getBoundingClientRect();
          HW.localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
        } catch (e) {}
      }
      /* 恢复上次位置（没有记录就保持 CSS 的右下角） */
      try {
        var saved = JSON.parse(HW.localStorage.getItem(POS_KEY) || 'null');
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') applyPos(saved.x, saved.y);
      } catch (e) {}

      ball.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true; moved = false;
        sx = e.clientX; sy = e.clientY;
        var r = root.getBoundingClientRect();
        ix = r.left; iy = r.top;
        try { ball.setPointerCapture(e.pointerId); } catch (ec) {}
      });
      ball.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          moved = true;
          try { root.classList.add('sw-drag'); } catch (e0) {}
          if (panel.classList.contains('sw-open')) panel.classList.remove('sw-open');
        }
        if (moved) {
          applyPos(ix + dx, iy + dy);
          if (e.cancelable) e.preventDefault();
        }
      });
      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        try { root.classList.remove('sw-drag'); } catch (e0) {}
        try { ball.releasePointerCapture(e.pointerId); } catch (er) {}
        if (moved) {
          savePos();
          suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 120);
        }
      }
      ball.addEventListener('pointerup', endDrag);
      ball.addEventListener('pointercancel', function (e) {
        dragging = false;
        try { root.classList.remove('sw-drag'); } catch (e0) {}
        try { ball.releasePointerCapture(e.pointerId); } catch (er) {}
      });
      /* 窗口尺寸变化：把球拉回可视区，别丢在屏幕外 */
      HW.addEventListener('resize', function () {
        try { var r = root.getBoundingClientRect(); applyPos(r.left, r.top); savePos(); } catch (e) {}
      });
    })();

    paint();

    /* 全屏壳 / 其它脚本可能会挪动或隐藏 body 子节点，做一次轻量自愈 */
    try {
      var mo = new (HW.MutationObserver || window.MutationObserver)(function () {
        if (!root.isConnected) {
          try { (HD.body || HD.documentElement).appendChild(root); } catch (e) {}
        }
        if (root.style.display === 'none') root.style.display = '';
      });
      mo.observe(HD.body || HD.documentElement, { childList: true });
      mo.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) {}
  }

  function boot() {
    try { if (HW[LOCK]) return; HW[LOCK] = true; } catch (e) {}
    try { build(); } catch (e) {
      try { HW[LOCK] = false; } catch (e2) {}
      if (typeof console !== 'undefined') console.error('[模式切换悬浮球] 挂载失败', e);
    }
  }
  if (HD.readyState === 'loading') HD.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
