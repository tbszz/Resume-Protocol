const SKILL_BANK = [
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Vue",
  "Vite",
  "Node.js",
  "Express",
  "FastAPI",
  "Django",
  "Flask",
  "Java",
  "Spring",
  "MySQL",
  "PostgreSQL",
  "SQLite",
  "Redis",
  "Docker",
  "Linux",
  "Git",
  "RAG",
  "LLM",
  "Agent",
  "Prompt",
  "OpenAI",
  "LangChain",
  "OCR",
  "Benchmark",
  "Playwright",
  "产品",
  "运营",
  "数据分析",
  "增长",
  "A/B",
  "PRD",
  "Figma"
];

export const ROLE_PROFILES = {
  ai: {
    label: "AI 岗",
    title: "AI Agent / RAG 应用工程师",
    keywords: ["LLM", "RAG", "Agent", "Prompt", "Python", "FastAPI", "Benchmark", "向量检索", "评测"],
    focus: "突出 AI 应用工程化、证据链、模型路由、评测指标和可解释性。",
    missing: ["模型调用链路", "RAG/检索指标", "Prompt 设计", "评测结果", "AI 项目职责"]
  },
  backend: {
    label: "后端",
    title: "Python 后端 / AI 应用后端工程师",
    keywords: ["Python", "FastAPI", "数据库", "接口", "并发", "任务队列", "日志", "缓存"],
    focus: "突出接口设计、数据建模、并发任务、文件处理、安全边界和稳定性。",
    missing: ["接口规模", "数据库设计", "并发/性能指标", "异常处理", "部署环境"]
  },
  frontend: {
    label: "前端",
    title: "React 前端 / AI 产品前端工程师",
    keywords: ["React", "TypeScript", "Vite", "组件", "状态管理", "响应式", "可视化", "交互"],
    focus: "突出复杂控制台、状态流、可视化、响应式布局和 AI 交互体验。",
    missing: ["组件拆分", "复杂状态", "接口联调", "移动端适配", "性能优化"]
  },
  product: {
    label: "产品",
    title: "AI 产品经理 / 产品助理",
    keywords: ["需求分析", "PRD", "原型", "指标", "用户流程", "竞品", "AI 工作流", "验收"],
    focus: "突出需求拆解、用户价值、流程设计、风险控制、指标验证和跨角色协作。",
    missing: ["用户场景", "指标定义", "竞品分析", "验收标准", "上线/复盘结果"]
  },
  ops: {
    label: "运营",
    title: "AI 运营 / 增长运营",
    keywords: ["内容运营", "增长", "数据分析", "转化", "活动", "用户分层", "自动化", "复盘"],
    focus: "突出内容生产、用户触达、转化漏斗、数据复盘和 AI 自动化提效。",
    missing: ["运营指标", "触达渠道", "转化结果", "活动复盘", "用户分层策略"]
  }
};

export const TEMPLATES = {
  ats: {
    label: "ATS 一页版",
    tone: "简洁、关键词密度高、少装饰，适合招聘系统解析。",
    sectionOrder: ["summary", "skills", "projects", "experience", "education", "links"]
  },
  cnTech: {
    label: "中文技术版",
    tone: "突出技术栈、项目职责、结果指标和工程细节。",
    sectionOrder: ["summary", "projects", "skills", "experience", "education", "links"]
  },
  aiResearch: {
    label: "AI 应用版",
    tone: "突出 Agent/RAG/评测/模型路由/业务落地。",
    sectionOrder: ["summary", "aiHighlights", "projects", "skills", "experience", "links"]
  },
  productOps: {
    label: "产品运营版",
    tone: "突出用户问题、流程设计、业务指标和协作结果。",
    sectionOrder: ["summary", "experience", "projects", "skills", "education", "links"]
  }
};

