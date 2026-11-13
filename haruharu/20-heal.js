/* ============================================================
   《08-变量自愈中心 · 非同层完整自包含版 v9.0》
   在 v8.8 自愈引擎上，参考「同层版 v97」的嗅探口径重构（借思路不照抄，
   判定标准与变量规则仍按本卡自己那一套）：
   1. 【2 秒轮询嗅探】：心跳每秒一次，函数内按 2 秒节流；
      不再看「文本静默多久」——只要不在生成中就查最新楼层。
   2. 【判定清单化】：只查 5 项格式（变量标签在不在 / 闭没闭 / 有没有两份 /
      JSONPatch 标签在不在 / JSON 能不能 parse 成数组），不查「缺哪个变量」。
      本轮确实没变化时写的空数组 [] 也算合法。
   3. 【只弹提示，不弹界面】：嗅到格式异常只弹一条轻提示 + 顶栏亮红标；
      不再自动弹自愈面板、不再挂起游戏、不再弹「安全死锁」alert。
      想看详情 / 想补算，玩家自己点顶栏「🩺 变量自愈」按钮。
   4. 【三篇章全支持】：夏越村、公寓、神社三篇章人物速查与苦主自适应注入。
   5. 【非同层零依赖自包含】：内置完整 DOM、上下文、MVU 原生 parseMessage 驱动与
      独立模态窗与样式，同时暴露 window.__MvuApi 供纯净状态栏前端组件无缝交互。
   ============================================================ */

