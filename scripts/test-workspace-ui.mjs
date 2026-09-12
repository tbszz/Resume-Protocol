import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

const directory = await mkdtemp(path.join(tmpdir(), 'resume-workspace-test-'));
const screenshots = path.join(tmpdir(), 'resume-assistant-ui');
await mkdir(screenshots, { recursive: true });
const port = 8894;
process.env.RESUME_PROTOCOL_PORT = String(port);
const db = createDatabase({ filename: path.join(directory, 'test.sqlite') });
const response = text => ({ content: [{ type: 'text', text }] });
const model = async ({ system, messages, signal }) => {
  if (system.includes('Brain 意图识别器')) return response(JSON.stringify({ intents: ['answer'], subject: 'current', objective: '回应用户的问题', facts: [], questions: [] }));
  if (JSON.stringify(messages).includes('请慢一点')) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 4000);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  }
  if (system.includes('事实审校员')) return response(JSON.stringify({ answer: '可以，我们先从你的真实经历和求职目标开始。', questions: [] }));
  return response('可以，我们先从你的真实经历和求职目标开始。');
};
const app = createApp({ database: db, dataDir: directory, model, search: async () => ({ jobs: [], sources: [] }) });
const server = app.listen(port, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = `http://127.0.0.1:${port}`;
const capture = async name => {
  await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert(sizes.scroll <= sizes.width, `${name} horizontal overflow ${JSON.stringify(sizes)}`);
};
try {
  await page.goto(base);
  await page.locator('.landing-page').waitFor();
  await capture('landing-unchanged');
  const registration = await context.request.post(`${base}/api/auth/register`, { data: { email: 'ui-fixture@example.test', name: '林同学', password: 'workspace-fixture-password' } });
  assert(registration.ok());
  await page.goto(`${base}/#workspace`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '下一步，我们一起准备。' }).waitFor();
  await capture('desktop-light-empty');
  await page.getByRole('button', { name: '诊断简历', exact: true }).click();
  assert.match(await page.locator('.aui-composer-input').inputValue(), /诊断简历/);
  const input = page.getByRole('textbox', { name: '给 Resume Protocol 发消息' });
  await input.fill('你好，我想准备求职。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.getByText('可以，我们先从你的真实经历和求职目标开始。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.aui-status'));
  assert.equal(await page.locator('.aui-message.user').count(), 1);
  await page.getByRole('button', { name: '复制回复', exact: true }).last().click();
  await page.getByRole('button', { name: '已复制回复', exact: true }).waitFor();
  await input.fill('请慢一点回答');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor();
  await page.getByRole('button', { name: '停止生成', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.aui-status'));
  await page.getByText('已停止生成，已完成的内容仍保留。', { exact: true }).last().waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: '林同学-简历.txt', mimeType: 'text/plain', buffer: Buffer.from('林同学\n邮箱 lin@example.com\n教育经历\n某大学计算机本科\n项目经历\n用 React 制作课程项目\n技能\nReact JavaScript') });
  await page.locator('.attachment-status.parsed').waitFor();
  await page.getByRole('button', { name: '打开简历预览', exact: true }).click();
  await page.locator('.evidence-panel').waitFor();
  await page.locator('.evidence-panel').getByRole('button', { name: '关闭证据面板', exact: true }).click();
  await page.getByRole('button', { name: '暗色', exact: true }).click();
  await capture('desktop-dark-chat');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('模型设置', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.getByRole('button', { name: '新会话', exact: true }).click();
  await page.getByRole('heading', { name: '下一步，我们一起准备。' }).waitFor();
  assert.equal(await page.locator('.aui-message').count(), 0);
  assert.equal(await input.inputValue(), '');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-dark-empty');
  await page.getByRole('button', { name: '打开项目目录', exact: true }).click();
  await page.locator('.conversation-row').last().locator('button').first().click();
  await page.locator('.attachment-status.parsed').waitFor();
  await capture('mobile-dark-chat');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots, checks: ['landing', 'empty-state', 'suggestions', 'send-once', 'copy', 'cancel', 'upload', 'preview', 'settings', 'switch-conversation', 'mobile-no-overflow'], pageErrors: errors }));
} catch (error) {
  await page.screenshot({ path: path.join(screenshots, 'failure.png') });
  console.error(JSON.stringify({ error: error.message, pageErrors: errors }));
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  db.close();
  await rm(directory, { recursive: true, force: true });
}