export function parseResumeText(rawText = "") {
  const text = normalize(rawText);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const contact = {
    email: firstMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
    phone: firstMatch(text, /(?:\+?86[-\s]?)?1[3-9]\d{9}/),
    github: firstMatch(text, /https?:\/\/github\.com\/[A-Za-z0-9_.-]+/i),
    website: firstMatch(text, /https?:\/\/(?!github\.com)[^\s，。)）]+/i)
  };
  const name = inferName(lines);
  const skills = extractSkills(text);
  const education = extractSection(lines, ["教育", "学校", "本科", "硕士", "大学", "学院", "专业"], 5);
  const projects = extractProjectBlocks(lines);
  const experience = extractExperienceBlocks(lines, projects);
  const awards = extractSection(lines, ["奖", "证书", "竞赛", "获奖", "排名"], 4);
  const metrics = Array.from(new Set(text.match(/\d+(?:\.\d+)?\s?(?:%|ms|s|秒|分钟|小时|人|个|题|w|万|k|K|倍|次|分)/g) || []));
  const links = [contact.github, contact.website].filter(Boolean);

  const profile = {
    name,
    title: inferTitle(skills, projects, experience),
    contact,
    education,
    skills,
    projects: dedupeStrings(projects.length ? projects : inferProjectBlocksFromLongText(text)),
    experience: dedupeStrings(experience),
    awards,
    metrics: metrics.slice(0, 18),
    links,
    rawLength: text.length,
    sourceConfidence: confidenceScore({ text, skills, projects, experience, education, contact })
  };
  return {
    profile,
    diagnosis: diagnoseProfile(profile),
    roleScores: scoreAllRoles(profile, ""),
    normalizedText: text
  };
}

export function generateVariant({ profile, role = "ai", template = "ats", jd = "" }) {
  const roleProfile = ROLE_PROFILES[role] || ROLE_PROFILES.ai;
  const templateProfile = TEMPLATES[template] || TEMPLATES.ats;
  const roleScore = scoreRole(profile, role, jd);
  const selectedSkills = rankSkills(profile.skills, roleProfile.keywords);
  const selectedProjects = selectProjects(profile.projects, roleProfile.keywords, jd);
  const selectedExperience = selectProjects(profile.experience, roleProfile.keywords, jd);
  const summary = buildSummary(profile, roleProfile, selectedSkills, roleScore);
  const bullets = selectedProjects.map((project) => rewriteBlock(project, roleProfile, profile.metrics));
  const experienceBullets = selectedExperience.map((item) => rewriteBlock(item, roleProfile, profile.metrics));

  return {
    role,
    template,
    roleLabel: roleProfile.label,
    templateLabel: templateProfile.label,
    title: roleProfile.title,
    fitScore: roleScore.score,
    atsScore: Math.min(99, roleScore.score + selectedSkills.length),
    summary,
    skills: selectedSkills.slice(0, 14),
    projects: bullets.slice(0, 4),
    experience: experienceBullets.slice(0, 3),
    education: profile.education,
    links: profile.links,
    greeting: buildGreeting(profile, roleProfile, selectedProjects[0], roleScore),
    strengths: roleScore.strengths,
    gaps: roleScore.gaps,
    templateNotes: templateProfile.tone,
    sectionOrder: templateProfile.sectionOrder,
    diff: buildDiff(profile, roleProfile, selectedSkills)
  };
}

export function createFormalResume({ profile, role = "ai", template = "aiResearch", jd = "" }) {
  const roleProfile = ROLE_PROFILES[role] || ROLE_PROFILES.ai;
  const variant = generateVariant({ profile, role, template, jd });
  const education = profile.education.length ? profile.education.slice(0, 3) : ["教育经历待补充"];
  const projects = normalizeResumeSection(profile.projects, "project").slice(0, 3);
  const experience = normalizeResumeSection(profile.experience, "experience").slice(0, 2);
  const awards = [...profile.awards, ...profile.metrics.map((metric) => `量化结果：${metric}`)].slice(0, 4);

  return normalizeFormalResume({
    name: profile.name,
    targetTitle: roleProfile.title,
    contact: {
      phone: profile.contact.phone,
      email: profile.contact.email,
      github: profile.contact.github,
      website: profile.contact.website,
      location: ""
    },
    summary: compactSentence(variant.summary, 130),
    education,
    skills: variant.skills.slice(0, 16),
    projects: (projects.length ? projects : ["项目经历待补充：建议补充项目背景、职责、技术栈和量化结果。"])
      .map((item) => compactResumeBullet(item, roleProfile, profile.metrics, false)),
    experience: (experience.length ? experience : ["实习/工作经历待补充：可写课程项目、社团协作、个人产品或比赛经历。"])
      .map((item) => compactResumeBullet(item, roleProfile, profile.metrics, true)),
    awards,
    keywords: variant.strengths.slice(0, 6),
    gaps: variant.gaps.slice(0, 5),
    source: "local",
    model: "local-rule-engine",
    templateId: template,
    targetJob: jd
  });
}

