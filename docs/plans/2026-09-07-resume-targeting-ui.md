# Resume Targeting & Interview Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Resume Protocol 根据岗位/JD 选择和改写项目证据，并为生成后的简历自动产出可执行的面试复习路线，同时完成 Pixzen 风格的前端重构。

**Architecture:** 在 `server/resumeEngine.js` 中把岗位化项目策略与面试计划作为 `generateVariant` 的稳定输出；正式简历复用同一组岗位化 bullet。前端继续使用单页 React，但增加 Hero、固定导航、岗位证据视图和面试作战室，CSS 负责响应式与克制动效。

**Tech Stack:** React 19、Vite、Express、Node.js 原生测试、lucide-react、CSS Variables。

---

### Task 1: 锁定岗位化输出契约

**Files:**
- Create: `server/resumeEngine.test.js`
- Modify: `package.json`

1. 写失败测试：同一项目在 AI 与前端岗位下排序和强调点不同。
2. 写失败测试：`projectStrategy` 保留原文、命中词、相关度与追问，且不引入不存在的数字。
3. 写失败测试：`interviewPlan` 包含技术主题、项目故事和 7 天路线。
4. 将测试接入 `npm test` 并确认因字段尚不存在而失败。

### Task 2: 实现证据驱动的项目改写

**Files:**
- Modify: `server/resumeEngine.js`
- Test: `server/resumeEngine.test.js`

1. 提取 JD/岗位关键词并对项目和分句评分。
2. 生成不虚构事实的岗位化 bullet 与可解释策略字段。
3. 让 `generateVariant.projects` 和 `createFormalResume.projects` 使用同一份岗位化结果。
4. 运行定向测试，修复后再运行全量测试。

### Task 3: 生成面试作战计划

**Files:**
- Modify: `server/resumeEngine.js`
- Test: `server/resumeEngine.test.js`

1. 为五类岗位定义技术复习主题和高频追问模板。
2. 从入选项目生成项目深挖问题和 STAR 故事提示。
3. 生成 7 天复习路线与缺口优先级。
4. 运行定向测试和全量测试。

### Task 4: 重构产品首屏和导航

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

1. 增加固定导航、移动菜单、编辑式 Hero 与岗位切换。
2. 增加岗位证据带，并与当前岗位、匹配词和缺口联动。
3. 把现有工作流收进新的 12 列舞台，保持所有原功能入口。
4. 检查键盘焦点、移动断点和 reduced-motion。

### Task 5: 增加岗位证据与面试作战室

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

1. 在岗位版结果中展示项目入选理由、命中词、原文对照和面试追问。
2. 展示技术主题、项目故事库和 7 天复习路线。
3. 补齐未生成、项目不足和 JD 缺失时的引导状态。
4. 确认打印视图仍只输出正式简历。

### Task 6: 验证与集成

**Files:**
- Modify: `README.md`

1. 更新产品能力与使用流程。
2. 运行 `npm test`，预期全部通过。
3. 运行 `npm run build`，预期退出码 0。
4. 启动本地产品，检查桌面和移动截图，修复视觉问题。
5. 检查 diff 与 git 状态，按 Lore 协议提交并合并回主工作区。
