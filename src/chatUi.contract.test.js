import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeMarkdown } from "./components/SafeMarkdown.js";
import './chatSpacing.test.js';

const main = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const api = readFileSync(new URL("./api.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(html, /P22\+Mackinac\+W01\+Book/);
assert.match(html, /Inter:wght@300;400;500;600/);
assert.match(html, /Resume Protocol/);

assert.match(main, /LANDING_VIDEO_URL/);
assert.match(main, /hf_20260715_112512_f3b7a972-83dd-4401-9c4b-f08d3733f5ca\.mp4/);
assert.match(main, /loop=\{false\}/);
assert.match(main, /onEnded=\{\(event\) => event\.currentTarget\.pause\(\)\}/);
assert.match(main, /Get Started/);
assert.match(main, /Resume Protocol/);
assert.match(main, /window\.location\.hash === "#workspace"/);
assert.match(main, /window\.location\.hash = "workspace"/);
assert.match(main, /window\.history\.replaceState/);
assert.doesNotMatch(main, /Studio|Journal|Reach Us/);

assert.match(main, /workspace-shell/);
assert.match(main, /project-sidebar/);
assert.match(main, /workspace-chat/);
assert.match(main, /evidence-panel/);
assert.match(main, /WorkspaceChat/);
assert.match(main, /theme-toggle/);
assert.match(main, /localStorage\.setItem\(THEME_STORAGE_KEY/);
assert.match(main, /\/api\/projects/);
assert.match(main, /projectId/);
assert.match(main, /\/api\/model-settings/);
assert.match(main, /\/api\/conversations\/\$\{encodeURIComponent\((conversationId|conversation\.id)\)\}\/documents/);
assert.match(main, /annotated\.pdf\?inline=1/);
assert.match(main, /annotated-download/);
assert.match(main, /\/api\/documents\/\$\{encodeURIComponent\(activeDocument\.id\)\}\?inline=1/);
assert.match(main, /resume\.pdf/);
assert.match(main, /resume\.docx/);
assert.match(main, /variant\?\.name \? <ResumeDownloads/);
assert.match(main, /分析这份简历/);
assert.match(main, /生成优化稿/);
assert.match(main, /基础检查/);
assert.match(main, /AI 批注/);
assert.match(main, /annotations/);
assert.match(main, /亮色|暗色/);
assert.match(readFileSync(new URL('./components/WorkspaceChat.jsx', import.meta.url), 'utf8'), /下一步，我们一起准备/);
assert.match(main, /AttachmentStatus/);
assert.match(main, /未读取前不会生成完整度或能力结论/);
assert.match(main, /documents\.find\(\(document\) => document\.id === documentId\)\?\.parseStatus/);
assert.match(main, /attachmentStatusBadge/);
assert.match(main, /unreadable/);
assert.match(main, /使用系统提供的模型，无需配置/);
assert.match(main, /ProjectEditor/);
assert.doesNotMatch(main, /window\.prompt/);
assert.doesNotMatch(main, /中间只保留对话/);

assert.doesNotMatch(main, /MiniMax/i);
assert.doesNotMatch(main, /video-backdrop|hero-empty|AI 已配置/);
assert.doesNotMatch(main, /from "\.\/chatStore\.js"/);
assert.doesNotMatch(main, /runAgent|dangerouslySetInnerHTML/);
assert.doesNotMatch(main, /\/api\/intake|\/api\/jobs|\/api\/resume/);
assert.match(api, /credentials: "include"/);
assert.match(api, /timeoutMs = (180_000|310_000)/);

assert.match(styles, /#fff/);
assert.match(styles, /font-family: "P22 Mackinac W01 Book"/);
assert.match(styles, /font-family: "Inter"/);
assert.match(styles, /"Microsoft YaHei", "PingFang SC", sans-serif/);
assert.match(styles, /--panel-bg: #f7f7f8/);
assert.match(styles, /--panel-bg: #000/);
assert.match(styles, /\.empty-workspace h2 \{[^}]*font-size: 26px/s);
assert.match(styles, /object-fit: contain/);
assert.match(styles, /translateY\(-50%\)/);
assert.match(styles, /workspace-shell/);
assert.match(styles, /grid-template-columns: 260px minmax\(0, 1fr\) 360px/);
assert.match(styles, /mobile-drawer/);
assert.match(styles, /\.mobile-drawer,\r?\n\.mobile-bar \{\r?\n  display: none;\r?\n\}/);
assert.match(styles, /prefers-color-scheme/);
assert.match(styles, /\.attachment-status/);
assert.match(styles, /\.attachment-status\.unreadable/);
assert.match(styles, /\.diagnosis-summary/);
assert.match(styles, /\.diagnosis-state/);
assert.doesNotMatch(styles, /#2B3534|video-fade|bokeh|gradient-orb/);

{
  const rendered = renderToStaticMarkup(React.createElement(SafeMarkdown, {
    text: "## 结论\n### 项目\n1. **先修复** API\n- 打开 https://example.com\n\n```js\nconst ok = true;\n```"
  }));
  assert.match(rendered, /<h2>结论<\/h2>/);
  assert.match(rendered, /<h3>项目<\/h3>/);
  assert.match(rendered, /<ol>/);
  assert.match(rendered, /<ul>/);
  assert.match(rendered, /<strong>先修复<\/strong>/);
  assert.match(rendered, /rel="noopener noreferrer"/);
  assert.match(rendered, /<pre><code>const ok = true;<\/code><\/pre>/);
  assert.doesNotMatch(rendered, /\*\*先修复\*\*/);
}


const resultCards = readFileSync(new URL("./components/ChatResultCards.jsx", import.meta.url), "utf8");
assert.match(resultCards, /未形成结论/);
assert.match(resultCards, /文件已保存，等待可靠读取/);
assert.match(resultCards, /data\.materialStatus \|\| data\.parseStatus/);
assert.match(resultCards, /文件已保存，未读取到可用文本/);
assert.match(resultCards, /还不能诊断简历内容/);
assert.match(resultCards, /hasKnownCompleteness \? <strong>/);
assert.doesNotMatch(resultCards, /context\?\.uploadStatus/);
assert.doesNotMatch(resultCards, /data\.completeness \|\| 0/);
assert.match(resultCards, /eligibility\?\.status !== "rejected"/);
assert.match(resultCards, /不符硬性条件的岗位不作为推荐/);
assert.match(resultCards, /fitScore \|\| job\.opportunityScore \|\| job\.matchScore/);
assert.match(resultCards, /硬性条件匹配/);
assert.match(resultCards, /需要核验资格/);
assert.match(resultCards, /data\.uncertainties/);
assert.match(resultCards, /data\.rejected/);
assert.match(resultCards, /没有发现硬性条件明确匹配的岗位/);
assert.match(resultCards, /<details className="job-note">/);
assert.match(resultCards, /查看原文/);
assert.match(resultCards, /不符条件/);
assert.match(resultCards, /<small>参考<\/small>/);
assert.match(resultCards, /rel="noopener noreferrer"/);

console.log("chat UI contract tests passed");
