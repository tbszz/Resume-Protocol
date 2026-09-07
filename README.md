# Resume Protocol

Resume Protocol 是一个本地运行的多岗位简历生成、岗位情报和投递队列产品。核心流程不是“填表壳子”，而是先把未分层的个人材料整理成结构化职业画像，提示缺失信息，再让用户选择目标岗位和简历模板，最后生成一页正式简历并进入投递队列。

## 核心流程

1. 导入个人材料
   - 支持粘贴未整理文本。
   - 支持上传 `.pdf`、`.docx`、`.txt`、`.md`、`.json`。
   - 自动识别联系方式、教育经历、技能、项目、实习经历、奖项和量化指标。

2. 资料完整度追问
   - 输出完整度评分、缺失信息提醒、优势分析、风险点提醒。
   - 检查基本信息、教育经历、实习/工作经历、项目经历、技能栈、荣誉/证书/竞赛、求职目标。
   - 缺哪一块就给出具体追问，并提供补充输入框。
   - 补充后可重新分析，避免在信息不足时直接生成空泛简历。

3. 岗位情报库
   - 内置 AI、后端、前端、产品、运营岗位画像。
   - 每类岗位区分校招、实习、社招要求。
   - 当前默认使用 GitHub 实时岗位源，接入 SpeedyApply AI/ML、SpeedyApply SWE、Zapply Software Jobs 和 0voice 计算机春招。
   - GitHub 源解析公司、岗位、地点、薪资、投递链接、岗位年龄和来源仓库，并结构化为岗位卡。
   - 聚合源会标记为 GitHub / 第三方情报，不和官方招聘入口混淆，投递前保留原始来源链接用于复核。
   - 支持粘贴大厂官网/招聘站岗位详情 URL 导入 JD。

4. 模板库选择
   - 必须先选模板再生成正式简历。
   - 模板库包含 Reactive Resume 风格启发、Resumify ATS 风格启发和本地中文岗位模板。
   - 覆盖校招、ATS、AI 应用、后端高密度、前端作品集、产品运营等场景。

5. 生成职业画像与正式简历
   - 自动计算 AI、后端、前端、产品、运营五类岗位适配分。
   - 可上传头像，生成带头像的一页正式简历。
   - 正式简历支持内容微调、预览、导出 JSON 和浏览器打印/PDF。
   - 配置 MiniMax 后，可用 AI 综合整理输入材料；未配置或调用失败时自动使用本地规则生成。
   - 项目经历和实习/工作经历会分开处理，并做重复内容去重。

6. 生成针对性岗位素材
   - 按目标岗位和 JD 对项目进行相关度排序，同一项目会为 AI、后端、前端、产品、运营岗位切换不同叙事重心。
   - 每条项目内容都保留原始事实、命中关键词、相关度和量化证据状态；系统只重排已有事实，不新增指标或职责。
   - 正式一页简历与岗位版素材复用同一份岗位化项目 bullet，避免两个出口内容不一致。
   - 保留“改写差异”视图，鼠标悬停横线时流式展开针对性修改点。
   - 支持导出 JSON 变体包和浏览器打印 PDF。

7. 面试作战室
   - 根据目标岗位生成 4 条技术复习主线、项目深挖问题和简历自证清单。
   - 自动把入选项目整理为 STAR 故事库，并提示指标口径、方案取舍、故障定位和失败复盘等追问。
   - 提供从 JD 校准、项目讲稿、技术复习到模拟面试的 7 天冲刺计划。

8. Boss 岗位抓取和投递
   - 启动本地 Chrome/Edge 持久化浏览器，由用户手动登录 Boss 账号。
   - 在 Boss 搜索结果页抓取岗位卡片，提取职位、公司、地点、薪资、链接和描述。
   - 对岗位做匹配评分，加入投递队列。
   - 默认 dry-run，只生成执行日志，不真实点击投递。
   - 真实执行前需要同时关闭 dry-run 并勾选“确认启用自动沟通”。
   - 支持公司黑名单、单批数量限制、节流延迟和执行日志。

## 安全边界

本项目不保存 Boss 账号密码，不绕过验证码、滑块、安全验证、登录校验或风控限制。自动投递只使用用户已经登录的本地浏览器页面，并在检测到验证码、异常访问、请登录等风险文案时停止执行。

本地自动化 API 只接受 `127.0.0.1` / `localhost` 的产品页面或开发页面来源，避免其他网页跨域触发本机投递接口。

真实投递可能受平台规则和账号风控影响，建议先使用 dry-run 验证队列和打招呼语，再少量执行。

## 简历策略依据

产品遵循“事实源 → JD 映射 → 项目排序 → 岗位化 bullet → 面试追问”的证据链。参考资料包括：

