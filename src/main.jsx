import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileSearch,
  FileText,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Paperclip,
  Plus,
  Radar,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import { buildJobQueries, planAgentAction } from "./agentIntent.js";
import { normalizeResultItems } from "./chatResults.js";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  loadChatState,
  saveChatState,
  updateConversationContext
} from "./chatStore.js";
import "./styles.css";

const API_BASE = window.location.port === "8787" ? "" : "http://127.0.0.1:8787";
const VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260402_134434_5de46cb4-38e7-42a6-a8bc-6e62b2fd6c7b.mp4";

const QUICK_PROMPTS = [
  {
    label: "诊断我的简历",
    prompt: "帮我诊断当前简历，重点检查项目证据和信息完整度",
    description: "找出缺失信息与薄弱证据",
    icon: FileSearch
  },
  {
    label: "寻找目标岗位",
    prompt: "帮我找适合当前背景的 AI Agent 校招岗位",
    description: "返回可直接选择的岗位候选",
    icon: Radar
  },
  {
    label: "生成岗位版简历",
    prompt: "根据当前资料和目标 JD 生成岗位版简历",
    description: "按 JD 重排技能与项目证据",
    icon: WandSparkles
  },
  {
    label: "准备项目面试",
    prompt: "根据当前岗位版简历准备项目面试和追问",
    description: "生成项目深挖与七天计划",
    icon: MessageSquareText
  }
];

