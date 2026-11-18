/* ============================================================
   Galgame 视觉小说对话框与动态图组系统
   功能：
   1. 宿主顶层挂载：穿透沙盒 iframe，直接渲染于酒馆主窗口。
   2. 解析 {人物名}「对白」 → 左下角 Galgame 姓名牌；有人说话时立绘微浮动。
   3. 解析 <插图>人物｜动作｜图床:URL</插图>（URL 可以省略）→
      按「人物 + 动作」查出该动作的图组，【严格按数组顺序】逐张显示。
   4. 对话框下面多一颗「▶ 下一张 n/m」按钮：**只要出图就一直显示**
      （v125：以前只有一张时整颗按钮藏起来，现在一律显示，一张也写 1/1，
        只是翻不动 —— 玩家能确认「就这一张」，而不是以为按钮坏了）。
   5. ★ v125：不再区分「单图床」「图组」——
      两者在代码里本来就是同一个数组，以前只是 UI 上把长度 1 的藏了按钮。
      现在合并成一套：有几张写几张，1 张就 1/1。
      **默认自动循环切换，1 秒一张**（到头回到第一张）；玩家可以点「⏸ 固定」
      切到手动模式（那时不再自动翻，也不会随对话推进而换图）。
      选择记在 localStorage 里，刷新页面照旧。
   6. 换动作则从第一张重新开始。
   7. ★ v99：有插图时，插图就是这一屏的「场景图」——铺满游戏视口，
      壳自己的场景图与人物立绘一并隐去；正文里没写 <插图> 标签时，
      场景图与立绘照旧显示。
      尺寸一律等比放大（以高度为主、绝不拉伸、绝不裁图），放不满的两边留黑。
   8. ★ v100：常驻读秒嗅探（每秒一拍；心跳挂在宿主 window 上，全局只有一份）。
      正文里只要出现 <插图> 标签就显示（玩家手动写进正文也算），
      标签没了就立刻收干净 —— 不再依赖「新消息到达」这一个时机。
   9. ★ v102：插图图床已从已过期的 catbox 垃圾桶迁到 a.imgckr.com（永久图床）。
      地址取自非同层版 v9.2 的世界书「插图系统」条目 —— 同一批 32 张图，
      人物与动作逐条对应（含斋宫若叶|口交 3 张）。
  10. ★ v136：所有原版插图归档为「旧插图」；新增留空的「新插图」库，
       开局第五屏或顶栏按钮可在 旧插图 / 新插图 / 新旧融合 三态间切换，
       融合时新旧两组拼一条队列；**角色没有任何新图就整套沿用旧插图**，
       角色有新图但某个动作缺图则只回退那个动作，绝不白屏。
  11. ★ v101：取正文必须读 **swipes[swipe_id]**（当前这张 swipe），不能只读 m.mes。
      这张卡第 0 楼就是 3 个 swipe（首页/乡村/公寓），
      玩家编辑的是当前那张，m.mes 未必是它 —— 只读 m.mes 会永远读不到标签。
   ============================================================ */