- [Google 学生简历建议](https://students.googleblog.com/2015/07/google-interns-top-5-resume-tips.html)：针对岗位定制、只写能深入解释的经历、用事实和指标量化影响。
- [Microsoft 面试建议](https://careers.microsoft.com/v2/global/en/hiring-tips/interview-tips.html)：研究岗位，准备具体案例，并用 STAR(R) 组织回答。
- [Amazon SDE 技术主题](https://amazon.jobs/content/en/how-we-hire/interview-prep/software-development-topics)：按编码、系统设计、数据库、操作系统、网络和 AI/ML 等主线复习。
- [Meta 软件工程面试准备](https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/)：限时练习、讲清思考过程、检查边界与 bug，并准备行为故事。

GitHub 产品结构参考：[Resume Matcher](https://github.com/srbhr/Resume-Matcher)、[Reactive Resume](https://github.com/amruthpillai/reactive-resume)、[OpenResume](https://github.com/xitanggg/open-resume) 和 [job-hunt-copilot](https://github.com/spontaneousai/job-hunt-copilot)。这些项目只用于交互与工作流借鉴，不作为招聘结论的权威来源。资料最后核验日期：2026-09-07。

## 技术栈

- React + Vite：前端单页应用。
- lucide-react：界面图标。
- Express：本地 API 服务。
- multer：文件上传。
- pdf-parse：PDF 简历文本解析。
- mammoth：Word `.docx` 简历文本解析。
- playwright-core：连接本机 Chrome/Edge，实现 Boss 页面抓取和可控点击。
- MiniMax Anthropic-compatible API：可选 AI 简历整合。
- CSS Grid / CSS Variables：工业控制台风格响应式界面。

## MiniMax 配置

MiniMax 只在服务端调用，密钥不会进入前端包。不要把真实 key 写进源码；建议只在当前 PowerShell 会话里设置：

```powershell
$env:MINIMAX_API_KEY="你的 MiniMax Key"
$env:MINIMAX_API_URL="https://api.minimaxi.com/anthropic"
$env:MINIMAX_MODEL="MiniMax-M2.7"
npm run app
```

也兼容 Anthropic 风格环境变量：

```powershell
$env:ANTHROPIC_API_KEY="你的 MiniMax Key"
$env:ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
```

接口会自动把 base URL 补齐为 `/v1/messages`。官方文档对应的是 Anthropic-compatible `POST /anthropic/v1/messages`，鉴权头为 `X-Api-Key`。

## 本地运行

安装依赖：

```powershell
npm install
```

启动完整产品：

```powershell
npm run app
```

打开：

```text
http://127.0.0.1:8787
```

开发模式可以前后端分开运行：

```powershell
npm run dev -- --port 5173
npm run server
```

## Boss 使用步骤

1. 在产品里填入 Boss 搜索页 URL，例如：

```text
https://www.zhipin.com/web/geek/job?query=AI%20Agent
```

2. 点击“启动 Boss 浏览器”。
3. 在弹出的浏览器里手动登录，并打开目标搜索结果页。
4. 回到产品点击“抓取当前页岗位”。
5. 检查匹配评分，把合适岗位加入队列。
6. 先保持 dry-run，点击“执行队列”查看将要发生的动作。
7. 确认无误后，关闭 dry-run 并勾选确认框，再执行小批量自动沟通。

## API

- `GET /api/health`：服务健康检查。
- `GET /api/templates`：读取正式简历模板库。
- `POST /api/profile/parse`：解析粘贴文本。
- `POST /api/intake/analyze`：分析资料完整度并生成缺失信息追问。
- `POST /api/profile/upload`：解析上传文件。
- `POST /api/resume/generate`：按岗位、模板、JD 生成简历版本。
- `POST /api/resume/formalize`：生成一页正式简历，优先 MiniMax，失败时本地规则生成。
- `GET /api/jobs/library`：读取本地岗位情报库和 GitHub 岗位源列表。
- `POST /api/jobs/live`：刷新 GitHub 实时岗位源并生成岗位情报卡。
- `POST /api/jobs/import-url`：从岗位详情 URL 导入 JD。
- `POST /api/jobs/demo`：生成示例岗位。
- `POST /api/jobs/score`：给岗位列表计算匹配分。
- `POST /api/queue/add`：加入投递队列。
- `GET /api/state`：读取当前会话状态。
- `POST /api/boss/start`：启动本地 Boss 浏览器。
- `GET /api/boss/status`：读取浏览器连接状态。
- `POST /api/boss/scrape`：抓取当前 Boss 页面岗位。
- `POST /api/boss/apply`：执行 dry-run 或自动沟通队列。
- `POST /api/boss/close`：关闭浏览器。

## 构建验证

```powershell
npm run build
```

构建产物在 `dist/`，`npm run app` 会先构建再启动本地服务。
