/* 春日狂想曲·统一版 v10.6 · 13-gal.js · 源脚本：[同层] Galgame界面与动态图床 */
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
  var STYLE_VER = 'v125-20261026';
  /* ★ v100：常驻读秒嗅探的周期（毫秒）。玩家手写进正文的 <插图> 标签，
     最迟一拍（1 秒）内就会被读到并显示；删掉标签同样一拍内消失。 */
  var POLL_MS = 1000;
  var NAMEPLATE_ID = 'gal-nameplate-box';
  var CG_CONTAINER_ID = 'gal-cg-background';
  var CG_FIGURE_ID = 'gal-cg-figure';
  var NEXT_BTN_ID = 'gal-cg-next-btn';
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
    '春日久美子|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_13.png',
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
    '吉川美穗|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕+足交前夕_06.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_07.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_08.png',
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
    '神谷奈绪|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_19.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_20.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交前夕+做爱前夕_21.png'
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
    '山上椿芽|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_16.png',
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
    '朝仓茜野|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_17.png',
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
    '御神木之灵|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+手交_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+足交前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_13.png',
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
    '桃崎千鹤|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交前夕+做爱前夕_18.png'
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
    '水野千晴|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕+足交前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_14.png',
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
    '白坂结奈|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_17.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前戏_18.png',
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
    '白蔵主|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_23.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交前夕+做爱前夕_25.png'
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
    '神代凛音|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕+足交前夕_14.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_15.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_16.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_17.png',
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
    '斋宫若叶|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕+足交前夕_08.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_10.png',
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
    '春日葵|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕+足交前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交_24.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交前夕+做爱前夕_25.png'
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
    '西村百花|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_10.png',
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
    '春日静奈|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_09.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_10.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_13.png',
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
    '香本千玲|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_11.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_12.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_13.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_21.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_22.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交前夕+做爱前夕_23.png'
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
    '藤宫紫苑|手势前戏': [
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_18.png',
      'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_19.png',
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
  /* 三态取图：角色没新图 → 整套用旧图；有新图 → 再按动作组回退；融合时拼队列 */
  function poolOf(key) {
    var v = galArtSetOf();
    if (v === '旧插图') return GALLERY_POOLS[key];
    /* ① 这个角色整套没给新插图 → 全部动作默认使用旧插图 */
    if (!galCharHasNew(String(key || '').split('|')[0])) return GALLERY_POOLS[key];
    var np = NEW_ART_GALLERY_POOLS[key];
    var op = GALLERY_POOLS[key];
    if (np && np.length) {
      if (v === '新插图') return np;
      /* ★ 新旧融合：新组在前、旧组接后，同一张 URL 一轮里只出现一次 */
      if (!op || !op.length) return np;
      var out = [], seen = {}, i;
      for (i = 0; i < np.length; i++) if (np[i] && !seen[np[i]]) { seen[np[i]] = 1; out.push(np[i]); }
      for (i = 0; i < op.length; i++) if (op[i] && !seen[op[i]]) { seen[op[i]] = 1; out.push(op[i]); }
      return out;
    }
    return op;                            /* ② 该动作没新图 → 回退旧图 */
  }
  /* 新旧库合并的键集合（只用于「未命中」时列可选动作，旧库一个键都不丢） */
  function poolKeys() {
    var out = {}, k, v = galArtSetOf();
    for (k in GALLERY_POOLS) if (Object.prototype.hasOwnProperty.call(GALLERY_POOLS, k)) out[k] = 1;
    if (v !== '旧插图') {
      for (k in NEW_ART_GALLERY_POOLS) if (Object.prototype.hasOwnProperty.call(NEW_ART_GALLERY_POOLS, k)) out[k] = 1;
    }
    return out;
  }
  /* 队列签名带版本：局内切版本时签名必变，setQueue 会立刻重建整条队列 */
  function galArtTag() { return '[' + galArtSetOf() + ']|'; }
  try { HOST.__galArtSetOf = galArtSetOf; HOST.__galNewPools = NEW_ART_GALLERY_POOLS; } catch (eExp) {}

  /* 动作文字 → 动作键（模型怎么写都能对上）
     ★ v125：新增 4 个动作，**判定顺序很要紧** —— 长词必须先判，
       否则「授乳手交」会被「手交」截走。 */
  function actionKeyOf(actionText) {
    var a = String(actionText || '');
    /* ① 前戏：手势 O 圈吐舌头（一轮一次，且永远排最前） */
    if (a.indexOf('手势') !== -1 || a.indexOf('O圈') !== -1 || a.indexOf('o圈') !== -1 ||
        a.indexOf('Ｏ圈') !== -1 || a.indexOf('吐舌') !== -1 || a.indexOf('圈口') !== -1) return '手势前戏';
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
      '}',      '#' + NEXT_BTN_ID + '.in-shell {',
      '  position: absolute !important;',
      '  right: 10px !important;',
      '  bottom: 6px !important;',
      '  left: auto !important;',
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
      /* ★ v10.7：自动开关也要能嵌进壳内，否则壳里只有推进按钮、开关还飘在外面 */
      '#' + AUTO_BTN_ID + '.in-shell {',
      '  position: absolute !important;',
      '  left: 10px !important;',
      '  right: auto !important;',
      '  bottom: 6px !important;',
      '}',
      '#' + AUTO_BTN_ID + ':hover { border-color: #93c5fd !important; }',
      '#' + AUTO_BTN_ID + '.is-fixed {',
      '  opacity: 0.72 !important;',
      '  border-color: rgba(148, 163, 184, 0.6) !important;',
      '  color: #cbd5e1 !important;',
      '}',
      '#' + AUTO_BTN_ID + ' .dot { font-size: 10px !important; }'
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
    if (!doc.getElementById(NEXT_BTN_ID)) {
      var btn = doc.createElement('div');
      btn.id = NEXT_BTN_ID;
      btn.innerHTML = '<span class="arrow">▶</span><span class="label">下一张</span><span class="num"></span>';
      btn.onclick = function (e) {
        e.stopPropagation();
        stepGallery(1, true);
      };
      doc.body.appendChild(btn);
    }
    /* ★ v125：自动 / 固定 开关。点了就切模式并存偏好，不用刷新页面。 */
    if (!doc.getElementById(AUTO_BTN_ID)) {
      var abtn = doc.createElement('div');
      abtn.id = AUTO_BTN_ID;
      abtn.innerHTML = '<span class="dot">●</span><span class="label">自动 1 秒</span>';
      abtn.onclick = function (e) {
        e.stopPropagation();
        state.autoFixed = !state.autoFixed;
        saveFixedPref(state.autoFixed);
        paintAutoBtn();
        restartAutoTimer();
      };
      doc.body.appendChild(abtn);
    }
  }

  /* ★ v125：开关按钮的文案 —— 说的是「现在是什么模式」，不是「点了会怎样」，
     免得玩家看着「固定」两个字以为当前已经固定了。 */
  function paintAutoBtn() {
    var doc = getDoc();
    var b = doc.getElementById(AUTO_BTN_ID);
    if (!b) return;
    var lab = b.querySelector('.label');
    var dot = b.querySelector('.dot');
    if (state.autoFixed) {
      if (b.classList) b.classList.add('is-fixed');
      if (lab) lab.textContent = '固定';
      if (dot) dot.textContent = '■';
    } else {
      if (b.classList) b.classList.remove('is-fixed');
      if (lab) lab.textContent = '自动 1 秒';
      if (dot) dot.textContent = '●';
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

    var nb = doc.getElementById(NEXT_BTN_ID);
    var ab = doc.getElementById(AUTO_BTN_ID);

    if (vp) {
      try { if (box.parentNode !== vp) vp.appendChild(box); } catch (e1) {}
      try { if (fig && fig.parentNode !== vp) vp.appendChild(fig); } catch (e2) {}
      /* ★ v10.7：按钮搬进游戏视口。以前只有图和黑幕进壳，按钮还是 fixed 在
         整个窗口上，看着像贴在酒馆界面左下角的播放器。 */
      try { if (nb && nb.parentNode !== vp) vp.appendChild(nb); } catch (eN1) {}
      try { if (ab && ab.parentNode !== vp) vp.appendChild(ab); } catch (eA1) {}
      if (box.classList) box.classList.add('in-shell');
      if (fig && fig.classList) fig.classList.add('in-shell');
      if (nb && nb.classList) nb.classList.add('in-shell');
      if (ab && ab.classList) ab.classList.add('in-shell');
      try { box.style.left = ''; box.style.top = ''; box.style.width = ''; box.style.height = ''; } catch (e3) {}
      try { if (fig) { fig.style.left = ''; fig.style.top = ''; fig.style.width = ''; fig.style.height = ''; } } catch (e4) {}
      return;
    }

    try { if (box.parentNode !== doc.body) doc.body.appendChild(box); } catch (e5) {}
    try { if (fig && fig.parentNode !== doc.body) doc.body.appendChild(fig); } catch (e6) {}
    try { if (nb && nb.parentNode !== doc.body) doc.body.appendChild(nb); } catch (eN2) {}
    try { if (ab && ab.parentNode !== doc.body) doc.body.appendChild(ab); } catch (eA2) {}
    if (box.classList) box.classList.remove('in-shell');
    if (fig && fig.classList) fig.classList.remove('in-shell');
    if (nb && nb.classList) nb.classList.remove('in-shell');
    if (ab && ab.classList) ab.classList.remove('in-shell');
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
    if (group.length <= 1) {
      btn.classList.remove('is-shown');
      btn.classList.remove('is-single');
      var ab1 = doc.getElementById(AUTO_BTN_ID);
      if (ab1) ab1.classList.remove('is-shown');
      return;
    }
    btn.classList.add('is-shown');
    btn.classList.remove('is-single');
    var numEl = btn.querySelector('.num');
    if (numEl) numEl.textContent = (Math.min(state.index, group.length - 1) + 1) + '/' + group.length;
    var labelEl = btn.querySelector('.label');
    if (labelEl) {
      labelEl.textContent = (state.index >= group.length - 1) ? '回到第一张' : '下一张';
    }
    var abtn = doc.getElementById(AUTO_BTN_ID);
    if (abtn) abtn.classList.add('is-shown');
    paintAutoBtn();
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
          if (m.is_user === true || m.isUser === true) continue;
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
          if (g.is_user === true || g.isUser === true) continue;
          pushTag(String(gt), 'TH#' + j);
          break;
        }
      }
    } catch (e3) {}

    /* ③ DOM：当前可见的最后一条消息 */
    try {
      var nodes = Array.from(doc.querySelectorAll('.mes_text, .mes, .message, #chat .mes'));
      if (nodes.length) {
        var el = nodes[nodes.length - 1];
        pushTag(el.textContent || el.innerText || '', 'dom');
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
  var extOn = false;
  var extTimer = null;

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
    el.setAttribute('style', 'position:absolute;inset:0;z-index:2147483636;pointer-events:none;opacity:0;transition:opacity .25s ease;background:#000 center/contain no-repeat;');
    return el;
  }

  function extRender() {
    var el = extLayer();
    if (!el) return;
    if (!extOn || !extQueue.length) { el.style.opacity = '0'; return; }
    var src = extQueue[extIdx] || '';
    el.style.backgroundImage = src ? 'url("' + src + '")' : 'none';
    el.style.opacity = '1';
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
      if (img.closest && img.closest('.mes_avatar, .avatar, .mes_avatar_img, .expression-holder, .avatar img')) return '';
    } catch (e0) {}
    var src = img.currentSrc || img.getAttribute('src') || '';
    if (!src || !/^(https?:\/\/|blob:|data:image\/)/i.test(src)) return '';
    var w = img.naturalWidth || 0, h = img.naturalHeight || 0;
    if (w && h && (w < 200 || h < 200)) return '';    /* 图标 / 表情 */
    return src;
  }

  function extScan() {
    var doc = extDoc();
    if (!doc) return 0;
    var added = 0, s, i, j, k;
    var list = doc.querySelectorAll('#chat img, .mes_text img, .mes img');
    for (i = 0; i < list.length; i++) { s = extPick(list[i]); if (s && extAdd(s)) added++; }
    /* 插件把图装 iframe 的情况 */
    var fr = doc.querySelectorAll('#chat iframe, .mes_text iframe, .mes iframe');
    for (j = 0; j < fr.length; j++) {
      try {
        var inner = fr[j].contentDocument;
        if (!inner) continue;
        var il = inner.querySelectorAll('img');
        for (k = 0; k < il.length; k++) { s = extPick(il[k]); if (s && extAdd(s)) added++; }
        /* iframe 内用背景图渲染的情况 */
        var all = inner.querySelectorAll('div,span,section,p');
        for (k = 0; k < all.length; k++) {
          var bg = '';
          try { bg = inner.defaultView.getComputedStyle(all[k]).backgroundImage || ''; } catch (eB) { bg = ''; }
          var mm = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (mm && /^(https?:\/\/|blob:|data:image\/)/i.test(mm[1])) { if (extAdd(mm[1])) added++; }
        }
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
      b.textContent = '🖼';
      b.title = '外置插图（生图插件产出）：点一下显示 / 再点关掉';
      b.setAttribute('style', 'position:absolute;top:10px;right:10px;z-index:2147483637;width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(217,187,122,.55);background:rgba(14,12,10,.72);color:#e6c884;font-size:17px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);');
      b.addEventListener('click', function (ev) { ev.stopPropagation(); extToggle(); });
      vp.appendChild(b);
    }
    return b;
  }

  function extPaintBtn() {
    var b = extBtn();
    if (!b) return;
    b.style.borderColor = extOn ? 'rgba(230,200,132,.95)' : 'rgba(217,187,122,.55)';
    b.style.background = extOn ? 'rgba(60,44,20,.85)' : 'rgba(14,12,10,.72)';
    b.textContent = extOn ? '🖼' : '🖼';
    b.title = extOn
      ? ('外置插图：开（' + (extQueue.length ? (extIdx + 1) + '/' + extQueue.length : '还没抓到图') + '）· 点一下关掉')
      : '外置插图（生图插件产出）：点一下显示 / 再点关掉';
  }

  function extToggle() {
    extOn = !extOn;
    if (extOn) { extScan(); extIdx = Math.max(0, extQueue.length - 1); }
    extRender();
    extPaintBtn();
    try { HOST.localStorage.setItem('SPR_EXT_ILLUST', extOn ? 'on' : 'off'); } catch (e) {}
    extToast(extOn
      ? (extQueue.length ? '🖼 外置插图：开（' + extQueue.length + ' 张）' : '🖼 外置插图：开 —— 还没抓到图，等插件出图')
      : '🖼 外置插图：关');
  }

  function extBoot() {
    try { if (HOST.localStorage.getItem('SPR_EXT_ILLUST') === 'on') extOn = true; } catch (e) {}
    try {
      HOST.__sprExtIllust = {
        toggle: extToggle,
        scan: extScan,
        count: function () { return extQueue.length; },
        list: function () { return extQueue.slice(); },
        next: function () { if (extQueue.length) { extIdx = (extIdx + 1) % extQueue.length; extRender(); extPaintBtn(); } }
      };
    } catch (e2) {}
    extScan();
    if (!extTimer) extTimer = setInterval(function () { try { extScan(); extPaintBtn(); } catch (e3) {} }, 1500);
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
