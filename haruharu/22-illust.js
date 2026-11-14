/* 春日狂想曲·统一版 v1.22 · 22-illust.js · 源脚本：[非同层] 10-插图队列渲染 */
/* ============================================================
   《10-插图队列渲染 · v11 轮播版》
   把正文里的 <插图>人物｜动作</插图> 渲染成图片，默认 2 秒自动切一张。

   口径（与同层版一致，但实现独立）：
   - 模型只写「人物｜动作」，**不写 URL** —— URL 全部在下面的 GALLERY_POOLS 里。
     这样模型不用背 57 组链接，也就不会抄错一个字符导致图挂了。
   - 一组 = 一条播放列表：同一个动作有多张图时，**一个框里自动轮播**，
     默认 2 秒一张；玩家可以按「固定」停在当前这张，也可以按 ◀ / ▶ 手动翻。
     手动翻过之后重新计 2 秒，不会刚翻完又被自动跳走。
   - 标签没了就立刻收干净（玩家删掉标签 / 换 swipe 都要跟着变）。
   - 认不出的「人物｜动作」不渲染，只在控制台提示 —— 绝不留破图。
   - 定时器带存活自检：消息被 swipe 换掉、DOM 被酒馆重建后元素就不在文档里了，
     定时器必须自杀，否则每换一次 swipe 就多一个空转的 interval。

   与同层版 Galgame 壳的区别：这里**只把 <插图> 变成正文里的 <img>**，
   不接管视口、不铺满全屏、不隐藏立绘，因此不会和本卡状态栏打架。
   ============================================================ */