export function normalizeFormalResume(candidate = {}, fallback = {}) {
  const base = fallback || {};
  return {
    name: stringOr(candidate.name, base.name || "姓名待补充"),
    targetTitle: stringOr(candidate.targetTitle || candidate.title, base.targetTitle || "目标岗位待补充"),
    contact: {
      phone: stringOr(candidate.contact?.phone, base.contact?.phone || ""),
      email: stringOr(candidate.contact?.email, base.contact?.email || ""),
      github: stringOr(candidate.contact?.github, base.contact?.github || ""),
      website: stringOr(candidate.contact?.website, base.contact?.website || ""),
      location: stringOr(candidate.contact?.location, base.contact?.location || "")
    },
    summary: compactSentence(stringOr(candidate.summary, base.summary || ""), 170),
    education: normalizeStringList(candidate.education, base.education, 3),
    skills: normalizeStringList(candidate.skills, base.skills, 18),
    projects: dedupeBySemantic(normalizeStringList(candidate.projects, base.projects, 4).map((item) => compactSentence(item, 150))),
    experience: dedupeBySemantic(normalizeStringList(candidate.experience, base.experience, 3).map((item) => compactSentence(item, 130))),
    awards: normalizeStringList(candidate.awards, base.awards, 5),
    keywords: normalizeStringList(candidate.keywords, base.keywords, 8),
    gaps: normalizeStringList(candidate.gaps, base.gaps, 6),
    source: stringOr(candidate.source, base.source || "local"),
    model: stringOr(candidate.model, base.model || ""),
    templateId: stringOr(candidate.templateId, base.templateId || ""),
    targetJob: stringOr(candidate.targetJob, base.targetJob || "")
  };
}

export function scoreAllRoles(profile, jd = "") {
  return Object.fromEntries(Object.keys(ROLE_PROFILES).map((role) => [role, scoreRole(profile, role, jd)]));
}

export function scoreJob(job, profile, role = "ai") {
  const jd = [job.title, job.company, job.description, job.tags?.join(" ")].filter(Boolean).join("\n");
  const roleScore = scoreRole(profile, role, jd);
  const text = jd.toLowerCase();
  const blacklistPenalty = /外包|培训|无薪|保险|销售/i.test(jd) ? 18 : 0;
  const schoolBoost = /校招|实习|应届|毕业/i.test(jd) ? 6 : 0;
  const remoteBoost = /远程|remote/i.test(text) ? 2 : 0;
  return Math.max(1, Math.min(99, roleScore.score + schoolBoost + remoteBoost - blacklistPenalty));
}

export function createDemoJobs(profile, role = "ai") {
  const samples = [
    {
      id: "demo-ai-1",
      title: "AI Agent 应用工程师",
      company: "Moonshot AI",
      salary: "20-35K",
      location: "北京",
      description: "负责 LLM Agent、RAG、评测、Prompt 工程和 AI 应用后端。",
      url: "https://www.zhipin.com"
    },
    {
      id: "demo-be-1",
      title: "Python 后端开发工程师",
      company: "字节跳动",
      salary: "18-30K",
      location: "上海",
      description: "负责 FastAPI、数据库、异步任务、日志监控和 AI 工具后端。",
      url: "https://www.zhipin.com"
    },
    {
      id: "demo-pm-1",
      title: "AI 产品实习生",
      company: "腾讯",
      salary: "200-300/天",
      location: "深圳",
      description: "负责 AI 产品需求分析、竞品调研、数据指标、原型设计和项目推进。",
      url: "https://www.zhipin.com"
    }
  ];
  return samples.map((job) => ({ ...job, matchScore: scoreJob(job, profile, role), source: "demo" }));
}

