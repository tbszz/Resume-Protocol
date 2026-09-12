import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  PanelLeft,
  PanelRight,
  ChevronRight,
  Download,
  FileText,
  Folder,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sun,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  importLocalConversations,
  requestJson,
  streamConversationMessage,
  validateResumeFile
} from "./api.js";
import "./styles.css";
import { readableDocumentName } from './documentName.js';
const WorkspaceChat = React.lazy(() => import('./components/WorkspaceChat.jsx').then(module => ({ default: module.WorkspaceChat })));

const LANDING_VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_112512_f3b7a972-83dd-4401-9c4b-f08d3733f5ca.mp4";
const THEME_STORAGE_KEY = "resume-protocol.theme";
const QUICK_PROMPTS = ["诊断这份简历", "匹配目标岗位", "生成优化稿", "准备面试追问"];
const AUTH_ENDPOINTS = {
  login: "/api/auth/login",
  register: "/api/auth/register"
};

function App() {
  const [view, setView] = useState(() => window.location.hash === "#workspace" ? "workspace" : "landing");
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [modelSettings, setModelSettings] = useState({ mode: "default", protocol: "openai", baseUrl: "", model: "", hasApiKey: false });
  const [authMode, setAuthMode] = useState("login");
  const [authVisible, setAuthVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [projectEditor, setProjectEditor] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    const onKey = (event) => {
      if (view !== 'workspace') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (window.matchMedia('(max-width: 860px)').matches) setSidebarOpen(value=>!value);
        else setSidebarCollapsed(value=>!value);
      }
      if (event.key === 'Escape') { setPanelOpen(false); setSidebarOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(() => readStoredTheme());
  const fileInputRef = useRef(null);
  const activeConversationRef = useRef('');
  const actionLockRef = useRef(false);
  const streamControllerRef = useRef(null);
  const sessionRef = useRef(0);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || projects[0] || null,
    [activeProjectId, projects]
  );
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || conversations[0] || null,
    [activeConversationId, conversations]
  );
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) || documents[0] || null,
    [activeDocumentId, documents]
  );
  const annotations = activeConversation?.context?.annotations || [];
  activeConversationRef.current = activeConversation?.id || '';
  const resumeVariant = activeConversation?.context?.variant || activeConversation?.context?.formalResume || null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        const [me, settings] = await Promise.all([
          requestJson("/api/auth/me"),
          requestJson("/api/model-settings").catch(() => ({ settings: modelSettings }))
        ]);
        if (!alive) return;
        setUser(me.user || null);
        setModelSettings(settings.settings || modelSettings);
        if (me.user) {
          await loadWorkspace(alive);
          if (window.location.hash === "#workspace") setView("workspace");
        }
      } catch (error) {
        if (alive) setNotice(error.message);
      } finally {
        if (alive) setBooting(false);
      }
    }
    boot();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!activeConversation?.id) {
      setDocuments([]);
      return;
    }
    setDocuments([]);
    refreshDocuments(activeConversation.id);
  }, [activeConversation?.id]);

  async function loadWorkspace(alive = true) {
    const [projectResult, conversationResult] = await Promise.all([
      requestJson("/api/projects"),
      requestJson("/api/conversations")
    ]);
    if (!alive) return;
    const nextProjects = projectResult.projects || [];
    const nextConversations = conversationResult.conversations || [];
    setProjects(nextProjects);
    setConversations(nextConversations);
    setActiveProjectId((current) => nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id || "");
    setActiveConversationId((current) => nextConversations.some((conversation) => conversation.id === current) ? current : nextConversations[0]?.id || "");
  }

  async function refreshDocuments(conversationId) {
    try {
      const result = await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}/documents`);
      if (activeConversationRef.current !== conversationId) return;
      const next = (result.documents || []).map(doc=>({...doc,name:readableDocumentName(doc.name)}));
      setDocuments(next);
      setActiveDocumentId((current) => next.some((document) => document.id === current) ? current : next[0]?.id || "");
    } catch {
      if (activeConversationRef.current !== conversationId) return;
      setDocuments([]);
      setActiveDocumentId("");
    }
  }

  function enterWorkspace() {
    if (!user) {
      setAuthMode("login");
      setAuthVisible(true);
      setNotice("登录后进入工作区，简历和对话会保存到你的账户。");
      return;
    }
    window.location.hash = "workspace";
    setView("workspace");
  }

  async function submitAuth(event) {
    event.preventDefault();
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || "")
    };
    if (authMode === "register") payload.name = String(form.get("name") || "").trim();
    if (authMode === "register" && payload.password.length < 10) {
      setNotice("密码至少需要 10 位。");
      return;
    }
    try {
      const result = await requestJson(AUTH_ENDPOINTS[authMode], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setUser(result.user);
      setAuthVisible(false);
      await loadWorkspace();
      window.location.hash = "workspace";
      setView("workspace");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function logout() {
    sessionRef.current += 1;
    streamControllerRef.current?.abort();
    actionLockRef.current = false;
    setPending(null);
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      setUser(null);
      setProjects([]);
      setConversations([]);
      setDocuments([]);
      setActiveProjectId("");
      setActiveConversationId("");
      setActiveDocumentId("");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setView("landing");
      setNotice("");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function saveProjectName(event) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) {
      setNotice("请输入项目名称。");
      return;
    }
    try {
      if (projectEditor?.project?.id) {
        const result = await requestJson(`/api/projects/${encodeURIComponent(projectEditor.project.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item));
      } else {
        const result = await requestJson("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        setProjects((current) => [result.project, ...current]);
        setActiveProjectId(result.project.id);
      }
      setProjectEditor(null);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteProject(projectId) {
    try {
      await requestJson(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
      const remaining = projects.filter((project) => project.id !== projectId);
      setProjects(remaining);
      setActiveProjectId(remaining[0]?.id || "");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function createConversation() {
    if (!user) {
      setAuthMode("login");
      setAuthVisible(true);
      return null;
    }
    try {
      const result = await requestJson("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject?.id || activeProjectId || null })
      });
      setConversations((current) => [result.conversation, ...current]);
      setActiveConversationId(result.conversation.id);
      setSidebarOpen(false);
      return result.conversation;
    } catch (error) {
      setNotice(error.message);
      return null;
    }
  }

  async function patchConversation(conversationId, patch) {
    try {
      const result = await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      replaceConversation(result.conversation);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteConversation(conversationId) {
    try {
      await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
      const remaining = conversations.filter((item) => item.id !== conversationId);
      setConversations(remaining);
      if (activeConversationId === conversationId) setActiveConversationId(remaining[0]?.id || "");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function ensureConversation() {
    if (activeConversation) return activeConversation;
    return createConversation();
  }

  async function submitPrompt(nextPrompt = '') {
    const content = String(nextPrompt || "").trim();
    if (!content || pending || actionLockRef.current) return;
    if (!user) {
      setAuthMode("login");
      setAuthVisible(true);
      return;
    }
    actionLockRef.current = true;
    const session = sessionRef.current;
    const controller = new AbortController();
    streamControllerRef.current = controller;
    setNotice("");
    let conversation;
    let errorConversationReconciled = false;
    try {
      conversation = await ensureConversation();
      if (!conversation || session !== sessionRef.current) return;
      appendLocalMessage(conversation.id, {
        id: `local-${Date.now()}`,
        role: "user",
        content,
        kind: "text",
        createdAt: new Date().toISOString()
      });
      setPending({ conversationId: conversation.id, label: "正在分析资料" });
      const done = await streamConversationMessage(conversation.id, content, {
        signal: controller.signal,
        onEvent: (event) => {
          if (session !== sessionRef.current) return;
          if (event.type === "status") setPending({ conversationId: conversation.id, label: event.label, tool: event.tool });
          if (event.type === "message") appendLocalMessage(conversation.id, scrubAssistantMessage(event.message));
          if (event.type === "done" && event.conversation) replaceConversation(scrubConversation(event.conversation));
          if (event.type === "error" && event.conversation) {
            errorConversationReconciled = true;
            replaceConversation(scrubConversation(event.conversation));
          }
        }
      });
      if (done && session === sessionRef.current) replaceConversation(scrubConversation(done));
      if (conversation.id) refreshDocuments(conversation.id);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (conversation && !errorConversationReconciled) {
        appendLocalMessage(conversation.id, {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "这一步没有完成：" + error.message,
          kind: "error",
          tone: "warning",
          createdAt: new Date().toISOString()
        });
      } else {
        setNotice(error.message);
      }
    } finally {
      if (streamControllerRef.current === controller) streamControllerRef.current = null;
      actionLockRef.current = false;
      if (session === sessionRef.current) setPending(null);
    }
  }

  async function cancelPrompt() {
    const conversationId = pending?.conversationId;
    streamControllerRef.current?.abort();
    if (!conversationId) return;
    setNotice('已停止生成，已完成的内容仍保留。');
    try {
      const result = await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}`);
      if (result.conversation) replaceConversation(scrubConversation(result.conversation));
    } catch { /* The local transcript remains available if reconciliation fails. */ }
  }

  async function selectJob(job) {
    if (pending || actionLockRef.current) return;
    if (!activeConversation) return;
    try {
      const result = await requestJson(`/api/conversations/${encodeURIComponent(activeConversation.id)}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedJob: job })
      });
      replaceConversation(scrubConversation(result.conversation));
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (pending || actionLockRef.current || !file) return;
    const validation = validateResumeFile(file);
    if (!validation.ok) {
      setNotice(validation.error);
      return;
    }
    if (!user) {
      setAuthMode("login");
      setAuthVisible(true);
      return;
    }
    actionLockRef.current = true;
    const session = sessionRef.current;
    let conversation;
    try {
      conversation = await ensureConversation();
      if (!conversation || session !== sessionRef.current) return;
      const form = new FormData();
      form.append("file", file);
      setPending({ conversationId: conversation.id, label: "正在读取 " + file.name });
      const result = await requestJson(`/api/conversations/${encodeURIComponent(conversation.id)}/documents`, {
        method: "POST",
        body: form,
        timeoutMs: 250_000
      });
      if (session === sessionRef.current) {
        replaceConversation(scrubConversation(result.conversation));
        await refreshDocuments(conversation.id);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      actionLockRef.current = false;
      if (session === sessionRef.current) setPending(null);
    }
  }

  async function importLegacy() {
    try {
      const result = await importLocalConversations(window.localStorage, requestJson);
      await loadWorkspace();
      const count = result.count ?? result.imported ?? 0;
      setNotice(count ? `已导入 ${count} 条旧会话。` : "没有找到可导入的旧本地会话。");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = form.get("mode") === "custom" ? "custom" : "default";
    const payload = { mode };
    if (mode === "custom") {
      payload.protocol = form.get("protocol");
      payload.baseUrl = String(form.get("baseUrl") || "").trim();
      payload.model = String(form.get("model") || "").trim();
      const apiKey = String(form.get("apiKey") || "").trim();
      if (apiKey) payload.apiKey = apiKey;
    }
    try {
      const result = await requestJson("/api/model-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setModelSettings(result.settings);
      setSettingsVisible(false);
      setNotice("模型设置已保存。");
    } catch (error) {
      setNotice(error.message);
    }
  }

  function appendLocalMessage(conversationId, message) {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, messages: [...(conversation.messages || []), message], updatedAt: message.createdAt || conversation.updatedAt }
        : conversation
    )));
  }

  function replaceConversation(conversation) {
    setConversations((current) => {
      const exists = current.some((item) => item.id === conversation.id);
      return exists
        ? current.map((item) => item.id === conversation.id ? conversation : item)
        : [conversation, ...current];
    });
  }

  if (view === "landing") {
    return (
      <>
        <LandingPage
          booting={booting}
          user={user}
          onLogin={() => { setAuthMode("login"); setAuthVisible(true); }}
          onRegister={() => { setAuthMode("register"); setAuthVisible(true); }}
          onStart={enterWorkspace}
        />
        <AuthPanel
          mode={authMode}
          visible={authVisible}
          notice={notice}
          onMode={setAuthMode}
          onClose={() => setAuthVisible(false)}
          onSubmit={submitAuth}
        />
      </>
    );
  }

  return (
    <div className="workspace-shell aui-workspace" data-theme={theme} data-sidebar-open={sidebarOpen} data-panel-open={panelOpen} data-sidebar-collapsed={sidebarCollapsed}>
      <MobileBar
        theme={theme}
        onMenu={() => setSidebarOpen(true)}
        onPanel={() => setPanelOpen(true)}
        onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <ProjectSidebar
        user={user}
        projects={projects}
        activeProjectId={activeProject?.id || ""}
        conversations={conversations}
        activeConversationId={activeConversation?.id || ""}
        collapsed={sidebarCollapsed}
        notice={notice}
        onCollapse={() => setSidebarCollapsed((value) => !value)}
        onProject={setActiveProjectId}
        onCreateProject={() => setProjectEditor({ project: null })}
        onRenameProject={(project) => setProjectEditor({ project })}
        onDeleteProject={deleteProject}
        onNewConversation={createConversation}
        onSelectConversation={(id) => { setActiveConversationId(id); setSidebarOpen(false); }}
        onMoveConversation={(conversationId, projectId) => patchConversation(conversationId, { projectId })}
        onDeleteConversation={deleteConversation}
        onImport={importLegacy}
        onSettings={() => setSettingsVisible(true)}
        onLogout={logout}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="workspace-chat">
        <ChatHeader
          onSidebar={() => setSidebarCollapsed(value=>!value)}
          onPanel={() => setPanelOpen(value=>!value)}
          panelOpen={panelOpen}
          project={activeProject}
          conversation={activeConversation}
          theme={theme}
          onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onTitle={(title) => activeConversation && patchConversation(activeConversation.id, { title })}
        />
        <React.Suspense fallback={<div role="status">正在打开工作区…</div>}><WorkspaceChat
          key={activeConversation?.id || 'new'}
          conversation={activeConversation}
          documents={documents}
          pending={pending?.conversationId === activeConversation?.id ? pending : null}
          busy={Boolean(pending)}
          canCancel={Boolean(pending?.conversationId === activeConversation?.id && streamControllerRef.current)}
          onSend={submitPrompt}
          onCancel={cancelPrompt}
          onAttach={() => fileInputRef.current?.click()}
          onSelectJob={selectJob}
          onOpenPreview={() => setPanelOpen(true)}
          renderAttachment={(message, items) => <AttachmentStatus message={message} documents={items} />}
          scrubMessage={scrubAssistantMessage}
          notice={notice}
          onDismissNotice={() => setNotice('')}
        /></React.Suspense>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".pdf,.docx,.txt,.md,.json"
          disabled={Boolean(pending)}
          onChange={handleFile}
          aria-label="上传简历文件"
        />
      </main>
      {panelOpen && <EvidencePanel
        conversation={activeConversation}
        documents={documents}
        activeDocument={activeDocument}
        annotations={annotations}
        variant={resumeVariant}
        onDocument={setActiveDocumentId}
        onClose={() => setPanelOpen(false)}
        onPrompt={submitPrompt}
      />}
      <SettingsPanel
        visible={settingsVisible}
        settings={modelSettings}
        onClose={() => setSettingsVisible(false)}
        onSubmit={saveSettings}
      />
      <ProjectEditor
        editor={projectEditor}
        onClose={() => setProjectEditor(null)}
        onSubmit={saveProjectName}
      />
    </div>
  );
}

function LandingPage({ booting, user, onLogin, onRegister, onStart }) {
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-logo">Resume Protocol<sup>®</sup></div>
        <div className="landing-links">
          <a href="#home">首页</a>
          <button type="button" onClick={onStart}>工作区</button>
          <a href="#how-it-works">使用方法</a>
        </div>
        <div className="landing-actions">
          {user ? <button type="button" onClick={onStart}>Enter Workspace</button> : <><button type="button" onClick={onLogin}>登录</button><button type="button" onClick={onRegister}>注册</button></>}
        </div>
      </nav>
      <section className="landing-hero" id="home">
        <video
          className="landing-video"
          src={LANDING_VIDEO_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          loop={false}
          onEnded={(event) => event.currentTarget.pause()}
          aria-hidden="true"
        />
        <div className="landing-copy">
          <h1>Build resumes,<br />prove the work.</h1>
          <p>把真实经历整理成可信证据，再生成面向岗位的简历、批注和面试准备。</p>
          <button type="button" onClick={onStart}>{booting ? "Loading" : "Get Started"}</button>
        </div>
      </section>
      <section className="landing-info" id="how-it-works" aria-label="How Resume Protocol helps">
        <div className="info-copy">
          <div>
            <span>How do we help?</span>
            <h2>Evidence that<br />moves forward</h2>
          </div>
          <p>Resume Protocol 把简历、岗位和对话放在同一个工作区。每一次改写都连接原始资料、AI 证据批注和可下载优化稿。</p>
        </div>
        <div className="info-divider" />
        <div className="info-pills">
          {["Resume Diagnosis", "Job Alignment", "Interview Proof"].map((label, index) => (
            <button key={label} type="button"><span>{String(index + 1).padStart(2, "0")}</span><b>/</b>{label}<ChevronRight size={16} /></button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MobileBar({ theme, onMenu, onPanel, onTheme }) {
  return (
    <header className="mobile-bar">
      <button type="button" onClick={onMenu} aria-label="打开项目目录"><Menu size={19} /></button>
      <strong>Resume Protocol</strong>
      <button type="button" onClick={onTheme} className="theme-toggle" aria-label="切换亮暗模式">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      <button type="button" onClick={onPanel} aria-label="打开证据面板"><FileText size={18} /></button>
    </header>
  );
}

function ProjectSidebar({
  user,
  projects,
  activeProjectId,
  conversations,
  activeConversationId,
  collapsed,
  notice,
  onCollapse,
  onProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onNewConversation,
  onSelectConversation,
  onMoveConversation,
  onDeleteConversation,
  onImport,
  onSettings,
  onLogout,
  onClose
}) {
  const activeConversations = conversations.filter((conversation) => !activeProjectId || conversation.projectId === activeProjectId);
  return (
    <>
      <button className="mobile-drawer sidebar-drawer" type="button" aria-label="关闭项目目录" onClick={onClose} />
      <aside className="project-sidebar">
        <header>
          <button type="button" onClick={onCollapse} aria-label={collapsed ? "展开项目目录" : "收起项目目录"}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>
          <strong>Resume Protocol</strong>
          <button type="button" onClick={onClose} className="drawer-close" aria-label="关闭项目目录"><X size={18} /></button>
        </header>
        <button className="primary-action" type="button" onClick={onNewConversation}><Plus size={17} /><span>新会话</span></button>
        <section className="sidebar-section">
          <div className="section-title"><span>项目</span><button type="button" onClick={onCreateProject} aria-label="新建项目"><Plus size={14} /></button></div>
          <div className="project-list">
            {projects.map((project) => (
              <div key={project.id} className={"project-row" + (project.id === activeProjectId ? " active" : "")}>
                <button type="button" onClick={() => onProject(project.id)}><Folder size={15} /><span>{project.name || "未命名项目"}</span></button>
                <button type="button" onClick={() => onRenameProject(project)} aria-label="重命名项目"><Settings size={13} /></button>
                <button type="button" onClick={() => onDeleteProject(project.id)} aria-label="删除项目"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </section>
        <section className="sidebar-section conversation-tree">
          <div className="section-title"><span>会话</span></div>
          {activeConversations.map((conversation) => (
            <div key={conversation.id} className={"conversation-row" + (conversation.id === activeConversationId ? " active" : "")}>
              <button type="button" onClick={() => onSelectConversation(conversation.id)}>
                <MessageSquareText size={15} />
                <span>{conversation.title || "新会话"}</span>
              </button>
              {projects.length > 0 && <select value={conversation.projectId || ""} onChange={(event) => onMoveConversation(conversation.id, event.target.value || null)} aria-label="移动会话到项目">
                <option value="">未归档</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>}
              <button type="button" onClick={() => onDeleteConversation(conversation.id)} aria-label="删除会话"><Trash2 size={13} /></button>
            </div>
          ))}
        </section>
        {notice ? <p className="sidebar-notice">{notice}</p> : null}
        <footer>
          <button type="button" onClick={onImport}><Upload size={15} /><span>导入旧记录</span></button>
          <button type="button" onClick={onSettings}><Settings size={15} /><span>设置</span></button>
          <button type="button" onClick={onLogout}><LogOut size={15} /><span>{user?.name || user?.email || "账户"}</span></button>
        </footer>
      </aside>
    </>
  );
}

function ChatHeader({ project, conversation, theme, onTheme, onTitle, onSidebar, onPanel, panelOpen }) {
  const [titleDraft, setTitleDraft] = useState(conversation?.title || "新会话");
  useEffect(() => {
    setTitleDraft(conversation?.title || "新会话");
  }, [conversation?.id, conversation?.title]);
  function commitTitle() {
    const title = titleDraft.trim();
    if (conversation && title && title !== conversation.title) onTitle(title);
  }
  return (
    <header className="chat-header">
      <button type="button" className="header-icon" onClick={onSidebar} aria-label="切换项目目录" title="切换项目目录 (Ctrl+B)"><PanelLeft size={19}/></button>
      <div>
        <span>{project?.name || "未归档项目"}</span>
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          aria-label="会话标题"
          disabled={!conversation}
        />
      </div>
      <nav className="chat-tools">
        <button type="button" className="header-icon" onClick={onTheme} aria-label={theme === 'dark' ? '亮色' : '暗色'} title="切换亮暗模式">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button type="button" className="header-icon" onClick={onPanel} aria-label="打开简历预览" aria-expanded={panelOpen} title="简历预览"><PanelRight size={19}/></button>
      </nav>
    </header>
  );
}

function AttachmentStatus({ message, documents = [] }) {
  const fileName = message.data?.filename || "上传文件";
  const documentId = message.data?.documentId;
  const documentStatus = documents.find((document) => document.id === documentId)?.parseStatus;
  const parseStatus = message.data?.parseStatus || message.data?.status || documentStatus || null;
  const state = parseStatus?.status || "unknown";
  return (
    <section className={`attachment-status ${state}`} aria-label="上传文件状态">
      <div className="attachment-icon"><FileText size={16} /></div>
      <div>
        <strong>{fileName}</strong>
        <p>{attachmentStatusText(parseStatus)}</p>
      </div>
      <span className="attachment-chip">{attachmentStatusBadge(state)}</span>
      <a className="document-link" href={`/api/documents/${encodeURIComponent(documentId)}`}><Download size={14} />原文件</a>
    </section>
  );
}

function attachmentStatusText(status) {
  if (status?.message) return status.message;
  if (status?.status === "parsed") return "文件已保存，并读取到可用于后续诊断的简历原文。";
  if (status?.status === "needs_review") return "文件已保存，但读取结果需要核对；未核对前不会展示能力结论。";
  if (status?.status === "unreadable") return "文件已保存，但没有读取到可用文本；不会覆盖已有有效资料。";
  return "文件已保存。正在等待读取结果；未读取前不会生成完整度或能力结论。";
}

function attachmentStatusBadge(status) {
  if (status === "parsed") return "已读取";
  if (status === "needs_review") return "待核对";
  if (status === "unreadable") return "未读取";
  return "待读取";
}

function EvidencePanel({ conversation, documents, activeDocument, annotations, variant, onDocument, onClose, onPrompt }) {
  const hasAnnotations = annotations.length > 0;
  const previewUrl = activeDocument
    ? hasAnnotations
      ? `/api/documents/${encodeURIComponent(activeDocument.id)}/annotated.pdf?inline=1`
      : `/api/documents/${encodeURIComponent(activeDocument.id)}?inline=1`
    : "";
  const annotatedDownloadUrl = activeDocument ? `/api/documents/${encodeURIComponent(activeDocument.id)}/annotated.pdf` : "";
  return (
    <>
    <button className="mobile-drawer panel-drawer" type="button" aria-label="关闭证据面板" onClick={onClose} />
    <aside className="evidence-panel">
      <header>
        <div>
          <span>Evidence</span>
          <strong>原文与优化稿</strong>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭证据面板"><X size={18} /></button>
      </header>
      <section className="document-tabs">
        {documents.map((document) => (
          <button key={document.id} type="button" className={document.id === activeDocument?.id ? "active" : ""} onClick={() => onDocument(document.id)}>
            <FileText size={15} />{document.name}
          </button>
        ))}
      </section>
      {annotatedDownloadUrl && hasAnnotations ? (
        <a className="annotated-download" href={annotatedDownloadUrl}><Download size={14} />下载批注版 PDF</a>
      ) : null}
      <section className="pdf-preview">
        {previewUrl ? <iframe title={hasAnnotations ? "AI 批注 PDF 预览" : "原文件预览"} src={previewUrl} /> : <div><FileText size={28} /><p>上传简历后，这里显示原文和 AI 高亮批注。</p></div>}
      </section>
      <section className="annotation-list">
        <h3>AI 证据批注</h3>
        {annotations.length ? annotations.map((item) => <AnnotationCard key={item.id || item.quote} item={item} />) : <div className="panel-empty"><p>还没有批注。先分析简历，我会把问题定位到原文证据。</p><button type="button" onClick={() => onPrompt("分析这份简历")}>分析这份简历</button></div>}
      </section>
      <section className="variant-preview">
        <div className="panel-title"><h3>优化稿</h3>{variant?.name ? <ResumeDownloads conversation={conversation} /> : null}</div>
        {variant?.name ? <ResumePreview variant={variant} /> : <div className="panel-empty"><p>生成优化稿后，这里会显示 PDF 和 DOCX 下载。</p><button type="button" onClick={() => onPrompt("生成优化稿")}>生成优化稿</button></div>}
      </section>
    </aside>
    </>
  );
}

function AnnotationCard({ item }) {
  return (
    <article className={"annotation-card " + (item.severity || "medium")}>
      <span className="annotation-source">{item.source === "rule" ? "基础检查" : "AI 批注"}</span>
      <blockquote>{item.quote}</blockquote>
      <strong>{item.issue}</strong>
      <p>{item.suggestion}</p>
      <small>{[item.section, item.reason].filter(Boolean).join(" · ")}</small>
    </article>
  );
}

function ResumeDownloads({ conversation }) {
  if (!conversation) return null;
  const base = `/api/conversations/${encodeURIComponent(conversation.id)}`;
  return (
    <div className="resume-downloads">
      <a href={`${base}/resume.pdf`}><Download size={14} />PDF</a>
      <a href={`${base}/resume.docx`}><Download size={14} />DOCX</a>
    </div>
  );
}

function ResumePreview({ variant }) {
  const sections = [
    ["教育经历", variant.education],
    ["技能", variant.skills],
    ["项目经历", variant.projects],
    ["工作与实习经历", variant.experience],
    ["荣誉", variant.awards]
  ];
  return (
    <article className="resume-preview">
      <h2>{variant.name || "个人简历"}</h2>
      <p>{[variant.targetTitle || variant.title, ...Object.values(variant.contact || {}).filter(Boolean)].filter(Boolean).join(" · ")}</p>
      <p>{variant.summary}</p>
      {sections.filter(([, items]) => items?.length).map(([title, items]) => (
        <section key={title}>
          <h4>{title}</h4>
          {items.map((item) => <p key={item}>{item}</p>)}
        </section>
      ))}
    </article>
  );
}

function SettingsPanel({ visible, settings, onClose, onSubmit }) {
  const [mode, setMode] = useState(settings.mode || "default");
  useEffect(() => {
    if (visible) setMode(settings.mode || "default");
  }, [visible, settings.mode]);
  if (!visible) return null;
  return (
    <div className="settings-layer" role="dialog" aria-modal="true" aria-label="设置">
      <form className="settings-panel" onSubmit={onSubmit}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭设置"><X size={18} /></button>
        <h2>模型设置</h2>
        <label>模式<select name="mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="default">默认</option><option value="custom">自定义</option></select></label>
        {mode === "default" ? <p className="settings-note">使用系统提供的模型，无需配置。</p> : (
          <div className="custom-settings">
            <label>协议<select name="protocol" defaultValue={settings.protocol}><option value="openai">OpenAI compatible</option><option value="anthropic">Anthropic</option></select></label>
            <label>Base URL<input name="baseUrl" defaultValue={settings.baseUrl || ""} placeholder="https://api.example.com/v1" /></label>
            <label>模型<input name="model" defaultValue={settings.model || ""} placeholder="model name" /></label>
            <label>API Key<input name="apiKey" type="password" placeholder={settings.hasApiKey ? "留空保留已有密钥" : "粘贴密钥"} /></label>
          </div>
        )}
        <button type="submit">保存设置</button>
      </form>
    </div>
  );
}

function ProjectEditor({ editor, onClose, onSubmit }) {
  if (!editor) return null;
  const project = editor.project;
  return (
    <div className="settings-layer" role="dialog" aria-modal="true" aria-label="项目命名">
      <form className="settings-panel project-editor" onSubmit={onSubmit}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭项目命名"><X size={18} /></button>
        <h2>{project ? "重命名项目" : "新建项目"}</h2>
        <label>项目名称<input name="name" defaultValue={project?.name || ""} placeholder="例如：秋招 AI Agent 岗位" autoFocus required /></label>
        <button type="submit">{project ? "保存名称" : "创建项目"}</button>
      </form>
    </div>
  );
}

function AuthPanel({ mode, visible, notice, onMode, onClose, onSubmit }) {
  if (!visible) return null;
  return (
    <div className="auth-layer" role="dialog" aria-modal="true" aria-label={mode === "login" ? "登录" : "注册"}>
      <form className="auth-panel" onSubmit={onSubmit}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <h2>{mode === "login" ? "登录" : "注册"}</h2>
        {mode === "register" ? <label>姓名<input name="name" autoComplete="name" required /></label> : null}
        <label>邮箱<input name="email" type="email" autoComplete="email" required /></label>
        <label>密码<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : undefined} required /></label>
        {notice ? <p role="alert">{notice}</p> : null}
        <button type="submit">{mode === "login" ? "登录" : "注册"}</button>
        <button type="button" className="text-button" onClick={() => onMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "创建新账户" : "已有账户，去登录"}
        </button>
      </form>
    </div>
  );
}

function scrubConversation(conversation) {
  return {
    ...conversation,
    title: readableDocumentName(conversation.title),
    messages: (conversation.messages || []).map(scrubAssistantMessage)
  };
}

function scrubAssistantMessage(message) {
  if (message.kind === 'attachment' && message.data?.filename) {
    const filename = readableDocumentName(message.data.filename);
    return {...message,data:{...message.data,filename},content:String(message.content || '').replace(message.data.filename,filename)};
  }
  if (message.role !== "assistant") return message;
  return { ...message, content: scrubBrand(message.content) };
}

function scrubBrand(value = "") {
  const vendorName = ["Mini", "Max"].join("");
  return String(value)
    .replace(new RegExp(vendorName, "gi"), "模型")
    .replace(/M2\.7/gi, "默认模型");
}

function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "light";
  } catch {
    return "light";
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
