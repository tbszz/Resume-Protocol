# 本次验证

## 后续：MiniMax 密钥接入

用户要求沿用 MiniMax 密钥后，新增 `RESUME_PROTOCOL_AGENT_RUNTIME=minimax` 并更新本地 `.env`（密钥原值未改、未输出）。真实调用验证：原 MiniMax 接口返回 OK；Claude Agent SDK 经 MiniMax 官方兼容端点返回 OK；SDK 实际调用 in-process MCP 测试工具并读取返回值成功。模型沿用 `MiniMax-M2.7`。下文“没有 Claude Key、未执行真实 Claude 推理”仍成立，但 SDK + MiniMax 推理与工具调用已完成实测。

- `npm test`：通过，包含现有求职、上传、权限、存储、导出测试，以及新增 `agentConversation.test.js`、`claudeAgent.test.js`。
- `npm run build`：通过。
- `node --check server/claudeAgent.js`、`node --check server/careerAgent.js`：通过。项目未配置独立 lint/typecheck 命令。
- 官方 SDK 实际导入、Zod 工具定义、in-process MCP server 工厂：通过。
- SDK 自带 Windows 程序 `--version`：返回 `2.1.269`。
- SDK 单测使用可控 query 替身，覆盖工具隔离、真实业务执行器接入、并发串行化、错误结果、取消、超时及工具不响应取消时请求仍可结束。
- 当前环境没有 `ANTHROPIC_API_KEY`，未执行真实 Claude 付费推理；不能将上述测试解释为线上模型质量验证。auto 模式继续使用现有兼容模型。
- `npm audit` 报告 7 项现有依赖问题（1 low / 1 moderate / 5 high），涉及 xmldom、body-parser、multer、nanoid、postcss、qs、vite；未在这次接入中执行广泛升级。SDK 新增包未出现在该列表中。

## 来源核对

用户提供的 tbszz/claude-code 是第三方 fork，README 自称含泄露源码；未复制或执行其代码。接入采用官方包 `@anthropic-ai/claude-agent-sdk@0.3.269`，配套 `zod@4.4.3`。

- https://github.com/anthropics/claude-agent-sdk-typescript
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/permissions

## 实现范围

SDK 查询不加载用户/项目配置、技能、外部 MCP 或持久会话，内置工具关闭。Brain 与执行器都守住本轮工具授权；SDK handler 串行执行。读取失败附件保留，旧材料不会被覆盖；请求分析失败的新附件时不拿旧材料替代。普通助手历史仅作为指代上下文，不加入候选人事实来源。