function normalize(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function firstMatch(text, regex) {
  return (text.match(regex) || [])[0] || "";
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function compactSentence(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactResumeBullet(value, roleProfile, metrics, experience = false) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const cleaned = text
    .replace(/针对[^：:。]{0,30}重写[:：]?\s*/g, "")
    .replace(/。?针对[^。]{0,50}。/g, "")
    .replace(/项目经历[:：]?/g, "")
    .replace(/实习\/?工作经历[:：]?/g, "")
    .replace(/实习经历[:：]?/g, "")
    .replace(/工作经历[:：]?/g, "")
    .replace(/当前材料匹配度.*?。/g, "")
    .replace(/所有生成内容均来自原始材料.*?。/g, "")
    .trim();
  const focus = experience ? "实习/工作" : "项目";
  const metric = metrics[0] ? `；量化结果 ${metrics[0]}` : "";
  const lead = cleaned.includes("：") ? cleaned : `${focus}描述：${cleaned}`;
  return compactSentence(`${lead}；聚焦 ${roleProfile.label}${metric}`, 160);
}

function normalizeResumeSection(items, type) {
  const cleaned = (items || [])
    .map((item) => sanitizeResumeSection(item, type))
    .filter(Boolean);
  return dedupeBySemantic(cleaned);
}

function sanitizeResumeSection(item, type) {
  const text = compactSentence(item, 180);
  const lower = text.toLowerCase();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || /@/.test(text) || /\b(?:email|phone|github|wechat)\b/i.test(text) || /邮箱|手机|联系方式|电话|微信|github/i.test(text)) return "";
  if (/^.*?(?:技能|skills?|education|education经历|education:|项目经历|实习经历|工作经历|个人简介)[:：]/i.test(text) && !/项目|系统|平台|agent|rag|实习|工作/i.test(text)) return "";
  if (/^\d{4}[-/.]\d{1,2}/.test(text)) return text;
  if (type === "project") {
    if (/教育|学校|学院|专业|学历|gpa|课程|证书|奖学金|手机号|邮箱|联系方式|个人简介|技能|技术栈|Python|React|FastAPI|SQL|Git|Docker/i.test(text) && !/项目|系统|平台|Agent|RAG|应用|工具|引擎/i.test(text)) return "";
    if (/实习|工作|公司|岗位|任职|intern/i.test(text) && !/项目|系统|平台|agent|rag/i.test(text)) return "";
    if (/[,，/、].{0,20}[,，/、].{0,20}[,，/、]/.test(text) && !/项目|系统|平台|agent|rag/i.test(text)) return "";
    if (/^(?:python|react|fastapi|sql|git|docker|vue|java|go|typescript|llm|rag|agent)(?:[,\s，/、]|$)/i.test(text) && !/项目|系统|平台|agent|rag/i.test(text)) return "";
  }
  if (type === "experience") {
    if (/教育|学校|学院|专业|学历|gpa|课程|证书|奖学金|项目|个人简介|技能|技术栈/i.test(text) && !/公司|岗位|实习|工作|intern/i.test(text)) return "";
    if (/^(?:python|react|fastapi|sql|git|docker|vue|java|go|typescript|llm|rag|agent)(?:[,\s，/、]|$)/i.test(text) && !/公司|岗位|实习|工作|intern/i.test(text)) return "";
  }
  return text;
}

function normalizeStringList(value, fallback = [], limit = 6) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return Array.from(new Set((source || []).flatMap((item) => {
    if (!item) return [];
    if (typeof item === "string") return [item.trim()].filter(Boolean);
    if (typeof item === "object") {
      const parts = [item.name, item.role, item.stack, item.description, ...(item.bullets || [])].filter(Boolean);
      return [parts.join("：").trim()].filter(Boolean);
    }
    return [String(item).trim()].filter(Boolean);
  }))).slice(0, limit);
}

