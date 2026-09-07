# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-09-07
- Primary product surfaces: Agent 统一入口、职业资料工作流、岗位雷达、简历工作台、面试作战室、投递队列。
- Evidence reviewed: `README.md`、`docs/prd/2026-08-30-resume-protocol-prd.md`、`docs/plans/2026-09-07-resume-targeting-design.md`、`src/main.jsx`、`src/styles.css`、用户提供的 Vitara 视频入口提示词。

## Brand
- Personality: 冷静、可信、主动、精确；像一位了解用户全部材料的求职参谋，而不是夸张的简历生成器。
- Trust signals: 本地优先、事实可追溯、明确展示资料/JD/版本的就绪状态、生成内容可解释。
- Avoid: 医疗产品措辞、空泛 AI 光效、聊天机器人拟人头像、虚假的“万能 Agent”、纯装饰统计、低对比视频文字。

## Product goals
- Goals: 用一个自然语言入口承接简历诊断、岗位搜索、岗位定制和面试准备；让用户不必先理解八步工作台。
- Non-goals: 本轮不新增通用 LLM 对话后端、不替用户自动提交真实投递、不隐藏深度编辑工作台。
- Success signals: 用户发送一句目标后获得清晰下一步；四类核心意图都能路由到正确界面；已有资料状态会影响 Agent 建议。

## Personas and jobs
- Primary personas: 同时准备多个岗位方向的校招/实习候选人；需要快速针对 JD 改简历的技术求职者。
- User jobs: “帮我诊断这份简历”“找 AI Agent 校招”“按这份 JD 生成前端版”“根据当前简历准备面试”。
- Key contexts of use: 桌面端深度编辑；移动端快速发起任务、查看下一步和岗位结果。

## Information architecture
- Primary navigation: Agent 入口、职业资料、岗位雷达、正式简历、面试作战室。
- Core routes/screens: 当前仍为单页；Hero Agent Gateway 负责意图路由，原工作台各 section 保留锚点。
- Content hierarchy: 视频与主张 → Agent 输入舱/最近回复 → 产品承诺 → 深度工作台。

## Design principles
- Conversation is navigation: 聊天入口首先是命令分发器，每次回复必须指向一个可执行动作。
- Context before confidence: Agent 根据资料、目标岗位、简历版本和面试计划的真实状态给建议，不假装任务已经完成。
- Depth remains visible: 对话降低入口门槛，但复杂资料和生成结果仍由结构化工作台承载。
- Tradeoffs: 采用规则化意图路由保证本地可用；未来可替换为模型路由，但 UI 契约保持稳定。

## Visual language
- Color: Deep Care `#2B3534`、Cloud `#F7F7F2`、Mist `#D8DEDB`、Ink `#17201F`、Signal `#D8FF7C`、White `#FFFFFF`。
- Typography: 标题 Inria Serif 300/400/700，字距 `-0.07em`；正文 Helvetica Neue；状态与工具标签 IBM Plex Mono/Consolas。
- Spacing/layout rhythm: 移动端 24px、平板 48px、桌面 80px 外边距；核心输入舱最大宽度 760px；首屏至少 100svh。
- Shape/radius/elevation: 输入舱 24px 圆角和深色柔影；操作胶囊全圆角；工作台沿用精确边线。
- Motion: 标题逐词 0.1s stagger fade-up；视频自动循环；输入舱轻微上浮；所有动效支持 reduced-motion。
- Imagery/iconography: 精确使用用户给定 CloudFront 视频；Lucide 图标只表达动作，不作装饰。

## Components
- Existing components to reuse: `SiteNav`、`App` 状态与动作函数、岗位雷达、正式简历、面试作战室、`EmptyState`。
- New/changed components: `AgentGateway`、`AnimatedText`、`AgentComposer`、`AgentContextRail`、`PromiseSection`。
- Variants and states: 空输入、已发送、路由成功、前置条件不足、执行中、视频不可播放。
- Token/component ownership: 入口 token 使用 `--gateway-*` 前缀，避免覆盖正式简历打印 token；组件仍暂存于 `src/main.jsx`，后续拆分不改变 API。

## Accessibility
- Target standard: WCAG 2.2 AA 的颜色、键盘和语义基线。
- Keyboard/focus behavior: textarea 可直接聚焦；Enter 发送、Shift+Enter 换行；按钮有可见焦点；移动菜单保留语义。
- Contrast/readability: 视频上使用双层暗色渐变与文字阴影；输入框和回复文本满足深色背景对比。
- Screen-reader semantics: 聊天记录使用 `aria-live="polite"`，快捷动作是明确按钮，视频标记为装饰。
- Reduced motion and sensory considerations: reduced-motion 时关闭逐词位移、ticker 和平滑动画；视频仍可由浏览器策略静音播放，失败时显示静态渐变。

## Responsive behavior
- Supported breakpoints/devices: 390px 移动端、768px 平板、1280px+ 桌面。
- Layout adaptations: 桌面导航显示全部入口，移动端使用菜单；快捷动作横向滚动；第二段承诺由两列变一列。
- Touch/hover differences: 所有 hover 信息都有常驻文本或点击替代；触控目标至少 42px。

## Interaction states
- Loading: 发送后短暂显示“正在判断下一步”，随后执行本地路由。
- Empty: 首次进入显示欢迎语与四个示例目标。
- Error: 空输入提示“先说你现在最想完成什么”；动作失败沿用全局事件日志，并在对话中说明修复路径。
- Success: 回复明确“已带你到岗位雷达/已开始分析/已生成岗位版素材”。
- Disabled: 前置资料不足时不静默禁用，而是回复缺失条件并导航到补充位置。
- Offline/slow network, if applicable: 视频失败不阻塞入口；本地规则路由与工作台保持可用。

## Content voice
- Tone: 简洁、直接、像共事多次的职业顾问。
- Terminology: 使用“职业资料、目标岗位、岗位版简历、面试作战室”，避免“魔法生成、一键上岸”。
- Microcopy rules: 每条回复包含当前判断 + 下一步动作；按钮用动词开头；不承诺录用率或 ATS 通过率。

## Implementation constraints
- Framework/styling system: React + Vite + 现有 CSS；不迁移 TypeScript/Tailwind，不新增运行时依赖。
- Design-token constraints: 入口样式隔离在 `.agent-gateway`；打印样式必须继续只输出正式简历。
- Performance constraints: 视频使用远程流和 `preload="metadata"`；页面核心交互不能等待视频完成加载。
- Compatibility constraints: Chromium/Edge 当前版本；自动播放必须 muted + playsInline。
- Test/screenshot expectations: 意图路由单元测试；生产构建；1440×1000 和 390×844 浏览器截图；验证视频 readyState、快捷动作、Enter/Shift+Enter、四种路由。

## Open questions
- [ ] 通用模型对话与长期会话记忆留到后续模型适配器阶段；owner: product/engineering；impact: 当前回复采用确定性本地路由。
- [ ] 登录/多用户入口暂不显示；owner: product；impact: 避免在本地单用户产品中制造无效按钮。