(function () {
  'use strict';

  var STYLE_ID = 'gal-framework-styles';
  /* ★ v99：样式只要动过就必须换版本号 —— 否则老页面上旧样式会一直赖着不走 */
  /* ★ v170：加了关闭键样式 + 外置 ✕ 归位规则，必须换号，否则玩家看到的还是旧布局 */
  /* ★ v171：加沉浸式观看（按钮 + 折叠状态卡/小地图 + 控制条飞左上角），再换一次 */
  var STYLE_VER = 'v171-20261115';
  /* ★ v100：常驻读秒嗅探的周期（毫秒）。玩家手写进正文的 <插图> 标签，
     最迟一拍（1 秒）内就会被读到并显示；删掉标签同样一拍内消失。 */
  var POLL_MS = 1000;
  var NAMEPLATE_ID = 'gal-nameplate-box';
  var CG_CONTAINER_ID = 'gal-cg-background';
  var CG_FIGURE_ID = 'gal-cg-figure';
  var NEXT_BTN_ID = 'gal-cg-next-btn';
  /* ★ v166：上一张 + 控制条容器。三颗按钮装一个 flex 容器里，
     间距交给 gap —— 以前两颗各自 absolute、各写一个 top，缩放就贴一起。 */
  var PREV_BTN_ID = 'gal-cg-prev-btn';
  var CTL_ID = 'gal-cg-ctl';
  /* ★ v170：关闭键。玩家要求「关闭按钮要弄在暂停和播放按钮的中间」
     —— 也就是控制条上「▶ 下一张」与「⏸ 暂停」之间那一格。
     内置插图和外置插图**共用这一颗**：它是个「关掉当前这套插图」的统一出口，
     点了先关外置（若开着），没有外置就关内置。见 onCloseCg()。 */
  var CLOSE_BTN_ID = 'gal-cg-close-btn';
  /* ★ v171：沉浸式观看开关。作者原话：
     「再搞个沉浸式观看插图的按钮，也就是插图出来的时候。默认地图和玩家UI折叠起来，
       此时播放按钮在最左上角。」
     语义（和作者确认过）：
       · 插图一出现就**自动**进沉浸态；
       · 玩家点这颗按钮可以**退出**，退出偏好记进 localStorage，
         以后同一台设备不再自动进（但按钮随时能手点进）；
       · 沉浸态收的是「左上角状态卡 + 右上角小地图」，
         对话框和剧情文字不动（玩家还得看台词）；
       · 收掉这两块之后，控制条才飞得进**最左上角**（本来那儿被状态卡占着）。 */
  var IMM_BTN_ID = 'gal-cg-imm-btn';
  var LS_IMM_OFF = 'gal_cg_imm_off';     /* localStorage：'1' = 玩家主动退出过，别再自动进 */
  /* 状态卡与小地图的 id —— 归 10-core.js 建，这里只负责收/放，不负责存在性 */
  var STATUS_CARD_ID = 'th-gal-status-card';
  var MINIMAP_ID = 'th-gal-minimap';
  /* ★ v125：自动循环开关按钮 + 周期 + 玩家偏好的存档键 */
  var AUTO_BTN_ID = 'gal-cg-auto-btn';
  var AUTO_MS = 1000;                    /* 默认 1 秒一张（Administrator 定的） */
  var LS_FIXED = 'gal_cg_fixed';         /* localStorage：'1' = 固定不自动 */

  var HOST = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
    return window;
  })();

  function getDoc() { return HOST.document || document; }

  /* ══════════════════════════════════════════════════════════
     图组库：键 = 「人物名|动作键」，值是【有序】图片数组。
     顺序就是你给的顺序，推进永远按这个顺序，绝不乱跳。
     ══════════════════════════════════════════════════════════ */
  var CDN = 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/image-hosting/blog/';
  var F = 'TW_%E5%8D%95LoRA_%E8%A7%92%E8%89%B2%E5%8F%82%E8%80%83_';   /* TW_单LoRA_角色参考_ */

  var GALLERY_POOLS = {
    /* ══ ★ v126：整批换成 Administrator 给的新图（jsdelivr: character-images） ══════
       一条组 = 一条队列：写几个 <插图> 标签就按顺序首尾相接，翻完这个动作接着下一个。
       排序规矩：**新套图在前、老 imgckr 单张接在末尾**（新的是连拍，连着播更顺）。
       目录名对照：meisui=吉川美穗　久美子=春日久美子　桃崎=桃崎千鹤
                   葵=春日葵　静奈=春日静奈　香本=香本千玲

       神谷奈绪 / 山上椿芽 的动作图组仍然【全删】，只留立绘（v98c、v98d 的决定没变）。
       松本美咲仍然退场，这批里没有她的图。
       ────────────────────────────────────────────────────────────────── */

    /* ── 吉川美穗 ── */
        '吉川美穗|手势前戏': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_1手圈O_002.png'],
        '吉川美穗|口交': ['https://a.imgckr.com/2026/10/13/XVJ3G.png'],
        '吉川美穗|手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_3手交_001.png', 'https://a.imgckr.com/2026/10/13/XVfJa.png'],
        '吉川美穗|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_4授乳手交_002.png'],
        '吉川美穗|乳交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_5乳交_002.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/美穗%20乳交.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/美穗%20乳交2.png', 'https://a.imgckr.com/2026/10/13/XGklR.png'],
        '吉川美穗|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_6女上男躺_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/meisui_8被后入回头_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/meisui/美穗做爱_00001_.png',
          'https://a.imgckr.com/2026/10/13/XV0xJ.png'
        ],

    /* ── 春日久美子 ── */
        '春日久美子|口交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_2口交_001.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_2口交_002.png', 'https://a.imgckr.com/2026/10/13/XGQBU.png'],
        '春日久美子|手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_3手交.png', 'https://a.imgckr.com/2026/10/13/XGSrM.png'],
        '春日久美子|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_4授乳手交_002.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_4授乳手交_104.png'],
        '春日久美子|乳交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子%20乳交.png', 'https://a.imgckr.com/2026/10/13/XGqog.png'],
        '春日久美子|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_6女上男躺_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_6女上男躺_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子%20女上位.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_7女上抱脸埋胸_002_b2.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_7女上抱脸埋胸_003.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_9被后入回头_00001_.png',
          'https://a.imgckr.com/2026/10/13/XGxya.png'
        ],

    /* ── 桃崎千鹤 ── */
        '桃崎千鹤|口交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_2口交_001.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_2口交_002.png'],
        '桃崎千鹤|手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_3手交_001.png'],
        '桃崎千鹤|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_4授乳手交_001.png'],
        '桃崎千鹤|乳交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_5乳交_001.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_5乳交_002.png'],
        '桃崎千鹤|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_6女上男躺_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_7女上抱脸埋胸_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_8被后入回头_001.png'
        ],

    /* ── 春日葵 ── */
        '春日葵|手势前戏': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_1手圈O_101.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_1手圈O_201.png'],
        '春日葵|口交': ['https://a.imgckr.com/2026/10/13/XVPJ0.png'],
        '春日葵|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_4授乳手交_104.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_4授乳手交_204.png'],
        '春日葵|乳交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_5乳交_001.png', 'https://a.imgckr.com/2026/10/13/XVsFy.png'],
        '春日葵|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_6女上男躺_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_6女上男躺_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_6女上男躺_106.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_6女上男躺_206.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_7女上抱脸埋胸_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_7女上抱脸埋胸_107.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/葵/葵_8被后入回头_002.png',
          'https://a.imgckr.com/2026/10/13/XVzD8.png'
        ],

    /* ── 春日静奈 ── */
        '春日静奈|手势前戏': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_1手圈O_101.png'],
        '春日静奈|口交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_2口交_001.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_2口交_002.png'],
        '春日静奈|手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_3手交_001.png', 'https://a.imgckr.com/2026/10/13/XVKth.png'],
        '春日静奈|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_4授乳手交_002.png'],
        '春日静奈|乳交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_5乳交_002.png', 'https://a.imgckr.com/2026/10/13/XVaLf.png'],
        '春日静奈|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_6女上男躺_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_6女上男躺_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_7女上抱脸埋胸_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/POSE3_shizuna_7女上抱脸埋胸_00001_.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈%20女上位男性脸埋胸.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/POSE3_shizuna_9被后入回头_00001_.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/POSE_shizuna_9被后入回头_00001_.png',
          'https://a.imgckr.com/2026/10/13/XV14L.png'
        ],

    /* ── 香本千玲 ── */
        '香本千玲|手势前戏': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_1手圈O_002.png'],
        '香本千玲|口交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_2口交_001.png', 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_2口交_002.png'],
        '香本千玲|手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_3手交_002.png', 'https://a.imgckr.com/2026/10/13/XVEDg.png'],
        '香本千玲|授乳手交': ['https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_4授乳手交_002.png'],
        '香本千玲|乳交': ['https://a.imgckr.com/2026/10/13/XVmvm.png'],
        '香本千玲|做爱': [
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_6女上男躺_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_6女上男躺_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_7女上抱脸埋胸_001.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_7女上抱脸埋胸_002.png',
          'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_8被后入回头_002.png',
          'https://a.imgckr.com/2026/10/13/XV4WX.png'
        ],

    /* ── 月读澪 ── */
        '月读澪|手交': ['https://a.imgckr.com/2026/10/13/XVYFe.png'],
        '月读澪|乳交': ['https://a.imgckr.com/2026/10/13/XVUYl.png'],
        '月读澪|做爱': ['https://a.imgckr.com/2026/10/13/XVigS.png'],

    /* ── 神代凛音 ── */
        '神代凛音|手交': ['https://a.imgckr.com/2026/10/13/XVjsu.png'],
        '神代凛音|乳交': ['https://a.imgckr.com/2026/10/13/XVvyq.png'],
        '神代凛音|做爱': ['https://a.imgckr.com/2026/10/13/XVXBE.png'],

    /* ── 斋宫若叶 ── */
        '斋宫若叶|口交': ['https://a.imgckr.com/2026/10/13/XVOLv.png', 'https://a.imgckr.com/2026/10/13/XVemd.png', 'https://a.imgckr.com/2026/10/13/XVTtF.png'],
        '斋宫若叶|手交': ['https://a.imgckr.com/2026/10/13/XVrvi.png'],
        '斋宫若叶|乳交': ['https://a.imgckr.com/2026/10/13/XVulC.png'],
        '斋宫若叶|做爱': ['https://a.imgckr.com/2026/10/13/XV3xK.png'],

    /* ── 西村百花 ── */
        '西村百花|口交': ['https://a.imgckr.com/2026/10/13/XVFx7.png'],
        '西村百花|乳交': ['https://a.imgckr.com/2026/10/13/XVRs5.png'],
        '西村百花|做爱': ['https://a.imgckr.com/2026/10/13/XVo2n.png'],

    /* ★ 动作键新增四个（v125 起）：手势前戏 / 做爱后入 / 坐起拥抱女上位 / 授乳手交
       「手势前戏」永远排在这一轮最前、一轮只播 1 张。 */
  };

  /* ══ ★ v153：旧插图的「做爱类」已全部统一成「做爱」══
     用户要求：「把旧插图的做爱类，全部改为做爱，和新插图统一」。
     原来一个角色的做爱图被拆成三组键（做爱女上位 / 做爱后入 / 做爱），
     新插图那边只用一个「做爱」，两套对不上 —— 切到旧插图就有三种动作查不到。
     现在：三组合成一条「人物|做爱」，
       顺序 = 女上位（连拍）→ 后入（连拍）→ 原做爱（单张），URL 去重、一张不丢。
     注意：actionKeyOf() 的语义分流**仍然保留** ——
       模型写「后入」「女上位」还是判成 '做爱后入' / '做爱女上位'，
       由 resolveGroup() 里那条硬回退把它们落到 '做爱'。这样模型怎么写都出得来图。

  /* ══ ★ v136：插图版本 ══════════════════════════════════════════════
     GALLERY_POOLS = **旧插图**（v153 已把做爱三组并成一组）。
     NEW_ART_GALLERY_POOLS = **新插图**，现在留空等 Administrator 给一整套新链接。
     填法与旧库完全一样：'人物名|动作键': ['URL1', 'URL2', ...]，
     动作键认 7 个：手势前戏 / 口交 / 手交 / 授乳手交 / 乳交 / 做爱女上位 / 做爱后入
     （好感度分档的 '人物|做爱女上位_high' / '_low' 也照旧支持）。
     三态取图（★ 两级回退，绝不白屏）：
       ① 角色级：新库里这个角色**一张新图都没有** → 该角色所有动作整套沿用旧插图
       ② 动作级：这个角色有新图、但某个动作没给 → 只有那个动作回退旧组
       旧插图   → 只用 GALLERY_POOLS
       新插图   → 新组优先；缺上述任一级就回退旧组
       新旧融合 → 同一个动作的新组 + 旧组**拼成一条队列**（新在前、旧接后，URL 去重），
                  一轮里翻完新图接着翻旧图；该角色 / 该动作没新图时就只用旧组
     所以只给一部分角色、或只给一半链接，画面都不会空。 */
  /* ★ v153：新插图实装 —— 410 张，124 组。
     源：D:\Users\Administrator\<角色>\*.png，全部已在本地剥离元数据（只剩 IHDR/IDAT/IEND）。
     动作键已对齐 09 脚本 actionKeyOf 的 7 个标准键；做爱类统一成「做爱」，偷窥保留三档。 */
  var NEW_ART_GALLERY_POOLS = {

    /* ── 春日久美子 ── */
    '春日久美子|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_13.png'
    ],
    '春日久美子|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__足交_25.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__足交_26.png'
    ],
    '春日久美子|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__手交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳+手交_22.png'
    ],
    '春日久美子|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳+手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳_24.png'
    ],
    '春日久美子|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__乳交_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__乳交_03.png'
    ],
    '春日久美子|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱尾声_14.png'
    ],
    '春日久美子|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥完全脱光_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥完全脱光_20.png'
    ],
    '春日久美子|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱内裤_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱内裤_17.png'
    ],
    '春日久美子|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥-刚脱衣服_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱衣服_18.png'
    ],

    /* ── 吉川美穗 ── */
    '吉川美穗|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕+足交前夕_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_08.png'
    ],
    '吉川美穗|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__足交_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__足交_13.png'
    ],
    '吉川美穗|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__授乳+手交_11.png'
    ],
    '吉川美穗|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__授乳+手交_11.png'
    ],
    '吉川美穗|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__乳交_01.png'
    ],
    '吉川美穗|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱尾声_09.png'
    ],
    '吉川美穗|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__偷窥刚脱内裤_10.png'
    ],

    /* ── 神谷奈绪 ── */
    '神谷奈绪|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交前夕+做爱前夕_21.png'
    ],
    '神谷奈绪|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_20.png'
    ],
    '神谷奈绪|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交+授乳_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交_16.png'
    ],
    '神谷奈绪|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交+授乳_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__授乳_17.png'
    ],
    '神谷奈绪|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__乳交_01.png'
    ],
    '神谷奈绪|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱尾声_11.png'
    ],
    '神谷奈绪|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥完全脱光_14.png'
    ],
    '神谷奈绪|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥刚脱内裤_12.png'
    ],
    '神谷奈绪|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥刚脱衣服_13.png'
    ],

    /* ── 山上椿芽 ── */
    '山上椿芽|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_16.png'
    ],
    '山上椿芽|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__足交_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__足交_25.png'
    ],
    '山上椿芽|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__手交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳+手交_22.png'
    ],
    '山上椿芽|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳+手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳_23.png'
    ],
    '山上椿芽|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__乳交_03.png'
    ],
    '山上椿芽|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱尾声_17.png'
    ],
    '山上椿芽|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥完全脱光_20.png'
    ],
    '山上椿芽|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥刚脱内裤_18.png'
    ],
    '山上椿芽|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥刚脱衣服_19.png'
    ],

    /* ── 朝仓茜野 ── */
    '朝仓茜野|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_17.png'
    ],
    '朝仓茜野|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_28.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_29.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_30.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_31.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_32.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_33.png'
    ],
    '朝仓茜野|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_24.png'
    ],
    '朝仓茜野|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_25.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_26.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_27.png'
    ],
    '朝仓茜野|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__乳交_02.png'
    ],
    '朝仓茜野|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱尾声_18.png'
    ],
    '朝仓茜野|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__偷窥完全脱光_20.png'
    ],
    '朝仓茜野|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__偷窥刚脱内裤_19.png'
    ],

    /* ── 御神木之灵 ── */
    '御神木之灵|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+手交_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+足交前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_13.png'
    ],
    '御神木之灵|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__足交_23.png'
    ],
    '御神木之灵|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+手交_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__手交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳+手交_19.png'
    ],
    '御神木之灵|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳+手交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳_20.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳_21.png'
    ],
    '御神木之灵|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__乳交_02.png'
    ],
    '御神木之灵|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱尾声_14.png'
    ],
    '御神木之灵|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱内裤_15.png'
    ],
    '御神木之灵|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱衣服_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱衣服_17.png'
    ],

    /* ── 桃崎千鹤 ── */
    '桃崎千鹤|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交前夕+做爱前夕_18.png'
    ],
    '桃崎千鹤|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_17.png'
    ],
    '桃崎千鹤|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__手交_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳+手交_14.png'
    ],
    '桃崎千鹤|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳+手交_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳_15.png'
    ],
    '桃崎千鹤|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__乳交_01.png'
    ],
    '桃崎千鹤|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱尾声_12.png'
    ],

    /* ── 水野千晴 ── */
    '水野千晴|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕+足交前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_14.png'
    ],
    '水野千晴|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__足交_22.png'
    ],
    '水野千晴|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__手交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳+手交_19.png'
    ],
    '水野千晴|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳+手交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳_20.png'
    ],
    '水野千晴|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__乳交_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__乳交_03.png'
    ],
    '水野千晴|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱尾声_15.png'
    ],
    '水野千晴|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__偷窥刚脱内裤_16.png'
    ],
    '水野千晴|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__偷窥刚脱衣服_17.png'
    ],

    /* ── 白坂结奈 ── */
    '白坂结奈|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前戏_18.png'
    ],
    '白坂结奈|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_28.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_29.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_30.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_31.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_32.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_33.png'
    ],
    '白坂结奈|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__手交_23.png'
    ],
    '白坂结奈|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_25.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_26.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_27.png'
    ],
    '白坂结奈|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__乳交_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__乳交_03.png'
    ],
    '白坂结奈|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱尾声_19.png'
    ],
    '白坂结奈|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__偷窥刚脱内裤_20.png'
    ],
    '白坂结奈|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__偷窥刚脱衣服_21.png'
    ],

    /* ── 白蔵主 ── */
    '白蔵主|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交前夕+做爱前夕_25.png'
    ],
    '白蔵主|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_24.png'
    ],
    '白蔵主|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__手交_18.png'
    ],
    '白蔵主|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__授乳_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__授乳_20.png'
    ],
    '白蔵主|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__乳交_02.png'
    ],
    '白蔵主|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱尾声_15.png'
    ],
    '白蔵主|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__偷窥洗澡刚脱内裤_16.png'
    ],
    '白蔵主|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__偷窥洗澡刚脱衣服_17.png'
    ],

    /* ── 神代凛音 ── */
    '神代凛音|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕+足交前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_17.png'
    ],
    '神代凛音|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_29.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_30.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_31.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_32.png'
    ],
    '神代凛音|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__手交_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳+手交_24.png'
    ],
    '神代凛音|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳+手交_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_25.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_26.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_27.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_28.png'
    ],
    '神代凛音|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__乳交_04.png'
    ],
    '神代凛音|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱尾声_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱结尾_19.png'
    ],
    '神代凛音|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__偷窥刚脱内裤_20.png'
    ],
    '神代凛音|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__偷窥刚脱衣服_21.png'
    ],

    /* ── 斋宫若叶 ── */
    '斋宫若叶|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕+足交前夕_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_10.png'
    ],
    '斋宫若叶|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__足交_20.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__足交_21.png'
    ],
    '斋宫若叶|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__手交_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+手交_18.png'
    ],
    '斋宫若叶|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+做爱_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+手交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳_19.png'
    ],
    '斋宫若叶|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__乳交_01.png'
    ],
    '斋宫若叶|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱尾声_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱尾声_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+做爱_17.png'
    ],
    '斋宫若叶|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥完全脱光_15.png'
    ],
    '斋宫若叶|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥刚脱内裤_13.png'
    ],
    '斋宫若叶|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥刚脱衣服_14.png'
    ],

    /* ── 春日葵 ── */
    '春日葵|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕+足交前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交前夕+做爱前夕_25.png'
    ],
    '春日葵|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交_24.png'
    ],
    '春日葵|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__手交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳+手交_22.png'
    ],
    '春日葵|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳+手交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳_23.png'
    ],
    '春日葵|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__乳交_03.png'
    ],
    '春日葵|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱尾声_13.png'
    ],
    '春日葵|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_20.png'
    ],
    '春日葵|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱内裤_14.png'
    ],
    '春日葵|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_17.png'
    ],

    /* ── 西村百花 ── */
    '西村百花|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_10.png'
    ],
    '西村百花|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__足交_22.png'
    ],
    '西村百花|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__手交_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳+手交_17.png'
    ],
    '西村百花|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳+手交_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_20.png'
    ],
    '西村百花|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__乳交_02.png'
    ],
    '西村百花|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱尾声_11.png'
    ],
    '西村百花|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥完全脱光_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥完全脱光_15.png'
    ],
    '西村百花|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥刚脱内裤_12.png'
    ],
    '西村百花|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥刚脱衣服_13.png'
    ],

    /* ── 春日静奈 ── */
    '春日静奈|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_13.png'
    ],
    '春日静奈|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_25.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_26.png'
    ],
    '春日静奈|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__手交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳+手交_20.png'
    ],
    '春日静奈|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳+手交_20.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳_21.png'
    ],
    '春日静奈|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__乳交_01.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__乳交_02.png'
    ],
    '春日静奈|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱尾声_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱尾声_15.png'
    ],
    '春日静奈|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥完全脱光_18.png'
    ],
    '春日静奈|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥刚脱内裤_16.png'
    ],
    '春日静奈|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥刚脱衣服_17.png'
    ],

    /* ── 香本千玲 ── */
    '香本千玲|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交前夕+做爱前夕_23.png'
    ],
    '香本千玲|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_22.png'
    ],
    '香本千玲|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__手交_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__手交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳+手交_19.png'
    ],
    '香本千玲|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳+手交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳_20.png'
    ],
    '香本千玲|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__乳交_01.png'
    ],
    '香本千玲|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_02.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_03.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_04.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱尾声_14.png'
    ],
    '香本千玲|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__偷窥全部脱光_15.png'
    ],
    '香本千玲|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__偷窥刚脱内裤_16.png'
    ],

    /* ── 藤宫紫苑 ── */
    '藤宫紫苑|做爱前夕': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_19.png'
    ],
    '藤宫紫苑|足交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__足交_23.png'
    ],
    '藤宫紫苑|手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手交_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交+手交_20.png'
    ],
    '藤宫紫苑|授乳手交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交+手交_20.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交_21.png'
    ],
    '藤宫紫苑|乳交': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__乳交_04.png'
    ],
    '藤宫紫苑|做爱': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_05.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_12.png'
    ],
    '藤宫紫苑|偷窥完全脱光': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥完全脱光_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥完全脱光_16.png'
    ],
    '藤宫紫苑|偷窥刚脱内裤': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥刚脱内裤_13.png'
    ],
    '藤宫紫苑|偷窥刚脱衣服': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥刚脱衣服_14.png'
    ],
  };

  function galArtSetOf() {
    var v;
    try { if (HOST && typeof HOST.__thArtOf === 'function') v = HOST.__thArtOf(); } catch (e1) {}
    try { if (!v && typeof window !== 'undefined' && typeof window.__thArtOf === 'function') v = window.__thArtOf(); } catch (e2) {}
    /* ★ v153：读不到 → 新插图（与核心脚本 thNormArt 同口径）。
       新图开箱即用，只有明确选了「旧插图」才回落老库。 */
    return v === '旧插图' ? '旧插图' : (v === '新旧融合' ? '新旧融合' : '新插图');
  }
  /* ★ 角色级回退判据：新库里有没有这个角色的任意一条非空图组 */
  function galCharHasNew(charName) {
    var pre = String(charName || '') + '|';
    for (var k in NEW_ART_GALLERY_POOLS) {
      if (!Object.prototype.hasOwnProperty.call(NEW_ART_GALLERY_POOLS, k)) continue;
      if (k.indexOf(pre) === 0 && NEW_ART_GALLERY_POOLS[k] && NEW_ART_GALLERY_POOLS[k].length) return true;
    }
    return false;
  }
  /* 三态取图 —— ★ 两套**互为兜底**，任何一态都不许出空画面。
     ⚠ 作者 00:31 明确过：玩「旧插图」的人，碰上本来就没有旧图的角色 / 动作，
       必须拿新图顶上（新图是全的）。以前那句 `if (v === '旧插图') return GALLERY_POOLS[key]`
       旧池没有就是 undefined ⇒ 那个人直接没图，这是错的。
     三个方向都要能回退：
       旧插图   → 旧图优先；旧图没有 → 新图
       新插图   → 新图优先；新图没有（角色整套 / 单个动作）→ 旧图
       新旧融合 → 两套拼一条队列（新在前、旧接后、URL 去重） */
  function poolOf(key) {
    var v = galArtSetOf();
    var op = GALLERY_POOLS[key];
    var np = NEW_ART_GALLERY_POOLS[key];
    var hasOp = !!(op && op.length);
    var hasNp = !!(np && np.length);

    if (v === '旧插图') {
      if (hasOp) return op;
      if (hasNp) return np;               /* ★ 旧图没有 → 用新图顶上 */
      return op;
    }

    if (v === '新旧融合') {
      if (!hasNp) return op;
      if (!hasOp) return np;
      var out = [], seen = {}, i;
      for (i = 0; i < np.length; i++) if (np[i] && !seen[np[i]]) { seen[np[i]] = 1; out.push(np[i]); }
      for (i = 0; i < op.length; i++) if (op[i] && !seen[op[i]]) { seen[op[i]] = 1; out.push(op[i]); }
      return out;
    }

    /* 新插图：角色整套没新图 → 旧图；该动作没新图 → 旧图 */
    if (!galCharHasNew(String(key || '').split('|')[0])) return hasOp ? op : np;
    if (hasNp) return np;
    return op;
  }
  /* 新旧库合并的键集合（只用于「未命中」时列可选动作）。
     ★ 00:31：**键永远合并** —— 旧插图模式也会用到新图兜底，
       再按版本裁掉新池的键，那批「旧池没有、新池有」的动作就查不到了。 */
  function poolKeys() {
    var out = {}, k;
    for (k in GALLERY_POOLS) if (Object.prototype.hasOwnProperty.call(GALLERY_POOLS, k)) out[k] = 1;
    for (k in NEW_ART_GALLERY_POOLS) if (Object.prototype.hasOwnProperty.call(NEW_ART_GALLERY_POOLS, k)) out[k] = 1;
    return out;
  }
  /* 队列签名带版本：局内切版本时签名必变，setQueue 会立刻重建整条队列 */
  function galArtTag() { return '[' + galArtSetOf() + ']|'; }
  try { HOST.__galArtSetOf = galArtSetOf; HOST.__galNewPools = NEW_ART_GALLERY_POOLS; HOST.__galPoolOf = poolOf; HOST.__galPoolKeys = poolKeys; } catch (eExp) {}

  /* 动作文字 → 动作键（模型怎么写都能对上）
     ★ v125：新增 4 个动作，**判定顺序很要紧** —— 长词必须先判，
       否则「授乳手交」会被「手交」截走。 */
  function actionKeyOf(actionText) {
    var a = String(actionText || '');
    /* ① 前戏：手势 O 圈吐舌头（一轮一次，且永远排最前） */
    if (a.indexOf('手势') !== -1 || a.indexOf('O圈') !== -1 || a.indexOf('o圈') !== -1 ||
        a.indexOf('Ｏ圈') !== -1 || a.indexOf('吐舌') !== -1 || a.indexOf('圈口') !== -1) return '手势前戏';
    /* ★ v166：新图池里「手势前戏」这个键已拆成「做爱前夕」与「足交」（原来塞进一个键里的图根本不是手势）。
       必须排在下面「做爱」之前 ——「做爱前夕」里就含「做爱」两字，
       不提前接住就会被当成普通做爱，去查一个不存在的图组。 */
    if (a.indexOf('足交') !== -1) return '足交';
    if (a.indexOf('前夕') !== -1) return '做爱前夕';
    /* ② 授乳手交：必须先于「手交」「乳交」（它两个词里都沾一点） */
    if (a.indexOf('授乳') !== -1 || (a.indexOf('哺乳') !== -1)) return '授乳手交';
    /* ★ v128：男性坐起、抱脸埋胸的姿势**不再单列**，一律算「女上位」。
       写「坐起拥抱女上位」「女上男躺」「骑乘」都落到下面同一个分支、同一条队列 ——
       模型怎么写都不会再分裂成两个动作。 */
    if (a.indexOf('乳交') !== -1) return '乳交';
    if (a.indexOf('口交') !== -1 || a.indexOf('舔') !== -1 || a.indexOf('吹') !== -1) return '口交';
    if (a.indexOf('后入') !== -1 || a.indexOf('背后') !== -1) return '做爱后入';
    if (a.indexOf('女上位') !== -1 || a.indexOf('骑乘') !== -1 || a.indexOf('骑在') !== -1) return '做爱女上位';
    if (a.indexOf('手交') !== -1 || a.indexOf('手活') !== -1) return '手交';
    /* 掀衣 / 掀上衣 / 露胸 这类动作：目前只有已退场的松本美咲用过，图组已撤，
       所以这里把她们归到一个不存在的动作名（脚本查不到就静默不出图，不会报错） */
    if (a.indexOf('掀') !== -1 || (a.indexOf('胸') !== -1 && a.indexOf('乳交') < 0)) return '掀衣服（已退场）';
    if (a.indexOf('事后') !== -1 || a.indexOf('余韵') !== -1 || a.indexOf('做完') !== -1) return '事后';
    /* ★ v98：裸「做爱」/「插入」单独成一个键（后入 / 女上位 已经在上面分流了），
       这样新装的 `人物|做爱` 图组才命得中；查不到该键时下面会自行回退。
       只写「做爱」而该人只有后入图组的情况，由 imageGroupFor() 再做一次回退。 */
    if (a.indexOf('做爱') !== -1 || a.indexOf('插入') !== -1) return '做爱';
    return a.trim();
  }

  /* 读某个角色的好感度（用来选女上位那一档） */
  function affectionOf(name) {
    try {
      if (typeof getvar === 'function') {
        var v = getvar('stat_data.主要角色列表.' + name + '.好感度');
        if (v !== undefined && v !== null && v !== '') return Number(v);
      }
    } catch (e) {}
    try {
      var fn = (typeof getVariables === 'function') ? getVariables : (HOST.TavernHelper && HOST.TavernHelper.getVariables);
      if (fn) {
        var g = fn({ type: 'chat' });
        var sd = g && (g.stat_data || g);
        var row = sd && sd.主要角色列表 && sd.主要角色列表[name];
        if (row && row.好感度 != null) return Number(row.好感度);
      }
    } catch (e2) {}
    try {
      var rt = (typeof stat_data !== 'undefined' && stat_data) ? stat_data : (HOST.stat_data || null);
      var r2 = rt && rt.主要角色列表 && rt.主要角色列表[name];
      if (r2 && r2.好感度 != null) return Number(r2.好感度);
    } catch (e3) {}
    return 20;
  }

  /* 查出这一条该用哪个图组（有序数组）
     ★ v125：新增的动作先看专组，没有就退到相近的老组，别让玩家「写了动作却一片黑」。
       退的顺序是有讲究的：先从「最像的」退（女上位 → 做爱），
       再退到通用（授乳手交 → 手交），最后给 null 交给调用方处理。 */
  function resolveGroup(charName, actionText) {
    var key = actionKeyOf(actionText);
    var direct = charName + '|' + key;
    if (poolOf(direct)) return { id: direct, list: poolOf(direct) };

    /* ★ v153：做爱类统一之后，这一条是**主回退**。
       旧插图库里已经没有 '人物|做爱女上位' / '人物|做爱后入' 这两个键了，
       但 actionKeyOf() 仍然会把「后入」「女上位」「骑乘」判成那两个名字
       （语义分流必须留着，否则模型写「后入」就一条都查不到）。
       所以这里统一落到 '做爱'：不管模型写后入、女上位还是裸做爱，都出这一组图。
       兼容：万一将来有人又把分档键填回来，上面的 direct 已经先命中了，不会被这条抢走。 */
    if (key === '做爱女上位' || key === '做爱后入' || key === '做爱') {
      /* 先看有没有人手工补回来的专属键（保留兼容） */
      if (key !== '做爱') {
        var aff = affectionOf(charName);
        var tier = (aff >= 60) ? '_high' : '_low';
        var byTier = charName + '|' + key + tier;
        if (poolOf(byTier)) return { id: byTier, list: poolOf(byTier) };
        var plain = charName + '|' + key;
        if (poolOf(plain)) return { id: plain, list: poolOf(plain) };
      }
      /* 硬回退到统一的「做爱」 */
      var loveKey = charName + '|做爱';
      if (poolOf(loveKey)) return { id: loveKey, list: poolOf(loveKey) };
      /* 再兜一层：老存档里可能还残留分档键，按次序试 */
      var legacy = ['做爱后入', '做爱女上位'];
      for (var li = 0; li < legacy.length; li++) {
        var lk = charName + '|' + legacy[li];
        if (poolOf(lk)) return { id: lk, list: poolOf(lk) };
      }
    }
    /* 授乳手交没有专图 → 用这个人的手交那组顶着（同一套手的动作） */
    if (key === '授乳手交') {
      var hj = charName + '|手交';
      if (poolOf(hj)) return { id: hj, list: poolOf(hj) };
    }
    return null;
  }

  var state = {
    /* ★ v125：不再只有一个 groupId —— 一轮里写了几个 <插图> 标签，
       就把它们各自的图**按标签顺序首尾相接**排成一条队列：
         口交 3 张 + 手交 1 张 → 队列 [口3, 口2, 口1, 手1]，一共 4 张，
         翻完口交接着翻手交，中途不回头、不小循环。
       单标签时队列就是那一组本身，所以「单图床 / 图组」再也不需要分开对待。 */
    queue: [],           /* [{ url, gid, char, act }] */
    queueSig: '',        /* 这一轮队列的身份，变了就从第 0 张重新开始 */
    index: 0,
    lastMsgSig: '',
    /* ★ v125：true = 固定（不自动翻）。默认 false＝自动循环 1 秒一张。
       玩家点一下「⏸ 固定」就切过来，选择记进 localStorage。 */
    autoFixed: readFixedPref()
  };

  function readFixedPref() {
    try {
      var v = HOST.localStorage && HOST.localStorage.getItem(LS_FIXED);
      return String(v || '') === '1';
    } catch (e) { return false; }
  }
  function saveFixedPref(on) {
    try { if (HOST.localStorage) HOST.localStorage.setItem(LS_FIXED, on ? '1' : '0'); } catch (e) {}
  }

  /* -------------------------------------------------------------
     样式
     ------------------------------------------------------------- */
  function ensureStyles() {
    var doc = getDoc();
    if (!doc || !doc.head) return;
    var oldStyle = doc.getElementById(STYLE_ID);
    if (oldStyle && oldStyle.getAttribute('data-ver') === STYLE_VER) return;
    if (oldStyle && oldStyle.parentNode) oldStyle.parentNode.removeChild(oldStyle);
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-ver', STYLE_VER);
    style.textContent = [
      '/* Galgame 姓名牌 */',
      '#' + NAMEPLATE_ID + ' {',
      '  position: fixed !important;',
      '  bottom: 128px !important;',
      '  left: 36px !important;',
      '  background: linear-gradient(135deg, rgba(20, 24, 38, 0.94), rgba(38, 26, 52, 0.96)) !important;',
      '  border: 1.5px solid rgba(217, 187, 122, 0.9) !important;',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.75), 0 0 16px rgba(217, 187, 122, 0.4) !important;',
      '  border-radius: 8px 22px 8px 22px !important;',
      '  padding: 6px 26px !important;',
      '  color: #fff2d6 !important;',
      '  font-size: 16px !important;',
      '  font-weight: 700 !important;',
      '  letter-spacing: 1.5px !important;',
      '  z-index: 2147483640 !important;',
      '  pointer-events: none !important;',
      '  transition: all 0.3s cubic-bezier(0.2, 0.9, 0.3, 1) !important;',
      '  backdrop-filter: blur(10px) !important;',
      '}',
      '#' + NAMEPLATE_ID + '.is-narrative {',
      '  opacity: 0.7 !important;',
      '  color: #94a3b8 !important;',
      '  border-color: rgba(148, 163, 184, 0.4) !important;',
      '  font-style: italic !important;',
      '}',
      '@keyframes gal-sprite-bob {',
      '  0% { transform: translateY(0); }',
      '  40% { transform: translateY(-10px) scale(1.015); }',
      '  100% { transform: translateY(0); }',
      '}',
      '.gal-sprite-speaking { animation: gal-sprite-bob 0.55s ease-out !important; }',
      '/* ★ v99：图组框 —— 有壳时嵌进游戏视口内部（in-shell），没壳时才退回整窗 fixed */',
      '#' + CG_CONTAINER_ID + ' {',
      '  position: fixed !important;',
      '  left: 0; top: 0; width: 100vw; height: 100vh;',
      '  z-index: 2147483630 !important;',
      '  /* ★ v99：纯黑幕 —— 只负责盖住壳的场景图、给图两侧留黑。',
      '     以前这里是 cover + blur(26px) 的「放大糊底」，图还没加载就先亮成一条近黑矩形，',
      '     那就是玩家报的那条黑条（图被墙时尤其明显）。现在这层不再自己扛图片。 */',
      '  background: #000 !important;',
      '  pointer-events: none !important;',
      '  opacity: 0 !important;',
      '  transition: opacity 0.55s ease-in-out !important;',
      '}',
      '/* ★ v93：正图层 —— 真图（运行时按真实比例决定 cover / contain，见 applyFit） */',
      '#' + CG_FIGURE_ID + ' {',
      '  position: fixed !important;',
      '  left: 0; top: 0; width: 100vw; height: 100vh;',
      '  z-index: 2147483631 !important;',
      '  object-fit: contain !important;',
      '  object-position: center center !important;',
      '  display: block;',
      '  pointer-events: none !important;',
      '  opacity: 0 !important;',
      '  transition: opacity 0.55s ease-in-out !important;',
      '}',
      '/* ★ v99：in-shell —— 07 的两层真的搬进游戏视口里，尺寸 = 视口尺寸。',
      '   层级排在 立绘(15) / 事件层(25) 之上、地点标签(45) 与对话框(80) 之下：',
      '   图是「背景」，对话框必须还能压在它上面。 */',
      '#' + CG_FIGURE_ID + '.in-shell {',
      '  position: absolute !important;',
      '  left: 0 !important; top: 0 !important;',
      '  width: 100% !important; height: 100% !important;',
      '  z-index: 35 !important;',
      '}',
      '#' + CG_FIGURE_ID + '.active { opacity: 1 !important; }',
      '#' + CG_CONTAINER_ID + '.in-shell {',
      '  position: absolute !important;',
      '  left: 0 !important; top: 0 !important;',
      '  width: 100% !important; height: 100% !important;',
      '  z-index: 34 !important;',
      '}',
      '#' + CG_CONTAINER_ID + '.active { opacity: 1 !important; }',
      'body.gal-cg-active #character, body.gal-cg-active .expression-holder, body.gal-cg-active .character-avatar {',
      '  opacity: 0 !important; transition: opacity 0.4s ease !important;',
      '}',
      '/* 图组推进按钮：只有出图时才出现，位置在对话框下面 */',
      '#' + NEXT_BTN_ID + ' {',
      '  position: fixed !important;',
      '  bottom: 84px !important;',
      '  left: 36px !important;',
      '  z-index: 2147483641 !important;',
      '  display: none;',
      '  align-items: center !important;',
      '  gap: 6px !important;',
      '  padding: 5px 16px !important;',
      '  border-radius: 6px 18px 6px 18px !important;',
      '  border: 1.5px solid rgba(217, 187, 122, 0.85) !important;',
      '  background: linear-gradient(135deg, rgba(24, 20, 36, 0.94), rgba(52, 28, 64, 0.96)) !important;',
      '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7), 0 0 12px rgba(217, 187, 122, 0.35) !important;',
      '  color: #ffeccc !important;',
      '  font-size: 13px !important;',
      '  font-weight: 700 !important;',
      '  letter-spacing: 1px !important;',
      '  cursor: pointer !important;',
      '  user-select: none !important;',
      '  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s !important;',
      '  backdrop-filter: blur(8px) !important;',
      '}',
      '#' + NEXT_BTN_ID + '.is-shown { display: flex !important; }',
      '#' + NEXT_BTN_ID + ':hover {',
      '  transform: translateY(-2px) scale(1.04) !important;',
      '  border-color: #f472b6 !important;',
      '  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.8), 0 0 18px rgba(244, 114, 182, 0.5) !important;',
      '}',
      '#' + NEXT_BTN_ID + ':active { transform: scale(0.97) !important; }',
      '#' + NEXT_BTN_ID + ' .num { font-size: 11px !important; color: #cbb894 !important; letter-spacing: 0 !important; }',
      /* ★ v125：只有 1 张时按钮照旧显示（写 1/1），但要能一眼看出「翻不动」：
         压暗 + 箭头变灰 + 不响应 hover 抬起。不是藏起来。 */
      '#' + NEXT_BTN_ID + '.is-single {',
      '  opacity: 0.62 !important;',
      '  cursor: default !important;',
      '  border-color: rgba(217, 187, 122, 0.35) !important;',
      '  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55) !important;',
      '}',
      '#' + NEXT_BTN_ID + '.is-single:hover { transform: none !important; border-color: rgba(217, 187, 122, 0.35) !important; }',
      '#' + NEXT_BTN_ID + '.is-single .arrow { opacity: 0.3 !important; }',
      /* 自动 / 固定 开关：贴在「下一张」右边，同高同风；关闭态（固定）压暗 */
      '#' + AUTO_BTN_ID + ' {',
      '  position: fixed !important;',
      '  bottom: 84px !important;',
      '  left: 190px !important;',
      '  z-index: 2147483641 !important;',
      '  display: none;',
      '  align-items: center !important;',
      '  gap: 5px !important;',
      '  padding: 5px 12px !important;',
      '  border-radius: 6px 18px 6px 18px !important;',
      '  border: 1.5px solid rgba(140, 170, 217, 0.75) !important;',
      '  background: linear-gradient(135deg, rgba(20, 24, 36, 0.94), rgba(28, 44, 64, 0.96)) !important;',
      '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7) !important;',
      '  color: #d7e6ff !important;',
      '  font-size: 12px !important;',
      '  font-weight: 700 !important;',
      '  letter-spacing: 1px !important;',
      '  cursor: pointer !important;',
      '  user-select: none !important;',
      '  backdrop-filter: blur(8px) !important;',
      '}',
      '#' + AUTO_BTN_ID + '.is-shown { display: flex !important; }',
      '/* ★ v166：自动开关不再单独定位，统一收进控制条 */',
      '#' + AUTO_BTN_ID + ':hover { border-color: #93c5fd !important; }',
      '#' + AUTO_BTN_ID + '.is-fixed {',
      '  opacity: 0.72 !important;',
      '  border-color: rgba(148, 163, 184, 0.6) !important;',
      '  color: #cbd5e1 !important;',
      '}',
      '#' + AUTO_BTN_ID + ' .dot { font-size: 10px !important; }',
      /* ★ v166：插图控制条 ——「◀ 上一张 / ▶ 下一张 n/m / ⏸ 暂停」三颗装进同一个 flex 容器。
         为什么重构：11-14 那版是两个各自 absolute 的按钮，靠
         top: calc(10px + 56px*scale) 与 calc(44px + 56px*scale) 硬算出 34px 间距，
         手机上一缩放就贴成一片；而且「搬到主角状态卡下方」只写在窄屏媒体查询里，
         宽屏照旧贴底部，玩家看到的就是「说了没改」。
         现在：一个容器 + gap 8px，绝不会互贴；容器整体落在主角状态卡正下方，
         位置由 JS（placeCtl）按卡片实测高度算，卡片变高变矮都不会压上去；
         宽屏窄屏同一套规则。容器在视口内 absolute，没有壳时切 .is-float 退回 fixed。
         z-index 47：压在图(34/35)和状态卡(46)之上、对话框(80)之下。 */
      '#' + CTL_ID + ' {',
      '  position: absolute !important;',
      '  left: 8px !important; right: auto !important;',
      '  top: 72px !important; bottom: auto !important;',
      '  z-index: 47 !important;',
      '  display: none;',
      '  align-items: center !important;',
      '  gap: 8px !important;',
      '  flex-wrap: wrap !important;',
      '  max-width: calc(100% - 16px) !important;',
      '  box-sizing: border-box !important;',
      '}',
      '#' + CTL_ID + '.is-shown { display: flex !important; }',
      '#' + CTL_ID + '.is-float {',
      '  position: fixed !important;',
      '  left: 36px !important; top: auto !important; bottom: 84px !important;',
      '  z-index: 2147483641 !important;',
      '}',
      '#' + PREV_BTN_ID + ' {',
      '  display: none;',
      '  align-items: center !important;',
      '  gap: 5px !important;',
      '  padding: 5px 14px !important;',
      '  border-radius: 18px 6px 18px 6px !important;',
      '  border: 1.5px solid rgba(217, 187, 122, 0.72) !important;',
      '  background: linear-gradient(135deg, rgba(24, 20, 36, 0.94), rgba(52, 28, 64, 0.96)) !important;',
      '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7) !important;',
      '  color: #ffeccc !important;',
      '  font-size: 13px !important;',
      '  font-weight: 700 !important;',
      '  letter-spacing: 1px !important;',
      '  cursor: pointer !important;',
      '  user-select: none !important;',
      '  backdrop-filter: blur(8px) !important;',
      '  transition: transform 0.18s, border-color 0.18s !important;',
      '}',
      '#' + PREV_BTN_ID + '.is-shown { display: flex !important; }',
      '#' + PREV_BTN_ID + ':hover { transform: translateY(-2px) !important; border-color: #f472b6 !important; }',
      '#' + PREV_BTN_ID + ':active { transform: scale(0.97) !important; }',
      /* ★ v170：关闭键。方头方脑的圆形 ✕，夹在「下一张」和「暂停」之间。
         故意做得比两侧窄（32px 见方、无文字标签）—— 它是「退出口」，
         不该和「上一张/下一张」抢视觉重量；hover 变红提示这是关闭动作。 */
      '#' + CLOSE_BTN_ID + ' {',
      '  display: none;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  width: 32px !important;',
      '  height: 30px !important;',
      '  padding: 0 !important;',
      '  border-radius: 8px !important;',
      '  border: 1.5px solid rgba(217, 187, 122, 0.72) !important;',
      '  background: linear-gradient(135deg, rgba(24, 20, 36, 0.94), rgba(52, 28, 64, 0.96)) !important;',
      '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7) !important;',
      '  color: #ffeccc !important;',
      '  font-size: 14px !important;',
      '  font-weight: 700 !important;',
      '  line-height: 1 !important;',
      '  cursor: pointer !important;',
      '  user-select: none !important;',
      '  backdrop-filter: blur(8px) !important;',
      '  transition: transform 0.18s, border-color 0.18s, color 0.18s !important;',
      '}',
      '#' + CLOSE_BTN_ID + '.is-shown { display: flex !important; }',
      '#' + CLOSE_BTN_ID + ':hover { transform: translateY(-2px) !important; border-color: #f87171 !important; color: #fca5a5 !important; }',
      '#' + CLOSE_BTN_ID + ':active { transform: scale(0.94) !important; }',
      /* ★ v166：这条必须排在最后 —— 同为一个 id（#gal-cg-ctl > *），
         写在前面会被下面 #gal-cg-next-btn 的 position:fixed 盖回去。 */
      '#' + CTL_ID + ' > * {',
      '  position: static !important;',
      '  left: auto !important; right: auto !important;',
      '  top: auto !important; bottom: auto !important;',
      '  margin: 0 !important;',
      '  box-sizing: border-box !important;',
      '}',
      /* ★ v170：外置插图那颗 ✕ 现在也住在控制条里，样式统一托管。
         它靠 inline display:none / flex 控制显隐（老代码就是这套），
         所以这里不再写 display，只补视觉与 hover，避免和 inline 打架。 */
      '#gal-ext-illust-btn {',
      '  position: static !important;',
      '  left: auto !important; right: auto !important;',
      '  top: auto !important; bottom: auto !important;',
      '  margin: 0 !important;',
      '}',
      '#gal-ext-illust-btn:hover { transform: translateY(-2px) !important; border-color: #f87171 !important; color: #fca5a5 !important; }',
      '#gal-ext-illust-btn:active { transform: scale(0.94) !important; }',
      /* ══════════ ★ v171：沉浸式观看 ══════════════════════════════════════
         作者原话：「再搞个沉浸式观看插图的按钮，也就是插图出来的时候。
                   默认地图和玩家UI折叠起来，此时播放按钮在最左上角。」
         ──────────────────────────────────────────────────────────────────
         按钮住在控制条里（末尾），不另起一块 —— 因为沉浸态下控制条会飞到
         最左上角，按钮要是挂在别处，玩家在沉浸态就找不到「退出」了。
         视觉上给它金色描边 + 比 ✕ 稍宽一点，和「翻页」三颗区分开：
         它切的是**画面模式**，不是翻页。 */
      '#' + IMM_BTN_ID + ' {',
      '  display: none;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  gap: 5px !important;',
      '  padding: 6px 12px !important;',
      '  border-radius: 999px !important;',
      '  border: 1.5px solid rgba(232, 196, 120, 0.9) !important;',
      '  background: linear-gradient(135deg, rgba(40, 30, 16, 0.94), rgba(64, 44, 20, 0.96)) !important;',
      '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7), 0 0 10px rgba(232, 196, 120, 0.22) !important;',
      '  color: #ffe6b8 !important;',
      '  font-size: 12px !important;',
      '  font-weight: 800 !important;',
      '  letter-spacing: 0.5px !important;',
      '  line-height: 1 !important;',
      '  white-space: nowrap !important;',
      '  cursor: pointer !important;',
      '  user-select: none !important;',
      '  backdrop-filter: blur(8px) !important;',
      '  transition: transform 0.18s, border-color 0.18s, color 0.18s !important;',
      '}',
      '#' + IMM_BTN_ID + '.is-shown { display: inline-flex !important; }',
      '#' + IMM_BTN_ID + ':hover { transform: translateY(-2px) !important; border-color: #fbbf24 !important; color: #fff3d6 !important; }',
      '#' + IMM_BTN_ID + ':active { transform: scale(0.96) !important; }',
      /* 已沉浸：按钮变「退出」态，压暗、不再抢眼（此刻玩家的注意力该在图和台词上） */
      '#' + IMM_BTN_ID + '.is-on {',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '  background: rgba(12, 14, 20, 0.82) !important;',
      '  color: #e6edf6 !important;',
      '  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.66) !important;',
      '}',

      /* ── 沉浸态本体：壳上挂 .th-gal-immersive ────────────────────────────
         收哪两块是作者定过的：「状态卡 + 小地图，都折叠」。对话框不动 ——
         玩家还得看台词，把对话也收了等于图在放、人在猜。
         ⚠ 状态卡必须 display:none（不是 opacity:0）：它 pointer-events 本来是 none，
           但藏不干净会继续占着左上角那块，控制条飞过去就被它压着（z-index 46 > 47？不，47 更高，
           但视觉上会叠字）。整块摘掉最干净。 */
      '.th-gal-shell-root.th-gal-immersive .th-gal-status-card {',
      '  display: none !important;',
      '}',
      /* 小地图走「折叠」而不是「隐藏」：折成那颗 40px 朱印圆，
         想要地图的玩家还能点开（这是「折叠」二字的原意）。
         形态复用 .is-mm-folded，不在这里重写一套 40px 圆 —— 见 JS 里 immersiveApply()。 */
      '.th-gal-shell-root.th-gal-immersive .th-gal-minimap {',
      '  opacity: 0.62 !important;',
      '  transition: opacity 0.22s ease !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive .th-gal-minimap:hover {',
      '  opacity: 1 !important;',
      '}',
      /* 沉浸态时把「展开顶栏」那颗拉手也压下去 —— 它钉在右边中间，
         是常驻可点的，会破坏沉浸感。留在原地但变淡，想点还是点得到。 */
      '.th-gal-shell-root.th-gal-immersive .th-gal-hud-grip {',
      '  opacity: 0.18 !important;',
      '  transition: opacity 0.22s ease !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive .th-gal-hud-grip:hover {',
      '  opacity: 1 !important;',
      '}',
      /* ★ 控制条飞最左上角。left/top 走 inline（placeCtl 里 setProperty important），
         这里只负责「过渡」——有过渡才像「飞过去」，而不是瞬移一下。
         过渡只给 top/left，别给 transform：控制条自己是定位上下文。 */
      '#' + CTL_ID + '.is-immersive {',
      '  transition: top 0.24s ease, left 0.24s ease !important;',
      '}',
      /* ★ 沉浸态下控制条必须**紧凑**：五颗（◀ ▶ ✕ ⏸ 🖼）横排，
         按原尺寸算 ≈355px，手机竖屏视口内只有 ~359px —— 刚好卡线，
         随便一个字变宽就换行成两行、把图压掉一块。
         这里把 padding / gap / 字号一起收紧，实测能塞进 320px 以内。
         文字不删（删了玩家认不出哪颗是哪颗），只缩比例。 */
      '.th-gal-shell-root.th-gal-immersive #' + CTL_ID + ' {',
      '  gap: 6px !important;',
      '  max-width: calc(100% - 16px) !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive #' + CTL_ID + ' > * {',
      '  font-size: 11.5px !important;',
      '  padding: 5px 9px !important;',
      '  letter-spacing: 0 !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive #' + CLOSE_BTN_ID + ' {',
      '  width: 28px !important;',
      '  height: 27px !important;',
      '  padding: 0 !important;',
      '  font-size: 13px !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive #' + IMM_BTN_ID + ' {',
      '  padding: 5px 10px !important;',
      '  font-size: 11.5px !important;',
      '}',
      /* ★ 沉浸态控制条半透明：它现在压在图的最左上角（作者要求的位置），
         实心一块会硬生生削掉画面一角。默认 .86 透明，悬停回 1 ——
         不挡视线，但想点时又看得清。
         ⚠ 只给 opacity，不给 visibility/pointer-events：必须一直点得到。 */
      '.th-gal-shell-root.th-gal-immersive #' + CTL_ID + ' {',
      '  opacity: 0.88 !important;',
      '  transition: top 0.24s ease, left 0.24s ease, opacity 0.2s ease !important;',
      '}',
      '.th-gal-shell-root.th-gal-immersive #' + CTL_ID + ':hover {',
      '  opacity: 1 !important;',
      '}',
      /* 手机上再收一档：把「沉浸观看」写成纯图标 + 更短的字 */
      '@media (max-width: 420px) {',
      '  .th-gal-shell-root.th-gal-immersive #' + CTL_ID + ' > * { font-size: 11px !important; padding: 4px 7px !important; }',
      '  .th-gal-shell-root.th-gal-immersive #' + CTL_ID + ' .label { font-size: 11px !important; }',
      '  .th-gal-shell-root.th-gal-immersive #' + NEXT_BTN_ID + ' .num { font-size: 10px !important; }',
      '}',
      /* ★ 极窄屏（≤360px）：五颗按钮按原尺寸排是 332px，而 320 视口只有 304px 可用
         —— 「沉浸观看」会被挤到第二行、孤零零一个，比藏掉难看多了。
         这里把它的文字收掉只留图标（沉浸态下图标本来就是 ✕，语义够清楚），
         省下来的 ~48px 刚好让五颗排回一行。title 里仍写着完整说明。 */
      '@media (max-width: 360px) {',
      '  .th-gal-shell-root.th-gal-immersive #' + IMM_BTN_ID + ' .imm-label { display: none !important; }',
      '  .th-gal-shell-root.th-gal-immersive #' + IMM_BTN_ID + ' { padding: 4px 8px !important; }',
      '}',
    ].join('\n');
    doc.head.appendChild(style);
  }

  /* 游戏视口（壳里那个框）：图组框与下一张按钮都搬到这里面 */
  function shellViewport() {
    try {
      var s = getDoc().getElementById('th-gal-shell-root');
      return (s && s.querySelector) ? s.querySelector('.th-gal-shell-viewport') : null;
    } catch (e) { return null; }
  }

  /* ══ 图组框与推进按钮：挂在 body 上（fixed），不上不下地把图和对话框分开 ══
     这是 Administrator 确认"不卡死"的那一版：图组框按游戏视口摆位，
     高度在对话框上沿停住，两者谁也不压谁。 */
  function shellViewport() {
    try {
      var s = getDoc().getElementById('th-gal-shell-root');
      return (s && s.querySelector) ? s.querySelector('.th-gal-shell-viewport') : null;
    } catch (e) { return null; }
  }

  function ensureDOM() {
    var doc = getDoc();
    if (!doc || !doc.body) return;
    if (!doc.getElementById(NAMEPLATE_ID)) {
      var np = doc.createElement('div');
      np.id = NAMEPLATE_ID;
      np.textContent = '...';
      doc.body.appendChild(np);
    }
    if (!doc.getElementById(CG_CONTAINER_ID)) {
      var cg = doc.createElement('div');
      cg.id = CG_CONTAINER_ID;
      doc.body.appendChild(cg);
    }
    if (!doc.getElementById(CG_FIGURE_ID)) {
      var fg = doc.createElement('img');
      fg.id = CG_FIGURE_ID;
      fg.alt = '';
      fg.decoding = 'async';
      doc.body.appendChild(fg);
    }
    /* ★ v166：控制条容器。三颗按钮都挂它里面，位置只由容器决定。 */
    if (!doc.getElementById(CTL_ID)) {
      var ctl = doc.createElement('div');
      ctl.id = CTL_ID;
      doc.body.appendChild(ctl);
    }
    var ctlBox = doc.getElementById(CTL_ID);
    /* ★ v166：上一张。到头（第 1 张）再点回最后一张，和「下一张」到末尾回第一张对称。 */
    if (!doc.getElementById(PREV_BTN_ID)) {
      var pbtn = doc.createElement('div');
      pbtn.id = PREV_BTN_ID;
      pbtn.innerHTML = '<span class="arrow">◀</span><span class="label">上一张</span>';
      pbtn.onclick = function (e) {
        e.stopPropagation();
        stepGallery(-1, true);
      };
      if (ctlBox) ctlBox.appendChild(pbtn); else doc.body.appendChild(pbtn);
    }
    if (!doc.getElementById(NEXT_BTN_ID)) {
      var btn = doc.createElement('div');
      btn.id = NEXT_BTN_ID;
      btn.innerHTML = '<span class="arrow">▶</span><span class="label">下一张</span><span class="num"></span>';
      btn.onclick = function (e) {
        e.stopPropagation();
        stepGallery(1, true);
      };
      if (ctlBox) ctlBox.appendChild(btn); else doc.body.appendChild(btn);
    }
    /* ★ v125：自动 / 固定 开关。点了就切模式并存偏好，不用刷新页面。 */
    if (!doc.getElementById(AUTO_BTN_ID)) {
      var abtn = doc.createElement('div');
      abtn.id = AUTO_BTN_ID;
      abtn.innerHTML = '<span class="dot">⏸</span><span class="label">暂停</span>';
      abtn.onclick = function (e) {
        e.stopPropagation();
        state.autoFixed = !state.autoFixed;
        saveFixedPref(state.autoFixed);
        paintAutoBtn();
        restartAutoTimer();
      };
      if (ctlBox) ctlBox.appendChild(abtn); else doc.body.appendChild(abtn);
    }
    /* ★ v170：关闭键。**必须建在「暂停」之后、但要插到它前面** ——
       玩家要的位置是「下一张 | ✕关闭 | 暂停」，而暂停键在上面那一步已经 append 过了。
       所以这里用 insertBefore(close, autoBtn) 把它塞进中间，而不是 appendChild。
       ★ 幂等：已经是这个位置就一个字节都不动，否则每次 ensureDOM 都会重排一次、
         白白触发 MutationObserver 抖一下。 */
    if (!doc.getElementById(CLOSE_BTN_ID)) {
      var cbtn = doc.createElement('div');
      cbtn.id = CLOSE_BTN_ID;
      cbtn.innerHTML = '<span class="x">✕</span>';
      cbtn.title = '关闭插图（关掉后可在面板「🖼 重新打开插图」找回）';
      cbtn.onclick = function (e) {
        e.stopPropagation();
        onCloseCg();
      };
      if (ctlBox) {
        var autoEl = doc.getElementById(AUTO_BTN_ID);
        if (autoEl && autoEl.parentNode === ctlBox) ctlBox.insertBefore(cbtn, autoEl);
        else ctlBox.appendChild(cbtn);
      } else {
        doc.body.appendChild(cbtn);
      }
    }
    /* ★★ v171：沉浸式观看开关。
       作者原话：「再搞个沉浸式观看插图的按钮，也就是插图出来的时候。
                 默认地图和玩家UI折叠起来，此时播放按钮在最左上角。」
       放在控制条**最后一格**（暂停键右边）：它切的是画面模式，
       和「上一张/下一张/✕/暂停」这一排操作不是一个类别，靠边站最不碍事。
       ⚠ 必须是控制条的孩子。沉浸态控制条整体飞到左上角，
         按钮要是不在条里，玩家进了沉浸就找不到「退出」了。 */
    if (!doc.getElementById(IMM_BTN_ID)) {
      var ibtn = doc.createElement('div');
      ibtn.id = IMM_BTN_ID;
      ibtn.innerHTML = '<span class="imm-ico">🖼</span><span class="imm-label">沉浸观看</span>';
      ibtn.title = '藏起地图与状态卡，把画面让给插图（再点一次退出）';
      ibtn.onclick = function (e) {
        e.stopPropagation();
        toggleImmersive();
      };
      if (ctlBox) ctlBox.appendChild(ibtn); else doc.body.appendChild(ibtn);
    }
    /* ★ v166：热更后旧页面里三颗按钮还挂在 body 上（旧脚本建的），
       这里统一收进容器，不然它们会继续漂在底部叠字。 */
    if (ctlBox) {
      var kids = [doc.getElementById(PREV_BTN_ID), doc.getElementById(NEXT_BTN_ID),
                  doc.getElementById(CLOSE_BTN_ID), doc.getElementById(AUTO_BTN_ID),
                  doc.getElementById(IMM_BTN_ID)];
      for (var ki = 0; ki < kids.length; ki++) {
        var kd = kids[ki];
        if (kd && kd.parentNode !== ctlBox) { try { ctlBox.appendChild(kd); } catch (eK) {} }
      }
      /* ★ v170：顺序也要守住 —— 上面这段 appendChild 是「补漏」，
         万一关闭键被追加到了最后（暂停键后面），这里再摆正一次。
         只在位置不对时动，避免每拍都重排。 */
      try {
        var cEl = doc.getElementById(CLOSE_BTN_ID), aEl = doc.getElementById(AUTO_BTN_ID);
        var nEl = doc.getElementById(NEXT_BTN_ID);
        if (cEl && aEl && cEl.nextSibling !== aEl) ctlBox.insertBefore(cEl, aEl);
        else if (cEl && nEl && !aEl && cEl.previousSibling !== nEl) ctlBox.insertBefore(cEl, nEl.nextSibling);
      } catch (eOrd) {}
    }
  }

  /* ★ v125：开关按钮的文案 —— 说的是「现在是什么模式」，不是「点了会怎样」，
     免得玩家看着「固定」两个字以为当前已经固定了。 */
  /* ★★ v170：**统一的「关闭插图」出口。**
     玩家原话：「插图无法关上，关闭按钮要弄在暂停和播放按钮的中间」。

     以前的问题：内置插图（卡里自带图组）**根本没有关闭键** ——
     控制条上只有「上一张 / 下一张 / 暂停」，想关只能去齿轮面板找开关，
     而那个开关藏得深，玩家会直接判定"关不掉"。外置插图有个 ✕，但钉在右上角。

     现在一颗键管两套，按「当前真正在显示哪一套」决定关谁：
       ① 外置开着且有图 → 关外置（它的图层在内置之上，玩家看到的就是它）
       ② 否则 → 关内置（写 SPR_ILLUST_ON=off，paint() 会把整层收干净）
     两套都关完还留着图是不可能的 —— 这就是「关得掉」的保证。

     ★ 为什么不一次全关：外置关掉后内置会**原地接着播**（extRender 的 yieldCg 只藏不销毁），
       一起关掉的话玩家点一下就没图了，想回来看还得两个开关都打开，太粗暴。
       先关看得见的那个，再点一次才关另一个 —— 符合直觉。 */
  function onCloseCg() {
    var did = '';
    try {
      /* ① 外置优先：它 z-index 70 压在内置之上，玩家眼里的「这张图」就是它 */
      if (typeof extOn !== 'undefined' && extOn && extQueue && extQueue.length) {
        extOn = false;
        try { HOST.localStorage.setItem('SPR_EXT_ILLUST', 'off'); } catch (e1) {}
        extQueue = []; extIdx = 0;
        try { extRender(); } catch (e2) {}
        try { extPaintBtn(); } catch (e3) {}
        did = 'ext';
      } else {
        /* ★ 2026-11-18：内置插图**不再可关**（作者：插图默认打开，无论如何都是默认打开，
           这颗开关只用来把关掉的打开，不是给玩家关插图用的）。
           以前这里写 SPR_ILLUST_ON=off —— 作者就是这么把插图关掉的，
           然后第二天打开游戏发现"插图完全不识别"，白查半天。
           现在只提示，不写任何"关"的状态。 */
        did = 'builtin-keep';
      }
    } catch (e) {}

    try {
      extToast(did === 'ext' ? '🖼 外置插图已关闭（可在面板重新打开）'
        : (did === 'builtin-keep' ? '🖼 插图是常开的（这颗开关只用来把关掉的打开）'
          : '🖼 外置插图已关闭（可在面板重新打开）'));
    } catch (eT) {}
    /* 通知 10-core 那边同步面板上「重新打开插图」的可用状态 */
    try { if (HOST.__thSyncExtIllustBtn) HOST.__thSyncExtIllustBtn(); } catch (eS) {}
    return did;
  }

  function paintAutoBtn() {
    var doc = getDoc();
    var b = doc.getElementById(AUTO_BTN_ID);
    if (!b) return;
    var lab = b.querySelector('.label');
    var dot = b.querySelector('.dot');
    /* ★ v166：改成播放器语义 —— 玩家口里就叫它「暂停」。
       正在自动翻：显示「暂停」（点了就停）；已经停了：显示「继续」（点了就接着翻）。
       以前写「自动 1 秒 / 固定」，描述的是当前状态，玩家得先猜一下点了会怎样。 */
    if (state.autoFixed) {
      if (b.classList) b.classList.add('is-fixed');
      if (lab) lab.textContent = '继续';
      if (dot) dot.textContent = '▶';
    } else {
      if (b.classList) b.classList.remove('is-fixed');
      if (lab) lab.textContent = '暂停';
      if (dot) dot.textContent = '⏸';
    }
  }

  /* ★ v125：自动循环的心跳。全局只有一份（挂在宿主 window 上），
     脚本热更不会叠出一堆定时器。
     只在「自动 + 这一轮队列超过 1 张」时才真的推进；否则空转也不做事。 */
  function restartAutoTimer() {
    try {
      if (HOST.__galAutoTimer) { clearInterval(HOST.__galAutoTimer); HOST.__galAutoTimer = null; }
    } catch (eClr) {}
    if (state.autoFixed) return;             /* 固定模式：根本不起定时器 */
    try {
      HOST.__galAutoTimer = setInterval(function () {
        try {
          var q = state.queue || [];
          if (q.length <= 1) return;          /* 1 张不循环（翻也翻不动） */
          if (state.autoFixed) return;
          stepGallery(1, true);
        } catch (eTick) {}
      }, AUTO_MS);
    } catch (eSet) {}
  }

  /* ══ ★ v99：把图组框嵌进游戏视口内部 ══
     以前这里是「贴 body 的 fixed + 高度砍到对话框上沿」，图被挤得很小（玩家说「没铺满」）。
     现在直接把两层搬进 .th-gal-shell-viewport，用 absolute + 100% 跟视口同尺寸：
     视口多大图就多大，多余的边由视口的 overflow:hidden 收掉。
     没有壳（在聊天区裸看）时才退回整窗 fixed。 */
  /* ══════════ ★ v171：沉浸式观看 ══════════════════════════════════════════
     作者原话：「再搞个沉浸式观看插图的按钮，也就是插图出来的时候。
               默认地图和玩家UI折叠起来，此时播放按钮在最左上角。」

     ── 设计（三件事，别混） ───────────────────────────────────────────────
     ① **默认自动进**：插图一出来就折。作者要的「默认」就是这个意思 ——
        玩家不该为了看图先去点一个按钮。
     ② **退出会被记住**：点「退出沉浸」后写 localStorage，
        以后同一台设备不再自动进。否则每个图组都强行折一次，
        玩家会觉得「我自己关掉的东西怎么又自己开了」。
        （这是和作者确认过的语义：自动进，但可记住退出。）
     ③ **手动永远可用**：不管记不记得退出，控制条上那颗按钮随时能点，进出都行。

     ── 收哪两块（也是作者定的） ───────────────────────────────────────────
     · 左上角玩家状态卡（#th-gal-status-card）→ display:none（整块摘掉）
     · 右上角小地图（#th-gal-minimap）→ 折成 40px 朱印圆（**折叠**，不是隐藏：
       想要地图的玩家还能点开，这才是「折叠」二字的本意）
     · 对话框与台词**不动** —— 玩家还得看剧情，把对话也收了就是图在放、人在猜。

     ── 为什么不用 display:none 收小地图 ───────────────────────────────────
     小地图已有成熟的折叠机制（.is-mm-folded，v155，状态存 localStorage）。
     再写一套「隐藏」会得到两个互不相干的开关：玩家点过沉浸的折叠、
     又自己展开过地图，退出沉浸时该恢复成哪个？—— 必有一方说错。
     所以沉浸态**只驱动那一套**：进的时候记下玩家原本的折叠状态，
     强折；退的时候还原回去。一个状态源，不会打架。 */
  var _immRestoreMm = null;     /* 进沉浸前小地图的折叠态；null = 没记过 */

  function immPrefOff() {
    try { return HOST.localStorage.getItem(LS_IMM_OFF) === '1'; } catch (e) { return false; }
  }
  function immPrefSetOff(off) {
    try { HOST.localStorage.setItem(LS_IMM_OFF, off ? '1' : '0'); } catch (e) {}
  }
  function immIsOn() {
    try {
      var sh = getDoc().getElementById('th-gal-shell-root');
      return !!(sh && sh.classList && sh.classList.contains('th-gal-immersive'));
    } catch (e) { return false; }
  }

  /* 小地图：取/设折叠态。**优先用 10-core.js 暴露的函数**，
     这样内存兜底（TH_MM_FOLD_MEM）由它维护，我只调不猜。
     ⚠ 设的时候必须用 thMmPreviewFold（不写 localStorage 的那个）——
       沉浸态强折是「临时效果」，用正式版会把玩家的地图偏好改成「折叠」，
       他中途刷新一次就永久折着、自己都找不到是怎么变的。
     拿不到那几个函数（10-core 还没跑 / 文字版没这套）时，
     退回直接改 class —— 至少视觉上是对的。 */
  function immMmGet() {
    try {
      if (typeof HOST.thMmIsFolded === 'function') return !!HOST.thMmIsFolded();
    } catch (e1) {}
    try {
      var mm = getDoc().getElementById(MINIMAP_ID);
      if (mm && mm.classList) return mm.classList.contains('is-mm-folded');
    } catch (e2) {}
    return false;
  }
  function immMmSet(fold) {
    try {
      if (typeof HOST.thMmPreviewFold === 'function') { HOST.thMmPreviewFold(!!fold); return; }
    } catch (e1) {}
    try {
      var mm = getDoc().getElementById(MINIMAP_ID);
      if (mm && mm.classList) mm.classList.toggle('is-mm-folded', !!fold);
    } catch (e2) {}
  }

  /* 真正把沉浸态落到界面上。on=true 进、false 出。幂等，随便重复调。 */
  function immersiveApply(on) {
    var doc = getDoc();
    var shell = null;
    try { shell = doc.getElementById('th-gal-shell-root'); } catch (e0) {}

    /* 小地图的「原状」只在**进入那一刻**记一次。
       不记的话：进出两次之后，玩家自己原本展开的地图会被永久折着 —— 那是篡改玩家设置。 */
    if (on) {
      if (_immRestoreMm === null) {
        try { _immRestoreMm = immMmGet(); } catch (eG) { _immRestoreMm = false; }
      }
      immMmSet(true);
    } else {
      if (_immRestoreMm !== null) {
        try { immMmSet(_immRestoreMm); } catch (eR) {}
        _immRestoreMm = null;
      }
    }

    /* 壳类：状态卡 display:none 靠它。壳不在（文字版 / 裸看）时照样不影响 —— 
       没有状态卡就没有可收的东西，但按钮文案得对，所以类还是照挂。 */
    try {
      if (shell && shell.classList) shell.classList.toggle('th-gal-immersive', !!on);
    } catch (eS) {}

    /* 控制条挪位：placeCtl 读壳上的类决定去 8/8 还是状态卡下方 */
    try { placeCtl(); } catch (eP) {}
    /* ★ 退出沉浸时状态卡刚从 display:none 回来，**同一帧里量不到高度**
       （cr.height 会是 0），placeCtl 就会退回 72px 常量 ——
       于是控制条跳到「状态卡下方」时压住了卡片。
       下一帧再量一次就准了。只用 rAF，不挂 setTimeout（rAF 跟着渲染走，页签切走不会乱跑）。 */
    if (!on) {
      try {
        (HOST.requestAnimationFrame || window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(
          function () { try { placeCtl(); } catch (eP2) {} }
        );
      } catch (eRaf) {}
    }

    /* 按钮自己的形态（「沉浸观看」↔「退出沉浸」） */
    paintImmBtn();
  }

  function paintImmBtn() {
    var doc = getDoc();
    var b = doc.getElementById(IMM_BTN_ID);
    if (!b) return;
    var on = immIsOn();
    if (b.classList) b.classList.toggle('is-on', on);
    var ico = b.querySelector('.imm-ico');
    var lab = b.querySelector('.imm-label');
    if (ico) ico.textContent = on ? '✕' : '🖼';
    if (lab) lab.textContent = on ? '退出沉浸' : '沉浸观看';
    b.title = on
      ? '退出沉浸：地图与状态卡回到原来那样'
      : '藏起地图与状态卡，把画面让给插图（再点一次退出）';
  }

  /* 玩家点了这颗按钮 —— 这是**明确的意图**，所以两种情况的偏好都要写：
     进 → 清掉「别再自动进」；出 → 记上「别再自动进」。 */
  function toggleImmersive() {
    var willOn = !immIsOn();
    if (willOn) immPrefSetOff(false);
    else immPrefSetOff(true);
    immersiveApply(willOn);
  }

  /* 出图时调用：按偏好决定要不要自动进。
     ★ 只在「真的开始出图」那一刻调一次，不要放进每秒的 paint 轮询里 ——
       那样玩家手动退出后，下一秒轮询又把它推进去，按钮等于坏了。 */
  function immersiveAutoEnter() {
    if (immPrefOff()) return;            /* 玩家明确退出过：尊重 */
    if (immIsOn()) return;               /* 已经在里面了：幂等，别重复记原状 */
    immersiveApply(true);
  }

  /* 图没了 / 玩家关掉插图：一定要退出来，并且**不写偏好**（这不是玩家的选择）。
     否则下次出图就进不去了。 */
  function immersiveAutoExit() {
    if (!immIsOn()) return;
    immersiveApply(false);
  }

  /* ★ v171：当前**任一**插图通道是否在显示。
     两套插图（内置 SPR_ILLUST_ON / 外置 SPR_EXT_ILLUST）必须一起判 ——
     只认内置的话，玩家开着智绘姬那种外置图时，沉浸态会立刻被 paint 判成「没图」而退出，
     表现就是「点了沉浸，一秒后自己弹回去」。 */
  function anyIllustShown() {
    try { if (illustEnabled() && (state.queue || []).length) return true; } catch (e1) {}
    try { if (typeof extOn !== 'undefined' && extOn && extQueue && extQueue.length) return true; } catch (e2) {}
    return false;
  }

  /* 唯一的「该不该沉浸」判据。两个方向都收在这里：
       · 有图 → 没被玩家否决就进（否决过一次就再也不自动进，但手点仍然有效）
       · 没图 → 一定退出，且不写偏好
     任何会改变「有没有图」的地方都调它，不要各自实现一套判断。 */
  function immersiveSync() {
    if (anyIllustShown()) immersiveAutoEnter();
    else immersiveAutoExit();
  }

  /* ★ v166：把控制条放在主角状态卡正下方。
     为什么必须实测：状态卡里有名字 / 日期 / 金钱三行，字号跟着 --ui-scale 走，
     高度不是常数（手机小屏更矮、桌面更宽更扁）。写死一个 top 迟早压上去。
     没有状态卡（壳没渲染 / 玩家还没开局）时退回 72px 的固定值。
     坐标系：优先用 offsetParent（就是 .th-gal-shell-viewport），
     拿不到时退回两个 rect 相减，再退不回就用常量。 */
  function placeCtl() {
    try {
      var doc = getDoc();
      var ctl = doc.getElementById(CTL_ID);
      if (!ctl) return;
      /* 没壳时走 .is-float（fixed 贴底），不能写 top，不然会把 bottom 起生效的定位打死 */
      if (ctl.classList && ctl.classList.contains('is-float')) return;
      /* ★★ v171：沉浸态 —— 控制条进**最左上角**（作者原话「此时播放按钮在最左上角」）。
         为什么能进：沉浸态把左上角状态卡整块摘掉了（display:none），
         那块 8px/8px 的位置本来就是空的了。
         这里写 left/top 都得带 important，基础规则里 left:8px / top:72px 都带 important。
         8px 是与状态卡原来的 left 对齐、也和场景名对齐，视觉上贴齐左边界。 */
      var imm = false;
      try {
        var sh = doc.getElementById('th-gal-shell-root');
        imm = !!(sh && sh.classList && sh.classList.contains('th-gal-immersive'));
      } catch (eImm) {}
      if (imm) {
        if (ctl.classList) ctl.classList.add('is-immersive');
        ctl.style.setProperty('left', '8px', 'important');
        ctl.style.setProperty('top', '8px', 'important');
        ctl.style.setProperty('right', 'auto', 'important');
        ctl.style.setProperty('bottom', 'auto', 'important');
        return;
      }
      if (ctl.classList) ctl.classList.remove('is-immersive');
      var card = doc.getElementById('th-gal-status-card');
      var top = 0;
      var host = ctl.offsetParent || ctl.parentNode;
      if (card && host && host.getBoundingClientRect && card.getBoundingClientRect) {
        var cr = card.getBoundingClientRect();
        var hr = host.getBoundingClientRect();
        if (cr.height > 0) top = Math.round(cr.bottom - hr.top + 8);
      }
      if (!(top > 0)) top = 72;
      /* ★ 必须带 important：基础规则里写的是 top: 72px !important，
         行内样式不带 important 根本压不过它（这是上一版改了不生效的典型坑）。 */
      ctl.style.setProperty('left', '8px', 'important');
      ctl.style.setProperty('top', top + 'px', 'important');
      ctl.style.setProperty('right', 'auto', 'important');
      ctl.style.setProperty('bottom', 'auto', 'important');
    } catch (e) {}
  }

  function syncCgRect() {
    var doc = getDoc();
    var box = doc.getElementById(CG_CONTAINER_ID);
    var fig = doc.getElementById(CG_FIGURE_ID);
    if (!box) return;
    var vp = null;
    try {
      var shell = doc.getElementById('th-gal-shell-root');
      vp = (shell && shell.querySelector) ? shell.querySelector('.th-gal-shell-viewport') : null;
    } catch (e) { vp = null; }

    var ctl = doc.getElementById(CTL_ID);

    if (vp) {
      try { if (box.parentNode !== vp) vp.appendChild(box); } catch (e1) {}
      try { if (fig && fig.parentNode !== vp) vp.appendChild(fig); } catch (e2) {}
      /* ★ v166：按钮不再各自搬，整个控制条搬进游戏视口就位。 */
      try { if (ctl && ctl.parentNode !== vp) vp.appendChild(ctl); } catch (eC1) {}
      if (box.classList) box.classList.add('in-shell');
      if (fig && fig.classList) fig.classList.add('in-shell');
      if (ctl && ctl.classList) { ctl.classList.remove('is-float'); ctl.classList.add('in-shell'); }
      try { box.style.left = ''; box.style.top = ''; box.style.width = ''; box.style.height = ''; } catch (e3) {}
      try { if (fig) { fig.style.left = ''; fig.style.top = ''; fig.style.width = ''; fig.style.height = ''; } } catch (e4) {}
      placeCtl();
      return;
    }

    try { if (box.parentNode !== doc.body) doc.body.appendChild(box); } catch (e5) {}
    try { if (fig && fig.parentNode !== doc.body) doc.body.appendChild(fig); } catch (e6) {}
    try { if (ctl && ctl.parentNode !== doc.body) doc.body.appendChild(ctl); } catch (eC2) {}
    if (box.classList) box.classList.remove('in-shell');
    if (fig && fig.classList) fig.classList.remove('in-shell');
    if (ctl && ctl.classList) { ctl.classList.remove('in-shell'); ctl.classList.add('is-float'); }
    try {
      box.style.left = '0px'; box.style.top = '0px';
      box.style.width = '100vw'; box.style.height = '100vh';
      if (fig) { fig.style.left = '0px'; fig.style.top = '0px'; fig.style.width = '100vw'; fig.style.height = '100vh'; }
    } catch (e7) {}
  }

  /* 显示当前这一张 + 刷新按钮上的进度 */
  function setShellCgOn(on) {
    try {
      var shell = getDoc().getElementById('th-gal-shell-root');
      if (!shell || !shell.classList) return;
      if (on) shell.classList.add('th-gal-cg-on');
      else shell.classList.remove('th-gal-cg-on');
    } catch (e) {}
  }

  /* ══ ★ v99：插图适配 —— 一律「以高度为主、等比放大」，也就是 contain ══
     图框现在就是整个游戏视口，图按比例缩放到「刚好塞进框」的最大尺寸：
       · 竖图 / 方图 → 高度正好顶到视口上下沿，左右多出来的宽度留黑（用户确认「黑着没事」）；
       · 少见的长横图 → 宽度顶满，上下留一点黑。
     为什么不用 cover：cover 会裁掉两侧，人物的头 / 身子说没就没，用户明确不要。
     为什么不用 width:100% + height:100%：那是拉伸，同样明确禁止。 */
  function currentUrl() {
    try {
      var q = state.queue || [];
      if (!q.length) return '';
      return q[Math.min(state.index, q.length - 1)].url;
    } catch (e) { return ''; }
  }
  function applyFit(url) {
    var fig = getDoc().getElementById(CG_FIGURE_ID);
    if (!fig || !url) return;
    fig.style.objectFit = 'contain';
    fig.style.objectPosition = 'center center';
  }

  function paint() {
    syncCgRect();
    var doc = getDoc();
    var cgBox = doc.getElementById(CG_CONTAINER_ID);
    var btn = doc.getElementById(NEXT_BTN_ID);
    if (!cgBox || !btn) return;
    var group = state.queue || [];          /* ★ v125：这一轮拼好的整条队列 */
    /* 功能页里可以把内置插图关掉：当没有图处理，走下面的「收干净」分支 */
    if (!illustEnabled()) group = [];
    var figEl = doc.getElementById(CG_FIGURE_ID);

    /* ★ v99：这一轮一个图组都没有 → 连黑幕一起收干净，壳的场景图与立绘回来。
       以前这里只关 opacity，不动壳，所以「没插图了」时立绘也不会回来。 */
    if (!group || !group.length) {
      cgBox.classList.remove('active');
      try { cgBox.style.backgroundImage = ''; } catch (eB) {}
      if (figEl) { figEl.classList.remove('active'); figEl.removeAttribute('src'); }
      btn.classList.remove('is-shown');
      btn.classList.remove('is-single');
      var ab0 = doc.getElementById(AUTO_BTN_ID);
      if (ab0) ab0.classList.remove('is-shown');   /* ★ v125：没图时开关也一起收 */
      /* ★ v166：整条控制条一起收（上一张 / 下一张 / 暂停 三颗是一体的） */
      var ctl0 = doc.getElementById(CTL_ID);
      if (ctl0) ctl0.classList.remove('is-shown');
      var pb0 = doc.getElementById(PREV_BTN_ID);
      if (pb0) pb0.classList.remove('is-shown');
      /* ★ v170：没图了，关闭键也一起收（不然空框挂个 ✕ 让人以为界面坏了） */
      var cl0 = doc.getElementById(CLOSE_BTN_ID);
      if (cl0) cl0.classList.remove('is-shown');
      /* ★ v171：沉浸键也收，并且**一定要退出沉浸态** ——
         图没了还折着地图和状态卡，玩家会以为界面坏了。
         这里调 immersiveAutoExit（不写偏好），下次出图照样能自动进。 */
      var im0 = doc.getElementById(IMM_BTN_ID);
      if (im0) im0.classList.remove('is-shown');
      immersiveAutoExit();
      doc.body.classList.remove('gal-cg-active');
      setShellCgOn(false);
      return;
    }

    var url = group[Math.min(state.index, group.length - 1)].url;
    var cur = (figEl && figEl.getAttribute('src')) || '';
    var sameOk = !!(figEl && cur === url && figEl.complete && figEl.naturalWidth > 0);
    var curOk  = !!(figEl && cur && cur !== url && figEl.complete && figEl.naturalWidth > 0);

    if (sameOk) {
      /* 就是这张、而且已经在屏上且是好的 → 直接亮 */
      cgBox.classList.add('active');
      figEl.classList.add('active');
      setShellCgOn(true);
      doc.body.classList.add('gal-cg-active');
    } else {
      /* ★ v99：先把图下下来，确认「真能显示」再亮灯。
         图被墙 / 404 时什么都不亮 —— 场景图与立绘照旧，绝不会再出现
         「底衬先亮成一条近黑矩形」。旧图还在屏上时也先别灭，等新图就绪再换，
         这样点「下一张」时不会闪一下黑。 */
      if (!curOk) {
        cgBox.classList.remove('active');
        if (figEl) figEl.classList.remove('active');
        setShellCgOn(false);
        doc.body.classList.remove('gal-cg-active');
      }
      try {
        var probe = new (HOST.Image || Image)();
        /* ★ 超时兜底：图床挂起时 onload / onerror 一个都不来，
           原来 probe 会一直挂着，界面就卡在「图还没出来」的状态。
           8 秒没结果一律按失败处理（走 onerror 的收尾）。 */
        var settled = false, failT = null;
        var settleOk = function () {
          if (settled) return;
          settled = true;
          if (failT) { clearTimeout(failT); failT = null; }
          if (!probe.naturalWidth || !probe.naturalHeight) return;
          if (currentUrl() !== url) return;          /* 又推进 / 换动作了：这一张作废 */
          if (figEl) {
            if (figEl.getAttribute('src') !== url) figEl.setAttribute('src', url);
            applyFit(url);
            figEl.classList.add('active');
          }
          cgBox.classList.add('active');
          setShellCgOn(true);
          doc.body.classList.add('gal-cg-active');
        };
        var settleFail = function (why) {
          if (settled) return;
          settled = true;
          if (failT) { clearTimeout(failT); failT = null; }
          /* 图挂了：保持「什么都不亮」，场景图与立绘继续显示 —— 玩家至少还有画面。 */
          try {
            console.warn('⚠️[插图] 图片没出来（' + (why || '加载失败') + '）：' + url +
              '\n     图床挂起或图本身失效。超时会自动跳过，不会卡住界面。');
            var np2 = getDoc().getElementById(NAMEPLATE_ID);
            if (np2) np2.title = '插图没出来（挂起或已失效）：' + url;
          } catch (eErr) {}
        };
        probe.onload = settleOk;
        probe.onerror = function () { settleFail('加载失败'); };
        failT = setTimeout(function () {
          if (settled) return;
          try { probe.src = ''; } catch (eAb) {}
          settleFail('8 秒超时');
        }, 8000);
        probe.src = url;
      } catch (ePr) {}
    }

    /* ══ ★ v125：按钮不再按张数隐藏 ══════════════════════════════════════
       旧代码是 `if (group.length > 1) 显示 else 藏起来`，
       于是「单图床」和「图组」在玩家眼里是两套东西：一组能翻、一张连计数都没有。
       现在合并成一套：
         · 只要出图就显示按钮，一张也写「1/1」；
         · 张数 > 1 才可翻，1 张时加 .is-single 压暗（翻不动，但看得见）；
         · 顺带把「自动 / 固定」开关一起亮出来。
       为什么不再藏：玩家没法区分「这张就一张」和「翻页坏了」，
       而且他自己给的图常常只有一张，藏起来等于这套翻页机制形同不存在。 */
    /* ★ v10.7：只有 1 张时不出按钮。
       v125 原来让单张也显示「仅 1 张 1/1」，理由是「免得玩家以为翻页坏了」；
       实际效果是左下角常驻一个带 ▶ 的紫色斜角块，被当成播放器/插槽，更迷惑。
       单张没有可翻的东西，按钮和「自动/固定」开关一起收掉。 */
    /* ★★ v170：**只有 1 张时也要露出关闭键。**
       玩家的原话是「插图无法关上」——而绝大多数插图就是**一张**。
       旧逻辑在 group.length <= 1 时把整条控制条收掉（连关闭键一起），
       于是单张图**永远没有关闭按钮**，只能去齿轮面板找开关。
       现在：单张只收「上一张 / 下一张 / 暂停」（确实没得翻、没得自动），
       但控制条本身和关闭键保留 —— 有关闭键在，玩家才认为「关得掉」。 */
    if (group.length <= 1) {
      btn.classList.remove('is-shown');
      btn.classList.remove('is-single');
      var ab1 = doc.getElementById(AUTO_BTN_ID);
      if (ab1) ab1.classList.remove('is-shown');   /* 单张没得自动翻，收掉 */
      var pb1 = doc.getElementById(PREV_BTN_ID);
      if (pb1) pb1.classList.remove('is-shown');   /* 单张没得翻，收掉 */
      /* 控制条 + 关闭键留着 */
      var ctl1 = doc.getElementById(CTL_ID);
      if (ctl1) ctl1.classList.add('is-shown');
      var cl1 = doc.getElementById(CLOSE_BTN_ID);
      if (cl1) {
        cl1.classList.add('is-shown');
        cl1.title = '关闭插图（关掉后可在面板「🖼 重新打开插图」找回）';
      }
      /* ★ v171：单张也要有沉浸键 —— 玩家最常看到的就是单张，
         不给键等于这个功能对大多数人不存在。 */
      var im1 = doc.getElementById(IMM_BTN_ID);
      if (im1) im1.classList.add('is-shown');
      placeCtl();
      /* ★ v171：出图即自动进沉浸（按偏好）。放在「队列已确认」之后 ——
         前面那段还在图下载/校验（可能 404 / 超时），那种情况下折掉 UI 是白折。 */
      immersiveSync();
      return;
    }
    /* ★ v166：控制条整体亮出来，三颗按钮同进同出。 */
    var ctlEl = doc.getElementById(CTL_ID);
    if (ctlEl) ctlEl.classList.add('is-shown');
    placeCtl();
    btn.classList.add('is-shown');
    btn.classList.remove('is-single');
    var numEl = btn.querySelector('.num');
    if (numEl) numEl.textContent = (Math.min(state.index, group.length - 1) + 1) + '/' + group.length;
    var labelEl = btn.querySelector('.label');
    if (labelEl) {
      labelEl.textContent = (state.index >= group.length - 1) ? '回到第一张' : '下一张';
    }
    var pbtn = doc.getElementById(PREV_BTN_ID);
    if (pbtn) {
      pbtn.classList.add('is-shown');
      var plab = pbtn.querySelector('.label');
      if (plab) plab.textContent = (state.index <= 0) ? '最后一张' : '上一张';
    }
    var abtn = doc.getElementById(AUTO_BTN_ID);
    if (abtn) abtn.classList.add('is-shown');
    /* ★ v170：多张时关闭键也一起亮（和控制条同进同出） */
    var clb = doc.getElementById(CLOSE_BTN_ID);
    if (clb) clb.classList.add('is-shown');
    /* ★ v171：多张时沉浸键也亮（和控制条同进同出） */
    var imb = doc.getElementById(IMM_BTN_ID);
    if (imb) imb.classList.add('is-shown');
    paintAutoBtn();
    /* ★ v171：出图即自动进沉浸（按偏好）。同样放在「队列已确认」之后。 */
    immersiveSync();
  }

  /* 推进：step=+1 往后一张；wrap=true 时到最后一张再点回到第一张
     ★ v125：只有 1 张时直接不动 —— 翻页机制永远在，没页翻就翻不了，
       而不是把按钮藏掉假装没有这个机制。 */
  function stepGallery(step, wrap) {
    var q = state.queue || [];
    if (q.length <= 1) return;
    var next = state.index + step;
    if (next >= q.length) next = wrap ? 0 : q.length - 1;
    if (next < 0) next = 0;
    state.index = next;
    paint();
  }

  /* 切换队列：签名变了才回第一张。
     同一轮重复渲染（心跳每秒都会进来一次）签名不变，就原地不动 ——
     否则自动循环翻到第 3 张，下一秒又被心跳拽回第 1 张。 */
  function setQueue(sig, queue) {
    if (state.queueSig === sig && (state.queue || []).length === queue.length) {
      state.queue = queue;
      paint();
      return;
    }
    state.queueSig = sig;
    state.queue = queue;
    state.index = 0;
    /* ★ 只在「队列真的换了」时重挂定时器。
       心跳每秒都会调一次 setQueue，同一轮走的是上面那条早退分支；
       要是把重挂写在外面，定时器每秒被清一次，永远等不到下一次触发。 */
    try { restartAutoTimer(); } catch (eR) {}
    paint();
  }

  /* ══ ★ v125：一轮正文 → 一条图序队列 ═══════════════════════════════════
     写法还是老样子：<插图>人物｜动作</插图> 或 <插图>人物｜动作｜图床:URL</插图>
     变化在于「一轮里可以有好几个标签」，全部按出现顺序首尾相接：
       口交(3) + 手交(1) → [口1,口2,口3,手1]，一共 4 张，翻完口交接着手交。
     「单图床 / 图组」的分类就此取消 —— 一个标签就是长度 1 的队列，没有特例。
     ★ 前戏（手势 O 圈吐舌头）永远排最前，且一轮只收 1 张。
     返回 { sig, queue, miss }：sig 用来判断「这一轮是不是换内容了」，
     miss 是没命中又没有 URL 的标签（交给调用方打日志，不影响别的标签）。
     ⚠ 单独成函数是为了**能被单测直接调**：这段逻辑（顺序 / 去重 / 前戏置顶）
       光靠 grep 代码字符串验不出来，必须真喂一段正文看结果。 */
  function buildQueue(rawText) {
    var tagRe = /<\s*插图\s*>([\s\S]*?)(?:<\s*\/\s*插图\s*>|$)/gi;
    var queue = [];
    var seenUrl = {};
    var sigParts = [];
    var miss = [];
    var mt;
    /* ★ 安全检查：正则一旦被人改掉 g 标志，exec 不会再前进 → while 死循环、页面直接卡死。
       加一个 64 条的上限：标签再多也到不了，但真出问题时是「少显示几张」而不是「整页冻住」。 */
    var guard = 0;
    while ((mt = tagRe.exec(String(rawText || ''))) !== null) {
      if (++guard > 64) break;
      var parts = String(mt[1] || '').split(/[|｜]/);
      /* ★ v99：标签残缺（只写人物没写动作）就跳过它自己，
         但**不再清空整轮** —— 现在一轮能有多个标签，一个有毛病不该连累别的。 */
      if (parts.length < 2) continue;
      var charName = parts[0].trim();
      var actionText = parts[1].trim();
      var urlPart = parts.slice(2).join('|');
      var aKey = actionKeyOf(actionText);
      var list = null, gid = '';

      var hit = resolveGroup(charName, actionText);
      if (hit) { list = hit.list; gid = hit.id; }
      else {
        /* 图组库里没有这个动作 → 标签里带了 URL 就单张顶上，没有就记一条警告 */
        var urlMatch = urlPart.match(/(https?:\/\/[^\s]+)/i);
        if (urlMatch) { list = [urlMatch[1]]; gid = charName + '|' + aKey + '__single'; }
        else miss.push(charName + '｜' + actionText + '（' + aKey + '）');
      }
      if (!list || !list.length) continue;

      var cap = (aKey === '手势前戏') ? 1 : list.length;   /* 前戏一轮只收 1 张 */
      var added = 0;
      for (var li = 0; li < list.length && added < cap; li++) {
        var u = list[li];
        if (!u || seenUrl[u]) continue;          /* 同一张图在一轮里只出现一次 */
        seenUrl[u] = 1;
        queue.push({ url: u, gid: gid, char: charName, act: actionText, pre: aKey === '手势前戏' });
        added++;
      }
      if (added) sigParts.push(gid + '#' + added);
    }

    /* 前戏排到最前；其余保持标签原顺序（稳定分桶，绝不打乱「口交→手交」的先后） */
    var preQ = queue.filter(function (it) { return it.pre; });
    var restQ = queue.filter(function (it) { return !it.pre; });
    return { sig: galArtTag() + sigParts.join('>'), queue: preQ.concat(restQ), miss: miss };
  }

  /* ══ ★ v101：取「这一屏正文」—— 三路来源【分桶】，有标签就用带标签的那一路 ══
     源① 酒馆原始聊天数据（显示层正则改不到它，最可靠）
        ★ 先读 swipes[swipe_id]（当前这张 swipe），没有才退回 m.mes
     源② 酒馆助手的消息读写接口
     源③ DOM 里当前可见的最后一条消息（编辑后标签可能只留在显示层）
     v100 是把三路 join 成一锅粥 —— 删了标签会误命中聊过的旧楼层；
     v101 分桶：tagged 优先，全空才用 untagged 判「本楼确实没标签」。 */
  function readLatestText() {
    var doc = getDoc();
    var H = (typeof HOST !== 'undefined' && HOST) ? HOST : ((typeof window !== 'undefined') ? window : null);
    /* ★ v101：带来源分桶 —— 优先用「含标签」的那一路，绝不把三个来源糊成一锅粥 */
    var tagged = [];        /* 含标签的候选，按优先级排 */
    var untagged = [];      /* 不含标签的原文，只用来判「本楼确实没标签」 */
    var pushTag = function (t, tag) {
      t = String(t == null ? '' : t);
      if (!t) return;
      if (t.indexOf('插图') !== -1 || t.indexOf('图床') !== -1) tagged.push({ t: t, tag: tag });
      else untagged.push({ t: t, tag: tag });
    };

    /* ① 酒馆原始聊天数据：最后一条 AI 消息（就是「这一楼」） */
    try {
      var ctx = null;
      try { if (H && H.SillyTavern && typeof H.SillyTavern.getContext === 'function') ctx = H.SillyTavern.getContext(); } catch (e0) {}
      if (!ctx) { try { if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') ctx = window.SillyTavern.getContext(); } catch (e0b) {} }
      var chat = ctx && ctx.chat;
      if (chat && chat.length) {
        for (var i = chat.length - 1; i >= 0; i--) {
          var m = chat[i];
          if (!m) continue;
          /* ⛔ ★★ 2026-11-18：**玩家楼层必须是 user 的三种写法全跳过**
             ─────────────────────────────────────────────────────────────────
             作者原话：「当玩家输入后并推进，则此时虽然显示对话框为上一轮正文内容
                       但是却不会识别如插图。」
             ── 根因就在这一行 ──
             这里原来只认 `is_user` / `isUser`。而现场聊天对象里，玩家楼层很常见
             只有 `role: 'user'`（没有 is_user 字段）⇒ 这一层不跳过 ⇒
             `txt` 取到的是**玩家刚打的那句话**（「[动作]:走过去」之类），
             它当然没有 <插图> 标签 ⇒ 落进 untagged 桶 ⇒
             `pick = tagged.length ? tagged[0] : untagged[0]` 选中玩家那句 ⇒
             `buildQueue` 队列为空 ⇒ `setQueue('', [])` 把这一轮的图**清掉**。
             对话框那边（updateContainer → getLatestAIRawText）跳过 user 之后读到的是
             上一轮 AI 正文，所以正文对、插图没 —— 两边判据不同步的经典现象。
             ─────────────────────────────────────────────────────────────────
             ⚠ 三种写法必须都认：is_user / isUser / role==='user'。
               而且这一判据和 10-core 的 getLatestAIRawText、20-heal 的
               getLatestAIMessageIndex **必须逐条一致** —— 三处各写一份是这次 bug 的成因。 */
          if (m.is_user === true || m.isUser === true || m.role === 'user') continue;
          if (m.is_system === true || m.isSystem === true || m.role === 'system') continue;
          var swId = (m.swipe_id != null) ? m.swipe_id : 0;
          /* ★ v101 头号修复：先读 **当前这张 swipe** 的正文。
             这张卡第 0 楼是 3 个 swipe，玩家编辑的是当前那张；
             m.mes 可能是另一张（旧 swipe）的正文，标签就永远读不到。
             优先级：swipe_info[swId].mes > swipes[swId].mes > m.mes
             —— 与 02 的 getLatestAIRawText()（v46 修过同一处）保持一致。*/
          var txt = '';
          try {
            if (m.swipe_info && m.swipe_info[swId] && typeof m.swipe_info[swId].mes === 'string') {
              txt = m.swipe_info[swId].mes;
            } else if (m.swipes && m.swipes.length) {
              var cur = m.swipes[swId];
              txt = (cur && typeof cur === 'object') ? (cur.mes != null ? cur.mes : '') : (cur == null ? '' : cur);
            }
          } catch (eSw) { txt = ''; }
          if (!txt) txt = m.mes || m.message || '';
          if (!txt) continue;
          pushTag(String(txt), 'chat#' + i + '/sw' + swId);
          break;
        }
      }
    } catch (e1) {}

    /* ② 酒馆助手接口 */
    try {
      var TH = null;
      try { if (window.TavernHelper) TH = window.TavernHelper; } catch (e2a) {}
      if (!TH) { try { if (H && H.TavernHelper) TH = H.TavernHelper; } catch (e2b) {} }
      if (TH && typeof TH.getChatMessages === 'function') {
        var got = TH.getChatMessages('-1-0') || [];
        for (var j = got.length - 1; j >= 0; j--) {
          var g = got[j];
          var gt = g && (g.message || g.mes);
          if (!gt) continue;
          /* ★ 2026-11-18：与上面 ① 同一判据（三种写法都认），否则玩家楼层又会被当 AI */
          if (g.is_user === true || g.isUser === true || g.role === 'user') continue;
          if (g.is_system === true || g.isSystem === true || g.role === 'system') continue;
          pushTag(String(gt), 'TH#' + j);
          break;
        }
      }
    } catch (e3) {}

    /* ③ DOM：当前可见的最后一条消息
       ★ 2026-11-18：这里原来直接取 nodes 的最后一个 —— 玩家刚发完话，
         最后一个节点就是**玩家楼层**，于是把玩家那句当成本楼正文。
         现在从后往前找第一条不是 user 的消息。 */
    try {
      var nodes = Array.from(doc.querySelectorAll('.mes_text, .mes, .message, #chat .mes'));
      for (var ni = nodes.length - 1; ni >= 0; ni--) {
        var el = nodes[ni];
        var isU = false;
        try {
          var holder = (el.closest && el.closest('.mes')) || el;
          isU = !!(el.classList && el.classList.contains('is_user')) ||
                !!(holder && holder.classList && holder.classList.contains('is_user')) ||
                (holder && holder.getAttribute && holder.getAttribute('is_user') === 'true');
        } catch (eUdom) { isU = false; }
        if (isU) continue;
        pushTag(el.textContent || el.innerText || '', 'dom');
        break;
      }
    } catch (e4) {}

    /* ★ v101 决策：**有标签就用带标签的那一路**（按 chat → TH → dom 的先后顺序），
       没有标签才用第一路原文（让上层走「本楼无插图」的正常退场路径）。
       绝不再把三个来源 join 成一锅粥 —— 那样删了标签会误命中聊过的旧楼层。 */
    var pick = (tagged.length) ? tagged[0] : (untagged.length ? untagged[0] : null);
    if (!pick) return { text: '', src: 'none' };
    return { text: pick.t, src: pick.tag,
             hit: (tagged.length > 0),
             allSrc: tagged.concat(untagged).map(function (o) { return o.tag; }).join('+') };
  }

  /* -------------------------------------------------------------
     主解析
     ------------------------------------------------------------- */
  function parseAndRender() {
    ensureStyles();
    ensureDOM();

    var doc = getDoc();
    /* ★ 姓名牌交给 02 的对话框（贴在对话框左上角）。
       07 这个名牌是贴窗口左下角的 fixed 元素，玩家看着像「一个小框飘在屏幕很远的地方」，
       所以壳在的时候一律隐掉。 */
    var nameplate = doc.getElementById(NAMEPLATE_ID);
    if (nameplate) {
      var hasShell = null;
      try { hasShell = doc.getElementById('th-gal-shell-root'); } catch (eSh) {}
      if (hasShell) nameplate.style.display = 'none';
    }

    var messages = Array.from(doc.querySelectorAll('.mes_text, .mes, .message, #chat .mes'));
    if (!messages.length) return;
    var latest = messages[messages.length - 1];
    /* ★ 正文来源（关键）：卡里有一条正则 `<插图>…</插图>` 会把它从显示层删掉，
       所以绝不能说“DOM 里没有就是没有” —— 必须先读酒馆的聊天数据（正则改不到它）。
       顺序：酒馆 getContext → 酒馆助手 getChatMessages → DOM 的 textContent → innerText */
    /* ★ v100：三路合并取正文（见 readLatestText）。以前是短路取第一个源，
       chat 那一路一旦读不到就退到已被正则删空的 DOM → 手写标签永远读不到。 */
    var gotT = readLatestText();
    var rawText = gotT.text;
    var srcUsed = gotT.src;
    if (!rawText) return;
    try {
      var _hasTagNow = (rawText.indexOf('插图') !== -1 || rawText.indexOf('图床') !== -1);
      var _dbgSig = (_hasTagNow ? 'TAG' : 'none') + '|' + rawText.length + '|' + srcUsed;
      if (HOST.__galDbgSig !== _dbgSig) {
        HOST.__galDbgSig = _dbgSig;
        console.log('🎬 插图嗅探[' + srcUsed + '] ' + (_hasTagNow ? '★读到标签' : '无标签')
          + '｜正文 ' + rawText.length + ' 字｜尾:' + rawText.slice(-60).replace(/\s+/g, ' '));
      }
    } catch (eL) {}

    /* A. 说话人 → 姓名牌 + 立绘微浮动 */
    var speakerMatches = Array.from(rawText.matchAll(/\{([^{}]+)\}\s*[:：]?\s*[「“]([^」”]+)[」”]/g));
    if (speakerMatches.length > 0 && nameplate) {
      var lastMatch = speakerMatches[speakerMatches.length - 1];
      var nm = lastMatch[1].trim();
      nameplate.textContent = (nm === '#' || nm.toLowerCase() === 'user') ? '你' : nm;
      nameplate.classList.remove('is-narrative');
      doc.querySelectorAll('#character, .expression-holder, #avatar, .mes_avatar').forEach(function (el) {
        el.classList.remove('gal-sprite-speaking');
        void el.offsetWidth;
        el.classList.add('gal-sprite-speaking');
      });
    } else if (nameplate) {
      nameplate.textContent = '...';
      nameplate.classList.add('is-narrative');
    }

    /* B. 插图标签 → 队列（拼装逻辑在 buildQueue，单测直接调它） */
    var bq = buildQueue(rawText);
    /* 未命中只在控制台提示，不影响其它标签 —— 以前是 return，整轮图全没了 */
    if (bq.miss.length) {
      try {
        bq.miss.forEach(function (w) {
          var who = String(w).split("｜")[0], mine = [];
          for (var pk in poolKeys()) { if (pk.indexOf(who + '|') === 0) mine.push(pk.split('|')[1]); }
          console.warn('⚠️ 图组未命中：' + w + '｜库里有：' + (mine.join('、') || '无'));
        });
      } catch (eLog) {}
      /* ★ 2026-11-18：作者问「我在开场白写<插图>标签组居然没识别，还是说其实是坏了」。
         —— 这里必须让**屏幕**回答他，不能只写控制台：
            · 标签**被读到了**但「人物｜动作」在图库里没有 ⇒ 弹一句「没匹配」
              （这时不是"标签没识别"，是动作名对不上，控制台里有该角色可用的动作名）
            · 标签**根本没读到** ⇒ 这里不会有 miss，界面也不会弹 —— 两种情况一眼可分。
         同一串未命中只弹一次，免得每秒刷屏。 */
      try {
        var _mk = bq.miss.join('|');
        if (_mk !== HOST.__galMissShown) {
          HOST.__galMissShown = _mk;
          var _fn = null;
          try { if (typeof popToast === 'function') _fn = popToast; } catch (eT0) {}
          if (!_fn) { try { if (HOST && typeof HOST.popToast === 'function') _fn = HOST.popToast; } catch (eT1) {} }
          if (_fn) {
            _fn('插图标签读到了，但库里没这个动作：' + bq.miss.slice(0, 2).join('、'), 4200);
          }
        }
      } catch (eMt) {}
    } else {
      try { HOST.__galMissShown = ''; } catch (eMr) {}
    }
    if (!bq.queue.length) { setQueue('', []); return; }
    try { console.log('🎬 插图队列：' + bq.queue.length + ' 张（' + bq.sig + '）'); } catch (eLog2) {}
    setQueue(bq.sig, bq.queue);
  }

  /* -------------------------------------------------------------
     挂载与观测
     ------------------------------------------------------------- */
  /* ══ 外置插图：接住 st-chatu8 这类生图插件产出的图 ══════════════════
     插件把生成的图插进 mes_text（<img> 或 iframe 里的画布/背景图），
     GAL 壳会把消息区盖住，玩家看不见。这里把它们抓出来，铺在壳的背景层，
     层级压过内置插图（2147483631），并且给一个开关：默认关，点一下显示，再点关掉。 */
  var EXT_ID = 'gal-ext-illust';
  var EXT_BTN = 'gal-ext-illust-btn';
  var EXT_MAX = 12;
  var extQueue = [];
  var extIdx = 0;
  /* ★ 21:45：默认**关**。
     以前默认开，于是每 1.5 秒扫一遍 #chat 里所有 <img>，把别的插件 / 素材库的
     图标、缩略图也当成"外置插图"抓进来（玩家反映：莫名其妙冒出各种图标）。
     现在默认显示我们自己的插图；玩家点「🖼 兼容智绘姬」才切到外置那一套，
     再点一下切回来。 */
  var extOn = false;
  var extTimer = null;

  /* 内置插图总开关。★ 2026-11-18 作者命令：「插图改成默认打开，无论如何都是默认打开，
     这个开启只是给玩家把关掉的打开，而不是玩家想把插图关掉，别分不清主次了」。
     ⇒ 恒 true，并把 localStorage 里残留的 off 就地改回 on（治好一次就永久好）。
     真正可关的只有外置那套（SPR_EXT_ILLUST）。 */
  function illustEnabled() {
    try {
      if (HOST.localStorage.getItem('SPR_ILLUST_ON') === 'off') {
        HOST.localStorage.setItem('SPR_ILLUST_ON', 'on');
      }
    } catch (eFix) {}
    return true;
  }

  function extDoc() { try { return getDoc(); } catch (e) { return null; } }

  function extVp() {
    var doc = extDoc();
    if (!doc) return null;
    var shell = doc.getElementById('th-gal-shell-root');
    if (!shell || !shell.querySelector) return null;
    return shell.querySelector('.th-gal-shell-viewport');
  }

  function extToast(msg) {
    try {
      var doc = extDoc(); if (!doc || !doc.body) return;
      var t = doc.getElementById('gal-ext-toast');
      if (!t) {
        t = doc.createElement('div');
        t.id = 'gal-ext-toast';
        t.setAttribute('style', 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:2147483647;padding:7px 16px;border-radius:8px;background:rgba(12,10,8,.9);border:1px solid rgba(217,187,122,.5);color:#f2e9dc;font:600 13px/1.5 system-ui,"Microsoft YaHei",sans-serif;pointer-events:none;transition:opacity .25s;');
        doc.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t.__h);
      t.__h = setTimeout(function () { try { t.style.opacity = '0'; } catch (e) {} }, 1800);
    } catch (e) {}
  }

  function extLayer() {
    var doc = extDoc(), vp = extVp();
    if (!doc || !vp) return null;
    var el = doc.getElementById(EXT_ID);
    if (!el) {
      el = doc.createElement('div');
      el.id = EXT_ID;
      vp.appendChild(el);
    }
    /* z-index 70：必须低于 .th-gal-dialogue-stage 的 80。
       以前这里写的是 2147483636（顶到天），图一出来就把整块对话框连同名字条
       一起埋了，玩家只能看图不能读字。降到 70 之后，图铺满视口，对话框浮在
       图上面，靠它自己的半透明背景 + 毛玻璃透出底图，两者同时可见。 */
    el.setAttribute('style', 'position:absolute;inset:0;z-index:70;pointer-events:none;opacity:0;transition:opacity .25s ease;background:#000 center/contain no-repeat;');
    return el;
  }

  function extRender() {
    var el = extLayer();
    if (!el) return;
    var show = !!(extOn && extQueue.length);

    /* 内置 CG 的让位 / 复位。只改 visibility，不碰 display、不动它的队列和推进按钮
       —— 外置图关掉之后内置那套要能原地接着播，不能被我改成半死不活。 */
    function yieldCg(hide) {
      try {
        var d = extDoc();
        var ids = ['gal-cg-background', 'gal-cg-figure'];
        for (var i = 0; i < ids.length; i++) {
          var n = d.getElementById(ids[i]);
          if (n) n.style.visibility = hide ? 'hidden' : '';
        }
      } catch (eY) {}
    }

    if (!show) { el.style.opacity = '0'; yieldCg(false); try { immersiveSync(); } catch (eIm0) {} return; }
    var src = extQueue[extIdx] || '';
    el.style.backgroundImage = src ? 'url("' + src + '")' : 'none';
    el.style.opacity = '1';
    yieldCg(true);
    /* ★ v171：外置图也算「正在出图」，同样触发沉浸。
       ⚠ 不能只在内置那条链上触发 —— 玩家开着智绘姬时，内置队列可能是空的，
         光看内置会判成「没图」，沉浸态会被 paint 立刻撤掉（表现：点了就弹回去）。 */
    try { immersiveSync(); } catch (eIm1) {}
  }

  function extAdd(src) {
    if (!src || extQueue.indexOf(src) >= 0) return false;
    extQueue.push(src);
    if (extQueue.length > EXT_MAX) extQueue.shift();
    extIdx = extQueue.length - 1;
    return true;
  }

  function extPick(img) {
    if (!img || img.tagName !== 'IMG') return '';
    try {
      /* 头像 / 表情 / 我们自己的插图块 / 游戏壳里的任何图标，一律不算 */
      if (img.closest && img.closest('.mes_avatar, .avatar, .mes_avatar_img, .expression-holder, ' +
        '#th-gal-shell-root, .thillu, #gal-ext-illust')) return '';
      /* ★ 21:45：按钮、工具栏、菜单里的图**不是插图**。玩家看到的「各种图标」
         基本都是从这儿漏进去的 —— 别的插件把图标库挂在聊天区里，
         旧判据只看尺寸，200px 的素材缩略图照样过。 */
      if (img.closest && img.closest('button, .menu, .toolbar, .drawer, [class*="icon"], [class*="Icon"], ' +
        '[class*="emoji"], [class*="Emoji"], [class*="avatar"], [class*="Avatar"], [class*="thumb"]')) return '';
    } catch (e0) {}
    var src = img.currentSrc || img.getAttribute('src') || '';
    if (!src || !/^(https?:\/\/|blob:|data:image\/)/i.test(src)) return '';
    /* 明显是图标/表情的 data URI 直接丢（外置插图不可能是几十字节的 svg 图标） */
    if (/^data:image\/svg/i.test(src)) return '';
    var w = img.naturalWidth || 0, h = img.naturalHeight || 0;
    if (w && h && (w < 240 || h < 240)) return '';    /* 图标 / 表情 / 缩略图 */
    var lw = img.width || 0, lh = img.height || 0;
    if (lw && lh && (lw < 160 || lh < 160)) return '';
    return src;
  }

  function extScan() {
    var doc = extDoc();
    if (!doc) return 0;
    var added = 0, s, i, j, k;
    /* ★ 21:45：关掉的时候连扫都不扫 —— 不扫就不会攒脏图，也不会有隐形开销 */
    if (!extOn) {
      if (extQueue.length) { extQueue = []; extIdx = 0; extRender(); extPaintBtn(); }
      return 0;
    }
    /* ★ 21:45：只认「最近 3 楼的正文区」。以前扫 #chat 全量，
       历史楼里别人插的图、插件自己的图都被算进来。 */
    var mes = doc.querySelectorAll('.mes');
    var boxes = [], bi;
    for (bi = Math.max(0, mes.length - 3); bi < mes.length; bi++) {
      var bx = mes[bi] && mes[bi].querySelector ? mes[bi].querySelector('.mes_text') : null;
      if (bx) boxes.push(bx);
    }
    if (!boxes.length) { var fb = doc.querySelector('.mes_text'); if (fb) boxes.push(fb); }
    for (bi = 0; bi < boxes.length; bi++) {
      var il0 = boxes[bi].querySelectorAll('img');
      for (i = 0; i < il0.length; i++) { s = extPick(il0[i]); if (s && extAdd(s)) added++; }
    }
    /* 插件把图装 iframe 的情况 */
    var fr = doc.querySelectorAll('.mes_text iframe, .mes iframe');
    for (j = 0; j < fr.length; j++) {
      try {
        var inner = fr[j].contentDocument;
        if (!inner) continue;
        var il = inner.querySelectorAll('img');
        for (k = 0; k < il.length; k++) { s = extPick(il[k]); if (s && extAdd(s)) added++; }
        /* ★ 21:45：不再扫 iframe 里的 background-image。
           插件界面上到处是背景图做的图标/按钮底纹，那正是"抓到图标"的另一半来源。 */
      } catch (eF) {}
    }
    if (added) { extIdx = extQueue.length - 1; extRender(); }
    return added;
  }

  function extBtn() {
    var doc = extDoc(), vp = extVp();
    if (!doc || !vp) return null;
    var b = doc.getElementById(EXT_BTN);
    if (!b) {
      b = doc.createElement('button');
      b.id = EXT_BTN;
      b.type = 'button';
      b.textContent = '✕';
      b.title = '关闭插图（关掉后可在面板「🖼 重新打开插图」找回）';
      /* ★★ v170：**不再钉在右上角，收进控制条。**
         作者原话：「关闭按钮要弄在暂停和播放按钮的中间」。
         旧样式是 position:absolute; top:10px; right:10px —— 浮在图右上角，
         和控制条那一排按钮完全不在一个视觉体系里，玩家会以为是两个东西。
         现在 mediator 由 syncExtBtnToCtl() 把它塞进 #gal-cg-ctl 里、
         排在「下一张」与「暂停」之间（和内置插图的关闭键同一个位置）。
         样式统一交给 CSS 里的 #gal-cg-ctl > * 规则（position:static），
         所以这里的 inline 只需要管外观、不再写 top/right。 */
      b.setAttribute('style', 'display:none;align-items:center;justify-content:center;width:32px;height:30px;padding:0;border-radius:8px;border:1.5px solid rgba(217,187,122,.72);background:linear-gradient(135deg,rgba(24,20,36,.94),rgba(52,28,64,.96));box-shadow:0 6px 18px rgba(0,0,0,.7);color:#ffeccc;font-size:14px;font-weight:700;line-height:1;cursor:pointer;user-select:none;backdrop-filter:blur(8px);transition:transform .18s,border-color .18s,color .18s;');
      b.addEventListener('click', function (ev) { ev.stopPropagation(); extToggle(); });
      /* ★ v170：先挂 body 兜底，syncExtBtnToCtl 下一拍会把它搬进控制条。
         不直接 append 到 vp：那时候控制条可能还没建出来。 */
      (doc.body || vp).appendChild(b);
    }
    try { syncExtBtnToCtl(); } catch (eS) {}
    return b;
  }

  /* ★★ v170：把外置插图的 ✕ 搬进控制条，并摆到「暂停」前面（= 下一张与暂停之间）。
     幂等：位置已经对了就一个字节不动，否则每 1.5 秒的 extScan 都会重排一次、白白抖一下。 */
  function syncExtBtnToCtl() {
    var doc = extDoc();
    if (!doc) return;
    var b = doc.getElementById(EXT_BTN);
    var ctl = doc.getElementById(CTL_ID);
    if (!b || !ctl) return;
    var autoEl = doc.getElementById(AUTO_BTN_ID);
    if (b.parentNode !== ctl) {
      if (autoEl && autoEl.parentNode === ctl) ctl.insertBefore(b, autoEl);
      else ctl.appendChild(b);
    } else if (autoEl && autoEl.parentNode === ctl && b.nextSibling !== autoEl) {
      ctl.insertBefore(b, autoEl);
    }
  }

  function extPaintBtn() {
    var b = extBtn();
    if (!b) return;
    /* 只在「开着且有图」时露出关闭键。没图的时候挂着个 ✕ 会让人以为界面坏了。 */
    var show = !!(extOn && extQueue.length);
    b.style.display = show ? 'flex' : 'none';
    b.title = '关闭插图（关掉后可在面板「🖼 重新打开插图」找回）';
    /* ★ v170：外置图露头时，内置那颗关闭键就藏起来 ——
       否则同一排会出现两个 ✕（一个关外置、一个关内置），玩家根本分不清。
       判据单一：谁在显示，就只留谁的关闭键。 */
    try {
      var cl = getDoc().getElementById(CLOSE_BTN_ID);
      if (cl) {
        if (show) cl.classList.remove('is-shown');
        else if (illustEnabled() && (state.queue || []).length) cl.classList.add('is-shown');
      }
    } catch (eCl) {}
  }

  function extToggle() {
    /* ★ 21:45：真正的开关（右上角那颗 ✕ 也能来回切） */
    extOn = !extOn;
    try { HOST.localStorage.setItem('SPR_EXT_ILLUST', extOn ? 'on' : 'off'); } catch (e) {}
    if (extOn) { extScan(); extIdx = Math.max(0, extQueue.length - 1); }
    else { extQueue = []; extIdx = 0; }
    extRender();
    extPaintBtn();
    extToast(extOn ? '🖼 已切换为外置插图（兼容智绘姬）' : '🖼 已切回我们自己的插图');
    try { if (HOST.__thSyncExtIllustBtn) HOST.__thSyncExtIllustBtn(); } catch (eS) {}
  }

  function extBoot() {
    /* ★ 21:45：默认关。只有玩家自己点过「兼容智绘姬」并留下 on，才会开。 */
    try {
      var _extPref = HOST.localStorage.getItem('SPR_EXT_ILLUST');
      extOn = (_extPref === 'on');
    } catch (e) { extOn = false; }
    try {
      HOST.__sprExtIllust = {
        toggle: extToggle,
        scan: extScan,
        count: function () { return extQueue.length; },
        list: function () { return extQueue.slice(); },
        next: function () { if (extQueue.length) { extIdx = (extIdx + 1) % extQueue.length; extRender(); extPaintBtn(); } },
        set: function (v) {
          extOn = !!v;
          try { HOST.localStorage.setItem('SPR_EXT_ILLUST', extOn ? 'on' : 'off'); } catch (eS) {}
          if (extOn) { extScan(); extIdx = Math.max(0, extQueue.length - 1); }
          extRender(); extPaintBtn();
        },
        get: function () { return extOn; }
      };
      HOST.__sprIllust = {
        set: function () {
          /* ★ 2026-11-18：只开不关（传 false 也当开）。插图常开，别分不清主次。 */
          try { HOST.localStorage.setItem('SPR_ILLUST_ON', 'on'); } catch (eS2) {}
          try { paint(); } catch (eP2) {}
          extToast('🖼 内置插图：开（常开）');
        },
        get: function () { return illustEnabled(); }
      };
    } catch (e2) {}
    /* ★ v170：兜底 —— 上面那个大 try 万一在挂 __sprExtIllust 时抛了，
       __sprIllust 就永远不存在，面板上「重新打开插图」会摸不到 API。
       这里补一次，保证内置插图的开关**始终**有出口（判据单一：只有这一份实现）。 */
    if (!HOST.__sprIllust) {
      try {
        HOST.__sprIllust = {
          set: function () {
            /* ★ 2026-11-18：只开不关（同上，兜底那一份也必须同口径）。 */
            try { HOST.localStorage.setItem('SPR_ILLUST_ON', 'on'); } catch (eS2) {}
            try { paint(); } catch (eP2) {}
            try { extToast('🖼 内置插图：开（常开）'); } catch (eT2) {}
          },
          get: function () { return illustEnabled(); }
        };
      } catch (e3) {}
    }
    if (extOn) extScan(); else { extQueue = []; extIdx = 0; extRender(); extPaintBtn(); }
    /* ★ v171：把沉浸式的口子也挂出去（HOST + window 两处），
       面板 / 快捷指令想切就切，不用去猜按钮在哪。
       ⚠ 只挂「查询 / 切换 / 强制进出」四件，不挂内部 apply —— 内部那个不写偏好，
         外面误调会让玩家的「别再自动进」失效。 */
    try {
      HOST.__sprImmersive = {
        isOn: immIsOn,
        toggle: toggleImmersive,
        enter: function () { immersiveApply(true); },
        exit: function () { immersiveApply(false); },
        prefOff: immPrefOff           /* true = 玩家明确退出过，不再自动进 */
      };
      window.__sprImmersive = HOST.__sprImmersive;
    } catch (eImmApi) {}
    /* ★ 21:45：关着的时候不要每 1.5 秒全量扫 DOM（白耗性能、还可能攒脏图） */
    if (!extTimer) extTimer = setInterval(function () {
      try { if (extOn) { extScan(); extPaintBtn(); } } catch (e3) {}
    }, 1500);
  }

  function init() {
    try { ensureStyles(); } catch (eS) {}
    try { ensureDOM(); } catch (eD) {}
    try { extBoot(); } catch (eX) {}
    var doc = getDoc();
    var target = doc.getElementById('chat') || doc.body;
    try {
      var _galAnimFrame = null;
      function scheduleParseAndRender() {
        if (_galAnimFrame) return;
        _galAnimFrame = (window.requestAnimationFrame || function (cb) { return setTimeout(cb, 60); })(function () {
          _galAnimFrame = null;
          try { parseAndRender(); } catch (eP) {}
        });
      }
      /* ★ v100：观察器全局只留一份 —— 脚本热更不刷页面时不会叠出一堆旧实例 */
      try { if (HOST.__galObserver) HOST.__galObserver.disconnect(); } catch (eOb) {}
      var ob = new MutationObserver(function () { scheduleParseAndRender(); try { extScan(); } catch (eI) {} });
      ob.observe(target, { childList: true, subtree: true, characterData: true });
      HOST.__galObserver = ob;
    } catch (e) {}
    try {
      window.addEventListener('resize', syncCgRect, true);
      HOST.addEventListener && HOST.addEventListener('resize', syncCgRect, true);
      /* 聊天区滚动（捕获阶段能收到内部滚动） */
      doc.addEventListener('scroll', syncCgRect, true);
      doc.addEventListener('wheel', function () { setTimeout(syncCgRect, 60); }, { passive: true, capture: true });
    } catch (e2) {}
    setTimeout(function () { try { parseAndRender(); } catch (e3) {} }, 400);
  }

  /* ══ ★ v100：常驻读秒嗅探 ══
     以前心跳写在 init() 末尾：init 中途一旦抛错就再也注册不上；
     而且脚本热更时旧实例的心跳不会清掉，越叠越多 —— 这就是玩家感觉到的「条件嗅探」。
     现在心跳挂在宿主 window 上，全局只有一份，永远调用「最新实例」的解析函数。
     没有标签 → 什么都不显示；有标签 → 下一拍（≤1 秒）立即显示。
     头 4 秒另加 400ms 的快拍，兜住「页面刚起来、#chat / 壳还没就绪」的空窗。 */
  function beat() {
    try { parseAndRender(); } catch (eB) {}
    try { syncCgRect(); } catch (eB2) {}
  }
  try {
    HOST.__galBeat = beat;                 /* 永远指向最新实例 */
    if (!HOST.__galPollTimer) {
      HOST.__galPollTimer = setInterval(function () {
        try { if (typeof HOST.__galBeat === 'function') HOST.__galBeat(); } catch (eT) {}
      }, POLL_MS);
    }
    if (!HOST.__galBootTimer) {
      HOST.__galBootTimer = setInterval(function () {
        try { if (typeof HOST.__galBeat === 'function') HOST.__galBeat(); } catch (eT2) {}
      }, 400);
      setTimeout(function () {
        try { clearInterval(HOST.__galBootTimer); } catch (eT3) {}
        HOST.__galBootTimer = null;
      }, 4000);
    }
  } catch (ePoll) {}

  if (getDoc().readyState === 'loading') {
    getDoc().addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 1500);
})();
