import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  ROLE_PROFILES,
  TEMPLATES,
  createFormalResume,
  createDemoJobs,
  generateVariant,
  normalizeFormalResume,
  parseResumeText,
  scoreJob,
  scoreAllRoles
} from "./resumeEngine.js";
import {
  getMiniMaxStatus,
  synthesizeFormalResumeWithMiniMax
} from "./minimaxClient.js";
import {
  JOB_SOURCE_REGISTRY,
  TEMPLATE_LIBRARY,
  analyzeCompleteness,
  buildJobLibrary,
  importJobFromUrl,
  refreshOfficialSources
} from "./knowledgeBase.js";
import {
  CAMPUS_AGGREGATOR_SOURCE,
  refreshCampusAggregator
} from "./campusAggregator.js";
import {
  GITHUB_JOB_SOURCES,
  getGitHubJobSources,
  refreshGitHubJobSources
} from "./githubJobSources.js";
import {
  closeBossBrowser,
  getBossStatus,
  runBossApply,
  scrapeBossJobs,
  startBossBrowser
} from "./bossAdapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const app = express();
const port = Number(process.env.RESUME_PROTOCOL_PORT || 8787);
const allowedOrigins = new Set([
  "http://127.0.0.1:8787",
  "http://localhost:8787",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ ok: false, error: "Origin not allowed for local automation API." });
  }
  return next();
});
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  }
}));
app.use(express.json({ limit: "4mb" }));

let memory = {
  profile: null,
  formalResumes: [],
  variants: [],
  jobs: [],
  queue: [],
  events: []
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, roles: ROLE_PROFILES, templates: TEMPLATES, ai: getMiniMaxStatus(), boss: getBossStatus() });
});

app.get("/api/templates", (_req, res) => {
  res.json({ templates: TEMPLATE_LIBRARY });
});

app.post("/api/intake/analyze", (req, res) => {
  const text = [req.body?.text, ...(Object.values(req.body?.supplements || {}))].filter(Boolean).join("\n\n");
  const result = parseResumeText(text);
  const selectedJob = req.body?.job || null;
  const role = req.body?.role || selectedJob?.role || "";
  const completeness = analyzeCompleteness(result.profile, { role, job: selectedJob });
  memory.profile = result.profile;
  memory.events.unshift(event("intake_analyzed", `资料完整度 ${completeness.completeness}%，缺失 ${completeness.missing.length} 项`));
  res.json({ ...result, completeness, events: memory.events.slice(0, 30) });
});

app.get("/api/jobs/library", (req, res) => {
  const profile = memory.profile || parseResumeText("").profile;
  const jobs = buildJobLibrary({
    profile,
    query: req.query?.query || "",
    type: req.query?.type || "campus"
  });
  res.json({ jobs, sources: getGitHubJobSources() });
});

app.post("/api/profile/parse", (req, res) => {
  const result = parseResumeText(req.body?.text || "");
  memory.profile = result.profile;
  memory.events.unshift(event("profile_parsed", `结构化画像完成，完整度 ${result.diagnosis.completeness}`));
  res.json({ ...result, events: memory.events.slice(0, 30) });
});

