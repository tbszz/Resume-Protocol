import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toAssistantMessage, visibleMessages, promptText } from './workspaceRuntime.js';

await test('workspace refactor leaves landing markup, original CSS and document head intact', () => {
  const main = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(main.slice(main.indexOf('function LandingPage('), main.indexOf('function MobileBar('))), 'd740863b9648f1d08441c44267877bcb63053cb08056652782bd763ea7a55b2d');
  assert.equal(hash(readFileSync(new URL('./styles.css', import.meta.url))), 'e16d429f22683e4e392a3cba6be872b75b82a5bfa66480edc32dfd2bd057a373');
  assert.equal(hash(readFileSync(new URL('../index.html', import.meta.url))), '242269610b3fa65cd670183793bc3126cf3f44f177b65ed28a6108178c9f5a99');
});
await test('runtime preserves attachment and business result identity without inventing messages', () => {
  const message = { id: 'file-1', role: 'user', content: '简历', kind: 'attachment', data: { documentId: 'doc-1', parseStatus: { status: 'unreadable' } } };
  const converted = toAssistantMessage(message);
  assert.equal(converted.id, message.id);
  assert.equal(converted.role, 'user');
  assert.deepEqual(converted.metadata.custom.careerMessage, message);
  const diagnosis = { id: 'a', role: 'assistant', kind: 'diagnosis', content: '核对原文', data: { completeness: null } };
  assert.deepEqual(toAssistantMessage(diagnosis).metadata.custom.careerMessage.data, diagnosis.data);
});
await test('only server welcome placeholder is replaced by the new empty state', () => {
  const welcome = { id: 'c-welcome', role: 'assistant', content: 'welcome' };
  assert.deepEqual(visibleMessages({ id: 'c', messages: [welcome] }), []);
  const real = { id: 'real', role: 'assistant', content: '说明' };
  assert.deepEqual(visibleMessages({ id: 'c', messages: [welcome, real] }), [real]);
});
await test('composer extracts text only and preserves line breaks', () => {
  assert.equal(promptText({content:[{type:'text',text:'第一行\n第二行'},{type:'image',image:'not text'}]}), '第一行\n第二行');
});
