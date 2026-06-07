import { normalizeFormalResume } from "./resumeEngine.js";

const DEFAULT_BASE_URL = "https://api.minimax.io/anthropic";
const DEFAULT_MODEL = "MiniMax-M2.7";

export function getMiniMaxStatus() {
  return {
    configured: Boolean(resolveApiKey()),
    baseUrl: resolveBaseUrl(),
    model: resolveModel()
  };
}

export async function synthesizeFormalResumeWithMiniMax({ profile, localResume, role, template, jd, rawText }) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return { resume: { ...localResume, source: "local", model: "local-rule-engine" }, usedAI: false, reason: "missing_api_key" };
  }

  const response = await fetch(resolveMessagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify({
      model: resolveModel(),
      max_tokens: 1800,
      temperature: 0.3,
      system: "你是严谨的中文简历顾问。只根据用户提供的材料写简历，不编造学校、公司、奖项、年份或指标。必须区分实习/工作经历和项目经历，不要把同一个项目重复写两遍。输出必须是可解析 JSON。",
      messages: [
        {
          role: "user",
          content: buildPrompt({ profile, localResume, role, template, jd, rawText })
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.base_resp?.status_msg || `MiniMax HTTP ${response.status}`;
    throw new Error(message);
  }

  const text = extractText(data);
  const parsed = parseJsonObject(text);
  return {
    resume: normalizeFormalResume({ ...parsed, source: "ai", model: resolveModel() }, localResume),
    usedAI: true,
    rawModelText: text
  };
}

function resolveApiKey() {
  return process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

function resolveBaseUrl() {
  return (process.env.MINIMAX_API_URL || process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function resolveModel() {
  return process.env.MINIMAX_MODEL || DEFAULT_MODEL;
}

function resolveMessagesUrl() {
  const base = resolveBaseUrl();
  if (base.endsWith("/v1/messages")) return base;
  if (base.endsWith("/v1")) return `${base}/messages`;
  return `${base}/v1/messages`;
}

function buildPrompt({ profile, localResume, role, template, jd, rawText }) {
  return JSON.stringify({
    task: "把候选人的散乱材料整合成一页正式中文简历。控制篇幅，适合 A4 一页。",
    rules: [
      "只能使用材料中能支持的信息，不要编造。",
      "项目和经历要结果导向，尽量保留真实量化指标。",
      "summary 控制在 90-140 个中文字符。",
      "projects 最多 3 条，每条 90-150 字。",
      "experience 最多 2 条，每条 70-130 字。",
      "skills 最多 16 个。",
      "项目经历和实习/工作经历不能重复；实习写公司/岗位/职责，项目写项目背景/技术栈/结果。",
      "输出纯 JSON，不要 Markdown，不要解释。"
    ],
    outputSchema: {
      name: "string",
      targetTitle: "string",
      contact: { phone: "string", email: "string", github: "string", website: "string", location: "string" },
      summary: "string",
      education: ["string"],
      skills: ["string"],
      projects: ["string"],
      experience: ["string"],
      awards: ["string"],
      keywords: ["string"],
      gaps: ["string"]
    },
    target: { role, template, jd },
    parsedProfile: profile,
    localDraft: localResume,
    rawText
  });
}

function extractText(data) {
  const content = Array.isArray(data?.content) ? data.content : [];
  return content.map((block) => {
    if (typeof block === "string") return block;
    if (block?.type === "text") return block.text || "";
    if (block?.text) return block.text;
    return "";
  }).join("\n").trim();
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("MiniMax 没有返回可解析的 JSON 简历。");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