function inferName(lines) {
  const first = lines.find((line) => line.length >= 2 && line.length <= 16 && !/[：:|/@]/.test(line));
  return first || "候选人";
}

function inferTitle(skills, projects, experience) {
  const text = [...skills, ...projects, ...experience].join(" ");
  if (/RAG|LLM|Agent|Prompt/i.test(text)) return "AI 应用工程候选人";
  if (/React|Vue|前端/i.test(text)) return "前端工程候选人";
  if (/FastAPI|Spring|后端|数据库/i.test(text)) return "后端工程候选人";
  if (/产品|PRD|需求/i.test(text)) return "产品候选人";
  if (/运营|增长|活动/i.test(text)) return "运营候选人";
  return "求职候选人";
}

function extractSkills(text) {
  const lower = text.toLowerCase();
  return SKILL_BANK.filter((skill) => lower.includes(skill.toLowerCase()) || text.includes(skill));
}

function extractSection(lines, keys, radius) {
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (keys.some((key) => lines[index].includes(key))) {
      hits.push(...lines.slice(index, index + radius));
    }
  }
  return Array.from(new Set(hits)).slice(0, 8);
}

function extractBlocks(lines, keys) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (keys.some((key) => line.toLowerCase().includes(String(key).toLowerCase()))) {
      blocks.push(lines.slice(index, index + 5).join("；"));
    }
  }
  return Array.from(new Set(blocks)).slice(0, 8);
}

function extractProjectBlocks(lines) {
  return extractBlocks(lines, ["项目", "Project", "Hackathon", "系统", "平台", "Agent", "RAG", "应用", "工具", "引擎"]);
}

function extractExperienceBlocks(lines, projects) {
  const blocks = extractBlocks(lines, ["实习", "工作经历", "工作", "公司", "岗位", "职责", "任职", "Experience", "Intern"]);
  const projectFingerprints = new Set(projects.map(fingerprint));
  return blocks.filter((block) => !projectFingerprints.has(fingerprint(block)) || /实习|公司|岗位|任职|Intern/i.test(block));
}

