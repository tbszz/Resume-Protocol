import { readFileSync } from 'node:fs';

export const CAREER_SOP = readFileSync(new URL('../knowledge/career-sop.md', import.meta.url), 'utf8');

// Only explicit user requests set search scope. A school location is not consent
// to work there; an assistant's previous recommendation is not a user preference.
export function searchScope(messages = []) {
  let region = null, type = null;
  for (const message of messages) {
    if (message.role !== 'user' || message.kind === 'attachment') continue;
    const text = String(message.content || '').replace(/(?:不要|不看|不考虑|不找|不投)海外(?:岗位|工作|实习)?/g,'').replace(/(?:不要|不看|不考虑|不找|不投)国内(?:岗位|工作|实习)?/g,'');
    if (/国内(?:和|、|与)?海外.{0,6}(均可|都可|都行)|地区不限|全球都可以/.test(text)) region = 'any';
    else if (/只(?:看|找|投|考虑)?国内|国内.{0,8}(岗位|实习|校招|工作)|在国内|中国大陆/.test(text)) region = 'domestic';
    else if (/只(?:看|找|投|考虑)?海外|海外.{0,8}(岗位|实习|校招|工作)|在海外/.test(text)) region = 'overseas';
    if (/不要校招|不看校招/.test(text)) { if (type === 'campus') type = null; }
    if (/不要实习|不看实习/.test(text)) { if (type === 'internship') type = null; }
    const clean = text.replace(/(?:不要|不看|不考虑)(?:校招|实习|社招)/g,'');
    if (/实习/.test(clean) && !/校招|社招/.test(clean)) type = 'internship';
    else if (/校招/.test(clean) && !/实习|社招/.test(clean)) type = 'campus';
    else if (/社招/.test(clean) && !/实习|校招/.test(clean)) type = 'social';
  }
  return {region,type};
}

export function missingSearchScope(scope) {
  const questions=[];
  if (!scope.region) questions.push('你考虑国内、海外，还是地区不限？');
  if (!scope.type) questions.push('你这次找实习、校招，还是社招？');
  return questions.join('');
}

export function isJobSearchRequest(text='') {
  return /(?:推荐|寻找|搜索|检索|找|匹配).{0,12}(?:岗位|工作|实习)|有哪些.{0,8}(?:岗位|工作)/.test(text);
}
