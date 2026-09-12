import path from "node:path";
import { readableDocumentName } from '../src/documentName.js';
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import express from "express";
import multer from "multer";
import { extractPdfText } from "./documentExtraction.js";
import { createDocumentModel } from "./documentModel.js";
import mammoth from "mammoth";
import { createDatabase } from "./database.js";
import { createAuthRouter, requireUser } from "./auth.js";
import { createConversation } from "../src/chatStore.js";
import { parseResumeText } from "./resumeEngine.js";
import { analyzeCompleteness, TEMPLATE_LIBRARY } from "./knowledgeBase.js";
import { createDefaultModel } from "./modelClient.js";
import { runCareerAgent, newMessage } from "./careerAgent.js";
import { renderResume, annotatePdf } from './resumeExport.js';
import { createModelSettingsRouter, createUserModel } from './modelSettings.js';
import { createJobKnowledge } from './jobKnowledge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } });

export function createApp({ database = createDatabase(), model, search, dataDir = process.env.RESUME_PROTOCOL_DATA_DIR || path.join(root, "data") } = {}) {
  const app = express();
  const active = new Map();
  const origins = new Set(["http://127.0.0.1:5173", "http://localhost:5173", ...["127.0.0.1", "localhost"].map(host => `http://${host}:${process.env.RESUME_PROTOCOL_PORT || 8787}`), process.env.RESUME_PROTOCOL_ORIGIN].filter(Boolean));
  app.disable("x-powered-by");
  app.locals.database = database;
  const jobKnowledge = createJobKnowledge(database.raw);
  app.locals.jobKnowledge = jobKnowledge;
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    const origin = req.get("origin");
    if ((origin && !origins.has(origin)) || req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ ok: false, error: "请求来源不受信任。请从应用页面访问。" });
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    const ai = defaultModelStatus();
    res.json({ ok: true, ai: { configured: ai.configured, runtime: ai.runtime, model: "默认模型" }, storage: "sqlite" });
  });
  app.use("/api/auth", createAuthRouter(database));
  app.use("/api", requireUser(database));
  app.use('/api/model-settings', createModelSettingsRouter(database, { dataDir }));
  app.get("/api/templates", (_req, res) => res.json({ templates: TEMPLATE_LIBRARY }));
  app.get("/api/conversations", (req, res) => res.json({ conversations: database.listConversations(req.user.id) }));
  const ownsProject = (userId, id) => !id || database.listProjects(userId).some(p => p.id === id);
  app.get('/api/projects', (req, res) => res.json({ projects: database.listProjects(req.user.id) }));
  app.post('/api/projects', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({error: '请输入1至100字的项目名称。'});
    res.json({project: database.saveProject(req.user.id, {name})});
  });
  app.patch('/api/projects/:id', (req, res) => {
    if (!ownsProject(req.user.id, req.params.id)) return res.status(404).json({error: '项目不存在。'});
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({error: '请输入1至100字的项目名称。'});
    res.json({project: database.saveProject(req.user.id, {id: req.params.id, name})});
  });
  app.delete('/api/projects/:id', (req, res) => {
    if (!ownsProject(req.user.id, req.params.id)) return res.status(404).json({error: '项目不存在。'});
    const conversations = database.listConversations(req.user.id).filter(c => c.projectId === req.params.id);
    if (conversations.some(c => active.has(c.id))) return res.status(409).json({error:'项目中有对话正在处理中。'});
    for (const c of conversations) database.saveConversation(req.user.id, {...c, projectId:null});
    database.deleteProject(req.user.id, req.params.id);
    res.json({ok:true});
  });
  app.post("/api/conversations", (req, res) => {
    if (!ownsProject(req.user.id, req.body?.projectId)) return res.status(404).json({error:'项目不存在。'});
    res.json({ conversation: database.saveConversation(req.user.id, {...createConversation({ id: randomUUID() }), projectId: req.body?.projectId || null}) });
  });
  app.post("/api/conversations/import", (req, res) => {
    const incoming = req.body?.conversations;
    if (!Array.isArray(incoming) || incoming.length > 100) return res.status(400).json({ error: "一次最多导入100个对话。" });
    let count = 0;
    for (const item of incoming) {
      if (!item?.id || !Array.isArray(item.messages)) continue;
      const id = createHash("sha256").update(req.user.id + ":" + String(item.id)).digest("hex");
      if (database.getConversation(req.user.id, id)) continue;
      const conversation = createConversation({ id });
      conversation.title = String(item.title || "导入的对话").slice(0, 100);
      conversation.messages = item.messages.filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-500).map(m => newMessage(m.role, m.content.slice(0, 50000)));
      if (typeof item.context?.material === "string") {
        const material = item.context.material.slice(0, 60000);
        conversation.context = { ...conversation.context, material, profile: parseResumeText(material).profile };
      }
      database.saveConversation(req.user.id, conversation);
      count++;
    }
    res.json({ ok: true, count, conversations: database.listConversations(req.user.id) });
  });
  const ownedConversation = (req, res, next) => {
    const conversation = database.getConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: "对话不存在。" });
    req.conversation = conversation;
    next();
  };
  const idleConversation = (req, res, next) => {
    if (active.has(req.params.id)) return res.status(409).json({ error: "这个对话正在处理请求，请完成后再操作。" });
    next();
  };
  app.get("/api/conversations/:id", ownedConversation, (req, res) => res.json({ conversation: req.conversation }));
  app.patch('/api/conversations/:id', ownedConversation, idleConversation, (req, res) => {
    if ('projectId' in (req.body || {})) {
      if (!ownsProject(req.user.id, req.body.projectId)) return res.status(404).json({error:'项目不存在。'});
      req.conversation.projectId = req.body.projectId || null;
    }
    if (typeof req.body?.title === 'string' && req.body.title.trim()) req.conversation.title = req.body.title.trim().slice(0,100);
    res.json({conversation:database.saveConversation(req.user.id, req.conversation)});
  });
  app.get('/api/conversations/:id/documents', ownedConversation, (req, res) => {
    res.json({documents:database.listDocuments(req.user.id).filter(d => d.conversationId === req.params.id).map(({id,name,mimeType,parseStatus}) => ({id,name,mimeType,parseStatus}))});
  });
  app.delete("/api/conversations/:id", ownedConversation, idleConversation, async (req, res) => {
    active.set(req.params.id, { userId: req.user.id });
    try {
    for (const document of database.listDocuments(req.user.id).filter(d => d.conversationId === req.params.id)) {
      await unlink(path.join(dataDir, "uploads", req.user.id, document.id)).catch(error => { if (error.code !== "ENOENT") throw error; });
      database.deleteDocument(req.user.id, document.id);
    }
    database.deleteConversation(req.user.id, req.params.id);
    res.json({ ok: true });
    } finally { active.delete(req.params.id); }
  });
  app.patch("/api/conversations/:id/context", ownedConversation, idleConversation, (req, res) => {
    const job = req.conversation.context.jobs?.find(j => j.id === req.body?.selectedJob?.id);
    if (!job) return res.status(400).json({ error: "请从当前对话的岗位结果中选择目标，或在聊天中粘贴 JD。" });
    Object.assign(req.conversation.context, { selectedJob: job, variant: null, formalResume: null });
    req.conversation.messages.push(newMessage("assistant", `已选择「${job.company} · ${job.title}」。`, { kind: "target", data: { job } }));
    req.conversation.updatedAt = new Date().toISOString();
    res.json({ conversation: database.saveConversation(req.user.id, req.conversation) });
  });
  app.post("/api/conversations/:id/messages", ownedConversation, idleConversation, async (req, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content || content.length > 60000) return res.status(400).json({ error: "消息不能为空，且不能超过60000字符。" });
    if (active.size >= 8 || [...active.values()].some(item => item.userId === req.user.id)) return res.status(429).json({ error: "已有任务正在进行，请等待完成后再发送。" });
    const controller = new AbortController();
    active.set(req.params.id, { controller, userId: req.user.id });
    const conversation = req.conversation;
    const persist = () => database.saveConversation(req.user.id, conversation);
    conversation.messages.push(newMessage("user", content));
    if (conversation.title === "新对话") conversation.title = content.replace(/\s+/g, " ").slice(0, 24);
    conversation.updatedAt = new Date().toISOString();
    persist();
    res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    const emit = (event, data) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": heartbeat\n\n"); }, 12000);
    const deadline = setTimeout(() => controller.abort(new Error("本轮处理超时，请重试。")), 300000);
    res.on("close", () => controller.abort());
    try {
      await runCareerAgent({ conversation, emit, persist, signal: controller.signal, model: model || createUserModel(database, req.user.id, { dataDir }), search: search || jobKnowledge.search,
        readDocument: async ({conversation, signal}) => {
          const context = conversation.context;
          const documentId = context.documentIds?.at(-1);
          const document = database.listDocuments(req.user.id).find(d => d.id === documentId && d.conversationId === conversation.id);
          if (!document || document.mimeType !== 'application/pdf' || document.parseStatus?.extraction?.status === 'complete') return;
          // Do not overwrite text supplied after the upload with a reread of an older file.
          if (context.material && context.material !== document.text && context.uploadStatus?.status !== 'unreadable') return;
          const buffer = await readFile(path.join(dataDir, 'uploads', req.user.id, document.id));
          const extraction = await extractPdfText(buffer, {model: args => (model || createDocumentModel(database, req.user.id, {dataDir}))(args), signal});
          signal?.throwIfAborted();
          if (extraction.text?.length > 60000) return;
          const text = extraction.text || '';
          const parsed = text.trim() ? parseResumeText(text) : null;
          const diagnosis = parsed ? analyzeCompleteness(parsed.profile, {role:context.selectedJob?.role,job:context.selectedJob}) : null;
          const parseStatus = parsed ? buildUploadParseStatus(parsed.profile, diagnosis, text) : buildUnreadableParseStatus(extraction, Boolean(context.material));
          parseStatus.extraction = {method:extraction.method,status:extraction.status,pages:extraction.pages,totalPages:extraction.totalPages,failedPages:extraction.failedPages,error:extraction.error};
          if (parsed && extraction.status === 'partial') { parseStatus.status = 'needs_review'; parseStatus.message = '部分页面未能识别，只能依据已读取原文回答。'; }
          database.saveDocument(req.user.id, {...document,text:parsed ? text : document.text,parseStatus});
          if (parsed) Object.assign(context, {material:text,profile:parsed.profile,diagnosis,annotations:[],jobs:[],jobEligibility:null,jobUncertainties:[],variant:null,formalResume:null});
          context.uploadStatus = parseStatus;
          persist();
        }
      });
      emit("done", { conversation });
    } catch (error) {
      const message = controller.signal.aborted ? "请求已中断或超时，已完成的内容仍保留，可以继续重试。" : error.message;
      conversation.messages.push(newMessage("assistant", message, { kind: "error" }));
      persist();
      emit("error", { error: message, conversation });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      active.delete(req.params.id);
      res.end();
    }
  });
  app.post("/api/conversations/:id/documents", ownedConversation, idleConversation, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "没有收到文件。" });
    if (active.has(req.params.id)) return res.status(409).json({ error: "对话正在处理中。" });
    if (active.size >= 8 || [...active.values()].some(item => item.userId === req.user.id)) return res.status(429).json({ error: "已有任务正在进行，请等待完成后再上传。" });
    // Reload after async multipart parsing to avoid overwriting a turn that completed during upload.
    req.conversation = database.getConversation(req.user.id, req.params.id);
    if (!req.conversation) return res.status(404).json({ error: "对话已删除。" });
    active.set(req.params.id, { userId: req.user.id });
    try {
      const extraction = await extractFileText(req.file, { model: args => (model || createDocumentModel(database, req.user.id, { dataDir }))(args) });
      if (!extraction.supported) return res.status(400).json({ error: extraction.error });
      const text = extraction.text || "";
      if (text.length > 60000) return res.status(400).json({ error: "文件文本超过60000字符，请拆分为较短材料。" });
      const context = req.conversation.context;
      const hasReadableText = Boolean(text.trim());
      const parsed = hasReadableText ? parseResumeText(text) : null;
      const diagnosis = parsed ? analyzeCompleteness(parsed.profile, { role: context.selectedJob?.role, job: context.selectedJob }) : null;
      const parseStatus = parsed ? buildUploadParseStatus(parsed.profile, diagnosis, text) : buildUnreadableParseStatus(extraction, Boolean(context.material));
      parseStatus.extraction = { method: extraction.method || "text", status: extraction.status || (parsed ? "complete" : "unreadable"), pages: extraction.pages, totalPages: extraction.totalPages, failedPages: extraction.failedPages, error: extraction.error || undefined };
      if (parsed && extraction.status === "partial") {
        parseStatus.status = "needs_review";
        parseStatus.message = "已读取部分原文，但部分页面未能识别；后续只能依据已读取内容，不能断言未识别页面缺少信息。";
      }
      const document = { id: randomUUID(), conversationId: req.params.id, name: readableDocumentName(req.file.originalname), mimeType: path.extname(req.file.originalname).toLowerCase() === '.pdf' ? 'application/pdf' : req.file.mimetype, text, parseStatus };
      const folder = path.join(dataDir, "uploads", req.user.id);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, document.id), req.file.buffer);
      database.saveDocument(req.user.id, document);
      if (parsed) Object.assign(context, { material: text, profile: parsed.profile, diagnosis, annotations: [], jobs: [], jobEligibility: null, jobUncertainties: [], variant: null, formalResume: null });
      Object.assign(context, { uploadStatus: parseStatus, documentIds: [...(context.documentIds || []), document.id] });
      req.conversation.messages.push(newMessage("user", `上传了简历文件：${document.name}`, { kind: "attachment", data: { filename: document.name, documentId: document.id, parseStatus } }));
      req.conversation.messages.push(newMessage("assistant", uploadSavedMessage(parseStatus)));
      if (req.conversation.title === "新对话") req.conversation.title = document.name.slice(0, 24);
      req.conversation.updatedAt = new Date().toISOString();
      res.json({ document: { id: document.id, name: document.name, parseStatus }, conversation: database.saveConversation(req.user.id, req.conversation) });
    } finally { active.delete(req.params.id); }
  });
  app.get("/api/documents/:id", (req, res) => {
    const document = database.listDocuments(req.user.id).find(d => d.id === req.params.id);
    if (!document) return res.status(404).json({ error: "文件不存在。" });
    const filename = path.resolve(dataDir, "uploads", req.user.id, document.id);
    if (req.query.inline === '1' && document.mimeType === 'application/pdf') {
      res.type('application/pdf').set('Content-Disposition', 'inline').sendFile(filename);
    } else res.download(filename, readableDocumentName(document.name));
  });
  const annotating = new Set();
  app.get('/api/documents/:id/annotated.pdf', async (req, res) => {
    const document = database.listDocuments(req.user.id).find(d => d.id === req.params.id);
    if (!document) return res.status(404).json({error:'文件不存在。'});
    if (document.mimeType !== 'application/pdf') return res.status(400).json({error:'只有PDF原文支持批注预览。'});
    const conversation = database.getConversation(req.user.id, document.conversationId);
    const annotations = conversation?.context.annotations || [];
    if (annotating.has(req.user.id) || annotating.size >= 4) return res.status(429).json({error:'批注正在生成，请稍候。'});
    annotating.add(req.user.id);
    try {
      const bytes = await annotatePdf(path.resolve(dataDir, 'uploads', req.user.id, document.id), annotations);
      res.type('application/pdf').set('Content-Disposition', req.query.inline === '1' ? 'inline' : 'attachment; filename="resume-annotated.pdf"').send(bytes);
    } finally {annotating.delete(req.user.id);}
  });
  app.get("/api/conversations/:id/export", ownedConversation, (req, res) => {
    const format = req.query.format || "markdown";
    if (!["markdown", "json"].includes(format)) return res.status(400).json({ error: "支持 Markdown 或 JSON 导出。" });
    const output = format === "json" ? JSON.stringify(req.conversation, null, 2) : exportMarkdown(req.conversation);
    res.set("Content-Disposition", `attachment; filename="resume-protocol.${format === "json" ? "json" : "md"}"`);
    res.type(format === "json" ? "application/json" : "text/markdown").send(output);
  });
  const exporting = new Set();
  app.get('/api/conversations/:id/resume.:format', ownedConversation, async (req, res) => {
    const format = req.params.format;
    if (!['pdf','docx'].includes(format)) return res.status(400).json({error:'支持PDF和DOCX格式。'});
    const resume = req.conversation.context.formalResume || req.conversation.context.variant;
    if (!resume) return res.status(409).json({error:'请先在对话中生成优化简历。'});
    if (exporting.has(req.user.id) || exporting.size >= 4) return res.status(429).json({error:'简历正在导出，请稍候。'});
    exporting.add(req.user.id);
    try {
      const bytes = await renderResume(resume, format);
      res.type(format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.set('Content-Disposition', `attachment; filename="resume.${format}"; filename*=UTF-8''${encodeURIComponent((resume.name || '优化简历') + '-简历.' + format)}`).send(bytes);
    } finally {exporting.delete(req.user.id);}
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
  app.use(express.static(path.join(root, "dist")));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : (error.status || 400);
    res.status(status).json({ ok: false, error: error.code === "LIMIT_FILE_SIZE" ? "文件不能超过8MB。" : error.message || "请求失败。" });
  });
  return app;
}