function inferProjectBlocksFromLongText(text) {
  if (!text) return [];
  return text
    .split(/[。；\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 16)
    .slice(0, 4);
}

function separateProjectsAndExperience(projects, experience) {
  const dedupedProjects = dedupeStrings(projects);
  const projectFingerprints = new Set(dedupedProjects.map(fingerprint));
  const dedupedExperience = dedupeStrings(experience)
    .filter((item) => !projectFingerprints.has(fingerprint(item)) || /实习|公司|岗位|任职|Intern|工作/i.test(item))
    .filter((item) => !dedupedProjects.some((project) => semanticOverlap(project, item) > 0.65));
  return { projects: dedupedProjects, experience: dedupedExperience };
}

function dedupeStrings(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = fingerprint(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function dedupeBySemantic(items) {
  const output = [];
  for (const item of items || []) {
    if (!item) continue;
    if (output.some((existing) => semanticOverlap(existing, item) > 0.72)) continue;
    output.push(item);
  }
  return output;
}

function fingerprint(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 90);
}

function semanticOverlap(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.max(a.size, b.size);
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function confidenceScore({ text, skills, projects, experience, education, contact }) {
  let score = 20;
  if (text.length > 600) score += 18;
  if (skills.length >= 5) score += 18;
  if (projects.length) score += 18;
  if (experience.length) score += 10;
  if (education.length) score += 8;
  if (contact.email || contact.phone) score += 8;
  return Math.min(98, score);
}

function diagnoseProfile(profile) {
  const gaps = [];
  if (!profile.contact.email && !profile.contact.phone) gaps.push("缺少邮箱或手机号，导出简历前需要补充联系方式。");
  if (profile.skills.length < 6) gaps.push("技能栈过少，建议补充语言、框架、数据库、AI 工具和协作工具。");
  if (profile.projects.length < 2) gaps.push("项目经历不足，建议至少补充 2 个能证明能力的项目。");
  if (!profile.metrics.length) gaps.push("缺少量化结果，例如题目数、准确率、耗时、用户数、转化率或效率提升。");
  if (!profile.experience.length) gaps.push("缺少实习/工作经历，可补充课程项目、社团项目或个人产品经历替代。");
  const strengths = [];
  if (/AI|LLM|RAG|Agent/i.test(profile.skills.join(" "))) strengths.push("有 AI 应用关键词，适合包装 AI Agent / RAG 岗位。");
  if (/React|Vue|Vite/i.test(profile.skills.join(" "))) strengths.push("有前端工程栈，可转成 AI 产品前端/控制台方向。");
  if (/FastAPI|Python|SQLite|数据库/i.test(profile.skills.join(" "))) strengths.push("有后端/数据处理基础，可强调工程落地。");
  if (profile.metrics.length) strengths.push("已有可量化指标，适合写成结果导向 bullet。");
  return { gaps, strengths, completeness: profile.sourceConfidence };
}

function scoreRole(profile, role, jd = "") {
  const roleProfile = ROLE_PROFILES[role] || ROLE_PROFILES.ai;
  const corpus = [profile.skills.join(" "), profile.projects.join(" "), profile.experience.join(" "), jd].join(" ");
  const hits = roleProfile.keywords.filter((keyword) => corpus.toLowerCase().includes(keyword.toLowerCase()));
  const score = Math.max(35, Math.min(98, 45 + hits.length * 6 + profile.projects.length * 3 + profile.metrics.length * 1.4));
  return {
    score: Math.round(score),
    hits,
    strengths: hits.length ? hits.map((hit) => `匹配 ${roleProfile.label} 关键词：${hit}`) : [`材料中还没有明显 ${roleProfile.label} 信号。`],
    gaps: roleProfile.missing.filter((item) => !corpus.includes(item.slice(0, 2))).slice(0, 4)
  };
}

function rankSkills(skills, keywords) {
  const exact = skills.filter((skill) => keywords.some((keyword) => skill.toLowerCase().includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(skill.toLowerCase())));
  const rest = skills.filter((skill) => !exact.includes(skill));
  return Array.from(new Set([...exact, ...rest]));
}

function selectProjects(items, keywords, jd) {
  const corpus = `${keywords.join(" ")} ${jd}`.toLowerCase();
  return [...items].sort((a, b) => scoreText(b, corpus) - scoreText(a, corpus));
}

function scoreText(text, corpus) {
  return corpus.split(/\s+/).filter((term) => term && text.toLowerCase().includes(term.toLowerCase())).length;
}

function buildSummary(profile, roleProfile, skills, roleScore) {
  const topSkills = skills.slice(0, 5).join("、") || "业务分析、项目交付";
  return `${profile.name}，${profile.title}。面向${roleProfile.label}，重点突出${roleProfile.focus} 当前材料匹配度 ${roleScore.score}，核心能力包括 ${topSkills}。`;
}

function rewriteBlock(block, roleProfile, metrics) {
  const metric = metrics[0] ? `，结果包含 ${metrics[0]} 等可量化指标` : "";
  return `${block}。针对${roleProfile.label}重写：${roleProfile.focus}${metric}。`;
}

function buildGreeting(profile, roleProfile, project, score) {
  const projectHint = project ? `我最近的相关项目包括：${project.slice(0, 80)}。` : "";
  return `您好，我想投递${roleProfile.title}。我的经历与岗位匹配度约 ${score.score}/100，${projectHint}如果方便，希望进一步沟通岗位要求。`;
}

function buildDiff(profile, roleProfile, skills) {
  return [
    `技能顺序调整：优先展示 ${skills.slice(0, 5).join(" / ") || "岗位关键词"}`,
    `叙事重心调整：${roleProfile.focus}`,
    `风险提示：所有生成内容均来自原始材料，缺口信息需要用户补充后再写入简历。`
  ];
}
