# Agent Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Resume Protocol 增加一个全屏视频 Agent 对话入口，用一句自然语言把用户路由到资料诊断、岗位雷达、定制简历或面试准备。

**Architecture:** 新建无副作用的意图分类模块，由 React 入口组件调用；分类结果只触发现有 App 动作和锚点，不复制业务逻辑。UI 在当前单页顶部，视频失败时降级为深绿色背景。

**Tech Stack:** React、Vite、Node 原生测试、CSS、Lucide React。

---

### Task 1: 意图路由契约

**Files:**
- Create: `src/agentIntent.js`
- Create: `src/agentIntent.test.js`
- Modify: `package.json`

1. 写失败测试，覆盖 intake/jobs/resume/interview 四种意图、空输入和默认帮助。
2. 运行测试确认缺少模块而失败。
3. 实现最小关键词路由与前置条件决策。
4. 运行定向测试及全量测试。

### Task 2: Agent Gateway 组件

**Files:**
- Modify: `src/main.jsx`
- Modify: `index.html`

1. 增加 `AnimatedText`、视频 Hero、上下文状态轨、对话输入与快捷动作。
2. 接入现有 `parseMaterial`、岗位雷达、`generateResume` 和面试 section。
3. 支持 Enter 发送、Shift+Enter 换行、空输入错误和 aria-live 回复。
4. 导入 Inria Serif，并确保视频是 muted/autoplay/loop/playsInline。

### Task 3: 入口视觉与响应式

**Files:**
- Modify: `src/styles.css`

1. 实现 `#2B3534` 输入舱、视频双层遮罩、底部 32px 渐变和逐词 fade-up。
2. 实现快捷动作横向滚动、隐藏滚动条和右侧渐变。
3. 完成桌面/平板/390px 移动布局、焦点和 reduced-motion。
4. 保持现有打印规则。

### Task 4: 文档、验证与集成

**Files:**
- Modify: `README.md`

1. 记录统一 Agent 入口能力和本地路由边界。
2. 运行 `npm test` 和 `npm run build`。
3. 启动产品，用 Playwright 验证视频、输入、快捷动作和四种路由。
4. 截取桌面/移动截图并复核可读性。
5. 按 Lore 协议提交并合并到 `main`。