app.post("/api/profile/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new Error("没有收到文件。");
    const text = await extractFileText(req.file);
    const result = parseResumeText(text);
    memory.profile = result.profile;
    memory.events.unshift(event("file_parsed", `已解析 ${req.file.originalname}`));
    res.json({ ...result, filename: req.file.originalname, events: memory.events.slice(0, 30) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/resume/generate", (req, res) => {
  const profile = req.body?.profile || memory.profile;
  if (!profile) throw new Error("请先解析个人材料。");
  const variant = generateVariant({
    profile,
    role: req.body?.role || "ai",
    template: req.body?.template || "ats",
    jd: req.body?.jd || ""
  });
  memory.variants.unshift({ id: `variant-${Date.now()}`, createdAt: new Date().toISOString(), ...variant });
  memory.events.unshift(event("variant_generated", `生成 ${variant.roleLabel} / ${variant.templateLabel}`));
  res.json({ variant: memory.variants[0], variants: memory.variants.slice(0, 12), events: memory.events.slice(0, 30) });
});

app.post("/api/resume/formalize", async (req, res, next) => {
  try {
    const rawText = [req.body?.text, req.body?.extraText].filter(Boolean).join("\n\n");
    const parsed = rawText ? parseResumeText(rawText) : null;
    const profile = req.body?.profile || parsed?.profile || memory.profile;
    if (!profile) throw new Error("请先输入或上传个人材料。");
    const role = req.body?.role || "ai";
    const template = req.body?.template || "aiResearch";
    const selectedJob = req.body?.job || null;
    const jd = [req.body?.jd, selectedJob?.description, ...(selectedJob?.requirements || [])].filter(Boolean).join("\n");
    const localResume = createFormalResume({ profile, role, template, jd });
    let aiResult;
    try {
      aiResult = await synthesizeFormalResumeWithMiniMax({ profile, localResume, role, template, jd, rawText });
    } catch (error) {
      aiResult = {
        resume: normalizeFormalResume({ ...localResume, source: "local", model: "local-rule-engine" }, localResume),
        usedAI: false,
        reason: error.message
      };
    }
    const formalResume = {
      id: `formal-${Date.now()}`,
      createdAt: new Date().toISOString(),
      selectedTemplate: TEMPLATE_LIBRARY.find((item) => item.id === template) || null,
      selectedJob,
      ...aiResult.resume
    };
    memory.profile = profile;
    memory.formalResumes.unshift(formalResume);
    memory.events.unshift(event(
      "formal_resume_generated",
      aiResult.usedAI ? `MiniMax 已整合正式简历：${formalResume.targetTitle}` : `本地规则已生成正式简历：${aiResult.reason}`
    ));
    res.json({
      resume: formalResume,
      profile,
      diagnosis: parsed?.diagnosis || null,
      ai: { ...getMiniMaxStatus(), usedAI: aiResult.usedAI, reason: aiResult.reason || "" },
      events: memory.events.slice(0, 30)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/demo", (req, res) => {
  const profile = req.body?.profile || memory.profile || parseResumeText("").profile;
  const role = req.body?.role || "ai";
  memory.jobs = createDemoJobs(profile, role);
  res.json({ jobs: memory.jobs });
});

app.post("/api/jobs/live", async (req, res, next) => {
  try {
    const profile = req.body?.profile || memory.profile || parseResumeText("").profile;
    const sourceIds = req.body?.sourceIds || [];
    const githubSourceIds = new Set(GITHUB_JOB_SOURCES.map((source) => source.id));
    const selectedGitHubSources = sourceIds.filter((sourceId) => githubSourceIds.has(sourceId));
    const useGitHubSources = !sourceIds.length || selectedGitHubSources.length > 0;
    const useLegacyAggregator = !useGitHubSources && sourceIds.includes(CAMPUS_AGGREGATOR_SOURCE.id);
    const result = useGitHubSources ? await refreshGitHubJobSources({
      sourceIds: selectedGitHubSources,
      query: req.body?.query || "",
      type: req.body?.type || "campus",
      profile
    }) : useLegacyAggregator ? await refreshCampusAggregator({
      query: req.body?.query || "",
      type: req.body?.type || "campus",
      profile
    }) : await refreshOfficialSources({
      sourceIds,
      query: req.body?.query || "",
      type: req.body?.type || "campus",
      profile
    });
    memory.jobs = result.jobs;
    memory.events.unshift(event("jobs_live_refreshed", `岗位情报刷新完成：${result.sources.length} 个来源，生成 ${result.jobs.length} 张岗位情报卡`));
    res.json({ ...result, events: memory.events.slice(0, 30) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/import-url", async (req, res, next) => {
  try {
    if (!req.body?.url) throw new Error("请提供岗位 URL。");
    const profile = req.body?.profile || memory.profile || parseResumeText("").profile;
    const job = await importJobFromUrl({ url: req.body.url, profile, role: req.body?.role || "ai" });
    memory.jobs.unshift(job);
    memory.events.unshift(event("job_url_imported", `已导入岗位：${job.title}`));
    res.json({ job, jobs: memory.jobs, events: memory.events.slice(0, 30) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/score", (req, res) => {
  const profile = req.body?.profile || memory.profile;
  if (!profile) throw new Error("请先解析个人材料。");
  const role = req.body?.role || "ai";
  const jobs = (req.body?.jobs || []).map((job) => ({ ...job, matchScore: scoreJob(job, profile, role) }));
  memory.jobs = jobs;
  res.json({ jobs, roleScores: scoreAllRoles(profile, req.body?.jd || "") });
});

app.post("/api/queue/add", (req, res) => {
  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [req.body?.job].filter(Boolean);
  const role = req.body?.role || "ai";
  const variantId = req.body?.variantId || memory.variants[0]?.id || "";
  const additions = jobs.map((job) => ({
    id: `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    job,
    role,
    variantId,
    status: "queued",
    createdAt: new Date().toISOString()
  }));
  memory.queue.unshift(...additions);
  res.json({ queue: memory.queue });
});

app.get("/api/state", (_req, res) => {
  res.json({ ...memory, boss: getBossStatus(), roles: ROLE_PROFILES, templates: TEMPLATES });
});

app.post("/api/boss/start", async (req, res, next) => {
  try {
    res.json(await startBossBrowser({ url: req.body?.url }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/boss/status", (_req, res) => {
  res.json(getBossStatus());
});

app.post("/api/boss/scrape", async (req, res, next) => {
  try {
    const result = await scrapeBossJobs({ max: req.body?.max || 20 });
    const profile = req.body?.profile || memory.profile || parseResumeText("").profile;
    const role = req.body?.role || "ai";
    memory.jobs = result.jobs.map((job) => ({ ...job, matchScore: scoreJob(job, profile, role) }));
    memory.events.unshift(event("boss_scraped", `Boss 抓取 ${memory.jobs.length} 个岗位`));
    res.json({ ...result, jobs: memory.jobs, events: memory.events.slice(0, 30) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/boss/apply", async (req, res, next) => {
  try {
    const jobs = req.body?.jobs?.length ? req.body.jobs : memory.queue.map((item) => item.job);
    const result = await runBossApply({
      jobs,
      greeting: req.body?.greeting || memory.variants[0]?.greeting || "",
      dryRun: req.body?.dryRun !== false,
      limit: req.body?.limit || 3,
      delayMs: req.body?.delayMs || 9000,
      blacklist: req.body?.blacklist || ["外包", "培训", "保险", "销售"]
    });
    memory.events.unshift(event("boss_apply", `Boss 投递流程完成：${result.results.length} 条`));
    res.json({ ...result, events: memory.events.slice(0, 30) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/boss/close", async (_req, res, next) => {
  try {
    res.json(await closeBossBrowser());
  } catch (error) {
    next(error);
  }
});

app.use(express.static(dist));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"));
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ ok: false, error: error.message || String(error) });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Resume Protocol app: http://127.0.0.1:${port}`);
});

async function extractFileText(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const data = await parser.getText();
      return data.text || "";
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith(".docx")) {
    const data = await mammoth.extractRawText({ buffer: file.buffer });
    return data.value || "";
  }
  if (name.endsWith(".json")) {
    return JSON.stringify(JSON.parse(file.buffer.toString("utf8")), null, 2);
  }
  return file.buffer.toString("utf8");
}

function event(type, message) {
  return { type, message, at: new Date().toISOString() };
}