(function () {
  'use strict';

  var VER = 'v13-20261028';
  var STYLE_ID = 'th-illu-styles';
  var POLL_MS = 1000;
  /* 自动轮播间隔：一张图停 2 秒 */
  var ROTATE_MS = 2000;

  /* ══════════════════════════════════════════════════════════
     图组库：键「人物|动作」→ 有序 URL 数组（顺序 = 播放顺序）
     由 07-图床同步.js 从同层版提取，勿手改；要改先改同层版再重跑。
     ══════════════════════════════════════════════════════════ */
  var GALLERY_POOLS = {
  "吉川美穗|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕+足交前夕_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱前夕_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__足交_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__足交_13.png"
  ],
  "吉川美穗|口交": [
    "https://a.imgckr.com/2026/10/13/XVJ3G.png"
  ],
  "吉川美穗|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__授乳+手交_11.png"
  ],
  "吉川美穗|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__授乳+手交_11.png"
  ],
  "吉川美穗|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__乳交_01.png"
  ],
  "吉川美穗|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__做爱尾声_09.png"
  ],
  "春日久美子|口交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_2口交_001.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/久美子/久美子_2口交_002.png",
    "https://a.imgckr.com/2026/10/13/XGQBU.png"
  ],
  "春日久美子|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__手交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳+手交_22.png"
  ],
  "春日久美子|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳+手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳_23.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__授乳_24.png"
  ],
  "春日久美子|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__乳交_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__乳交_03.png"
  ],
  "春日久美子|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱尾声_14.png"
  ],
  "桃崎千鹤|口交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_2口交_001.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/桃崎/桃崎_2口交_002.png"
  ],
  "桃崎千鹤|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__手交_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳+手交_14.png"
  ],
  "桃崎千鹤|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳+手交_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__授乳_15.png"
  ],
  "桃崎千鹤|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__乳交_01.png"
  ],
  "桃崎千鹤|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱尾声_12.png"
  ],
  "春日葵|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕+足交前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__足交前夕+做爱前夕_25.png"
  ],
  "春日葵|口交": [
    "https://a.imgckr.com/2026/10/13/XVPJ0.png"
  ],
  "春日葵|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳+手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳_23.png"
  ],
  "春日葵|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__乳交_03.png"
  ],
  "春日葵|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__做爱尾声_13.png"
  ],
  "春日静奈|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕+足交前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_23.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_25.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__足交_26.png"
  ],
  "春日静奈|口交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_2口交_001.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/静奈/静奈_2口交_002.png"
  ],
  "春日静奈|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__手交_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳+手交_20.png"
  ],
  "春日静奈|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳+手交_20.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__授乳_21.png"
  ],
  "春日静奈|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__乳交_01.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__乳交_02.png"
  ],
  "春日静奈|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱尾声_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__做爱尾声_15.png"
  ],
  "香本千玲|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__足交前夕+做爱前夕_23.png"
  ],
  "香本千玲|口交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_2口交_001.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/character-images@main/香本/香本_2口交_002.png"
  ],
  "香本千玲|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__手交_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__手交_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳+手交_19.png"
  ],
  "香本千玲|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳+手交_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__授乳_20.png"
  ],
  "香本千玲|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__乳交_01.png"
  ],
  "香本千玲|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__做爱尾声_14.png"
  ],
  "月读澪|手交": [
    "https://a.imgckr.com/2026/10/13/XVYFe.png"
  ],
  "月读澪|乳交": [
    "https://a.imgckr.com/2026/10/13/XVUYl.png"
  ],
  "月读澪|做爱": [
    "https://a.imgckr.com/2026/10/13/XVigS.png"
  ],
  "神代凛音|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__手交_23.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳+手交_24.png"
  ],
  "神代凛音|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__乳交_04.png"
  ],
  "神代凛音|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱尾声_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱结尾_19.png"
  ],
  "斋宫若叶|口交": [
    "https://a.imgckr.com/2026/10/13/XVOLv.png",
    "https://a.imgckr.com/2026/10/13/XVemd.png",
    "https://a.imgckr.com/2026/10/13/XVTtF.png"
  ],
  "斋宫若叶|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__手交_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+手交_18.png"
  ],
  "斋宫若叶|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__乳交_01.png"
  ],
  "斋宫若叶|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱尾声_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱尾声_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+做爱_17.png"
  ],
  "西村百花|口交": [
    "https://a.imgckr.com/2026/10/13/XVFx7.png"
  ],
  "西村百花|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__乳交_02.png"
  ],
  "西村百花|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱尾声_11.png"
  ],
  "春日久美子|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__足交_25.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__足交_26.png"
  ],
  "春日久美子|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥完全脱光_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥完全脱光_20.png"
  ],
  "春日久美子|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱内裤_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱内裤_17.png"
  ],
  "春日久美子|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥-刚脱衣服_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kumiko@main/kumiko__偷窥刚脱衣服_18.png"
  ],
  "吉川美穗|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-miho@main/miho__偷窥刚脱内裤_10.png"
  ],
  "神谷奈绪|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交_20.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__足交前夕+做爱前夕_21.png"
  ],
  "神谷奈绪|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交+授乳_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交_16.png"
  ],
  "神谷奈绪|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__手交+授乳_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__授乳_17.png"
  ],
  "神谷奈绪|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__乳交_01.png"
  ],
  "神谷奈绪|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__做爱尾声_11.png"
  ],
  "神谷奈绪|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥完全脱光_14.png"
  ],
  "神谷奈绪|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥刚脱内裤_12.png"
  ],
  "神谷奈绪|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-nao@main/nao__偷窥刚脱衣服_13.png"
  ],
  "山上椿芽|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱前夕_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__足交_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__足交_25.png"
  ],
  "山上椿芽|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__手交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳+手交_22.png"
  ],
  "山上椿芽|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳+手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__授乳_23.png"
  ],
  "山上椿芽|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__乳交_03.png"
  ],
  "山上椿芽|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__做爱尾声_17.png"
  ],
  "山上椿芽|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥完全脱光_20.png"
  ],
  "山上椿芽|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥刚脱内裤_18.png"
  ],
  "山上椿芽|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-tsubaki@main/tsubaki__偷窥刚脱衣服_19.png"
  ],
  "朝仓茜野|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕+足交前夕_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱前夕_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_28.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_29.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_30.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_31.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_32.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__足交_33.png"
  ],
  "朝仓茜野|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_23.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__手交_24.png"
  ],
  "朝仓茜野|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_25.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_26.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__授乳_27.png"
  ],
  "朝仓茜野|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__乳交_02.png"
  ],
  "朝仓茜野|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__做爱尾声_18.png"
  ],
  "朝仓茜野|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__偷窥完全脱光_20.png"
  ],
  "朝仓茜野|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-akane@main/akane__偷窥刚脱内裤_19.png"
  ],
  "御神木之灵|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+手交_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+足交前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__足交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__足交_23.png"
  ],
  "御神木之灵|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱前夕+手交_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__手交_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳+手交_19.png"
  ],
  "御神木之灵|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳+手交_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳_20.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__授乳_21.png"
  ],
  "御神木之灵|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__乳交_02.png"
  ],
  "御神木之灵|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__做爱尾声_14.png"
  ],
  "御神木之灵|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱内裤_15.png"
  ],
  "御神木之灵|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱衣服_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-kodama@main/kodama__偷窥刚脱衣服_17.png"
  ],
  "桃崎千鹤|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__做爱前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chizuru@main/chizuru__足交前夕+做爱前夕_18.png"
  ],
  "水野千晴|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕+足交前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__足交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__足交_22.png"
  ],
  "水野千晴|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__手交_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳+手交_19.png"
  ],
  "水野千晴|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳+手交_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__授乳_20.png"
  ],
  "水野千晴|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__乳交_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__乳交_03.png"
  ],
  "水野千晴|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__做爱尾声_15.png"
  ],
  "水野千晴|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__偷窥刚脱内裤_16.png"
  ],
  "水野千晴|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-mizudori@main/mizudori__偷窥刚脱衣服_17.png"
  ],
  "白坂结奈|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前夕_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱前戏_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_28.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_29.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_30.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_31.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_32.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__足交_33.png"
  ],
  "白坂结奈|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__手交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__手交_23.png"
  ],
  "白坂结奈|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_25.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_26.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__授乳_27.png"
  ],
  "白坂结奈|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__乳交_02.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__乳交_03.png"
  ],
  "白坂结奈|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__做爱尾声_19.png"
  ],
  "白坂结奈|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__偷窥刚脱内裤_20.png"
  ],
  "白坂结奈|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-yuna@main/yuna__偷窥刚脱衣服_21.png"
  ],
  "白蔵主|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_12.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_13.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_23.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__足交前夕+做爱前夕_25.png"
  ],
  "白蔵主|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__手交_18.png"
  ],
  "白蔵主|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__授乳_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__授乳_20.png"
  ],
  "白蔵主|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__乳交_02.png"
  ],
  "白蔵主|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_03.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_04.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__做爱尾声_15.png"
  ],
  "白蔵主|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__偷窥洗澡刚脱内裤_16.png"
  ],
  "白蔵主|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-byakuro@main/byakuro__偷窥洗澡刚脱衣服_17.png"
  ],
  "神代凛音|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕+足交前夕_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__做爱前夕_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_29.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_30.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_31.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__足交_32.png"
  ],
  "神代凛音|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳+手交_24.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_25.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_26.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_27.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__授乳_28.png"
  ],
  "神代凛音|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__偷窥刚脱内裤_20.png"
  ],
  "神代凛音|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-rinne@main/rinne__偷窥刚脱衣服_21.png"
  ],
  "斋宫若叶|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕+足交前夕_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__做爱前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__足交_20.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__足交_21.png"
  ],
  "斋宫若叶|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+做爱_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳+手交_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__授乳_19.png"
  ],
  "斋宫若叶|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥完全脱光_15.png"
  ],
  "斋宫若叶|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥刚脱内裤_13.png"
  ],
  "斋宫若叶|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-wakaba@main/wakaba__偷窥刚脱衣服_14.png"
  ],
  "春日葵|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__手交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__授乳+手交_22.png"
  ],
  "春日葵|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥完全脱光_20.png"
  ],
  "春日葵|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱内裤_14.png"
  ],
  "春日葵|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-aoi@main/aoi__偷窥刚脱衣服_17.png"
  ],
  "西村百花|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__做爱前夕_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__足交_21.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__足交_22.png"
  ],
  "西村百花|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__手交_16.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳+手交_17.png"
  ],
  "西村百花|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳+手交_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__授乳_20.png"
  ],
  "西村百花|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥完全脱光_14.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥完全脱光_15.png"
  ],
  "西村百花|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥刚脱内裤_12.png"
  ],
  "西村百花|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-momoka@main/momoka__偷窥刚脱衣服_13.png"
  ],
  "春日静奈|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥完全脱光_18.png"
  ],
  "春日静奈|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥刚脱内裤_16.png"
  ],
  "春日静奈|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shizuna@main/shizuna__偷窥刚脱衣服_17.png"
  ],
  "香本千玲|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__偷窥全部脱光_15.png"
  ],
  "香本千玲|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-chirei@main/chirei__偷窥刚脱内裤_16.png"
  ],
  "藤宫紫苑|手势前戏": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_18.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手势前戏_19.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__足交_22.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__足交_23.png"
  ],
  "藤宫紫苑|手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__手交_17.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交+手交_20.png"
  ],
  "藤宫紫苑|授乳手交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交+手交_20.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__授乳手交_21.png"
  ],
  "藤宫紫苑|乳交": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__乳交_04.png"
  ],
  "藤宫紫苑|做爱": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_05.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_06.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_07.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_08.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_09.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_10.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_11.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__做爱_12.png"
  ],
  "藤宫紫苑|偷窥完全脱光": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥完全脱光_15.png",
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥完全脱光_16.png"
  ],
  "藤宫紫苑|偷窥刚脱内裤": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥刚脱内裤_13.png"
  ],
  "藤宫紫苑|偷窥刚脱衣服": [
    "https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/haruharu-shion@main/shion__偷窥刚脱衣服_14.png"
  ]
};

  /* ══════════════════════════════════════════════════════════
     ★★★ v13：闭合标签必须是**可选的** ★★★

     这是 v9.6/v9.7「插图死活不出来」的真凶，比 <q> 那次更隐蔽。

     酒馆 messageFormatting 在 showdown 之后还要过一遍 DOMPurify：
       public/script.js: ~1793  DOMPurify.sanitize(mes, { MESSAGE_SANITIZE: true })

     实测三阶段的产物（真实正文「静奈那双眼眸。\n<插图>…</插图>\n…」）：

       ① 原文           <插图>春日久美子｜手交</插图>
       ② showdown 后    <p>…<br>                             ← DOM：TXT "<插图>春日久美子｜手交" + CMT "插图"
          <插图>春日久美子｜手交</插图><br> …
       ③ DOMPurify 后   <p>…<br>                             ← CMT 被删了！只剩
          &lt;插图&gt;春日久美子｜手交<br> …                    TXT "\n<插图>春日久美子｜手交"

     两件事同时发生：
       · DOMPurify **默认删除 HTML 注释** ⇒ 我们原来靠注释节点补回的 </插图> 没了
       · 未闭合的开标签被转义成 &lt;插图&gt;

     所以真实 DOM 里既没有注释、也没有闭合标签，只剩一个裸的
     "<插图>春日久美子｜手交" 文本。任何要求 </插图> 的正则必然全灭。

     结论：正则里 </插图> 一律写成可选；携带的信息到行尾/`<`/换行就算结束。
     这也顺带兼容玩家手写漏了闭合标签的情况。
     ══════════════════════════════════════════════════════════ */
  /* ⚠ act 必须是**贪婪**的 [^<\n]{1,20}，不能写 {1,20}?。
     原因：后面跟的是可选组 (?:<\/插图>)?，惰性量词会为了「让后面能匹配」
     而在最早的位置收手 —— 实测「<插图>春日久美子｜手交」被截成
     who=春日久美子 / act=手（「交」被丢掉），查图组库当然查不到。
     贪婪 + 字符类里排除 `<` 和换行，天然会在标签边界停下，够用。 */
  var ILLU_BODY = '\\s*([^<｜|\\n]{1,20}?)\\s*[｜|]\\s*([^<\\n]{1,20})(?:\\s*[｜|]\\s*图床[:：]\\s*<?(https?:\\/\\/[^<>\\s"]+?)>?)?\\s*';
  /* 带 <插图> 前缀的完整模式，替换段要拿它 new RegExp(…,'g') 逐个匹配 */
  var ILLU_BODY_PATTERN = '<插图>' + ILLU_BODY + '(?:<\\/插图>)?';
  /* 闭合标签可选：有就吃，没有也不影响 */
  var ILLU_RE = new RegExp(ILLU_BODY_PATTERN, 'g');
  /* 同上，但要求必须闭合 —— 只在极少数「想严格一点」的地方用，正常别用 */
  var ILLU_RE_STRICT = new RegExp('<插图>' + ILLU_BODY + '<\\/插图>', 'g');


  /* 解析：返回 [{who, act, urls}] —— 纯函数，04 单测直接调 */
  function parseIllus(text) {
    var out = [];
    var s = String(text == null ? '' : text);
    var m;
    ILLU_RE.lastIndex = 0;
    while ((m = ILLU_RE.exec(s)) !== null) {
      var who = String(m[1] || '').trim();
      var act = String(m[2] || '').trim();
      if (!who || !act) continue;
      var urls = poolOf(who, act);
      /* 兼容老写法：标签里自带 URL 就直接用它 */
      if (!urls.length && m[3]) urls = [String(m[3]).trim()];
      out.push({ who: who, act: act, urls: urls });
    }
    return out;
  }

  /* 查表。动作名容错：「口交2」「口交3」这类序号先剥掉；
     再退一步按前缀匹配，让「做爱」也能吃到「做爱女上位」的图组。 */
  var _aliasCache = {};
  function poolOf(who, act) {
    var n = String(who || '').trim();
    var a = String(act || '').trim();
    if (!n || !a) return [];
    var key = n + '|' + a;
    if (Object.prototype.hasOwnProperty.call(_aliasCache, key)) return _aliasCache[key];

    var hit = GALLERY_POOLS[key];
    if (!hit) {
      var bare = a.replace(/\s*\d+$/, '');
      hit = GALLERY_POOLS[n + '|' + bare];
    }
    if (!hit) {
      /* 前缀匹配：同一个人、动作名以此开头 */
      var pre = n + '|';
      for (var k in GALLERY_POOLS) {
        if (k.indexOf(pre) !== 0) continue;
        var ka = k.slice(pre.length);
        if (ka.indexOf(a) === 0 || a.indexOf(ka) === 0) { hit = GALLERY_POOLS[k]; break; }
      }
    }
    _aliasCache[key] = hit || [];
    return _aliasCache[key];
  }

  var CSS = [
    '.thillu{margin:12px 0;text-align:center;}',
    '.thillu-frame{position:relative;display:inline-block;max-width:88%;border-radius:10px;overflow:hidden;',
    'box-shadow:0 4px 14px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);',
    'background:rgba(0,0,0,.2);line-height:0;}',
    '.thillu-frame img{max-width:100%;height:auto;display:block;}',
    /* 左右热区：点左边上一张、点右边下一张。鼠标悬浮才显形，不挡图。 */
    '.thillu-hot{position:absolute;top:0;bottom:0;width:28%;cursor:pointer;opacity:0;',
    'transition:opacity .15s;display:flex;align-items:center;justify-content:center;',
    'font-size:20px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.7);user-select:none;}',
    '.thillu-hot.left{left:0;}',
    '.thillu-hot.right{right:0;}',
    '.thillu-frame:hover .thillu-hot{opacity:.55;}',
    '.thillu-hot:hover{opacity:.95 !important;background:rgba(0,0,0,.18);}',
    /* 固定状态角标：钉住了才出现，避免玩家不知道为什么不动了 */
    '.thillu-pin{position:absolute;top:6px;right:6px;font-size:10px;line-height:1;',
    'padding:4px 7px;border-radius:999px;background:rgba(245,158,11,.9);color:#1a1a1a;',
    'font-family:inherit;user-select:none;letter-spacing:.3px;}',
    '.thillu-bar{margin-top:6px;display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;}',
    '.thillu-btn{font-size:11px;line-height:1;padding:5px 10px;border-radius:999px;cursor:pointer;',
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:inherit;',
    'font-family:inherit;user-select:none;}',
    '.thillu-btn:hover{background:rgba(255,255,255,.16);}',
    '.thillu-btn:active{transform:translateY(1px);}',
    '.thillu-btn.on{background:rgba(245,158,11,.85);color:#1a1a1a;border-color:transparent;}',
    '.thillu-cap{font-size:11px;opacity:.65;letter-spacing:.2px;}',
    /* 进度小点：一组几张就几个点，看得出还剩几张 */
    '.thillu-dots{display:flex;gap:4px;align-items:center;}',
    '.thillu-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.22);',
    'transition:background .2s,transform .2s;}',
    '.thillu-dot.on{background:rgba(255,255,255,.85);transform:scale(1.35);}',
    '.thillu-broken{font-size:12px;opacity:.7;padding:10px;border-radius:8px;',
    'border:1px dashed rgba(255,255,255,.25);display:inline-block;}'
  ].join('');

  var HOST = (function () {
    try { if (window.top && window.top.document && window.top.document.body) return window.top; } catch (e) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent; } catch (e) {}
    return window;
  })();
  function getDoc() { try { return HOST.document || document; } catch (e) { return document; } }

  function ensureStyles() {
    var doc = getDoc();
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  function mk(tag, cls) { var n = getDoc().createElement(tag); if (cls) n.className = cls; return n; }

  /* 建一个插图块。多张图时在**同一个框里**轮播：
       默认 ROTATE_MS（2 秒）自动切一张
       按「⏸ 固定」停住 / 再按「▶ 自动」继续
       ◀ ▶ 或点图左右半边手动翻 —— 手动翻会重新计 2 秒，不会刚翻完就被跳走
     定时器带存活自检：元素脱离文档（swipe 换掉、消息被重建）就自杀，
     否则每换一次 swipe 都会漏一个 interval 在后台空转。 */
  function buildIllu(item) {
    var wrap = mk('div', 'thillu');
    var urls = item.urls;

    if (!urls || !urls.length) {
      var warn = mk('div', 'thillu-broken');
      warn.textContent = '（暂无图：' + item.who + '｜' + item.act + '）';
      wrap.appendChild(warn);
      return wrap;
    }

    var frame = mk('div', 'thillu-frame');
    var img = mk('img');
    img.referrerPolicy = 'no-referrer';
    img.alt = item.who + '｜' + item.act;
    img.loading = 'lazy';

    var idx = 0;
    var one = urls.length <= 1;   /* 只有一张图就没什么可轮的 */
    var pinned = false;           /* 固定：停掉自动轮播 */
    var timer = null;

    var dots = null;
    var cap = mk('span', 'thillu-cap');

    function paint(i) {
      idx = ((i % urls.length) + urls.length) % urls.length;
      img.src = urls[idx];
      cap.textContent = one ? item.act : (item.act + ' ' + (idx + 1) + '/' + urls.length);
      if (dots) {
        var ds = dots.childNodes;
        for (var d = 0; d < ds.length; d++) {
          if (d === idx) ds[d].className = 'thillu-dot on';
          else ds[d].className = 'thillu-dot';
        }
      }
    }

    function stopTimer() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function startTimer() {
      /* ⚠ 必须先 stop 再判 one/pinned —— 顺序反了的话，单图块永远不建定时器、
         也就永远不走到自检那一步，那个 interval 会一直被当成"活的"留在外面。 */
      stopTimer();
      if (one || pinned) return;
      timer = setInterval(function () {
        /* 存活自检：元素被移出文档 / 被重建 → 立刻收掉，不再占用 tick */
        try {
          if (!wrap.isConnected || !img.isConnected) { stopTimer(); return; }
        } catch (e) { stopTimer(); return; }
        paint(idx + 1);
      }, ROTATE_MS);
    }

    img.onerror = function () {
      stopTimer();
      try {
        frame.innerHTML = '';
        var bk = mk('div', 'thillu-broken');
        bk.textContent = '（图没了：' + item.who + '｜' + item.act + '）';
        frame.appendChild(bk);
      } catch (e) {}
    };
    frame.appendChild(img);

    /* 左右热区：鼠标悬浮才显形（CSS 控制透明度），不挡视线 */
    if (!one) {
      var hotL = mk('div', 'thillu-hot left'); hotL.textContent = '‹';
      var hotR = mk('div', 'thillu-hot right'); hotR.textContent = '›';
      hotL.onclick = function () { manual(-1); };
      hotR.onclick = function () { manual(1); };
      frame.appendChild(hotL);
      frame.appendChild(hotR);
    }
    wrap.appendChild(frame);

    /* 手动翻：翻完重新计 2 秒 —— 否则刚点完「下一张」立刻又被自动跳走 */
    function manual(step) {
      paint(idx + step);
      if (!pinned) startTimer();
    }

    var bar = mk('div', 'thillu-bar');
    var prev = mk('button', 'thillu-btn'); prev.type = 'button'; prev.textContent = '◀';
    prev.onclick = function () { manual(-1); };
    var next = mk('button', 'thillu-btn'); next.type = 'button'; next.textContent = '下一张 ▶';
    next.onclick = function () { manual(1); };

    var pinBtn = mk('button', 'thillu-btn');
    pinBtn.type = 'button';

    if (one) {
      /* 单图：只留说明，不摆没用的按钮 */
      bar.appendChild(cap);
    } else {
      /* 小点 + 说明 */
      dots = mk('span', 'thillu-dots');
      for (var di = 0; di < urls.length; di++) dots.appendChild(mk('span', 'thillu-dot'));
      bar.appendChild(prev);
      bar.appendChild(dots);
      bar.appendChild(cap);
      bar.appendChild(next);

      pinBtn.textContent = '⏸ 固定';
      pinBtn.onclick = function () {
        pinned = !pinned;
        if (pinned) {
          stopTimer();
          pinBtn.textContent = '▶ 自动';
          pinBtn.className = 'thillu-btn on';
          if (!frame.querySelector('.thillu-pin')) {
            var tag = mk('span', 'thillu-pin');
            tag.textContent = '已固定';
            frame.appendChild(tag);
          }
        } else {
          pinBtn.textContent = '⏸ 固定';
          pinBtn.className = 'thillu-btn';
          var old = frame.querySelector('.thillu-pin');
          if (old) old.parentNode.removeChild(old);
          startTimer();
        }
      };
      bar.appendChild(pinBtn);
    }
    wrap.appendChild(bar);

    /* 图挂载后再设 src，保证 onerror 已就位 */
    paint(0);
    startTimer();
    return wrap;
  }

  /* 渲染一条消息：把 <插图> 标签换成插图块，其余 DOM 一个都不碰。

     ★★★ v12 核心改动：彻底只认 DOM，不再读原始消息数据 ★★★
     v11 的写法是「用原始消息 raw 判断有没有插图，再去 DOM 里找 <插图> 文本节点替换」。
     这套「判断看数据、操作看 DOM」的两头对不上，导致两个致命现象（用户 2026-10-27 实测）：

       ① **开着头像脚本才显示插图**
       ② **关掉头像脚本就一张都不出**

     ⇒ 两个功能被迫绑在一起。用户明确否掉：
        「万一玩家不想要头像气泡渲染呢？人家只想要插图」。
        所以要**解耦**：本脚本自己就能在原生 DOM 里认出插图标签。

     ★★★ v12.1 补的关键一课：HTML 解析器会把 </插图> 变成注释节点 ★★★
     浏览器（和酒馆用的 marked）解析 `<插图>人物｜动作</插图>` 时：
       · `<插图>` 这个**开标签**不认识 → 转义成文本 `&lt;插图&gt;`
       · `</插图>` 这个**闭标签** → 变成**注释节点** `<!--插图-->`
     实测（jsdom，与浏览器 HTML 解析规则一致）：
       innerHTML: `<p>她笑了&lt;插图&gt;春日久美子｜手交<!--插图-->然后走开</p>`
       节点序列:  EL:P | TXT:"她笑了<插图>春日久美子｜手交" | CMT:"插图" | TXT:"然后走开"

     ⇒ **文本节点里没有闭合标签**。任何写 `/<插图>…<\/插图>/` 的正则
       在原生渲染下永远匹配不到 —— 这就是「关掉头像就一张不出」的真正原因：
       头像脚本 v11 用 innerHTML='' 重建，把两端都变成了纯文本，才碰巧能匹配。

     新做法分两步，一步都不能少：
       ① **缝合**：从含 `<插图>` 的文本节点开始，按「文本节点 → 注释节点『插图』」
          交替往后走，把被拆开的片段拼回完整字符串，并记下吃掉哪些节点。
       ② **解析**：缝合后的字符串里有真正的 `</插图>`，正则就能正常匹配；
          替换时把那串节点整体换掉，不留半截残渣。
     这样两个脚本**互不依赖**，各自开关都正常。 */
  /* ⚠ 自己产出的块就叫 `.thillu`（不是 .thillu-wrap），跳过名单必须写对，
     否则每轮都会把渲染好的插图块再扫一遍。 */
  var SKIP_SEL = '.thillu,.thdl-wrap,#th-place-modal';

  /* 把「文本节点 + 可能的注释节点 + 后续文本节点」缝成完整字符串。
     返回 { text, nodes } —— nodes 是参与拼接的全部节点（按文档顺序）。

     ★ v13：不再要求「必须补出 </插图> 才算成功」。
       真实酒馆里 DOMPurify 会把注释删掉，标签永远配不成对，
       旧判据（没配成对就 return null）等于让整个功能静默失效。
       现在只要文本里有 `<插图>` 开头就缝，能缝多少算多少。 */
  function openTag(t) {
    var i = t.lastIndexOf('<插图>');
    if (i < 0) return false;
    return i > t.lastIndexOf('</插图>');
  }
  function spliceIllust(doc, startNode) {
    var nodes = [startNode];
    var text = startNode.nodeValue;
    var cur = startNode;
    for (var guard = 0; guard < 64; guard++) {
      /* 已经闭口了（最后一个开标签在最后一个闭标签之前）就停，别把整段正文吞进来 */
      if (!openTag(text)) break;
      var nx = cur.nextSibling;
      if (!nx) break;
      /* 闭合标签被解析器吃成了注释节点（没被 DOMPurify 删掉时才存在） */
      if (nx.nodeType === 8 /* COMMENT */ && String(nx.nodeValue).trim() === '插图') {
        text += '</插图>';
        nodes.push(nx);
        cur = nx;
        continue;
      }
      /* 后续文本节点：只有还开着口才并（标签可能被 <br> 之类拆断） */
      if (nx.nodeType === 3 /* TEXT */) {
        text += (nx.nodeValue || '');
        nodes.push(nx);
        cur = nx;
        continue;
      }
      break;
    }
    /* ★ 判据改成「有开标签就行」，闭合标签交给 ILLU_RE 的可选组去处理 */
    if (text.indexOf('<插图>') < 0) return null;
    return { text: text, nodes: nodes };
  }

  function renderOne(mesEl) {
    if (!mesEl) return 0;
    var box = mesEl.querySelector('.mes_text');
    if (!box) return 0;
    var doc = getDoc();
    if (!doc.createTreeWalker) return 0;

    /* 直接在 DOM 里找 <插图> 文本节点 —— 不看原始消息 */
    var count = 0;
    var walker = doc.createTreeWalker(box, 4 /* SHOW_TEXT */, null, false);
    var targets = [];
    var tn;
    while ((tn = walker.nextNode())) {
      var nv = tn.nodeValue;
      if (!nv || nv.indexOf('<插图>') === -1) continue;   /* indexOf('插图') 太松，会白扫一堆 */
      /* 祖先落在跳过名单里就别碰（已经渲染好的插图块、对话框） */
      var p = tn.parentNode, skip = false;
      while (p && p !== box) {
        try { if (p.matches && p.matches(SKIP_SEL)) { skip = true; break; } } catch (e0) {}
        p = p.parentNode;
      }
      if (!skip) targets.push(tn);
    }
    if (!targets.length) return 0;

    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      if (!node.parentNode) continue;          /* 上一轮可能已经把它带走了 */
      if (!box.contains(node)) continue;       /* 被别的楼层替换掉的就别管了 */

      var sp = spliceIllust(doc, node);
      if (!sp) continue;

      var txt = sp.text;
      /* ★ v13：闭合标签可选。真实酒馆里 DOMPurify 删掉了注释，
         只剩裸的 "<插图>春日久美子｜手交"，写死 </插图> 就是全灭。
         每次匹配前重置副本，避免全局正则的 lastIndex 在多个节点间串味。 */
      var re = new RegExp(ILLU_BODY_PATTERN, 'g');
      var m2, last = 0, frag = doc.createDocumentFragment(), any = false;
      while ((m2 = re.exec(txt)) !== null) {
        any = true;
        if (m2.index > last) frag.appendChild(doc.createTextNode(txt.slice(last, m2.index)));
        var one = parseIllus(m2[0]);
        if (one.length) { frag.appendChild(buildIllu(one[0])); count++; }
        last = m2.index + m2[0].length;
        if (re.lastIndex === m2.index) re.lastIndex++;   /* 空匹配保护，防死循环 */
      }
      if (!any) continue;
      if (last < txt.length) frag.appendChild(doc.createTextNode(txt.slice(last)));

      /* 整串节点一起换掉：先插到第一个节点前面，再逐个删 —— 这样不会中途断链 */
      var first = sp.nodes[0];
      var parent = first.parentNode;
      if (!parent) continue;
      try {
        parent.insertBefore(frag, first);
        for (var k = 0; k < sp.nodes.length; k++) {
          var dead = sp.nodes[k];
          if (dead.parentNode) dead.parentNode.removeChild(dead);
        }
      } catch (e1) {}
    }

    return count;
  }

  /* ★ v13：同 09 —— 别只认 `#chat .mes`。容器 id 一变就静默全不工作，
     而且看起来就像「脚本坏了」，实际只是选择器落空。 */
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

  function isBusy() {
    try {
      if (HOST.__thilluBusy) return true;
      var doc = getDoc();
      if (doc.querySelector('#stop_generating:not([style*="display: none"])')) return true;
    } catch (e) {}
    return false;
  }

  function beat() {
    try { if (isBusy()) return; scanAll(); } catch (e) {}
  }

  function init() {
    try { ensureStyles(); } catch (eS) {}
    try {
      var w = HOST;
      if (w.eventOn) {
        w.eventOn('generation_started', function () { HOST.__thilluBusy = true; });
        w.eventOn('generation_stopped', function () { HOST.__thilluBusy = false; setTimeout(beat, 100); });
        w.eventOn('message_received', function () { HOST.__thilluBusy = false; setTimeout(beat, 100); });
        w.eventOn('chat_changed', function () { setTimeout(beat, 140); });
      }
    } catch (eE) {}
    try {
      if (HOST.__thilluTimer) clearInterval(HOST.__thilluTimer);
      HOST.__thilluTimer = setInterval(beat, POLL_MS);
    } catch (eT) {}
    setTimeout(beat, 500);
  }

  try {
    (HOST.__thIlluRender = {
      VER: VER,
      ROTATE_MS: ROTATE_MS,
      parseIllus: parseIllus,
      poolOf: poolOf,
      buildIllu: buildIllu,
      renderOne: renderOne,
      scanAll: scanAll,
      pools: GALLERY_POOLS
    });
  } catch (eX) {}

  init();
})();