function defaultModelStatus() {
  const request = createDefaultModel();
  const runtime = request.runtime || "compatible";
  const configured = runtime === "claude-agent-sdk"
    ? Boolean(request.provider === 'minimax' ? process.env.MINIMAX_API_KEY : process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY);
  return { runtime, configured };
}

function buildUploadParseStatus(profile, diagnosis, text) {
  const evidence = {
    basic: Boolean(profile.name && profile.name !== "候选人") || Boolean(profile.contact.email || profile.contact.phone),
    education: profile.education.length > 0,
    experience: profile.experience.length > 0,
    projects: profile.projects.length > 0,
    skills: profile.skills.length > 0
  };
  const evidenceCount = Object.values(evidence).filter(Boolean).length;
  const status = evidenceCount >= 2 && profile.sourceConfidence >= 45 ? "parsed" : "needs_review";
  return {
    status,
    confidence: profile.sourceConfidence,
    completeness: diagnosis.completeness,
    readableTextLength: String(text || "").trim().length,
    evidence,
    message: status === "parsed"
      ? "文件已保存，并读取到可用于后续诊断的简历原文。"
      : "文件正文已读取；结构化结果需要核对，不能据此判断原文缺少信息。"
  };
}

function buildUnreadableParseStatus(extraction = {}, preservedExistingMaterial = false) {
  const reason = extraction.empty ? "没有读取到可用文本。" : "文件文本读取失败。";
  return {
    status: "unreadable", confidence: 0, completeness: null, readableTextLength: 0,
    preservedExistingMaterial,
    evidence: { basic: false, education: false, experience: false, projects: false, skills: false },
    message: `${reason}${extraction.error ? extraction.error + " " : ""}原文件已保存。${preservedExistingMaterial ? "已保留旧的有效简历资料。" : ""}当前不能根据这份文件下结论。`
  };
}

