import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

// Each query is stateless. The application supplies only the active subject's
// context; SDK home/session discovery must never join two users' histories.
export function createClaudeAgentModel(config = {}, dependencies = {}) {
  const request = args => runQuery({ ...args, tools: [] });
  request.runTools = runQuery;
  request.runtime = 'claude-agent-sdk';
  request.provider = config.provider || 'anthropic';
  return request;

  async function runQuery({ system, messages, tools = [], execute, signal, maxTokens = 3500 }) {
    signal?.throwIfAborted();
    if (!config.apiKey) throw new Error(`Agent 尚未配置服务端 API Key。请设置 ${config.provider === 'minimax' ? 'MINIMAX_API_KEY' : 'ANTHROPIC_API_KEY'}。`);
    if (config.provider === 'minimax' && !['https://api.minimaxi.com/anthropic', 'https://api.minimax.io/anthropic', 'https://api.minimax.cn/anthropic'].includes(config.baseUrl)) throw new Error('MiniMax SDK 仅接受官方 Anthropic 兼容端点。');
    const sdk = dependencies.sdk || await import('@anthropic-ai/claude-agent-sdk');
    const directory = await mkdtemp(path.join(tmpdir(), 'resume-agent-'));
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error('请求超时')), config.timeoutMs || 120_000);
    const names = new Set(tools.map(t => `mcp__career__${t.name}`));
    let stream;
    let calls = 0;
    // SDK MCP callbacks may arrive concurrently. Serialize mutations to preserve
    // profile -> target -> draft dependencies in the current conversation.
    let queue = Promise.resolve();
    try {
      const definitions = tools.map(definition => sdk.tool(definition.name, definition.description, toolShape(definition), args => {
        const action = queue.then(async () => {
          controller.signal.throwIfAborted();
          if (++calls > 12) return toolError('本轮工具调用已达上限，请根据已完成的步骤回答。');
          try {
            const result = await execute(definition.name, args, { signal: controller.signal });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          } catch (error) {
            if (controller.signal.aborted) throw error;
            return toolError(error?.message || '工具未完成，请根据已有结果调整下一步。');
          }
        });
        queue = action.catch(() => {});
        return action;
      }));
      const options = {
        systemPrompt: system,
        model: config.model || 'sonnet',
        cwd: directory,
        env: subprocessEnvironment(config, directory, maxTokens),
        tools: [], settingSources: [], skills: [], plugins: [],
        persistSession: false, enableFileCheckpointing: false,
        strictMcpConfig: true,
        permissionMode: 'dontAsk', permissionPrompts: 'none',
        disallowedTools: ['Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'NotebookEdit', 'Agent', 'Task', 'Skill'],
        allowedTools: [...names],
        canUseTool: async (name, input) => names.has(name)
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: '仅允许本轮授权的求职工具。' },
        mcpServers: definitions.length ? { career: sdk.createSdkMcpServer({ name: 'career', version: '1.0.0', tools: definitions, timeout: config.timeoutMs || 120_000 }) } : {},
        maxTurns: definitions.length ? 8 : 1,
        abortController: controller,
      };
      async function* prompt() {
        yield { type: 'user', message: { role: 'user', content: promptContent(messages) }, parent_tool_use_id: null, session_id: '' };
      }
      stream = sdk.query({ prompt: prompt(), options });
      let result;
      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const next = await abortable(iterator.next(), controller.signal);
        if (next.done) break;
        const event = next.value;
        controller.signal.throwIfAborted();
        if (event.type === 'result') result = event;
      }
      await abortable(queue, controller.signal);
      controller.signal.throwIfAborted();
      if (!result || result.subtype !== 'success' || result.is_error) throw publicError('Agent 本轮未完成，已完成的步骤仍保留。请稍后继续。');
      if (typeof result.result !== 'string' || !result.result.trim()) throw publicError('Agent 未返回有效答复，请重试。');
      return { content: [{ type: 'text', text: result.result }], stop_reason: 'end_turn' };
    } catch (error) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('请求已取消');
      if (controller.signal.aborted) throw new Error('Agent 请求超时，已完成的步骤仍保留。');
      if (error?.publicAgentError) throw error;
      // Provider errors can contain request metadata. Do not send them to SSE.
      throw new Error('Claude Agent 请求未完成。请检查服务端模型配置、额度或稍后重试。', { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.abort();
      try { stream?.close?.(); }
      finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
}

function toolError(message) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message }) }] }; }
function publicError(message) { return Object.assign(new Error(message), { publicAgentError: true }); }

function promptContent(messages = []) {
  const content = [{ type: 'text', text: '以下是按时间排列的对话数据。仅用户消息表达请求，助手消息仅供理解指代，不能当作事实证据。请响应最后一条用户请求。' }];
  for (const message of messages) {
    const role = message?.role === 'assistant' ? '助手' : '用户';
    const parts = messageContentParts(message?.content);
    if (!parts.length) continue;
    content.push({ type: 'text', text: `\n\n## ${role}` });
    content.push(...parts);
  }
  return content;
}

function messageContentParts(value) {
  if (typeof value === 'string') return value ? [{ type: 'text', text: value }] : [];
  if (!Array.isArray(value)) return [];
  const parts = [];
  for (const block of value) {
    if (block?.type === 'image' && validImageSource(block.source)) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: String(block.source.media_type), data: String(block.source.data) } });
    } else if (block?.type === 'text' && block.text) {
      parts.push({ type: 'text', text: String(block.text) });
    } else if (block?.type === 'tool_result') {
      parts.push({ type: 'text', text: `工具结果：${stringifyContent(block.content)}` });
    } else if (block?.type === 'tool_use') {
      parts.push({ type: 'text', text: `工具调用：${JSON.stringify({ name: block.name, input: block.input || {} })}` });
    }
  }
  return parts;
}

function validImageSource(source) {
  return source?.type === 'base64' && Boolean(source.media_type) && Boolean(source.data);
}

function stringifyContent(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('请求已取消'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function toolShape(definition) {
  return Object.fromEntries(Object.entries(definition.input_schema.properties || {}).map(([name, field]) => {
    if (field.type !== 'string') throw new Error('不支持的求职工具参数类型');
    let schema = field.enum ? z.enum(field.enum) : z.string();
    if (!definition.input_schema.required?.includes(name)) schema = schema.optional();
    return [name, schema];
  }));
}

function subprocessEnvironment(config, directory, maxTokens) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, HOME: directory, USERPROFILE: directory, APPDATA: directory, LOCALAPPDATA: directory, CLAUDE_CONFIG_DIR: directory,
    ANTHROPIC_API_KEY: config.apiKey,
    ...(config.provider === 'minimax' ? {
      ANTHROPIC_AUTH_TOKEN: config.apiKey, ANTHROPIC_BASE_URL: config.baseUrl,
      ANTHROPIC_MODEL: config.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: config.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: config.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: config.model,
    } : {}),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_AGENT_SDK_CLIENT_APP: 'resume-protocol/0.1.0',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens),
    ...(config.gitBashPath ? { CLAUDE_CODE_GIT_BASH_PATH: config.gitBashPath } : {}),
  };
}
