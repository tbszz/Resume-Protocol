import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Database,
  Download,
  FileSearch,
  FileText,
  Loader2,
  MonitorUp,
  Play,
  Plus,
  Printer,
  Radar,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Target,
  Upload,
  UserRound,
  Wand2,
  X
} from "lucide-react";
import "./styles.css";

const API_BASE = window.location.port === "8787" ? "" : "http://127.0.0.1:8787";

const ROLE_CARDS = [
  { id: "ai", label: "AI 岗", title: "AI Agent / RAG", hint: "模型链路、RAG、评测、Prompt" },
  { id: "backend", label: "后端", title: "Python 后端", hint: "接口、数据库、并发、日志" },
  { id: "frontend", label: "前端", title: "React 前端", hint: "控制台、组件、状态、交互" },
  { id: "product", label: "产品", title: "AI 产品", hint: "需求、流程、指标、竞品" },
  { id: "ops", label: "运营", title: "AI 运营", hint: "内容、增长、转化、复盘" }
];

const TEMPLATE_CARDS = [
  { id: "ats", label: "ATS 一页版", hint: "系统解析友好" },
  { id: "cnTech", label: "中文技术版", hint: "技术项目优先" },
  { id: "aiResearch", label: "AI 应用版", hint: "Agent/RAG 强化" },
  { id: "productOps", label: "产品运营版", hint: "业务指标优先" }
];

const SAMPLE_MATERIAL = `张三
邮箱 zhangsan@example.com  手机 13800138000  GitHub https://github.com/example

教育经历
某某大学 软件工程 本科 2023-2027

项目经历
PPTSight 企业文档结构化检索与问答系统：基于 FastAPI、React、SQLite FTS5、RAG 和 LLM 实现 PPT/PPTX/PDF 多格式文档问答。支持页面、chunk、fact 三层检索，正式测试集 2047 题，successRate 99.95%，normalizedScore 49.7591。
SafeFile Agent 文件整理助手：基于 Python、LLM Adapter、OCR、Web UI 实现对话式文件整理 Agent。支持扫描、规划、安全预览、确认执行、undo 回滚和偏好学习，51 个单元测试通过，benchmark 24/24，score 100.0。

实习经历
参与 AI 工具原型设计和前后端联调，负责整理需求、实现页面、编写测试和输出演示材料。

技能
Python、FastAPI、React、Vite、SQLite、RAG、LLM、Agent、Prompt Engineering、Benchmark、Git、数据分析`;

const DEFAULT_JD = `岗位要求：负责 AI Agent / RAG 应用开发，熟悉 Python、FastAPI、Prompt Engineering、检索增强生成、评测 benchmark，能把 AI 能力落地为可用产品。`;
const TYPE_LABELS = { campus: "校招", internship: "实习", social: "社招" };
const DEFAULT_SOURCE_IDS = ["speedy-ai", "speedy-swe", "zapply-swe", "0voice-spring"];