function App() {
  const [chatState, setChatState] = useState(() => loadChatState(window.localStorage));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);

  const activeConversation = useMemo(
    () => chatState.conversations.find((item) => item.id === chatState.activeConversationId) || chatState.conversations[0],
    [chatState]
  );
  const hasStarted = activeConversation.messages.some((message) => message.role === "user");

  useEffect(() => {
    saveChatState(window.localStorage, chatState);
  }, [chatState]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation.messages.length, pending]);

  function addMessage(conversationId, role, content, extras = {}) {
    setChatState((current) => appendMessage(current, conversationId, {
      id: createId("message"),
      role,
      content,
      kind: extras.kind || "text",
      data: extras.data || null,
      tone: extras.tone || "default",
      createdAt: new Date().toISOString()
    }));
  }

  function patchContext(conversationId, patch) {
    setChatState((current) => updateConversationContext(current, conversationId, patch));
  }

  function createNewChat() {
    const conversation = createConversation();
    setChatState((current) => ({
      ...current,
      activeConversationId: conversation.id,
      conversations: [conversation, ...current.conversations]
    }));
    setDraft("");
    setSidebarOpen(false);
  }

  function selectConversation(conversationId) {
    setChatState((current) => ({ ...current, activeConversationId: conversationId }));
    setSidebarOpen(false);
  }

  function removeConversation(event, conversationId) {
    event.stopPropagation();
    setChatState((current) => deleteConversation(current, conversationId));
  }

  async function submitPrompt(nextPrompt = draft) {
    const value = String(nextPrompt || "").trim();
    if (!value || pending) return;

    const conversationId = activeConversation.id;
    const snapshot = activeConversation;
    setDraft("");
    addMessage(conversationId, "user", value);
    setPending({ conversationId, label: "正在理解你的目标" });

    try {
      await runAgent(value, snapshot, conversationId);
    } catch (error) {
      addMessage(
        conversationId,
        "assistant",
        "这一步没有完成：" + error.message + "。你可以稍后重试，之前的聊天和资料不会丢失。",
        { kind: "error", tone: "warning" }
      );
    } finally {
      setPending(null);
    }
  }

  async function runAgent(input, conversation, conversationId) {
    let context = { ...conversation.context };
    const pastedMaterial = looksLikeResumeMaterial(input);
    const pastedJd = looksLikeJobDescription(input);

    if (pastedMaterial) {
      context = { ...context, material: input };
      patchContext(conversationId, { material: input });
    }

    if (pastedJd) {
      const selectedJob = createJobFromDescription(input);
      context = { ...context, selectedJob };
      patchContext(conversationId, { selectedJob });
      if (!/简历|优化|生成|面试|追问/.test(input)) {
        addMessage(
          conversationId,
          "assistant",
          "已把这份 JD 设为当前目标岗位。接下来可以直接让我生成岗位版简历。",
          { kind: "target", data: { job: selectedJob } }
        );
        return;
      }
    }

    const plan = planAgentAction(input, {
      hasMaterial: Boolean(context.material),
      hasProfile: Boolean(context.profile),
      hasJob: Boolean(context.selectedJob),
      hasVariant: Boolean(context.variant)
    });

    if (plan.action === "request-material" || plan.action === "request-resume" || plan.action === "none") {
      addMessage(conversationId, "assistant", plan.message);
      return;
    }

    if (plan.action === "analyze") {
      await analyzeMaterial(conversationId, context.material || input, context);
      return;
    }

    if (plan.action === "search-jobs") {
      await searchJobs(conversationId, input, context);
      return;
    }

    if (plan.action === "generate-resume") {
      await generateResume(conversationId, context, input);
      return;
    }

    if (plan.action === "prepare-interview") {
      addMessage(
        conversationId,
        "assistant",
        "我已经按当前岗位版整理了项目追问、技术主线和七天复习节奏。",
        { kind: "interview", data: { plan: context.variant.interviewPlan } }
      );
      return;
    }

    addMessage(
      conversationId,
      "assistant",
      "我是你的求职 Agent。把简历或 JD 直接发给我，或者告诉我想诊断简历、找岗位、生成岗位版、准备面试。我会在当前对话里完成，不需要切换页面。"
    );
  }

  async function analyzeMaterial(conversationId, material, context) {
    if (!material.trim()) {
      addMessage(conversationId, "assistant", "请直接粘贴简历内容，或点击输入框左侧的附件按钮上传文件。");
      return;
    }
    setPending({ conversationId, label: "正在分析职业资料" });
    const result = await api("/api/intake/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: material,
        role: inferRole(material, context.selectedJob),
        job: context.selectedJob
      })
    });
    const diagnosis = result.completeness || result.diagnosis || {};
    patchContext(conversationId, {
      material,
      profile: result.profile,
      diagnosis
    });
    addMessage(
      conversationId,
      "assistant",
      "资料分析完成。当前完整度 " + (diagnosis.completeness || 0) + "%，下面是最值得先处理的证据。",
      {
        kind: "diagnosis",
        data: {
          completeness: diagnosis.completeness || 0,
          strengths: diagnosis.strengths || result.diagnosis?.strengths || [],
          gaps: diagnosis.missing || diagnosis.gaps || result.diagnosis?.gaps || []
        }
      }
    );
  }

  async function searchJobs(conversationId, input, context) {
    setPending({ conversationId, label: "正在匹配目标岗位" });
    const queries = buildJobQueries(input, context.profile);
    let result = { jobs: [] };
    let matchedQuery = queries[0];
    for (const query of queries) {
      const params = new URLSearchParams({ type: inferJobType(input), query });
      result = await api("/api/jobs/library?" + params.toString());
      matchedQuery = query;
      if (result.jobs?.length) break;
    }
    const jobs = [...(result.jobs || [])]
      .sort((left, right) => (right.opportunityScore || right.matchScore || 0) - (left.opportunityScore || left.matchScore || 0))
      .slice(0, 4);
    patchContext(conversationId, { jobs });
    addMessage(
      conversationId,
      "assistant",
      jobs.length
        ? "找到 " + jobs.length + " 个优先候选。选择一个目标岗位后，我会在后续消息里一直使用这份 JD。"
        : "暂时没有找到匹配岗位。可以换一个方向或更具体的关键词再试一次。",
      { kind: "jobs", data: { jobs, query: matchedQuery } }
    );
  }

  async function generateResume(conversationId, context, input) {
    setPending({ conversationId, label: "正在生成岗位版简历" });
    const role = inferRole(input, context.selectedJob);
    const jd = [
      context.selectedJob?.description,
      ...(context.selectedJob?.requirements || [])
    ].filter(Boolean).join("\n");
    const result = await api("/api/resume/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: context.profile,
        role,
        template: role === "product" || role === "ops" ? "productOps" : "aiResearch",
        jd
      })
    });
    patchContext(conversationId, { variant: result.variant });
    addMessage(
      conversationId,
      "assistant",
      "岗位版已经生成，匹配度 " + result.variant.fitScore + "/100。每一条改写都保留了可追问的项目证据。",
      { kind: "resume", data: { variant: result.variant } }
    );
  }

  async function selectJob(conversationId, job) {
    patchContext(conversationId, { selectedJob: job, variant: null });
    addMessage(
      conversationId,
      "assistant",
      "已选择「" + job.company + " · " + job.title + "」作为目标岗位。现在可以让我生成岗位版简历。",
      { kind: "target", data: { job } }
    );
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pending) return;
    const conversationId = activeConversation.id;
    addMessage(conversationId, "user", "上传了简历文件：" + file.name, {
      kind: "attachment",
      data: { filename: file.name }
    });
    setPending({ conversationId, label: "正在读取 " + file.name });
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/profile/upload", { method: "POST", body: form });
      const diagnosis = result.diagnosis || {};
      patchContext(conversationId, {
        material: result.normalizedText || "",
        profile: result.profile,
        diagnosis
      });
      addMessage(
        conversationId,
        "assistant",
        "文件读取完成。资料完整度 " + (diagnosis.completeness || 0) + "%，我已经保留这份画像供后续岗位和简历任务使用。",
        {
          kind: "diagnosis",
          data: {
            completeness: diagnosis.completeness || 0,
            strengths: diagnosis.strengths || [],
            gaps: diagnosis.gaps || []
          }
        }
      );
    } catch (error) {
      addMessage(conversationId, "assistant", "文件没有读取成功：" + error.message, {
        kind: "error",
        tone: "warning"
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="chat-shell" data-sidebar-open={sidebarOpen}>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="关闭会话列表"
        onClick={() => setSidebarOpen(false)}
      />
      <ConversationSidebar
        conversations={chatState.conversations}
        activeConversationId={activeConversation.id}
        onNew={createNewChat}
        onSelect={selectConversation}
        onDelete={removeConversation}
        onClose={() => setSidebarOpen(false)}
      />

      <main className={"conversation-stage" + (hasStarted ? " has-messages" : " is-empty")}>
        <ChatHeader
          conversation={activeConversation}
          onMenu={() => setSidebarOpen(true)}
          onNew={createNewChat}
        />

        {!hasStarted ? (
          <WelcomeState
            onPrompt={submitPrompt}
            videoFailed={videoFailed}
            onVideoError={() => setVideoFailed(true)}
          />
        ) : (
          <MessageStream
            conversation={activeConversation}
            pending={pending?.conversationId === activeConversation.id ? pending : null}
            onSelectJob={(job) => selectJob(activeConversation.id, job)}
            endRef={endRef}
          />
        )}

        <ChatComposer
          draft={draft}
          onDraft={setDraft}
          onSubmit={submitPrompt}
          onAttach={() => fileInputRef.current?.click()}
          disabled={Boolean(pending)}
        />
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFile}
          aria-label="上传简历文件"
        />
      </main>
    </div>
  );
}

