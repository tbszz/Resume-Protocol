import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClaudeAgentModel } from './claudeAgent.js';

const config = { apiKey: 'test-key', model: 'test-model', timeoutMs: 1000 };
const fakeSdk = query => ({ query, tool: (name, description, schema, handler) => ({ name, handler }), createSdkMcpServer: value => value });
await test('MiniMax credentials and model stay on the MiniMax endpoint', async () => {
  const model = createClaudeAgentModel({ ...config, provider: 'minimax', baseUrl: 'https://api.minimaxi.com/anthropic' }, { sdk: fakeSdk(({ options }) => {
    assert.equal(options.env.ANTHROPIC_BASE_URL, 'https://api.minimaxi.com/anthropic');
    assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, 'test-key');
    assert.equal(options.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'test-model');
    return (async function* () { yield { type: 'result', subtype: 'success', result: 'OK' }; })();
  }) });
  await model({ system: '', messages: [] });
});
await test('SDK has no ambient tools, settings, sessions or unrelated secrets', async () => {
  const model = createClaudeAgentModel(config, { sdk: fakeSdk(({ options }) => {
    assert.deepEqual(options.tools, []);
    assert.deepEqual(options.settingSources, []);
    assert.deepEqual(options.skills, []);
    assert.equal(options.persistSession, false);
    assert.equal(options.strictMcpConfig, true);
    assert.equal(options.permissionMode, 'dontAsk');
    assert(options.disallowedTools.includes('PowerShell'));
    assert.equal(options.env.ANTHROPIC_API_KEY, 'test-key');
    assert.equal(options.env.MINIMAX_API_KEY, undefined);
    return (async function* () { yield { type: 'result', subtype: 'success', result: '你好' }; })();
  }) });
  assert.equal((await model({ system: '规则', messages: [] })).content[0].text, '你好');
});
await test('SDK prompt keeps image blocks as multimodal content', async () => {
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
  const model = createClaudeAgentModel(config, { sdk: fakeSdk(({ prompt }) => (async function* () {
    const iterator = prompt[Symbol.asyncIterator]();
    const first = await iterator.next();
    const content = first.value.message.content;
    assert(Array.isArray(content));
    assert.deepEqual(content.find(block => block?.type === 'image'), image);
    assert.equal(JSON.stringify(content).includes('"type":"image"'), true);
    assert.equal(typeof content[0].text, 'string');
    yield { type: 'result', subtype: 'success', result: '看到了' };
  })()) });
  assert.equal((await model({ system: '规则', messages: [{ role: 'user', content: [{ type: 'text', text: '识别这页PDF' }, image] }] })).content[0].text, '看到了');
});
await test('only registered career tools execute and return their actual result', async () => {
  const calls = [];
  const model = createClaudeAgentModel(config, { sdk: fakeSdk(({ options }) => (async function* () {
    assert.equal((await options.canUseTool('Bash', {})).behavior, 'deny');
    const t = options.mcpServers.career.tools[0];
    assert.equal(t.name, 'search_jobs');
    const result = await t.handler({ query: '设计' });
    assert.deepEqual(JSON.parse(result.content[0].text), { jobs: [] });
    yield { type: 'result', subtype: 'success', result: '没有匹配岗位' };
  })()) });
  await model.runTools({ system: '规则', messages: [], tools: [{ name: 'search_jobs', description: '搜索', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }], execute: async (name, args) => { calls.push([name, args]); return { jobs: [] }; } });
  assert.deepEqual(calls, [['search_jobs', { query: '设计' }]]);
});
await test('SDK failure and empty completion cannot masquerade as success', async () => {
  for (const result of [{ type: 'result', subtype: 'error_max_turns', errors: ['secret-key'] }, { type: 'result', subtype: 'success', result: '' }]) {
    const model = createClaudeAgentModel(config, { sdk: fakeSdk(() => (async function* () { yield result; })()) });
    await assert.rejects(model({ system: '', messages: [] }), e => !e.message.includes('secret-key'));
  }
});
await test('cancelled requests never start SDK or execute tools', async () => {
  const controller = new AbortController(); controller.abort();
  const model = createClaudeAgentModel(config, { sdk: fakeSdk(() => { assert.fail('query started after cancellation'); }) });
  await assert.rejects(model({ system: '', messages: [], signal: controller.signal }), { name: 'AbortError' });
});

await test('SDK tool writes are serialized and callback failures are returned as tool errors', async () => {
  const order = [];
  const model = createClaudeAgentModel(config, { sdk: fakeSdk(({ options }) => (async function* () {
    const handler = options.mcpServers.career.tools[0].handler;
    const results = await Promise.all([handler({ query: 'first' }), handler({ query: 'second' })]);
    assert.equal(results[1].isError, true);
    yield { type: 'result', subtype: 'success', result: '部分完成' };
  })()) });
  await model.runTools({ system: '', messages: [], tools: [{ name: 'search_jobs', description: '', input_schema: { properties: { query: { type: 'string' } } } }], execute: async (_, args) => {
    order.push('start-' + args.query);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push('end-' + args.query);
    if (args.query === 'second') throw new Error('offline');
    return {};
  } });
  assert.deepEqual(order, ['start-first', 'end-first', 'start-second', 'end-second']);
});

await test('SDK timeout aborts the query and gives a bounded public error', async () => {
  const model = createClaudeAgentModel({ ...config, timeoutMs: 10 }, { sdk: fakeSdk(({ options }) => (async function* () {
    await new Promise(resolve => options.abortController.signal.addEventListener('abort', resolve, { once: true }));
    yield { type: 'result', subtype: 'success', result: 'too late' };
  })()) });
  await assert.rejects(model({ system: '', messages: [] }), /超时/);
});

await test('uncooperative tool cannot keep a cancelled SDK request open', async () => {
  let closed = false;
  const model = createClaudeAgentModel({ ...config, timeoutMs: 10 }, { sdk: fakeSdk(({ options }) => {
    const stream = (async function* () {
      await options.mcpServers.career.tools[0].handler({});
      yield { type: 'result', subtype: 'success', result: 'late' };
    })();
    stream.close = () => { closed = true; };
    return stream;
  }) });
  await assert.rejects(model.runTools({ system: '', messages: [], tools: [{ name: 'prepare_interview', input_schema: { properties: {} } }], execute: () => new Promise(() => {}) }), /超时/);
  assert.equal(closed, true);
});
