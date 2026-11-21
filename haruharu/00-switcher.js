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
  var CFG = {"defaultMode":"game","gameFirstMes":"<content>\n【开局 · 春日狂想曲】\n</content>","textFirstMes":"<content>\n【开局 · 春日狂想曲】\n</content>","bookOffInText":["连携判定","内置思维链","格式"],"bookAlwaysOn":["[mvu_update]变量更新规则","[mvu_update]变量输出格式"],"bookNonOnly":["内置思维链·文字版","格式·文字版"],"bookAlwaysOff":["[InitVar]初始变量"]};
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

  /* ══ ★ 2026-11-15 23:5x 回滚：这里曾经有一段「`__SPR_LOADER_GEN__ < 2` 就把整张卡
     拦死、只留一屏『版本过低，请下载最新卡重导』」的闸门，上线十分钟就被玩家实锤
     「全炸了」，已整块删除。**不要再加回来，也不要换个名字加回来。**

     ── 它为什么一定会炸 ────────────────────────────────────────────────
     这段的原意是「新卡才广播 GEN=2、老卡不广播 ⇒ 老卡一律拦」。听上去对，
     但漏掉了唯一要紧的事实：**玩家手里拿的本来就是之前发出去的那张卡**，
     那份 loader 里根本没有 GEN 这个变量。
     于是 GEN 恒为 0，「小于 2」在**每一个真实玩家**身上都成立 ⇒ 一上线全服白屏，
     一个都进不去。我拿刚重出的新卡自测是通的，因为新卡才带 GEN=2 ——
     这正好是最没用的那种自测。

     ── 教训（留着，别删）────────────────────────────────────────────────
     **「需要玩家先换卡/重导才能成立」的判据，绝对不能拿来当开机闸门。**
     凡是想靠「卡内刚下发的新变量」做判断，先问一句：老卡里这个变量是什么？
     只要答案是「不存在」，就不能让「值为空」等于「拦停」——
     那等于把判据的默认值设成了「全员有罪」。

     ── 那「让老卡显示版本过低」这个需求呢 ──────────────────────────────
     它由 loader 自己完成，不需要这里配合：老卡的 loader 只会去 git 仓库，
     而 git 侧的业务脚本我们已撤掉、COS 才是唯一来源 ⇒ 老卡拉不到东西，
     停的是它自己那屏「拉取失败」。
     换句话说：**老卡是「拉不到」，不是「被判定为老」**。判不出来就别判。 */

  /* ★ 唯一还留着的闸：loader 明确报「有几个文件没拉到」时，别让玩家进去。
     缺 10-core 是白屏，缺 13-gal 是没插图，缺 00-switcher 是这个球没了 ——
     都是「看起来能用、其实半残」，比明说更坑。

     ★ 判据只有一条：__SPR_HOT_PARTIAL__ 非空（= loader 自己知道缺了哪几个）。
       **绝不许加「等 N 秒还没 READY 就判死」这种超时分支**：loader 是 await
       逐个加载的，本脚本（COMMON 第三个）跑起来时 GAME/TEXT 那 5 个还没开始
       拉，任何基于时间的判死都只是在赌网速 —— 赌输一次就是全服白屏。
       超时只允许做一件事：**停止轮询**，绝不拦停。 */
  (function hotGate() {
    var STEP = 300, MAX_TICKS = 200, n = 0;   /* 200 × 300ms = 60s 后只是不再看了 */

    function tick() {
      var partial = '', ready = 0;
      try { partial = String(HW.__SPR_HOT_PARTIAL__ || ''); } catch (e1) {}
      if (partial) { showHotPullFail(partial); return; }
      try { ready = Number(HW.__SPR_HOT_READY__ || 0) || 0; } catch (e2) {}
      if (ready === 1) return;          /* 全拉到了，收工 */
      if (++n >= MAX_TICKS) return;     /* 超时 = 停止轮询，**不拦** */
      setTimeout(tick, STEP);
    }
    setTimeout(tick, STEP);
  })();

  /* ══ 拦停屏：脚本这次没拉全 ═══════════════════════════════════════════
     ★ 唯一调用点是顶上 hotGate，判据只有一条：__SPR_HOT_PARTIAL__ 非空。
     也就是说这张屏**只在 loader 自己知道「缺了哪几个文件」时才挂**，
     永远不会因为「读不到某个新标记」而误伤 —— 2026-11-15 全服白屏就是
     误伤出来的（见文件顶上那段回滚说明）。

     ── 为什么缺一个文件就整卡拦停，而不让玩家凑合玩 ────────────────────
     缺 10-core 是白屏，缺 13-gal 是没插图，缺 00-switcher 是悬浮球没了。
     共同点是「看起来能用、其实半残」，而且残的地方玩家未必看得出来 ——
     用缺件的脚本继续跑，会把存档变量写成新旧混杂，比打不开更糟。
     所以宁可明说「这次先别进去」。

     ★ 注意：这张屏**不许**再承担「版本过低 / 请重导卡」那套语义。
       老卡根本走不到这里 —— 老卡 loader 只会去那个已废弃的 git 仓库，
       拿不到脚本，停的是它自己那屏拉取失败。判不出来就别判。 */
  function showHotPullFail(missFiles) {
    var MID = 'th-hot-fail-mask', SID = 'th-hot-fail-style';
    var cardVer = '', cardSeq = 0;
    try { cardVer = String(HW.__SPR_CARD_VER__ || HW.__SPR_CARD_VER || ''); } catch (e1) {}
    try { cardSeq = Number(HW.__SPR_SEQ__ || 0) || 0; } catch (e2) {}
    var tag = cardVer ? (cardVer + (cardSeq ? ' · seq ' + cardSeq : '')) : '';
    var miss = String(missFiles || '').split(',').filter(function (x) { return !!x; });
    if (!miss.length) miss = ['(未报告具体文件)'];

    function paint() {
      try {
        if (HD.getElementById(MID)) return;
        if (!HD.getElementById(SID)) {
          var st = HD.createElement('style');
          st.id = SID;
          st.textContent = [
            '#th-hot-fail-mask{position:fixed;inset:0;z-index:2147483647!important;',
            'display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;',
            'background:radial-gradient(120% 90% at 50% 0%,#1c1a16 0%,#0d0c0a 55%,#070706 100%);',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
            'color:#e8e2d4;overflow:auto;-webkit-font-smoothing:antialiased;}',
            '#th-hot-fail-mask *{box-sizing:border-box;}',
            '.th-hf-card{position:relative;width:100%;max-width:520px;padding:38px 34px 30px;',
            'border-radius:18px;text-align:center;',
            'background:linear-gradient(180deg,rgba(38,34,27,.96),rgba(20,18,15,.98));',
            'border:1px solid rgba(212,175,95,.34);',
            'box-shadow:0 0 0 1px rgba(0,0,0,.6),0 26px 70px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,236,190,.07);}',
            '.th-hf-card::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;border-radius:18px 18px 0 0;',
            'background:linear-gradient(90deg,transparent,#d4af5f 22%,#f3dfa6 50%,#d4af5f 78%,transparent);opacity:.85;}',
            '.th-hf-eyebrow{font-size:10px;letter-spacing:.42em;color:#8d8064;text-transform:uppercase;',
            'margin:0 0 14px;padding-left:.42em;}',
            '.th-hf-title{margin:0 0 6px;font-size:29px;font-weight:700;letter-spacing:.09em;color:#f0dda6;',
            'text-shadow:0 0 26px rgba(212,175,95,.32);}',
            '.th-hf-sub{margin:0 0 22px;font-size:12.5px;letter-spacing:.16em;color:#7d735c;}',
            '.th-hf-rule{height:1px;margin:0 auto 22px;width:62%;',
            'background:linear-gradient(90deg,transparent,rgba(212,175,95,.42),transparent);}',
            '.th-hf-body{margin:0 0 20px;font-size:14px;line-height:2;color:#b9b1a0;text-align:left;}',
            '.th-hf-body b{color:#f0dda6;font-weight:600;}',
            '.th-hf-act{display:inline-block;margin:4px auto 18px;padding:13px 30px;border-radius:10px;',
            'font-size:15px;font-weight:700;letter-spacing:.06em;color:#201a0d;',
            'background:linear-gradient(180deg,#f3dfa6,#d4af5f);',
            'box-shadow:0 8px 24px rgba(212,175,95,.26),inset 0 1px 0 rgba(255,255,255,.5);}',
            '.th-hf-note{margin:0 0 16px;font-size:12px;line-height:1.95;color:#6d6553;text-align:left;',
            'border-left:2px solid rgba(212,175,95,.26);padding-left:12px;}',
            '.th-hf-btn{display:inline-block;margin-top:2px;padding:9px 22px;border-radius:8px;cursor:pointer;',
            'font-size:12.5px;letter-spacing:.05em;color:#cbbd97;background:rgba(212,175,95,.09);',
            'border:1px solid rgba(212,175,95,.3);transition:background .16s,color .16s;}',
            '.th-hf-btn:hover{background:rgba(212,175,95,.18);color:#f0dda6;}',
            '.th-hf-foot{margin:18px 0 0;font-size:10.5px;letter-spacing:.1em;color:#4f4a3e;}'
          ].join('');
          (HD.head || HD.documentElement).appendChild(st);
        }

        var d = HD.createElement('div');
        d.id = MID;
        d.innerHTML = [
          '<div class="th-hf-card">',
          '<p class="th-hf-eyebrow">Hot Update Failed</p>',
          '<h1 class="th-hf-title">脚本没拉全</h1>',
          '<p class="th-hf-sub">这次先别进去</p>',
          '<div class="th-hf-rule"></div>',
          '<p class="th-hf-body">卡是新的，但<b>热更源这次没把脚本给全</b>。<br>',
          /* ★ 2026-11-18：文案跟着托管改。2026-11-17 已从腾讯 COS 全面转回 GitHub，
             原文还写着「只认腾讯 COS 一条通道」—— 玩家看到会以为要连 COS，
             排查时也会朝错误的方向找（COS 那边早就停了，怎么连都是不通）。
             现在如实说：GitHub 的四个 jsDelivr 镜像 + raw 兜底，全都失败才停在这。 */
          '脚本走 GitHub 的四个加速镜像，全都不通才会停在这一屏。</p>',
          '<div class="th-hf-act">检查网络后刷新</div>',
          '<p class="th-hf-note">缺的文件：', miss.join('、'), '<br>',
          '少任何一个都会变成「看起来能用、其实半残」，所以这里直接拦住。<br>',
          '跟你的存档没关系，刷新重试即可。</p>',
          '<div class="th-hf-btn" data-thhf="reload">重新加载</div>',
          '<p class="th-hf-foot">', tag ? '卡内版本 ' + tag : '卡内版本未知', '</p>',
          '</div>'
        ].join('');
        (HD.body || HD.documentElement).appendChild(d);

        d.addEventListener('click', function (ev) {
          var t = ev && ev.target;
          if (!t || !t.getAttribute || t.getAttribute('data-thhf') !== 'reload') return;
          try { HW.location.reload(); } catch (eR) {}
        });
      } catch (e) {
        try { console.error('[热更拦截] 提示层挂载失败', e); } catch (e3) {}
      }
    }

    if (HD.readyState === 'loading') HD.addEventListener('DOMContentLoaded', paint, { once: true });
    else paint();
    /* 酒馆助手偶尔会把 body 整个换掉（切楼层 / 重渲染），补一次挂载，幂等 */
    try {
      setTimeout(paint, 800);
      setTimeout(paint, 2600);
    } catch (eT) {}

    /* ══ 遮罩必须一直是最顶上的那一层 ══════════════════════════════════
       本脚本是 COMMON 第三个，只比 10-core 早一个文件 —— 拦停之后 10-core 照样
       会加载并把全屏壳（z-index 2147483646）搭起来。遮罩写的是 2147483647，
       数字上盖得住，但有两个坑：
         · 酒馆助手 / 10-core 会往 body 追加新的层叠上下文（transform、filter、
           will-change 任意一个都会），届时 z-index 只在它自己那层里比，谁后挂谁在上；
         · 玩家点一下、滚一下，10-core 可能把某些浮层 reflow 到 body 末尾。
       所以除了数字，还要**保证节点顺序在最后**：每次 body 子节点有变动就把它搬回末尾。
       这不会引起死循环 —— 搬的是同一个节点，且只在「它不再是最后一个」时才搬。 */
    try {
      var mo = new (HW.MutationObserver || window.MutationObserver)(function () {
        var m = HD.getElementById(MID);
        if (!m) { paint(); return; }
        var b = HD.body || HD.documentElement;
        if (b && b.lastElementChild !== m) {
          try { b.appendChild(m); } catch (eA) {}
        }
      });
      mo.observe(HD.body || HD.documentElement, { childList: true });
    } catch (eMO) {}
  }

  function readMode() {
    /* ★ v10.9：先读玩家自己选的那个。
       旧逻辑靠「[同层] 脚本里有 enabled=true」判模式，但热更卡把 13 个业务脚本
       全部设成冷备 enabled=false —— 这个判据永远返回 false，
       于是不管在游戏版还是文字版，嗅探一律返回文字版（球显示错、加载错脚本）。
       现在：localStorage 优先；script_trees / 卡数据只在「确实存在启用的 [同层]」
       时才判 GAME，全禁用视为热更卡正常态，跳过不判。 */
    var _vL = '';
    try { _vL = String(HW.localStorage.getItem(KEY) || ''); } catch (eL) {}
    if (_vL !== GAME && _vL !== TEXT) _vL = '';
    /* ★★★ 2026-11-18 21:4x：作者「我他妈游戏版，一直显示已经是文字版了」。
       ── 病根 ──
       KEY（SPR_UNIFIED_MODE）是**跨聊天、跨卡**存在 localStorage 里的一个字符串，
       只要它写着 text，这里第一句就直接 return —— 哪怕此刻跑的分明是游戏版
       （[同层] 脚本全开、gal 壳都在）。切过模式、换过卡、导过新卡之后，
       这个键就可能是上一次留下的陈旧值，于是「界面是游戏版、标签说文字版」。
       ── 改法 ──
       KEY 只当**没有证据时的默认值**；有证据（[同层] 脚本在启用 = 游戏版在跑）
       就以证据为准，并顺手把 KEY 治好（写回证据值，下次不用再猜）。
       热更卡那套（业务脚本全冷备）不受影响：那时没有证据，照旧用 KEY。 */
    var _ev = null;   /* 嗅探证据：GAME / TEXT / null(无证据) */

    var TH = pickTH();
    if (TH && typeof TH.getScriptTrees === 'function') {
      try {
        var trees = TH.getScriptTrees({ type: 'character' });
        var flat = flattenTrees(trees);
        var on0 = flat.filter(function (s) {
          return String(s.name || '').indexOf('[同层]') === 0 && s.enabled;
        });
        var off0 = flat.filter(function (s) {
          return String(s.name || '').indexOf('[非同层]') === 0 && s.enabled;
        });
        if (on0.length) _ev = GAME;
        else if (off0.length) _ev = TEXT;
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
          var off1 = ss0.some(function (s) {
            return String(s.name || '').indexOf('[非同层]') === 0 && s.enabled;
          });
          if (on1) _ev = GAME;
          else if (off1) _ev = TEXT;
        }
      }
    } catch (e1) {}
    /* 证据优先；没有证据才用 KEY；都没有才用默认值。 */
    if (_ev) {
      if (_vL !== _ev) { try { HW.localStorage.setItem(KEY, _ev); } catch (eHeal) {} }
      return _ev;
    }
    if (_vL) return _vL;
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

  /* ★ v1.27：「球上写什么字」。
     作者原话：「那个游戏切换的悬浮球，改的更明显一点，玩家老不知道可以当场切换模式。
     文字上改为『想玩文字版点我』，同理，如果是文字版了，就显示『想玩gal点我』」。
     所以球上的文字**说的是「点我之后能去哪」，不是「我现在是什么」**。
     当前模式仍要能一眼看出来 —— 放在前面那半句里（「游戏版 · 想玩文字版点我」），
     光看图标太考验玩家了。 */
  function ballTextOf(mode) {
    return (mode === TEXT) ? '想玩 gal 点我' : '想玩文字版点我';
  }
  function ballFullTextOf(mode) {
    var cur = LABEL[mode] ? LABEL[mode].name : '';
    return cur + ' · ' + ballTextOf(mode);
  }

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
  /* ★ 2026-11-18 15:43：原来的「强制恒关名单」（推演用三条）已随条目一起删除。
     现在这三条走 RETIRED_ENTRIES 的路径被**物理删掉**，不需要"恒关"了 ——
     恒关只会让老玩家书里一直留着三条白烧 token 的死条目。 */
  function wantedBook(comment, mode, oldValue) {
    /* 强制命令：初始化变量恒关，优先级最高（理由见下方大段注释） */
    if (String(comment == null ? '' : comment).indexOf('[InitVar]') === 0) return false;
    /* ★★★ 2026-11-18 21:5x：作者「切换文字怎么又他妈关变量更新规则和变量强调，你他妈再关一个试试看」。
       这两条是**两种模式都要吃**的（变量怎么写、怎么强调），以前被塞进 bookOffInText，
       一切文字版就整条关掉 ⇒ MVU 直接不更新。现在单开一张 ALWAYS_ON 名单，
       排在最前面、谁也盖不掉（wantedBook / wantedBookPack / _wantOnPack 三处都拦）。 */
    if ((CFG.bookAlwaysOn || []).indexOf(String(comment == null ? '' : comment).trim()) >= 0) return true;
    if (CFG.bookOffInText.indexOf(comment) >= 0) return mode === GAME;
    if (CFG.bookNonOnly.indexOf(comment) >= 0) return mode === TEXT;
    return !!oldValue;
  }

  /* ══ ★★★ 强制命令（作者 2026-11-16 23:14 / 23:16）════════════════════════
     「关着是对的，永远不准打开!!!!!」 + 「重点是他妈只能有一个」
     ────────────────────────────────────────────────────────────────────────
     《[InitVar]初始变量》**任何模式、任何情况都恒关**，而且**全库只能有一条**
     （「·文字版」那条已并入本条并从包里删除，老玩家书里的实体进 RETIRED_ENTRIES）。
     ────────────────────────────────────────────────────────────────────────
     为什么必须恒关：这是 MVU 的初始变量模板。开着 = 每轮 prompt 都塞一份「开局初始值」，
     模型会误以为每轮都要把变量重置回开局值 ⇒ 变量永远涨不起来（老 bug 的根）。
     ────────────────────────────────────────────────────────────────────────
     ⚠ 判据用**前缀** `[InitVar]` 开头，不是精确名字 —— 这是最后一道保险：
     万一书里还残留同前缀条目，一律摁灭，不许它亮。
     ⚠ 判据优先级**最高**，必须排在两个模式名单之前，否则同名条目进了名单
     就会被 `mode === TEXT` 判成该开。
     ⚠⚠ wantedBook / wantedBookPack / _wantOnPack 三个函数里**都必须内联这段判断**，
     不许抽成公共函数 —— 它们会被单独切出去跑（_t_wbswitch.mjs / _t_wbver.mjs），
     在函数体里引用外部符号会 ReferenceError。这是踩过的坑。 */

  /* ══ ★★★ 2026-11-16：**条目到底该开还是该关，只有这一处真相** ══════════
     作者原话：「所有人的条目你倒是打开啊」—— 症状是所有人物条目都不亮，
     正文一条不缺、条数一条不少、回读「一致 104/104」，可模型一个字都收不到。
     ────────────────────────────────────────────────────────────────────────
     病根是「开关」被写成了**两处**：
       · 条目包里的 `enabled`（我以为是「作者希望它开着」）
       · 同步代码里的 `setBookEnabled(cp, false)`（「补进去一律先关着」）
     两者一冲突，后者永远赢。于是：
       ① 新补进去的条目（含全部人物、人物总览、节庆全年）全是关的；
       ② 书里**已经关着**的条目，mutate 里除了《[InitVar]初始变量》一个字都不碰，
          此后每一次同步都不会把它打开 —— 这才是「每次都必定失效」。
     ────────────────────────────────────────────────────────────────────────
     现在的判据（保守到极点，绝不擅自改玩家的选择）：
       · [InitVar] 前缀 → 恒关（最高优先级）
       · 两个篇章名单 → wantedBook 按当前模式裁决
       · 包里**明确**写了 `enabled === true` → 书里必须开（这是作者的声明）
       · 包里写 false / 压根没写 → **保持书里原值**，不碰
     特意不做「包里没写就当开」：那会把玩家自己手动关掉的条目每轮重新点亮。

     ⚠ mode 必须**由调用方显式传进来**，函数内部不许再去 readMode()。
     原因：readMode 定义在这个闭包很靠前的位置（第 220 行），而 wbSyncOnly
     那一整段是能被单独切出去跑的（_t_wbver.mjs 就是从 `var WB_VER_ENTRY` 切）。
     在函数体里偷偷读外部符号，一切片就 ReferenceError ⇒ mutate 整段抛异常
     ⇒ wbWrite 三级通道全军覆没 ⇒ 面板只显示「一条写入通道都没走通」。
     纯函数没有隐藏依赖，切到哪儿都能跑。 */
  function wantedBookPack(comment, mode, oldValue, packEnabled) {
    /* 强制命令：初始化变量恒关。⚠ 必须内联，不许抽函数 —— 本函数会被单独切片运行 */
    if (String(comment == null ? '' : comment).indexOf('[InitVar]') === 0) return false;
    /* ★★★ 2026-11-18 21:5x：作者「切换文字怎么又他妈关变量更新规则和变量强调，你他妈再关一个试试看」。
       这两条是**两种模式都要吃**的（变量怎么写、怎么强调），以前被塞进 bookOffInText，
       一切文字版就整条关掉 ⇒ MVU 直接不更新。现在单开一张 ALWAYS_ON 名单，
       排在最前面、谁也盖不掉（wantedBook / wantedBookPack / _wantOnPack 三处都拦）。 */
    if ((CFG.bookAlwaysOn || []).indexOf(String(comment == null ? '' : comment).trim()) >= 0) return true;
    if (CFG.bookOffInText.indexOf(comment) >= 0) return mode === GAME;
    if (CFG.bookNonOnly.indexOf(comment) >= 0) return mode === TEXT;
    if (packEnabled === true) return true;
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
        setBookEnabled(e, wantedBook(String(e.comment || ''), mode, e.enabled));
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
          var _contentSync = 0;
          var _protSkip = 0;
          var _present = {};
          /* ★ 08:26：先取线上条目包（JSONP，不受跨域限制），供下面同步 content 用 */
          /* ★★ 2026-11-17：改走 fetchWbPatch（按 seq 缓存）。
             原来这里自己拼 `<script src=...?t=Date.now()>` —— 每次切模式都
             硬下 553KB，绕开一切缓存。切模式是玩家的常规操作，这笔流量纯浪费。 */
          try {
            var _wbList = await fetchWbPatch();
            window.__TH_WBPATCH__ = _wbList || window.__TH_WBPATCH__ || [];
          } catch (eWb) {}
          /* ★ 08:50：按 comment 建索引，正文同步不再限定那 21 条 */
          var _wbMap = {};
          try {
            (window.__TH_WBPATCH__ || []).forEach(function (x) {
              var k = String(x.comment || '');
              if (k) _wbMap[k] = x;
            });
          } catch (eMap) { _wbMap = {}; }
          await TH.updateLorebookEntriesWith(wb, function (es) {
            return (es || []).filter(function (e) {
              var c = String(e.comment || '');
              /* ★ 08:10 作者：直接删，不是关。
                 updateLorebookEntriesWith 是"整表替换"，返回的数组里不放它，就等于删掉。 */
              if (c === '创作要求' || c === '创作要求（旧）') { _legacyOff++; return false; }
              /* ★ 08:50：正文同步 —— **任何**在包里的条目，正文都以线上为准。
                 以前只同步那 21 条具名条目，节庆 / 底座根本进不来，所以"热更没成功"。 */
              try {
                var _src = _wbMap[c];
                if (_src && typeof _src.content === 'string' && _src.content && e.content !== _src.content) {
                  /* ★ 玩家修改保护：切模式也不覆盖玩家改过的条目 */
                  if (wbEntryProtected(String(wb || ''), c, String(e.content == null ? '' : e.content))) {
                    _protSkip = (_protSkip || 0) + 1;
                  } else {
                    e.content = _src.content;
                    _contentSync++;
                  }
                }
              } catch (eSync) {}
              if (CFG.bookOffInText.indexOf(c) >= 0 || CFG.bookNonOnly.indexOf(c) >= 0) { hit++; _present[c] = 1; }
              setBookEnabled(e, wantedBook(c, mode, e.enabled));
              /* 顺手抹掉正文里指向它的悬空引用，免得 prompt 里还提到「创作要求」 */
              try {
                if (typeof e.content === 'string' && e.content.indexOf('《创作要求》') >= 0) {
                  e.content = e.content
                    .replace(/《创作要求》\s*等条目/g, '其他条目')
                    .replace(/《创作要求》/g, '');
                }
              } catch (eRef) {}
              return true;
            });
          });
          oks.push('世界书条目 ' + hit + '/' + (CFG.bookOffInText.length + CFG.bookNonOnly.length) + ' 条命中【切换器 s48】');
          if (_legacyOff > 0) oks.push('已删除「创作要求」' + _legacyOff + ' 条，并清掉正文里的指向引用');
          if (_contentSync > 0) oks.push('已同步条目正文 ' + _contentSync + ' 条');
          /* ★ 08:12：把「这一模式到底开了哪几条」直接列出来，省得再猜。
             两个团是**成对互换**的：游戏版开 9 条同层、关 12 条文字版；文字版反过来。 */
          try {
            var _onG = 0, _offG = 0, _onT = 0, _offT = 0;
            CFG.bookOffInText.forEach(function (nm) { if (_present[nm]) { if (wantedBook(nm, mode, true)) _onG++; else _offG++; } });
            CFG.bookNonOnly.forEach(function (nm) { if (_present[nm]) { if (wantedBook(nm, mode, true)) _onT++; else _offT++; } });
            oks.push((mode === TEXT ? '文字版' : '游戏版') + '：同层条目 开' + _onG + '/关' + _offG + '，文字版条目 开' + _onT + '/关' + _offT);
          } catch (eSum) {}

          /* ★ 08:14：写完之后**回读逐条比对**。谁该开谁该关，一条条列，
             这样"到底有没有乱开关"就不用猜了。 */
          try {
            var _final = await TH.getLorebookEntries(wb);
            var _bad = [];
            var _map = {};
            (_final || []).forEach(function (e) { _map[String(e.comment || '')] = !!e.enabled; });
            CFG.bookOffInText.concat(CFG.bookNonOnly).forEach(function (nm) {
              if (_map[nm] === undefined) return;
              var want = wantedBook(nm, mode, _map[nm]);
              if (_map[nm] !== want) _bad.push(nm + (want ? '(应开)' : '(应关)'));
            });
            if (_bad.length) errs.push('开关不一致 ' + _bad.length + ' 条：' + _bad.join('、'));
            else oks.push('21 条开关已逐条核对，全部正确');
          } catch (eV) {}

          /* ★ 07:55：绑定的世界书可能是早期导入的旧副本，缺条目（玩家看到的 8/21）。
             这里把**卡内 character_book 里存在、绑定书里却没有**的那几条补进去。
             只增不删、只碰这 21 个具名条目，不动玩家自己的条目。 */
          try {
            /* ★★★ 2026-11-18 19:5x：**这里原来取的是整个条目包的名字，不是那 21 条。**
               ── 作者原话：「模式切换有巨大bug，简直完全乱来。我文字版切换成游戏版，
                  给他妈变量全关了是什么意思，给我他妈彻查」
               ── 病根 ──────────────────────────────────────────────────
               `_present` 只在那 21 条具名条目上被置 1（见上面 setBookEnabled 那段），
               而 `_wantAll` 取的是 `window.__TH_WBPATCH__` 的**全部 100+ 条** ⇒
               其余 80 多条每一条都 `_present[nm] === undefined` ⇒ 全被判成「书里缺这条」
               ⇒ `_add` 装进 80 多个副本 ⇒ 副本的开关又是
               `wantedBook(nm, mode, false)` = **关**（非 21 条的条目走 oldValue 分支）
               ⇒ 每切一次模式，就往玩家的书里灌一遍**关着的**副本。
               副本的 uid 与原条目相同，酒馆按 uid 落库时把原来那条一起改掉，
               于是「一切模式，变量条目全关」—— 就是这个。
               ── 现在 ──
               · 候选名只取那 21 条（bookOffInText + bookNonOnly），与注释一致
               · 补入的副本按 `wantedBook(nm, mode, true)` 给状态（这 21 条都有显式裁决，
                 oldValue 传什么都不影响，但传 true 语义正确）
               · 再加一道：书里**已经有同名条目**（不管在不在 21 条里）就绝不补 ——
                 补入的唯一理由是"缺"，不是"开关不对"。 */
            var _wantAll = CFG.bookOffInText.concat(CFG.bookNonOnly);
            var _embedded = (data.character_book && data.character_book.entries) || [];
            /* 书里现存的全部条目名（补入前的那一份），用来兜住「21 条之外」的重名 */
            var _existAll = {};
            try {
              (before || []).forEach(function (e) { var n = String(e.comment || ''); if (n) _existAll[n] = 1; });
            } catch (eEx) {}
            var _add = [];
            var _missNames = [];
            _wantAll.forEach(function (nm) {
              if (_present[nm] || _existAll[nm]) return;
              _missNames.push(nm);
              for (var i = 0; i < _embedded.length; i++) {
                if (String(_embedded[i].comment || '') === nm) {
                  var cp = JSON.parse(JSON.stringify(_embedded[i]));
                  setBookEnabled(cp, wantedBook(nm, mode, true));
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
                /* ★★ 2026-11-17：同理改走 fetchWbPatch（按 seq 缓存，不再硬下 553KB） */
                var _plist = await fetchWbPatch();
                (_plist || []).forEach(function (e) {
                  var nm = String(e.comment || '');
                  if (_missNames.indexOf(nm) < 0) return;
                  var cp = JSON.parse(JSON.stringify(e));
                  /* ★ 2026-11-18：补进去的条目按**该开的开**（以前一律 false，
                     等于每次切模式都给书里塞一批关着的副本 —— 见上面那段长注释）。 */
                  setBookEnabled(cp, wantedBook(nm, mode, true));
                  _add.push(cp);
                });
                oks.push('从本地包取回条目原文 ' + _add.length + ' 条');
              } catch (eFp) {
                errs.push('本地条目包读取失败：' + (eFp && eFp.message || eFp));
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
          /* ★ v167：上面那段走的是 updateLorebookEntriesWith —— 某些宿主会
             **resolve 了但一个字都没写进去**（天元录原话：「球变色、世界书没动」）。
             这里再用三级降级兜一次，而且**回读**验证：
               · 一致 → 记一条成功，把用哪条通道写进去的也说清
               · 不一致 → 直接进 errs。宁可让玩家看到"没写成"，也不要假成功。 */
          try {
            var _r2 = await wbSyncOnly({ list: window.__TH_WBPATCH__ || [] });
            if (_r2 && _r2.ok) {
              oks.push('世界书回读 ' + _r2.same + '/' + _r2.total + ' 条一致（' + _r2.how + '）');
              /* ★ 2026-11-16：**把「清掉了几条下架条目」明确说出来**。
                 以前这一步静默进行，作者只看到「93/93 一致」，
                 可书里还压着 39 条老条目（32 条旧节庆共 9.4 万字），
                 他自然以为「热更新没生效」。
                 这条提示是给人看的：删了就说删了，别让人猜。 */
              if (_r2.removed > 0) {
                oks.push('清掉 ' + _r2.removed + ' 条已下架的旧条目（旧节庆/重复条目），书里现在只剩本版内容');
              }
            } else {
              errs.push('世界书回读不一致：' + ((_r2 && _r2.msg) || '未知') +
                ((_r2 && _r2.tried && _r2.tried.length) ? ' / ' + _r2.tried.join(' / ') : ''));
            }
          } catch (eSync2) {
            errs.push('世界书回读失败：' + ((eSync2 && eSync2.message) || eSync2));
          }
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
      '1. 酒馆助手脚本：' + (g ? '开启全部 [同层] 6 个、关闭全部 [文字版] 5 个'
                              : '关闭全部 [同层] 6 个、开启全部 [文字版] 5 个') + '；[共用] 保持开。',
      '2. 正则：' + (g ? '开启 [同层] 5 条、关闭 [文字版] 5 条'
                       : '关闭 [同层] 5 条、开启 [文字版] 5 条（「没闭合」那条保持关）') + '。',
      '3. 世界书：' + (g ? '开启 ' + CFG.bookOffInText.join('、') + '；关闭带「·文字版」后缀的条目'
                         : '关闭 ' + CFG.bookOffInText.join('、') + '；开启带「·文字版」后缀的条目') + '。',
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
    /* 手机端：避开底部输入框与手势条 */
    '@media (max-width: 820px){',
    '  #spr-sw-root{right:10px!important;bottom:calc(84px + env(safe-area-inset-bottom,0px))!important;}',
    '  #spr-sw-ball{padding:9px 13px!important;min-height:42px!important;}',
    '  #spr-sw-ball .sw-ico{font-size:15px!important;}',
    '  #spr-sw-ball .sw-go{font-size:12px!important;}',
    '  #spr-sw-ball .sw-cur{display:none!important;}',
    '  #spr-sw-panel{width:min(88vw,330px)!important;}',
    '}',
    '#spr-sw-root #spr-sw-panel{touch-action:auto!important;}',
    /* ★ v1.24：收起态。用 class 不用 inline style —— 底下那段自愈会把
       style.display==='none' 无条件改回 ''，直接把球顶回来（见 selfHeal）。 */
    '#spr-sw-root.sw-ball-hidden{display:none!important;}',
    '#spr-sw-root[data-theme="dark"]{--sw-bg:#1e1f22;--sw-tx:#ecebe7;--sw-bd:#3a3b40;--sw-hi:#2b2c31;--sw-ac:#d9c7a3;--sw-dim:#a5a39c;}',
    '#spr-sw-root[data-theme="light"]{--sw-bg:#faf9f5;--sw-tx:#26241f;--sw-bd:#d8d5cc;--sw-hi:#f0eee7;--sw-ac:#7a6843;--sw-dim:#6d6a62;}',
    /* ★★ v1.27：悬浮球从「52px 圆球」改成「带字的胶囊」。
       作者原话：「改的更明显一点，玩家老不知道可以当场切换模式」。
       原来是个圆球，里面只有一个图标 + 9px 的「游戏版」小字 ——
       玩家根本不会去点它，因为看不出它是可点的按钮。
       现在：横着排「🎮 游戏版 · 想玩文字版点我」，一眼就知道点它会换模式。 */
    '#spr-sw-ball{display:inline-flex!important;flex-direction:row!important;align-items:center!important;',
    '  gap:7px!important;padding:11px 16px 11px 14px!important;min-height:46px!important;',
    '  border-radius:999px!important;cursor:pointer!important;touch-action:none!important;',
    '  background:linear-gradient(135deg,var(--sw-bg),var(--sw-hi))!important;',
    '  border:1.5px solid var(--sw-ac)!important;',
    '  box-shadow:0 6px 22px rgba(0,0,0,.34),0 0 0 3px rgba(217,199,163,.12)!important;',
    '  transition:transform .18s ease,box-shadow .18s ease,border-color .18s!important;}',
    '#spr-sw-ball:hover{transform:translateY(-2px)!important;',
    '  box-shadow:0 10px 28px rgba(0,0,0,.42),0 0 0 4px rgba(217,199,163,.2)!important;}',
    '#spr-sw-root.sw-drag #spr-sw-ball{cursor:grabbing!important;transform:none!important;transition:none!important;}',
    '#spr-sw-ball .sw-ico{font-size:17px!important;line-height:1!important;flex:0 0 auto!important;}',
    '#spr-sw-ball .sw-cur{font-size:11px!important;font-weight:600!important;letter-spacing:.3px!important;',
    '  color:var(--sw-ac)!important;flex:0 0 auto!important;white-space:nowrap!important;}',
    '#spr-sw-ball .sw-cur::after{content:"·"!important;margin-left:6px!important;opacity:.55!important;}',
    '#spr-sw-ball .sw-x{flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;',
    '  justify-content:center!important;width:19px!important;height:19px!important;margin-left:3px!important;',
    '  border-radius:50%!important;font-size:11px!important;line-height:1!important;',
    '  color:var(--sw-dim)!important;cursor:pointer!important;background:transparent!important;',
    '  transition:background .15s,color .15s!important;}',
    '#spr-sw-ball .sw-x:hover{background:rgba(248,113,113,.26)!important;color:#fff!important;}',
    /* 收起 / 唤出时的轻提示（球都藏起来了，必须有个地方告诉玩家「从功能页能叫回来」） */
    '#spr-sw-toast{position:fixed!important;left:50%!important;bottom:calc(96px + env(safe-area-inset-bottom,0px))!important;',
    '  transform:translateX(-50%)!important;z-index:2147483647!important;pointer-events:none!important;',
    '  background:rgba(24,24,26,.94)!important;color:#f0ece2!important;font-size:12px!important;line-height:1.5!important;',
    '  padding:9px 15px!important;border-radius:999px!important;border:1px solid rgba(217,199,163,.38)!important;',
    '  box-shadow:0 8px 26px rgba(0,0,0,.42)!important;white-space:nowrap!important;',
    '  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif!important;}',
    '#spr-sw-ball .sw-go{font-size:13px!important;font-weight:700!important;letter-spacing:.2px!important;',
    '  color:var(--sw-tx)!important;white-space:nowrap!important;}',
    /* 呼吸光圈：不看字也知道这颗是「活的」，会动的东西才像按钮 */
    '@keyframes spr-sw-pulse{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.34),0 0 0 3px rgba(217,199,163,.12);}',
    '  50%{box-shadow:0 6px 22px rgba(0,0,0,.34),0 0 0 7px rgba(217,199,163,.05);}}',
    '#spr-sw-ball{animation:spr-sw-pulse 2.6s ease-in-out infinite!important;}',
    '#spr-sw-ball:hover{animation:none!important;}',
    '#spr-sw-root.sw-drag #spr-sw-ball{animation:none!important;}',
    '@media (prefers-reduced-motion: reduce){#spr-sw-ball{animation:none!important;}}',
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
    if (!HD || typeof HD.getElementById !== 'function' || typeof HD.createElement !== 'function') return;
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
      '<div id="spr-sw-ball" title="切换游玩模式"><span class="sw-ico"></span><span class="sw-cur"></span><span class="sw-go"></span>',
      '  <span class="sw-x" title="收起悬浮球（随时可以从功能页叫回来）">✕</span></div>'
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
      /* ★ v1.27：球上写「我现在是什么 + 点我能去哪」，
         弹层（面板）里仍用原来的 icon + name + sub 三段式。 */
      ball.querySelector('.sw-ico').textContent = L.icon;
      ball.querySelector('.sw-cur').textContent = L.name;
      ball.querySelector('.sw-go').textContent = ballTextOf(cur);
      ball.title = '当前：' + L.name + '\n点一下切换成' + (cur === TEXT ? '游戏版' : '文字版') + '（会写入卡数据并刷新网页）';
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
      doSwitch(picked);
    });

    /* ══ ★ v1.24：悬浮球可收起 ═══════════════════════════════════════════
       作者原话：「游戏模式切换的悬浮球可以收起，收起后从功能页唤出，也就是功能页
       有个切换传统文字版。然后刷新网页前，悬浮球都不会出现了。」

       ── 为什么状态**只存在内存里、不写 localStorage** ────────────────────
       关键就是最后那半句「刷新网页前」。要的是「这一局玩着别挡我，刷新就回来」，
       不是「永久关掉」。所以 `ballHidden` 是个闭包变量：
         · 收起 → 本页内不再出现，功能页能叫回来
         · 刷新 → 脚本重跑，变量回到 false，球自己回来
       写成 localStorage 反而错：玩家哪天手滑收了球、又忘了去哪找，
       以后每次进游戏都没球 —— 那是把「临时收起」做成了「永久隐藏」。

       ── 为什么用 class 不用 style.display ──────────────────────────────
       底下那段自愈 MutationObserver 有一条 `if (root.style.display === 'none')
       root.style.display = '';`，专门防别的脚本把壳挪走 / 藏掉。
       要是收起也写 inline display:none，会被它**立刻顶回来** —— 点了 ✕ 没反应。
       所以收起走 `.sw-ball-hidden` 这个 class，自愈那条只管 inline，两者互不干扰。 */
    var ballHidden = false;
    function applyBallHidden() {
      try { root.classList.toggle('sw-ball-hidden', !!ballHidden); } catch (eC) {}
      /* 球藏起来时弹层也必须关掉，否则会剩一个悬空的面板 */
      if (ballHidden) { try { panel.classList.remove('sw-open'); } catch (eP) {} }
      try { HW.__thBallHidden = !!ballHidden; } catch (eH) {}
    }
    function swBallToast(text) {
      try {
        var old = HD.getElementById('spr-sw-toast');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var t = HD.createElement('div');
        t.id = 'spr-sw-toast';
        t.textContent = text;
        (HD.body || HD.documentElement).appendChild(t);
        setTimeout(function () {
          try { if (t.parentNode) t.parentNode.removeChild(t); } catch (eT) {}
        }, 2600);
      } catch (e) {}
    }
    function swBallHide(quiet) {
      if (ballHidden) return;
      ballHidden = true;
      applyBallHidden();
      if (!quiet) swBallToast('🎮 悬浮球已收起 · 想叫回来点「功能」页');
    }
    function swBallShow(quiet) {
      var was = ballHidden;
      ballHidden = false;
      applyBallHidden();
      /* 叫回来时给个轻微的存在感：闪一下边框，让人知道刚出现在哪 */
      if (was && !quiet) {
        try {
          ball.style.transition = 'none';
          ball.style.boxShadow = '0 0 0 10px rgba(217,199,163,.5)';
          setTimeout(function () {
            try {
              ball.style.transition = 'box-shadow .55s ease';
              ball.style.boxShadow = '';
            } catch (eB) {}
          }, 60);
        } catch (eS) {}
        swBallToast('🎮 悬浮球已叫回来');
      }
    }

    /* ✕ 必须吞掉冒泡 —— 它长在球里面，不拦就会「收起 + 开弹层」同时发生 */
    var btnX = ball.querySelector('.sw-x');
    if (btnX) {
      btnX.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      btnX.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (busy) return;
        swBallHide(false);
      });
    }

    /* 外部口子：功能页（游戏版的 HUD 面板 / 文字版的状态栏）都走这三个 */
    function sprBallShow() { swBallShow(false); return true; }
    function sprBallHide() { swBallHide(false); return true; }
    function sprBallHidden() { return !!ballHidden; }
    try { window.__SPR_BALL_SHOW__ = sprBallShow; } catch (eB1) {}
    try { window.__SPR_BALL_HIDE__ = sprBallHide; } catch (eB2) {}
    try { window.__SPR_BALL_HIDDEN__ = sprBallHidden; } catch (eB3) {}
    try { HW.__SPR_BALL_SHOW__ = sprBallShow; } catch (eB4) {}
    try { HW.__SPR_BALL_HIDE__ = sprBallHide; } catch (eB5) {}
    try { HW.__SPR_BALL_HIDDEN__ = sprBallHidden; } catch (eB6) {}

    /* ★★ v1.27：把「执行一次切换」抽成函数，好让标题屏 / 开局向导也能调。
       原来这段逻辑整个焊死在 btnOk 的 click 里，外面想触发切换只能去模拟点击按钮 ——
       而按钮在弹层里，不打开弹层就点不到。作者要「开局第一页选游戏版还是文字版」，
       选文字版就得真去切模式，所以必须有一个能直接调的入口。 */
    async function doSwitch(target) {
      if (busy || target === readMode()) return { oks: [], errs: [], skipped: true };
      picked = target;
      busy = true;
      paint();
      say('正在写入卡数据…');
      var r;
      try { r = await applyMode(target); }
      catch (e) { r = { oks: [], errs: [String(e && e.message ? e.message : e)], fatal: true }; }

      if (r.fatal) {
        busy = false;
        say('✗ 切换未完全生效，未刷新网页，避免假成功。\n' + r.errs.join('\n'), 'sw-err');
        HD.getElementById('sw-manual').style.display = 'block';
        HD.getElementById('sw-manual-txt').textContent = manualText(target);
        paint();
        return r;
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
      return r;
    }

    /* ★ v1.27：给外部（标题屏、开局向导、文字版首楼入口）一个直接调用的口子。
       两处都挂：脚本可能跑在 iframe 里，宿主 window 拿不到同一个引用。 */
    function sprSwitchMode(target) {
      var t = (target === 'text' || target === 'game') ? target : null;
      if (!t) return Promise.resolve({ oks: [], errs: ['模式名不合法：' + target], fatal: true });
      return doSwitch(t);
    }
    try { window.__SPR_SWITCH_MODE__ = sprSwitchMode; } catch (eS1) {}
    try { HW.__SPR_SWITCH_MODE__ = sprSwitchMode; } catch (eS2) {}
    try { window.__SPR_READ_MODE__ = readMode; } catch (eR1) {}
    try { HW.__SPR_READ_MODE__ = readMode; } catch (eR2) {}
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
        /* 收起状态下量不到尺寸（display:none ⇒ rect 全是 0），此时绝不能存位置 ——
           否则会把「上次拖到哪」覆盖成 (4,4)，下次显示时球就跑到左上角了 */
        if (ballHidden) return;
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

  /* ══════════════════════════════════════════════════════════════════════
     ★ v167：世界书单项同步 / 只读检测 —— **不切模式也能跑**

     为什么必须单开一个：条目正文的同步以前只挂在 applyMode() 里，而 applyMode
     还会改脚本开关、正则、界面，最后 location.reload() 整页。想确认"书到底更新没有"，
     代价是切一次模式 + 刷一次新 —— 所以玩家（和作者自己）根本没法确认。
     这两个函数只碰世界书，做完就返回结果，**什么都不 reload**：

       __TH_WB_SYNC__()  ① 按 comment 把线上 wbpatch 的正文写进去
                         ② 补入书里缺的条目
                         ③ **回读**逐条比对，报「多少条一致 / 哪几条不一致」
       __TH_WB_READ__()  只读：书里《版本号测试》的正文 + 绑定的是哪本书

     作者原话：「酒馆的世界书有时容易不更新，容易误导玩家。」——
     版本号这一条就是给玩家和自己一眼看穿用的。
     ══════════════════════════════════════════════════════════════════════ */
  /* ★ 21:35：同样不能再写死 chunri/ —— 开发者卡的世界书同步必须拉 chunri-dev 的条目包，
     否则版本号那一条会被写成玩家通道的旧值（表现为「同步了但还是旧版本号」）。

     ★ 2026-11-17：转回 GitHub 后，「反推基址」这套判据必须更换。
     以前只认路径结尾 /chunri(-dev)，而 GitHub 地址结尾永远是 /haruharu，
     于是反推**永远失败**、一律落到写死的 COS 地址，而 COS 已停 ⇒ 404。
     ⚠ 这里必须与 10-core 的 thHotDirOf() 保持同一套判据（同一个量两套算法 = bug）。
       之所以没抽成公共函数：这两个文件在酒馆里可能是单独切片执行，
       跨文件引用会 ReferenceError（本项目踩过）。所以要改就两处一起改。 */
  function swHotDirOf(u) {
    var m = /^(https?:\/\/[^\s?#]+?)\/[^\/?#]+\.js(?:[?#]|$)/.exec(String(u || ''));
    if (!m) return '';
    var dir = m[1];
    if (/\/chunri(?:-dev)?$/i.test(dir)) return dir;
    if (/jsdelivr\.net\/gh\/[^/]+\/[^/]+@[^/]+\/haruharu$/i.test(dir)) return dir;
    if (/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/haruharu$/i.test(dir)) return dir;
    return '';
  }
  function swHotBase() {
    var b = '';
    try { b = String((HW && HW.__SPR_HOT_BASE__) || window.__SPR_HOT_BASE__ || ''); } catch (e0) {}
    if (/^https?:\/\/[^\s]+$/.test(b)) return b.replace(/\/+$/, '');
    var docs = [];
    try { if (HD) docs.push(HD); } catch (e1) {}
    try { if (document && docs.indexOf(document) < 0) docs.push(document); } catch (e2) {}
    for (var d = 0; d < docs.length; d++) {
      try {
        var list = docs[d].querySelectorAll('script[src]');
        for (var i = 0; i < list.length; i++) {
          var dir = swHotDirOf(list[i].src);
          if (dir) return dir;
        }
      } catch (e3) {}
    }
    return 'https://fastly.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-card@main/haruharu';
  }
  function swHotUrl(path) {
    var p = String(path || '');
    if (p.charAt(0) !== '/') p = '/' + p;
    return swHotBase() + p;
  }

  var WB_VER_ENTRY = '春日狂想曲·版本号';

  /* ★ 11-15 03:05：**已经下架、需要顺手清掉的条目名**（本卡历史白名单）。
     只放「我们自己发过、后来从条目包删了」的名字，绝不放玩家可能自建的常见名。
     清理时必须再满足「正文为空」且「不在当前包里」——
     玩家真往里写了内容就当他的东西，一个字节都不动。
     当前只有一条：为验证同步链路临时插的空「测试」，验证完已从包里移除。 */
  var GONE_ENTRIES = { '测试': 1 };

  /* ★★★ 2026-11-16：**本卡「曾经发过、现已下架」的条目白名单**（带正文的那种）。
     ────────────────────────────────────────────────────────────────
     作者实测截图：书里 138 条、条目包 93 条、**删除 0**、正文 93/93 一致。
     正文确实全同步了，但「模型读到的还是旧内容」—— 因为**39 条老条目还在书里**：
       32 条旧节庆（每条 2800~3200 字，合计约 9.4 万字）
       + `[mvu_update]变量更新规则·文字版` / `user身份` / `主要角色行为`
         / `暴露机制` / `关系` / `人物速查·文字版` / `人物总览·文字版`
     32 条旧节庆里每一条都自带完整的节日判定与正文，**和新的《节庆·全年》
     同时参与 EJS 渲染** ⇒ 模型看到的是「旧的 32 份 + 新的 1 份」，
     这就是「条目热更新了但没生效」的真身。
     ────────────────────────────────────────────────────────────────
     为什么以前删不掉：`GONE_ENTRIES` 那条路要求「正文为空」，
     而这些条目的正文很厚 ⇒ 三闸永远过不了。
     现在单开一路（`RETIRED_ENTRIES`），**只按名字精确删，不加正文条件**，
     因为这些名字全是本卡专属的（带 `节庆 MM-DD 汉字` 前缀、带「·文字版」后缀），
     玩家不可能自己建出同名条目。仍然保守三条：
       ① **全量模式**才删（partial = 书名撞了，结构一律不动）
       ② 只删 `RETIRED_ENTRIES` 里**逐字列出**的名字，不做前缀/正则匹配
       ③ 名字必须**不在当前条目包**里（包里还有 = 我们仍要它，上面已同步正文）
     ⚠ 以后从包里删条目，**必须同步往这里加一行**，否则它就永远留在老玩家书里。
       反过来说：这里列出的名字，**不许**再出现在 wbpatch.json 里。 */
  var RETIRED_ENTRIES = (function () {
    var m = {};
    var names = [
      /* ── seq 133 删掉的 7 条 ──
         ⚠ 2026-11-16 18:05：其中 4 条（user身份 / 主要角色行为 / 暴露机制 / 关系）
         已从「·非同层」改回本名、**重新回到条目包里**（它们自带篇章闸门，
         与运行环境无关，「·非同层」是错标）。
         它们必须从这里删掉 —— 名单的前提是「名字不在当前包里」，
         改名后名字一模一样，留着就等于每轮同步都把自己正在用的条目删掉。
         剩下 3 条是真退役（无同层版、无重生版）： */
      '[mvu_update]变量更新规则·非同层',
      '人物速查·非同层',
      '人物总览·非同层',
      /* ── 2026-11-16 18:05：本轮从包里删掉 / 改名的两条（迁移检查抓出来的）──
         · 插图系统·非同层 ⇒ 已改名为《插图系统》（与运行环境无关，靠篇章闸门分流）；
            老玩家书里那条**旧名字**的实体必须删掉，否则和新的一条同时参与渲染。
         · 小地图与快速跳转 ⇒ 作者要求删除（1456 字向模型描述界面，
            又禁止模型写界面词，自己就是「模型写界面词」的诱因）。
         ⚠ 从包里删条目必须同步往这里加一行 —— 这次就是漏了，被 _t_retired 抓到。 */
      '插图系统·非同层',
      '小地图与快速跳转',
      /* ── 2026-11-16 18:20：货架条目下架 ──
         《设定/57-便利店货架 公寓篇》2567 字，货品/价格/效果全写死在提示词里。
         而脚本里**早就有三套完整的**（村庄 全局.商店 13 件 / 公寓
         APARTMENT_CONVENIENCE_STOCK 8 件 / 神社 SHRINE_SHOP_STOCK 10 件），
         由 getActiveShopStock() 按篇章自动切表，UI 也真的在用。
         所以那条是第三份重复数据，且已经和脚本不一致（同一个商品两个价）。
         作者原话：「为什么不tm改成脚本内置呢，这样还省token」。 */
      '设定/57-便利店货架 公寓篇',
      /* ── 2026-11-18：作者要求再删三条，全是「脚本/变量已管，不该再教 AI 一遍」──
         · 插图版本      ⇒ 新旧立绘是脚本三通道的事，模型不需要知道；
                            且读到「旧插图」会让整链先返回旧图（已改逐角色纠偏）。
         · 开局设定与玩家信息 ⇒ 玩家四项信息归变量管、有兜底；不替 u 编名字的规则
                            已搬进 [mvu_update]变量更新规则。
         · 游戏模式      ⇒ 脚本一键开关，条目再说一遍纯属重复。
         三条都不会改名回来，老玩家书里的实体必须删掉。 */
      '插图版本',
      '开局设定与玩家信息',
      '游戏模式',
      /* ── 2026-11-16 晚：速查类三条下架（自称默认关闭却蓝灯常开；内容与人物卡/阶段条目逐字重复）── */
      '人物速查',
      '推演用 人物速查（公寓篇）',
      '推演用 关系网（公寓篇）',
      /* ── 2026-11-18 15:43：推演用三条整体下架（作者：「推演的条目全他妈删掉」）──
         这三条是外置推演 AI 的素材，内容与「地点总表 神社篇」「人物总览」逐条重复，
         且从最早备份起就是 enabled=true、常驻白烧 token。
         03-deduce.js 读不到它们时会退回内置 BLURB_FALLBACK_SHRINE / 写死的走动规则，
         所以删掉不影响内置推演。 */
      '推演用 规则块（按篇章）',
      '推演用 规则块（神社篇）',
      '推演用 人物速查（神社篇）',
      /* ── 2026-11-18：作者第二次点名「我叫你删推演的条目，你删你妈逼去了？」
         《推演与走动》4681 字、蓝灯常驻、0 触发词 —— 每轮无条件白烧 token。
         独有四段（谁爱去哪 / 香本家那一对 / 谁带谁 / 她们是活人会走动）
         已并进《地点总表 夏越村》第七节（同篇章闸门）；
         地点/时间/精力值的「脚本记账」禁令已搬进《[mvu_update]变量更新规则》。
         ⚠ 名字已在包里删掉，这里必须留一行，否则老玩家书里那条永远清不掉。 */
      '推演与走动',
      /* ── 2026-11-18：作者点名「我叫你把苦主阶段分割成一个个条目，你分割了你妈?分在哪？」
         《苦主阶段》5679 字、0 触发词、蓝灯常驻 —— 每一轮无论谁在场都整条塞进上下文，
         而且 15 位苦主共用同一套模板句，写到谁都是同一段话。
         现拆成《苦主阶段·总纲》（只留通则，仍常驻）+ 14 条《苦主阶段·人名》
         （绿灯，keys 挂各自名字，四档按各人设重写）。
         ⚠ 老名字必须删，否则书里新旧两份同时讲心理阶段、双份进上下文。 */
      '苦主阶段',
      /* ── seq 133 合并进《节庆·全年》的 32 条旧节庆 ── */
      '节庆 01-01 元日', '节庆 01-07 七草', '节庆 01-10 十日えびす',
      '节庆 01-14 どんど焼き', '节庆 01-15 小正月', '节庆 02-03 节分',
      '节庆 02-11 初午', '节庆 03-03 雏祭', '节庆 03-20 春彼岸',
      '节庆 04-01 花见', '节庆 04-08 花祭', '节庆 05-05 端午',
      '节庆 05-15 田植', '节庆 06-11 入梅', '节庆 06-30 夏越祓',
      '节庆 07-07 七夕', '节庆 07-20 土用丑', '节庆 07-31 夏越祭',
      '节庆 08-13 盆の入り', '节庆 08-15 盆中日', '节庆 08-16 送り火',
      '节庆 08-23 地藏盆', '节庆 09-01 二百十日', '节庆 09-15 十五夜',
      '节庆 09-23 秋彼岸', '节庆 10-01 亥の子', '节庆 10-20 稻刈',
      '节庆 11-15 七五三', '节庆 11-23 新尝祭', '节庆 12-13 事始',
      '节庆 12-21 冬至', '节庆 12-31 大晦日',
      /* ── 2026-11-16 晚：《节庆·公共底座》并入《节庆·全年》──
         它一个字正文都不输出，只是把「32 个节日还剩几天」算出来挂到
         globalThis.__TH_FEST_CTX__，全年再去读 —— 两条靠全局变量传值，
         对渲染顺序有隐藏依赖（底座没跑就一天都不注入，且不报错）。
         合并成一条后，老玩家书里那条**空的**底座实体必须删掉，
         否则书里永远显示「怎么还有两个节庆」。 */
      '节庆·公共底座',
      /* ── 三条「主要角色阶段」蓝灯大条目：已拆成 15 条绿灯单角色条目，
         分档正文逐字保留。蓝灯统一一条全量激活太浪费，绿灯按角色名激活。 ── */
      '主要角色阶段',
      '公寓篇主要角色阶段',
      '神社篇主要角色阶段',
      /* ── 2026-11-16 21:30：15 条单角色阶段改名 →「XX心理阶段」。
         改名 = 老名字必须删，否则书里新(XX心理阶段)旧(夏越村阶段·XX)两条并存、双份进上下文。 ── */
      '夏越村阶段·吉川美穗', '夏越村阶段·山上椿芽', '夏越村阶段·香本千玲',
      '夏越村阶段·西村百花', '夏越村阶段·春日久美子', '夏越村阶段·春日静奈', '夏越村阶段·春日葵',
      '公寓阶段·神谷奈绪', '公寓阶段·桃崎千鹤', '公寓阶段·藤宫紫苑',
      '公寓阶段·白坂结奈', '公寓阶段·水野千晴',
      '神社阶段·神代凛音', '神社阶段·月读澪', '神社阶段·斋宫若叶',
      /* ── 2026-11-16 21:30：删两条重复条目 ──
         · [mvu_update]变量输出格式强调 ⇒ 完整格式已搬进《[mvu_update]变量更新规则》；
           强调块单独留在《[mvu_update]变量输出格式》，这条多余。
         · 神社后山 · 19 个正式场景 ⇒ 19 处固值 + 四季景物已全写进《地点总表 神社篇》
           第二/六节；独立条目纯重复，且带一条不必要的篇章闸门 EJS。 */
      '[mvu_update]变量输出格式强调',
      '神社后山 · 19 个正式场景',
      /* ── 2026-11-16 23:16：作者强制命令「只能有一个」──
         《[InitVar]初始变量·文字版》已并入《[InitVar]初始变量》（字段取并集，
         补进了它独有的「第几天」），包里只留一条且**恒关**。
         老玩家书里那条文字版的实体必须删掉，否则书里永远显示「怎么还有两个初始化变量」。
         ⚠ 名字不在包里是删除前提，这里正好成立。 */
      '[InitVar]初始变量·文字版',
      /* ── 2026-11-17：`<连携移动>` 那套（整条消息级、弹确认条）已下架。──
         ⛔ 2026-11-18 00:40：作者原话「连携移动不等于剧情连携移动」
         「限你1分钟恢复剧情连携移动」。⇒ 《连携判定》不要，留在白名单；
         《剧情连携移动判定》要，已回包里，**绝不许留在这里**（会被精确删掉）。 */
      '连携判定',
      /* ── 2026-11-17 22:0x：本轮去重删掉的 6 条 ──
         ⛔ 前提照旧：这里列出的名字，**不许**再出现在 wbpatch.json 里。
         作者原话：
           「为什么有一个插图库和插图系统」
           「为什么有两个树精和白狐的条目」
           「重要记忆你他妈重复了5次」
         · 插图库        ⇒ 与《插图系统》逐条重复（写法/手势前戏/别做的事），已合并成一条。
         · 重要记忆写法  ⇒ 与《格式》里那段**逐字几乎相同**（模板串一模一样），已并入《格式》。
         · 精灵 御神木 / 人物 御神木之灵 ⇒ 合成一条《御神木之灵》
         · 妖怪 白蔵主 / 人物 白蔵主     ⇒ 合成一条《白蔵主》
           这两组原来**共用同一套 26 个 keys**，一条命中四条一起注入、共 9941 字、相似度 70%。
           老玩家书里这四条旧实体必须删掉，否则和新的一条同时参与渲染。 */
      '插图库',
      '重要记忆写法',
      '精灵 御神木',
      '妖怪 白蔵主',
      '人物 御神木之灵',
      '人物 白蔵主',
      /* ── 2026-11-18 20:5x：作者点名「神社设定这个条目和神社世界观冲突了，叫你删一个」──
         《神社设定 山裾の神社》（constant 常驻）与《世界观 神社篇》重叠：
         小路 / 神域 / 不许许愿 / 后山区别 / 结界，两份各讲一遍且口径不一。
         留《世界观 神社篇》（有 keys、覆盖更全：院落结构 / 檐廊 / 温泉 / 季节 / 场景图），
         它独有的两条细则（小路只在夏季午后出现 / 强行许愿的人会被留在里面）已并进去。
         ⚠ 老玩家书里的实体必须删掉，否则冲突照旧。 */
      '神社设定 山裾の神社'
    ];
    for (var i = 0; i < names.length; i++) m[names[i]] = 1;
    return m;
  })();
  var RETIRED_COUNT = (function () {
    var n = 0;
    for (var k in RETIRED_ENTRIES) if (RETIRED_ENTRIES[k]) n++;
    return n;
  })();

  /* ══ 条目名到底在哪个字段？══════════════════════════════════════════
     酒馆各版本不一样：comment / name / title，有的还会把标题塞进 key[0]。
     我们同步时自己塞进去的条目，如果被宿主的保存流程规范化掉 comment，
     再按 comment 去找就永远找不到 —— 玩家看到的就是
     「点一下同步多了两条，但还是说书里没有」。所以名字要按多个字段取。 */
  /* ══ ★ 00:35：世界书条目的**开关**与**顺序**，字段名各家不一样 ══════════
     开关：SillyTavern 原生是 `disable`（true = 关），酒馆助手的包装层是 `enabled`
           （false = 关）。以前只写 enabled —— 碰上认 disable 的宿主，等于一条都没改，
           作者看到的就是「条目热更新是假的」。
     顺序：ST 默认排序看 `order`（**降序**），切成「自定义排序」则看 `displayIndex`
           （**升序**，真实存在 extensions.display_index 里）。两套都要写。
     ⚠ 所以两边都写、反值对应，谁认哪个都能生效。以后加字段也照这个写法并排加。 */
  function setBookEnabled(e, want) {
    if (!e) return;
    var on = !!want;
    try { e.enabled = on; } catch (e1) {}
    try { e.disable = !on; } catch (e2) {}
    try { e.disabled = !on; } catch (e3) {}
  }
  /* ══ ★★★ 2026-11-18 15:05：**EJS 开关从来没打开过 —— 这就是最大的那个 bug**
     ────────────────────────────────────────────────────────────────────
     作者原话：「变量更新规则哪个模式都不会触发，相当于压根没有」。

     现场证据（三条，独立互证）：
       ① 热更/wbpatch.json：55 条正文含 `<%`（含 [mvu_update]变量更新规则）
       ② 全仓 `ejs:true` 出现 **0 次**（json / js / 卡内世界书全扫）
       ③ 本文件 mutate 只写 `e.content`，**一个字都没碰过开关**

     SillyTavern 的规矩：条目的 EJS 默认**关**。只有 `extensions.ejs === true`
     时渲染器才会去解析 `<% %>`，否则整段代码原样当普通文本塞进 prompt。
     所以我们写了成千上万字的纯爱覆盖声明、牛头闸门、心理阶段分支，
     模型看到的全是 `var thGameMode = ''; try { ... }` 这种 JavaScript，
     **一句指令都没有，两种模式一模一样**。不报错、面板全绿、看起来同步成功。

     这就是「同一个量存在两份、改一份必复发」的极端版：
     正文我们精修过无数轮，开关从头到尾没写过一次。

     判据：**按正文决定，不按条目名白名单**。
       正文里有 `<%` ⇒ 必须开；没有 ⇒ 不碰（玩家自己开的普通条目不受影响）。
     这样以后新加任何带 EJS 的条目都自动生效，不用再回来改这里。

     ⚠ 字段名各家不同，三个都写（照 setBookEnabled 的老规矩并排写）：
       extensions.ejs（ST 原生 / 酒馆助手）
       以及条目顶层的 ejs（部分魔改版直接读顶层）。
     ⚠ 必须写成**纯函数**：wbSyncOnly 那段会被单独切出去跑（_t_wbswitch / _t_wbver），
       函数里不许引用任何外部符号，否则一切片就 ReferenceError。 */
  function setBookEjs(e) {
    if (!e) return false;
    var body = '';
    try { body = String(e.content == null ? '' : e.content); } catch (eC) { return false; }
    /* 没有 EJS 标签 ⇒ 一个字段都不碰（绝不把玩家自己的普通条目改动） */
    if (body.indexOf('<%') < 0) return false;
    try { if (!e.extensions || typeof e.extensions !== 'object') e.extensions = {}; } catch (eX) {}
    try { e.extensions.ejs = true; } catch (e1) {}
    /* 顶层也写一份：酒馆助手重建条目时会读这里 */
    try { e.ejs = true; } catch (e2) {}
    return true;
  }

  function setBookOrder(e, idx) {
    if (!e) return;
    var i = Number(idx);
    if (!isFinite(i)) return;
    /* ★★ v167：order 必须和 displayIndex **同向**。
       上一版写的是 `100 + (1000 - i) * 0.001` —— displayIndex 越小、order 越大。
       ST 默认下拉里 value=0 是 Priority、value=13 是 Custom、
       而 value=7（本机实测就是这个）是 <option data-order="asc" data-field="order">Order ↗ —— **升序**。
       于是整张表被倒过来，玩家看到的就是「顺序没变 / 乱」。
       现在：i 越大 order 越大，两种排序（升序 / 降序）里至少——
         · 升序（Order ↗）：与 displayIndex 同向 ✓
         · 降序（Order ↘）：与 displayIndex 反向 ✗
       所以不能只靠 order。下面同步里另有一招：
       把所有条目的 order 压成**同一个值**，让 primarySort 永远平手，
       然后靠 tertiarySort（uid 升序）决定 —— 这样排序与玩家选哪个下拉无关。
       但 uid 我们改不了（它是存档主键），所以最后还要写 displayIndex。
       这里先把 order 改成同向，保证 Order ↗ 这个最常见的分支是对的。 */
    try { e.displayIndex = i; } catch (e1) {}
    try { e.display_index = i; } catch (e2) {}
    try {
      if (!e.extensions || typeof e.extensions !== 'object') e.extensions = {};
      e.extensions.display_index = i;
    } catch (e3) {}
    /* order 同向递增，量级压在 100 以内（不影响注入优先级的感知） */
    var ord = Math.round((10 + i * 0.001) * 1000) / 1000;
    try { e.order = ord; } catch (e4) {}
    try { e.insertion_order = ord; } catch (e5) {}
  }

  function wbEntryName(e) {
    if (!e) return '';
    var cand = [e.comment, e.name, e.title];
    for (var i = 0; i < cand.length; i++) {
      var v = String(cand[i] == null ? '' : cand[i]).trim();
      if (v) return v;
    }
    try { if (Array.isArray(e.key) && e.key.length) return String(e.key[0] || '').trim(); } catch (e0) {}
    try { if (Array.isArray(e.keys) && e.keys.length) return String(e.keys[0] || '').trim(); } catch (e1) {}
    return '';
  }
  /* 版本号条目还要能按**正文形状**认出来：标题名可以丢，正文丢不了。
     （只在标题名对不上时才用，正常情况不会误伤别的条目）
     ★ 2026-11-16：正则原来要求正文**以「次修复更新）」结尾**，一个字都不许再多。
       而 version.json 的 label 是「v1.22（第 62 次修复更新） · seq 131」——
       末尾带了「 · seq 131」，于是这条**永远认不出来**。
       后果不是"少认一条"那么轻：认不出来 ⇒ 走不到「版本号那一条」的分支 ⇒
       每轮同步都把它的正文按 verLabel 重写一遍、并计入 changed。
       表现就是「点多少次同步，都报改了 2 条」—— 永远收敛不了。
       现在允许版本号后面跟任意尾巴（日期 / seq / 备注都行）。 */
  var RE_VER_CONTENT = /^v\d+(?:\.\d+)*（第\s*\d+\s*次修复更新[^）]*）(\s*·.*)?$/;
  function wbIsVerEntry(e) {
    if (!e) return false;
    if (wbEntryName(e) === WB_VER_ENTRY) return true;
    return RE_VER_CONTENT.test(String(e.content == null ? '' : e.content).trim());
  }
  /* ══ EJS 语法自检 ══════════════════════════════════════════════════
     ST 的 EJS 预处理器会把世界书条目当模板编译。只要某一条里 `<%` 与 `%>`
     不成对、或中间的 JS 括号不闭合，玩家侧就会整片报红：
     「EJS Error / missing ) after argument list」。报错里只有条目序号，
     没有名字，作者根本不知道该改哪条 —— 所以这里扫一遍、把名字报出来。 */
  function wbEjsCheck(content) {
    var s = String(content == null ? '' : content);
    if (s.indexOf('<%') < 0) return '';
    var opens = (s.match(/<%/g) || []).length;
    var closes = (s.match(/%>/g) || []).length;
    if (opens !== closes) return '标签不成对（<% ' + opens + ' 个，%> ' + closes + ' 个）';
    var re = /<%([_=\-#]?)([\s\S]*?)([_=\-]?)%>/g;
    var code = '', m;
    while ((m = re.exec(s)) !== null) {
      if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
      if (m[1] === '#') continue;
      if (m[1] === '=' || m[1] === '-') code += '\n__o(' + m[2] + ');\n';
      else code += '\n' + m[2] + '\n';
    }
    try { new Function('__o', code); return ''; }
    catch (e) { return String((e && e.message) || e); }
  }
  /* 扫一本书，返回坏掉的名字（最多 8 个）与总数 */
  function wbScanEjs(es) {
    var bad = [], n = 0;
    for (var i = 0; i < (es || []).length; i++) {
      var err = wbEjsCheck(es[i] && es[i].content);
      if (!err) continue;
      n++;
      if (bad.length < 8) bad.push({ name: wbEntryName(es[i]) || ('#' + i), err: err });
    }
    return { count: n, list: bad };
  }

  /* 把标题写到宿主可能用的每一个字段上；key 只在空的时候补，别破坏触发词 */
  function wbSetName(e, name) {
    if (!e || !name) return;
    try { e.comment = name; } catch (e0) {}
    /* ★ 00:21：同样无条件写 —— 少了 name 的条目在书里就是「没名字」那一条 */
    try { e.name = name; } catch (e1) {}
    try { e.title = name; } catch (e2) {}
    try { if (Array.isArray(e.key) && !e.key.length) e.key = [name]; } catch (e3) {}
    try { if (Array.isArray(e.keys) && !e.keys.length) e.keys = [name]; } catch (e4) {}
  }   /* ★ 不能叫《版本号测试》——天元录的世界书里也有同名条目 */

  /* ══ 签名条目：判断「这本书是不是我们这张卡的」══════════════════════
     只看《版本号》那一条是不够的 —— 它本来就是要靠同步补进去的，没有它，
     一本正常的书也会被算成「命中 0」，看着像绑错了书。
     这几个名字从第 1 版就在，任何一代春日狂想曲的书里都有。 */
  /* 2026-11-18：《开局设定与玩家信息》已按作者要求删除，必须从签名里摘掉 ——
     签名条目若会被同步删除，老玩家同步后就再也命中不了，反被判成「绑错书」。 */
  var WB_SIG = ['变量列表', '内置思维链', '[mvu_update]变量更新规则', '[mvu_update]变量输出格式'];
  function wbSigMap() {
    var m = {};
    for (var i = 0; i < WB_SIG.length; i++) m[WB_SIG[i]] = 1;
    return m;
  }

  /* ══ 取世界书 API：三路取，缺一路就静默失效 ══════════════════════════
     ① **酒馆助手对象**上的同名方法 —— 它自带 worldbook 实现，最稳
     ② **裸全局** —— 必须写成静态 `typeof getLorebookEntries !== 'undefined'`，
        不能用 `window[name]`：这些函数是顶层变量，**根本不在 window 上**。
        天元录的 xzPickFn 就是这么取的，它那套在实战里跑通过；
        我们上一版只查 window[name]，所以一个都取不到，直接报「宿主没有 getLorebookEntries」。
        （'typeof 未声明变量' 在 strict mode 下也不会抛，所以这段是安全的。）
     ③ 宿主 window（window / top / parent）上再兜一次
     ══════════════════════════════════════════════════════════════════════ */
  var WB_API_NAMES = ['getLorebookEntries', 'setLorebookEntries', 'updateWorldbookWith',
    'updateLorebookEntriesWith', 'createLorebookEntries', 'getCharWorldbookNames',
    'getWorldbookNames', 'getChatBook', 'getCurrentCharPrimaryLorebook', 'getWorldbook',
    'loadWorldInfo', 'saveWorldInfo'];

  function wbBareFn(name) {
    /* 逐名静态判断，不能改成 window[name] */
    try {
      if (name === 'getLorebookEntries' && typeof getLorebookEntries !== 'undefined') return getLorebookEntries;
      if (name === 'setLorebookEntries' && typeof setLorebookEntries !== 'undefined') return setLorebookEntries;
      if (name === 'getCharWorldbookNames' && typeof getCharWorldbookNames !== 'undefined') return getCharWorldbookNames;
      if (name === 'getWorldbookNames' && typeof getWorldbookNames !== 'undefined') return getWorldbookNames;
      if (name === 'getChatBook' && typeof getChatBook !== 'undefined') return getChatBook;
      if (name === 'getWorldbook' && typeof getWorldbook !== 'undefined') return getWorldbook;
      if (name === 'updateWorldbookWith' && typeof updateWorldbookWith !== 'undefined') return updateWorldbookWith;
      if (name === 'loadWorldInfo' && typeof loadWorldInfo !== 'undefined') return loadWorldInfo;
      if (name === 'saveWorldInfo' && typeof saveWorldInfo !== 'undefined') return saveWorldInfo;
      if (name === 'getCurrentCharPrimaryLorebook' && typeof getCurrentCharPrimaryLorebook !== 'undefined') return getCurrentCharPrimaryLorebook;
      if (name === 'updateLorebookEntriesWith' && typeof updateLorebookEntriesWith !== 'undefined') return updateLorebookEntriesWith;
      if (name === 'createLorebookEntries' && typeof createLorebookEntries !== 'undefined') return createLorebookEntries;
    } catch (eB) {}
    return null;
  }

  function pickWbFn(name) {
    /* ① 酒馆助手对象 */
    var ths = [];
    try { if (typeof TavernHelper !== 'undefined' && TavernHelper) ths.push(TavernHelper); } catch (e0) {}
    try { if (window.TavernHelper) ths.push(window.TavernHelper); } catch (e1) {}
    try { if (HW && HW.TavernHelper) ths.push(HW.TavernHelper); } catch (e2) {}
    try { if (window.parent && window.parent !== window && window.parent.TavernHelper) ths.push(window.parent.TavernHelper); } catch (e3) {}
    try { if (window.top && window.top !== window && window.top.TavernHelper) ths.push(window.top.TavernHelper); } catch (e4) {}
    for (var i = 0; i < ths.length; i++) {
      try { if (ths[i] && typeof ths[i][name] === 'function') return ths[i][name].bind(ths[i]); } catch (e5) {}
    }
    /* ①.5 ★ 00:50：SillyTavern 自己的 getContext()。
       loadWorldInfo / saveWorldInfo 只挂在这里 —— 既不在 window 上，也不在 TavernHelper 上。
       这两个是 ST 原生接口，拿到的是**原始条目对象**（order / displayIndex / disable 都在），
       不像酒馆助手那层包装会丢字段。 */
    try {
      var _stCands = [];
      try { if (window.top && window.top.SillyTavern) _stCands.push(window.top.SillyTavern); } catch (eT0) {}
      try { if (window.parent && window.parent !== window && window.parent.SillyTavern) _stCands.push(window.parent.SillyTavern); } catch (eT1) {}
      try { if (window.SillyTavern && _stCands.indexOf(window.SillyTavern) < 0) _stCands.push(window.SillyTavern); } catch (eT2) {}
      for (var _ci = 0; _ci < _stCands.length; _ci++) {
        try {
          var _st = _stCands[_ci];
          if (!_st || typeof _st.getContext !== 'function') continue;
          var _cx = _st.getContext();
          if (_cx && typeof _cx[name] === 'function') return _cx[name].bind(_cx);
        } catch (eT3) {}
      }
    } catch (eCTX) {}
    /* ② 裸全局 */
    var f = wbBareFn(name);
    if (f) return f;
    /* ③ 宿主 window */
    var hosts = [];
    try { hosts.push(window); } catch (e6) {}
    try { if (HW && HW !== window) hosts.push(HW); } catch (e7) {}
    try { if (window.parent && window.parent !== window) hosts.push(window.parent); } catch (e8) {}
    try { if (window.top && window.top !== window) hosts.push(window.top); } catch (e9) {}
    for (var j = 0; j < hosts.length; j++) {
      try { if (hosts[j] && typeof hosts[j][name] === 'function') return hosts[j][name].bind(hosts[j]); } catch (e10) {}
    }
    return null;
  }

  /* 诊断：哪些接口真的取到了 —— 版本页会印出来，读不到时一眼知道缺哪个 */
  function wbProbe() {
    var out = {};
    for (var i = 0; i < WB_API_NAMES.length; i++) {
      var n = WB_API_NAMES[i];
      out[n] = !!pickWbFn(n);
    }
    return out;
  }

  /* ══ ★★ 2026-11-17：**纯本地世界书读取（零网络请求、零 COS 流量）**
     ────────────────────────────────────────────────────────────────────
     已将世界书彻底转为纯本地模式：
     ① 优先读取本地条目槽 HW.__TH_WBPATCH_LOCAL__ || window.__TH_WBPATCH_LOCAL__
     ② 其次复用内存 window.__TH_WBPATCH__
     ③ 再次直接从当前角色卡内嵌 character_book.entries 读取（构建期已写入标准条目）
     零向 COS/网络发起任何 fetch/script 请求，彻底杜绝流量异常。 */
  function fetchWbPatch() {
    try {
      var _loc = HW.__TH_WBPATCH_LOCAL__ || window.__TH_WBPATCH_LOCAL__ || null;
      if (_loc && _loc.length) {
        try { window.__TH_WBPATCH__ = _loc; } catch (eL0) {}
        return Promise.resolve(_loc);
      }
    } catch (eL1) {}
    try {
      if (Array.isArray(window.__TH_WBPATCH__) && window.__TH_WBPATCH__.length) {
        return Promise.resolve(window.__TH_WBPATCH__);
      }
    } catch (eL2) {}
    try {
      var ctx = pickCtx();
      var TH = pickTH();
      var chid = chidOf(ctx, TH);
      var cObj = (ctx && ctx.characters && chid !== null) ? ctx.characters[chid] : null;
      var es = (cObj && cObj.data && cObj.data.character_book && cObj.data.character_book.entries) || null;
      if (Array.isArray(es) && es.length >= 10) {
        var copy = JSON.parse(JSON.stringify(es));
        try { window.__TH_WBPATCH__ = copy; } catch (eWb) {}
        return Promise.resolve(copy);
      }
    } catch (eCard) {}
    return Promise.resolve(window.__TH_WBPATCH__ || []);
  }

  /* 只返回**角色当前绑定**的那本书，至多一本。
     ⚠ 上一版这里会遍历所有候选（角色书 + 聊天书 + 全部世界书），
     再由 wbPickTarget 挑「命中最多」的那本。在同时装了两张卡的机器上，
     挑中了**别人的书** —— 因为天元录的世界书里也有同名条目《版本号测试》，
     命中数打成平手，而它的条目总数更多，那条「平手就挑条目多的」规则
     直接把票投给了别人的书。表现就是：版本号显示别人的、同步还往别人的书里写。
     语义上也不该遍历：这里问的是「**这张卡绑的那本书**是什么版本」，
     不是「这台机器上哪本书最像我的书」。读不到就返回空数组，上层如实报错。 */
  async function wbBookNames() {
    var out = [];
    function push(n) {
      var v = String(n == null ? '' : n).trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    }
    var g0 = pickWbFn('getCurrentCharPrimaryLorebook');
    if (g0) { try { push(await g0()); } catch (e0) {} }
    if (!out.length) {
      var g1 = pickWbFn('getCharWorldbookNames');
      if (g1) {
        try {
          var bn = await g1('current');
          if (bn && bn.primary) push(bn.primary);
          else if (Array.isArray(bn)) bn.forEach(push);
          else push(bn);
        } catch (e1) {}
      }
    }
    /* 聊天书兜底：只有角色书完全读不到时才用它 */
    if (!out.length) {
      var g2 = pickWbFn('getChatBook');
      if (g2) { try { push(await g2()); } catch (e2) {} }
    }
    return out;
  }

  /* 选目标书：遍历候选，挑**含我们条目最多**的那本。
     返回 { name, hit, info } —— info 是每本书的「书名: 总条数/命中数」，给诊断用。 */
  async function wbPickTarget(getE, names, map) {
    var best = '', bestHit = 0, bestCount = 0;
    var info = [];
    for (var i = 0; i < names.length; i++) {
      var nm = names[i];
      var es = null;
      try { es = await getE(nm); } catch (e) { info.push(nm + ': 读失败'); continue; }
      if (!es) { info.push(nm + ': 空'); continue; }
      var hit = 0;
      for (var j = 0; j < es.length; j++) {
        var c = wbEntryName(es[j]);
        if (c && map[c]) hit++;
      }
      info.push(nm + ': ' + es.length + '条/命中' + hit);
      if (hit > bestHit || (hit === bestHit && hit > 0 && es.length > bestCount)) {
        bestHit = hit; best = nm; bestCount = es.length;
      }
    }
    return { name: best, hit: bestHit, info: info };
  }

  /* 写回：三级降级。返回 { how, tried } —— how 为空表示一条路都没走通 */
  async function wbWrite(wb, mutate) {
    var tried = [];
    /* ⓪ ★ 00:50：**先走 ST 原生的 loadWorldInfo / saveWorldInfo**。
       实测过，酒馆助手的 updateWorldbookWith / setLorebookEntries 是包装层：
       它用自己认识的字段重建条目，order / displayIndex 直接被丢掉 ——
       于是「内容 131/131 全对、顺序一条没动、displayIndex 0 条」。
       原生通道拿到的是 data.entries 里**原始对象**，改什么存什么。 */
    var loadFN = pickWbFn('loadWorldInfo');
    var saveFN = pickWbFn('saveWorldInfo');
    if (loadFN && saveFN) {
      try {
        var data = await loadFN(wb);
        if (data && data.entries && typeof data.entries === 'object') {
          var arr = [];
          Object.keys(data.entries).forEach(function (k) {
            var e = data.entries[k];
            if (e && typeof e === 'object') {
              if (e.uid == null) e.uid = k;
              arr.push(e);
            }
          });
          var next = mutate(arr);
          if (Array.isArray(next)) {
            var maxUid = 0;
            Object.keys(data.entries).forEach(function (k) {
              var n = Number(k);
              if (isFinite(n) && n > maxUid) maxUid = n;
            });
            var obj = {};
            next.forEach(function (e) {
              if (!e || typeof e !== 'object') return;
              var uid = (e.uid != null) ? e.uid : (++maxUid);
              e.uid = uid;
              obj[String(uid)] = e;
            });
            data.entries = obj;
            await saveFN(wb, data, true);
            return { how: 'loadWorldInfo+saveWorldInfo（ST 原生）', tried: tried };
          }
        }
      } catch (eN0) {
        tried.push('loadWorldInfo: ' + ((eN0 && eN0.message) || eN0));
      }
    }
    /* ① updateWorldbookWith：酒馆助手包装层（会丢 order / displayIndex，仅作兜底） */
    var uf = pickWbFn('updateWorldbookWith');
    if (uf) {
      try {
        await uf(wb, function (arr) { return mutate(arr || []); }, { render: 'immediate' });
        return { how: 'updateWorldbookWith', tried: tried };
      } catch (e1) { tried.push('updateWorldbookWith: ' + ((e1 && e1.message) || e1)); }
    }
    /* ② setLorebookEntries：整表覆盖 */
    var setE = pickWbFn('setLorebookEntries');
    var getE = pickWbFn('getLorebookEntries');
    if (setE) {
      try {
        var cur = getE ? await getE(wb) : [];
        await setE(wb, mutate(cur || []));
        return { how: 'setLorebookEntries', tried: tried };
      } catch (e2) { tried.push('setLorebookEntries: ' + ((e2 && e2.message) || e2)); }
    }
    /* ③ updateLorebookEntriesWith：回调式（老接口），最后兜底 */
    var upd = pickWbFn('updateLorebookEntriesWith');
    if (upd) {
      try {
        await upd(wb, function (arr) { return mutate(arr || []); });
        return { how: 'updateLorebookEntriesWith', tried: tried };
      } catch (e3) { tried.push('updateLorebookEntriesWith: ' + ((e3 && e3.message) || e3)); }
    }
    return { how: '', tried: tried };
  }

  /* ══ ★ 11-15 02:00：写完必须把**已打开的编辑器**重画一遍 ══════════
     作者实测：先开世界书再同步 → 看起来「没用」；先同步再开 → 有效。

     根因：ST 的 showWorldEditor → loadWorldInfo 返回的是 worldInfoCache 的
     **深拷贝**（StructuredCloneMap cloneOnGet:true），编辑器攥着这份拷贝不放手。
     我们事后 saveWorldInfo 只改了服务器和缓存，编辑器那份旧对象还在内存里，
     于是 ① 画面还是旧顺序 ② 更坏 —— 玩家之后在编辑器里点任何东西
     （开关条目 / 拖动 / 「应用当前排序」），ST 会用整份旧拷贝 saveWorldInfo，
     把刚写好的顺序**一口气盖回旧值**。

     修法：写完主动触发刷新。
       · 首选 SillyTavern.getContext().reloadWorldInfoEditor(name) —— ST 官方出口，
         内部就是 reloadEditor()：把 #world_editor_select 重新 change 一次，
         走完整 showWorldEditor → 从缓存重画。
       · 退路：直接给 #world_editor_select 设值 + trigger('change')（同一条路）。
       · 没打开编辑器（select 为空 / 值对不上）就什么都不做 —— 别替玩家打开面板。
     全部包 try：拿不到就静默，绝不影响同步本身的结果。 */
  function wbRefreshEditor(wb) {
    var out = { done: false, via: '', opened: '' };
    try {
      if (!wb) return out;
      var d = HD;
      var sel = null;
      try { sel = d.querySelector('#world_editor_select'); } catch (eS0) {}
      /* 当前编辑器里选中的是不是这本书（用来判断「到底开着没有」） */
      var curName = '';
      try {
        if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
          curName = String(sel.options[sel.selectedIndex].text || '');
        }
      } catch (eS1) {}
      out.opened = curName;
      /* ★ 11-15 02:20：**先判「编辑器里现在就是这本书」再动手**。
         以前这里直接调 reloadWorldInfoEditor(wb) —— ST 的 reloadEditor 靠
         world_names.indexOf(file) 和 select.value 比，两个都对上才重载。
         可我们拿到的 world_names 未必和宿主同一个数组实例（多 iframe / 重载后），
         一旦 indexOf 返回 -1 它就是静默 no-op；更糟的是有宿主魔改版会
         无条件把面板切过去，玩家正看着别的书就被我们硬拽走。
         所以这里自己判：选中的不是这本书，就当「编辑器没开」，一个字都不做。 */
      if (curName !== wb) return out;
      /* ① ST 官方出口 */
      var st = null;
      try {
        var tops = [HW, window];
        for (var i = 0; i < tops.length; i++) {
          try { if (tops[i] && tops[i].SillyTavern && typeof tops[i].SillyTavern.getContext === 'function') { st = tops[i].SillyTavern.getContext(); break; } } catch (eT) {}
        }
      } catch (eT0) {}
      if (st && typeof st.reloadWorldInfoEditor === 'function') {
        try {
          st.reloadWorldInfoEditor(wb, true);
          out.done = true; out.via = 'reloadWorldInfoEditor';
          return out;
        } catch (eR) {}
      }
      /* ② 退路：自己 trigger 一次 change（等价于玩家在编辑器下拉里重选这本书） */
      if (sel) {
        try {
          var idx = -1;
          for (var k = 0; k < sel.options.length; k++) {
            if (String(sel.options[k].text || '') === wb) { idx = k; break; }
          }
          if (idx >= 0) {
            sel.selectedIndex = idx;
            if (typeof HW.jQuery === 'function' || typeof window.jQuery === 'function') {
              var $ = HW.jQuery || window.jQuery;
              $(sel).trigger('change');
            } else {
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            out.done = true; out.via = 'select.change';
          }
        } catch (eF) {}
      }
      return out;
    } catch (e) {
      return out;
    }
  }

  /* ══ ★ 11-15 02:05：**为什么不用「打开面板时再刷一次」** ══════════
     想过这个世界书抽屉的 change 守卫，否决了，理由写在这免得以后再踩：

     ① 不需要。写入走的是 loadWorldInfo + saveWorldInfo，而 saveWorldInfo 第一件事
        就是 worldInfoCache.set(wb, data)。之后玩家再点开这本书，
        showWorldEditor → loadWorldInfo 命中的是**新缓存**，画出来就是新数据。
        「同步时没开面板 → 后来打开看到旧的」这个场景根本不存在。
     ② 有害。守卫自己 trigger change 会再次进入守卫，得靠计数刹住；
        而玩家的正常编辑（开关条目、改标题）也走同一条 change，
        随便一个误判就是把人家正在编辑的条目面板闪掉 / 把输入框内容冲掉。

     所以只在「写入那一刻编辑器正开着」时刷一次，其余交给缓存。 */

  /* 只读检测：读**角色绑定的那本书**，回答三件事——
     ① 这本书到底是不是这张卡的（按签名条目算命中）
     ② 有没有《春日狂想曲·版本号》这一条
     ③ 它的正文（版本号）是什么
     ⚠ 以前这里只用《版本号》一条当命中依据，于是「书里没有版本号条目」
       被显示成「命中 0 条，像是绑错书」—— 把「没同步」误报成「绑错书」。 */
  /* ══ ★★ 2026-11-18：**不依赖任何 API 的本地扫描兜底**（抄天元录 xzWBLocalEntries）══
     作者原话：「功能页的世界书依旧没检测到，你别犯贱，我求你，这个真的不难，
               我命令你去抄天元录的界面脚本的版本分页里怎么显示的世界书版」

     ── 天元录那套为什么稳 ─────────────────────────────────────────
     它不只走 getLorebookEntries，还**直接翻页面上的世界书对象**：
       · 全局 world_info.entries
       · 角色卡内嵌 character_book.entries（ctx.characters[chid].data.character_book）
     两条都是宿主自己的数据结构，跟「酒馆助手有没有加载完 / 权限给没给」完全无关。
     ──────────────────────────────────────────────────────────────

     ── 我们原来为什么会「依旧没检测到」────────────────────────────
     wbReadOnly 的第一句是 `if (!getE) { msg='取不到 getLorebookEntries'; return out; }`
     —— 一条 API 拿不到就**整条路直接死**，连书名都不再问。而实际上：
       · 有些宿主只给 getWorldbook（不给 getLorebookEntries）
       · 有些宿主两个都不在 iframe 的 window 上，只有 parent/top 有
       · 而 character_book 一定在 ctx.characters 里，谁都能读
     所以现在补一条完全独立的兜底，它**不看 probe 结果**。

     ── 关键：本地扫描也必须有「版本号」────────────────────────────
     作者要的是"世界书版本"，所以这里同样按 WB_VER_ENTRY 找那一条，把正文当版本号。
     版本号那条读不到就等于没检测到 —— 不能拿条目数糊弄过去（那就是假显示）。

     ⚠ 跨 window：脚本在任何一份 document 里都要能跑。宿主对象常挂在 parent/top 上，
       所以这里挨个 win 找，谁有 world_info 就用谁（与天元录 xzHostWins 同构）。 */
  function wbHostWins() {
    var ws = [];
    try { ws.push(window); } catch (e1) {}
    try { if (window.parent && window.parent !== window) ws.push(window.parent); } catch (e2) {}
    try { if (window.top && window.top !== window) ws.push(window.top); } catch (e3) {}
    try { if (HW && ws.indexOf(HW) < 0) ws.push(HW); } catch (e4) {}
    return ws;
  }
  /* 从一堆「条目对象的集合」里把版本号那一条挖出来。集合可能是数组也可能是以 uid 为键的对象。 */
  function wbVerFromBag(bag, bookName) {
    var rows = [];
    try {
      if (!bag) return null;
      if (Array.isArray(bag)) rows = bag;
      else if (typeof bag === 'object') {
        for (var k in bag) {
          if (!Object.prototype.hasOwnProperty.call(bag, k)) continue;
          var e = bag[k];
          if (e && typeof e === 'object') rows.push(e);
        }
      }
    } catch (e) { return null; }
    if (!rows.length) return null;
    var hit = null, count = 0;
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i];
      if (!e) continue;
      count++;
      var nm = String(e.comment == null ? (e.name == null ? '' : e.name) : e.comment).trim();
      if (nm === WB_VER_ENTRY) { hit = e; break; }
      /* 标题被宿主吃掉时按正文认（版本号格式的那条） */
      if (!hit && RE_VER_CONTENT.test(String(e.content == null ? '' : e.content).trim())) hit = e;
    }
    if (!hit) return { found: false, count: count, book: bookName || '' };
    var c = String(hit.content == null ? '' : hit.content).trim();
    return {
      found: true, count: count, book: bookName || '',
      ver: c, uid: (hit.uid !== undefined ? String(hit.uid) : ''),
      name: String(hit.comment == null ? (hit.name == null ? '' : hit.name) : hit.comment).trim()
    };
  }
  function wbLocalScan() {
    /* ① 角色卡内嵌 character_book —— 这条最可靠，一定在 ctx.characters 里 */
    try {
      var ctx = pickCtx();
      if (ctx && ctx.characters) {
        var chid = null;
        try { chid = (ctx.characterId != null) ? ctx.characterId : null; } catch (eC) {}
        var tries = [];
        if (chid != null && ctx.characters[chid]) tries.push(ctx.characters[chid]);
        /* characterId 不可用时，把有 character_book 的都试着扫一遍（取第一个有版本号的） */
        if (!tries.length) {
          for (var ci = 0; ci < ctx.characters.length; ci++) {
            var c0 = ctx.characters[ci];
            if (c0 && c0.data && c0.data.character_book) tries.push(c0);
          }
        }
        for (var ti = 0; ti < tries.length; ti++) {
          var ch = tries[ti];
          var bk = ch && ch.data && ch.data.character_book;
          if (!bk || !bk.entries) continue;
          var r = wbVerFromBag(bk.entries, String(bk.name || (ch && ch.name) || '（卡内嵌）'));
          if (r && r.found) { r.src = 'card-embedded'; return r; }
        }
      }
    } catch (eEmb) {}
    /* ② 宿主运行时世界书对象 world_info.entries（跨 window 挨个找） */
    try {
      var wins = wbHostWins();
      for (var wi = 0; wi < wins.length; wi++) {
        var w = wins[wi];
        if (!w) continue;
        var got = null;
        try {
          var wil = w.world_info || (w.SillyTavern && w.SillyTavern.world_info) || null;
          if (wil && wil.entries) got = wil.entries;
        } catch (eW1) {}
        if (!got) continue;
        /* world_info.entries 常按书名字典包一层：{ '书A': { entries: {...} } } */
        var direct = wbVerFromBag(got, 'world_info');
        if (direct && direct.found) { direct.src = 'host-world_info'; return direct; }
        try {
          for (var bkn in got) {
            if (!Object.prototype.hasOwnProperty.call(got, bkn)) continue;
            var bag2 = got[bkn];
            var inner = (bag2 && bag2.entries) ? bag2.entries : bag2;
            var r2 = wbVerFromBag(inner, bkn);
            if (r2 && r2.found) { r2.src = 'host-world_info'; return r2; }
          }
        } catch (eW2) {}
      }
    } catch (eWL) {}
    return null;
  }

  async function wbReadOnly() {
    var out = { ok: false, wb: '', ver: '', count: 0, hit: 0, sample: '', books: '',
                verSrcUid: '', verSrcName: '', verSrcIdx: 0, verBy: '',
                probe: null, msg: '', state: '', ejsBad: 0, ejsNames: [],
                /* ★ 2026-11-18：世界书新鲜度按「版本号」判（作者要求）。
                   want = 本卡期望版本号；stale = 书里版本号 ≠ want。 */
                want: '', fresh: false, stale: false, staleWhy: '', staleHit: [] };
    try {
      out.probe = wbProbe();
      var getE = pickWbFn('getLorebookEntries');
      var es = null;
      var hitEnt = null;

      /* ══ 路线 ①：宿主 API（最完整：能拿到 uid / displayIndex / enabled） ══ */
      if (getE) {
        var names = [];
        try { names = await wbBookNames(); } catch (eNm) { names = []; }
        if (names.length) {
          var pick = await wbPickTarget(getE, names, wbSigMap());
          out.books = pick.info.join('  |  ');
          out.wb = pick.name || names[0] || '';
          try { es = out.wb ? await getE(out.wb) : []; } catch (eEs) { es = []; }
          es = es || [];
          out.count = es.length;
          out.hit = pick.hit || 0;
          out.sample = es.slice(0, 3).map(function (e) {
            return wbEntryName(e) || '（无名）';
          }).join(' / ');
          hitEnt = es.filter(wbIsVerEntry)[0] || null;
          out.ver = hitEnt ? String(hitEnt.content == null ? '' : hitEnt.content).trim() : '';
        } else {
          out.books = '（拿不到世界书名）';
        }
      } else {
        out.books = '（没有 getLorebookEntries）';
      }

      /* ══ 路线 ①.5：主书里没有版本号 → 把**所有**世界书都翻一遍 ═══════════
         ★ 2026-11-18：抄天元录 xzWBCollect 的关键一点 —— 它**从不「选一本」**，
           而是每本都读、拍平成一个大数组，再按条目名去找。
         为什么必须这样：ST 里「角色主书」经常不是玩家真正在用的那一本
           （聊天书 / 附加书 / 手动绑的另一本 / 换卡后主书还指着旧书），
           旧逻辑只问主书 ⇒ 主书里没这条就永远找不到，界面只能报「未同步」。
         ⚠ 只用于**读**。同步（写）仍然只写主书 —— 绝不能因为读到了别人的书
           就往别人的书里写。读与写两套取书范围，是故意的。 */
      if (!out.ver && getE) {
        try {
          var _allNames = [];
          var _gAll = pickWbFn('getWorldbookNames');
          if (_gAll) {
            var _an = await _gAll();
            if (Array.isArray(_an)) _allNames = _an;
          }
          for (var _ai = 0; _ai < _allNames.length; _ai++) {
            var _bnm = _allNames[_ai];
            if (!_bnm || names.indexOf(_bnm) >= 0) continue;
            var _bes = null;
            try { _bes = await getE(_bnm); } catch (eA1) { _bes = null; }
            if (!_bes || !_bes.length) continue;
            var _bh = _bes.filter(wbIsVerEntry)[0] || null;
            if (!_bh) continue;
            out.ver = String(_bh.content == null ? '' : _bh.content).trim();
            out.wb = _bnm;
            out.count = _bes.length;
            es = _bes;
            hitEnt = _bh;
            out.verSrcUid = (_bh.uid != null) ? String(_bh.uid) : '';
            out.verSrcName = wbEntryName(_bh) || '';
            out.verSrcIdx = 1;
            out.verBy = 'name';
            out.books = (out.books ? out.books + '  |  ' : '') + _bnm + '：' + _bes.length + ' 条（版本号在此）';
            out.sample = out.verSrcName + ' = ' + out.ver;
            out.hit = out.hit || 1;
            break;
          }
        } catch (eA2) {}
      }

      /* ══ 路线 ②：本地扫描兜底（抄天元录 xzWBLocalEntries）═════════════════
         作者原话：「功能页的世界书依旧没检测到，你别犯贱，我求你，这个真的不难，
                   我命令你去抄天元录的界面脚本的版本分页里怎么显示的世界书版」

         ── 原来为什么「依旧没检测到」──────────────────────────────
         旧实现开头两句：
             if (!getE) { msg='取不到 getLorebookEntries'; return out; }
             if (!names.length) { msg='读不到任何世界书名'; return out; }
         一条 API 不通就**整条路直接死**。而版本号其实同时躺在两个
         跟"酒馆助手加载没加载完"完全无关的地方：
             · 角色卡内嵌 data.character_book.entries
             · 宿主运行时 world_info.entries
         ── 所以这里：API 没拿到版本号，就本地扫；两个都扫不到才如实报错。
            ⛔ **绝不许**在都失败时伪造一个版本号 —— 那是假显示，作者抓到过一次。 */
      var _locSrc = '';
      if (!out.ver) {
        var loc = null;
        try { loc = wbLocalScan(); } catch (eLoc) { loc = null; }
        if (loc && loc.found) {
          out.ver = loc.ver || '';
          out.wb = loc.book || '（本地扫描）';
          out.count = loc.count || 0;
          out.verSrcUid = loc.uid || '';
          out.verSrcName = loc.name || '';
          out.verSrcIdx = 1;
          out.verBy = 'local';
          _locSrc = loc.src || 'local';
          out.books = '本地扫描命中（' + _locSrc + '）｜' + out.wb + '：' + out.count + ' 条';
          out.sample = '版本号 = ' + out.ver;
          /* 本地扫描无法给出 uid 级别的 raw 条目，补一条最小可用对象给后面的 hit / EJS 判断 */
          es = es || [];
          out.hit = out.hit || 1;
          hitEnt = { comment: WB_VER_ENTRY, content: out.ver };
        }
      }

      /* 两条路线都没拿到条目：如实报错（分清楚是"没 API"还是"没书"） */
      if (!es || !es.length) {
        if (!hitEnt) {
          if (!getE) {
            out.state = 'no-api';
            out.msg = '取不到 getLorebookEntries，本地扫描（卡内嵌 character_book + 宿主 world_info）'
              + '也没找到《' + WB_VER_ENTRY + '》—— 酒馆助手没加载完，或这本世界书里没有版本号条目';
          } else if (!out.wb || out.wb === '（拿不到世界书名）') {
            out.state = 'no-book';
            out.msg = '读不到任何世界书名（角色没绑世界书？），本地扫描也没命中《' + WB_VER_ENTRY + '》';
          } else {
            out.state = 'foreign';
            out.msg = '绑定的《' + out.wb + '》里没有一条这张卡的条目'
              + (out.sample ? '（书里前几条：' + out.sample + '）' : '')
              + ' —— 像是绑到了另一张卡的书上。';
          }
          return out;
        }
      }

      /* ══ 版本号 → 与「本卡期望号」比对（两条路线共用同一段）══════════════
         作者原话：「直接以版本号为显示」「每次改世界书就版本号改一下」。
         判据唯一：书里版本号条目正文 == 本卡期望版本号。
         期望值来源：卡内嵌 __TH_WB_EXPECT_VER__（本地卡）/ 权威源版本号条目 / 联网 label。 */
      try {
        var _want = '';
        try { _want = String(window.__TH_WB_EXPECT_VER__ || (HW && HW.__TH_WB_EXPECT_VER__) || ''); } catch (eW0) {}
        if (!_want) {
          var _locList = window.__TH_WBPATCH_LOCAL__ || (HW && HW.__TH_WBPATCH_LOCAL__) || [];
          for (var _li = 0; _li < (_locList || []).length; _li++) {
            if (String((_locList[_li] && (_locList[_li].comment || _locList[_li].name)) || '') === WB_VER_ENTRY) {
              _want = String((_locList[_li] && _locList[_li].content) || '').trim(); break;
            }
          }
        }
        if (!_want) {
          /* ★ 2026-11-18：热更卡以内嵌条目包的版本号为准（书会被同步成它） */
          try {
            var _pk2 = window.__TH_WBPATCH__ || (HW && HW.__TH_WBPATCH__) || null;
            for (var _pj = 0; _pj < (_pk2 || []).length; _pj++) {
              if (String((_pk2[_pj] && (_pk2[_pj].comment || _pk2[_pj].name)) || '') === WB_VER_ENTRY) {
                _want = String((_pk2[_pj] && _pk2[_pj].content) || '').trim(); break;
              }
            }
          } catch (ePk2) {}
        }
        if (!_want) { try { _want = String((window.__CQ_OSS_LABEL__ || (HW && HW.__CQ_OSS_LABEL__) || '')); } catch (eW1) {} }
        out.want = _want;
        if (_want && out.ver) {
          out.stale = (out.ver !== _want);
          out.fresh = !out.stale;
          out.staleWhy = out.stale ? ('书里是 ' + out.ver + '，本卡是 ' + _want) : '';
          out.staleHit = out.stale ? [WB_VER_ENTRY] : [];
        } else {
          /* 任一侧读不到：不判 stale、也不假 fresh（core 会按「未读到」显示检测中） */
          out.stale = false; out.fresh = false; out.staleWhy = ''; out.staleHit = [];
        }
      } catch (eFp) { out.fresh = false; out.stale = false; out.staleWhy = ''; }

      /* ══ 证据链（作者原话：「这个版本号是假显示，条目里连一个版本号的条目都没有」）══
         必须能自证：显示的号到底是从**哪一条**读出来的。
           verSrcUid   —— 这条的 uid（宿主认这个；空 = 没找到）
           verSrcName  —— 它的实际条目名（标题被吃掉时会是 '' 或别的）
           verSrcIdx   —— 它在书里第几条（1 起；0 = 没找到）
           verBy       —— 'name' 按标题名认 / 'content' 标题丢了按正文认 / 'local' 本地扫描
         ⚠ 界面必须**只信 out.ver**，ver 为空就显示「书里没有这条」，
           绝不许拿 __CQ_OSS_LABEL__ 顶上 —— 那正是「假显示」的来路。 */
      if (!_locSrc) {
        try {
          var _vIdx = -1;
          for (var _vi2 = 0; _vi2 < (es || []).length; _vi2++) {
            if (wbIsVerEntry(es[_vi2])) { _vIdx = _vi2; break; }
          }
          if (_vIdx >= 0) {
            var _ve = es[_vIdx];
            out.verSrcUid = (_ve && _ve.uid != null) ? String(_ve.uid) : '';
            out.verSrcName = wbEntryName(_ve) || '';
            out.verSrcIdx = _vIdx + 1;
            out.verBy = (wbEntryName(_ve) === WB_VER_ENTRY) ? 'name' : 'content';
          } else {
            out.verSrcUid = ''; out.verSrcName = ''; out.verSrcIdx = 0; out.verBy = '';
          }
        } catch (eVd) { out.verSrcIdx = 0; out.verBy = ''; }
      }

      /* 书里一条签名条目都没有 → 这本不是这张卡的（游戏版/文字版书名相同）。
         ⚠ 本地扫描命中时 out.hit 已经补成 1，不会误判。 */
      if (!out.hit) {
        out.state = 'foreign';
        out.msg = '绑定的《' + out.wb + '》' + out.count + ' 条里没有一条这张卡的条目'
          + (out.sample ? '（书里前几条：' + out.sample + '）' : '')
          + ' —— 像是绑到了另一张卡的书上。';
        return out;
      }

      if (!hitEnt) {
        out.state = 'no-entry';
        /* 诊断：把最后 3 条的「各字段到底有没有值」报出来，一次就能看出宿主吃掉了哪个字段 */
        try {
          var tail = (es || []).slice(-3);
          out.sample = out.sample + ' ｜ 末3条:' + tail.map(function (e) {
            return 'comment=' + JSON.stringify(String(e.comment == null ? '' : e.comment).slice(0, 12)) +
                   ',name=' + JSON.stringify(String(e.name == null ? '' : e.name).slice(0, 12)) +
                   ',key0=' + JSON.stringify(String((Array.isArray(e.key) && e.key[0]) || '').slice(0, 12));
          }).join(' / ');
        } catch (eD) {}
        out.msg = '这本《' + out.wb + '》' + out.count + ' 条里命中我们的 ' + out.hit +
          ' 条，但还缺《' + WB_VER_ENTRY + '》，点「同步世界书」补进去';
        return out;
      }

      /* EJS 自检：有坏条目就带出去，版本页直接列名字（本地扫描没有原始条目，跳过） */
      if (!_locSrc) {
        try {
          var _sc = wbScanEjs(es);
          out.ejsBad = _sc.count;
          out.ejsNames = _sc.list;
        } catch (eSc) { out.ejsBad = 0; out.ejsNames = []; }
      } else {
        out.ejsBad = 0; out.ejsNames = [];
      }

      out.ok = !!out.ver;
      out.state = out.ok ? 'ok' : 'empty';
      if (!out.ver) out.msg = '书里有《' + WB_VER_ENTRY + '》，但正文是空的';
      return out;
    } catch (e) {
      out.msg = '读世界书失败：' + ((e && e.message) || e);
      return out;
    }
  }

  /* 真同步：选书 → 写正文 + 补缺 + 删「创作要求」 → **回读比对** */
  /* ══ ★ 2026-11-22：玩家条目保护（账本）══════════════════════════════════
     作者需求：「有的条目是必须改（官方更新要进得来），但玩家自己改过的不能被覆盖」。
     一个账本同时满足两件事：
       · 每次同步**写入成功后**，把每条「我们写入后的正文」记成 hash 账本；
       · 下次同步逐条对：书里现在的 hash ≠ 账本 ⇒ 玩家动过 ⇒ **跳过这条**，
         官方更新不覆盖它；书里 hash = 账本 ⇒ 玩家没动 ⇒ 官方更新**照常写入**。
       · 版本页「恢复官方」按钮：清账本 + 强制重同步，玩家的改动让位官方。
     ⚠ 必须定义在 var WB_VER_ENTRY 之后（_t_wbver 从那里切片，切出来要自足）。 */
  function wbHash(s) {
    s = String(s == null ? '' : s);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + '-' + s.length;
  }
  var WB_LEDGER_KEY = 'sprWbHashLedger';
  function wbLedgerLoad() {
    try { return JSON.parse(HW.localStorage.getItem(WB_LEDGER_KEY) || '') || { wb: '', hash: {} }; }
    catch (e) { return { wb: '', hash: {} }; }
  }
  function wbLedgerSave(o) {
    try { HW.localStorage.setItem(WB_LEDGER_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function wbEntryProtected(wbName, nm, curContent) {
    try {
      if (!nm) return false;
      /* ★ 2026-11-22：版本号是系统条目，永远不许被玩家保护挡住（否则书会停在旧标签） */
      if (nm === WB_VER_ENTRY) return false;
      var lg = wbLedgerLoad();
      if (!lg || lg.wb !== wbName) return false;
      var rec = lg.hash ? lg.hash[nm] : null;
      if (rec == null) return false;
      return rec !== wbHash(curContent);
    } catch (e) { return false; }
  }

  async function wbSyncOnly(opts) {
    opts = opts || {};
    var out = { ok: false, wb: '', total: 0, same: 0, changed: 0, added: 0, removed: 0,
                ver: '', count: 0, diff: [], how: '', tried: [], books: '', probe: null,
                extra: 0, extraNames: [],
                partial: false, msg: '' };
    try {
      out.probe = wbProbe();
      var getE = pickWbFn('getLorebookEntries');
      if (!getE) {
        var miss = [];
        for (var k in out.probe) { if (!out.probe[k]) miss.push(k); }
        out.msg = '取不到 getLorebookEntries。缺：' + (miss.join(',') || '（全部）');
        return out;
      }
      var list = (Array.isArray(opts.list) && opts.list.length) ? opts.list : await fetchWbPatch();
      out.total = list.length;
      if (!list.length) { out.msg = '线上条目包拉取失败（JSONP 没回来，检查网络 / COS）'; return out; }

      /* ══ ★ 2026-11-16：**同名条目不能互相覆盖** ══════════════════════════
         线上包里 3 条「====================」分隔条名字完全一样（只差零宽空格，
         归一化后是同一个名字）。这里原来是 `map[c] = x` ——
         三条写同一个键，前两条被第三条覆盖掉。
         ────────────────────────────────────────────────────────────────────
         后果（玩家看不到、但每次同步都在发生）：
         后面 `var src = map[nm]` 取到的是**最后一条**的 display_index，
         于是书里 3 条分隔条**每一轮都被改成同一个序号**，三条互相覆盖，
         永远定不下来。表现就是「点同步 → 显示改了 2 条 → 再点还是改 2 条」。
         这不是幂等断言写错，是真 bug：**同一个键只能有一个值，
         但这里同一个名字对应三条实体，语义上就不该用 map**。
         ────────────────────────────────────────────────────────────────────
         修法：同名条目收成一个数组（map[nm] 仍是第一条，保持老代码不用改），
         分隔条走独立的**按序取用**：第 1 条分隔条配第 1 条、第 2 条配第 2 条。
         `seqOf` 记「这个名字已经用掉几个」，只在分隔条分支里递增。 */
      /* ★★ 2026-11-16：SEP_NAME 必须**声明在使用它之前**。
         原来它写在下面 1913 行（循环体之后），靠 var 提升能「跑通不报错」，
         但**提升只提声明、不提赋值** —— 循环体里执行到 isSepName() 时它的值还是
         undefined，于是 String(v).indexOf(undefined) === -1 恒成立 ⇒ isSepName 永远 false。
         后果：整套「分隔条就近就位」的空转保护**一次都没生效过**。
         三条分隔条全走 `src = map[nm]`（永远取第一条 di=9），把 di=79/di=85 两条
         每轮压回 9 —— 而末尾统一重编号只改字段、不改数组元素，于是下一轮又从 9 开始，
         永远收敛不了。表现就是「点多少遍同步都显示改了 2 条」。
         ──────────────────────────────────────────────────────────────────
         这正是「同一个符号两处真相」的另一种形态：`var` 让语法检查全绿，
         `node --check` 也不会报，只有真正跑起来才知道它是 undefined。 */
      var SEP_NAME = '====================';
      /* ★ 2026-11-22：包里还有第二种分隔条「—————————————」（纯长横线，4 条，
         无 display_index / 无 keys / 空正文）。旧 isSepName 只认 ====，
         导致这 4 条被当普通条目 ⇒ 重编号时没有 display_index 全部沉底 ⇒ 顺序乱。 */
      function isSepName(v) {
        var t = String(v || '');
        if (!t) return false;
        if (t.indexOf(SEP_NAME) === 0) return true;
        return /^[—=_-]{6,}$/.test(t);   /* 纯分隔符（长横线/等号/短横线/下划线）≥6 个 */
      }

      var map = {}, mapAll = {};
      list.forEach(function (x) {
        var c = String(x.comment || '');
        if (!c) return;
        if (!map[c]) map[c] = x;
        (mapAll[c] = mapAll[c] || []).push(x);
      });
      var seqOf = {};

      var names = await wbBookNames();
      if (!names.length) { out.msg = '读不到任何世界书名（角色没绑书？）'; return out; }
      var pick = await wbPickTarget(getE, names, map);
      out.books = pick.info.join('  |  ');
      if (!pick.name) {
        /* ⛔⛔ 2026-11-18 00:25 —— 作者原话：「你的问题，还是没改」。
           ────────────────────────────────────────────────────────────────
           这里是**死锁**，一直没被发现：
             wbPickTarget 只在「命中 > 0」时才认一本书。
             而作者把旧的同名书写删了 ⇒ 角色绑定的那本是**空的** ⇒
             命中恒为 0 ⇒ pick.name 恒为空 ⇒ 走进下面这个「为防污染不写入」
             ⇒ 永远写不进去 ⇒ 作者刷新再多遍也还是空的。
            ────────────────────────────────────────────────────────────────
           正确判据：**空书 ≠ 别人的书**。一本书 0 条，它里面没有任何
           「别人的内容」可以被污染，往空书里写正是我们要做的事。
           所以：只要候选里有一本是**空的**，就直接选它、照常写入。
           只有「非空、且一条都不命中」才维持拒写（那才是真·别人的书）。 */
        var _emptyName = '';
        for (var _bi = 0; _bi < names.length; _bi++) {
          var _bes = null;
          try { _bes = await getE(names[_bi]); } catch (eBE) { continue; }
          if (_bes && _bes.length === 0) { _emptyName = names[_bi]; break; }
        }
        if (_emptyName) {
          pick = { name: _emptyName, hit: 0, info: (pick.info || []).concat([_emptyName + ': 空书→直接建']) };
          out.books = pick.info.join('  | ');
        } else {
          var es0 = names[0] ? await getE(names[0]) : [];
          var sample0 = (es0 || []).slice(0, 3).map(function (e) {
            return String((e && (e.comment || e.name)) || '（无名）');
          }).join(' / ');
          out.msg = '绑定的《' + (names[0] || '?') + '》' + ((es0 || []).length) +
            ' 条里没有一条我们的条目' + (sample0 ? '（前几条：' + sample0 + '）' : '') +
            ' —— 为防污染别人的世界书，本次不写入。';
          return out;
        }
      }
      /* ★ 命中不是满额（<10）说明书名撞了、绑到了另一代的同名牌上。
         这种书**只补匹配到的条目 + 版本号**，不批量补 128 条、不删任何东西。
         ⛔⛔ 2026-11-18 00:26：**空书绝不算 partial**。
         partial 的语义是「这本书里有别人的东西，别动」——
         而 0 条的书里根本没有别人的东西。作者把旧书删了以后，
         角色绑的就是空书；如果它被当成 partial，下面第 2488 行会
         `if (partial && nm !== WB_VER_ENTRY) return;` ⇒ 90 条全跳过、
         只补一条版本号 ⇒ 作者看到的还是「没改」。
         所以：空书 = 全新书 = 走**全量**（该补的补、该开的开）。
         这是第三个死锁，前两个分别是 wbPickTarget 不认空书、以及拒写分支。 */
      var _isEmptyBook = (pick.hit === 0);
      var partial = !_isEmptyBook && pick.hit < 10;
      out.partial = partial;
      out.emptyBook = _isEmptyBook;
      var wb = pick.name;
      out.wb = wb;

      var cnt = { changed: 0, added: 0, removed: 0 };
      /* ══ ★★★ 2026-11-16：mutate 里**只许用这一段自己算出来的值** ══════════
         踩过的坑（就是「每次同步必定失效」的最后一块）：
         mutate 里调了 wantedBookPack()，而它定义在第 421 行 ——
         但 wbSyncOnly 这一整段是能被**单独切出去跑**的（_t_wbver.mjs 从
         `var WB_VER_ENTRY` 切到函数末尾），切出来的块里没有它。
         于是 mutate 第一行判据就 ReferenceError，异常被 wbWrite 的三层
         try/catch 吞掉，三级通道全部走不通 ⇒ 面板只剩
         「一条写入通道都没走通」，一条都没写，每次都一样。
         ────────────────────────────────────────────────────────────────────
         现在把三个判据在**这里**就地算成纯数据（不调任何外部函数），
         mutate 只读这三个变量。判据本身与 wantedBookPack 逐条等价：
           ① 篇章名单（CFG 两个数组）→ 按模式裁决
           ② 《[InitVar]初始变量》→ 恒关
           ③ 包里 enabled === true → 开；否则保持原值
         CFG 也可能不在切片里，逐字段兜底成空数组（空数组 = 不裁决，安全）。 */
      var syncMode = 'game';
      try { if (typeof readMode === 'function') syncMode = readMode() || syncMode; } catch (eSm) {}
      var _offInText = [], _nonOnly = [];
      try { _offInText = (typeof CFG !== 'undefined' && CFG && CFG.bookOffInText) || []; } catch (eC1) {}
      try { _nonOnly = (typeof CFG !== 'undefined' && CFG && CFG.bookNonOnly) || []; } catch (eC2) {}
      /* ★ 2026-11-18 15:43：原来的「强制恒关名单」（推演用三条）已随条目一起删除 ——
         那三条现在由 RETIRED_ENTRIES 物理删掉，不需要"恒关"。
         恒关只会让老玩家书里一直留着三条白烧 token 的死条目。 */
      /* 就地判据：返回 true = 这条该开着。
         ⚠ 第一句必须是**前缀**判断（作者强制命令：初始化变量恒关，两条都不许亮）。
         不能改成调外部的 isInitVarName —— 这一段会被单独切出去跑（_t_wbver.mjs）。 */
      function _wantOnPack(nm, curOn, packEnabled) {
        var n = String(nm == null ? '' : nm);
        if (n.indexOf('[InitVar]') === 0) return false;
        if ((CFG.bookAlwaysOn || []).indexOf(n) >= 0) return true;   /* 变量规则 / 变量强调：两种模式都开 */
        if (_offInText.indexOf(n) >= 0) return syncMode === 'game';
        if (_nonOnly.indexOf(n) >= 0) return syncMode === 'text';
        if (packEnabled === true) return true;
        return !!curOn;
      }
      var verSrc = null;
      for (var vi = 0; vi < list.length; vi++) {
        if (String(list[vi].comment || '') === WB_VER_ENTRY) { verSrc = list[vi]; break; }
      }
      var verLabel = verSrc && typeof verSrc.content === 'string' ? verSrc.content : '';

      function mutate(arr) {
        var c = { changed: 0, added: 0, removed: 0 };
        var outArr = [];
        var verSeen = 0;
        /* ★★ v167：同名重复条目去重（实测书里有 55 条「节庆·公共底座」）。
           为什么必须在这里做：这 55 条都会命中同一个 src，
           排序时 __thOrd 全填同一个值、挤在一起，把后面的真条目整体推后 54 位 ——
           玩家看到的「顺序全乱」就是这么来的。
           保守策略：只删「同名 + 正文完全相同」的，正文不同的一个不动；
           保留 displayIndex 最小的那一条；分隔条单独按包内数量上限收口。 */
        var __dropUid = {};
        var __dropSepSet = [];
        var _sepWant0 = 0;
        list.forEach(function (y) { if (isSepName(y.comment)) _sepWant0++; });
        if (!partial) {
          try {
            var __groups = {};
            var __sepCands = [];
            (arr || []).forEach(function (e) {
              if (!e) return;
              var nm0 = wbEntryName(e);
              if (isSepName(nm0)) { __sepCands.push(e); return; }
              if (!nm0 || !map[nm0]) return;              /* 包里没有的名字：不碰 */
              var ct = String(e.content == null ? '' : e.content);
              if (!ct) return;                            /* 空正文不参与，免得把废条目当重复 */
              var sig = nm0 + '\u0001' + ct;
              if (!__groups[sig]) __groups[sig] = [];
              __groups[sig].push(e);
            });
            /* ★★ 2026-11-17：分隔条多余副本也必须删掉（只留包内需要的 _sepWant0 条）。
               以前上面写着「交给下面补入阶段按 sepWant/sepHave 收口」，
               但补入阶段只防继续新增、根本不删已有副本，于是书里 9 条分隔条永远删不掉，
               导致 wbCompareBook 的 out.count === list.length (101 === 95) 恒为 false，
               心跳每 45 秒重刷写盘死循环。 */
            if (__sepCands.length > _sepWant0) {
              __sepCands.sort(function (a, b) {
                var ai = Number(a.displayIndex != null ? a.displayIndex
                  : (a.extensions && a.extensions.display_index != null ? a.extensions.display_index : 1e9));
                var bi = Number(b.displayIndex != null ? b.displayIndex
                  : (b.extensions && b.extensions.display_index != null ? b.extensions.display_index : 1e9));
                if (!isFinite(ai)) ai = 1e9;
                if (!isFinite(bi)) bi = 1e9;
                return ai - bi;
              });
              for (var __sk = _sepWant0; __sk < __sepCands.length; __sk++) {
                __dropSepSet.push(__sepCands[__sk]);
              }
            }
            for (var __sg in __groups) {
              var __g = __groups[__sg];
              if (!__g || __g.length <= 1) continue;
              __g.sort(function (a, b) {
                var ai = Number(a.displayIndex != null ? a.displayIndex
                  : (a.extensions && a.extensions.display_index != null ? a.extensions.display_index : 1e9));
                var bi = Number(b.displayIndex != null ? b.displayIndex
                  : (b.extensions && b.extensions.display_index != null ? b.extensions.display_index : 1e9));
                if (!isFinite(ai)) ai = 1e9;
                if (!isFinite(bi)) bi = 1e9;
                return ai - bi;
              });
              for (var __k = 1; __k < __g.length; __k++) {
                var __du = __g[__k].uid;
                if (__du != null) __dropUid[String(__du)] = 1;
              }
            }
          } catch (eDd) {}
        }
        (arr || []).forEach(function (e) {
          if (!e) return;
          /* ★ v167：同名同文的多余副本，直接丢（只在全量模式下起效） */
          if (e.uid != null && __dropUid[String(e.uid)]) { c.removed++; return; }
          /* ★ 2026-11-17：超出包内数量的多余分隔条副本，直接丢（只留 _sepWant0 条） */
          if (__dropSepSet.indexOf(e) >= 0) {
            c.removed++;
            c.extraGone = (c.extraGone || 0) + 1;
            if (!c.extraNames) c.extraNames = [];
            if (c.extraNames.length < 12) c.extraNames.push(wbEntryName(e) || SEP_NAME);
            return;
          }
          var nm = wbEntryName(e);
          /* ★ 00:21：书里已经有「没名字」的条目怎么办 —— 按**正文**反查条目包补回名字。
             只在我们自己的书里做（partial 说明书名撞了，不许乱认领）；
             正文太短的跳过，免得空内容互相认错。 */
          if (!nm && !partial) {
            try {
              var _c0 = String(e.content == null ? '' : e.content);
              if (_c0 && _c0.length >= 20) {
                /* ★ 00:42：以前要求**全文完全一致**才算同一条 —— 可无名条目的内容
                   往往已经旧了（上一版同步过来的），于是既补不上名字、又因为没名字
                   永远匹配不到条目包，内容也永不更新 ⇒ 死锁。
                   改成比**正文前缀**（前 60 字），容忍后面的差异。 */
                var _pre = _c0.slice(0, 60);
                for (var _ck in map) {
                  if (String(map[_ck].content == null ? '' : map[_ck].content).slice(0, 60) === _pre) {
                    wbSetName(e, _ck);
                    nm = _ck;
                    c.changed++;
                    break;
                  }
                }
              }
            } catch (eNm) {}
          }
          /* ★★★ 强制命令（作者 2026-11-16 23:14/23:16）：初始化变量**恒关、且只能有一条**。
             ────────────────────────────────────────────────────────────────
             判据用**前缀** `[InitVar]`，不是精确名字：
               · 精确等值会让「·文字版」那条溜过去（它包里写着 enabled:true）；
               · 那条现已并入本条并从包里删除，老玩家书里的实体由 RETIRED_ENTRIES 清掉；
               · 前缀判断是最后一道保险 —— 万一书里还残留同前缀条目，这里直接摁灭。
             优先级最高，排在下方的逐条裁决之前。 */
          if (nm && nm.indexOf('[InitVar]') === 0 && (e.enabled !== false || e.disable !== true)) { setBookEnabled(e, false); }
          /* ★★★ 2026-11-16：**书里每一条的开关，每一轮同步都要按包里声明重新裁决**。
             ────────────────────────────────────────────────────────────────
             这里以前只有上面那一行（只动《[InitVar]初始变量》），别的条目**一律不碰**。
             于是：一旦某条被关上了（新补进去的默认就是关、玩家手滑点灭、或者旧版
             同步写的 false），它就**永远关着** —— 后续每一次同步都不管它，
             而回读比对只比正文、不比开关，于是面板上永远显示「一致 104/104 ✅」。
             作者看到的就是「同步了又不行了，每次都必定失效」。
             ────────────────────────────────────────────────────────────────
             现在按 wantedBookPack 逐条裁决：篇章名单 > [InitVar] > 包里 enabled===true
             > 保持原值。只写「真的需要变」的，不制造无谓的 changed 计数。 */
          try {
            if (nm && nm.indexOf('[InitVar]') !== 0) {
              var _pkE = map[nm];
              if (_pkE) {
                var _wantOn = _wantOnPack(nm, e.enabled === true, _pkE.enabled);
                var _isOn = (e.enabled !== false) && (e.disable !== true);
                if (_wantOn && !_isOn) { setBookEnabled(e, true); c.onFixed = (c.onFixed || 0) + 1; }
                else if (!_wantOn && _isOn && _pkE.enabled === true) {
                  /* 包里说开、篇章名单说这个模式该关 ⇒ 交给篇章名单 */
                  setBookEnabled(e, false); c.onFixed = (c.onFixed || 0) + 1;
                }
              }
            }
          } catch (ePkE) {}
          if (!partial && (nm === '创作要求' || nm === '创作要求（旧）')) { c.removed++; return; }
          /* ★ 22:05：ST 重复导入会留下「条目名 (1)」「条目名 (2)」这种副本。
             它们不在条目包里、却照样参与 EJS 渲染 —— 有的是旧版被截断的内容，
             正是「EJS Error 只在个别玩家身上出现」的来源。全量同步时顺手清掉。 */
          if (!partial) {
            var _dup = /^(.+?)\s*\(\d+\)\s*$/.exec(nm);
            if (_dup && map[_dup[1]]) { c.removed++; return; }
          }
          /* ★★ 11-15 03:05：清理**我们发过、现在已经下架**的空条目。
             来由：为了验证同步链路，我在条目包里临时插过一条正文为空的「测试」，
             验证完从包里删了。但同步对「包里没有的名字」一贯不碰（防止误删玩家的
             自有条目），于是它作为孤儿永久留在每本同步过的书里 —— 列表第 2 位
             空着一格，玩家会以为是坏数据。

             保守三闸，缺一不可，宁可漏删也绝不误删玩家的东西：
               ① 名字在**本卡历史白名单**里（GONE_ENTRIES）—— 只认我们自己发过的；
               ② 正文为空（trim 后长度 0）—— 玩家真往里写了东西就不动它；
               ③ 不在当前条目包里（map 里没有）—— 包里还有的话上面早就按正文同步了。
             另外 partial 模式（书名撞了）整个跳过：那种书本来就不该被动结构。 */
          if (!partial && GONE_ENTRIES[nm]) {
            var _body = String(e.content == null ? '' : e.content).trim();
            if (!_body && !map[nm]) { c.removed++; return; }
          }
          /* ★★★ 2026-11-16：**删掉「本卡发过、现已下架」的老条目**（带正文）。
             ────────────────────────────────────────────────────────────
             这是「条目热更新了但玩家看到的还是旧内容」的真正原因。
             作者截图实证：书 138 条 / 包 93 条 / 删除 0 / 正文 93-93 一致。
             内容全同步了，但 39 条老条目还在书里 —— 32 条旧节庆每条 3000 字，
             各自带完整的节日判定，**和新的《节庆·全年》一起参与渲染**。
             ────────────────────────────────────────────────────────────
             与上面 GONE_ENTRIES 的区别（两条路各自守不同的东西）：
               · GONE_ENTRIES   ：正文必须为空 —— 防的是「临时测试条目」；
               · RETIRED_ENTRIES：不看正文，只认名字 —— 我们是真发过它们的。
             为什么这里敢不看正文：这几个名字全是本卡专属构造
             （`节庆 MM-DD 汉字` / `xxx·文字版` / `[mvu_update]…`），
             玩家不可能碰巧建出同名条目；而且**只做精确全等**，不用前缀或正则。
             仍然守住三条：全量模式才有此路；名字逐字列白名单；包里没有它。 */
          if (!partial && RETIRED_ENTRIES[nm] && !map[nm]) {
            c.removed++;
            c.retired = (c.retired || 0) + 1;
            return;
          }
          /* ★ 版本号那一条：按正文认，认到就**改名 + 改正文**，不再新增一条。
             以前只按标题名认，宿主把标题吃掉之后每次同步都会多一条无名条目
             （玩家看到的「点一下 144 → 146」就是这么来的）。 */
          if (wbIsVerEntry(e)) {
            verSeen++;
            if (verSeen > 1) { c.removed++; return; }     /* 重复的删掉 */
            if (nm !== WB_VER_ENTRY) { wbSetName(e, WB_VER_ENTRY); c.changed++; }
            if (verLabel && String(e.content == null ? '' : e.content) !== verLabel) {
              e.content = verLabel; c.changed++;
            }
            outArr.push(e);
            return;
          }
          /* ★ 2026-11-16：分隔条**按已有序号就位配对**，不按名字、也不按出现顺序。
             3 条分隔条名字一字不差（都 20 个字符），包里唯一能区分它们的是
             display_index（9 / 79 / 85）。而书里那三条的数组顺序跟包里**不一定一致**
             （宿主排过序、或者玩家手动拖过），所以：
               · 按名字查 → 三条拿到同一个值，每轮互相覆盖
               · 按出现顺序配 → 书里顺序一变就配错，仍然每轮改（我试过，还是 2 条）
             现在改成「**就近就位**」：书里这条现在第几，就配包里第几近的那条。
             已经对上的不会被判成"需要移动"，于是第二次同步 0 改动 —— 这才叫幂等。
             ⚠ 非分隔条仍然按名字取，行为完全不变。 */
          var src;
          if (isSepName(nm)) {
            var _arr = mapAll[nm] || [map[nm]];
            var _cur = Number(e.display_index);
            if (!isFinite(_cur)) _cur = Number(e.displayIndex);
            /* 打包里还没被别的分隔条占用的、序号离它最近的那一条 */
            var _best = null, _bestD = Infinity;
            for (var _k = 0; _k < _arr.length; _k++) {
              if (seqOf[nm + '#' + _k]) continue;
              var _d = isFinite(_cur) ? Math.abs(Number(_arr[_k].display_index) - _cur) : _k;
              if (_d < _bestD) { _bestD = _d; _best = _k; }
            }
            if (_best === null) _best = 0;
            seqOf[nm + '#' + _best] = 1;
            src = _arr[_best];
          } else {
            src = map[nm];
          }
          /* ★ 玩家修改保护：上次我们写入后玩家又改过（hash 对不上账本）⇒ 本条跳过官方覆盖 */
          var _skipWbOv = nm ? wbEntryProtected(wb, nm, String(e.content == null ? '' : e.content)) : false;
          if (src && typeof src.content === 'string' && src.content && e.content !== src.content) {
            if (_skipWbOv) {
              c.protected = (c.protected || 0) + 1;
              if ((c.protectedNames = c.protectedNames || []).length < 10) c.protectedNames.push(nm);
            } else {
              e.content = src.content;
              c.changed++;
            }
          }
          /* ══ ★★★ 2026-11-20：EJS 开关 + 递归闸门，**每条每次同步都写** ══════
             作者报「其他篇章的人物 / 心理阶段 / 苦主 / 苦主阶段条目全部触发了」。
             两条独立的病，都出在「字段只写一次、后来再没人写」：
               ① EJS 开关：ST 只认 `extensions.ejs === true`，否则 `<% %>` 原样当文本塞进
                  prompt —— 我们写了上千字的闸门，模型看到的是 JS 代码。setBookEjs 那个函数
                  写好了却**一次都没被调用**（和 11-18 那次「EJS 从来没打开」同一个病）。
               ② 递归闸门：玩家那本书如果是旧版本导入的，条目上根本没有
                  exclude_recursion / prevent_recursion ⇒ 只要酒馆开了「递归扫描」，
                  常驻的《人物总览》《苦主阶段·总纲》（里面列着全部人名）就会把所有
                  人物条目**递归带出来** —— 于是别的篇章的人也一起触发。
             ⚠ 这一段必须**内联**：wbSyncOnly 会被 _t_wbswitch / _t_wbver 单独切片跑，
               在里面调用外部函数会 ReferenceError（踩过）。 */
          try {
            if (!e.extensions || typeof e.extensions !== 'object') e.extensions = {};
            var _eb = String(e.content == null ? '' : e.content);
            if (_eb.indexOf('<%') >= 0) { e.extensions.ejs = true; e.ejs = true; }
            /* 我们的正文一律不许去触发别的条目（名字/地名都写在 keys 里了） */
            e.extensions.prevent_recursion = true;
            /* 非常驻条目只认关键词，不许被递归带出来；常驻的本来每轮都进，无所谓 */
            e.extensions.exclude_recursion = (e.constant === true) ? false : true;
          } catch (eRec) {}
          /* ★ 00:28 作者要求重排条目。★ 00:35 修正：**顺序字段各家不同** ——
             ST 认 order（降序）、魔改版认 displayIndex / display_index，
             上一版只写 display_index，所以一条都没动，作者看到的就是「热更新是假的」。
             setBookOrder 三个一起写；order 用 100 附近的小数，只排先后、不改注入量级。
             ★★★ 2026-11-16：**这里不再逐条写顺序，也不再逐条判定**。
             ────────────────────────────────────────────────────────────────
             病因（就是「点多少次同步都报改了 91 条」）：
               这里按**条目包的** src.display_index 判定并写入，
               而末尾那段「排完统一重编号 1..N」又把它覆盖成排序后的位置。
               两套算法写同一个量 ⇒ 下一轮拿包里的值和书里的值比，永远不等
               ⇒ 每轮都判成「需要移动」⇒ changed 恒为 91，永远收敛不了。
             正确做法：顺序**只有一个作者**，就是末尾那段重编号。
               这里一个字都不写，让条目原样进入 outArr，由重编号统一写入；
               判定同理，放在重编号那一刻按「最终值」比（见下方）。
             ⚠ 别把这段加回来 —— 同一个量两套算法 = bug（记忆里的铁律）。 */
          /* ★★★ 2026-11-17 02:30 作者强制命令：「那14条是他妈不要的，该删删」
             ────────────────────────────────────────────────────────────────
             背景（作者截图，v1.26 第 72 次）：
               书 同层版-春日狂想曲（书里 111 条）· 一致 97/97 · 改写 0 · 删除 0
             我们的 97 条全对，可书里多压着 14 条 —— 那 14 条**和我们的条目
             一起进上下文、一起参与 EJS 渲染**，所以「面板全绿、玩起来还是旧的」。
             作者：「同层版是他妈旧名字，那14条是他妈不要的，该删删」。
             ────────────────────────────────────────────────────────────────
             以前的保守设计：包里没有的名字**一律不碰**（防误删玩家自建条目），
             只删 RETIRED_ENTRIES 白名单里的。于是老名字的残留永远清不掉，
             而且每轮同步都报「删除 0」—— 看着正常。

             ⚠ 现在的取舍（作者已明确要求，且这本书是他自己的卡）：
               全量模式下，**包里没有 + 不是分隔条 + 不是无名条目 ⇒ 删**。
               无名条目另有分支处理（按正文反查补名，补不上才留），
               所以这里 !nm 的不动，避免把「标题被宿主吃掉」的条目当垃圾删掉。
               partial 模式（书名撞了，命中 < 10）仍然一个都不删 —— 那种书不是我们的。
             ⚠ 分隔条：包里 3 条同名，书里可能多出副本。同名副本由上面的
               seqOf 逻辑按序取用，超出包内数量的多余副本已在前面 __dropSepSet 收口删除。 */
          if (!partial && nm && !map[nm] && !isSepName(nm)) {
            c.removed++;
            c.extraGone = (c.extraGone || 0) + 1;
            if (!c.extraNames) c.extraNames = [];
            if (c.extraNames.length < 12) c.extraNames.push(nm);
            return;
          }
          outArr.push(e);
        });
        var have = {};
        outArr.forEach(function (e) { have[wbEntryName(e)] = 1; });
        if (verSeen) have[WB_VER_ENTRY] = 1;
        /* ★ 00:28：三个分隔条目**同名**（====================），
           用 have[名字] 去重只会补进去一条，另外两条永远进不来。
           所以它们单独按「已有几条 / 需要几条」计数，不走 have。 */
        /* ★ 00:58：分隔条改前缀匹配 —— 三条名字只差零宽空格（显示一模一样），
           用全等判断会把它们当成同一条，补进去只剩一个。
           （SEP_NAME / isSepName 已在函数顶部声明，别搬回来 —— 搬回来就是 undefined。） */
        var sepWant = 0;
        list.forEach(function (y) { if (isSepName(y.comment)) sepWant++; });
        var sepHave = outArr.filter(function (e) { return isSepName(wbEntryName(e)); }).length;
        list.forEach(function (x) {
          var nm = String(x.comment || '');
          if (!nm) return;
          if (isSepName(nm)) {
            if (sepHave >= sepWant) return;
            sepHave++;
          } else if (have[nm]) {
            return;
          }
          /* 部分命中：只补版本号那一条，别的条目一个字都不往这本书里加 */
          if (partial && nm !== WB_VER_ENTRY) return;
          var cp = JSON.parse(JSON.stringify(x));
          setBookEnabled(cp, _wantOnPack(nm, true, x.enabled));
          /* ↑ 原来写死 false（「新增条目默认关着」）。见 wantedBookPack 上方注释：
             这一行让 15 条单角色阶段条目、人物总览、节庆·全年**全部补进去就是关的**，
             而后续每一次同步又都不碰开关 ⇒ 永久关闭、永远不生效、面板还显示一致。 */
          /* ★ 标题写到宿主可能用的每个字段上；位置用数字（ccv3 的 before_char 有的宿主不认） */
          cp.comment = nm;
          /* ★ 00:35：新补进来的条目也要带顺序，否则它永远排在列表最底下 */
          setBookOrder(cp, x.display_index);
          /* ★ 00:21：**无条件**写 name / title。
             以前写的是 `if ('name' in cp)` —— 而 wbpatch.json 的条目里根本没有 name 字段，
             这个分支永远不成立。宿主（酒馆助手的 createWorldbookEntries）认 name 不认
             comment，于是新增条目全变成「没名字的关闭条目」（cp.enabled 本来就是 false）。 */
          cp.name = nm;
          cp.title = nm;
          if (typeof cp.position === 'string') cp.position = 0;
          /* ★★★ 2026-11-16：**绝不覆盖条目包里的 keys**。
             ────────────────────────────────────────────────────────────
             这行原来是 `cp.key = [nm]; cp.keys = [nm];` —— 拿条目名当唯一触发词。
             于是每补一条新条目，就把包里写好的多词触发词**洗成一个名字**：
               吉川美穗 → ["吉川美穗","美穗","美穗阿姨","吉川","吉川阿姨",…]
                        → ["吉川美穗"]
             而正文里模型只会写「美穗」，永远不会写「吉川美穗」这四个字连在一起，
             这条绿灯就**永远不亮**。作者看到的就是「所有人物条目同步完了也不出场」，
             而且不报错、不提示 —— 一键到底的静默失效。
             ────────────────────────────────────────────────────────────
             只有包里**真的没有**触发词时，才拿条目名兜一个底（空 keys 的条目
             在 ST 里等于永不命中，比兜底更糟）。 */
          try {
            if (!Array.isArray(cp.key) || !cp.key.length) cp.key = (cp.keys || []).slice();
            if (!Array.isArray(cp.keys) || !cp.keys.length) cp.keys = [nm];
            if (!cp.key.length) cp.key = [nm];
          } catch (eK) {}
          outArr.push(cp);
          have[nm] = 1;
          c.added++;
        });
        cnt = c;
        /* ★ 00:47：**必须按条目包的位置重排数组**。
           以前这里直接 return outArr —— 顺序是「书里原有的顺序 + 新条目接在末尾」，
           字段（displayIndex / order）虽然都写对了，可只要宿主是按**数组顺序**显示
           （酒馆助手的列表、多数魔改版都是），玩家看到的就是「一条都没动」。
           排序之后数组顺序 = displayIndex 顺序 = order 降序，宿主认哪个都对。 */
        try {
          /* ★ 00:58：排序键**不能直接读条目自己的 displayIndex**。
             书里往往比条目包多出一批历史条目（现场：186 条 vs 131 条），
             它们带着自己的老位置（0/1/2…），直接按 displayIndex 排就会**插进我们的分组**，
             看起来就是"顺序混乱"。
             正确做法：以**条目包的位置**为准 —— 包里有的用 src.display_index，
             包里没有的一律沉底（10000 + 原数组位置，保持它们彼此的前后关系）。 */
          var _sepSlots = [];
          for (var _si = 0; _si < list.length; _si++) {
            if (isSepName(list[_si].comment)) {
              var _sv = Number(list[_si].display_index);
              _sepSlots.push(isFinite(_sv) ? _sv : (_si + 1));   /* ★ 无 display_index → 用包内位置 */
            }
          }
          outArr.forEach(function (e, i) {
            var nmE = '';
            try { nmE = wbEntryName(e); } catch (eN0) { nmE = ''; }
            /* 分隔条三条同名，map 里只记得住一条 ⇒ 先占位，下面按现有 displayIndex 分配 */
            if (isSepName(nmE)) { e.__thOrd = -1; return; }
            var srcE = nmE ? map[nmE] : null;
            e.__thOrd = (srcE && srcE.display_index != null)
              ? Number(srcE.display_index)
              : (10000 + i);
          });
          /* ★ 01:03：三根分隔条同名，靠名字分不出谁是谁。
             用**书里现有的 displayIndex**（上次排好的意图）从小到大，依次对上包里的三个位置：
             最小的那条 = 第一个分隔条，中间 = 第二个，最大 = 第三个。 */
          try {
            var _sepRows = outArr.filter(function (e) { return e.__thOrd === -1; });
            if (_sepRows.length) {
              _sepRows.sort(function (a, b) {
                return (Number(a.displayIndex) || 0) - (Number(b.displayIndex) || 0);
              });
              _sepRows.forEach(function (e, k) {
                var slot = _sepSlots.length ? _sepSlots[Math.min(k, _sepSlots.length - 1)] : (10000 + k);
                e.__thOrd = isFinite(slot) ? slot : (10000 + k);
              });
            }
          } catch (eSep) {}
          outArr.sort(function (a, b) { return a.__thOrd - b.__thOrd; });
          /* 排完统一重编号 1..N：连续、无冲突，外来条目自然全部落在最后。
             ★★★ 2026-11-16：**这里是顺序的唯一作者**，所以判定也只能在这里做。
             只有「最终值真的和书里现值不同」才算一次改动 —— 以前无条件写，
             于是 changed 里混进一堆「写了但值没变」的假改动，看着永远收敛不了。 */
          outArr.forEach(function (e, i) {
            try { delete e.__thOrd; } catch (eDel) {}
            var _finalIdx = i + 1;
            var _finalOrd = Math.round((10 + _finalIdx * 0.001) * 1000) / 1000;
            var _curD = Number(e.displayIndex != null ? e.displayIndex
              : (e.extensions && e.extensions.display_index != null ? e.extensions.display_index : NaN));
            var _moved = (Number(e.order) !== _finalOrd) ||
                         (Number(e.display_index) !== _finalIdx) ||
                         !isFinite(_curD) || _curD !== _finalIdx;
            if (_moved) {
              setBookOrder(e, _finalIdx);
              c.changed++;
              c.orderChanged = (c.orderChanged || 0) + 1;
            }
          });
        } catch (eSort) {}
        return outArr;
      }

      var w = await wbWrite(wb, mutate);
      out.how = w.how;
      out.tried = w.tried || [];
      out.changed = cnt.changed;
      out.added = cnt.added;
      out.removed = cnt.removed;
      out.protected = cnt.protected || 0;
      out.protectedNames = cnt.protectedNames || [];
      /* ★ 2026-11-17：删掉了哪些「不属于本包」的，把名字带出去给面板看。
         作者要求「该删删」，那就必须说清楚删了什么 —— 静默删除比不删更可怕。 */
      out.extraGone = cnt.extraGone || 0;
      out.extraGoneNames = cnt.extraNames || [];
      if (!w.how) {
        out.msg = '一条写入通道都没走通：' + (out.tried.join(' / ') || '宿主没有任何可写回的世界书接口');
        return out;
      }

      /* ★ 11-15 02:00：写完立刻把已打开的编辑器重画 —— 否则玩家看着旧画面，
         还会在编辑器里一点就把旧数据整盘盖回来（详见 wbRefreshEditor 注释）。 */
      try {
        var _rf = wbRefreshEditor(wb);
        out.editor = _rf;
      } catch (eRf0) {}

      /* 回读 —— 「到底写进去没有」的唯一答案。
         ★ 00:54：**必须优先走原生 loadWorldInfo**。
         写入用的是原生（order / displayIndex 都在），回读却用 getLorebookEntries
         这层包装 —— 它不返回这两个字段，于是刚写进去就被判成「读不到」，
         诊断永远红着，跟没写一样。读不到原生才退回包装层。 */
      /* ★ 11-15 02:52：回读加一层「条目数不够就重试」。
         真实 ST 里 saveWorldInfo 第一件事就是 worldInfoCache.set，
         紧接着 loadWorldInfo 一定读到新数据 —— 本来不需要重试。
         但魔改宿主会出现「save 走了、load 还是旧的」：表现为 added=1 却
         diff=[新条目名]，整次同步被判成失败，玩家看到红字以为坏了。
         这里最多再等 3 次（150/400/900ms），只有「条数明显少于预期」才重试，
         已经读到足量就立刻返回，绝不给正常路径加延迟。
         partial 模式（书名撞了，只补版本号）不参与这个判据：条数本来就该少。 */
      var after = null;
      var _loadAfter = pickWbFn('loadWorldInfo');
      var _expect = partial ? 0 : list.length;
      function _afterShort(arr) {
        if (!_expect) return false;
        if (!arr) return true;
        return arr.length < _expect;
      }
      async function _readOnce() {
        if (!_loadAfter) return null;
        try {
          var d = await _loadAfter(wb);
          if (d && d.entries && typeof d.entries === 'object') {
            return Object.keys(d.entries).map(function (k) { return d.entries[k]; })
              .filter(function (e) { return e && typeof e === 'object'; });
          }
        } catch (eR) {}
        return null;
      }
      if (_loadAfter) {
        after = await _readOnce();
        out.readVia = 'loadWorldInfo';
        var _waits = [150, 400, 900];
        for (var _wi = 0; _afterShort(after) && _wi < _waits.length; _wi++) {
          await new Promise(function (res) { setTimeout(res, _waits[_wi]); });
          after = await _readOnce();
        }
      }
      if (!after) {
        after = await getE(wb);
        out.readVia = 'getLorebookEntries';
      }
      out.count = (after || []).length;
      var now = {};
      (after || []).forEach(function (e) { now[wbEntryName(e)] = String(e.content == null ? '' : e.content); });
      /* ★ 玩家修改保护：写入成功后刷新账本。
         本轮被保护（玩家改过）的条目**不**入账 —— 账本保持旧值，
         下次同步才能继续认出「这条是玩家改的」。 */
      try {
        var _lg = wbLedgerLoad();
        if (!_lg || _lg.wb !== wb || !_lg.hash) _lg = { wb: wb, hash: {} };
        var _prot = {};
        (cnt.protectedNames || []).forEach(function (n) { _prot[n] = 1; });
        list.forEach(function (x) {
          var nm3 = String(x.comment || '');
          if (!nm3 || _prot[nm3]) return;
          var ct3 = now[nm3];
          if (ct3 == null) return;
          _lg.hash[nm3] = wbHash(ct3);
        });
        wbLedgerSave(_lg);
      } catch (eLg0) {}
      out.ver = String(now[WB_VER_ENTRY] || '').trim();
      /* 标题被吃掉的兜底：按正文形状再找一次 */
      if (!out.ver) {
        (after || []).some(function (e) {
          if (!wbIsVerEntry(e)) return false;
          out.ver = String(e.content == null ? '' : e.content).trim();
          return true;
        });
      }
      /* ★ 00:35：顺序到底写进去没有 —— 条目热更新最容易「假成功」的地方。
         回读里数一下「后一条 order 比前一条还大」的次数，正常应为 0。 */
      try {
        var _ords = [], _disps = [];
        (after || []).forEach(function (e) {
          var o = Number(e && e.order);
          if (isFinite(o)) _ords.push(o);
          var dRaw = (e && e.displayIndex != null) ? e.displayIndex
                   : (e && e.extensions ? e.extensions.display_index : null);
          var d = Number(dRaw);
          if (dRaw != null && isFinite(d)) _disps.push(d);
        });
        /* ★ 00:50：数组顺序是 **uid 顺序**（ST 内部 data.entries 是对象），
           不能直接拿数组前后比 order —— 那会把正确的结果报成「26 处逆序」。
           先按 displayIndex 排一遍，再看 order 是不是跟着同步递减，这才是有意义的指标。 */
        var _pairs = [];
        (after || []).forEach(function (e) {
          var dRaw = (e && e.displayIndex != null) ? e.displayIndex
                   : (e && e.extensions ? e.extensions.display_index : null);
          var d = Number(dRaw);
          var o = Number(e && e.order);
          if (dRaw != null && isFinite(d) && isFinite(o)) _pairs.push({ d: d, o: o });
        });
        _pairs.sort(function (a, b) { return a.d - b.d; });
        /* ★ 11-15 02:30：判逆序的**方向必须和 setBookOrder 一致**。
           v167 把 order 改成「与 displayIndex 同向」之后，这里没跟着改 ——
           仍是老代码的 `后一条 order 比前一条大 ⇒ 逆序`。
           于是在 131 条全对的书上报「order 还有 130 处逆序」，
           把自己做对的事说成错的（作者看到这句当然以为又没生效）。
           现在：同向递增视为正确；只有「后一条比前一条小」才算逆序。 */
        var _inv = 0;
        for (var _oi = 1; _oi < _pairs.length; _oi++) if (_pairs[_oi].o < _pairs[_oi - 1].o) _inv++;
        out.orderInv = _inv;
        out.orderHead = _pairs.slice(0, 3).map(function (x) { return x.o; }).join('/');
        out.orderTail = _pairs.slice(-3).map(function (x) { return x.o; }).join('/');
        out.orderSpread = (_pairs.length > 1)
          ? Math.round((_pairs[_pairs.length - 1].o - _pairs[0].o) * 1000) / 1000 : 0;
        /* displayIndex 两套字段都读一遍：能读到的有几个、首尾差多少 */
        var _ds = _pairs.map(function (x) { return x.d; });
        out.dispCount = _disps.length;
        out.dispHead = _ds.slice(0, 3).join('/');
        out.dispSpread = (_ds.length > 1) ? (_ds[_ds.length - 1] - _ds[0]) : 0;
      } catch (eOrd) {}
      var same = 0;
      list.forEach(function (x) {
        var nm = String(x.comment || '');
        if (!nm) return;
        if (now[nm] === String(x.content == null ? '' : x.content)) same++;
        else if (out.diff.length < 10) out.diff.push(nm);
      });
      out.same = same;
      /* ══ ★★★ 2026-11-16：回读**必须比对开关**，不能只比正文 ══════════════
         以前这里只比 content —— 正文全对就判「一致」，哪怕 100 条条目一条都没开。
         于是三个开关 bug（补进去写死 false / 老条目关了就不碰 / 包里 enabled
         被丢掉）全部藏在「一致 104/104 ✅」后面，作者只能看到「同步成功」
         却什么效果都没有，一轮一轮排查了三次。
         ────────────────────────────────────────────────────────────────────
         现在把「该开却没开」的条目单独数出来报给玩家。判据与写入侧同源
         （wantedBookPack），绝不在两处各写一套。 */
      try {
        var _offList = [];
        (after || []).forEach(function (e) {
          var nm2 = wbEntryName(e);
          if (!nm2) return;
          var pk = map[nm2];
          if (!pk) return;
          var want = _wantOnPack(nm2, e.enabled === true, pk.enabled);
          var isOn = (e.enabled !== false) && (e.disable !== true);
          if (want && !isOn) _offList.push(nm2);
        });
        out.offWanted = _offList.length;
        out.offNames = _offList.slice(0, 8);
        /* ★★★ 2026-11-17 02:35：**这里不许再写 out.ok**。
           ────────────────────────────────────────────────────────────────
           原来这里 `out.ok = false`，然后 60 行之后又有一句无条件的
             `out.ok = out.diff.length === 0;`
           把刚才那次置 false **原样覆盖回 true**。
           于是「有 N 条本该开着却是关的」这条判据**一次都没生效过** ——
           它算出来了、写进 offWanted 了、面板一个字都没显示，
           因为 out.ok 被后面那句洗回 true，走进了「✓ 正常」分支。
           表现就是作者这轮的「我们的也没改成啊」：
           正文 97/97 全对（真的对），但 93 条该开的条目在书里是关的
           ⇒ 一个字都不进上下文 ⇒ 玩起来跟没同步一样。
           ⚠ 同一个量两套算法 = bug。out.ok 只能有一个作者，在下面统一算。
           这里只负责把事实（offWanted / offNames）摆出来。 */
      } catch (eOffC) {}
      /* ★ 00:42：书里还剩几条无名条目 —— 它们是「同步看着跑了却没变化」的元凶，
         数量必须报出来，否则永远不知道还剩几个在失联。 */
      try {
        var _nameless = [];
        (after || []).forEach(function (e) { if (!wbEntryName(e)) _nameless.push(String(e.uid == null ? '?' : e.uid)); });
        out.nameless = _nameless.length;
        out.namelessIds = _nameless.slice(0, 8).join(',');
      } catch (eNl) { out.nameless = 0; }
      try {
        var _sc2 = wbScanEjs(after);
        out.ejsBad = _sc2.count;
        out.ejsNames = _sc2.list;
      } catch (eSc2) { out.ejsBad = 0; out.ejsNames = []; }
      /* ★★ 2026-11-17 02:30 语义已变：**多出来的条目现在会被删掉**，不是只报。
         ────────────────────────────────────────────────────────────────
         作者原话：「同层版是他妈旧名字，那14条是他妈不要的，该删删你妈的」。
         所以 mutate 里已经加了「包里没有 + 不是分隔条 + 不是无名 ⇒ 删」那道闸，
         删掉的条数/名字从 cnt.extraGone / cnt.extraNames 带出来。

         这里回读后**仍然**不属于本包的，只剩三种，性质完全不同：
           · partial 模式：书名撞了，一个都不许删 ⇒ 只报不删（必须是警告）
           · 删了但宿主没真删（写入被吞）⇒ 下一轮还在，必须报，否则永远查不出来
           · 同步之后玩家/别的脚本又建了一条 ⇒ 下一轮自会删掉
         所以这段保留为「**残留**外来条目」的体检，不删它 —— 只把事实摆出来。
         ⚠ 排除：分隔条（包 3 条同名，书里副本由 sepWant/sepHave 收口）、
           无名条目（另有 nameless 统计）。 */
      try {
        var _extra = [];
        (after || []).forEach(function (e) {
          var n3 = wbEntryName(e);
          if (!n3) return;                     /* 无名条目另有统计 */
          if (map[n3]) return;                 /* 包里有 = 我们的 */
          if (isSepName(n3)) return;           /* 分隔条同名，不算外来 */
          _extra.push(n3);
        });
        out.extra = _extra.length;
        out.extraNames = _extra.slice(0, 10);
      } catch (eEx) { out.extra = 0; out.extraNames = []; }
      /* ★★★ 2026-11-17 02:35：**out.ok 的唯一作者就在这一行**。
         ────────────────────────────────────────────────────────────────
         以前这里写 `out.ok = out.diff.length === 0;`（只看正文），
         而 60 行前「本该开着却是关的」那次 `out.ok = false` 已经被覆盖过一次。
         现在三件事一起判，缺一不可：
           · 正文全对          diff === 0
           · 没有该开却关着的  offWanted === 0     ← 这一条以前完全没生效
           · 没有 partial     书名撞了不算成功
         「我们的也没改成」的真身就是第二条：正文对、开关全关 ⇒ 一个字都不进上下文。 */
      out.ok = (out.diff.length === 0) && (!out.offWanted) && !partial;
      if (out.diff.length) {
        out.msg = '写入后回读仍有 ' + out.diff.length + ' 条不一致';
      } else if (out.offWanted) {
        out.msg = '正文都对，但有 ' + out.offWanted + ' 条本该开着却是关的'
          + '（关着的条目一个字都不进上下文，等于没同步）：'
          + (out.offNames || []).join('、') + (out.offWanted > (out.offNames || []).length ? ' 等' : '');
      } else if (partial) {
        out.msg = '这本书只命中 ' + pick.hit + ' 条我们的条目（书名撞了），' +
          '已只补匹配到的 + 版本号，没有批量补 ' + list.length + ' 条';
      } else {
        out.msg = '正文已同步 ' + out.same + ' 条';
      }
      /* ★ 00:35：顺序单独报一句 —— 内容对了不代表顺序也进去了。
         宿主不认 order 时，读回来会是一串相同的值（spread=0），必须说清是「没写进去」，
         不能含糊成「已同步」。 */
      try {
        if (out.nameless) {
          out.msg += '；书里还有 ' + out.nameless + ' 条无名条目（uid ' + out.namelessIds + '）';
        }
        /* ★★ 2026-11-17 02:30：分两句说 ——
             ① 「已删掉 N 条」：这是我们做的事（c.extraGone），必须报；
             ② 「仍残留 N 条」：这是删不掉/不该删的，必须报成警告。 */
        if (out.extraGone) {
          out.msg += '；已删掉 ' + out.extraGone + ' 条不属于本包的条目（'
            + out.extraGoneNames.join('、') + (out.extraGone > out.extraGoneNames.length ? ' 等' : '') + '）';
        }
        if (out.extra) {
          out.msg += '；⚠ 书里仍残留 ' + out.extra + ' 条不属于本包（会和我们的条目一起进上下文）：'
            + out.extraNames.join('、') + (out.extra > out.extraNames.length ? ' 等' : '');
        }
        if (out.msg && out.msg.indexOf('顺序') < 0) {
          var _bits = [];
          if (!out.dispCount && !out.orderSpread) {
            /* 两个字段一条都读不到 —— 先说清是「哪个通道读的」，
               以前这句话一律甩锅给「宿主没回这个字段」，把自己读错源也算了进去 */
            _bits.push('回读走的是 ' + (out.readVia || '?')
              + '，它不回 order / displayIndex —— 换原生再读一次才能判断');
          } else {
            if (!out.orderSpread) _bits.push('order 全是同一个值（默认排序没生效）');
            else if (out.orderInv > 0) _bits.push('order 还有 ' + out.orderInv + ' 处逆序');
            else _bits.push('order 已排好');
            if (!out.dispCount) _bits.push('读不到 displayIndex');
            else if (!out.dispSpread) _bits.push('displayIndex 全是同一个值');
            else _bits.push('displayIndex 已排好');
          }
          out.msg += '；' + _bits.join('、');
        }
      } catch (eOm) {}
      return out;
    } catch (e) {
      out.msg = '同步失败：' + ((e && e.message) || e);
      return out;
    }
  }

  /* 两个脚本可能不在同一个 window：两处都挂，取的时候也两处查 */
  /* ══ ★ 22:00：自动同步（玩家不用再手点）══════════════════════════
     以前只有版本页那颗按钮能同步，玩家不点就永远是旧条目。
     现在进游戏后自动跑一次：只动**我们自己的书**（命中 < 10 一律拒绝），
     只改写内容不一致的条目、补缺的条目（默认关着）、删「创作要求」。
     节流：同一会话只试一次；成功过就 30 分钟内不再试。
     想关掉：localStorage 里设 SPR_WB_AUTOSYNC = 'off'。 */
  /* ══ ★★ 2026-11-16 09:1x：**「书里到底和线上一样不一样」** ══════════════
     为什么要单独有这一件事（而不是直接跑 wbSyncOnly）：
     自动同步以前用**时间**做节流 —— 「30 分钟内同步过就跳过」。
     这个判据的毛病是它数的是「上次什么时候跑的」，不是「现在还需不需要跑」：
       · 你改了条目包、推上去、刷新网页 —— 只要 30 分钟没到，它照样跳过；
       · `__CQ_OSS_LABEL__` 读不到时 `_labSame` 恒为 true，这个洞永远堵不上
         （切换器和 loader 可能不在同一个 window，这个变量经常读不到）。
     表现就是作者说的「自动同步又不行了」：它自己以为同步过了。
     ────────────────────────────────────────────────────────────────────────
     现在改成**只按事实判**：先把书读出来，逐条和线上包比正文；
     完全一致（条数也够、已下架的也清了）才跳过。不一致就一定写。
     读书是内存操作（getLorebookEntries），比写盘便宜得多，不用担心成本。 */
  async function wbCompareBook(list) {
    var out = { wb: '', count: 0, same: false, diff: 0, missing: 0,
                retiredLeft: 0, nameless: 0, err: '', protected: 0 };
    try {
      var getE = pickWbFn('getLorebookEntries');
      if (!getE) { out.err = '取不到 getLorebookEntries'; return out; }
      var names = await wbBookNames();
      if (!names.length) { out.err = '读不到世界书名'; return out; }
      var map = {};
      (list || []).forEach(function (x) {
        var c = String(x && x.comment || '');
        if (c) map[c] = x;
      });
      var pick = await wbPickTarget(getE, names, map);
      if (!pick || !pick.name) { out.err = '没有一本书命中我们的条目（' + (pick ? pick.info.join(' | ') : '') + '）'; return out; }
      out.wb = pick.name;
      var es = await getE(pick.name) || [];
      out.count = es.length;
      var have = {};
      es.forEach(function (e) {
        var n = wbEntryName(e);
        if (!n) { out.nameless++; return; }
        have[n] = String(e.content == null ? '' : e.content);
      });
      var _lg0 = wbLedgerLoad();
      var _lgOk = !!(_lg0 && _lg0.wb === (pick.name || ''));
      (list || []).forEach(function (x) {
        var n = String(x && x.comment || '');
        if (!n) return;
        var want = String(x.content == null ? '' : x.content);
        if (!Object.prototype.hasOwnProperty.call(have, n)) { out.missing++; return; }
        /* 版本号是系统条目：永远按包更新，不参与玩家保护 */
        if (n === WB_VER_ENTRY) { if (have[n] !== want) out.diff++; return; }
        /* ★ 玩家修改保护：书里这条和账本对不上 = 玩家改过 ⇒ 不算差异，也不许写 */
        if (_lgOk && _lg0.hash[n] != null && wbHash(have[n]) !== _lg0.hash[n]) {
          out.protected = (out.protected || 0) + 1;
          return;
        }
        if (have[n] !== want) out.diff++;
      });
      /* 已下架的老条目还在不在 —— 光「正文一致」不代表书是对的，
         32 条旧节庆照样会参与 EJS 渲染。这是作者踩过两次的坑。 */
      Object.keys(have).forEach(function (n) {
        if (RETIRED_ENTRIES[n] && !map[n]) out.retiredLeft++;
      });
      out.same = (out.diff === 0 && out.missing === 0 && out.retiredLeft === 0 &&
                  out.count === (list || []).length);
      return out;
    } catch (e) {
      out.err = String((e && e.message) || e);
      return out;
    }
  }

  async function wbAutoSync(force) {
    var out = { ok: false, skipped: true, msg: '', added: 0, changed: 0, removed: 0,
                same: 0, total: 0, wb: '', diag: [] };
    try {
      try { if (HW.localStorage.getItem('SPR_WB_AUTOSYNC') === 'off') { out.msg = '自动同步已关闭（SPR_WB_AUTOSYNC=off）'; return out; } } catch (eP) {}
      /* 失败次数上限只拦「一直失败」的情况。成功了会在下面清零，
         所以它不会变成「试几次就永久放弃」。 */
      if (!force) {
        var _tries0 = 0;
        try { _tries0 = Number(HW.__thWbAutoTries) || 0; } catch (eT0) {}
        if (_tries0 >= 12) {
          out.msg = '自动同步连续失败 ' + _tries0 + ' 次，本会话不再重试（刷新网页会重置）';
          return out;
        }
      }
      var list = await fetchWbPatch();
      if (!list || !list.length) {
        out.msg = '条目包为空（卡内世界书未就绪）';
        out.diag.push('条目包 0 条');
        if (!force) { try { HW.__thWbAutoTries = (Number(HW.__thWbAutoTries) || 0) + 1; } catch (eT1) {} }
        try { HW.__thWbAutoResult = out; } catch (eR0) {}
        return out;
      }
      out.total = list.length;
      out.diag.push('条目包 ' + list.length + ' 条');

      /* ★ 核心：**先比再写**。一致就真跳过，不一致一定写。
         不再有任何「时间节流」——那个判据数的是上次几点跑的，
         而我们要的是「现在还需不需要跑」。 */
      var pre = await wbCompareBook(list);
      if (pre.err) out.diag.push('预检：' + pre.err);
      else {
        out.wb = pre.wb;
        out.diag.push('书《' + pre.wb + '》' + pre.count + ' 条'
          + '｜差 ' + pre.diff + ' 缺 ' + pre.missing + ' 待清 ' + pre.retiredLeft
          + (pre.nameless ? ' 无名 ' + pre.nameless : ''));
        if (pre.protected) {
          out.protected = pre.protected;
          out.diag.push('🛡 玩家修改保护 ' + pre.protected + ' 条（不会被官方覆盖）');
        }
      }
      if (pre.same) {
        out.ok = true;
        out.skipped = true;
        out.same = list.length;
        out.msg = '书与卡完全一致（' + pre.count + ' 条），没有需要改的';
        try { HW.__thWbAutoTries = 0; } catch (eT2) {}
        try { out.at = Date.now(); HW.__thWbAutoResult = out; } catch (eR1) {}
        return out;
      }

      var r = await wbSyncOnly({ list: list });
      if (r) {
        out.ok = !!r.ok;
        out.msg = String(r.msg || '');
        out.added = Number(r.added || 0);
        out.changed = Number(r.changed || 0);
        out.removed = Number(r.removed || 0);
        out.same = Number(r.same || 0);
        out.total = Number(r.total || 0);
        out.wb = String(r.wb || out.wb || '');
        out.skipped = false;
        out.how = String(r.how || '');
        out.count = Number(r.count || 0);
        out.protected = Number(r.protected || 0) || out.protected || 0;
        if (r.books) out.diag.push('候选书：' + r.books);
        if (r.tried && r.tried.length) out.diag.push('写入通道失败：' + r.tried.join(' / '));
      }
      if (out.ok) {
        try { HW.__thWbAutoTries = 0; } catch (eT3) {}
        try { HW.localStorage.setItem('SPR_WB_AUTOSYNC_AT', String(Date.now())); } catch (eS) {}
      } else if (!force) {
        try { HW.__thWbAutoTries = (Number(HW.__thWbAutoTries) || 0) + 1; } catch (eT4) {}
      }
      out.at = Date.now();
      try { HW.__thWbAutoResult = out; } catch (eR2) {}
      return out;
    } catch (e) {
      out.msg = '自动同步失败：' + ((e && e.message) || e);
      try { HW.__thWbAutoResult = out; } catch (eR3) {}
      return out;
    }
  }

  /* ★ 版本页「恢复官方」按钮用的 API：清账本 + 强制重同步（玩家的改动让位官方） */
  try {
    var _protApi = {
      last: function () {
        try { var r = HW.__thWbAutoResult || {}; return { count: Number(r.protected || 0), names: r.protectedNames || [] }; }
        catch (e0) { return { count: 0, names: [] }; }
      },
      restoreOfficial: function () {
        try { HW.localStorage.removeItem(WB_LEDGER_KEY); } catch (e0) {}
        try { HW.__sprWbProtectCleared = Date.now(); } catch (e1) {}
        return wbAutoSync(true);
      }
    };
    HW.__sprWbProtectApi = _protApi;
    try { if (window.top && window.top !== window) window.top.__sprWbProtectApi = _protApi; } catch (ePA) {}
  } catch (ePA2) {}

  /* ══ ★ 11-15 02:10：**打开世界书面板的那一刻，先同步、再给玩家看** ══
     作者实测出来的现象：先开面板再同步 = 看起来没用；先同步再开 = 有效。
     这说明「谁先谁后」决定成败 —— 而玩家不可能每次都记得先后。

     所以不指望玩家按顺序，改由我们接管顺序：
       玩家点开世界书抽屉 → 我们**拦一下**，先把同步跑完 →
       再让 ST 用自己的流程把面板画出来（那时缓存已是新数据）。

     实现要点（每一条都是踩过的坑）：
       · 拦「打开动作」不能拦 change：面板没开时 select 已经存在，change 跟开合无关。
         真正可靠的开合信号是 #WIDrawerIcon 的 class（ST 在 openDrawer/closeDrawer 里
         加/去 'openIcon'）。用 MutationObserver 盯它最稳。
       · 必须在**面板渲染之前**动手。ST 的 openWorldEditor 是异步的，
         我们没法真正「阻塞」它 —— 于是采用「先画、再纠正」：
         放行它画完之后立刻同步 + 重载编辑器。玩家最多看到 0.5 秒旧画面，
         然后自己变成新的，全程不用他点任何东西。
       · 节流照抄自动同步那套：30 分钟且标签没变就跳过，别每次点开都写盘。
       · 只认「我们的书」：命中 < 10 一律不动（wbSyncOnly 内部已有这道闸）。
       · localStorage SPR_WB_AUTOSYNC = 'off' 仍然一键关掉全部。 */
  function wbInstallOpenHook() {
    try {
      if (HW.__thWbOpenHook__) return true;
      var icon = HD.getElementById('WIDrawerIcon');
      if (!icon) return false;                 /* 宿主 UI 还没建好，等下一轮 */
      HW.__thWbOpenHook__ = true;

      var lastFire = 0;
      function onOpen() {
        var now = Date.now();
        if (now - lastFire < 1500) return;      /* 一次开合可能连发多次 mutation */
        lastFire = now;
        /* 面板画完再动：给 ST 的异步渲染留出时间，避免和它抢同一个 select */
        setTimeout(function () {
          Promise.resolve().then(function () { return wbAutoSync(); }).then(function (r) {
            try { HW.__thWbAutoResult = r; } catch (eR) {}
            /* ★ 11-15 02:22：这里**不再**自己调 wbRefreshEditor。
               wbSyncOnly 写完已经刷过一次；外面再刷一次的结果是
               面板被重画两遍（肉眼看到闪一下），而且第二次用的是刚被第一次
               重画过的 select 状态，纯属多余。留着回调口给上层挂用。 */
            if (r && r.ok) {
              try { if (typeof HW.__thWbOpenHookCb === 'function') HW.__thWbOpenHookCb(r); } catch (eCb) {}
            }
          }, function () {});
        }, 260);
      }

      /* 盯 class 变化：closedIcon → openIcon 就是「刚打开」 */
      try {
        var prevOpen = String(icon.className || '').indexOf('openIcon') >= 0;
        var mo = new MutationObserver(function () {
          try {
            var isOpen = String(icon.className || '').indexOf('openIcon') >= 0;
            if (isOpen && !prevOpen) onOpen();
            prevOpen = isOpen;
          } catch (eM) {}
        });
        mo.observe(icon, { attributes: true, attributeFilter: ['class'] });
      } catch (eMO) {
        /* 没有 MutationObserver 就退回点击监听（手机老 WebView） */
        try { icon.addEventListener('click', function () { onOpen(); }, true); } catch (eClk) {}
      }

      /* ★ 11-15 02:35：补一条「面板本来就开着」的路径。
         上面盯的是「从关到开」的**跳变**。可下面两种情况下没有跳变：
           ① 玩家把世界书钉住了（pinnedOpen），开游戏就一直是开着的；
           ② 手机切后台再回来，DOM 没重建，class 早就是 openIcon。
         热更推了新版本、或者世界书需要修，这两种玩家永远等不到同步。
         所以再挂一个「页面重新可见」的触发点：只判面板此刻是否开着。 */
      try {
        HD.addEventListener('visibilitychange', function () {
          try {
            if (HD.visibilityState !== 'visible') return;
            var isOpen = String(icon.className || '').indexOf('openIcon') >= 0;
            if (!isOpen) return;
            var now2 = Date.now();
            if (now2 - lastFire < 5000) return;
            lastFire = now2;
            setTimeout(function () {
              Promise.resolve().then(function () { return wbAutoSync(); }).then(function (r) {
                try { HW.__thWbAutoResult = r; } catch (eR) {}
              }, function () {});
            }, 400);
          } catch (eV) {}
        });
      } catch (eVis) {}

      return true;
    } catch (e) {
      return false;
    }
  }

  /* 宿主 UI 是异步建的：每 400ms 试一次，最多 20 次，装上就停 */
  (function wbHookRetry() {
    var n = 0;
    (function tick() {
      n++;
      var ok = false;
      try { ok = wbInstallOpenHook(); } catch (e) { ok = false; }
      if (ok || n >= 20) return;
      setTimeout(tick, 400);
    })();
  })();

  /* 两个脚本可能不在同一个 window：两处都挂，取的时候也两处查 */
  try { window.__TH_WB_SYNC__ = wbSyncOnly; } catch (eW1) {}
  try { window.__TH_WB_AUTOSYNC__ = wbAutoSync; } catch (eWA) {}
  try { HW.__TH_WB_AUTOSYNC__ = wbAutoSync; } catch (eWA2) {}
  try { window.__TH_WB_CMP__ = wbCompareBook; } catch (eWC1) {}
  try { HW.__TH_WB_CMP__ = wbCompareBook; } catch (eWC2) {}
  try { window.__TH_WB_READ__ = wbReadOnly; } catch (eW2) {}
  /* ★ 2026-11-17：把条目包取用口挂出去 —— 测试要数「同一个 seq 到底下载几次」。
     不挂出来就只能靠读源码猜，而「每 45 秒重下 540KB」这种事读源码是看不出来的。 */
  try { window.__TH_WB_GETPATCH__ = fetchWbPatch; } catch (eWP1) {}
  try { HW.__TH_WB_GETPATCH__ = fetchWbPatch; } catch (eWP2) {}
  try { HW.__TH_WB_SYNC__ = wbSyncOnly; } catch (eW3) {}
  try { HW.__TH_WB_READ__ = wbReadOnly; } catch (eW4) {}

  /* ══ 世界书纯本地模式：取消后台轮询心跳（零网络请求、零流量占用） ══ */

  function boot() {
    try {
      if (!HD || typeof HD.getElementById !== 'function') return;
      if (HW && HW[LOCK]) return;
      if (HW) HW[LOCK] = true;
    } catch (e) { return; }
    try { build(); } catch (e) {
      try { if (HW) HW[LOCK] = false; } catch (e2) {}
    }
  }
  try {
    if (HD && HD.readyState === 'loading') {
      HD.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
    
  /* ══ ★ 2026-11-22：新版本提示条（热更即可更新本条，不用重导卡）══════════
     数据来源：loader 的 checkNewTag 每 60 秒探一次新 tag，把结果写在
       __SPR_LIVE_SEQ__（线上 seq）/ __SPR_LIVE_LABEL__（线上标签）。
     这里**只读全局、画条**，零网络请求（限流压力为零）：
       线上 seq > 运行中 seq ⇒ 右上角弹「📦 新版本 vX.Y · 第 N 次更新 · 点此刷新」
       位置对齐「全屏按钮」（右上角）；点击刷新页面，loader 开机探到新 tag 自动换。
     没有更新时不画（不碍事）。 */
  var NVB_ID = 'spr-nvbar-switcher';
  function thNvBarTick() {
    try {
      var d = null;
      try { if (HD && HD.body) d = HD; } catch (e0) {}
      if (!d) { try { d = document; } catch (e1) {} }
      if (!d || !d.body) return;
      var live = 0, run = 0, label = '';
      try { live = Number(HW.__SPR_LIVE_SEQ__ || 0) || 0; } catch (e2) {}
      try { run = Number(HW.__SPR_SEQ__ || 0) || 0; } catch (e3) {}
      try { label = String(HW.__SPR_LIVE_LABEL__ || HW.__SPR_LIVE_VER__ || ''); } catch (e4) {}
      var el = d.getElementById(NVB_ID);
      var newer = (live > 0 && run > 0 && live > run);
      if (!newer) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        return;
      }
      if (!el) {
        el = d.createElement('div');
        el.id = NVB_ID;
        el.setAttribute('style',
          'position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top,0px));' +
          'z-index:2147483646;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
          'padding:7px 12px;border-radius:16px;cursor:pointer;' +
          'background:linear-gradient(160deg,#8a5a12,#5f3c07);border:1px solid rgba(255,205,120,.75);' +
          'color:#fff6e2;font-size:12px;font-weight:700;line-height:1.3;' +
          'box-shadow:0 6px 18px rgba(90,50,0,.5);' +
          'font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif;');
        el.onclick = function (ev) {
          try { ev.preventDefault(); ev.stopPropagation(); } catch (eC) {}
          try { if (TOP.location) { TOP.location.reload(); return; } } catch (eR) {}
          try { location.reload(); } catch (eR2) {}
        };
        (d.body || d.documentElement).appendChild(el);
      }
      var sv = String(label || '');
      var mv = /v(\d+)\.(\d+)/.exec(sv);
      var mn = /第\s*(\d+)\s*次/.exec(sv);
      var txt = '📦 新版本';
      if (mv) txt += ' v' + mv[1] + '.' + mv[2];
      if (mn) txt += ' · 第 ' + mn[1] + ' 次更新';
      txt += ' · 点此刷新';
      el.textContent = txt;
    } catch (eB) {}
  }
  try { setInterval(thNvBarTick, 15000); } catch (eI0) {}
  try { setTimeout(thNvBarTick, 6000); } catch (eT0) {}

  boot();
    }
  } catch (eBoot) {
    try { boot(); } catch (eB2) {}
  }
})();