function uploadSavedMessage(parseStatus) {
  if (parseStatus.status === "unreadable") return "文件已保存到你的资料库。" + parseStatus.message;
  if (parseStatus.extraction?.status === "partial") return "文件已保存到你的资料库。" + parseStatus.message;
  return "文件已保存到你的资料库，并读取到原文。你可以继续让我检查内容、诊断简历或生成针对性简历。";
}

async function extractFileText(file, options = {}) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf") return extractPdfText(file.buffer, options);
  if (ext === ".docx") {
    try { return readableExtraction((await mammoth.extractRawText({ buffer: file.buffer })).value || ""); }
    catch { return unreadableExtraction("DOCX 文件可能损坏或加密，请检查原文件是否能正常打开。"); }
  }
  if ([".txt", ".md", ".json"].includes(ext)) return readableExtraction(file.buffer.toString("utf8"));
  return { supported: false, error: "仅支持 PDF、DOCX、TXT、Markdown 和 JSON。旧版DOC请另存为DOCX。" };
}

function readableExtraction(text) {
  return { supported: true, text, empty: !String(text || "").trim() };
}

function unreadableExtraction(error = "") {
  return { supported: true, text: "", error: String(error || ""), empty: false };
}

export function exportMarkdown(conversation) {
  const resume = conversation.context.formalResume || conversation.context.variant;
  if (!resume) return conversation.messages.map(m => `## ${m.role === "user" ? "你" : "Career Agent"}\n\n${m.content}`).join("\n\n");
  const sections = [["教育经历", resume.education], ["技能", resume.skills], ["项目经历", resume.projects], ["工作与实习经历", resume.experience], ["荣誉", resume.awards]];
  return [`# ${resume.name || "个人简历"}`, resume.targetTitle || resume.title || "", Object.values(resume.contact || {}).filter(Boolean).join(" · "), resume.summary || "", ...sections.filter(([,items]) => items?.length).map(([title, items]) => `## ${title}\n\n${items.map(item => "- " + item).join("\n")}`)].join("\n\n");
}