var MvuSelfHealing = (function() {

  function getDoc() {
    try { if (document && document.body) return document; } catch (e0) {}
    try { if (window.top && window.top.document) return window.top.document; } catch (e) {}
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
        if (w && w.SillyTavern && typeof w.SillyTavern.getContext === "function") {
          return w.SillyTavern.getContext();
        }
      } catch (e2) {}
    }
    try {
      if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
        return window.SillyTavern.getContext();
      }
    } catch (e3) {}
    return null;
  }

  function updateContainer() {}

  function findMvuGlobal() {
    var cands = [];
    try { cands.push(window.top); } catch (e0) {}
    try { cands.push(window.parent); } catch (e1) {}
    cands.push(window);
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && typeof cands[i].Mvu !== "undefined") return cands[i].Mvu; } catch (e2) {}
    }
    return null;
  }

  function deepMergeInto(target, source) {
    if (!source || typeof source !== "object") return target;
    if (!target || typeof target !== "object") return target;
    for (var k in source) {
      if (Object.prototype.hasOwnProperty.call(source, k)) {
        var sv = source[k];
        if (sv && typeof sv === "object" && !Array.isArray(sv)) {
          if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
          deepMergeInto(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
    }
    return target;
  }

  function messageTextOf(m) {
    if (!m) return "";
    return typeof m.mes === "string" ? m.mes : (typeof m.message === "string" ? m.message : "");
  }

  var _cssInjected = false;
  function ensurePanelCss() {
    if (_cssInjected) return;
    var doc = getDoc();
    if (doc.getElementById("th-mvu-standalone-css")) { _cssInjected = true; return; }
    var st = doc.createElement("style");
    st.id = "th-mvu-standalone-css";
    st.textContent = [
      ".th-gal-mvu-suspend-modal{position:fixed!important;top:0!important;left:0!important;width:100%!important;height:100%!important;z-index:99999!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(6,8,12,.72)!important;}",
      ".th-gal-mvu-box{width:min(92vw,470px)!important;max-height:86vh!important;overflow-y:auto!important;box-sizing:border-box!important;padding:22px 20px!important;text-align:center!important;background:rgba(23,31,51,.98)!important;border:1px solid rgba(245,158,11,.5)!important;border-radius:12px!important;box-shadow:0 16px 40px rgba(0,0,0,.6),0 0 20px rgba(245,158,11,.2)!important;font-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Microsoft YaHei\",sans-serif!important;color:#f8fafc!important;}",
      ".th-gal-mvu-badge{display:inline-block!important;padding:4px 10px!important;margin-bottom:12px!important;background:rgba(245,158,11,.15)!important;border:1px solid rgba(245,158,11,.5)!important;border-radius:999px!important;color:#fbbf24!important;font-size:11px!important;font-weight:600!important;letter-spacing:1px!important;}",
      ".th-gal-mvu-title{font-size:17px!important;font-weight:700!important;color:#fff!important;margin-bottom:8px!important;}",
      ".th-gal-mvu-desc{font-size:13px!important;line-height:1.6!important;color:#cbd5e1!important;margin-bottom:18px!important;min-height:40px!important;}",
      ".th-gal-mvu-spinner{width:28px!important;height:28px!important;margin:0 auto 16px!important;border:3px solid rgba(245,158,11,.2)!important;border-top-color:#f59e0b!important;border-radius:50%!important;animation:thGalSpin .8s linear infinite!important;}",
      "@keyframes thGalSpin{to{transform:rotate(360deg);}}",
      ".th-gal-mvu-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important;justify-content:center!important;}",
      ".th-gal-mvu-btn{background:#d97706!important;color:#fff!important;border:none!important;padding:8px 16px!important;border-radius:6px!important;font-size:12px!important;font-weight:600!important;cursor:pointer!important;transition:all .2s ease!important;font-family:inherit!important;}",
      ".th-gal-mvu-btn:hover{background:#b45309!important;box-shadow:0 0 10px rgba(245,158,11,.4)!important;}",
      ".th-gal-mvu-btn-deep{background:#7c3aed!important;}",
      ".th-gal-mvu-btn-deep:hover{background:#6d28d9!important;box-shadow:0 0 10px rgba(124,58,237,.45)!important;}",
      ".th-gal-mvu-btn-sec{background:rgba(255,255,255,.1)!important;color:#cbd5e1!important;border:1px solid rgba(255,255,255,.15)!important;}",
      ".th-gal-mvu-btn-sec:hover{background:rgba(255,255,255,.18)!important;color:#fff!important;}",
      ".th-gal-mvu-btn-sub{background:rgba(56,189,248,.18)!important;color:#7dd3fc!important;border:1px solid rgba(56,189,248,.4)!important;padding:6px 10px!important;border-radius:6px!important;font-size:11px!important;cursor:pointer!important;font-family:inherit!important;}",
      ".th-gal-mvu-tabs{display:flex!important;gap:6px!important;justify-content:center!important;flex-wrap:wrap!important;margin:10px 0 14px!important;}",
      ".th-gal-mvu-tab{background:rgba(255,255,255,.08)!important;color:#cbd5e1!important;border:1px solid rgba(255,255,255,.14)!important;padding:5px 12px!important;border-radius:999px!important;font-size:11.5px!important;cursor:pointer!important;font-family:inherit!important;}",
      ".th-gal-mvu-tab.active{background:rgba(245,158,11,.2)!important;color:#fbbf24!important;border-color:rgba(245,158,11,.6)!important;font-weight:700!important;}",
      ".th-gal-mvu-tab-panel{text-align:left!important;}",
      ".th-gal-mvu-hint{font-size:11px!important;color:#94a3b8!important;margin:6px 0!important;line-height:1.55!important;}",
      ".th-gal-mvu-info-card{background:rgba(15,23,42,.85)!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;padding:10px 12px!important;font-size:11.5px!important;color:#cbd5e1!important;line-height:1.65!important;word-break:break-all!important;}",
      ".th-gal-mvu-form{display:flex!important;flex-direction:column!important;gap:8px!important;}",
      ".th-gal-mvu-form-row{display:flex!important;flex-direction:column!important;gap:4px!important;text-align:left!important;}",
      ".th-gal-mvu-form-row label{font-size:11.5px!important;color:#94a3b8!important;}",
      ".th-gal-mvu-form-row input{background:rgba(15,23,42,.9)!important;border:1px solid rgba(255,255,255,.15)!important;border-radius:6px!important;color:#f8fafc!important;padding:6px 10px!important;font-size:12px!important;outline:none!important;}",
      ".th-gal-mvu-form-row input:focus{border-color:#f59e0b!important;}",
      ".th-gal-mvu-form-row select{background:#0f172a!important;border:1px solid rgba(255,255,255,.15)!important;border-radius:6px!important;color:#f8fafc!important;padding:6px 8px!important;font-size:11.5px!important;outline:none!important;}",
      '.th-mvu-issue-toast{position:fixed!important;top:14px!important;left:50%!important;transform:translate(-50%,-14px)!important;z-index:100000!important;max-width:min(88vw,560px)!important;box-sizing:border-box!important;padding:10px 16px!important;border-radius:10px!important;background:rgba(23,31,51,.97)!important;border:1px solid rgba(245,158,11,.6)!important;box-shadow:0 10px 28px rgba(0,0,0,.55)!important;color:#fde68a!important;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif!important;font-size:12.5px!important;line-height:1.6!important;text-align:left!important;opacity:0!important;pointer-events:none!important;transition:opacity .22s ease,transform .22s ease!important;}',
      '.th-mvu-issue-toast-show{opacity:1!important;transform:translate(-50%,0)!important;}'
    ].join("");
    doc.head.appendChild(st);
    _cssInjected = true;
  }

  var _isSuspended = false;
  var _inFlight = false;
  var _currentTaskName = "";
  var _taskStartTime = 0;
  var _modalEl = null;
  var _topbarBtn = null;
  var _timerInterval = null;
  var _statusSink = null;

  /* 名册必须与卡里 [39]《人物总览》对齐（这份名册会原样喂给补算模型）：
     · 夏越村补「西村百花」—— 她有独立条目 [29]、在 [0]《插图系统》里、丈夫西村诚也在
       苦主条目里，是标准的在场主要角色，原先漏列。
     · 夏越村 victims 去掉香本家多出来的那一位：卡里 [39]《人物总览》香本家只有
       香本千玲与香本悠，那个人名整张卡查无对应角色，按确认一并清除（全卡 0 处）。
     · 公寓篇当前只有两位女主：神谷奈绪(203)、桃崎千鹤(303)（[49] 公寓铁律明写）。
       原写的「椎名真白」整张卡查无此人；「椎名和也 / 神谷秀一」同样查无此人，
       且 [47] 明写奈绪「其实她也没有丈夫」。加上 [49] 铁律「公寓篇禁止苦主/NTR」，
       故 victims 记「无」（与神社篇写法一致）。 */
  var ROSTER_DATA = {
    "夏越村": {
      roles: "春日久美子、春日葵、春日静奈、吉川美穗、山上椿芽、西村百花、香本千玲、白坂结奈",
      victims: "春日大平、吉川大田、山上左寻、西村太郎",
      places: "春日大平家(客厅/厨房/浴室/主卧/次卧1/次卧2/次卧3/前院)、吉川大田家、山上左寻家、西村太郎家、小卖铺、神社前庭、秘密基地、河边、学校操场"
    },
    "公寓": {
      roles: "神谷奈绪、桃崎千鹤",
      victims: "无",
      places: "301室、302室、303室、304室、305室、走廊、天台、大堂、垃圾站、便利店"
    },
    "神社": {
      roles: "神代凛音、月读澪、斋宫若叶",
      victims: "无",
      places: "鸟居长廊、神龛佛堂里、神龛佛堂外、神社客房、神社温泉、神社主卧、神社主卧外、神社小铺里、神社小铺外"
    }
  };

  /* 轻提示：只提示，不弹面板、不挂起游戏。非同层版没有游戏壳，直接挂 body。 */
  function showToast(message, ms) {
    try {
      var doc = getDoc();
      ensurePanelCss();
      var el = doc.getElementById("th-mvu-issue-toast");
      if (!el) {
        el = doc.createElement("div");
        el.id = "th-mvu-issue-toast";
        el.className = "th-mvu-issue-toast";
        el.setAttribute("role", "status");
        (doc.body || doc.documentElement).appendChild(el);
      }
      el.innerHTML = String(message == null ? "" : message);
      el.classList.add("th-mvu-issue-toast-show");
      if (el.__thHideTimer) clearTimeout(el.__thHideTimer);
      el.__thHideTimer = setTimeout(function() {
        try { el.classList.remove("th-mvu-issue-toast-show"); } catch (eH) {}
      }, Math.max(1200, ms || 1800));
    } catch (e) {}
  }

  function stripAllVariableBlocks(text) {
    if (!text) return "";
    var s = String(text);
    s = s.replace(/<UpdateVariable\b[^>]*>[\s\S]*?(?:<\/UpdateVariable>|$)/gi, "");
    s = s.replace(/<(?:JSONPatch|json_?patch)\b[^>]*>[\s\S]*?(?:<\/(?:JSONPatch|json_?patch)>|$)/gi, "");
    s = s.replace(/<Analysis\b[^>]*>[\s\S]*?(?:<\/Analysis>|$)/gi, "");
    s = s.replace(/(?:<|&lt;)StatusPlaceHolderImpl[\s\S]*?(?:>|&gt;)/gi, "");
    return s.trim();
  }

  function extractAndPreserveProse(rawText, targetMsg) {
    var s = String(rawText || "");
    var cMatch = s.match(/<content\b[^>]*>[\s\S]*?<\/content>/i);
    if (cMatch && cMatch[0]) return cMatch[0].trim();

    var cOpenMatch = s.match(/<content\b[^>]*>([\s\S]*)$/i);
    if (cOpenMatch && cOpenMatch[1]) {
      var inside = cOpenMatch[1];
      var cutPos = inside.search(/<(?:UpdateVariable|JSONPatch|json_?patch|Analysis)\b/i);
      if (cutPos !== -1) inside = inside.slice(0, cutPos);
      return "<content>\n" + inside.trim() + "\n</content>";
    }

    var stripped = stripAllVariableBlocks(s);
    if (stripped) return "<content>\n" + stripped + "\n</content>";

    if (targetMsg) {
      var fallback = messageTextOf(targetMsg);
      var fStripped = stripAllVariableBlocks(fallback);
      if (fStripped) return "<content>\n" + fStripped + "\n</content>";
    }
    return "";
  }

  function buildFullUpdateVariableBlock(rawReply, validOps) {
    var analysisBlock = "";
    var aMatch = rawReply ? rawReply.match(/<Analysis\b[^>]*>([\s\S]*?)<\/Analysis>/i) : null;
    if (aMatch && aMatch[1] && aMatch[1].trim()) {
      analysisBlock = "<Analysis>\n" + aMatch[1].trim() + "\n</Analysis>\n";
    } else {
      var timeOp = validOps.find(function(o) { return o.path === "/时间/精确时间"; });
      var roleLines = [];
      var roleMap = {};
      validOps.forEach(function(o) {
        var m = o.path.match(/\/主要角色列表\/([^\/]+)\/(.+)/);
        if (m) {
          var rName = m[1];
          var rField = m[2];
          if (!roleMap[rName]) roleMap[rName] = [];
          roleMap[rName].push(rField + "=" + o.value);
        }
      });
      for (var r in roleMap) {
        roleLines.push(r + " (" + roleMap[r].join(", ") + ")");
      }
      analysisBlock = "<Analysis>\n" +
        "- Time passed: 剧情自然推演，时间更新至 " + (timeOp ? timeOp.value : "当前时间段") + "。\n" +
        "- Dramatic update: No.\n" +
        "- Variable analysis:\n" +
        "  - 角色状态变动：" + (roleLines.length ? roleLines.join("； ") : "同场角色在场状态确认，数值平稳") + "。\n" +
        "  - 状态结算：主角信息与环境保持稳定。\n" +
        "</Analysis>\n";
    }

    var jsonPatchBody = JSON.stringify(validOps, null, 2);
    return "<UpdateVariable>\n" + analysisBlock + "<JSONPatch>\n" + jsonPatchBody + "\n</JSONPatch>\n</UpdateVariable>\n\n<StatusPlaceHolderImpl/>";
  }

  function getLatestAIMessageIndex() {
    var ctx = getStContext();
    if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return -1;
    for (var i = ctx.chat.length - 1; i >= 0; i--) {
      var m = ctx.chat[i];
      if (m && !m.is_user && !m.is_system) return i;
    }
    return -1;
  }

  function getMsgRawText(idx) {
    if (idx < 0) return "";
    var ctx = getStContext();
    if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat[idx]) return "";
    return messageTextOf(ctx.chat[idx]);
  }

  function lcsParsePatch(rawIn, allowEmpty) {
    var raw = String(rawIn || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    if (!raw) return false;
    var inner = /<(?:JSONPatch|json_?patch)\b[^>]*>([\s\S]*?)<\/(?:JSONPatch|json_?patch)\s*>/i.exec(raw);
    if (inner && inner[1]) raw = inner[1].replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    if (!raw) return false;
    try {
      var arr = JSON.parse(raw);
      /* allowEmpty：格式校验时 [] 是完全合法的（本轮确实没变化） */
      return Array.isArray(arr) && (allowEmpty ? true : arr.length > 0);
    } catch (e) { return false; }
  }

  /* ═══ 变量块判定 —— 只查「格式」，不查「缺哪个变量」═══
     ① 有没有 <UpdateVariable> 变量标签；② 标签闭没闭；③ 标签是不是出现了两份；
     ④ 里面 <JSONPatch> JSON 标签在不在；⑤ 那段 JSON 有没有闭合（能不能 parse 成数组）。
     「好感度没写」「时间没更」「Analysis 有没有」「缺哪个字段」——一律不查、不报。
     返回：问题清单（空数组 = 格式正常）。 */
  function checkVarFormat(text) {
    var problems = [];
    var s = String(text == null ? "" : text);
    if (!s.trim()) { problems.push("本楼完全没有变量块"); return problems; }

    /* ① 变量标签在不在  ② 闭没闭  ③ 有没有两份 */
    var openVar = (s.match(/<UpdateVariable\b[^>]*>/gi) || []).length;
    var closeVar = (s.match(/<\/UpdateVariable\s*>/gi) || []).length;
    if (openVar === 0) {
      problems.push("缺少 &lt;UpdateVariable&gt; 变量标签");
    } else {
      if (closeVar === 0 || closeVar < openVar) problems.push("&lt;UpdateVariable&gt; 标签未闭合");
      if (openVar > 1) problems.push("&lt;UpdateVariable&gt; 出现了 " + openVar + " 份（每轮只允许一份）");
    }

    /* ④ 里面的 JSONPatch 标签在不在  ⑤ 那段 JSON 闭没闭合 */
    var openJp = (s.match(/<(?:JSONPatch|json_?patch)\b[^>]*>/gi) || []).length;
    var closeJp = (s.match(/<\/(?:JSONPatch|json_?patch)\s*>/gi) || []).length;
    if (openJp === 0) {
      problems.push("变量块里缺少 &lt;JSONPatch&gt; JSON 标签");
    } else {
      if (closeJp === 0 || closeJp < openJp) problems.push("&lt;JSONPatch&gt; 标签未闭合");
      if (!lcsParsePatch(s, true)) problems.push("&lt;JSONPatch&gt; 里的 JSON 没闭合、或不是合法数组");
    }
    return problems;
  }

  function formatProblemHtml(problems) {
    if (!problems || !problems.length) return "";
    return "· " + problems.join("<br>· ");
  }

  /* 兼容老调用点：格式没问题 ⇔ hasCompleteMvuPatch 为真 */
  function hasCompleteMvuPatch(text) { return checkVarFormat(text).length === 0; }

  function advanceClock(timeStr, addMins) {
    if (!timeStr || !timeStr.includes(":")) timeStr = "07:40";
    var parts = timeStr.split(":").map(Number);
    var total = (parts[0] || 0) * 60 + (parts[1] || 0) + (addMins || 15);
    var newH = Math.floor(total / 60) % 24;
    var newM = total % 60;
    return (newH < 10 ? "0" + newH : "" + newH) + ":" + (newM < 10 ? "0" + newM : "" + newM);
  }

  function extractProse(text) {
    if (!text) return "";
    var m = text.match(/<content>([\s\S]*?)<\/content>/i);
    if (m && m[1]) return m[1].trim();
    return stripAllVariableBlocks(text).slice(0, 3000);
  }

  function getCurrentVariablesSnapshot() {
    var sd = null;
    try {
      var win = window.top || window;
      var mvu = win.Mvu;
      if (mvu && typeof mvu.getMvuData === "function") {
        var dLatest = mvu.getMvuData({ type: "message", message_id: "latest" });
        if (dLatest && (dLatest.stat_data || dLatest.sata_data)) sd = dLatest.stat_data || dLatest.sata_data;
        if (!sd) {
           var dChat = mvu.getMvuData({ type: "chat" }) || mvu.getMvuData();
           if (dChat && (dChat.stat_data || dChat.sata_data)) sd = dChat.stat_data || dChat.sata_data;
        }
      }
    } catch (eMvu) {}

    if (!sd) {
      try { sd = (typeof stat_data !== "undefined" && stat_data) ? stat_data : null; } catch (eSd) {}
    }

    if (!sd) {
      return "（暂未读取到全局变量，请按照夏越村初始变量基准进行推理）";
    }

    try {
      var curArc = (sd.全局 && sd.全局.当前篇章) ? sd.全局.当前篇章 : "夏越村";
      var activeRoles = {};
      if (sd.主要角色列表) {
        for (var r in sd.主要角色列表) {
          var charObj = sd.主要角色列表[r];
          if (charObj && (charObj.好感度 > 0 || charObj.恶堕度 > 0 || charObj.在场状态 || charObj.衣服状态)) {
            activeRoles[r] = charObj;
          }
        }
      }
      return JSON.stringify({
        时间: sd.时间 || { 精确时间: "07:40" },
        全局: { 当前篇章: curArc },
        主角信息: sd.主角信息 || {},
        主要活跃角色: activeRoles
      }, null, 2);
    } catch (eFmt) {
      return JSON.stringify(sd).slice(0, 1500);
    }
  }

  function getApiMode() {
    return localStorage.getItem("thGalMvuApiMode") || "main";
  }

  function setApiMode(m) {
    localStorage.setItem("thGalMvuApiMode", m);
  }

  function getActiveApiConfig() {
    var mode = getApiMode();
    if (mode === "deduce") {
      try {
        var s = localStorage.getItem("thGalDeduceSettings");
        if (s) {
          var p = JSON.parse(s);
          if (p && p.base && p.key) {
            var ep = String(p.base).trim().replace(/\/+$/, "");
            if (!/\/chat\/completions$/.test(ep)) ep += "/chat/completions";
            return { mode: "deduce", endpoint: ep, key: String(p.key).trim(), model: p.model || "gpt-4o-mini" };
          }
        }
      } catch (e) {}
    } else if (mode === "custom") {
      var b = localStorage.getItem("thGalMvuCustomBase") || "";
      var k = localStorage.getItem("thGalMvuCustomKey") || "";
      var mdl = localStorage.getItem("thGalMvuCustomModel") || "gpt-4o-mini";
      if (b && k) {
        var ep2 = String(b).trim().replace(/\/+$/, "");
        if (!/\/chat\/completions$/.test(ep2)) ep2 += "/chat/completions";
        return { mode: "custom", endpoint: ep2, key: String(k).trim(), model: mdl };
      }
    } else if (mode === "main") {
      return { mode: "main", endpoint: "/api/backends/chat-completions/generate", key: "", model: "st-main" };
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     【模型拉取链 · 参考《天元一界 / 08-外置变量补全.js》v412~v421】

     原来只有一句 `fetch(base + "/models")`。为什么必须换掉：

     浏览器直连受 CORS 限制，而各家的 /models 态度完全不同。实测（2026-10-22，带 Origin）：

         DeepSeek / 阿里百炼 / 智谱 / Moonshot  →  /models 带 access-control-allow-origin
         火山方舟（豆包）                       →  /models **一个 CORS 头都没有**，
                                                  且 /api/v3/models 直接 404

     于是点「拉取模型」只会得到 `Failed to fetch` —— 玩家会以为自己 Key 填错了。

     天元一界的解法关键不是"怎么写请求"，而是**先问谁**：

         ① 宿主的 getModelList（跑在酒馆助手扩展上下文里，不吃网页 CORS）
         ② TavernHelper.getModelList（老版本助手只导出这个）
         ③ 酒馆后端 /api/backends/chat-completions/status（同源，由 Node 进程去连）
         ④ 浏览器直连 base + "/models"（带 CORS 的家仍然走这条，省一层中转）
         ⑤ 全都不行 → 摊开官方兜底名单，至少让玩家能选，而不是对着空框猜

     每一级「拿不到就静默往下走」，绝不因为某一级失败就整体报错 ——
     别让火山的限制连累 DeepSeek、百炼这些本来能直连的家。
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── 地址归一：把玩家粘进来的各种形状统一成「根地址」 ──
     直接 `base + "/chat/completions"` 时，玩家粘完整地址就会拼成
     `.../chat/completions/chat/completions`，报 404 而他完全看不出为什么。 */
  function baseOf(u) {
    var b = String(u || "").trim().replace(/\/+$/, "");
    b = b.replace(/\/chat\/completions$/i, "").replace(/\/completions$/i, "");
    b = b.replace(/\/messages$/i, "");   /* Anthropic 协议的尾巴，粘进来也认 */
    b = b.replace(/\/models$/i, "");     /* 有人会把 /models 也粘进来 */
    b = b.replace(/\/+$/, "");
    /* 火山 Coding Plan 有**两个**官方 Base URL、同一份 Key：
         · https://ark.cn-beijing.volces.com/api/coding       （Anthropic 协议 /messages）
         · https://ark.cn-beijing.volces.com/api/coding/v3    （OpenAI 协议 /chat/completions）
       本脚本只会说 OpenAI 协议，所以粘了前者必须补成后者 ——
       否则拼出来是 `/api/coding/chat/completions`，必然 404，
       而报错只会说「HTTP 404」，看着像地址写错。 */
    if (/^https?:\/\/ark\.cn-beijing\.volces\.com\/api\/coding$/i.test(b)) b += "/v3";
    return b.replace(/\/+$/, "");
  }

  /* ── 已知「/models 拿不到」的服务商 ──
     ⚠ 顺序即优先级：Coding Plan 必须排在通用火山规则之前（两条正则命中同一域名）。
       这两者是**独立的服务**，不只是同一个家的另一个路径：
         /api/v3         = 在线推理（按 token 计费）
         /api/coding/v3  = Coding Plan（按次数的订阅套餐）
       两边的模型名是两套、互不通用，官方文档点名禁的就是把在线推理 ID 填进 coding。 */
  var NO_CORS_PROVIDERS = [
    { re: /ark\.cn-beijing\.volces\.com\/api\/coding/i, name: "火山方舟 Coding Plan" },
    { re: /volces\.com|volcengine|ark\.cn-beijing/i, name: "火山方舟（豆包）" }
  ];

  function knownNoCors(url) {
    for (var i = 0; i < NO_CORS_PROVIDERS.length; i++) {
      if (NO_CORS_PROVIDERS[i].re.test(String(url))) return NO_CORS_PROVIDERS[i].name;
    }
    return "";
  }

  /* ── 兜底模型名 ──
     拉不到列表时至少给一串能直接用的，免得玩家对着空白框猜。
     ⚠ 这张表必须照官方模型列表页抄，不能凭印象写：
         来源 https://www.volcengine.com/docs/82379/1553586 （火山方舟「模型列表」）
         核对日期 2026-10-22
     给玩家一串查不到的模型名，比给他一个空白框更糟 —— 他选中后只会得到一个看不懂的 404。
     ⚠ 只收录火山两家：别家直连就能拉到，凭空补名单反而可能误导。 */
  var FALLBACK_MODELS = {
    "火山方舟（豆包）": [
      /* 官方「推荐模型」（2.1 代，当前主推） */
      "doubao-seed-2-1-pro-260915", "doubao-seed-2-1-lite-260915",
      "doubao-seed-2-1-turbo-260628", "doubao-seed-evolving",
      /* 往期仍在售 */
      "doubao-seed-2-1-pro-260628", "doubao-seed-2-0-lite-260428",
      "doubao-seed-2-0-mini-260428",
      /* 官方标注「即将下线」：留着是因为还有人在用，排最后 */
      "doubao-seed-2-0-pro-260215"
    ],
    /* Coding Plan 专用名单，**与上面那张不能混**：
       这些是「Model Name」（`doubao-seed-code`），不是「在线推理 Model ID」
       （`doubao-seed-2-0-code-preview-260215`）。填错就是 404。
       来源：官方《套餐概览 · 支持的模型》+ TRAE 接入指南的 Model Name 列，核对日期 2026-10-27。
       顺序＝推荐顺序（旗舰在前；`ark-code-latest` 放最后：它是"跟随控制台选择"，
       第一次就选它反而看不出到底跑了哪个模型）。 */
    "火山方舟 Coding Plan": [
      "doubao-seed-2.1-pro", "doubao-seed-2.1-lite",
      "doubao-seed-code", "doubao-seed-2.0-code",
      "doubao-seed-2.0-pro", "doubao-seed-2.0-lite",
      "deepseek-v3.2", "glm-4.7", "kimi-k2.5", "minimax-m2.5",
      "ark-code-latest"
    ]
  };

  /* ── 把所有可能藏着宿主函数的 window 收集起来 ──
     酒馆助手会把函数注入在主窗口、父窗口或某个 iframe 里，三处都要找。 */
  function thWindows() {
    var out = [];
    function push(w) { try { if (w && out.indexOf(w) < 0) out.push(w); } catch (e) {} }
    try { push(window); } catch (e0) {}
    try { if (window.parent && window.parent !== window) push(window.parent); } catch (e1) {}
    try { if (window.top && window.top !== window) push(window.top); } catch (e2) {}
    try {
      var d = getDoc();
      var ifrs = d.querySelectorAll("iframe");
      for (var i = 0; i < ifrs.length; i++) { try { push(ifrs[i].contentWindow); } catch (ei) {} }
    } catch (e3) {}
    return out;
  }

  function thFindHelper() {
    var wins = thWindows();
    for (var i = 0; i < wins.length; i++) {
      try { if (wins[i].TavernHelper) return wins[i].TavernHelper; } catch (e) {}
    }
    try { if (typeof TavernHelper !== "undefined" && TavernHelper) return TavernHelper; } catch (e2) {}
    return null;
  }

  /* ── 找 getModelList ──
     名字一样、可能挂在两个地方，必须都找：
       · **裸全局变量**（`typeof getModelList === "function"`）—— 助手常把它注入到 window 上，
         `TavernHelper` 上反而没有（或版本不同没导出）
       · `TavernHelper.getModelList` —— 老版本只导出这个
     ⚠ 必须判 `typeof === "function"`：`typeof x !== "undefined"` 会命中一个同名但非函数的属性，
       调用时抛错又被 catch 吞掉 ⇒ 看起来像「没这个能力」，然后静默掉到被 CORS 拦的直连。 */
  function thFindModelListFn() {
    try {
      if (typeof getModelList === "function") return { fn: getModelList, self: undefined };
    } catch (e0) {}
    var wins = thWindows();
    for (var i = 0; i < wins.length; i++) {
      try {
        var w = wins[i];
        if (w && typeof w.getModelList === "function") return { fn: w.getModelList, self: w };
      } catch (e) {}
    }
    var TH = thFindHelper();
    try {
      if (TH && typeof TH.getModelList === "function") return { fn: TH.getModelList, self: TH };
    } catch (e2) {}
    return null;
  }

  /* 助手返回的可能是字符串数组，也可能是 {id} / {name} / {model} 对象数组，两种都收 */
  function normalizeModelList(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var nm = (typeof v === "string") ? v : ((v && (v.id || v.name || v.model)) || "");
      nm = String(nm == null ? "" : nm).trim();
      if (nm && out.indexOf(nm) < 0) out.push(nm);
    }
    out.sort();
    return out.length ? out : null;
  }

  /* ── ① 宿主的 getModelList（最优先：跑在助手上下文里，不吃 CORS） ──
     ⚠ apiurl 传**根地址**（baseOf 归一过的），别把 /models 拼进去 ——
       助手侧自己会补；两边都补就变成 /models/models。 */
  function modelsViaHostFn(base, key) {
    var hit = thFindModelListFn();
    if (!hit) return Promise.resolve(null);
    var arg = { apiurl: base };
    if (key) arg.key = key;
    var out = null;
    try {
      out = hit.fn.call(hit.self, arg);
    } catch (e1) {
      /* 老版本助手的签名可能是 (apiurl, key)，再试一次；还不行就交给下一级 */
      try { out = hit.fn.call(hit.self, base, key); } catch (e2) { return Promise.resolve(null); }
    }
    return Promise.resolve(out).then(normalizeModelList, function () { return null; });
  }

  /* ── 同源接口：CSRF token 必须**现取** ──
     实测（本机 8000，cookie 齐全）：
         cookie + Origin + Referer，不带 X-CSRF-Token → 403 Forbidden
         再加一个 X-CSRF-Token                        → 200
     所以不能只信 getRequestHeaders()：找到了那份头、但里面没有 token（或已失效）时，
     拿着缺 token 的头去发必然 403 —— 表现为「后端通道静默失败 → 回落到被拦的直连」。 */
  function stHeaders() {
    var wins = thWindows();
    var base = null;
    for (var i = 0; i < wins.length; i++) {
      try {
        var st = wins[i].SillyTavern;
        if (st && typeof st.getRequestHeaders === "function") {
          var h = st.getRequestHeaders();
          if (h && typeof h === "object") { base = h; break; }
        }
      } catch (e) {}
    }
    return fetch("/csrf-token", { cache: "no-store", credentials: "include" })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        var out = {};
        if (base) { for (var k in base) out[k] = base[k]; }
        out["Content-Type"] = "application/json";
        if (j && j.token) out["X-CSRF-Token"] = j.token;
        return out;
      })
      .catch(function () {
        var fb = { "Content-Type": "application/json" };
        if (base) { for (var k2 in base) fb[k2] = base[k2]; }
        return fb;
      });
  }

  function stOrigin() {
    var wins = thWindows();
    var hrefs = [];
    for (var i = 0; i < wins.length; i++) {
      try { if (wins[i].location && wins[i].location.href) hrefs.push(wins[i].location.href); } catch (e) {}
    }
    for (var k = 0; k < hrefs.length; k++) {
      try {
        var u = new URL(".", String(hrefs[k]));
        if (/^https?:$/i.test(u.protocol)) return u.href.replace(/\/+$/, "");
      } catch (e2) {}
    }
    for (var m = 0; m < hrefs.length; m++) {
      try {
        var o = new URL(String(hrefs[m])).origin;
        if (/^https?:\/\/[^/]+$/i.test(o)) return o;
      } catch (e3) {}
    }
    return "";
  }

  /* 同源接口先用相对路径（iframe 的 base 会解析到酒馆），403/404 再试绝对地址。
     必须带 cookie（会话 + 用户名），否则一样 403。 */
  function stApi(path, opts) {
    var o = opts || {};
    if (o.credentials === undefined) o.credentials = "include";
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

  /* ── ③ 直接问酒馆后端：完全不依赖助手，也不受浏览器 CORS 限制 ──
     请求发到同源的 /api/backends/chat-completions/status，
     由 SillyTavern 的 Node 进程去连对方（服务端没有 CORS 这回事）。 */
  function modelsViaBackend(base, key) {
    if (!base) return Promise.resolve(null);
    return stHeaders()
      .then(function (headers) {
        return stApi("/api/backends/chat-completions/status", {
          method: "POST",
          headers: headers,
          cache: "no-store",
          body: JSON.stringify({
            reverse_proxy: base,          /* 原样传根地址，后端自己拼 /models */
            proxy_password: key || "",    /* 后端只认这个字段名，别写成 key */
            chat_completion_source: "openai"
          })
        });
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.error) return null;
        /* 成功形状：{ data: [ {id}, … ] }；也见过 { data: { data: […] } }，两种都收 */
        var arr = j.data;
        if (arr && !Array.isArray(arr) && Array.isArray(arr.data)) arr = arr.data;
        return normalizeModelList(arr);
      })
      .catch(function () { return null; });
  }

  /* ── ④ 浏览器直连（带 CORS 头的那几家走这条） ──
     URL 拼法照参考脚本：补斜杠 → 补 models。 */
  function modelsViaHttp(base, key) {
    if (!base) return Promise.resolve(null);
    var url = String(base).trim();
    if (url.charAt(url.length - 1) !== "/") url += "/";
    if (!/models\/?$/i.test(url)) url += "models";
    var headers = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = "Bearer " + key;
    return fetch(url, { method: "GET", headers: headers })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.text().then(function (txt) {
          var j = null;
          try { j = JSON.parse(txt); } catch (e) { return null; }
          var arr = (j && Array.isArray(j.data)) ? j.data
            : (Array.isArray(j) ? j
              : ((j && Array.isArray(j.models)) ? j.models : null));
          return normalizeModelList(arr);
        });
      })
      .catch(function () { return null; });
  }

  /* ── 编排：① → ③ → ④ → ⑤，每级失败静默降级 ── */
  function fetchModelListSmart(rawBase, key) {
    var b = baseOf(rawBase);
    if (!b) return Promise.reject(new Error("请先填写接口地址"));
    var noCors = knownNoCors(b);
    var tried = [];

    function step(name, p) {
      tried.push(name);
      return Promise.resolve(p).then(function (list) {
        if (list && list.length) return { list: list, via: name };
        return null;
      }, function () { return null; });
    }

    return step("酒馆助手 getModelList", modelsViaHostFn(b, key))
      .then(function (r) { return r || step("酒馆后端", modelsViaBackend(b, key)); })
      .then(function (r) { return r || step("浏览器直连", modelsViaHttp(b, key)); })
      .then(function (r) {
        if (r) return r;
        var fb = FALLBACK_MODELS[noCors] || [];
        if (fb.length) {
          return { list: fb.slice(), via: "官方兜底名单", fallback: true, noCors: noCors };
        }
        throw new Error(
          "各条通道都没拿到列表（试过：" + tried.join(" / ") + "）。"
          + (noCors
            ? noCors + " 的 /models 不返回跨域头，浏览器读不到 —— 这不是你的地址或 Key 填错，它家的对话接口照常能用。"
            : "")
          + "可以直接手填模型名。"
        );
      });
  }

  /* ── 把火山的几种错误翻成人话（实测于 2026-10-27，用真 Key）──
     原文都很长且夹着 request id，直接抛出去玩家只会以为「Key 又错了」。 */
  function arkHint(txt) {
    var t = String(txt || "");
    if (/InvalidSubscription/i.test(t)) {
      return "｜这份 Key **没有有效的 Coding Plan 订阅**（或已过期）。两条路："
        + "① 去方舟控制台续订 Coding Plan；"
        + "② 把地址换成 https://ark.cn-beijing.volces.com/api/v3 走在线推理（按 token 计费，实测可用）";
    }
    if (/ModelNotOpen/i.test(t)) {
      return "｜这个模型你的账号**没有开通**（方舟要求逐个开通，不是 Key 的问题）。"
        + "去控制台「开通管理」开通它，或换一个已开通的";
    }
    if (/InvalidEndpointOrModel/i.test(t)) {
      return "｜这个模型名**不存在**：确认拼写，或在「拉取模型」列表里重新选一个";
    }
    if (/SetLimitExceeded/i.test(t)) {
      return "｜这个模型**达到账号限额**了，换模型或去控制台提额度";
    }
    return "";
  }

  /* ── 对话也走酒馆后端：火山直连聊天接口同样没有 CORS 头 ──
     实测（带 Origin）：/api/coding/v3/chat/completions → 401，无 access-control-allow-origin。
     所以「拉取模型能成、测试连通性却 Failed to fetch」是同一条根因，
     而 Failed to fetch 是浏览器跨域的固定措辞，跟 Key、模型名都无关。 */
  function callViaBackendChat(base, key, model, prompt) {
    var b = baseOf(base);
    if (!b) return Promise.reject(new Error("没有可用的接口地址"));
    return stHeaders()
      .then(function (headers) {
        return stApi("/api/backends/chat-completions/generate", {
          method: "POST",
          headers: headers,
          cache: "no-store",
          body: JSON.stringify({
            chat_completion_source: "openai",
            reverse_proxy: b,
            proxy_password: key || "",
            model: model,
            messages: [{ role: "user", content: prompt || "测试" }],
            max_tokens: 5,
            temperature: 0.3,
            stream: false
          })
        });
      })
      .then(function (r) {
        return r.text().then(function (txt) {
          if (!r.ok) throw new Error("酒馆后端 HTTP " + r.status + "：" + String(txt).slice(0, 160) + arkHint(txt));
          var j = null;
          try { j = JSON.parse(txt); } catch (e) {
            throw new Error("酒馆后端返回不是 JSON：" + String(txt).slice(0, 140));
          }
          if (j && j.error) {
            var em = (j.error && (j.error.message || j.error.code)) || j.error;
            var rawErr = String(typeof em === "string" ? em : JSON.stringify(em));
            throw new Error("酒馆后端报错：" + rawErr.slice(0, 180) + arkHint(rawErr));
          }
          return true;
        });
      });
  }

  /* ── 渲染下拉框 ── */
  function renderModelOptions(doc, sel, list) {
    if (!sel) return;
    var html = "<option value=\"\">-- 选择模型 --</option>";
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i])
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      html += "<option value=\"" + id + "\">" + id + "</option>";
    }
    sel.innerHTML = html;
    sel.style.display = "block";
    sel.onchange = function () {
      var inp = doc.getElementById("th-mvu-inp-model");
      if (inp && sel.value) inp.value = sel.value;
    };
  }

  function updateTopbarBtnState() {
    var doc = getDoc();
    var btn = _topbarBtn || doc.querySelector(".mvu-heal-btn") || doc.querySelector(".th-gal-btn-mvu-heal");
    if (!btn) return;
    _topbarBtn = btn;

    if (_inFlight) {
      btn.innerHTML = "<span class=\"mvu-heal-icon\">⏳</span><span class=\"mvu-heal-text\">补算中...</span>";
      btn.classList.add("th-gal-btn-mvu-running");
    } else if (_hasIssue) {   /* 只认「本楼真有未处理异常」，不拿挂起状态当异常 */
      btn.innerHTML = "<span class=\"mvu-heal-icon\">🔴</span><span class=\"mvu-heal-text\">变量异常</span>";
      btn.classList.add("th-gal-btn-mvu-running");
    } else {
      btn.classList.remove("th-gal-btn-mvu-running");
      if (!btn.getAttribute("data-keep-status")) {
        btn.innerHTML = "<span class=\"mvu-heal-icon\">🩺</span><span class=\"mvu-heal-text\">变量自愈</span>";
      }
    }
  }

  function ensureModal(shell) {
    ensurePanelCss();
    var doc = getDoc();
    var existing = doc.getElementById("th-mvu-suspend-modal");
    if (existing) {
      _modalEl = existing;
      return existing;
    }

    var m = doc.createElement("div");
    m.id = "th-mvu-suspend-modal";
    m.className = "th-gal-mvu-suspend-modal";
    m.innerHTML = "<div class=\"th-gal-mvu-box\">" +
      "<div class=\"th-gal-mvu-view\" id=\"th-mvu-main-view\">" +
        "<div class=\"th-gal-mvu-badge\" id=\"th-mvu-badge\">🩺 MVU 变量自愈中心 (非同层版)</div>" +
        "<div class=\"th-gal-mvu-title\" id=\"th-mvu-title\">变量状态检查</div>" +
        "<div class=\"th-gal-mvu-desc\" id=\"th-mvu-status-desc\">每 2 秒轮询嗅探监控中...</div>" +
        "<div class=\"th-gal-mvu-spinner\" id=\"th-mvu-spinner\" style=\"display: none;\"></div>" +
        "<div class=\"th-gal-mvu-actions\">" +
          "<button type=\"button\" class=\"th-gal-mvu-btn\" data-act=\"fast-repair\">⚡ 快速轻量补算 (推荐)</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-deep\" data-act=\"deep-repair\">🧠 全文精细补算 (全上下文)</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-sec\" data-act=\"skip-time\">⏩ 推进时间(+15m)</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-sec\" data-act=\"open-api-cfg\">⚙️ API 设置</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-sec\" data-act=\"close\" id=\"th-mvu-btn-close-main\">✖ 关闭</button>" +
        "</div>" +
      "</div>" +

      "<div class=\"th-gal-mvu-view\" id=\"th-mvu-cfg-view\" style=\"display: none;\">" +
        "<div class=\"th-gal-mvu-badge\">⚙️ 变量补全 · API 通道设置</div>" +
        "<div class=\"th-gal-mvu-title\">选择补算接口来源</div>" +
        "<div class=\"th-gal-mvu-tabs\">" +
          "<button type=\"button\" class=\"th-gal-mvu-tab active\" data-tab=\"main\">🍺 酒馆主模型</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-tab\" data-tab=\"custom\">✏️ 另选专属</button>" +
        "</div>" +

        "<div class=\"th-gal-mvu-tab-panel\" id=\"th-mvu-panel-main\">" +
          "<div class=\"th-gal-mvu-hint\" style=\"font-size: 11px; color: #94a3b8; margin: 6px 0;\">直接通过酒馆内部中继接口，让当前主模型参与变量重算。无需额外配置 Key。</div>" +
          "<div class=\"th-gal-mvu-info-card\">已就绪：将调用 SillyTavern 当前激活的主会话模型与预设</div>" +
        "</div>" +

        "<div class=\"th-gal-mvu-tab-panel\" id=\"th-mvu-panel-custom\" style=\"display: none;\">" +
          "<div class=\"th-gal-mvu-hint\" style=\"font-size: 11px; color: #94a3b8; margin: 6px 0;\">为此功能独立配置专用轻量中转端（如 gpt-4o-mini / deepseek-chat）。</div>" +
          "<div class=\"th-gal-mvu-form\">" +
            "<div class=\"th-gal-mvu-form-row\"><label>接口地址 (Base URL):</label><input type=\"text\" id=\"th-mvu-inp-base\" placeholder=\"https://api.openai.com/v1\" /></div>" +
            "<div class=\"th-gal-mvu-form-row\"><label>接口密钥 (API Key):</label><input type=\"password\" id=\"th-mvu-inp-key\" placeholder=\"sk-...\" /></div>" +
            "<div class=\"th-gal-mvu-form-row\"><label>模型名称 (Model):</label><div style=\"display: flex; gap: 4px;\"><input type=\"text\" id=\"th-mvu-inp-model\" placeholder=\"gpt-4o-mini\" style=\"flex: 1;\" /><button type=\"button\" class=\"th-gal-mvu-btn-sub\" data-act=\"fetch-models\">🔍 获取模型</button></div><select id=\"th-mvu-sel-model\" style=\"display: none; width: 100%; margin-top: 4px;\"></select></div>" +
            "<div style=\"margin-top: 12px; display: flex; gap: 8px; justify-content: center;\"><button type=\"button\" class=\"th-gal-mvu-btn-sub\" data-act=\"test-api\">🎲 测试连通性</button><button type=\"button\" class=\"th-gal-mvu-btn\" data-act=\"save-custom\">💾 保存并选用</button></div>" +
            "<div id=\"th-mvu-test-res\" style=\"font-size: 11px; margin-top: 6px; min-height: 16px;\"></div>" +
          "</div>" +
        "</div>" +

        "<div style=\"margin-top: 18px; display: flex; justify-content: center; gap: 8px;\">" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-sec\" data-act=\"back-main\">◀ 返回补算界面</button>" +
          "<button type=\"button\" class=\"th-gal-mvu-btn th-gal-mvu-btn-sec\" data-act=\"close\">✖ 关闭</button>" +
        "</div>" +
      "</div>" +
    "</div>";

    (shell || doc.body).appendChild(m);
    _modalEl = m;

    m.addEventListener("click", function(e) {
      var btn = e.target.closest("[data-act], [data-tab]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var tab = btn.getAttribute("data-tab");

      if (tab) { switchTab(tab); return; }
      if (act === "fast-repair") { runRepair("fast"); return; }
      if (act === "deep-repair") { runRepair("deep"); return; }
      if (act === "skip-time") { applyQuickFallback(); return; }
      if (act === "open-api-cfg") { showView("cfg"); return; }
      if (act === "back-main") { showView("main"); return; }
      if (act === "close") { handleCloseRequest(); return; }
      if (act === "test-api") { testCustomApi(); return; }
      if (act === "fetch-models") { fetchCustomModels(); return; }
      if (act === "save-custom") { saveCustomConfig(); return; }
    });

    return m;
  }

  function handleCloseRequest() {
    /* 格式异常也能关 —— 绝不弹「安全死锁」alert，绝不卡住玩家 */
    dismissSuspension();
  }

  function showView(viewName) {
    var doc = getDoc();
    var mainView = doc.getElementById("th-mvu-main-view");
    var cfgView = doc.getElementById("th-mvu-cfg-view");
    if (!mainView || !cfgView) return;

    if (viewName === "cfg") {
      mainView.style.display = "none";
      cfgView.style.display = "block";
      refreshCfgView();
    } else {
      cfgView.style.display = "none";
      mainView.style.display = "block";
    }
  }

  function switchTab(tabName) {
    var doc = getDoc();
    var tabs = doc.querySelectorAll(".th-gal-mvu-tab");
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute("data-tab") === tabName) tabs[i].classList.add("active");
      else tabs[i].classList.remove("active");
    }

    var panels = ["main", "custom"];
    for (var j = 0; j < panels.length; j++) {
      var p = doc.getElementById("th-mvu-panel-" + panels[j]);
      if (p) p.style.display = (panels[j] === tabName) ? "block" : "none";
    }

    if (tabName !== "custom") {
      setApiMode(tabName);
    }
  }

  function refreshCfgView() {
    var doc = getDoc();
    var curMode = getApiMode();
    switchTab(curMode);

    var inpBase = doc.getElementById("th-mvu-inp-base");
    var inpKey = doc.getElementById("th-mvu-inp-key");
    var inpModel = doc.getElementById("th-mvu-inp-model");
    if (inpBase) inpBase.value = localStorage.getItem("thGalMvuCustomBase") || "";
    if (inpKey) inpKey.value = localStorage.getItem("thGalMvuCustomKey") || "";
    if (inpModel) inpModel.value = localStorage.getItem("thGalMvuCustomModel") || "gpt-4o-mini";
  }

  function setStatus(html, showSpinner) {
    var doc = getDoc();
    var el = doc.getElementById("th-mvu-status-desc");
    if (el) el.innerHTML = html;
    var sp = doc.getElementById("th-mvu-spinner");
    if (sp) sp.style.display = showSpinner ? "block" : "none";

    if (typeof _statusSink === "function") {
      try { _statusSink(html, showSpinner); } catch (eSink) {}
    }
  }

  /* 找 TavernHelper：可能挂在宿主 window / 当前 window / 某个 iframe（三种都试） */
  function findTavernHelper() {
    var cands = [];
    try { cands.push(window.top); } catch (e0) {}
    try { cands.push(window.parent); } catch (e1) {}
    cands.push(window);
    try { if (typeof TavernHelper !== "undefined" && TavernHelper) cands.push({ TavernHelper: TavernHelper }); } catch (e2) {}
    for (var i = 0; i < cands.length; i++) {
      try { if (cands[i] && cands[i].TavernHelper) return cands[i].TavernHelper; } catch (e3) {}
    }
    try {
      var doc0 = getDoc();
      var ifrs = doc0.querySelectorAll("iframe");
      for (var fi = 0; fi < ifrs.length; fi++) {
        try {
          var cw = ifrs[fi].contentWindow;
          if (cw && cw.TavernHelper) return cw.TavernHelper;
        } catch (e4) {}
      }
    } catch (e5) {}
    return null;
  }

  /* 用 generateRaw 发一次。助手各版本入参形状不同，逐个试。
     ⚠ 空串也算失败、继续试下一种形状 —— 否则会静默返回空，
       下游 parsePatch 报「没有 JSONPatch」，看着像模型不听话。 */
  async function viaGenerateRaw(TH, promptText) {
    function normalize(out) {
      var v = String((out && (out.content || out.text)) || out || "");
      return v.trim() ? v : "";
    }
    var shapes = [
      function() { return TH.generateRaw({ ordered_prompts: [{ role: "user", content: promptText }] }); },
      function() { return TH.generateRaw({ user_input: promptText }); },
      function() { return TH.generateRaw({ ordered_prompts: [promptText] }); },
      function() { return TH.generateRaw(promptText); }
    ];
    for (var i = 0; i < shapes.length; i++) {
      try {
        var got = normalize(await shapes[i]());
        if (got) return got;
      } catch (e) {}
    }
    return "";
  }

  async function executeApiCall(cfg, messages, sysPrompt) {
    if (cfg.mode === "main") {
      var promptText = (sysPrompt ? (sysPrompt + "\n\n") : "") +
        messages.map(function(m) { return (m.role === "user" ? "User: " : "Assistant: ") + m.content; }).join("\n\n") +
        "\n\nAssistant:";

      /* ① TavernHelper.generateRaw —— 参考天元一界，最稳的一条 */
      var TH = findTavernHelper();
      if (TH && typeof TH.generateRaw === "function") {
        try {
          var viaRaw = await viaGenerateRaw(TH, promptText);
          if (viaRaw) return viaRaw;
        } catch (eRaw) {}
      }

      /* ② 原实现：SillyTavern.getContext().generate / generateQuietPrompt */
      var ctx = getStContext();
      if (ctx && typeof ctx.generate === "function") {
        try {
          var g1 = await ctx.generate(promptText);
          if (String(g1 || "").trim()) return g1;
        } catch (eG1) {}
      }
      if (ctx && typeof ctx.generateQuietPrompt === "function") {
        try {
          var g2 = await ctx.generateQuietPrompt(promptText);
          if (String(g2 || "").trim()) return g2;
        } catch (eG2) {}
      }

      /* ③ 最后兜底：酒馆后端接口（原实现原样保留） */
      {
        var resBackend = await fetch("/api/backends/chat-completions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptText })
        });
        if (!resBackend.ok) throw new Error("主模型请求失败 HTTP " + resBackend.status);
        var data = await resBackend.json();
        return data.text || data.content || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      }
    } else {
      var allMsgs = [];
      if (sysPrompt) allMsgs.push({ role: "system", content: sysPrompt });
      for (var i = 0; i < messages.length; i++) allMsgs.push(messages[i]);

      var resCustom = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.key
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: allMsgs,
          temperature: 0.3,
          max_tokens: 1500
        })
      });

      if (!resCustom.ok) {
        var errText = await resCustom.text();
        throw new Error("API HTTP " + resCustom.status + "：" + errText.slice(0, 150));
      }

      var resJson = await resCustom.json();
      return (resJson.choices && resJson.choices[0] && resJson.choices[0].message && resJson.choices[0].message.content) || "";
    }
  }

  function callFastRepairApi(prose) {
    var cfg = getActiveApiConfig();
    if (!cfg) throw new Error("未配置 API 通道，请点击「⚙️ API 设置」选择或填写");

    var sd = null;
    try { sd = (typeof stat_data !== "undefined" && stat_data) ? stat_data : null; } catch (eSd) {}
    var curArc = (sd && sd.全局 && sd.全局.当前篇章) ? sd.全局.当前篇章 : "夏越村";

    var roster = ROSTER_DATA[curArc] || ROSTER_DATA["夏越村"];
    var varSnapshot = getCurrentVariablesSnapshot();

    var sysPrompt = "你是一个严格的Galgame状态变量计算器。根据下方的变量更新规则、格式强调、篇章人物速查及当前变量快照，为最新剧情正文生成变量补丁。\n" +
      "必须且只能输出严格的双段结构，绝不能遗漏 <Analysis> 分析标签与分析内容，绝不能遗漏 <JSONPatch> 补丁：\n" +
      "<UpdateVariable>\n<Analysis>\n" +
      "- Time passed: 剧情自然流逝推进15分钟，从 [当前时间] 变为 [新时间]。\n" +
      "- Dramatic update: No.\n" +
      "- Variable analysis:\n" +
      "  - 角色互动：[哪位角色同场/对话，好感度增减(+5)与在场状态(true/false)]\n" +
      "  - 状态结算：主角信息与环境稳定。\n" +
      "</Analysis>\n<JSONPatch>\n[\n" +
      "  {\"op\":\"replace\",\"path\":\"/时间/精确时间\",\"value\":\"新时间\"},\n" +
      "  {\"op\":\"replace\",\"path\":\"/主要角色列表/某某/好感度\",\"value\":新数值},\n" +
      "  {\"op\":\"replace\",\"path\":\"/主要角色列表/某某/在场状态\",\"value\":true}\n" +
      "]\n</JSONPatch>\n</UpdateVariable>\n\n" +
      "【规则铁律与禁令】：\n" +
      "1. 【严禁更新地点】：绝不输出 /地点 或 /主角信息/地点 操作！地点由正文剧情自然锚定，变量补丁严禁修改地点！\n" +
      "2. 【严禁清空列表】：严禁 replace 整块主要角色列表，必须使用精准原子操作路径。\n" +
      "3. 【时间流逝】：自然推进 10~20 分钟（格式 HH:mm）。\n" +
      "4. 【当前篇章】：" + curArc + "。同场主要角色：" + roster.roles + "；苦主角色：" + roster.victims + "。\n" +
      "5. 【当前变量快照基准】：\n" + varSnapshot;

    var msgs = [{ role: "user", content: "【最新楼层剧情正文】：\n" + prose + "\n\n请根据上述正文，严格输出 <UpdateVariable> 变量更新块：" }];
    return executeApiCall(cfg, msgs, sysPrompt);
  }

  function callDeepRepairApi(ctx, targetIdx, prose) {
    var cfg = getActiveApiConfig();
    if (!cfg) throw new Error("未配置 API 通道，请点击「⚙️ API 设置」选择或填写");

    var sd = null;
    try { sd = (typeof stat_data !== "undefined" && stat_data) ? stat_data : null; } catch (eSd) {}
    var curArc = (sd && sd.全局 && sd.全局.当前篇章) ? sd.全局.当前篇章 : "夏越村";
    var roster = ROSTER_DATA[curArc] || ROSTER_DATA["夏越村"];
    var varSnapshot = getCurrentVariablesSnapshot();

    var msgs = [];
    var startIdx = Math.max(0, targetIdx - 16);
    for (var i = startIdx; i <= targetIdx; i++) {
      var m = ctx.chat[i];
      if (!m) continue;
      var role = m.is_user ? "user" : "assistant";
      var txt = extractProse(messageTextOf(m));
      if (txt) msgs.push({ role: role, content: txt.slice(0, 1200) });
    }

    var sysPrompt = "你负责对当前Galgame进行全上下文深度变量推演。根据历史上下文与本轮正文，计算必须更新的变量，输出严格的格式（必须包含完整的 Analysis 分析段落）：\n" +
      "<UpdateVariable>\n<Analysis>\n" +
      "- Time passed: 剧情流逝说明\n" +
      "- Dramatic update: No.\n" +
      "- Variable analysis:\n" +
      "  - 角色互动与在场状态分析\n" +
      "</Analysis>\n<JSONPatch>\n[\n" +
      "  {\"op\":\"replace\",\"path\":\"/时间/精确时间\",\"value\":\"新时间\"}\n" +
      "]\n</JSONPatch>\n</UpdateVariable>\n\n" +
      "【规则铁律】：严禁更新任何地点路径！当前篇章：" + curArc + "。主要角色：" + roster.roles + "。当前变量参考：\n" + varSnapshot;

    return executeApiCall(cfg, msgs, sysPrompt);
  }

  async function applyOpsToStatData(ops, targetMsgIdx, finalMes) {
    if (!Array.isArray(ops) || !ops.length) return;

    function unesc(s) {
      return String(s || "").replace(/~1/g, "/").replace(/~0/g, "~");
    }

    var patchObj = {};
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (!op || !op.path) continue;
      var segs = op.path.replace(/^\//, "").split("/").map(unesc);
      if (["replace", "add", "insert"].indexOf(op.op) !== -1) {
        var cur = patchObj;
        for (var j = 0; j < segs.length - 1; j++) {
          var k = segs[j];
          if (!cur[k] || typeof cur[k] !== "object" || Array.isArray(cur[k])) cur[k] = {};
          cur = cur[k];
        }
        cur[segs[segs.length - 1]] = op.value;
      }
    }

    try {
      if (typeof writeVars === "function") {
        writeVars({ stat_data: patchObj });
      }
    } catch (eWv) {}

    try {
      var mvu = null;
      try { mvu = findMvuGlobal(); } catch (eF) {}
      if (mvu) {
        var targets = [
          { type: "chat" },
          { type: "message", message_id: "latest" }
        ];
        if (targetMsgIdx != null && targetMsgIdx >= 0) {
          targets.push({ type: "message", message_id: targetMsgIdx });
        }

        if (typeof mvu.parseMessage === "function") {
          for (var p = 0; p < targets.length; p++) {
            try {
              var oldD = (typeof mvu.getMvuData === "function") ? mvu.getMvuData(targets[p]) : null;
              if (oldD) {
                var newD = await mvu.parseMessage(finalMes, oldD);
                if (newD && typeof mvu.replaceMvuData === "function") {
                  await mvu.replaceMvuData(newD, targets[p]);
                }
              }
            } catch (eP) {}
          }
        }

        if (typeof mvu.getMvuData === "function" && typeof mvu.replaceMvuData === "function") {
          for (var t = 0; t < targets.length; t++) {
            try {
              var root = mvu.getMvuData(targets[t]);
              if (!root || typeof root !== "object") root = { stat_data: {} };
              var base = root.stat_data || root.sata_data;
              if (!base || typeof base !== "object") { base = {}; root.stat_data = base; }
              deepMergeInto(base, patchObj);
              var pr = mvu.replaceMvuData(root, targets[t]);
              if (pr && typeof pr.catch === "function") pr.catch(function () {});
            } catch (eTgt) {}
          }
        }
      }
    } catch (eMvuDeep) {}

    try {
      if (typeof insertOrAssignVariables === "function") {
        insertOrAssignVariables({ stat_data: patchObj }, { type: "chat" });
        if (targetMsgIdx != null && targetMsgIdx >= 0) {
          insertOrAssignVariables({ stat_data: patchObj }, { type: "message", message_id: targetMsgIdx });
        }
      }
    } catch (eIns) {}

    try {
      if (typeof stat_data !== "undefined" && stat_data) deepMergeInto(stat_data, patchObj);
    } catch (eSd) {}
  }

  async function runRepair(mode) {
    if (_inFlight) return;
    _inFlight = true;
    _currentTaskName = (mode === "deep") ? "🧠 全文精细补算" : "⚡ 快速轻量补算";
    _taskStartTime = Date.now();
    updateTopbarBtnState();

    setStatus("⏳ <b>正在进行 " + _currentTaskName + "...</b><br>已耗时 1 秒，正在等待模型响应，请稍候...<br><span style=\"font-size:11px;color:#94a3b8;\">(关闭窗口不会中断后台补算，完成后将自动恢复)</span>", true);

    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(function() {
      if (!_inFlight) { clearInterval(_timerInterval); return; }
      var el = getDoc().getElementById("th-mvu-status-desc");
      if (el && _inFlight) {
        var sec = Math.max(1, Math.round((Date.now() - _taskStartTime)/1000));
        el.innerHTML = "⏳ <b>正在进行 " + _currentTaskName + "...</b><br>已耗时 " + sec + " 秒，正在等待模型响应，请稍候...<br><span style=\"font-size:11px;color:#94a3b8;\">(关闭窗口不会中断后台补算，完成后将自动恢复)</span>";
      }
    }, 1000);

    var ctx = getStContext();
    var targetIdx = getLatestAIMessageIndex();
    if (!ctx || !Array.isArray(ctx.chat) || targetIdx < 0) {
      setStatus("❌ 未找到目标消息，请刷新重试", false);
      _inFlight = false;
      updateTopbarBtnState();
      return;
    }

    var targetMsg = ctx.chat[targetIdx];
    var rawText = getMsgRawText(targetIdx);
    var preservedProse = extractAndPreserveProse(rawText, targetMsg);
    var proseForAi = extractProse(preservedProse || rawText);

    try {
      var reply = "";
      if (mode === "deep") {
        reply = await callDeepRepairApi(ctx, targetIdx, proseForAi);
      } else {
        reply = await callFastRepairApi(proseForAi);
      }

      var match = reply.match(/<(?:JSONPatch|json_?patch)>([\s\S]*?)<\/(?:JSONPatch|json_?patch)>/i);
      if (!match) throw new Error("模型未返回合规的 <JSONPatch> 标签");
      var jsonStr = match[1].replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      var arr = JSON.parse(jsonStr);
      if (!Array.isArray(arr) || !arr.length) throw new Error("解析出空的补丁数组");

      var validOps = arr.filter(function(op) {
        if (!op || !op.path) return false;
        var p = String(op.path).trim();
        if (p === "/玩家位置" || p === "/地点" || p.indexOf("/主角信息/地点") === 0) return false;
        var topSeg = p.split("/")[1];
        if (["时间", "主要角色列表", "苦主列表", "全局", "主角信息"].indexOf(topSeg) === -1) return false;
        return true;
      });

      if (!validOps.length) {
        validOps = [{ op: "replace", path: "/时间/精确时间", value: advanceClock("07:40", 15) }];
      }

      var cleanBlock = buildFullUpdateVariableBlock(reply, validOps);
      await writeBackPatch(targetIdx, cleanBlock, validOps, preservedProse);

      setStatus("✅ " + _currentTaskName + "成功！已安全生成完整的 &lt;Analysis&gt; 与 &lt;JSONPatch&gt;，MVU 数据已全量驱动写入，正在恢复游玩...", false);

      var btn = _topbarBtn || getDoc().querySelector(".mvu-heal-btn") || getDoc().querySelector(".th-gal-btn-mvu-heal");
      if (btn) {
        btn.setAttribute("data-keep-status", "true");
        btn.innerHTML = "<span class=\"mvu-heal-icon\">✅</span><span class=\"mvu-heal-text\">补算完成</span>";
        setTimeout(function() {
          btn.removeAttribute("data-keep-status");
          updateTopbarBtnState();
        }, 2500);
      }

      setTimeout(function() {
        dismissSuspension();
      }, 700);
    } catch (err) {
      setStatus("❌ 补算失败：" + (err.message || err) + "<br>您可以点击「⚙️ API 设置」更换接口，或点击「⏩ 推进时间」直接继续。", false);
    } finally {
      _inFlight = false;
      if (_timerInterval) clearInterval(_timerInterval);
      updateTopbarBtnState();
    }
  }

  async function applyQuickFallback() {
    var targetIdx = getLatestAIMessageIndex();
    if (targetIdx < 0) { dismissSuspension(); return; }

    var ctx = getStContext();
    var targetMsg = ctx && ctx.chat ? ctx.chat[targetIdx] : null;
    var rawText = getMsgRawText(targetIdx);
    var preservedProse = extractAndPreserveProse(rawText, targetMsg);

    var sd = null;
    try { sd = (typeof stat_data !== "undefined" && stat_data) ? stat_data : null; } catch (eSd) {}
    var curTime = (sd && sd.时间 && sd.时间.精确时间) ? sd.时间.精确时间 : "07:40";
    var nextTime = advanceClock(curTime, 15);

    var fallbackArr = [
      { op: "replace", path: "/时间/精确时间", value: nextTime }
    ];
    var fallbackBlock = buildFullUpdateVariableBlock("", fallbackArr);

    await writeBackPatch(targetIdx, fallbackBlock, fallbackArr, preservedProse);
    setStatus("⏩ 已为您推进 15 分钟时间，已生成完整的 &lt;Analysis&gt; 分析段落并全量写入 MVU 数据，正在恢复游玩...", false);
    setTimeout(function() {
      dismissSuspension();
    }, 400);
  }

  async function writeBackPatch(msgIndex, patchXml, opsArr, preservedProse) {
    var ctx = getStContext();
    if (!ctx || !Array.isArray(ctx.chat) || msgIndex < 0 || msgIndex >= ctx.chat.length) return;

    var m = ctx.chat[msgIndex];
    if (!preservedProse) {
      var currentRaw = getMsgRawText(msgIndex);
      preservedProse = extractAndPreserveProse(currentRaw, m);
    }

    var finalMes = (preservedProse ? (preservedProse + "\n\n") : "") + patchXml;

    m.mes = finalMes;
    var swId = m.swipe_id != null ? m.swipe_id : 0;
    if (m.swipe_info && m.swipe_info[swId]) m.swipe_info[swId].mes = finalMes;
    if (m.swipes && m.swipes.length) {
      var cur = m.swipes[swId];
      if (cur && typeof cur === "object") cur.mes = finalMes;
      else m.swipes[swId] = finalMes;
    }

    try {
      if (typeof setChatMessages === "function") {
        await setChatMessages([{ message_id: msgIndex, mes: finalMes, message: finalMes }], { refresh: "none" });
      }
    } catch (eSet) {}

    try {
      if (typeof ctx.saveChat === "function") ctx.saveChat();
    } catch (eSave) {}

    if (opsArr && opsArr.length) {
      await applyOpsToStatData(opsArr, msgIndex, finalMes);
    }
  }

  function dismissSuspension() {
    _isSuspended = false;
    if (_modalEl) {
      _modalEl.style.display = "none";
    }
    updateTopbarBtnState();
  }

  async function testCustomApi() {
    var doc = getDoc();
    var resEl = doc.getElementById("th-mvu-test-res");
    var base = (doc.getElementById("th-mvu-inp-base") || {}).value || "";
    var key = (doc.getElementById("th-mvu-inp-key") || {}).value || "";
    var model = (doc.getElementById("th-mvu-inp-model") || {}).value || "gpt-4o-mini";

    if (!base || !key) {
      if (resEl) resEl.innerHTML = "<span style=\"color:#ef4444;\">请先填写接口地址与密钥</span>";
      return;
    }

    var ep = String(base).trim().replace(/\/+$/, "");
    if (!/\/chat\/completions$/.test(ep)) ep += "/chat/completions";

    if (resEl) resEl.innerHTML = "<span style=\"color:#fbbf24;\">正在测试连通性...</span>";

    var t0 = Date.now();
    try {
      var ctrl = null;
      try { ctrl = new AbortController(); } catch (e) {}
      var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, 15000);

      var res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key.trim() },
        body: JSON.stringify({ model: model.trim(), messages: [{ role: "user", content: "测试" }], max_tokens: 5 }),
        signal: ctrl ? ctrl.signal : undefined
      });
      clearTimeout(timer);

      var dt = Date.now() - t0;
      if (res.ok) {
        if (resEl) resEl.innerHTML = "<span style=\"color:#22c55e;\">✅ 连通成功！延迟 " + dt + " ms</span>";
      } else {
        var txt = await res.text();
        if (resEl) resEl.innerHTML = "<span style=\"color:#ef4444;\">❌ 连通失败 HTTP " + res.status + "：" + txt.slice(0, 80) + "</span>";
      }
    } catch (err) {
      if (resEl) resEl.innerHTML = "<span style=\"color:#ef4444;\">❌ 请求失败：" + (err.message || err) + "</span>";
    }
  }

  async function fetchCustomModels() {
    var doc = getDoc();
    var resEl = doc.getElementById("th-mvu-test-res");
    var sel = doc.getElementById("th-mvu-sel-model");
    var base = (doc.getElementById("th-mvu-inp-base") || {}).value || "";
    var key = (doc.getElementById("th-mvu-inp-key") || {}).value || "";

    if (!base || !key) {
      if (resEl) resEl.innerHTML = "<span style=\"color:#ef4444;\">请先填写地址与密钥</span>";
      return;
    }

    if (resEl) resEl.innerHTML = "<span style=\"color:#fbbf24;\">正在获取模型列表...</span>";

    try {
      var got = await fetchModelListSmart(base, key);
      var list = got.list || [];
      renderModelOptions(doc, sel, list);

      if (got.fallback) {
        /* 兜底名单：必须说清「不是我代码的问题、也不是你 Key 填错了」，
           否则玩家会以为这张表是我们瞎编的。 */
        if (resEl) {
          resEl.innerHTML = "<span style=\"color:#fbbf24;\">⚠ " + (got.noCors || "该服务商")
            + " 的 /models 接口读不到（不返回跨域头），已换成官方文档里的 "
            + list.length + " 个模型名供你直接选。"
            + "<br>这不是地址或 Key 的问题 —— 它家的对话接口可以正常用。</span>";
        }
      } else if (resEl) {
        resEl.innerHTML = "<span style=\"color:#22c55e;\">✅ 获取到 " + list.length
          + " 个模型（通道：" + got.via + "）</span>";
      }
    } catch (err) {
      if (resEl) {
        resEl.innerHTML = "<span style=\"color:#ef4444;\">获取模型失败："
          + String((err && err.message) || err) + "</span>";
      }
    }
  }

  function saveCustomConfig() {
    var doc = getDoc();
    var resEl = doc.getElementById("th-mvu-test-res");
    var base = (doc.getElementById("th-mvu-inp-base") || {}).value || "";
    var key = (doc.getElementById("th-mvu-inp-key") || {}).value || "";
    var model = (doc.getElementById("th-mvu-inp-model") || {}).value || "gpt-4o-mini";

    localStorage.setItem("thGalMvuCustomBase", base.trim());
    localStorage.setItem("thGalMvuCustomKey", key.trim());
    localStorage.setItem("thGalMvuCustomModel", model.trim());
    setApiMode("custom");

    if (resEl) resEl.innerHTML = "<span style=\"color:#22c55e;\">💾 已保存并选用专属 API 配置！</span>";
    setTimeout(function() {
      showView("main");
    }, 600);
  }

  /* ══════════════════════════════════════════════════════════
     LCS：变量块格式嗅探（嗅探时机）
     现行口径 = 「不在生成中 → 每 2 秒查一次最新楼层的变量块格式」。
     不看是谁触发的：点推进 / 切聊天 / 翻历史楼层 / swipe 换回复 /
     重新生成 / 自动续写 / 中途打断 —— 只要不在生成中就都会查到。
     唯一抑制条件：**正在生成中**（正文还在流、MVU 还没落库，此刻查必误报）。
     嗅到异常**只弹一条轻提示**，不弹自愈面板、不挂起游戏。
     ══════════════════════════════════════════════════════════ */
  var POLL_SNIFF_MS = 2000;     /* 轮询嗅探间隔 —— 每 2 秒查一次 */
  var CONFIRM_ISSUE_MS = 1900;  /* 异常需持续这么久才真弹提示（≥ 一个轮询周期，防解析未落库误报） */
  var _lcsArmed = false;        /* 本会话是否已观察过一轮生成（未武装时不嗅，免得拿历史楼层误报） */
  var _sniffedKey = "";         /* 已经查过并弹过提示的楼层 —— 同一楼不重复骚扰 */
  var _pendingKey = "";         /* 疑似格式异常的楼层（等下一轮复核） */
  var _pendingAt = 0;           /* 第一次发现异常的时刻 */
  var _hasIssue = false;        /* 最新楼层有未处理的格式异常（只亮顶栏红标，绝不弹面板） */
  var _pollAt = 0;              /* 上一次轮询嗅探的时刻（节流用） */

  function lcsMarkStreaming() {
    _lcsArmed = true;           /* 观察到一轮生成 → 之后才启用嗅探 */
    _pollAt = 0;                /* 新一轮开始：清掉节流，让生成结束那一刻立刻能查 */
  }

  /* 格式异常的唯一出口 = 弹一条轻提示。
     **绝不**再弹「🩺 MVU 变量自愈中心」面板、**绝不**挂起游戏壳 ——
     玩家真要看详情 / 真要补算时，自己点顶栏「🩺 变量自愈」按钮即可。 */
  function notifyIssue(problems) {
    try {
      var n = (problems && problems.length) ? problems.length : 1;
      showToast("⚠️ 本楼变量块格式异常（" + n + " 项）· 点顶栏「🩺 变量自愈」可查看 / 补算", 5600);
    } catch (eN) {}
  }

  /* 轮询嗅探：心跳每秒调一次，函数内按 2 秒节流。
     同一楼只弹一次（_sniffedKey 去重）—— 不会每 2 秒反复骚扰。 */
  function pollSniff(hostBusy) {
    var now = Date.now();
    if (now - _pollAt < POLL_SNIFF_MS) return;   /* 2 秒节流 */
    _pollAt = now;
    if (hostBusy) return;                        /* 生成中一律不查：正文还在流、MVU 还没落库 */
    if (_isSuspended || _inFlight) return;       /* 面板已经开着 / 正在补算 → 不重复弹 */
    if (!_lcsArmed) return;                      /* 本会话还没观察过一轮完整生成 → 不嗅 */
    var idx = getLatestAIMessageIndex();
    if (idx < 0) return;
    var key = "p" + idx;
    var rawText = getMsgRawText(idx);
    if (!rawText) return;
    var problems = checkVarFormat(rawText);
    if (_sniffedKey === key) {                   /* 这一楼已经提示过 → 只复查红标该不该熄 */
      if (problems.length === 0 && _hasIssue) { _hasIssue = false; updateTopbarBtnState(); }
      return;
    }
    if (problems.length === 0) {                 /* 格式正常 → 清掉待确认状态与红标 */
      _pendingKey = ""; _pendingAt = 0;
      if (_hasIssue) { _hasIssue = false; updateTopbarBtnState(); }
      return;
    }
    /* 二次确认：首次发现「不对劲」只记下，不立刻弹。
       长楼层 / MVU 解析慢时，正文刚落地这一刻变量块可能还没写完，
       立刻弹＝误报骚扰玩家。等它持续到下一个轮询周期仍然异常，才真弹。 */
    if (_pendingKey !== key) { _pendingKey = key; _pendingAt = now; return; }
    if (now - _pendingAt < CONFIRM_ISSUE_MS) return;
    _pendingKey = ""; _pendingAt = 0;
    _sniffedKey = key;
    try { console.log("🔎 [LCS轮询嗅探] 最新楼层变量块格式不对（" + problems.length + " 项）→ 弹轻提示"); } catch (eLg) {}
    _hasIssue = true;
    updateTopbarBtnState();
    notifyIssue(problems);
  }

  /* 事件快速通道：宿主报「生成结束」时立刻补查一次（跳过节流），不必等下一轮轮询。 */
  function markFinished() {
    _lcsArmed = true;
    _pollAt = 0;
    pollSniff(false);
  }

  var MvuApi = {
    ready: true,
    version: "standalone-v8-lcs",
    setStatusSink: function(fn) { _statusSink = (typeof fn === "function") ? fn : null; },
    clearStatusSink: function() { _statusSink = null; },
    hasPatch: function() {
      try {
        var idx = getLatestAIMessageIndex();
        if (idx < 0) return false;
        return hasCompleteMvuPatch(getMsgRawText(idx));
      } catch (e) { return false; }
    },
    repair: function(mode) {
      try { return runRepair(mode === "deep" ? "deep" : "fast"); }
      catch (e) { return Promise.reject(e); }
    },
    advanceTime: function() {
      try { return applyQuickFallback(); }
      catch (e) { return Promise.reject(e); }
    },
    isBusy: function() { return !!_inFlight; },
    getMode: function() { return getApiMode(); },
    setMode: function(m) { setApiMode(m === "custom" ? "custom" : "main"); },
    getCfg: function() {
      return {
        mode: getApiMode(),
        base: localStorage.getItem("thGalMvuCustomBase") || "",
        key: localStorage.getItem("thGalMvuCustomKey") || "",
        model: localStorage.getItem("thGalMvuCustomModel") || "gpt-4o-mini"
      };
    },
    saveCustom: function(base, key, model) {
      localStorage.setItem("thGalMvuCustomBase", String(base || "").trim());
      localStorage.setItem("thGalMvuCustomKey", String(key || "").trim());
      localStorage.setItem("thGalMvuCustomModel", String(model || "gpt-4o-mini").trim());
      setApiMode("custom");
      return true;
    },
    testApi: function(base, key, model) {
      var b = String(base || "").trim().replace(/\/+$/, "");
      if (!/\/chat\/completions$/.test(b)) b += "/chat/completions";
      return fetch(b, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
      }).then(function(r) {
        return r.text().then(function(t) {
          if (!r.ok) throw new Error("HTTP " + r.status + "：" + String(t).slice(0, 120));
          return true;
        });
      });
    },
    fetchModels: function(base, key) {
      var b = String(base || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
      return fetch(b + "/models", { method: "GET", headers: { "Authorization": "Bearer " + key } })
        .then(function(r) { return r.json(); })
        .then(function(j) {
          var out = [];
          if (j && j.data && j.data.length) {
            for (var i = 0; i < j.data.length; i++) { if (j.data[i] && j.data[i].id) out.push(j.data[i].id); }
          }
          return out;
        });
    }
  };

  try { window.__MvuApi = MvuApi; } catch (e) {}
  try { if (window.top && window.top !== window) window.top.__MvuApi = MvuApi; } catch (e) {}
  try { if (window.parent && window.parent !== window) window.parent.__MvuApi = MvuApi; } catch (e) {}

  return {
    isSuspended: function() { return _isSuspended; },
    isInFlight: function() { return _inFlight; },
    /* LCS：嗅探接口（主路 = 心跳每 1 秒调 pollSniff，函数内按 2 秒节流）
       v9 已删除旧的静默判定器 lcsFloor / lcsTick，以及随之失效的
       tick / markEnded / markInterrupted / sniffState 四个死接口。 */
    markStreaming: function() { lcsMarkStreaming(); },
    markFinished: function() { markFinished(); },
    pollSniff: function(hostBusy) { pollSniff(hostBusy); },
    /* 切聊天：清掉去重键、待确认状态与红标，免得换聊天后同楼层号漏查 */
    resetChat: function() { _sniffedKey = ""; _pendingKey = ""; _pendingAt = 0; _hasIssue = false; _lcsArmed = false; _pollAt = 0; updateTopbarBtnState(); },
    api: MvuApi,
    openManualPanel: function(shell) {
      var targetIdx = getLatestAIMessageIndex();
      var rawText = getMsgRawText(targetIdx);
      var problems = checkVarFormat(rawText);
      var valid = (problems.length === 0);
      var modal = ensureModal(shell);
      showView("main");
      /* 手动开面板 = 挂起界面刷新（与「✖ 关闭」走的 dismissSuspension 成对） */
      _isSuspended = true;
      updateTopbarBtnState();
      modal.style.display = "flex";
      try { if (shell && shell.classList && shell.classList.add) shell.classList.add("th-gal-mvu-suspended"); } catch (eSc) {}

      var closeBtn = getDoc().getElementById("th-mvu-btn-close-main");
      if (closeBtn) {
        closeBtn.style.opacity = "1";
        closeBtn.style.cursor = "pointer";
        closeBtn.title = "关闭面板（格式异常也能关，不会卡住你）";
      }

      if (_inFlight) {
        var sec = Math.max(1, Math.round((Date.now() - _taskStartTime)/1000));
        setStatus("⏳ <b>正在进行 " + _currentTaskName + "...</b><br>已耗时 " + sec + " 秒，正在等待模型响应，请稍候...<br><span style=\"font-size:11px;color:#94a3b8;\">(关闭窗口不会中断后台补算，完成后将自动恢复)</span>", true);
      } else {
        var desc = valid
          ? "🟢 <b>变量块格式正常</b><br>最新楼层：变量标签齐全、JSON 合法。（本判定只查格式，不查缺哪个变量）<br>若您认为好感度或时间数值需要重算，可选用下方两种模式重新核算。"
          : "🔴 <b style=\"color:#ef4444;\">变量块格式异常</b><br>" + formatProblemHtml(problems) + "<br>可以点下面【⚡ 快速轻量补算】补齐；也可以直接点「✖ 关闭」继续玩，不会卡住你。";
        setStatus(desc, false);
      }
    }
  };
})();

