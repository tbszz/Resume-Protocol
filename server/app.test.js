import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderResume } from "./resumeExport.js";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const directory = mkdtempSync(path.join(tmpdir(), "resume-api-"));
const database = createDatabase({ filename: path.join(directory, "app.sqlite") });
let visionCalls = 0;
const recognizedText = "张三\n教育经历\n测试大学市场营销本科\n工作经历\n门店服务与客户接待\n技能\n客户沟通";
const model = async ({ system, messages }) => {
  if (messages?.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'image'))) {
    visionCalls++;
    return {content:[{type:'text',text:JSON.stringify({text:recognizedText})}]};
  }
  if (system.includes('求职建议事实审校员')) return {content:[{type:'text',text:JSON.stringify({answer:'已读取简历原文。',questions:[]})}]};
  return { content: [{ type: "text", text: system.includes('Brain 意图识别器') ? JSON.stringify({intents:['answer'],subject:'current',objective:'回答问题',facts:[],questions:[],readDocument:messages?.[0]?.content?.includes('重新读取已上传PDF')}) : "我会根据你的真实项目帮助你准备面试。" }] };
};
const app = createApp({ database, model, dataDir: directory });
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const request = (url, cookie, options = {}) => fetch(base + url, { ...options, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
try {
  assert.equal((await request("/api/conversations")).status, 401);
  const previousEnv = {
    runtime: process.env.RESUME_PROTOCOL_AGENT_RUNTIME,
    anthropic: process.env.ANTHROPIC_API_KEY,
    minimax: process.env.MINIMAX_API_KEY
  };
  process.env.RESUME_PROTOCOL_AGENT_RUNTIME = "claude";
  process.env.ANTHROPIC_API_KEY = "health-test-key";
  delete process.env.MINIMAX_API_KEY;
  const health = await (await request("/api/health")).json();
  assert.equal(health.ai.configured, true);
  assert.equal(health.ai.runtime, "claude-agent-sdk");
  assert.equal(JSON.stringify(health).includes("health-test-key"), false);
  for (const [name, value] of Object.entries(previousEnv)) {
    const key = { runtime: "RESUME_PROTOCOL_AGENT_RUNTIME", anthropic: "ANTHROPIC_API_KEY", minimax: "MINIMAX_API_KEY" }[name];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const register = async email => {
    const response = await request("/api/auth/register", null, {method:"POST", body:JSON.stringify({email,name:"测试用户",password:"A-secure-passphrase-42"})});
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const one = await register("one@example.com");
  const two = await register("two@example.com");
  const project = (await (await request('/api/projects',one,{method:'POST',body:'{"name":"校招"}'})).json()).project;
  assert.ok(project.id);
  assert.equal((await request(`/api/projects/${project.id}`,two,{method:'PATCH',body:'{"name":"其他"}'})).status,404);
  assert.equal((await request('/api/conversations',two,{method:'POST',body:JSON.stringify({projectId:project.id})})).status,404);
  const created = await (await request("/api/conversations", one, {method:"POST",body:"{}"})).json();
  const id = created.conversation.id;
  const emptyFirstConversation = await (await request("/api/conversations", one, {method:"POST",body:"{}"})).json();
  const emptyFirst = new FormData();
  emptyFirst.append("file", new Blob([""], {type:"text/plain"}), "first-empty.txt");
  const emptyFirstUpload = await fetch(`${base}/api/conversations/${emptyFirstConversation.conversation.id}/documents`, {method:"POST",headers:{Cookie:one},body:emptyFirst});
  assert.equal(emptyFirstUpload.status, 200);
  const emptyFirstResult = await emptyFirstUpload.json();
  assert.equal(emptyFirstResult.document.parseStatus.status, "unreadable");
  assert.equal(emptyFirstResult.document.parseStatus.preservedExistingMaterial, false);
  assert.doesNotMatch(emptyFirstResult.conversation.messages.at(-1).content, /旧的有效简历资料|保留旧/);
  const moved = await (await request(`/api/conversations/${id}`,one,{method:'PATCH',body:JSON.stringify({projectId:project.id})})).json();
  assert.equal(moved.conversation.projectId,project.id);
  await request(`/api/projects/${project.id}`,one,{method:'DELETE'});
  assert.equal((await (await request(`/api/conversations/${id}`,one)).json()).conversation.projectId,null);
  assert.equal((await request(`/api/conversations/${id}/resume.pdf`,one)).status,409);
  assert.equal((await request(`/api/conversations/${id}/resume.pdf`,two)).status,404);
  assert.equal((await request(`/api/conversations/${id}`, two)).status, 404);
  assert.equal((await request(`/api/conversations/${id}`, two, {method:"DELETE"})).status, 404);
  assert.equal((await request(`/api/conversations/${id}/context`, two, {method:"PATCH",body:'{"selectedJob":{"id":"x"}}'})).status, 404);
  const badOrigin = await request("/api/conversations", one, {method:"POST",headers:{Origin:"https://attacker.example"},body:"{}"});
  assert.equal(badOrigin.status, 403);
  const reply = await request(`/api/conversations/${id}/messages`, one, {method:"POST",body:JSON.stringify({content:"你好，请帮我规划求职"})});
  const stream = await reply.text();
  assert.match(stream, /event: done/);
  assert.match(stream, /真实项目/);
  const recovered = await (await request(`/api/conversations/${id}`, one)).json();
  assert.equal(recovered.conversation.messages.filter(m => m.role === "user").length, 1);
  assert.match(recovered.conversation.messages.at(-1).content, /真实项目/);
  const upload = new FormData();
  upload.append("file", new Blob(["张三\n教育经历\n某大学计算机本科\n项目经历\n使用React完成系统\n技能栈\nReact TypeScript"], {type:"text/plain"}), "resume.txt");
  const uploaded = await fetch(`${base}/api/conversations/${id}/documents`, {method:"POST",headers:{Cookie:one},body:upload});
  assert.equal(uploaded.status, 200);
  const { document, conversation: uploadedConversation } = await uploaded.json();
  assert.equal(document.parseStatus?.status, "parsed");
  assert.equal(uploadedConversation.context.uploadStatus.status, "parsed");
  assert.equal(uploadedConversation.messages.some(message => message.role === "assistant" && message.kind === "diagnosis"), false);
  assert.match(uploadedConversation.messages.at(-1).content, /文件已保存/);
  const oldMaterial = uploadedConversation.context.material;
  const oldProfile = uploadedConversation.context.profile;
  const oldDiagnosis = uploadedConversation.context.diagnosis;
  const emptyUpload = new FormData();
  emptyUpload.append("file", new Blob(["   \n  "], {type:"text/plain"}), "empty.txt");
  const unreadableTxt = await fetch(`${base}/api/conversations/${id}/documents`, {method:"POST",headers:{Cookie:one},body:emptyUpload});
  assert.equal(unreadableTxt.status, 200);
  const emptyResult = await unreadableTxt.json();
  assert.equal(emptyResult.document.parseStatus.status, "unreadable");
  assert.equal(emptyResult.document.parseStatus.preservedExistingMaterial, true);
  assert.match(emptyResult.document.parseStatus.message, /没有读取到可用文本/);
  assert.match(emptyResult.conversation.messages.at(-1).content, /保留旧的有效简历资料/);
  assert.equal(emptyResult.conversation.context.material, oldMaterial);
  assert.deepEqual(emptyResult.conversation.context.profile, oldProfile);
  assert.deepEqual(emptyResult.conversation.context.diagnosis, oldDiagnosis);
  assert.equal(emptyResult.conversation.messages.some(message => message.role === "assistant" && message.kind === "diagnosis"), false);
  const damagedPdf = new FormData();
  damagedPdf.append("file", new Blob(["%PDF-1.4\nbroken"], {type:"application/pdf"}), "broken.pdf");
  const unreadablePdf = await fetch(`${base}/api/conversations/${id}/documents`, {method:"POST",headers:{Cookie:one},body:damagedPdf});
  assert.equal(unreadablePdf.status, 200);
  const pdfResult = await unreadablePdf.json();
  assert.equal(pdfResult.document.parseStatus.status, "unreadable");
  assert.equal(pdfResult.conversation.context.material, oldMaterial);
  const scanConversation = (await (await request('/api/conversations',one,{method:'POST',body:'{}'})).json()).conversation;
  const imagePdf = await renderResume({name:'x',education:[],skills:[],projects:[],experience:[],awards:[],contact:{}}, 'pdf');
  const scanUpload = new FormData(); scanUpload.append('file',new Blob([imagePdf],{type:'application/pdf'}),'scan.pdf');
  const scanResult = await (await fetch(`${base}/api/conversations/${scanConversation.id}/documents`,{method:'POST',headers:{Cookie:one},body:scanUpload})).json();
  assert.ok(visionCalls > 0, 'sparse PDF must reach image recognition');
  assert.equal(scanResult.document.parseStatus.extraction.status,'complete');
  assert.match(scanResult.conversation.context.material,/客户接待/);
  assert.doesNotMatch(scanResult.conversation.messages.at(-1).content,/粘贴|自行|先 OCR/);
  // Simulate a previously saved file with the old, page-number-only extraction.
  const owner = database.raw.prepare('select user_id from documents where id=?').get(scanResult.document.id).user_id;
  const savedDoc = database.listDocuments(owner).find(d=>d.id===scanResult.document.id);
  database.saveDocument(owner,{...savedDoc,text:'-- 1 of 1 --',parseStatus:{status:'needs_review'}});
  const savedConversation = database.getConversation(owner,scanConversation.id);
  savedConversation.context.material='-- 1 of 1 --'; savedConversation.context.uploadStatus={status:'needs_review'};
  database.saveConversation(owner,savedConversation);
  const beforeReread=visionCalls;
  const reread = await request(`/api/conversations/${scanConversation.id}/messages`,one,{method:'POST',body:JSON.stringify({content:'重新读取已上传PDF'})});
  assert.match(await reread.text(),/event: done/);
  assert.equal(visionCalls,beforeReread+1);
  assert.match(database.getConversation(owner,scanConversation.id).context.material,/客户接待/);
  const recoveredDoc = database.listDocuments(owner).find(d=>d.id===scanResult.document.id);
  database.saveDocument(owner,{...recoveredDoc,parseStatus:{status:'needs_review'}});
  writeFileSync(path.join(directory,'uploads',owner,recoveredDoc.id),'%PDF-1.4\nbroken');
  const failedReread = await request(`/api/conversations/${scanConversation.id}/messages`,one,{method:'POST',body:JSON.stringify({content:'重新读取已上传PDF'})});
  assert.match(await failedReread.text(),/event: done/);
  assert.equal(database.listDocuments(owner).find(d=>d.id===recoveredDoc.id).text,recoveredDoc.text);
  assert.match(database.getConversation(owner,scanConversation.id).context.material,/客户接待/);
  assert.equal(database.getConversation(owner,scanConversation.id).context.uploadStatus.status,'unreadable');

  const unsupported = new FormData();
  unsupported.append("file", new Blob(["hello"], {type:"text/rtf"}), "resume.rtf");
  assert.equal((await fetch(`${base}/api/conversations/${id}/documents`, {method:"POST",headers:{Cookie:one},body:unsupported})).status, 400);
  const docs = await (await request(`/api/conversations/${id}/documents`, one)).json();
  assert.equal(docs.documents.filter(item => item.parseStatus?.status === "unreadable").length, 2);
  assert.equal((await request(`/api/documents/${document.id}`, two)).status, 404);
  assert.match(await (await request(`/api/documents/${document.id}`, one)).text(), /教育经历/);
  const exported = await request(`/api/conversations/${id}/export?format=json`, one);
  assert.equal(exported.status, 200);
  assert.ok(exported.headers.get("content-disposition").includes("attachment"));
  await request(`/api/conversations/${id}`, one, {method:"DELETE"});
  assert.equal((await request(`/api/conversations/${id}`, one)).status, 404);
  assert.equal((await request(`/api/documents/${document.id}`, one)).status, 404);
  assert.equal((await request("/api/boss/apply", null, {method:"POST",body:"{}"})).status, 401);
  console.log("app integration tests passed: auth, ownership, SSE, uploads, export, deletion");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  database.close();
  rmSync(directory, {recursive:true,force:true});
}
