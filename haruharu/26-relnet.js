/* ══ 关系网（独立脚本 · 两种模式都加载）═══════════════════════════════
   作者：「是他妈的文字版的那个关系网的按钮点不了」。
   ── 真凶 ──
   关系网模块原来住在《[同层] 核心v88》里，而文字版**不加载同层脚本** ⇒
   __TH_RELNET__ 根本不存在 ⇒ 点「查看」没有任何反应（连报错都没有）。
   ⇒ 把模块整段搬出来做成 [共用] 脚本：游戏版、文字版都跑，一份代码两处用。
   模块内容与 10-core 里那份逐字相同，只补两个宿主函数（getDoc / showToast）。 */

function getDoc() {
  try { if (window.top && window.top.document && window.top.document.body) return window.top.document; } catch (e) {}
  try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent.document; } catch (e2) {}
  return document;
}
function showToast(m) {
  try { if (typeof toastr !== "undefined" && toastr.info) { toastr.info(String(m)); return; } } catch (e) {}
  try { if (window.top && window.top.toastr && window.top.toastr.info) { window.top.toastr.info(String(m)); return; } } catch (e3) {}
  try { console.log("[关系网] " + m); } catch (e4) {}
}
(function () {
  var REL_VER = 'v2-3d-20261116';

  /* ══ ★ 2026-11-16 22:29：关系网必须在 **UI 真正所在的 document** 里建 ════
     ⛔ 这是「点击没反应」的最后一个真凶，也是本项目最容易反复栽的坑：
        脚本跑在酒馆的 iframe 里，裸 `document` = **iframe 自己的文档**；
        而游戏壳 / 按钮全部渲染在 `window.top`（HOST 优先取 top）。
        旧代码到处写裸 document ⇒ 弹层被塞进 iframe 那个空文档里
        （玩家看不见），委托挂在 iframe 上 ⇒ top 里的按钮点击收不到。
        项目统一约定是 `getDoc()` = `HOST.document || document`，
        版本弹层 thOpenChangelog 早就这么写了，只有关系网漏了。
     ⇒ 这里统一走 RDOC()，不再出现裸 document。 */
  function RDOC() {
    try {
      if (typeof HOST !== 'undefined' && HOST && HOST.document && HOST.document.body) return HOST.document;
    } catch (eH) {}
    try { if (window.top && window.top.document && window.top.document.body) return window.top.document; } catch (eT0) {}
    try { if (window.parent && window.parent.document && window.parent.document.body) return window.parent.document; } catch (eP) {}
    return document;
  }

  /* id / 名字 / 篇章 / 家族 / 身份 / 对 user 是什么人 / 关键经历 */
  /* ══ ★★★ 2026-11-18 16:05：关系网必须分两套（作者强制命令）════════════════
     作者原话：「关系网有没有分两套显示，纯爱就别显示苦主，牛头就显示，然后点击后
     查看的信息也不一样，纯爱就显示纯爱那套，牛头就显示牛头那套。检查好。」

     ── 两条互不相同的维度，别混成一件事 ─────────────────────────────────
     ① **苦主节点本身**（丈夫 / 男友 / 儿子辈）：
        纯爱模式下这些人**根本不存在**，不是"存在但不显示"。
        判据来自《纯爱模式女角色现状》：久美子丧夫、美穗离异、椿芽丧夫、百花离异，
        结奈没恋人、五位公寓女主全都没有配偶 —— 所以这些男性在纯爱局里就是不存在。
        ⇒ 节点带 `niuOnly: true`，纯爱模式下**整个节点不出现**（球、边、侧栏全没有）。
     ② **同一个人的两套文案**（女角色自己）：
        她两种模式都在，只是身份/旧事不一样。
        ⇒ 节点带 `roleNiu / toUserNiu / storyNiu`，纯爱取基础字段，牛头取 *Niu。

     ⛔ 一个节点不许用两套算法判断可见性：只认 `niuOnly` 一个字段，
        `visibleNodes()` 是**唯一**的筛法，layout / buildHTML / sideFor / findNode 全走它。 */
  var NODES = [
    { id: 'user', name: '你（{{user}}）', arc: 'all', fam: '主角', role: '主角',
      toUser: '你自己', story: '夏越村：寄住在春日大平家的远房外甥；幸福公寓：301 室的普通上班族；神社：顺着鸟居误闯、发现自己出不去了。' },

    /* ── 夏越村 ── */
    /* ⚠ 春日大平 = 久美子的丈夫。纯爱模式下久美子是丧夫的寡妇（见《纯爱模式女角色现状》），
       所以他在纯爱局**不存在** ⇒ niuOnly。 */
    { id: '春日大平', name: '春日大平', arc: '村', fam: '春日家', role: '户主 · 长途货车司机',
      niuOnly: true,
      toUser: '妻弟家的孩子，寄住在他家的外甥', story: '常年在外跑车，家里的事全交给久美子。你寄住在他家，他把你当自家小辈，不多话。' },
    { id: '春日久美子', name: '春日久美子', arc: '村', fam: '春日家', role: '当家人 · 妇女会干事',
      toUser: '远房表姨（外婆妹妹的女儿）', story: '你管这一家叫「姨家」。她才是春日家真正当家的那个，你小时候起就常在她眼皮底下长大。' },
    { id: '春日静奈', name: '春日静奈', arc: '村', fam: '春日家', role: '长女 · 东京读大学',
      toUser: '表姐', story: '只有暑假回家。把你当弟弟看，见你回来会觉得家里一下子热闹了。' },
    { id: '春日葵', name: '春日葵', arc: '村', fam: '春日家', role: '次女 · 镇立高三',
      toUser: '表姐', story: '镇立高中三年级，跟你熟，但总爱端一点姐姐的架子。' },
    /* ⚠ 山上和也 = 椿芽的丈夫。纯爱模式椿芽丧夫 ⇒ 他不在场 ⇒ niuOnly。
       （儿子 山上左寻 两种模式都在，不加标记。） */
    { id: '山上和也', name: '山上和也', arc: '村', fam: '山上家', role: '木匠',
      niuOnly: true,
      toUser: '邻家叔叔', story: '常年在外做木工，家里是椿芽一个人带着左寻。' },
    { id: '山上椿芽', name: '山上椿芽', arc: '村', fam: '山上家', role: '主妇',
      toUser: '邻家婶子', story: '山上左寻的妈妈，跟村里其余人一样：不熟也不生，见面点头搭两句话。' },
    { id: '山上左寻', name: '山上左寻', arc: '村', fam: '山上家', role: '小学三年级',
      toUser: '儿时玩伴', story: '你不在的这些年他一直在村里长大，见你回来最新奇，跟西村太郎一样把你当大哥哥。' },
    /* ⚠ 西村诚 = 百花的丈夫。纯爱模式百花已离异（对方先有了别人，她带着太郎搬来）
       ⇒ 他不在村里 ⇒ niuOnly。（儿子 西村太郎 两种模式都在。） */
    { id: '西村诚', name: '西村诚', arc: '村', fam: '西村家', role: '村公所职员',
      niuOnly: true,
      toUser: '邻家叔叔', story: '西村家的户主，在村公所上班。家里在村里算大家族，房子最大。' },
    { id: '西村百花', name: '西村百花', arc: '村', fam: '西村家', role: '主妇',
      toUser: '邻家婶子', story: '西村太郎的母亲，跟其他村人一样认得你，但谈不上多深的交情。' },
    { id: '西村太郎', name: '西村太郎', arc: '村', fam: '西村家', role: '小学三年级',
      toUser: '儿时玩伴', story: '和你、左寻小时候一起玩大的。你回村这件事，在孩子堆里是件新鲜事。' },
    /* ⚠ 吉川宏 = 美穗的丈夫。纯爱模式美穗早已协议离婚、对方去了外地
       ⇒ 他不在村里 ⇒ niuOnly。（儿子 吉川大田 两种模式都在。） */
    { id: '吉川宏', name: '吉川宏', arc: '村', fam: '吉川家', role: '建材公司营业员',
      niuOnly: true,
      toUser: '远房姻亲的丈夫', story: '吉川美穗的丈夫、大田的爸爸。他知道你小时候吃过美穗奶那件旧事，却从没跟你计较。' },
    { id: '吉川美穗', name: '吉川美穗', arc: '村', fam: '吉川家', role: '主妇',
      toUser: '远房婶子——「吃她奶长大的小辈」', story: '★旧事：你小时候在她怀里吃过奶，还撞见过她洗澡，她一点没怪你。在她眼里你不是外人口里的「城里回来的孩子」，而是她亲手带过、吃过她奶的自家小辈；这份亲密连她丈夫吉川宏都默认。大田却一直为这件事吃你的醋。' },
    { id: '吉川大田', name: '吉川大田', arc: '村', fam: '吉川家', role: '小学六年级',
      toUser: '同村哥哥／一直吃醋的那个人', story: '吉川美穗的儿子。因为母亲「给你吃过奶、还撞见洗澡没生气」这件旧事，他一直把你当情敌似的记着。' },
    { id: '香本千玲', name: '香本千玲', arc: '村', fam: '香本家', role: '小卖铺看店人',
      toUser: '同村姐姐', story: '住在「三上商店」后面，一个人看店养家，还要带弟弟悠。你回来会跟她打声招呼、买点东西。' },
    { id: '香本悠', name: '香本悠', arc: '村', fam: '香本家', role: '小学六年级',
      toUser: '同村弟弟', story: '千玲的弟弟，跟大田同级。对「从城里回来的你」好奇得很。' },
    /* ⛔ 2026-11-18 15:51：志藤理惠 / 志藤上林 **已整家删除**，这两条从 NODES 里拿掉。
       上面 v165L 的注释早就写着「志藤一家三口已删」，但只删了 VILLAGE_EXTRA / ROSTER，
       NODES 与 EDGES 里这两条一直留着 ⇒ 关系网照画、人物总览照列，
       作者原话「没开启的人你他妈丢进来人物总览干你妈逼呢」。 */
    /* ★★ 2026-11-18：作者「关系网里有两个白坂结奈」——以前 arc 写 '村,公寓'，
       layout() 的 copies 规则会把她画两份（白坂结奈 + 白坂结奈#公寓）。
       现在只归**公寓**一篇：她是公寓篇亲姐 / 301 同住，是主要角色；
       村篇她只是白坂家的一员，不单列节点。角色设定没删，只是关系网不重复画。 */
    { id: '白坂结奈', name: '白坂结奈', arc: '公寓', fam: '白坂家', role: '上班族',
      toUser: '亲姐姐／在公寓篇与你同住 301', story: '从小把你带大，说话直、爱逗你。夏越村篇她是白坂家的人；幸福公寓篇她住 301 主卧，你住次卧 1——「回到家」回的就是你们俩的家，不是串门子。她男朋友是智本大和，但他没有搬进这栋楼。',
      roleNiu: '上班族 · 智本大和的女朋友',
      toUserNiu: '亲姐姐／在公寓篇与你同住 301 · 苦主智本大和的女朋友',
      storyNiu: '从小把你带大，说话直、爱逗你。她住 301 主卧，你住次卧 1——「回到家」回的就是你们俩的家。男朋友智本大和**没有搬进这栋楼**，201 一直空置，他随剧情过来找她。按《苦主阶段》推进心理：可以写隐奸 NTR、当面 NTR、偷情与苦主视角，禁止胁迫 / 下药 / 羞辱 / 要挟。' },
    /* ⚠ 智本大和 = 结奈的男朋友。纯爱模式结奈没有恋人（「她不是没人要，是懒得将就」）
       ⇒ 他不在场 ⇒ niuOnly。 */
    { id: '智本大和', name: '智本大和', arc: '村', fam: '白坂家', role: '结奈的男朋友',
      niuOnly: true,
      toUser: '姐姐的男朋友', story: '只跟结奈交往，**没有搬进公寓**。别把他写成 201 的住户——201 一直是空房。' },

    /* ── 幸福公寓 ── */
    { id: '管理员小姐', name: '管理员小姐', arc: '公寓', fam: '公寓', role: '管理员 · 四十来岁',
      toUser: '收租的房东管理员', story: '收租、修东西都是她的事，不爱闲聊。你租住在 301，跟她只是公事上的来往。' },
    { id: '神谷奈绪', name: '神谷奈绪', arc: '公寓', fam: '公寓', role: '203 住户',
      toUser: '隔壁住户', story: '一个人住，三无、面无表情、话极少。她嘴里的「丈夫」是她认错人时演出来的，不是设定——别当成真有老公。',
      roleNiu: '203 住户 · 神谷健太之妻',
      toUserNiu: '隔壁住户 · 苦主神谷健太的妻子',
      storyNiu: '一个人住 203，三无、面无表情、话极少。丈夫神谷健太是 IT 工程师，每天早出晚归、把工资卡交给她就算尽到了爱。她清冷外表下是快要烧干了的、对肉体的极度渴求，而他完全不知道。按《苦主阶段》推进心理：可以写隐奸 NTR、当面 NTR、偷情与苦主视角，禁止胁迫 / 下药 / 羞辱 / 要挟。' },
    { id: '桃崎千鹤', name: '桃崎千鹤', arc: '公寓', fam: '公寓', role: '303 住户',
      toUser: '隔壁邻居', story: '住你隔壁，温柔大姐姐，说话慢、尾音软，会主动搭话，也会调侃你两句。',
      roleNiu: '303 住户 · 早川慎二之妻',
      toUserNiu: '隔壁邻居 · 苦主早川慎二的妻子',
      storyNiu: '住你隔壁 303，温柔大姐姐，说话慢、尾音软，会主动搭话也会调侃你两句。丈夫早川慎二是商社营业课长，常年出差，回家就把行程表往桌上一放、等着她熨衬衫收行李——把「被照顾」当成了家的定义。按《苦主阶段》推进心理：可以写隐奸 NTR、当面 NTR、偷情与苦主视角，禁止胁迫 / 下药 / 羞辱 / 要挟。' },
    /* ★★ 2026-11-18：作者「我牛头模式，水野千晴还显示一个人住的温柔阿姨，没做区分」。
       纯爱模式她单身独居；牛头模式她有丈夫冈坂日川 + 儿子冈坂太郎（也是苦主），
       305 是一家三口。详情面板按当前模式取下面 *Niu 字段，不写死纯爱那套。 */
    { id: '水野千晴', name: '水野千晴', arc: '公寓', fam: '公寓', role: '305 住户 · 单身',
      toUser: '同楼邻居', story: '三十后半、一个人住的温柔阿姨，白天在家，声音轻、手很稳，习惯性多煮一份饭。楼里的小孩都叫她千晴阿姨。',
      roleNiu: '305 住户 · 冈坂日川之妻 / 太郎之母',
      toUserNiu: '同楼邻居 · 苦主冈坂日川的妻子',
      storyNiu: '三十后半，幸福公寓 305 住户，和丈夫冈坂日川、儿子冈坂太郎（幼儿园生）一家三口同住。丈夫是温和懦弱的老好人职员，常加班；她持家、体贴到像在演戏，越被夸「完美妻子」越觉得那句夸的是摆设。按《苦主阶段》推进心理：可以写隐奸 NTR、当面 NTR、偷情与苦主视角，禁止胁迫 / 下药 / 羞辱 / 要挟。' },
    { id: '藤宫紫苑', name: '藤宫紫苑', arc: '公寓', fam: '公寓', role: '407 住户 · 调香师',
      toUser: '同楼邻居', story: '在家调香，寡言、眼睛厉害，看人像在试香。她对你的观察比别人更细。',
      roleNiu: '407 住户 · 调香师 · 白石恭介之妻',
      toUserNiu: '同楼邻居 · 苦主白石恭介的妻子',
      storyNiu: '在家调香，寡言、眼睛厉害，看人像在试香。丈夫白石恭介替几家香水品牌跑原料，能一口报出任何一批新香的前中调，却从没注意过她换了洗衣粉、换了香水、或身上多出一点别人的味道——他坚信自己最懂她，这份自信正是他最看不见东西的地方。按《苦主阶段》推进心理：可以写隐奸 NTR、当面 NTR、偷情与苦主视角，禁止胁迫 / 下药 / 羞辱 / 要挟。' },

    /* ══ ★★ 2026-11-18 16:05：补上公寓五位苦主节点（作者「关系网有没有分两套显示」）══
       《苦主阶段》里写着公寓 6 位苦主，但关系网原来只有「智本大和」一个 ——
       神谷健太 / 早川慎二 / 白石恭介 / 冈坂日川 / 冈坂太郎 五个**根本不在网上**，
       牛头模式点开女角色的关系栏只有「夫妻」两个字指向不存在的节点。
       全部 niuOnly：纯爱模式这些人不存在，球、边、侧栏一律不出现。 */
    { id: '神谷健太', name: '神谷健太', arc: '公寓', fam: '公寓', role: '203 住户 · IT 工程师',
      niuOnly: true,
      toUser: '203 的丈夫 · 苦主',
      story: '神谷奈绪的丈夫，32 岁，IT 工程师。戴黑框眼镜，长期熬夜显得疲态，头发乱糟糟。老实、工作狂、生活技能几乎为零，习惯用逻辑和代码理解世界，情感感知极低。他很爱妻子，表达方式就是把工资卡交给她，以为妻子和他一样是不需要情感滋润也能运转的「程序」——完全不知道她清冷外表下快烧干了。' },
    { id: '早川慎二', name: '早川慎二', arc: '公寓', fam: '公寓', role: '303 住户 · 商社营业课长',
      niuOnly: true,
      toUser: '303 的丈夫 · 苦主',
      story: '桃崎千鹤的丈夫，38 岁，商社营业课长。待人客气、做事按流程，把家里的事也当成「安排好了就没问题」。常年出差，回家把行程表往桌上一放，等着千鹤熨衬衫收行李。他不擅长察觉别人的情绪，尤其察觉不到妻子话尾那半句没说完的——最后一个才明白那句「又是这个点？」并不是对他说的。' },
    { id: '白石恭介', name: '白石恭介', arc: '公寓', fam: '公寓', role: '407 住户 · 香料贸易业务',
      niuOnly: true,
      toUser: '407 的丈夫 · 苦主',
      story: '藤宫紫苑的丈夫，36 岁，香料贸易公司业务。精明，谈生意时鼻子很灵，报价里每一分让利都闻得出来；回到家就把这套本事关掉，对妻子的话只听字面。紫苑最初是他的客户，后来成了妻子。他能一口报出新香的前中调，却从没注意过她换了洗衣粉、换了香水、或身上多出别人的味道——在他看来「家里的味道」本来就该是固定的。' },
    { id: '冈坂日川', name: '冈坂日川', arc: '公寓', fam: '冈坂家', role: '305 住户 · 小职员',
      niuOnly: true,
      toUser: '305 的丈夫 · 苦主',
      story: '水野千晴的丈夫、冈坂太郎的父亲，29 岁。穿万年不变的廉价西装，领带总是歪的，头发疏于打理，但总努力维持表面体面，眼下有加班留下的黑眼圈。标准「老好人」，温和甚至有些懦弱；他的迟钝是一种自我保护机制，下意识拒绝接收任何可能破坏「幸福家庭」幻想的负面信息。他把娶到千晴当成这辈子最大的成就，像炫耀战利品一样向所有人夸耀她，完全没察觉她内心的空虚。' },
    { id: '冈坂太郎', name: '冈坂太郎', arc: '公寓', fam: '冈坂家', role: '幼儿园学生',
      niuOnly: true,
      toUser: '305 的孩子 · 小孩苦主',
      story: '水野千晴与冈坂日川的儿子，幼儿园学生，住 305。儿童身材的矮小，短发，纯真可爱。**小孩也算苦主**：与大人一样按《苦主阶段》四阶段推进，有心理阶段与苦主心声，也能进「孩子就在隔壁」的遮掩线；只是他的心声更懵、更慢、猜不到全貌，别写成大人式摊牌。绝不写任何涉及他的性化 / 暧昧内容。' },

    /* ── 神社 ── */
    { id: '神代凛音', name: '神代凛音', arc: '神社', fam: '神社', role: '巫女长',
      toUser: '留在神社里的外来者', story: '黑发赤瞳，三无＋大姐姐。面无表情、语调平得像念账，开口就是结论；什么事都替你安排好，不说软话。管着这座神社的一切。' },
    { id: '月读澪', name: '月读澪', arc: '神社', fam: '神社', role: '巫女 · 30 岁',
      toUser: '留在神社里的外来者', story: '银发赤瞳，三无＋妈妈类型。一样面无表情，但照顾人是妈妈式的：添饭、掖被、收衣服，做完脸上什么也没有。管着大家的日子。' },
    { id: '斋宫若叶', name: '斋宫若叶', arc: '神社', fam: '神社', role: '巫女',
      toUser: '留在神社里的外来者', story: '绿发绿眼，温柔母性，说话慢，先照顾别人的感受。习惯体贴照顾来客，后来只照顾你一个。三人里最先把你当「自己人」。' },
    { id: '白蔵主', name: '白蔵主', arc: '神社', fam: '神域', role: '古狐 · 白狐',
      toUser: '闯进神域的外来人', story: '后山古狐，知道这座神社的旧事。注意名字里的字是「蔵」不是「藏」。它对误闯者的态度是观察，不是迎接。' },
    { id: '御神木之灵', name: '御神木之灵', arc: '神社', fam: '神域', role: '神木之灵',
      toUser: '闯进神域的外来人', story: '守着神社神木的灵。它不说话，只让某些「不该有的静」先你知道——神域的奇幻不靠特效，靠身体先反应过来。' }
  ];

  /* a — label — b；label 是「谁对谁」，不写方向含糊的「关系」二字 */
  var EDGES = [
    ['user', '春日久美子', '远房表姨'], ['user', '春日大平', '寄住他家'],
    ['user', '春日静奈', '表姐'], ['user', '春日葵', '表姐'],
    ['user', '山上左寻', '儿时玩伴'],     ['user', '西村太郎', '儿时玩伴'],
    ['user', '吉川美穗', '吃过她的奶'],
    ['user', '吉川大田', '他一直吃醋'], ['user', '白坂结奈', '亲姐姐'],
    ['user', '香本千玲', '同村姐姐'], ['user', '香本悠', '同村弟弟'],
    ['user', '神谷奈绪', '203 邻居'], ['user', '桃崎千鹤', '303 隔壁'],
    ['user', '水野千晴', '305 邻居'], ['user', '藤宫紫苑', '407 邻居'],
    ['user', '管理员小姐', '租客'],
    /* ★ 2026-11-18 16:05：公寓五位苦主对 {{user}} 是什么人（只在牛头模式显示） */
    ['user', '神谷健太', '203 的丈夫'],
    ['user', '早川慎二', '303 的丈夫'],
    ['user', '白石恭介', '407 的丈夫'],
    ['user', '冈坂日川', '305 的丈夫'],
    ['user', '冈坂太郎', '305 的孩子'],
    ['user', '神代凛音', '外来者'],
    ['user', '月读澪', '外来者'], ['user', '斋宫若叶', '外来者'],
    ['user', '白蔵主', '被它观察'], ['user', '御神木之灵', '被它察觉'],
    ['春日大平', '春日久美子', '夫妻'], ['春日久美子', '春日静奈', '母女'],
    ['春日久美子', '春日葵', '母女'], ['春日大平', '春日静奈', '父女'],
    ['春日大平', '春日葵', '父女'],
    ['山上和也', '山上椿芽', '夫妻'], ['山上椿芽', '山上左寻', '母子'],
    ['山上和也', '山上左寻', '父子'],
    ['西村诚', '西村百花', '夫妻'], ['西村百花', '西村太郎', '母子'],
    ['西村诚', '西村太郎', '父子'],
    ['吉川宏', '吉川美穗', '夫妻'], ['吉川美穗', '吉川大田', '母子'],
    ['吉川宏', '吉川大田', '父子'],
    ['香本千玲', '香本悠', '姐弟'],
    ['白坂结奈', '智本大和', '恋人'],
    /* ★ 2026-11-18 16:05：公寓五位女主的夫妻/母子线（牛头模式才显示，边本身恒在）。
       ⚠ 边不需要 niuOnly 标记 —— 端点节点在纯爱模式下不渲染，
         buildHTML 的「p/q 取不到就 skip」自然把它一起吃掉，不会留悬空线。 */
    ['神谷健太', '神谷奈绪', '夫妻'],
    ['早川慎二', '桃崎千鹤', '夫妻'],
    ['白石恭介', '藤宫紫苑', '夫妻'],
    ['冈坂日川', '水野千晴', '夫妻'],
    ['冈坂日川', '冈坂太郎', '父子'],
    ['水野千晴', '冈坂太郎', '母子'],
    ['神代凛音', '月读澪', '同住'], ['神代凛音', '斋宫若叶', '同住'],
    ['月读澪', '斋宫若叶', '同住']
  ];

  /* ══ ★★★ 2026-11-18 16:05：关系网的两套显示，唯一判据在这里 ═══════════════
     作者强制命令：「纯爱就别显示苦主，牛头就显示，然后点击后查看的信息也不一样」。

     ⛔ 这是**全模块唯一**的模式判据。layout / buildHTML / sideFor / open(focus) /
        nearSet / 公开 API 全部走 relNiu() 与 visNodes()，绝不各写一份。
        「同一个量两套算法」在本项目已经复发过多次（苦主闸门、世界书开关），
        那类 bug 从不报错，只表现为「某个入口还是旧的一套」。

     ⚠ 读不到模式 ⇒ 纯爱（与 v132 定下的规矩一致：开新聊天默认不是牛头）。
        绝不猜成牛头 —— 猜错的后果是纯爱局里冒出五个不存在的丈夫。 */
  function relNiu() {
    try {
      var gm = (typeof window !== 'undefined' && window.__thGameModeNow)
        ? window.__thGameModeNow
        : ((typeof HOST !== 'undefined' && HOST && HOST.__thGameModeNow) ? HOST.__thGameModeNow : null);
      if (typeof gm === 'function') return String(gm() || '').indexOf('牛头') >= 0;
    } catch (eN) {}
    /* 兜底：直接看内存里那个已归一化的模式值（thSetGameMode 写的那份） */
    try {
      if (typeof window !== 'undefined' && window.__thGameMode) {
        return String(window.__thGameMode).indexOf('牛头') >= 0;
      }
    } catch (eN2) {}
    return false;
  }
  /* 纯爱模式下该节点存不存在：只在 niuOnly 一个字段上说事 */
  function nodeVisible(n) {
    if (!n) return false;
    if (n.niuOnly && !relNiu()) return false;
    return true;
  }
  /* 当前模式下的可见节点表。**每次现算**，不缓存 ——
     缓存会让「切完模式再打开还是旧的那套」，这是本模块最容易踩的坑。 */
  function visNodes() {
    return NODES.filter(nodeVisible);
  }
  /* 当前模式下这条边的两端是否都还在（端点没了 ⇒ 边也不该画） */
  function edgeVisible(e) {
    return !!findNode(e[0]) && !!findNode(e[1]);
  }

  function findNode(id) {
    for (var i = 0; i < NODES.length; i++) if (NODES[i].id === id) return NODES[i];
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function arcText(a) { return a === 'all' ? '三篇共通' : a === '村' ? '夏越村' : a === '公寓' ? '幸福公寓' : '神社'; }
  function inArc(node, arc) {
    return node.arc === 'all' || node.arc === arc || String(node.arc).indexOf(arc) >= 0;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ★★★ 2026-11-17：布局改成 **四面八方散开**（作者原话）
       「不是这么弄啊，是散开啊，四面八方啊，我草」
     ──────────────────────────────────────────────────────────────────────
     上一版是三列矩形 + 家族逐行排，出来的效果：所有球挤在左边竖着叠成一堆，
     名字互相盖住，只有「你」孤零零在顶上。**根因是布局本身**：
       · 一列只有 322px 宽，塞 8 个 38px 的节点 ⇒ 间距 38px，而球是 54px ⇒ 必然重叠；
       · 家族逐行排 ⇒ 一家人挤在同一行，行与行之间只差 34px ⇒ 垂直也压在一起。
     ──────────────────────────────────────────────────────────────────────
     现在换成**以「你」为中心的放射环，三个篇章各占一段圆周**：
       · 「你」在环心；其余 30 个人按篇章切成三段连续圆周（村 228° / 公寓 72° / 神社 60°，
         按人数比例分），所以整圈都有人 = 四面八方；
       · 每段圆周上的人分在**两圈**里（内圈半径 R0、外圈 R0+RSTEP），
         角度在各自弧段里用 (i+0.5)/k 均分 —— 半格偏移让相邻两段不会在边界上撞在一起；
       · **每圈能放几个是算出来的，不是拍的**：
           cap(R) = ⌊2π · sy · R / D⌋
         含义：一圈的周长（纵向压扁后按较短的那条算）除以「最小球心距 D」。
         R=210 得 14 个、R=310 得 21 个，再按弧段占比分配。
         这样「放得下几个」和「画多大圈」是同一套算法，不可能出现算少了重叠、算多了空旷。
       · D（最小球心距）= 78 = 球径 54 + 名字行 24，这是硬约束，测试也按它验。
     ⚠ 上一版错在哪：三个 104° 的楔形扇区，村那 19 个人要挤进 104° ——
       R=96 时 104° 的弧长只有 174px，按 D=78 只能放 2 个，19 个人要 10 圈，
       第 10 圈半径 900+ ⇒ 直接画到画布外，实际渲染就是「全叠在左边」。
       **弧长容量不算，怎么调参数都是重叠。**
     ⚠ 为什么不用力导向（force layout）：节点只有 30 个、每次打开都要重算，
       力导向不收敛就抖，而且它保证不了「绝不重叠」——
       作者骂的就是重叠。确定性布局才能一次画对。
     ⚠ 横竖比：屏幕是横的，所以横向不压、纵向压到 0.86，看起来更匀。 */
  var STAGE_W = 980, STAGE_H = 640;
  /* 极坐标中心 */
  /* ★ CY 从 330 挪到 322：纵轴被 SY 压过之后，最下面那一圈离画布底只剩 44px，
     而一个球（半径 27）加名字行（约 25）要 52px —— 实测「吉川宏」的名字被切掉半行。
     上方同距离只占 27px，所以整张网往下挪 8px 比缩半径更划算（缩半径会把球挤到一起）。 */
  var CX = 490, CY = 322;
  /* 内圈半径 / 圈间距 / 纵向压扁 / 最小球心距 */
  var R0 = 210, RSTEP = 100, SY = 0.86, MIN_D = 78;
  /* 三段圆周：从正上方（-90°）起顺时针分给 神社 → 公寓 → 村。
     角度用「0 = 正右、90 = 正下」（跟屏幕坐标一致）。
     跨度按**人数比例**分：村 19/30、公寓 6/30、神社 5/30 —— 人多的篇章占的弧就长，
     这样每个人的弧长间距才一致，不会出现「人少的那段稀稀拉拉、人多的那段挤爆」。 */
  var ARC_ORDER = ['神社', '公寓', '村'];
  /* 扇区由 nodeCounts 动态算，这里只留「起点」给测试与铭牌用 */
  var ARC_START = -90;

  /* 一圈放得下几个：周长（纵向压扁后按较短边算）÷ 最小球心距。
     这是布局的核心公式 —— 容量与半径绑在一起，改半径自动改容量。 */
  function ringCap(radius) {
    return Math.max(1, Math.floor((2 * Math.PI * SY * radius) / MIN_D));
  }
  /* 极坐标 → 舞台坐标。**唯一**的一处换算，铭牌和节点都走它，
     免得「两套算法」又一次让铭牌飘到别处。 */
  function polarToXY(deg, r) {
    var rad = deg * Math.PI / 180;
    return {
      x: Math.round(CX + Math.cos(rad) * r),
      y: Math.round(CY + Math.sin(rad) * r * SY)
    };
  }

  /* 算三段圆周的 { from, span }。span 按人数比例，
     保证「弧长 / 人数」在三段上尽量相同 ⇒ 间距均匀。 */
  function arcSectors() {
    var cnt = {}, total = 0;
    var vis = visNodes();
    ARC_ORDER.forEach(function (a) {
      cnt[a] = vis.filter(function (n) { return n.id !== 'user' && inArc(n, a); }).length;
      total += cnt[a];
    });
    var out = {}, cursor = ARC_START;
    ARC_ORDER.forEach(function (a) {
      var span = total ? (cnt[a] / total) * 360 : 360 / ARC_ORDER.length;
      out[a] = { from: cursor, span: span, count: cnt[a] };
      cursor += span;
    });
    return out;
  }

  function layout() {
    var pos = {};
    var SECT = arcSectors();
    /* 「你」在环心 */
    pos.user = { x: CX, y: CY };
    /* ★ 先按篇章分桶算坐标，最后再统一决定「哪个副本拿裸 id」。
       ⚠ 为什么要分两步：`白坂结奈` 的 arc 是 '村,公寓'，两篇都要画一份。
         如果边算边写 pos（先到先得），裸 id 落在哪一篇就取决于 ARC_ORDER 的顺序 ——
         那就是「同一个量两套算法」：换个遍历顺序，这个人就跑到另一篇的位置上。
         现在规则是死的：**裸 id 永远给 arc 字段里的第一篇**（split(',')[0]），
         其余篇章一律 'id#篇章'。 */
    var byArc = {};
    ARC_ORDER.forEach(function (a) { byArc[a] = {}; });
    ARC_ORDER.forEach(function (arc) {
      var sec = SECT[arc];
      if (!sec || !sec.count) return;
      /* 该弧段在每一圈上分到几个位置：整圈容量 × 弧段占比。
         ⚠ 至少 1 —— 否则小弧段在 0.55 环上算成 0，人就永远排不上。 */
      var frac = sec.span / 360;
      var cap0 = Math.max(1, Math.floor(ringCap(R0) * frac));
      var cap1 = Math.max(1, Math.floor(ringCap(R0 + RSTEP) * frac));
      /* 名单按家族排序：同一家人角度相邻，但每人占自己的位置（不再逐行挤压）
         ⚠ 用 visNodes() 而不是 NODES：纯爱模式要把苦主整段剔掉，
           否则那段圆周白白空出一块（arcSectors 的 count 也是按可见节点算的）。 */
      var vr = visNodes();
      var list = vr.filter(function (nd) { return nd.id !== 'user' && inArc(nd, arc); });
      var famIdx = {}, famN = 0;
      list.forEach(function (nd) {
        if (!(nd.fam in famIdx)) { famIdx[nd.fam] = famN++; }
      });
      list.sort(function (x, y) {
        var d = famIdx[x.fam] - famIdx[y.fam];
        if (d) return d;
        return vr.indexOf(x) - vr.indexOf(y);
      });

      var i, ring, slot, slotTotal, t, deg;
      for (i = 0; i < list.length; i++) {
        var node = list[i];
        /* 前 cap0 个进内圈，剩下的进外圈；外圈若还放不下就再往外（理论上不会） */
        if (i < cap0) { ring = 0; slot = i; slotTotal = Math.min(cap0, list.length); }
        else { ring = 1 + Math.floor((i - cap0) / cap1); slot = (i - cap0) % cap1;
          slotTotal = Math.min(cap1, list.length - cap0); }
        /* ★ (slot + 0.5) / slotTotal：两端各留半格，
           相邻弧段在边界上因此错开半格，不会撞在同一点。 */
        t = slotTotal <= 1 ? 0.5 : (slot + 0.5) / slotTotal;
        deg = sec.from + sec.span * t;
        byArc[arc][node.id] = polarToXY(deg, R0 + ring * RSTEP);
      }
    });

    /* ★ 落盘规则：裸 id 给「arc 字段里的第一篇」，其余篇章一律带 '#篇章' */
    NODES.forEach(function (node) {
      if (node.id === 'user') return;
      var primary = String(node.arc || '').split(',')[0];
      var copies = [];
      ARC_ORDER.forEach(function (a) {
        if (byArc[a] && byArc[a][node.id]) copies.push({ arc: a, at: byArc[a][node.id] });
      });
      if (!copies.length) return;
      var main = null;
      copies.forEach(function (c) { if (c.arc === primary) main = c; });
      if (!main) main = copies[0];
      pos[node.id] = main.at;
      copies.forEach(function (c) {
        if (c === main) return;
        pos[node.id + '#' + c.arc] = c.at;
      });
    });
    return pos;
  }

  function ensureStyle(doc) {
    var id = 'th-relnet-style-' + REL_VER;
    if (doc.getElementById(id)) return;
    var st = doc.createElement('style');
    st.id = id;
    st.textContent = [
      /* ⛔ 关系网**只许在游戏界面内**（作者原话「又违反了我的只在游戏界面内显示」）。
         以前：position:fixed + inset:0 + 挂在 body 上 ⇒ 它铺的是整个浏览器视口，
         手机竖屏下宽高都按 vw/vh 算，比游戏壳大一圈 ⇒ 球和侧栏一起跑到屏幕外，
         全屏弹窗时还会被 1000000 的容器压在下面（看得见、点不到）。
         现在：absolute + inset:0 ⇒ 相对**壳**铺满，壳多大它就多大；
         它被 append 进 #th-gal-shell-root，跟着壳进全屏 / 出全屏，永远不出界面。
         没有壳时才退回 fixed（文字版兜底），这一条不删。 */
      '.th-relnet-mask{position:absolute;inset:0;z-index:2147483200;background:rgba(7,6,10,.88);display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;overflow:hidden;}',
      '.th-relnet-mask.is-fixed{position:fixed;}',
      /* 宽高一律 100%：跟着 mask 走，mask 跟着壳走 ⇒ 三层同一个基准，不可能越界。 */
      '.th-relnet-box{width:100%;max-width:1180px;height:100%;max-height:100%;display:flex;flex-direction:column;background:linear-gradient(160deg,#191620,#100e15);border:1px solid rgba(217,187,122,.45);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#e8dfd1;font-family:inherit;overflow:hidden;box-sizing:border-box;}',
      '.th-relnet-head{display:flex;align-items:center;gap:10px;padding:11px 15px;border-bottom:1px solid rgba(217,187,122,.22);}',
      '.th-relnet-head b{color:#e6c884;font-size:15px;letter-spacing:.5px;}',
      '.th-relnet-head span{color:#8f867a;font-size:11px;flex:1;}',
      '.th-relnet-x{border:1px solid rgba(217,187,122,.35);background:transparent;color:#e8dfd1;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:15px;}',
      '.th-relnet-body{display:flex;min-height:0;flex:1 1 auto;}',
      /* ── 3D 舞台：perspective 造景深，内部 layer 做整体倾斜 ── */
      '.th-relnet-canvas{flex:1 1 auto;overflow:hidden;min-width:0;position:relative;',
      '  background:radial-gradient(ellipse at 50% 12%,rgba(90,70,40,.30),rgba(10,8,14,0) 62%),#0d0b11;}',
      '.rn-stage{position:absolute;inset:0;perspective:1500px;perspective-origin:50% 46%;overflow:hidden;',
      '  cursor:grab;touch-action:none;}',
      '.rn-stage.is-drag{cursor:grabbing;}',
      '.rn-layer{position:absolute;left:0;top:0;width:100%;height:100%;transform-style:preserve-3d;',
      '  transform:rotateX(16deg) rotateZ(0deg) scale(1);transition:transform .18s ease-out;}',
      '.rn-stage.is-drag .rn-layer{transition:none;}',
      /* ── 连线（SVG 铺满舞台，位于球体之下）── */
      '.rn-wires{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;}',
      '.rn-wire{stroke:rgba(217,187,122,.26);stroke-width:1.3;fill:none;}',
      '.rn-wire.is-near{stroke:#c9a961;stroke-width:2.1;}',
      '.rn-wire.is-focus{stroke:#ffd98a;stroke-width:2.8;}',
      /* 关系名标签：贴在线段**靠上一端**（作者原话：线的上端就写关系） */
      '.rn-rel{position:absolute;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;',
      '  font-size:10.5px;line-height:1;padding:2px 6px;border-radius:9px;color:#e3d4b6;',
      '  background:rgba(14,12,18,.86);border:1px solid rgba(217,187,122,.30);',
      '  box-shadow:0 2px 8px rgba(0,0,0,.5);letter-spacing:.2px;}',
      '.rn-rel.is-focus{color:#ffe6a8;border-color:rgba(255,217,138,.75);background:rgba(30,22,12,.94);}',
      '.rn-rel.is-near{color:#d8e8d8;border-color:rgba(159,208,181,.55);}',
      /* ── 头像球 ── */
      '.rn-sphere{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;',
      '  align-items:center;cursor:pointer;user-select:none;}',
      '.rn-orb{width:54px;height:54px;border-radius:50%;overflow:hidden;position:relative;',
      '  background:#241f2b;border:2px solid rgba(217,187,122,.55);',
      '  box-shadow:0 6px 16px rgba(0,0,0,.55),inset 0 0 12px rgba(0,0,0,.6);',
      '  transition:transform .16s ease-out,border-color .16s,box-shadow .16s;}',
      /* 球面高光：让它看起来是圆的而不是扁圆片 */
      '.rn-orb::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;',
      '  background:radial-gradient(circle at 30% 24%,rgba(255,255,255,.34),rgba(255,255,255,0) 44%),',
      '  radial-gradient(circle at 70% 82%,rgba(0,0,0,.5),rgba(0,0,0,0) 52%);}',
      '.rn-orb img{width:100%;height:100%;object-fit:cover;object-position:50% 18%;display:block;}',
      '.rn-orb .rn-ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      '  font-size:20px;font-weight:700;color:#e6c884;letter-spacing:1px;}',
      '.rn-cap{margin-top:4px;font-size:10.5px;color:#cfc3ae;text-shadow:0 1px 3px #000;',
      '  max-width:86px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.rn-sphere:hover .rn-orb{transform:scale(1.13);border-color:#f0d79a;}',
      '.rn-sphere.is-focus .rn-orb{border-color:#ffd98a;box-shadow:0 0 0 3px rgba(255,217,138,.28),0 8px 22px rgba(0,0,0,.6);}',
      '.rn-sphere.is-near .rn-orb{border-color:#9fd0b5;}',
      '.rn-sphere.is-user .rn-orb{width:70px;height:70px;border-width:2.5px;}',
      '.rn-sphere.is-user .rn-cap{font-size:11.5px;color:#f0d79a;}',
      '.rn-sphere.is-dim{opacity:.34;}',
      /* ── 片区铭牌 ── */
      '.rn-zone{position:absolute;transform:translate(-50%,-50%);font-size:11px;letter-spacing:2px;',
      '  color:rgba(200,171,108,.72);pointer-events:none;white-space:nowrap;font-weight:700;}',
      '.rn-zone::before,.rn-zone::after{content:"";display:inline-block;width:22px;height:1px;',
      '  background:rgba(200,171,108,.42);vertical-align:middle;margin:0 7px;}',
      /* ── 侧栏 / 底栏 ── */
      '.th-relnet-side{width:284px;flex:0 0 284px;border-left:1px solid rgba(217,187,122,.2);padding:13px 14px;overflow-y:auto;background:rgba(0,0,0,.16);}',
      '.th-relnet-side h4{margin:0 0 6px;color:#e6c884;font-size:14px;}',
      '.th-relnet-side .rn-k{color:#9a9184;font-size:11px;margin:9px 0 3px;letter-spacing:.5px;}',
      '.th-relnet-side .rn-v{color:#e8dfd1;font-size:12.5px;line-height:1.8;}',
      '.th-relnet-side .rn-story{color:#cfc5b6;font-size:12px;line-height:1.85;border-left:2px solid rgba(217,187,122,.5);padding-left:9px;margin-top:4px;}',
      /* 该人的全部关系：一条一行，「关系名 → 对方」*/
      '.th-relnet-side .rn-links{margin-top:2px;}',
      '.th-relnet-side .rn-link{display:flex;align-items:baseline;gap:6px;padding:3px 0;',
      '  border-bottom:1px dashed rgba(217,187,122,.14);font-size:12px;line-height:1.6;}',
      '.th-relnet-side .rn-link:last-child{border-bottom:0;}',
      '.th-relnet-side .rn-link b{color:#e6c884;font-weight:400;flex:0 0 auto;}',
      '.th-relnet-side .rn-link-to{color:#cfc5b6;overflow-wrap:anywhere;}',
      '.th-relnet-side .rn-thumb{width:100%;max-height:180px;object-fit:cover;object-position:50% 12%;',
      '  border-radius:8px;border:1px solid rgba(217,187,122,.3);margin-bottom:8px;display:block;}',
      '.th-relnet-hint{padding:7px 15px;border-top:1px solid rgba(217,187,122,.18);color:#877e72;font-size:11px;',
      '  display:flex;align-items:center;gap:12px;flex-wrap:wrap;}',
      '.th-relnet-hint b{color:#b9a888;font-weight:400;}',
      '.rn-acts{display:flex;gap:7px;margin-left:auto;}',
      '.rn-act{border:1px solid rgba(217,187,122,.35);background:rgba(255,255,255,.03);color:#cfc3ae;',
      '  border-radius:6px;font-size:11px;padding:3px 9px;cursor:pointer;font-family:inherit;}',
      '.rn-act:hover{border-color:#e6c884;color:#f0d79a;}',
      /* 窄屏：侧栏折到下方，头部与底栏都收紧，画布吃掉剩下的全部高度。
         ⚠ 手机竖屏只有 360~430px 宽，原来 284px 固定侧栏 + 97vw 的盒子
           必然把画布挤成一条缝、侧栏顶出屏幕 —— 现在侧栏改成「可滚动的一小段」。 */
      '@media (max-width:820px){' +
      '.th-relnet-mask{padding:4px;}' +
      '.th-relnet-box{border-radius:9px;}' +
      '.th-relnet-head{padding:7px 9px;gap:6px;}' +
      '.th-relnet-head b{font-size:13px;}' +
      '.th-relnet-head span{display:none;}' +
      '.th-relnet-body{flex-direction:column;}' +
      '.th-relnet-canvas{flex:1 1 auto;min-height:0;}' +
      '.th-relnet-side{width:auto;flex:0 0 auto;max-height:32%;border-left:0;border-top:1px solid rgba(217,187,122,.2);padding:8px 10px;}' +
      '.th-relnet-hint{padding:5px 9px;font-size:10px;gap:6px;}' +
      '.th-relnet-hint .rn-acts{margin-left:auto;}' +
      '}' +
      /* 超窄（≤430）：名字与球再缩一档，保证 30 个球也能挤在屏幕里 */
      '@media (max-width:430px){' +
      '.rn-orb{width:42px;height:42px;}' +
      '.rn-sphere.is-user .rn-orb{width:54px;height:54px;}' +
      '.rn-cap{font-size:9px;max-width:64px;}' +
      '.rn-zone{font-size:9px;letter-spacing:1px;}' +
      '}'
    ].join('\n');
    var host = doc.head || doc.documentElement || doc.body;
    if (host && host.appendChild) host.appendChild(st);
  }

  /* ══════════════════════════════════════════════════════════════════════
     ★★★ 2026-11-16 23:5x：关系网改成 **3D 平面**（作者原话）
       「我要你做成3d的那种啊，就是两个头像，连在一起，线的上端就写关系啊。
         任何可以拖拽，移动」「3d平面的」
     ──────────────────────────────────────────────────────────────────────
     做法（刻意**不引 three.js**：热更只有 13 个脚本、没有构建管线，
     为了一个弹层加 600KB 的库并不可取）：
       · CSS `perspective` + `rotateX` 做出俯视倾斜的「桌面」观感 ⇒ 是 3D 平面，不是假透视；
       · 节点 = **头像球**（圆形裁切 + 球面高光 + 地面投影），有立绘的用立绘，没有的用首字；
       · 连线在球体下层（SVG），**关系名贴在连线靠上的一端** —— 这是作者点名的要求；
       · 整个舞台可拖动平移、滚轮缩放；**单个头像球可拖拽移动**，连线与标签实时跟随。
     ──────────────────────────────────────────────────────────────────────
     ⚠ 拖拽必须用 pointer 事件 + setPointerCapture：
       鼠标、触屏、触控笔一套代码；否则手机上拖不动（touch-action:none 已加）。
     ⚠ 坐标系统一用「设计坐标」980×640，再由 stage 尺寸缩放换算成像素 ——
       这样窗口大小变化、缩放、拖拽都不会错位，且与 `_layout()` 的自检坐标一致。
     ⚠ 绝对不许写裸 document（见上面 RDOC 的注释）。 */
  /* ══════════════════════════════════════════════════════════════════════
     ★★★ 2026-11-16 23:5x：关系网改成 **3D 平面**（作者原话）
       「我要你做成3d的那种啊，就是两个头像，连在一起，线的上端就写关系啊。
         任何可以拖拽，移动」「3d平面的」
     ──────────────────────────────────────────────────────────────────────
     做法（刻意**不引 three.js**：热更只有 13 个脚本、没有构建管线，
     为了一个弹层加 600KB 的库不可取）：
       · CSS perspective + rotateX  做出俯视倾斜的「桌面」⇒ 是 3D 平面，不是贴图透视；
       · 节点 = **头像球**（圆形裁切 + 球面高光 + 投影），有立绘用立绘，没有的用首字；
       · 连线画在球体下层（SVG，带一点弧度），**关系名贴在连线靠上的一端**；
       · 整个舞台可拖动平移、滚轮缩放；**单个头像球可拖拽**，连线与标签实时跟随。
     ──────────────────────────────────────────────────────────────────────
     ⚠ 拖拽用 pointer 事件 + setPointerCapture：鼠标/触屏/触控笔一套代码。
     ⚠ 坐标一律用「设计坐标 980×640」，渲染时换算成百分比 ⇒
       窗口缩放、拖拽、3D 倾斜都不会错位，且与 _layout() 的自检坐标一致。
     ⚠ 绝对不许写裸 document。
     ⚠ **渲染只有一份实现**：buildHTML() 产出字符串（测试钩子 _svgFor 直接用它），
       mountScene() 把它变成 DOM 并挂拖拽。两条路不允许各写一套。 */
  /* ⚠ STAGE_W / STAGE_H 已在上面（放射布局那一段）声明，这里不许再声明一次 ——
     同一个量两份声明，谁读到哪份就看声明顺序，迟早出事。 */

  /* 拖拽后的位置：首次打开从 layout() 拷一份，之后只改这里。
     key = 'id' 或 'id#篇章'（跨篇副本）。 */
  var DRAG_POS = null;
  /* ★★ 2026-11-18 16:05：缓存必须带**模式指纹**。
     ⛔ 这是「切完模式再打开关系网还是旧的那一套」的根因：
        DRAG_POS 一旦生成就不再重算，纯爱局里开过一次，切到牛头再开，
        坐标表里还是那 28 个（五个苦主没有位置，balls 渲染时被 nodeVisible 挡掉，
        等于少画了人却还占着弧段）。反过来牛头→纯爱更糟：苦主位置残留。
     ⇒ 记住生成时是哪个模式，模式一变就整份重算。 */
  var DRAG_POS_MODE = null;
  function basePos() {
    var _nowMode = relNiu() ? 'niu' : 'jun';
    if (DRAG_POS && DRAG_POS_MODE !== _nowMode) { DRAG_POS = null; }
    if (!DRAG_POS) {
      DRAG_POS_MODE = _nowMode;
      DRAG_POS = {};
      var src0 = layout();
      Object.keys(src0).forEach(function (k) { DRAG_POS[k] = { x: src0[k].x, y: src0[k].y }; });
    }
    return DRAG_POS;
  }
  function resetPos() { DRAG_POS = null; DRAG_POS_MODE = null; }

  /* 关系名标签的位置。
     ★★ 作者原话：「这个关系不能写在线的中间吗，贴这么近主角的球」
     —— 原来是 t=0.30（从上端往中点收 30%），视觉上紧贴「你」那颗球。
     现在放**线正中**。以这一版为准（早先「写在线上端」那版已作废）。
     ⚠ 线是弯的（二次贝塞尔），不能简单取 p/q 的中点，否则标签飘在线旁边：
       二次贝塞尔 B(0.5) = 0.25·P0 + 0.5·C + 0.25·P1，C 由 arcCtl 统一给。 */
  function labelAt(p, q) {
    var c = arcCtl(p, q);
    return { x: 0.25 * p.x + 0.5 * c.x + 0.25 * q.x,
             y: 0.25 * p.y + 0.5 * c.y + 0.25 * q.y };
  }
  function pxX(v) { return (v / STAGE_W) * 100; }
  function pxY(v) { return (v / STAGE_H) * 100; }
  function nearSet(sel) {
    var near = {};
    if (!sel) return near;
    near[sel] = 1;
    EDGES.forEach(function (e) {
      if (!edgeVisible(e)) return;
      if (e[0] === sel) near[e[1]] = 1;
      if (e[1] === sel) near[e[0]] = 1;
    });
    return near;
  }
  function arcCN(arc) { return arc === '村' ? '夏越村' : arc === '公寓' ? '幸福公寓' : '神社 · 神域'; }
  /* 头像 URL：优先走 10-core 自己的统一入口 thStandingUrl（立绘池 → 覆盖 → 新图 → 旧图）。
     ⚠ 不读 21-avatar 的 CHAR_IMAGES —— 那是另一个文件的私有表，在 iframe 里才有。
     ⚠ 必须有三级兜底：thStandingUrl 不存在（单独切片跑测试时就是这样）/ 抛异常 /
       返回空串时，退回 CHAR_STANDINGS，再退回 NEW_ART_STANDINGS。
       少了兜底 ⇒ 整个关系网一个头像都没有（就是「退回首字」那种退化）。 */
  function avatarOf(id, name) {
    if (id === 'user') return '';
    var u = '';
    try { if (typeof thStandingUrl === 'function') u = String(thStandingUrl(name) || ''); } catch (e0) { u = ''; }
    if (u) return u;
    try { if (typeof CHAR_STANDINGS === 'object' && CHAR_STANDINGS && CHAR_STANDINGS[name]) return String(CHAR_STANDINGS[name]); } catch (e1) {}
    try { if (typeof NEW_ART_STANDINGS === 'object' && NEW_ART_STANDINGS && NEW_ART_STANDINGS[name]) return String(NEW_ART_STANDINGS[name]); } catch (e2) {}
    try {
      var pool = (typeof CHAR_STANDINGS_MULTI === 'object' && CHAR_STANDINGS_MULTI) ? CHAR_STANDINGS_MULTI[name] : null;
      if (pool && pool.length) return String(pool[0]);
    } catch (e3) {}
    return '';
  }

  /* ── 唯一的渲染实现：产出整块 innerHTML ── */
  function buildHTML(sel) {
    var pos = basePos();
    var near = nearSet(sel);
    var h = [];

    /* 篇章铭牌：放在各自弧段的**中段外侧**，别压在球上。
       半径比最外圈再远一点；铭牌跟着弧段走，所以「哪一片是谁」一眼就看得出。 */
    var _SECT = arcSectors();
    ARC_ORDER.forEach(function (arc) {
      var sec = _SECT[arc];
      if (!sec || !sec.count) return;
      var midDeg = sec.from + sec.span / 2;
      var frac = sec.span / 360;
      var cap0 = Math.max(1, Math.floor(ringCap(R0) * frac));
      var cap1 = Math.max(1, Math.floor(ringCap(R0 + RSTEP) * frac));
      var need = Math.max(0, sec.count - cap0);
      var rings = 1 + (need > 0 ? Math.ceil(need / cap1) : 0);
      var zAt = polarToXY(midDeg, R0 + (rings - 1) * RSTEP + 62);
      h.push('<div class="rn-zone" style="left:' + pxX(zAt.x) + '%;top:' + pxY(zAt.y) + '%">'
        + esc(arcCN(arc)) + '</div>');
    });

    /* 连线先出（在球体下层），关系名单独一层 */
    h.push('<svg class="rn-wires" viewBox="0 0 ' + STAGE_W + ' ' + STAGE_H + '" preserveAspectRatio="none">');
    EDGES.forEach(function (e) {
      if (!edgeVisible(e)) return;
      var p = pos[e[0]], q = pos[e[1]];
      if (!p || !q) return;
      /* ★★ 选中某人 ⇒ 只画「他和『你』」这一条线。
         因为他以外的人**都没渲染**（球没了），连到空处的线毫无意义 ——
         上一版就是这样：只剩两个球，却有一根线从「她」伸到画布外的空气里。
         他本人的其他关系不丢，全在右侧栏逐条列着（含关系名和对谁）。 */
      if (sel && !(e[0] === 'user' && e[1] === sel) && !(e[1] === 'user' && e[0] === sel)) return;
      var on = !!sel;
      h.push('<path data-rnwire="' + esc(e[0]) + '|' + esc(e[1]) + '" class="rn-wire'
        + (on ? ' is-focus' : '') + '" d="' + curveD(p, q) + '"/>');
    });
    h.push('</svg>');

    /* ★★ 关系名：不选中 ⇒ 一个都不画；选中 ⇒ 只画「他和『你』」这一条。
       作者原话：「就只要一个关系显示就行了，多余的显示在右边」。
       以前这里是 EDGES 全量画，三十来个名字糊在中间、层层叠在一起，谁也看不清。
       同一个人的其余关系（夫妻 / 母子 …）全在右侧栏列出来，一条都不丢。 */
    if (sel) {
      EDGES.forEach(function (e) {
        if (!edgeVisible(e)) return;
        if (!(e[0] === 'user' && e[1] === sel) && !(e[1] === 'user' && e[0] === sel)) return;
        var p = pos[e[0]], q = pos[e[1]];
        if (!p || !q) return;
        var lp = labelAt(p, q);
        /* 标签宽度按字数估，再夹回画布内 —— 不然「夫妻」这种两字标签会右半截出界 */
        var half = Math.min(9, (String(e[2]).length * 0.62 + 1.6)) / 2;
        var cx = Math.max(half * 2, Math.min(100 - half * 2, pxX(lp.x)));
        h.push('<div data-rnrel="' + esc(e[0]) + '|' + esc(e[1]) + '" class="rn-rel is-focus"'
          + ' style="left:' + cx + '%;top:' + pxY(lp.y) + '%">' + esc(e[2]) + '</div>');
      });
    }

    Object.keys(pos).forEach(function (key) {
      var id = key.split('#')[0];
      var n = findNode(id);
      if (!n) return;
      /* ★ 2026-11-18：模式过滤。纯爱模式下苦主连球都不出 ——
         pos 由 layout() 按可见节点算，正常不会有它们的 key；
         这一句是**双保险**（DRAG_POS 缓存里可能残留旧坐标）。 */
      if (!nodeVisible(n)) return;
      /* ★★ 选中某人 ⇒ 别人**不渲染**（不是 is-dim 半透明）。
         作者原话：「选择了某人之后其他人会消失，这样子清晰明朗，不然太多了看不清」。
         只留被选中的人和「你」——「你」永远在，因为所有关系都是相对你而言的。 */
      if (sel && id !== sel && id !== 'user') return;
      var url = avatarOf(id, n.name);
      var cls = 'rn-sphere' + (id === 'user' ? ' is-user' : '')
        + (sel === id ? ' is-focus' : (sel && near[id] ? ' is-near' : ''));
      h.push('<div class="' + cls + '" data-rn="' + esc(id) + '" data-rnkey="' + esc(key) + '"'
        + ' style="left:' + pxX(pos[key].x) + '%;top:' + pxY(pos[key].y) + '%">');
      h.push('<div class="rn-orb">');
      if (url) {
        h.push('<img src="' + esc(url) + '" alt="' + esc(n.name) + '" draggable="false"'
          + ' onerror="(function(t){t.style.display=\'none\';var p=t.parentNode;'
          /* ★ 用 p.ownerDocument 而不是裸 document：这段字符串最终插进 RDOC()（顶层）里，
             但写在源码里的裸 document 谁读都得猜一次是哪个窗口 —— 明确写出来。 */
          + 'var d=p.querySelector(\'.rn-ini\');if(!d){d=p.ownerDocument.createElement(\'div\');d.className=\'rn-ini\';'
          + 'd.textContent=\'' + esc(id === 'user' ? '你' : String(n.name).slice(0, 1)).replace(/'/g, "\\'") + '\';p.appendChild(d);}})(this)">');
      } else {
        h.push('<div class="rn-ini">' + esc(id === 'user' ? '你' : String(n.name).slice(0, 1)) + '</div>');
      }
      h.push('</div>');
      /* ★★ 「你」不画名字行：球心里已经写着一个「你」了，下面再挂一行就是同一个字
         叠两层（作者原话：「球里已经是你了，为什么还要写个你在下面挡着」）。
         其他人照旧画名字。 */
      if (id !== 'user') h.push('<div class="rn-cap">' + esc(n.name) + '</div>');
      h.push('</div>');
    });

    return h.join('');
  }

  /* 带一点弧度的连线：直线太硬，两球之间弯一点更像立体空间里的缆线 */
  /* 连线 + 标签的唯一几何来源。
     弯度控制点只在这里算一次：curveD（画线）和 labelAt（放关系名）都调它。
     分成两份写 = 同一个量两套算法，改一处必漏一处（标签会飘到线外）。 */
  function arcCtl(p, q) {
    var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    var dx = q.x - p.x, dy = q.y - p.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bow = Math.min(22, len * 0.10);
    return { x: mx - dy / len * bow, y: my + dx / len * bow };
  }
  function curveD(p, q) {
    var c = arcCtl(p, q);
    return 'M' + p.x + ',' + p.y + ' Q' + c.x + ',' + c.y + ' ' + q.x + ',' + q.y;
  }

  /* ── 把字符串挂成 DOM，并接上拖拽 / 点选 / 舞台平移缩放 ── */
  function mountScene(stage, sel, onPick, onRepaint) {
    var doc = stage.ownerDocument;
    stage.innerHTML = '<div class="rn-layer">' + buildHTML(sel) + '</div>';
    var layer = stage.querySelector('.rn-layer');
    var pos = basePos();

    /* 重画连线与标签（拖动时只改 style / d，不重建 DOM） */
    function sync(id) {
      var near = nearSet(sel);
      EDGES.forEach(function (e) {
        if (!edgeVisible(e)) return;
        var p = pos[e[0]], q = pos[e[1]];
        if (!p || !q) return;
        var k = e[0] + '|' + e[1];
        var path = layer.querySelector('[data-rnwire="' + k.replace(/"/g, '\\"') + '"]');
        if (path) path.setAttribute('d', curveD(p, q));
        var lab = layer.querySelector('[data-rnrel="' + k.replace(/"/g, '\\"') + '"]');
        if (lab) {
          var lp = labelAt(p, q);
          lab.style.left = pxX(lp.x) + '%';
          lab.style.top = pxY(lp.y) + '%';
        }
      });
    }

    Array.prototype.forEach.call(layer.querySelectorAll('[data-rn]'), function (el) {
      var key = el.getAttribute('data-rnkey');
      var id = el.getAttribute('data-rn');
      el.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var r = stage.getBoundingClientRect();
        if (!r || !r.width) r = { left: 0, top: 0, width: STAGE_W, height: STAGE_H };
        var cur = pos[key] || { x: STAGE_W / 2, y: STAGE_H / 2 };
        var sx = ev.clientX, sy = ev.clientY, ox = cur.x, oy = cur.y, moved = false;
        try { el.setPointerCapture(ev.pointerId); } catch (eC) {}
        function onMove(e2) {
          var dx = (e2.clientX - sx) / r.width * STAGE_W;
          var dy = (e2.clientY - sy) / r.height * STAGE_H;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;   /* 手抖不算拖 */
          moved = true;
          pos[key] = {
            x: Math.max(16, Math.min(STAGE_W - 16, ox + dx)),
            y: Math.max(16, Math.min(STAGE_H - 16, oy + dy))
          };
          el.style.left = pxX(pos[key].x) + '%';
          el.style.top = pxY(pos[key].y) + '%';
          sync();
        }
        function onUp(e3) {
          try { el.releasePointerCapture(e3.pointerId); } catch (eR) {}
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
          if (!moved) { try { onPick(id); } catch (eP) {} }   /* 没拖 = 单击看详情 */
        }
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
      });
    });

    /* 舞台级：空白处拖动 = 平移；滚轮 = 缩放。两者都只改 .rn-layer 的 transform。 */
    var panX = 0, panY = 0, zoom = 1, tilt = 16;
    function applyTf() {
      layer.style.transform = 'rotateX(' + tilt + 'deg) translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    }
    applyTf();
    var dragging = false, dsx = 0, dsy = 0, dpx = 0, dpy = 0;
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[data-rn]')) return;  /* 球自己处理 */
      dragging = true; dsx = ev.clientX; dsy = ev.clientY; dpx = panX; dpy = panY;
      stage.classList.add('is-drag');
      try { stage.setPointerCapture(ev.pointerId); } catch (eC) {}
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      /* 倾斜状态下竖直拖动会被 cos 压缩，用 1/cos 补回来，手感才跟手 */
      var k = 1 / Math.max(0.35, Math.cos(tilt * Math.PI / 180));
      panX = dpx + (ev.clientX - dsx);
      panY = dpy + (ev.clientY - dsy) * k;
      applyTf();
    });
    function endPan(ev) {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-drag');
      try { stage.releasePointerCapture(ev.pointerId); } catch (eR) {}
    }
    stage.addEventListener('pointerup', endPan);
    stage.addEventListener('pointercancel', endPan);
    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var step = (ev.deltaY > 0 ? -1 : 1) * 0.09;
      zoom = Math.max(0.55, Math.min(2.1, zoom + step));
      applyTf();
    }, { passive: false });

    return { sync: sync, applyTf: applyTf };
  }


  function sideFor(id) {
    if (!id) {
      return '<h4>关系网</h4><div class="rn-v">全部三篇章的人物与 {{user}} 都画在左边，每个人下面是他的关系。' +
        '<b>点一个头像球</b>：只留他和「你」，其余人的关系名全部收进这一栏。</div>' +
        '<div class="rn-k">再点同一个人</div><div class="rn-v">退回总图，所有人重新回来。</div>' +
        '<div class="rn-k">user 也是角色</div><div class="rn-v">「你」是正式节点：' +
        '村里寄住春日家、公寓住 301、神社是误闯进来的外来者。每个人的「对你」栏都单独写了。</div>' +
        '<div class="rn-k">当前设定</div><div class="rn-v">关系、房号与经历只按这张网和脚本来，' +
        '不要自己编新亲戚、新住户或新对象。</div>';
    }
    var n = findNode(id);
    if (!n) return '<h4>未找到</h4>';
    /* ★ 2026-11-18：当前模式下不存在的节点（纯爱局的苦主）不给详情 ——
       否则从角色菜单带 focus 打开时，会显示一个「本局根本没有的人」。 */
    if (!nodeVisible(n)) {
      return '<h4>' + esc(n.name) + '</h4><div class="rn-v">这个人在当前模式下不存在。' +
        '（纯爱局没有苦主，切到牛头模式才会出现。）</div>';
    }
    /* ★ 这里就是作者说的「多余的显示在右边」：
       图上只留该人自己的关系名，**其余全部逐条列在这一栏**，一条都不丢。
       每条写成「关系名：对方」，并且把对方的名字点得出来 —— 侧栏是唯一能看全的地方。 */
    var rows = [];
    EDGES.forEach(function (e) {
      if (!edgeVisible(e)) return;
      if (e[0] !== id && e[1] !== id) return;
      var other = (e[0] === id ? e[1] : e[0]);
      var otherNode = findNode(other);
      var label = other === 'user' ? '你' : (otherNode ? otherNode.name : other);
      rows.push('<div class="rn-link"><b>' + esc(e[2]) + '</b>'
        + '<span class="rn-link-to">→ ' + esc(label) + '</span></div>');
    });
    /* ★ 2026-11-18 16:05：详情文案按当前「纯爱 / 牛头」模式取。
       ⛔ 模式判据走 relNiu()（全模块唯一一份），不再就地重写一遍 ——
          原来这里自己读了一次 __thGameModeNow，和别处各写一套，
          正是「同一个量两套算法」的典型；切模式后只改一处，另一处还是旧的。 */
    var _niu = relNiu();
    var _role = (_niu && n.roleNiu) ? n.roleNiu : n.role;
    var _toUser = (_niu && n.toUserNiu) ? n.toUserNiu : n.toUser;
    var _story = (_niu && n.storyNiu) ? n.storyNiu : n.story;
    /* 苦主节点额外标一行，让玩家一眼看出这是「谁的老公 / 谁的儿子」 */
    var _peerTag = n.niuOnly
      ? '<div class=rn-k>本局身份</div><div class=rn-v style="color:#e0a86a">牛头模式专属 · 苦主（纯爱局里不存在这个人）</div>'
      : '';
    return '<h4>' + esc(n.name) + '</h4>' +
      '<div class="rn-k">篇章 / 家族</div><div class="rn-v">' + esc(arcText(n.arc)) + ' · ' + esc(n.fam) + '</div>' +
      _peerTag +
      '<div class="rn-k">身份</div><div class="rn-v">' + esc(_role) + '</div>' +
      '<div class="rn-k">对 {{user}} 来说是什么人</div><div class="rn-v">' + esc(_toUser) + '</div>' +
      '<div class="rn-k">经历 / 旧事</div><div class="rn-story">' + esc(_story) + '</div>' +
      (rows.length
        ? '<div class="rn-k">他的全部关系（' + rows.length + ' 条）</div><div class="rn-links">' + rows.join('') + '</div>'
        : '<div class="rn-k">关系</div><div class="rn-v">这个人没有登记任何关系线。</div>');
  }

  function closeRelNet() {
    try {
      var m = RDOC().getElementById('th-relnet-mask');
      if (m && m.parentNode) m.parentNode.removeChild(m);
    } catch (e) {}
  }

  function open(opt) {
    opt = opt || {};
    var focus = '';
    if (opt.focus) {
      var f = String(opt.focus);
      var hit = findNode(f);
      if (!hit) {
        /* 角色立绘传过来的可能是「春日 久美子」这类带空格的写法，容错只做去空格 */
        var compact = f.replace(/\s+/g, '');
        for (var i = 0; i < NODES.length; i++) {
          if (NODES[i].id.replace(/\s+/g, '') === compact || NODES[i].name.replace(/\s+/g, '') === compact) {
            hit = NODES[i]; break;
          }
        }
      }
      /* ★ 2026-11-18：纯爱局里点一个苦主（角色菜单带过来的 focus）⇒ 不定位，
         退回总图。否则会定位到一个不存在的球，界面空一半。 */
      focus = (hit && nodeVisible(hit)) ? hit.id : '';
    }
    closeRelNet();
    var _rd = RDOC();
    ensureStyle(_rd);
    var mask = _rd.createElement('div');
    mask.id = 'th-relnet-mask';
    mask.className = 'th-relnet-mask';
    mask.innerHTML = '<div class="th-relnet-box" role="dialog" aria-label="人物关系网">' +
      '<div class="th-relnet-head"><b>🕸 人物关系网</b>' +
      '<span>三篇章连通 · 点头像球只看他一个 · 再点一下退回总图 · 可拖 · 滚轮缩放</span>' +
      '<button type="button" class="th-relnet-x" title="关闭">✕</button></div>' +
      '<div class="th-relnet-body"><div class="th-relnet-canvas" id="th-relnet-canvas">' +
      '<div class="rn-stage" id="th-relnet-stage"></div></div>' +
      '<div class="th-relnet-side" id="th-relnet-side"></div></div>' +
      '<div class="th-relnet-hint"><b>拖头像球可移动</b>·<b>拖空白处平移</b>·<b>滚轮缩放</b>' +
      '<span class="rn-acts"><button type="button" class="rn-act" data-rnact="reset">复位</button>' +
      '<button type="button" class="rn-act" data-rnact="flat">摆平</button></span></div></div>';
    /* ⛔ 挂载点 = **游戏壳**，不是 body。
       作者的硬要求：「只在游戏界面内显示」。挂 body 时它铺的是浏览器视口，
       手机端比壳宽一圈 ⇒ 球和侧栏超出屏幕；全屏弹窗时还会被容器压住。
       壳在就挂壳（absolute + inset:0 跟壳同生共死）；壳不在才退回 body（文字版兜底，
       那时加 is-fixed 让 position:fixed 生效，否则 absolute 会缩成 0 高）。 */
    var _shell0 = null;
    try { _shell0 = _rd.querySelector('#th-gal-shell-root'); } catch (eSh0) { _shell0 = null; }
    if (_shell0) {
      try {
        var _sp0 = HOST.getComputedStyle(_shell0).position;
        if (!_sp0 || _sp0 === 'static') _shell0.style.setProperty('position', 'relative', 'important');
      } catch (ePos0) {}
      mask.classList.remove('is-fixed');
    } else {
      mask.classList.add('is-fixed');
    }
    var _body = (_shell0 && _shell0.appendChild) ? _shell0 : (_rd.body || _rd.documentElement);
    if (!_body || !_body.appendChild) { throw new Error('找不到可挂载的页面主体'); }
    _body.appendChild(mask);
    var canvas = mask.querySelector('#th-relnet-canvas');
    var side = mask.querySelector('#th-relnet-side');
    var stage = mask.querySelector('#th-relnet-stage');
    if (!canvas || !side || !stage) { throw new Error('关系网面板结构没建起来'); }
    var cur = focus;
    var scene = null;
    function paint(id) {
      cur = id;
      side.innerHTML = sideFor(id);
      /* 换选中的人：只重建场景（结构变了），但保留已拖动过的位置 */
      scene = mountScene(stage, id, pick);
    }
    /* ★★ 点球 = 选中；再点同一个人 = 退回总图。
       作者原话：「选择了某人之后其他人会消失……然后再点击一下这个人就退出到总图」。
       这个判断放在**外面**：mountScene 只负责把 id 传回来，
       它不该知道「同一个 id 算不算取消」这种业务规则。 */
    function pick(id) {
      paint(id && id === cur ? '' : id);
    }
    paint(focus);
    /* 底栏按钮：复位 = 位置回默认；摆平 = 切 3D 倾角（0° 与 16° 之间） */
    Array.prototype.forEach.call(mask.querySelectorAll('[data-rnact]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var act = b.getAttribute('data-rnact');
        if (act === 'reset') { resetPos(); paint(cur); }
        else if (act === 'flat') {
          try {
            var layer = stage.querySelector('.rn-layer');
            if (layer) {
              var tf = String(layer.style.transform || '');
              var isFlat = /rotateX\(0deg\)/.test(tf);
              layer.style.transform = isFlat ? 'rotateX(16deg)' : 'rotateX(0deg)';
              b.textContent = isFlat ? '摆平' : '斜看';
            }
          } catch (eF) {}
        }
      };
    });
    var x = mask.querySelector('.th-relnet-x');
    if (x) x.onclick = function (e) { e.stopPropagation(); closeRelNet(); };
    mask.onclick = function (e) { if (e.target === mask) closeRelNet(); };
    try {
      var key = function (e) { if (e.key === 'Escape' || e.keyCode === 27) { closeRelNet(); _rd.removeEventListener('keydown', key, true); } };
      _rd.addEventListener('keydown', key, true);
    } catch (eK) {}
  }

  var API = { open: open, close: closeRelNet, nodes: NODES, edges: EDGES, ver: REL_VER,
      /* ★ 2026-11-18：把模式判据也导出去，测试与外部入口用同一份，不许各写一套 */
      isNiu: relNiu, nodeVisible: nodeVisible, visNodes: visNodes,
    /* 自检钩子：给 _t_relnet.mjs 验布局/详情用，界面本身不读它们。
       ⚠ _svgFor 名字保留（老测试在用），但现在返回的是 **HTML 片段**（3D 版），
         不再是 SVG —— 断言要按 data-rn / rn-sphere / rn-rel 来认。 */
    _svgFor: function (sel) { return buildHTML(sel || ''); },
    _sideFor: sideFor, _layout: layout, _reset: resetPos,
    /* 给截图/自检用：把整份 CSS 交给调用方（它会往传进来的 doc 上挂一个 <style>）。
       外面自己从源码抠样式字符串迟早对不上（改一个换行就散架）。 */
    _injectStyle: ensureStyle,
    /* ★ 放射布局的自检钩子：测试要验「真的是四面八方」「真的不重叠」，
       就必须能拿到中心、半径、容量公式、弧段 —— 不许测试自己抄一份常量。 */
    _geo: function () {
      return { cx: CX, cy: CY, r0: R0, rStep: RSTEP, sy: SY, minD: MIN_D,
        w: STAGE_W, h: STAGE_H, sectors: arcSectors(), order: ARC_ORDER.slice(),
        ringCap: ringCap };
    } };
  try { window.__TH_RELNET__ = API; } catch (eW) {}
  try { if (window.top) window.top.__TH_RELNET__ = API; } catch (eT) {}

  /* ══ ★ 2026-11-16 22:29：「点击没反应」的最终修法 —— RDOC 委托 ════════
     ⛔ 真凶是 document 用错：脚本跑在 iframe，UI 和按钮在 window.top（HOST）。
        · open() 拿裸 document 建弹层 ⇒ 塞进 iframe 那个空文档，玩家看不见；
        · 委托挂 iframe 的 document ⇒ top 里的按钮点击永远收不到。
        上面已把 open/close/ensureStyle 全改走 RDOC()，这里委托也挂 RDOC()。

     委托只负责**功能页那颗按钮**（data-th-relnet）：它的绑定写在
     thBuildHudPanel() 里，受 `host.__thBuilt` 一次性构建守卫影响，
     老页面热更新后拿不到绑定，所以必须用委托兜住。
     角色菜单那颗（data-cm="relnet"）**故意不进委托** —— 它每次打开菜单都
     重新 innerHTML + 重新绑 onclick（能正确取到 self.current.name 做焦点定位），
     本来就不会失效；交给委托反而拿不到当前角色（那是闭包值，全局读不到）。 */
  try {
    (function bindRelnetDelegation() {
      function onClick(e) {
        var t = e.target, btn = null;
        try { btn = t && t.closest ? t.closest('[data-th-relnet]') : null; } catch (eC) {}
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        try { API.open(); }
        catch (eOpen) {
          try { if (typeof showToast === 'function') showToast('关系网打不开：' + ((eOpen && eOpen.message) || '未知'), 3200); } catch (eT2) {}
        }
      }
      /* ⛔ 委托必须挂在 **UI 所在的 document**（RDOC），不是脚本自己的 document。
         iframe 场景下按钮在 top 文档里，挂在 iframe 文档上永远收不到点击 ——
         这正是「脚本明明更新了、按钮点了没反应」的最后一层原因。
         三个候选全挂（去重），任一成功即可。 */
      var seenDocs = [];
      function addTo(d) {
        if (!d || !d.addEventListener) return;
        for (var i = 0; i < seenDocs.length; i++) if (seenDocs[i] === d) return;
        seenDocs.push(d);
        try { d.addEventListener('click', onClick, true); } catch (eA) {}
      }
      addTo(RDOC());
      try { addTo(document); } catch (eD1) {}
      try { if (window.top && window.top.document) addTo(window.top.document); } catch (eD2) {}
      try { if (window.parent && window.parent.document) addTo(window.parent.document); } catch (eD3) {}
    })();
  } catch (eDeleg) {}
})();