function App() {
  const [rawMaterial, setRawMaterial] = useState(SAMPLE_MATERIAL);
  const [fileName, setFileName] = useState("");
  const [profileResult, setProfileResult] = useState(null);
  const [intakeResult, setIntakeResult] = useState(null);
  const [supplements, setSupplements] = useState({});
  const [formalResume, setFormalResume] = useState(null);
  const [avatar, setAvatar] = useState("");
  const [role, setRole] = useState("ai");
  const [template, setTemplate] = useState("aiResearch");
  const [templateLibrary, setTemplateLibrary] = useState([]);
  const [jd, setJd] = useState(DEFAULT_JD);
  const [jobType, setJobType] = useState("campus");
  const [jobQuery, setJobQuery] = useState("AI Agent");
  const [jobSources, setJobSources] = useState([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState(DEFAULT_SOURCE_IDS);
  const [sourcesDirty, setSourcesDirty] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobUrl, setJobUrl] = useState("");
  const [radarOpen, setRadarOpen] = useState(false);
  const [variant, setVariant] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [bossUrl, setBossUrl] = useState("https://www.zhipin.com/web/geek/job?query=AI%20Agent");
  const [bossStatus, setBossStatus] = useState({ connected: false, logs: [] });
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState("");
  const [autoArmed, setAutoArmed] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [blacklist, setBlacklist] = useState("外包,培训,保险,销售");

  const profile = profileResult?.profile;
  const diagnosis = profileResult?.diagnosis;
  const roleScores = profileResult?.roleScores || {};
  const canGenerate = Boolean(profile);
  const selectedRole = ROLE_CARDS.find((item) => item.id === role);
  const selectedTemplate = templateLibrary.find((item) => item.id === template) || TEMPLATE_CARDS.find((item) => item.id === template);
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => (b.opportunityScore || b.matchScore || 0) - (a.opportunityScore || a.matchScore || 0)), [jobs]);
  const radarSummary = useMemo(() => buildRadarSummary(jobSources, sortedJobs), [jobSources, sortedJobs]);
  const activeRadarJob = selectedJob || sortedJobs[0] || null;
  const completeness = intakeResult?.completeness;

  useEffect(() => {
    loadTemplateLibrary();
    loadJobLibrary("campus", "AI Agent");
    refreshLiveJobs();
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function runAction(name, action) {
    setBusy(name);
    try {
      const result = await action();
      if (result.events) setEvents(result.events);
      return result;
    } catch (error) {
      setEvents((current) => [{ type: "error", message: error.message, at: new Date().toISOString() }, ...current]);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function loadTemplateLibrary() {
    const result = await api("/api/templates");
    setTemplateLibrary(result.templates || []);
    if (result.templates?.[0] && !result.templates.some((item) => item.id === template)) {
      setTemplate(result.templates[0].id);
    }
  }

  async function loadJobLibrary(nextType = jobType, nextQuery = jobQuery) {
    const params = new URLSearchParams({ type: nextType, query: nextQuery || "" });
    const result = await api(`/api/jobs/library?${params.toString()}`);
    setJobs(result.jobs || []);
    setJobSources(result.sources || []);
  }

  async function parseMaterial() {
    const result = await runAction("parse", () =>
      api("/api/intake/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawMaterial, supplements, role, job: selectedJob })
      })
    );
    if (result) {
      setProfileResult(result);
      setIntakeResult(result);
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    const result = await runAction("upload", () => api("/api/profile/upload", { method: "POST", body: form }));
    if (result) {
      setProfileResult(result);
      setIntakeResult(null);
      setRawMaterial(result.normalizedText || rawMaterial);
    }
  }

  function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function formalizeResume() {
    const result = await runAction("formalize", () =>
      api("/api/resume/formalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawMaterial, extraText: Object.values(supplements).join("\n\n"), profile, role, template, jd, job: selectedJob })
      })
    );
    if (result?.resume) {
      setFormalResume(result.resume);
      if (!profileResult && result.profile) {
        setProfileResult({ profile: result.profile, diagnosis: result.diagnosis, roleScores: {} });
      }
    }
  }

  async function generateResume() {
    const result = await runAction("generate", () =>
      api("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, role, template, jd: buildSelectedJd() })
      })
    );
    if (result?.variant) setVariant(result.variant);
  }

  async function loadDemoJobs() {
    const result = await runAction("jobs", () =>
      api("/api/jobs/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, role })
      })
    );
    if (result?.jobs) setJobs(result.jobs);
  }

  async function refreshLiveJobs() {
    if (!selectedSourceIds.length) {
      setEvents((current) => [{ type: "warning", message: "请至少启用一个情报源后再同步。", at: new Date().toISOString() }, ...current]);
      return;
    }
    const result = await runAction("jobs-live", () =>
      api("/api/jobs/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, type: jobType, query: jobQuery, sourceIds: selectedSourceIds })
      })
    );
    if (result?.jobs) {
      setJobs(result.jobs);
      setJobSources(result.sources || jobSources);
      setSourcesDirty(false);
    }
  }

  async function importJobUrl() {
    const result = await runAction("job-import", () =>
      api("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl, profile, role })
      })
    );
    if (result?.job) {
      chooseJob(result.job);
      setJobs(result.jobs || [result.job, ...jobs]);
    }
  }

  function chooseJob(job) {
    setSelectedJob(job);
    setRole(job.role || role);
    const nextJd = [job.description, ...(job.requirements || [])].filter(Boolean).join("\n");
    setJd(nextJd || DEFAULT_JD);
  }

  function toggleSource(sourceId) {
    setSelectedSourceIds((current) =>
      current.includes(sourceId) ? current.filter((item) => item !== sourceId) : [...current, sourceId]
    );
    setSourcesDirty(true);
  }

  function selectAllSources() {
    const all = jobSources.length ? jobSources.map((source) => source.id) : DEFAULT_SOURCE_IDS;
    setSelectedSourceIds(all);
    setSourcesDirty(true);
  }

  function clearSources() {
    setSelectedSourceIds([]);
    setSourcesDirty(true);
  }

  async function startBoss() {
    const result = await runAction("boss-start", () =>
      api("/api/boss/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bossUrl })
      })
    );
    if (result) setBossStatus(result);
  }

  async function scrapeBoss() {
    const result = await runAction("boss-scrape", () =>
      api("/api/boss/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, role, max: 20 })
      })
    );
    if (result?.jobs) {
      setJobs(result.jobs);
      setBossStatus(result.status);
    }
  }

  async function addToQueue(job) {
    const result = await runAction("queue", () =>
      api("/api/queue/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, role, variantId: variant?.id })
      })
    );
    if (result?.queue) setQueue(result.queue);
  }

  async function runBossApply() {
    const selectedJobs = queue.map((item) => item.job);
    const result = await runAction("boss-apply", () =>
      api("/api/boss/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: selectedJobs,
          greeting: variant?.greeting,
          dryRun,
          limit: 5,
          delayMs: 10000,
          blacklist: blacklist.split(",").map((item) => item.trim()).filter(Boolean)
        })
      })
    );
    if (result?.status) setBossStatus(result.status);
  }

  function exportVariant() {
    const payload = { profile, variant, jobs, queue, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resume-protocol-${role}-${template}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateFormalResume(path, value) {
    setFormalResume((current) => {
      if (!current) return current;
      if (path.startsWith("contact.")) {
        const key = path.split(".")[1];
        return { ...current, contact: { ...current.contact, [key]: value } };
      }
      if (path === "skills") {
        return { ...current, skills: splitSkills(value) };
      }
      if (["education", "projects", "experience", "awards"].includes(path)) {
        return { ...current, [path]: splitRows(value) };
      }
      return { ...current, [path]: value };
    });
  }

  function updateSupplement(id, value) {
    setSupplements((current) => ({ ...current, [id]: value }));
  }

  function buildSelectedJd() {
    return [jd, selectedJob?.description, ...(selectedJob?.requirements || [])].filter(Boolean).join("\n");
  }

  function exportFormalResume() {
    const payload = { resume: formalResume, avatar, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `formal-resume-${role}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="product-shell">
      <aside className="side-rail">
        <div className="system-lines">
          <span>SYSTEM // RESUME_PROTOCOL V5.0</span>
          <span>MODE // REAL_WORKFLOW</span>
          <span>FORMAL_RESUME // A4_ONE_PAGE</span>
        </div>
        <h1>RESUME<br />OPS<br />OS</h1>
        <p>先补齐教育、实习、项目、技能、证书，再选岗位情报和模板，最后生成一页正式简历并投递。</p>
        <StepList profile={profile} completeness={completeness} selectedJob={selectedJob} selectedTemplate={selectedTemplate} formalResume={formalResume} variant={variant} jobs={jobs} queue={queue} bossStatus={bossStatus} />
      </aside>

      <section className="main-workspace">
        <header className="workspace-header">
          <div>
            <span className="tag">CORE FLOW // 正式简历</span>
            <h2>资料采集 → 缺口追问 → 岗位情报 → 模板生成</h2>
          </div>
          <div className="header-metrics">
            <Metric label="PROFILE" value={profile ? `${diagnosis?.completeness || 0}%` : "WAIT"} />
            <Metric label="ROLE" value={selectedRole?.label || "AI"} />
            <Metric label="READY" value={completeness ? `${completeness.completeness}%` : "WAIT"} />
          </div>
        </header>

        <section className="pipeline-grid">
          <Panel title="01 / 原始材料收件箱" icon={<Upload size={18} />}>
            <div className="upload-row">
              <label className="file-pick">
                <input type="file" accept=".txt,.md,.json,.pdf,.docx" onChange={uploadFile} />
                <Upload size={16} />
                上传 PDF / DOCX / TXT
              </label>
              <label className="file-pick">
                <input type="file" accept="image/*" onChange={uploadAvatar} />
                <Camera size={16} />
                上传头像
              </label>
              <span>{fileName || "也可以直接粘贴无格式简历、项目 README、实习碎片"}</span>
            </div>
            <textarea
              className="material-input"
              value={rawMaterial}
              onChange={(event) => setRawMaterial(event.target.value)}
              aria-label="原始个人材料"
            />
            <button className="primary-action" type="button" onClick={parseMaterial} disabled={busy === "parse"}>
              {busy === "parse" ? <Loader2 className="spin" size={17} /> : <FileSearch size={17} />}
              分析资料完整度
            </button>
          </Panel>

          <Panel title="02 / 画像、缺口与优劣势" icon={<Database size={18} />}>
            {!profile ? (
              <EmptyState text="先解析材料。系统会自动抽取教育、技能、项目、实习、指标和联系方式。" />
            ) : (
              <>
                <ProfileDiagnosis profile={profile} diagnosis={diagnosis} roleScores={roleScores} />
                <IntakeChecklist completeness={completeness} supplements={supplements} onSupplement={updateSupplement} onAnalyze={parseMaterial} busy={busy === "parse"} />
              </>
            )}
          </Panel>

          <Panel title="03 / 岗位雷达" icon={<Target size={18} />} wide>
            <RadarSummaryCard
              summary={radarSummary}
              job={activeRadarJob}
              selectedCount={selectedSourceIds.length}
              sourceCount={jobSources.length}
              dirty={sourcesDirty}
              busy={busy === "jobs-live"}
              onOpen={() => setRadarOpen(true)}
              onSync={refreshLiveJobs}
            />
            {radarOpen ? (
              <RadarModal
                role={role}
                jobType={jobType}
                jobQuery={jobQuery}
                sources={jobSources}
                selectedSourceIds={selectedSourceIds}
                sourcesDirty={sourcesDirty}
                summary={radarSummary}
                jobs={sortedJobs}
                activeJob={activeRadarJob}
                jd={jd}
                jobUrl={jobUrl}
                busy={busy}
                onClose={() => setRadarOpen(false)}
                onRoleChange={(nextRole, title) => { setRole(nextRole); setJobQuery(title); loadJobLibrary(jobType, title); }}
                onTypeChange={(nextType) => { setJobType(nextType); loadJobLibrary(nextType, jobQuery); }}
                onQueryChange={setJobQuery}
                onLoadLibrary={() => loadJobLibrary(jobType, jobQuery)}
                onSync={refreshLiveJobs}
                onToggleSource={toggleSource}
                onSelectAllSources={selectAllSources}
                onClearSources={clearSources}
                onQueue={addToQueue}
                onSelectJob={chooseJob}
                onJdChange={setJd}
                onJobUrlChange={setJobUrl}
                onImportJob={importJobUrl}
              />
            ) : null}
          </Panel>

          <Panel title="04 / 简历模板库" icon={<FileText size={18} />} wide>
            <TemplateLibrary templates={templateLibrary} selected={template} onSelect={setTemplate} />
          </Panel>

          <Panel title="05 / 正式一页简历预览" icon={<FileText size={18} />} wide className="resume-print-panel">
            {!formalResume ? (
              <EmptyState text={selectedJob && selectedTemplate ? "点击“AI 整合成正式一页简历”后，这里会生成带头像的一页正式简历。" : "请先完成信息分析，并选择目标岗位和简历模板，再生成正式简历。"} />
            ) : (
              <div className="formal-resume-workbench">
                <FormalResumeEditor resume={formalResume} onChange={updateFormalResume} />
                <FormalResumePreview resume={formalResume} avatar={avatar} template={selectedTemplate} />
              </div>
            )}
            <div className="action-row">
              <button type="button" onClick={formalizeResume} disabled={!profile || !selectedJob || !selectedTemplate || busy === "formalize"}>{busy === "formalize" ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}生成正式简历</button>
              <button type="button" onClick={exportFormalResume} disabled={!formalResume}><Save size={16} />导出正式简历 JSON</button>
              <button type="button" onClick={() => window.print()} disabled={!formalResume}><Printer size={16} />导出 PDF / 打印</button>
            </div>
          </Panel>

          <Panel title="06 / 岗位版简历素材" icon={<Target size={18} />} wide>
            {!variant ? <EmptyState text="生成后会显示摘要、技能、项目经历、实习经历、招呼语、差异说明和缺口。" /> : <ResumeVariant variant={variant} />}
            <div className="action-row">
              <button className="primary-action compact-action" type="button" onClick={generateResume} disabled={!canGenerate || !selectedJob || busy === "generate"}>
                {busy === "generate" ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
                生成岗位版素材
              </button>
              <button type="button" onClick={exportVariant} disabled={!variant}><Download size={16} />导出 JSON</button>
              <button type="button" onClick={() => window.print()} disabled={!variant}><MonitorUp size={16} />打印 / PDF</button>
            </div>
          </Panel>

          <Panel title="07 / Boss 岗位雷达" icon={<Radar size={18} />} wide>
            <div className="boss-bar">
              <input value={bossUrl} onChange={(event) => setBossUrl(event.target.value)} aria-label="Boss 搜索 URL" />
              <button type="button" onClick={startBoss} disabled={busy === "boss-start"}><Bot size={16} />启动 Boss 浏览器</button>
              <button type="button" onClick={scrapeBoss} disabled={busy === "boss-scrape"}><RefreshCw size={16} />抓取当前页岗位</button>
              <button type="button" onClick={loadDemoJobs}><Sparkles size={16} />示例岗位</button>
            </div>
            <div className="boss-status">
              <span className={bossStatus.connected ? "ok-dot" : "idle-dot"} />
              {bossStatus.connected ? "Boss 浏览器已连接。请确保你已手动登录。" : "未连接。启动后会打开独立 Chrome 用户目录。"}
            </div>
            <JobList jobs={sortedJobs} onQueue={addToQueue} />
          </Panel>

          <Panel title="08 / 投递队列与自动执行" icon={<Send size={18} />} wide>
            <div className="apply-controls">
              <label><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} /> Dry-run 只演练不点击发送</label>
              <label><input type="checkbox" checked={autoArmed} onChange={(event) => setAutoArmed(event.target.checked)} /> 我确认启用自动点击</label>
              <input value={blacklist} onChange={(event) => setBlacklist(event.target.value)} aria-label="黑名单关键词" />
              <button className="danger-action" type="button" onClick={runBossApply} disabled={!queue.length || (!dryRun && !autoArmed) || busy === "boss-apply"}>
                <Play size={16} />
                {dryRun ? "演练投递流程" : "开始自动投递"}
              </button>
            </div>
            <QueueList queue={queue} />
            <LogPanel events={events} bossStatus={bossStatus} />
          </Panel>
        </section>
      </section>
    </main>
  );
}

function splitRows(value) {
  return String(value || "")
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSkills(value) {
  return String(value || "")
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value) {
  return (value || []).join("\n");
}

function StepList({ profile, completeness, selectedJob, selectedTemplate, formalResume, variant, jobs, queue, bossStatus }) {
  const steps = [
    ["采集资料", Boolean(profile)],
    ["缺口补充", Boolean(completeness && completeness.missing.length === 0)],
    ["选择岗位", Boolean(selectedJob)],
    ["选择模板", Boolean(selectedTemplate)],
    ["正式简历", Boolean(formalResume)],
    ["岗位素材", Boolean(variant)],
    ["投递队列", queue.length > 0 || jobs.length > 0],
    ["Boss 会话", bossStatus.connected]
  ];
  return (
    <div className="step-list">
      {steps.map(([label, done], index) => (
        <div key={label} className={done ? "done" : ""}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
          {done ? <CheckCircle2 size={15} /> : <ArrowRight size={15} />}
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, icon, children, wide = false, className = "" }) {
  return (
    <section className={`${wide ? "panel wide" : "panel"} ${className}`}>
      <div className="panel-head">{icon}<h3>{title}</h3></div>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><AlertTriangle size={18} />{text}</div>;
}

function CardGrid({ children }) {
  return <div className="card-grid">{children}</div>;
}

function SelectCard({ active, onClick, children }) {
  return <button type="button" className={active ? "select-card active" : "select-card"} onClick={onClick}>{children}</button>;
}

function ProfileDiagnosis({ profile, diagnosis, roleScores }) {
  return (
    <div className="diagnosis">
      <div className="profile-summary">
        <strong>{profile.name}</strong>
        <span>{profile.title}</span>
        <small>联系方式：{profile.contact.email || profile.contact.phone || "缺失"}</small>
      </div>
      <div className="mini-tags">
        {profile.skills.slice(0, 12).map((skill) => <span key={skill}>{skill}</span>)}
      </div>
      <div className="diagnosis-columns">
        <div>
          <h4>优势</h4>
          {(diagnosis?.strengths || []).map((item) => <p key={item}><CheckCircle2 size={14} />{item}</p>)}
        </div>
        <div>
          <h4>缺口提示</h4>
          {(diagnosis?.gaps || []).map((item) => <p key={item}><AlertTriangle size={14} />{item}</p>)}
        </div>
      </div>
      <div className="score-grid">
        {Object.entries(roleScores).map(([key, item]) => <Metric key={key} label={key.toUpperCase()} value={item.score} />)}
      </div>
    </div>
  );
}

function IntakeChecklist({ completeness, supplements, onSupplement, onAnalyze, busy }) {
  if (!completeness) {
    return <EmptyState text="点击“分析资料完整度”，系统会告诉你教育、实习、项目、证书等哪些信息还缺。" />;
  }
  return (
    <div className="intake-checklist">
      <div className="checklist-head">
        <strong>资料完整度 {completeness.completeness}%</strong>
        <span>{completeness.readyForResume ? "可以进入生成" : `还缺 ${completeness.missing.length} 项关键信息`}</span>
      </div>
      <div className="field-grid">
        {completeness.fields.map((field) => (
          <section key={field.id} className={field.complete ? "field-card complete" : "field-card missing"}>
            <div>
              <b>{field.label}</b>
              {field.complete ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            </div>
            <p>{field.prompt}</p>
            {field.evidence ? <small>{field.evidence}</small> : null}
            {!field.complete ? (
              <textarea
                value={supplements[field.id] || ""}
                onChange={(event) => onSupplement(field.id, event.target.value)}
                placeholder={field.prompt}
              />
            ) : null}
          </section>
        ))}
      </div>
      <button className="primary-action secondary-action" type="button" onClick={onAnalyze} disabled={busy}>
        {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
        合并补充信息并重新分析
      </button>
    </div>
  );
}

function TemplateLibrary({ templates, selected, onSelect }) {
  const rows = templates.length ? templates : TEMPLATE_CARDS;
  return (
    <div className="template-library">
      {rows.map((item) => (
        <button key={item.id} type="button" className={selected === item.id ? "template-card active" : "template-card"} onClick={() => onSelect(item.id)}>
          <TemplatePreview template={item} />
          <div className="template-card-copy">
            <span>{item.source || "Local template"}</span>
            <strong>{item.label}</strong>
            <p>{item.bestFor || item.hint}</p>
            <small>{item.notes || "正式一页简历模板"}</small>
          </div>
        </button>
      ))}
    </div>
  );
}

function TemplatePreview({ template }) {
  const accent = template.accent || "#2563eb";
  const tone = template.density === "compact" ? "compact" : "medium";
  return (
    <div className={`template-preview ${tone}`} style={{ "--preview-accent": accent }}>
      <div className="preview-top">
        <span />
        <span />
      </div>
      <div className="preview-head">
        <b />
        <small />
      </div>
      <div className="preview-body">
        <i />
        <i />
        <i />
      </div>
      <div className="preview-footer">
        <em />
        <em />
      </div>
    </div>
  );
}

function RadarSummaryCard({ summary, job, selectedCount, sourceCount, dirty, busy, onOpen, onSync }) {
  const statusText = dirty ? "来源选择已变更" : summary.syncedSources ? "聚合源已同步" : "等待同步";
  return (
    <section className="radar-summary-card">
      <div className="radar-summary-copy">
        <span className={dirty ? "radar-status dirty" : "radar-status"}>{statusText}</span>
        <h4>{job?.title || "选择目标岗位，系统会按机会优先排序"}</h4>
        <p>{job ? `${job.company || "岗位来源"} · 机会分 ${job.opportunityScore || job.matchScore || 0} · ${job.location || job.city || "多城市"}` : "聚合源、岗位列表、匹配解释都会放进弹窗，主流程不再被长列表撑开。"}</p>
      </div>
      <div className="radar-summary-stats">
        <Metric label="SOURCE" value={`${selectedCount}/${sourceCount || DEFAULT_SOURCE_IDS.length}`} />
        <Metric label="JOB" value={summary.generatedJobs || 0} />
        <Metric label="HIGH" value={summary.highOpportunityJobs || 0} />
      </div>
      <div className="radar-summary-actions">
        <button className="radar-open-button" type="button" onClick={onOpen}><Radar size={16} />打开岗位雷达</button>
        <button type="button" onClick={onSync} disabled={busy || !selectedCount}>
          {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          同步已选源
        </button>
      </div>
    </section>
  );
}

function RadarModal({
  role,
  jobType,
  jobQuery,
  sources,
  selectedSourceIds,
  sourcesDirty,
  summary,
  jobs,
  activeJob,
  jd,
  jobUrl,
  busy,
  onClose,
  onRoleChange,
  onTypeChange,
  onQueryChange,
  onLoadLibrary,
  onSync,
  onToggleSource,
  onSelectAllSources,
  onClearSources,
  onQueue,
  onSelectJob,
  onJdChange,
  onJobUrlChange,
  onImportJob
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="radar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="radar-modal" role="dialog" aria-modal="true" aria-label="岗位雷达">
        <header className="radar-modal-head">
          <div>
          <span className="tag">JOB RADAR // CAMPUS AGGREGATOR</span>
            <h3>岗位雷达</h3>
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭岗位雷达"><X size={18} /></button>
        </header>

        <div className="radar-modal-toolbar">
          <div className="role-tabs compact-tabs">
            {ROLE_CARDS.map((item) => (
              <button key={item.id} className={role === item.id ? "radar-tab active" : "radar-tab"} onClick={() => onRoleChange(item.id, item.title)} type="button">
                <strong>{item.label}</strong>
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className="radar-search modal-search">
            <div className="template-row">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <button key={key} className={jobType === key ? "chip active" : "chip"} onClick={() => onTypeChange(key)} type="button">
                  {label}
                </button>
              ))}
            </div>
            <input value={jobQuery} onChange={(event) => onQueryChange(event.target.value)} aria-label="岗位关键词" />
            <button type="button" onClick={onSync} disabled={busy === "jobs-live" || !selectedSourceIds.length}>
              {busy === "jobs-live" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              同步已选源
            </button>
            <button type="button" onClick={onLoadLibrary}><FileSearch size={16} />岗位画像</button>
          </div>
          <SourcePicker
            sources={sources}
            selected={selectedSourceIds}
            dirty={sourcesDirty}
            onToggle={onToggleSource}
            onSelectAll={onSelectAllSources}
            onClear={onClearSources}
          />
        </div>

        <RadarMetrics summary={summary} />
        <div className="radar-modal-grid">
          <OpportunityList jobs={jobs} onQueue={onQueue} onSelect={onSelectJob} selectedJobId={activeJob?.id} />
          <JobInsight
            job={activeJob}
            jd={jd}
            onJdChange={onJdChange}
            jobUrl={jobUrl}
            onJobUrlChange={onJobUrlChange}
            onImport={onImportJob}
            importDisabled={!jobUrl || busy === "job-import"}
          />
        </div>
      </section>
    </div>
  );
}

function SourcePicker({ sources, selected, dirty, onToggle, onSelectAll, onClear }) {
  if (!sources.length) return <EmptyState text="官方源列表加载中。" />;
  const groups = sources.reduce((bucket, source) => {
    const key = source.group || "官方源";
    bucket[key] = bucket[key] || [];
    bucket[key].push(source);
    return bucket;
  }, {});
  return (
    <details className="source-picker">
      <summary>
        <span>{dirty ? "来源已变更，待同步" : "情报源选择"}</span>
        <strong>{selected.length}/{sources.length}</strong>
      </summary>
      <div className="source-picker-panel">
        <div className="source-picker-actions">
          <button type="button" onClick={onSelectAll}>全部启用</button>
          <button type="button" onClick={onClear}>清空</button>
        </div>
        {Object.entries(groups).map(([group, rows]) => (
          <section key={group} className="source-group">
            <h4>{group}</h4>
            <div className="source-grid">
              {rows.map((source) => {
                const enabled = selected.includes(source.id);
                return (
                  <button key={source.id} type="button" aria-pressed={enabled} className={enabled ? "source-row active" : "source-row"} onClick={() => onToggle(source.id)}>
                    <span className={source.ok ? "status-dot ok" : source.ok === false ? "status-dot fail" : "status-dot idle"} />
                    <b>{source.company}</b>
                    <small>{enabled ? "启用" : "停用"}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}

function buildRadarSummary(sources = [], jobs = []) {
  return {
    totalSources: sources.length,
    syncedSources: sources.filter((source) => source.ok).length,
    failedSources: sources.filter((source) => source.ok === false).length,
    generatedJobs: jobs.length,
    highOpportunityJobs: jobs.filter((job) => (job.opportunityScore || job.matchScore || 0) >= 85).length,
    officialVerifiedJobs: jobs.filter((job) => job.applyUrl || job.sourceUrl).length
  };
}

function RadarMetrics({ summary }) {
  const metrics = [
    ["情报源", summary.totalSources || 0],
    ["已同步", summary.syncedSources || 0],
    ["高机会", summary.highOpportunityJobs || 0],
    ["可投递", summary.officialVerifiedJobs || 0],
    ["岗位卡", summary.generatedJobs || 0]
  ];
  return (
    <div className="radar-metrics">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function SourceRadar({ sources, selected, onToggle }) {
  if (!sources.length) return <EmptyState text="还没有情报源状态。点击“同步已选源”后会展示聚合源状态。" />;
  const groups = sources.reduce((bucket, source) => {
    const key = source.group || "官方源";
    bucket[key] = bucket[key] || [];
    bucket[key].push(source);
    return bucket;
  }, {});
  return (
    <aside className="source-radar">
      <div className="radar-column-head">
        <strong>情报源雷达</strong>
        <span>{selected.length}/{sources.length}</span>
      </div>
      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} className="source-group">
          <h4>{group}</h4>
          {rows.map((source) => (
            <button key={source.id} type="button" className={selected.includes(source.id) ? "source-row active" : "source-row"} onClick={() => onToggle(source.id)}>
              <span className={source.ok ? "status-dot ok" : source.ok === false ? "status-dot fail" : "status-dot idle"} />
              <b>{source.company}</b>
              <small>{source.syncStatus === "synced" ? "已同步" : source.syncStatus === "failed" ? "失败" : "待同步"}</small>
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}

function OpportunityList({ jobs, onQueue, onSelect, selectedJobId }) {
  if (!jobs.length) return <EmptyState text="还没有岗位卡。同步聚合源后，会按机会分自动排序。" />;
  return (
    <section className="opportunity-list">
      <div className="radar-column-head">
        <strong>机会优先岗位</strong>
        <span>{jobs.length} 条</span>
      </div>
      {jobs.slice(0, 36).map((job) => (
        <article key={job.id || job.url} className={selectedJobId === job.id ? "opportunity-card active" : "opportunity-card"}>
          <button type="button" className="opportunity-main" onClick={() => onSelect(job)}>
            <span className="opportunity-company">{job.company || "未知公司"} · {TYPE_LABELS[job.type] || job.type || "岗位"}</span>
            <strong>{job.title}</strong>
            <p>{job.location || job.city || "多城市"} · {job.source === "github-job-source" ? "GitHub源" : job.source === "campus-aggregator" ? "聚合源" : job.sourceStatus === "reachable" ? "官方源可达" : "来源待确认"}</p>
            <div className="opportunity-bars">
              {Object.entries(job.opportunityBreakdown || {}).slice(0, 5).map(([key, value]) => (
                <span key={key} style={{ "--bar": `${Math.max(8, Math.min(100, value || 0))}%` }}>
                  <b>{breakdownLabel(key)}</b>
                  <i />
                </span>
              ))}
            </div>
          </button>
          <div className="opportunity-score">
            <b>{job.opportunityScore || job.matchScore || 0}</b>
            <button type="button" onClick={() => onQueue(job)}><Plus size={14} />入队</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function JobInsight({ job, jd, onJdChange, jobUrl, onJobUrlChange, onImport, importDisabled }) {
  if (!job) return <EmptyState text="选择一个岗位后，这里会展示 JD 摘要、匹配证据、缺口关键词和简历建议。" />;
  return (
    <aside className="job-insight">
      <div className="radar-column-head">
        <strong>匹配解释</strong>
        <span>{job.opportunityScore || job.matchScore || 0}</span>
      </div>
      <header className="insight-title">
        <span>{job.company || "官方源"} · {job.sourceGroup || "岗位来源"}</span>
        <h4>{job.title}</h4>
        {job.sourceUrl ? <a href={job.sourceUrl} target="_blank" rel="noreferrer">打开投递 / 来源链接</a> : null}
      </header>
      <InsightBlock title="为什么排前面" items={job.matchEvidence || [`匹配分 ${job.matchScore || 0}，机会分 ${job.opportunityScore || 0}`]} />
      <InsightBlock title="岗位硬要求" items={(job.requirements || []).slice(0, 5)} />
      <InsightBlock title="缺口关键词" items={(job.gapKeywords || []).length ? job.gapKeywords : ["暂无明显缺口"]} />
      <InsightBlock title="推荐突出项目" items={(job.recommendedProjects || []).length ? job.recommendedProjects : ["请先解析个人材料，系统会自动匹配项目证据"]} />
      <InsightBlock title="简历建议" items={job.resumeAdvice || ["补充结果指标、协作对象和上线状态"]} />
      <textarea className="jd-input radar-jd" value={jd} onChange={(event) => onJdChange(event.target.value)} aria-label="岗位 JD" />
      <div className="import-row compact-import">
        <input value={jobUrl} onChange={(event) => onJobUrlChange(event.target.value)} placeholder="补充单个官方 JD URL" aria-label="导入 JD URL" />
        <button type="button" onClick={onImport} disabled={importDisabled}><Download size={16} />导入</button>
      </div>
    </aside>
  );
}

function InsightBlock({ title, items }) {
  return (
    <section className="insight-block">
      <h5>{title}</h5>
      <ul>
        {(items || []).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function breakdownLabel(key) {
  return {
    match: "匹配",
    freshness: "新鲜",
    apply: "可投",
    company: "公司",
    typeFit: "类型"
  }[key] || key;
}

function SourceSelector({ sources, selected, onToggle }) {
  if (!sources.length) return null;
  return (
    <div className="source-selector">
      {sources.map((source) => (
        <label key={source.id} className={selected.includes(source.id) ? "source-chip active" : "source-chip"}>
          <input type="checkbox" checked={selected.includes(source.id)} onChange={() => onToggle(source.id)} />
          {source.company}
        </label>
      ))}
    </div>
  );
}

function FormalResumeEditor({ resume, onChange }) {
  return (
    <aside className="formal-editor">
      <div className="editor-grid">
        <label>姓名<input value={resume.name} onChange={(event) => onChange("name", event.target.value)} /></label>
        <label>目标岗位<input value={resume.targetTitle} onChange={(event) => onChange("targetTitle", event.target.value)} /></label>
        <label>手机<input value={resume.contact.phone} onChange={(event) => onChange("contact.phone", event.target.value)} /></label>
        <label>邮箱<input value={resume.contact.email} onChange={(event) => onChange("contact.email", event.target.value)} /></label>
        <label>GitHub<input value={resume.contact.github} onChange={(event) => onChange("contact.github", event.target.value)} /></label>
        <label>城市<input value={resume.contact.location} onChange={(event) => onChange("contact.location", event.target.value)} /></label>
      </div>
      <label>个人简介<textarea value={resume.summary} onChange={(event) => onChange("summary", event.target.value)} /></label>
      <label>教育经历<textarea value={joinLines(resume.education)} onChange={(event) => onChange("education", event.target.value)} /></label>
      <label>技能标签<textarea value={joinLines(resume.skills)} onChange={(event) => onChange("skills", event.target.value)} /></label>
      <label>项目经历<textarea value={joinLines(resume.projects)} onChange={(event) => onChange("projects", event.target.value)} /></label>
      <label>实习/工作经历<textarea value={joinLines(resume.experience)} onChange={(event) => onChange("experience", event.target.value)} /></label>
      <label>奖项/证书/指标<textarea value={joinLines(resume.awards)} onChange={(event) => onChange("awards", event.target.value)} /></label>
      <p className="ai-source">生成来源：{resume.source === "ai" ? "MiniMax AI" : "本地规则"} {resume.model ? `// ${resume.model}` : ""}</p>
    </aside>
  );
}

function FormalResumePreview({ resume, avatar, template }) {
  const contact = [
    resume.contact.phone,
    resume.contact.email,
    resume.contact.location,
    resume.contact.github,
    resume.contact.website
  ].filter(Boolean);
  return (
    <article className={`formal-resume-page template-${resume.templateId || template?.id || "default"}`} style={{ "--resume-accent": template?.accent || "#111827" }}>
      <header className="formal-resume-head">
        <div>
          <h3>{resume.name}</h3>
          <strong>{resume.targetTitle}</strong>
          {template ? <em>{template.label}</em> : null}
          <p>{contact.join("  |  ") || "联系方式待补充"}</p>
        </div>
        <div className={avatar ? "avatar-frame has-image" : "avatar-frame"}>
          {avatar ? <img src={avatar} alt="简历头像" /> : <UserRound size={44} />}
        </div>
      </header>
      <ResumeSection title="个人简介"><p>{resume.summary || "个人简介待补充"}</p></ResumeSection>
      <ResumeSection title="教育经历"><BulletList items={resume.education} /></ResumeSection>
      <ResumeSection title="专业技能"><SkillList items={resume.skills} /></ResumeSection>
      <ResumeSection title="项目经历"><BulletList items={resume.projects} /></ResumeSection>
      <ResumeSection title="实习 / 工作经历"><BulletList items={resume.experience} /></ResumeSection>
      <ResumeSection title="奖项 / 证书 / 关键指标"><BulletList items={resume.awards} /></ResumeSection>
    </article>
  );
}

function ResumeSection({ title, children }) {
  return (
    <section className="formal-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function BulletList({ items = [] }) {
  const rows = items.length ? items : ["待补充"];
  return <ul>{rows.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function SkillList({ items = [] }) {
  const rows = items.length ? items : ["待补充"];
  return <div className="formal-skills">{rows.map((item) => <span key={item}>{item}</span>)}</div>;
}

function ResumeVariant({ variant }) {
  return (
    <article className="resume-card">
      <header>
        <div>
          <span className="tag">{variant.roleLabel} // {variant.templateLabel}</span>
          <h3>{variant.title}</h3>
        </div>
        <div className="score-badge">{variant.fitScore}</div>
      </header>
      <p>{variant.summary}</p>
      <StreamDecode text={variant.diff.join("  ")} />
      <h4>技能栈</h4>
      <div className="mini-tags">{variant.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
      <h4>项目经历</h4>
      {variant.projects.map((item) => <p className="bullet" key={item}>• {item}</p>)}
      <h4>实习经历</h4>
      {variant.experience.length ? variant.experience.map((item) => <p className="bullet" key={item}>• {item}</p>) : <p className="muted">原始材料中实习经历不足，建议补充职责、动作和结果。</p>}
      <h4>Boss 打招呼语</h4>
      <div className="greeting">{variant.greeting}</div>
    </article>
  );
}

function StreamDecode({ text }) {
  const [visible, setVisible] = useState("");
  function start() {
    setVisible("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 3;
      setVisible(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 14);
  }
  return (
    <button type="button" className="decode-line" onMouseEnter={start} onFocus={start}>
      <span>&gt; HOVER_TO_DECODE</span>
      <b>{visible || "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}</b>
    </button>
  );
}

function JobList({ jobs, onQueue, onSelect, selectedJobId }) {
  if (!jobs.length) return <EmptyState text="还没有岗位。可以启动 Boss 浏览器抓取当前搜索页，也可以先加载示例岗位验证流程。" />;
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <article key={job.id || job.url} className={selectedJobId === job.id ? "selected" : ""}>
          <div>
            <strong>{job.title}</strong>
            <span>{job.company || "未知公司"} · {job.location || "未知地点"} · {job.salary || "薪资未展示"}</span>
            <p>{job.description}</p>
            {job.requirements?.length ? (
              <ul className="requirement-list">
                {job.requirements.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            {job.sourceUrl ? <a href={job.sourceUrl} target="_blank" rel="noreferrer">投递 / 来源链接</a> : null}
          </div>
          <div className="job-actions">
            <b>{job.matchScore || 0}</b>
            {onSelect ? <button type="button" onClick={() => onSelect(job)}><Target size={15} />选择</button> : null}
            <button type="button" onClick={() => onQueue(job)}><Plus size={15} />入队</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function QueueList({ queue }) {
  if (!queue.length) return <EmptyState text="队列为空。先从岗位雷达中选择岗位入队。" />;
  return (
    <div className="queue-list">
      {queue.map((item) => (
        <div key={item.id}>
          <span>{item.job.company || "公司"} // {item.job.title}</span>
          <b>{item.status}</b>
        </div>
      ))}
    </div>
  );
}

function LogPanel({ events, bossStatus }) {
  const logs = [
    ...(events || []).map((event) => `${event.type}: ${event.message}`),
    ...((bossStatus.logs || []).map((log) => `boss: ${log.message}`))
  ].slice(0, 12);
  return (
    <div className="log-panel">
      {logs.length ? logs.map((item, index) => <span key={`${item}-${index}`}>&gt; {item}</span>) : <span>&gt; WAITING_FOR_EVENTS</span>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
