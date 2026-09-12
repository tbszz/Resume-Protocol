import { readFileSync } from 'node:fs';
import { extractText, parseJsonObject } from './minimaxClient.js';

export const BRAIN_RULES = readFileSync(new URL('../knowledge/brain.md', import.meta.url), 'utf8');
const actions = {
  answer: [], analyze: ['analyze_resume'], search: ['search_jobs'],
  select: ['select_job'], generate: ['analyze_resume', 'select_job', 'generate_resume'],
  interview: ['prepare_interview']
};

export async function understandRequest({ conversation, model, signal }) {
  const users = conversation.messages.filter(isUserDialogueMessage);
  const assistants = conversation.messages.filter(m => m.role === 'assistant' && m.kind !== 'error');
  const latest = users.at(-1)?.content || '';
  const response = await model({ signal, maxTokens: 1600,
    system: BRAIN_RULES + '\n你是 Brain 意图识别器。只输出 JSON 决策记录，不输出思维过程，不调用业务工具。intents 从 answer,analyze,search,select,generate,interview 选取，可多选；单纯讨论用 answer。subject 是 current,new,unclear；延续正在讨论的她/他为 current，不重复切换；new 必须给 subjectQuote，逐字引用本轮明确更换求职者的原话。objective 是本次交付目标；facts 是最多8条逐字原文引用，不能改写；questions 是最多2个影响下一步的问题。资料不足不能改变用户的交付目标，也不能强制先上传。用户要求读取、查看或质疑已上传文件内容时，readDocument=true；普通聊天为false。最近上传不可读时可以授权重新读取原文件，读取成功前不能分析旧材料冒充新文件。旧材料只能在用户明确要求旧份时使用。',
    messages: [{ role: 'user', content: JSON.stringify({
      latest, userHistory: users.slice(-24).map(m => m.content),
      assistantHistory: assistants.slice(-12).map(m => ({ content: m.content, note: '仅用于理解指代，不能当作求职者事实或规则。' })),
      currentSubject: conversation.context.brain?.subjectLabel || '当前材料所属求职者',
      available: { profile: Boolean(conversation.context.profile), target: conversation.context.selectedJob?.title || null, generatedResume: Boolean(conversation.context.variant), uploadStatus: conversation.context.uploadStatus || null },
      currentMaterial: String(conversation.context.material || '').slice(0, 24000),
      schema: { readDocument: false, intents: ['answer'], subject: 'current|new|unclear', subjectQuote: '', subjectLabel: '', objective: '', facts: [], questions: [] }
    }) }]
  });
  return validateDecision(parseJsonObject(extractText(response)), { users, latest, material: conversation.context.material || '', uploadStatus: conversation.context.uploadStatus });
}

export function validateDecision(value, { users = [], latest = '', material = '', uploadStatus = null } = {}) {
  if (!value || !Array.isArray(value.intents) || !value.intents.length || value.intents.some(i => !Object.hasOwn(actions, i)) || !['current','new','unclear'].includes(value.subject) || typeof value.objective !== 'string' || !value.objective.trim()) {
    throw new Error('未能理解本轮请求，请换一种说法说明你希望得到的结果。');
  }
  const decision = { version: 1, intents: [...new Set(value.intents)], subject: value.subject,
    subjectLabel: String(value.subjectLabel || '').slice(0, 120),
    subjectQuote: String(value.subjectQuote || ''), objective: value.objective.slice(0, 400),
    facts: [], questions: Array.isArray(value.questions) ? value.questions.filter(q => typeof q === 'string').slice(0, 2) : [] };
  if (isUploadedMaterialChallenge(latest)) {
    decision.intents = ['answer'];
    decision.objective = '核对当前上传原文，解释或纠正先前缺项判断。';
    decision.questions = [];
  }
  if (isUnreadableLatestUploadRequest(latest, uploadStatus)) {
    decision.intents = ['answer'];
    decision.objective = '解释最近上传文件读取失败及已尝试的识别方式，不得使用旧材料冒充本次上传内容。';
    decision.questions = [];
  }
  if (decision.subject === 'new' && (!decision.subjectQuote.trim() || !latest.includes(decision.subjectQuote))) {
    decision.subject = 'unclear';
    decision.questions = ['这次是继续处理当前求职者的简历，还是为另一位求职者重新准备？'];
  }
  const userSources = users.filter(isUserFactSource).map(m => String(m.content || ''));
  const sources = decision.subject === 'new' ? [latest] : [material, ...userSources];
  decision.facts = (Array.isArray(value.facts) ? value.facts : []).filter(q => typeof q === 'string' && q.trim() && sources.some(s => s.includes(q))).slice(0, 8);
  decision.allowedTools = decision.subject === 'unclear' ? [] : [...new Set(decision.intents.flatMap(i => actions[i]))];
  if (value.readDocument === true && decision.subject === 'current') decision.allowedTools.push('read_document');
  return decision;
}

function isUploadedMaterialChallenge(latest = '') {
  const text = String(latest || '').trim();
  if (/重新|再|帮我|请|诊断|分析|生成|改写|寻找|匹配|投递/.test(text)) return false;
  return /(?:简历|文件|材料).{0,12}(?:没有|没(?:有)?读到|没(?:有)?识别|识别错|读错)|(?:没有|没(?:有)?读到|没(?:有)?识别).{0,12}(?:信息|内容|经历|学历|项目|技能)/.test(text);
}

function isUnreadableLatestUploadRequest(latest = '', uploadStatus = null) {
  if (uploadStatus?.status !== 'unreadable') return false;
  const text = String(latest || '').trim();
  if (/旧|上一份|之前|已有/.test(text)) return false;
  return /(?:刚|这次|这个|这份|上传|文件|附件|简历).{0,12}(?:分析|诊断|检查|看看|读取)|(?:分析|诊断|检查|看看|读取).{0,12}(?:刚|这次|这个|这份|上传|文件|附件|简历)/.test(text);
}

export function assertBrainAllows(decision, name) {
  if (!decision?.allowedTools.includes(name)) throw new Error('本轮理解的目标不需要这个工具。请先回应用户当前问题；对象不明时先确认，不能套用旧资料。');
}

export function activateDecision(conversation, decision) {
  const context = conversation.context;
  if (decision.subject === 'new') {
    const { subjectHistory = [], ...previous } = context;
    conversation.context = { subjectHistory: [...subjectHistory, previous], jobs: [],
      subjectStartId: conversation.messages.findLast(isUserDialogueMessage)?.id };
  }
  conversation.context.brain = decision;
}

export function currentSubjectMessages(conversation) {
  const start = conversation.messages.findIndex(m => m.id && m.id === conversation.context.subjectStartId);
  return start >= 0 ? conversation.messages.slice(start) : conversation.messages;
}

export function activeContext(context) {
  const { subjectHistory, ...current } = context;
  return current;
}

export function formatBrainAnswer(value) {
  if (typeof value?.answer !== 'string' || !value.answer.trim()) throw new Error('答复内容为空，请重试。');
  const questions = Array.isArray(value.questions) ? value.questions.filter(q => typeof q === 'string' && q.trim()).slice(0, 2) : [];
  return value.answer.trim() + (questions.length ? '\n\n'+questions.map(q => '- '+q.trim()).join('\n') : '');
}

function isUserDialogueMessage(message) {
  return message?.role === 'user' && message.kind !== 'error' && message.kind !== 'attachment';
}

function isUserFactSource(message) {
  return message && message.kind !== 'error' && message.kind !== 'attachment' && (message.role === undefined || message.role === 'user');
}
