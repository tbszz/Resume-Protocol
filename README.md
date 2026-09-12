# Resume Protocol

一个有项目目录、对话和简历预览的求职工作区：上传简历、粘贴 JD，完成证据诊断、资格筛选、针对性简历与面试准备。

## 启动

需要 Node.js 22.13 或更新版本（使用内置 SQLite）。

```powershell
npm install
# 首次安装时复制 .env.example 为 .env，填入自己的 MINIMAX_API_KEY
npm run app
```

打开 http://127.0.0.1:8787，注册账户后即可使用。已有本地 .env 会在启动时自动读取；不会覆盖外部环境变量。密钥只用于服务器请求，不能配置为 VITE_ 开头的前端环境变量。

开发时开两个终端，分别运行 `npm run server` 与 `npm run dev`，访问 http://127.0.0.1:5173。Vite 将 /api 转发到后端，登录 cookie 和数据请求保持同源。

## 数据实际存在哪里

- `data/resume-protocol.sqlite`：账户、加盐密码哈希、会话令牌哈希、聊天、职业画像、岗位和生成结果。
- `data/uploads/<用户ID>/<文件ID>`：私有原始附件。下载前必须登录且属于对应用户。
- 项目目录及会话归属同样保存在 SQLite。删除项目只取消会话归档，不删除会话。
- 自定义模型密钥加密保存在账户设置中，`data/model-settings.key` 是解密所需的本地密钥，备份必须包括它。API 不回显密钥。
- 支持用 `RESUME_PROTOCOL_DATA_DIR` 指定绝对数据目录，例如另一块磁盘的持久化目录。
- SQLite 与附件在服务重启后保留。备份时先停止服务，再整体备份 data 目录；不要只复制运行中的 sqlite 主文件。
- 这些文件和 `.env` 都已被 Git 忽略。浏览器只保存 HttpOnly 登录 cookie，新聊天不再写入 localStorage。
- 旧浏览器会话可从聊天记录中手动导入。导入会保留文字记录和原始简历材料，旧的规则生成卡片需重新生成；重复导入不会重复创建。

## 真正的 Agent 流程

已内置官方 `@anthropic-ai/claude-agent-sdk`。服务端设置 `ANTHROPIC_API_KEY` 后，默认 `RESUME_PROTOCOL_AGENT_RUNTIME=auto` 会使用 SDK；可用 `CLAUDE_AGENT_MODEL` 指定模型。设置 `RESUME_PROTOCOL_AGENT_RUNTIME=claude` 可强制使用 SDK，缺少密钥时会明确报错。没有 Claude 密钥时保留现有 MiniMax 配置；账户中自定义的兼容接口继续使用原有调用方式。不会复用本机 Claude 登录会话或将用户自定义密钥传给其他供应商。

使用现有 MiniMax 密钥驱动 SDK：设置 `RESUME_PROTOCOL_AGENT_RUNTIME=minimax`，沿用 `MINIMAX_API_KEY`、`MINIMAX_API_URL` 和 `MINIMAX_MODEL`，无需 Claude 密钥。只接受 MiniMax 官方 Anthropic 兼容端点；请求和辅助模型均路由至 MiniMax。当前本地配置已切换为此模式。其他自定义 OpenAI/Anthropic-compatible 服务仍从账户设置使用原有适配器；SDK 暂不接入 Bedrock、Vertex 或 Foundry。

SDK 只获准调用当前 Brain 决策允许的求职工具，不开放命令、文件读写或外网检索工具。每轮使用隔离临时目录，不加载项目提示词、插件或用户设置，不持久化 SDK 会话；应用数据库仍负责当前求职者的上下文。Windows 使用 SDK 自带运行程序；如需指定 Git Bash 路径，可配置 `CLAUDE_CODE_GIT_BASH_PATH`。SDK 调用失败不会回退到其他供应商并伪称成功。

每次消息由服务器调用所选模型。默认模型采用现有服务端配置，也可在左下角设置中选择自定义 OpenAI-compatible 或 Anthropic-compatible 接口。模型可连续选择工具，服务器执行后返回结果，模型根据结果继续决策和回答。界面的处理进度对应真实工具执行，普通对话不显示默认供应商品牌。

工具包含：