try { window.MvuSelfHealing = MvuSelfHealing; } catch (e) {}
try { if (window.top && window.top !== window) window.top.MvuSelfHealing = MvuSelfHealing; } catch (e) {}
try { if (window.parent && window.parent !== window) window.parent.MvuSelfHealing = MvuSelfHealing; } catch (e) {}
try { window.__openMvuPanel = function() { MvuSelfHealing.openManualPanel(); }; } catch (e) {}

(function bindLcsEvents() {
  function isHostBusy() {
    try {
      var doc = (window.top && window.top.document) || document;
      var stopBtn = doc.querySelector("#stop_generating") || doc.querySelector(".mes_stop");
      if (stopBtn && stopBtn.offsetParent !== null) return true;
      var sendBtn = doc.querySelector("#send_but");
      if (sendBtn && sendBtn.classList.contains("displayNone")) return true;
    } catch (e) {}
    return false;
  }

  try {
    if (window.__lcsHeartbeatTimer) clearInterval(window.__lcsHeartbeatTimer);
    /* 心跳 1 秒一发；真正的「2 秒一次」节流在 pollSniff 内部（POLL_SNIFF_MS） */
    window.__lcsHeartbeatTimer = setInterval(function() {
      if (typeof MvuSelfHealing !== "undefined" && typeof MvuSelfHealing.pollSniff === "function") {
        MvuSelfHealing.pollSniff(isHostBusy());
      }
    }, 1000);
  } catch (eHb) {}

  var targets = [];
  try { targets.push(window); } catch (e0) {}
  try { if (window.top && window.top !== window) targets.push(window.top); } catch (e1) {}
  try { if (window.parent && window.parent !== window) targets.push(window.parent); } catch (e2) {}

  targets.forEach(function(w) {
    if (w.eventOn && typeof w.eventOn === "function") {
      try {
        w.eventOn("generation_started", function() { MvuSelfHealing.markStreaming(); });
        w.eventOn("GENERATION_STARTED", function() { MvuSelfHealing.markStreaming(); });
        w.eventOn("character_message_rendered", function() { MvuSelfHealing.markStreaming(); });
        w.eventOn("CHARACTER_MESSAGE_RENDERED", function() { MvuSelfHealing.markStreaming(); });
        /* 生成结束 → 立刻补查一次（跳过节流） */
        w.eventOn("generation_stopped", function() { MvuSelfHealing.markFinished(); });
        w.eventOn("GENERATION_STOPPED", function() { MvuSelfHealing.markFinished(); });
        w.eventOn("message_received", function() { MvuSelfHealing.markFinished(); });
        w.eventOn("MESSAGE_RECEIVED", function() { MvuSelfHealing.markFinished(); });
        /* 切聊天 → 清去重键与红标，免得换聊天后同楼层号漏查 */
        w.eventOn("chat_changed", function() { MvuSelfHealing.resetChat(); });
        w.eventOn("CHAT_CHANGED", function() { MvuSelfHealing.resetChat(); });
      } catch (eEv) {}
    }

    try {
      var d = w.document;
      if (d && !d.__thMvuBridgeBound) {
        d.__thMvuBridgeBound = true;
        d.addEventListener("th-mvu-open-panel", function() { MvuSelfHealing.openManualPanel(); });
        /* v9 起不再监听「停止生成」去短路嗅探：被打断的那一楼也照查 */
        d.addEventListener("th-mvu-toast", function(ev) {
          try { showToast(ev && ev.detail ? ev.detail.message : "", ev && ev.detail ? ev.detail.ms : 1800); } catch (eTo) {}
        });
      }
    } catch (eDoc) {}
  });
})();