function ConversationSidebar({ conversations, activeConversationId, onNew, onSelect, onDelete, onClose }) {
  const sorted = [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return (
    <aside className="conversation-sidebar" aria-label="聊天记录">
      <div className="sidebar-brand">
        <div className="brand-glyph"><Sparkles size={16} /></div>
        <div><strong>Resume Protocol</strong><span>Career Agent</span></div>
        <button type="button" onClick={onClose} className="sidebar-close" aria-label="关闭会话列表"><X size={18} /></button>
      </div>
      <button className="new-chat-button" type="button" onClick={onNew}>
        <Plus size={17} />新对话
      </button>
      <div className="history-label"><span>聊天记录</span><span>{conversations.length}</span></div>
      <nav className="conversation-history">
        {sorted.map((conversation) => (
          <div key={conversation.id} className={"history-row" + (conversation.id === activeConversationId ? " active" : "")}>
            <button type="button" className="history-item" onClick={() => onSelect(conversation.id)}>
              <MessageSquareText size={15} />
              <span><strong>{conversation.title}</strong><small>{formatRelativeTime(conversation.updatedAt)}</small></span>
            </button>
            <button
              type="button"
              className="history-delete"
              aria-label={"删除会话 " + conversation.title}
              onClick={(event) => onDelete(event, conversation.id)}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div><span className="status-dot" />本地保存</div>
        <p>聊天与职业上下文仅保存在当前浏览器。</p>
      </div>
    </aside>
  );
}

function ChatHeader({ conversation, onMenu, onNew }) {
  const context = conversation.context;
  const states = [
    ["资料", Boolean(context.profile)],
    ["目标", Boolean(context.selectedJob)],
    ["岗位版", Boolean(context.variant)]
  ];
  return (
    <header className="chat-header">
      <button className="mobile-menu-button" type="button" onClick={onMenu} aria-label="打开聊天记录"><Menu size={19} /></button>
      <div className="header-title">
        <span>Career Agent</span>
        <ChevronDown size={14} />
      </div>
      <div className="context-state" aria-label="当前上下文状态">
        {states.map(([label, ready]) => (
          <span className={ready ? "ready" : ""} key={label}>
            {ready ? <CheckCircle2 size={13} /> : <Circle size={13} />}{label}
          </span>
        ))}
      </div>
      <button className="header-new-chat" type="button" onClick={onNew}><Plus size={16} /><span>新对话</span></button>
    </header>
  );
}

function WelcomeState({ onPrompt, videoFailed, onVideoError }) {
  return (
    <section className={"welcome-state" + (videoFailed ? " video-failed" : "")}>
      <video
        className="welcome-video"
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onCanPlay={(event) => event.currentTarget.play().catch(() => {})}
        onError={onVideoError}
      />
      <div className="welcome-wash" aria-hidden="true" />
      <div className="welcome-content">
        <div className="agent-mark"><Bot size={22} /></div>
        <p className="welcome-kicker">RESUME PROTOCOL / AGENT 01</p>
        <h1>今天想推进哪一步？</h1>
        <p className="welcome-copy">把简历、JD 或目标直接发过来。Agent 会记住当前对话里的资料，并调用对应能力完成任务。</p>
        <div className="quick-prompts">
          {QUICK_PROMPTS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => onPrompt(item.prompt)}>
                <Icon size={18} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MessageStream({ conversation, pending, onSelectJob, endRef }) {
  return (
    <section className="message-scroll" aria-label="对话内容">
      <div className="message-stream" role="log" aria-live="polite">
        {conversation.messages.map((message) => (
          <ChatMessage key={message.id} message={message} context={conversation.context} onSelectJob={onSelectJob} />
        ))}
        {pending ? (
          <div className="message-row assistant pending-message">
            <AgentAvatar />
            <div className="message-body"><LoaderCircle className="spin" size={17} /><span>{pending.label}</span></div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </section>
  );
}

function ChatMessage({ message, context, onSelectJob }) {
  if (message.role === "user") {
    return (
      <div className="message-row user">
        <div className="user-bubble">
          {message.kind === "attachment" ? <FileText size={16} /> : null}
          <p>{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={"message-row assistant " + (message.tone || "")}>
      <AgentAvatar />
      <div className="message-body">
        <p>{message.content}</p>
        <MessageResult message={message} context={context} onSelectJob={onSelectJob} />
      </div>
    </div>
  );
}

function AgentAvatar() {
  return <div className="agent-avatar"><Bot size={16} /></div>;
}

function MessageResult({ message, context, onSelectJob }) {
  const data = message.data || {};
  if (message.kind === "diagnosis") return <DiagnosisResult data={data} />;
  if (message.kind === "jobs") return <JobsResult jobs={data.jobs || []} selectedJob={context.selectedJob} onSelect={onSelectJob} />;
  if (message.kind === "resume") return <ResumeResult variant={data.variant} />;
  if (message.kind === "interview") return <InterviewResult plan={data.plan} />;
  if (message.kind === "target") return <TargetResult job={data.job} />;
  if (message.kind === "error") return <div className="inline-error">上下文已保留，可以重新发送这条指令。</div>;
  return null;
}

function DiagnosisResult({ data }) {
  return (
    <div className="result-card diagnosis-card">
      <header><span>资料诊断</span><strong>{data.completeness || 0}<small>%</small></strong></header>
      <ResultList title="已有优势" items={data.strengths} positive />
      <ResultList title="优先补齐" items={data.gaps} />
    </div>
  );
}

function JobsResult({ jobs, selectedJob, onSelect }) {
  if (!jobs.length) return null;
  return (
    <div className="result-card jobs-card">
      <header><span>岗位候选</span><small>选择后写入当前对话上下文</small></header>
      <div className="job-list">
        {jobs.map((job) => {
          const selected = selectedJob?.id === job.id;
          return (
            <button key={job.id} type="button" className={selected ? "selected" : ""} onClick={() => onSelect(job)}>
              <span className="job-icon"><BriefcaseBusiness size={16} /></span>
              <span className="job-main">
                <strong>{job.title}</strong>
                <small>{job.company || "招聘团队"} · {job.location || "地点待确认"}</small>
              </span>
              <span className="job-score">{job.opportunityScore || job.matchScore || "--"}</span>
              <span className="job-action">{selected ? <><Check size={14} />已选择</> : "选择"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResumeResult({ variant }) {
  if (!variant) return null;
  return (
    <div className="result-card resume-card">
      <header>
        <div><span>岗位版简历</span><h3>{variant.title}</h3></div>
        <strong>{variant.fitScore}<small>/100</small></strong>
      </header>
      <p className="resume-summary">{variant.summary}</p>
      <div className="skill-row">{(variant.skills || []).slice(0, 8).map((skill) => <span key={skill}>{skill}</span>)}</div>
      <div className="project-output">
        {(variant.projects || []).slice(0, 3).map((project, index) => (
          <div key={project}><span>0{index + 1}</span><p>{project}</p></div>
        ))}
      </div>
      <footer><WandSparkles size={14} />已同步生成面试追问</footer>
    </div>
  );
}

function InterviewResult({ plan }) {
  if (!plan) return null;
  return (
    <div className="result-card interview-card">
      <header><span>面试准备</span><small>{plan.roleLabel}</small></header>
      <div className="topic-row">
        {(plan.technicalTopics || []).slice(0, 4).map((topic) => (
          <span key={topic.id}><b>{topic.priority}</b>{topic.title}</span>
        ))}
      </div>
      <div className="interview-columns">
        <section>
          <h3>项目追问</h3>
          {(plan.resumeDefense || []).slice(0, 4).map((question) => <p key={question}>{question}</p>)}
        </section>
        <section>
          <h3>七天节奏</h3>
          {(plan.schedule || []).slice(0, 7).map((item) => (
            <p key={item.day}><b>{item.day}</b><span>{item.title}</span></p>
          ))}
        </section>
      </div>
    </div>
  );
}

function TargetResult({ job }) {
  if (!job) return null;
  return (
    <div className="target-card">
      <span><BriefcaseBusiness size={15} />当前目标</span>
      <strong>{job.company} · {job.title}</strong>
    </div>
  );
}

function ResultList({ title, items = [], positive = false }) {
  const normalizedItems = normalizeResultItems(items);
  if (!normalizedItems.length) return null;
  return (
    <section className={"result-list" + (positive ? " positive" : "")}>
      <h3>{title}</h3>
      {normalizedItems.slice(0, 4).map((item) => <p key={item}><span>{positive ? <Check size={12} /> : "→"}</span>{item}</p>)}
    </section>
  );
}

function ChatComposer({ draft, onDraft, onSubmit, onAttach, disabled }) {
  return (
    <div className="composer-dock">
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="给 Career Agent 发消息"
          aria-label="给 Career Agent 发消息"
          rows={1}
          disabled={disabled}
        />
        <div className="composer-actions">
          <button type="button" onClick={onAttach} aria-label="上传简历"><Paperclip size={18} /></button>
          <span>支持 PDF、Word、TXT</span>
          <button className="send-button" type="submit" disabled={disabled || !draft.trim()} aria-label="发送">
            {disabled ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </form>
      <p>Agent 只基于当前对话中的真实资料生成内容，请在投递前核对事实。</p>
    </div>
  );
}

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "HTTP " + response.status);
  return data;
}

function looksLikeResumeMaterial(value) {
  const text = String(value || "");
  return text.length > 80 && /教育经历|教育背景|项目经历|工作经历|实习经历|技能|GitHub|邮箱|电话/i.test(text);
}

function looksLikeJobDescription(value) {
  const text = String(value || "");
  return text.length > 100 && /岗位职责|岗位要求|职位描述|任职要求|工作内容|我们希望/i.test(text);
}

function createJobFromDescription(description) {
  const firstLine = description.split(/\n/).map((item) => item.trim()).find(Boolean) || "自定义岗位";
  return {
    id: createId("custom-job"),
    company: "自定义 JD",
    title: firstLine.slice(0, 30),
    role: inferRole(description),
    location: "地点待确认",
    description,
    requirements: description.split(/\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
    matchScore: null
  };
}

function inferRole(input = "", job = null) {
  if (job?.role) return job.role;
  const text = String(input || "");
  if (/前端|React|Vue|TypeScript|交互/.test(text)) return "frontend";
  if (/后端|FastAPI|Django|Java|数据库|接口/.test(text)) return "backend";
  if (/产品|需求|PRD|用户研究/.test(text)) return "product";
  if (/运营|增长|内容|转化/.test(text)) return "ops";
  return "ai";
}

function inferJobType(input = "") {
  if (/实习/.test(input)) return "internship";
  if (/社招|社会招聘/.test(input)) return "social";
  return "campus";
}

function formatRelativeTime(value) {
  const time = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " 分钟前";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " 小时前";
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function createId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