- `analyze_resume`：保存用户提供的原文并解析画像、完整度和缺项。
- `search_jobs`：检索现有公开 GitHub 招聘来源，返回实际来源记录；没有结果时如实说明，不用示例岗位冒充实时数据。
- `select_job`：选择已检索岗位，或保存用户提供的完整 JD。
- `generate_resume`：MiniMax 根据真实资料与目标 JD 改写完整简历。
- `prepare_interview`：基于岗位版简历生成项目追问、技术主线与七天复习计划。

上传支持 PDF、DOCX、TXT、Markdown 和 JSON，单文件最大8MB；扫描PDF会自动尝试本机OCR和多模态识别。新资料或新目标会使旧简历结果失效。岗位数据可能过期，请查看原招聘链接确认。

会话支持项目归档、切换、重命名、删除及导出 Markdown/JSON；优化简历可以直接下载 PDF 和可编辑 DOCX。原PDF可生成带高亮和建议内容的批注副本，不覆盖原文件。只在引用文字可精确定位时添加高亮，未定位建议仍可在面板查看。删除会话会同时删除它的附件。真实投递及 Boss 自动化没有暴露在聊天API中。

## 首页与工作区

首页使用指定视频播放一次；Get Started进入工作区。工作区支持亮暗主题、左侧项目和会话、中间聊天、右侧原文/批注/优化稿；窄屏通过抽屉切换侧栏。视频不进入聊天背景。

## 简历导出运行环境

当前机器自动使用已有 Codex Python 文档运行环境。其他机器需要 Python 3 和 `server/requirements-export.txt` 中的包，可通过 `RESUME_PROTOCOL_PYTHON` 指定解释器；Node依赖不包含这些Python包。

```powershell
python -m pip install -r server/requirements-export.txt
```

PDF默认嵌入本机微软雅黑字体；其他系统可设置 `RESUME_PROTOCOL_FONT` 为支持中文的TTF/TTC路径。未指定可用字体时使用PDF中文CID字体。导出及PDF批注均在本机服务器运行，文件不会提交给第三方转换服务。

## 模型设置

左下角设置可切换默认/自定义模型。自定义API要求公网HTTPS地址，支持标准工具调用；服务端校验DNS并绑定已验证地址，拒绝私网和重定向。更换API域名需要重新提供密钥。自定义模型本身必须支持工具调用和足够的上下文长度。

模型未配置、额度不足、网络故障或超时时会显示错误，已完成步骤仍保留；不会把本地规则输出标记成模型成功。规则评分只作参考，生成内容必须由用户在投递前核对。

## 鉴权与部署

注册密码至少10位，使用随机盐 scrypt。30天登录会话为随机令牌，数据库只存其SHA-256哈希。敏感API都通过用户ID限定访问，并拒绝不可信Origin。

默认仅监听127.0.0.1。部署到服务器时配置持久化数据目录、HTTPS反向代理及：

```dotenv
RESUME_PROTOCOL_ORIGIN=https://your-domain.example
RESUME_PROTOCOL_SECURE_COOKIES=true
```

本版本包含本地账户登录，不包含邮箱验证或邮件找回密码。不要删除data目录来升级应用。

## 验证

```powershell
npm test
npm run build
# 可选：会调用真实MiniMax并消耗少量额度
npm run test:live
```

测试覆盖数据库重开、两用户数据隔离、鉴权/退出/坏cookie/限流、会话上传与导出、多轮工具协议、异常响应和中文输入法。真实模型测试使用虚构测试材料，输出保存在被忽略的 tmp/live-agent-result.json。

MiniMax接口实现依据：[官方 Messages API](https://platform.minimax.io/docs/api-reference/text-chat-anthropic) 与[工具调用指南](https://platform.minimax.io/docs/guides/text-m3-function-call)。模型及API地址以 .env 中已验证可用的账户配置为准。

## 后台岗位知识服务

招聘源由后端自动维护，用户仅通过AI对话使用。服务启动后检查到期同步任务：每6小时同步 `job-radar` 和 `campus-radar`，失败至少1小时后重试。查询只读SQLite缓存，不在对话请求中临时采集外网。

每日清理：源端7天未见记录退出检索并归档；归档和运行日志保留30天。用户项目、会话、简历及SOP不参与清理。同步依赖后端进程常驻，停止期间不运行，重启补做。来源状态保存在 `job_knowledge_sources`，无需用户维护页面。

架构边界和验收要求见 [ARCHITECTURE.md](ARCHITECTURE.md)。岗位正文仍来自公开聚合源，未验证完整官方JD时只作待核实线索。
