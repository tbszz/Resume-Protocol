const DEGREE_ORDER = { bachelor: 1, master: 2, phd: 3 };
const TECH_TERMS = ["React", "TypeScript", "JavaScript", "Python", "FastAPI", "PostgreSQL", "Git", "Java", "Go", "C++", "SQL", "Vue", "Node", "Docker", "Kubernetes", "LLM", "RAG", "Machine Learning", "AI"];
const OVERSEAS_TERMS = ["united states", "usa", "u.s.", "new york", "california", "san francisco", "washington", "canada", "singapore", "london", "uk", "remote us", "remote-us"];
const WORK_AUTH_TERMS = ["work authorization", "authorized to work", "no visa sponsorship", "no sponsorship", "不提供签证", "无需签证", "工作许可"];
const AUTH_EVIDENCE_TERMS = ["work authorization", "authorized to work", "green card", "citizen", "h1b", "opt", "cpt", "工作许可", "绿卡", "公民", "签证", "合法工作"];

const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
const lower = (value) => compact(value).toLowerCase();

export function evaluateJobEligibility(job = {}, profile = {}, options = {}) {
  const text = jobText(job);
  const material = [options.material, profileText(profile)].filter(Boolean).join("\n");
  const checks = [
    checkSourceCompleteness(job),
    checkJobType(job, options.type),
    checkRegion(job, options.region),
    checkGraduation(text, profile),
    checkFreshness(job, text, options.now),
    checkEducation(text, profile),
    checkExperience(text, profile),
    checkWorkAuthorization(job, text, material),
    checkSkills(text, profile, material)
  ];
  const major = checkMajor(text, profile);
  if (major) checks.splice(3, 0, major);

  const failed = checks.filter((check) => check.status === "fail");
  const unknown = checks.filter((check) => check.status === "unknown");
  const status = failed.length ? "rejected" : unknown.length ? "verify" : "passed";
  return {
    status,
    reason: summarize(status, failed, unknown),
    checks,
    score: score(job, checks)
  };
}

export function filterEligibleJobs(jobs = [], profile = {}, options = {}) {
  const evaluated = jobs.map((job) => {
    const eligibility = evaluateJobEligibility(job, profile, options);
    return { ...job, eligibility };
  });
  const passed = evaluated
    .filter((job) => job.eligibility.status === "passed")
    .sort((a, b) => b.eligibility.score - a.eligibility.score);
  const uncertainties = evaluated.filter((job) => job.eligibility.status === "verify");
  const rejected = evaluated.filter((job) => job.eligibility.status === "rejected");
  return { jobs: passed, uncertainties, rejected };
}

function checkJobType(job, requestedType) {
  if (!requestedType) {
    return pass("job_type", "岗位类型未形成排除条件。");
  }
  if (!job.type) return unknown('job_type','岗位未明确招聘类型，不能推定是校招或实习。');
  if (job.type !== requestedType) {
    return fail("job_type", `用户搜索${typeLabel(requestedType)}，岗位标注为${typeLabel(job.type)}。`, evidence(job.type));
  }
  return pass("job_type", `岗位类型匹配${typeLabel(requestedType)}。`, evidence(job.type));
}

function checkRegion(job, region) {
  if (!region || region === 'any') return pass('region','用户未设置地区排除条件。');
  const location = String(job.location || job.city || '');
  const domestic = /中国|北京|上海|深圳|广州|杭州|南京|成都|武汉|苏州|西安|合肥|郑州|天津|重庆|长沙|大陆|\bChina\b/i.test(location);
  const overseas = OVERSEAS_TERMS.some(term=>lower(location).includes(term));
  if (domestic && overseas) return unknown('region','岗位包含多个国家或地区，需要确认具体申请地点。',location);
  if (!domestic && !overseas) return unknown('region','岗位地点未能确认，不能假定远程岗位允许跨国工作。',location);
  if ((region === 'domestic' && overseas) || (region === 'overseas' && domestic)) return fail('region','岗位地点不符合用户明确的求职地区。',location);
  return pass('region','岗位地区符合当前搜索范围。',location);
}

function checkGraduation(text, profile) {
  const cohort = text.match(/(20\d{2})\s*届/);
  if (!cohort) return pass('graduation','未提取到明确毕业届别限制。');
  const education = (profile.education || []).join('\n');
  if ((text.match(/20\d{2}\s*届/g) || []).length > 1 || (profile.education || []).length > 1) return unknown('graduation','存在多个毕业届别或教育记录，需要按当前申请学历核对，不能用第一段学历直接排除。',`${cohort[0]} / ${education}`);
  const explicit = education.match(/(?:预计|预期)?毕业(?:时间)?[:：\s]*(20\d{2})|(20\d{2})\s*(?:年)?(?:毕业|届)/);
  const range = education.match(/20\d{2}(?:[.\/-]\d{1,2})?\s*[-–—~至]\s*(20\d{2})/);
  const year = explicit?.[1] || explicit?.[2] || range?.[1];
  if (!year) return unknown('graduation',`岗位限${cohort[1]}届，材料没有明确毕业年份。`,cohort[0]);
  if (year !== cohort[1]) return fail('graduation',`岗位要求${cohort[1]}届，材料毕业年份为${year}。`,`${cohort[0]} / ${education}`);
  return pass('graduation','毕业届别符合要求。',`${cohort[0]} / ${education}`);
}

function checkFreshness(job, text, now = new Date().toISOString()) {
  if (/(closed|filled|no longer|applications closed|已关闭|停止招聘|已截止|招满)/i.test(text)) {
    return fail("freshness", "岗位文本显示已关闭或已截止。", evidence(text.match(/closed|filled|no longer|applications closed|已关闭|停止招聘|已截止|招满/i)?.[0]));
  }
  const deadline = text.match(/(?:deadline|截止|申请截止)[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/i)?.[1];
  if (deadline) {
    const deadlineDate = new Date(deadline.replace(/[./]/g, "-"));
    const nowDate = new Date(now);
    if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate < nowDate) {
      return fail("freshness", `岗位截止日期${deadline}早于当前日期。`, evidence(deadline));
    }
    return pass("freshness", `岗位截止日期${deadline}尚未过期。`, evidence(deadline));
  }
  if (!job.postingAge && (!job.updatedAt || job.source === 'github-job-source') && !job.deadline) {
    return unknown("freshness", "聚合记录未提供发布日期、岗位年龄或截止日期，需打开原投递页核实是否仍开放。");
  }
  const days = Number(text.match(/(\d+)\s*d\b/i)?.[1] || 0);
  if (days > 90) return fail("freshness", `GitHub源显示岗位年龄${days}天，时效风险过高。`, evidence(`${days}d`));
  return pass("freshness", "没有发现关闭或过期信号。");
}

function checkSourceCompleteness(job) {
  if(job.source === 'domestic-feed' && !job.fullDescriptionVerified) return unknown('source_completeness','后台同步的聚合资料尚未核实完整官方JD，不能把摘要或职责段落当作全部招聘门槛。');
  if (job.source === 'github-job-source' && !job.fullDescriptionVerified) return unknown('source_completeness', '此来源仅提供岗位标题、地点等聚合信息，自动生成的摘要不是完整招聘要求，需查看官方JD。');
  const hasDescription = compact(job.description).length >= 20;
  const hasRequirements = Array.isArray(job.requirements) && job.requirements.some((item) => compact(item).length >= 3);
  if (hasDescription || hasRequirements) return pass("source_completeness", "聚合记录包含可审计岗位描述或要求。");
  return unknown("source_completeness", "聚合记录只有标题等摘要信息，缺少完整JD，需核实后才能称为可投递。");
}

function checkEducation(text, profile) {
  const required = requiredDegree(text);
  if (!required) {
    if (/phd\s+(intern|internship)|博士.{0,4}实习/i.test(text)) return candidateDegree(profile) === 'phd' ? pass('education','学历符合博士实习方向。','PhD Internship') : unknown('education','岗位标题是博士实习，材料未证明博士在读资格，不能作为推荐，需核实完整学历要求。','PhD Internship');
    return pass("education", "岗位未提取到明确学历硬门槛。");
  }
  const candidate = candidateDegree(profile);
  if (candidate === "unknown") {
    return unknown("education", `岗位要求${degreeLabel(required)}，候选人材料没有明确学历层级。`, evidence(required));
  }
  if ((DEGREE_ORDER[candidate] || 0) < DEGREE_ORDER[required]) {
    return fail("education", `岗位明确要求${degreeLabel(required)}，候选人材料最高学历为${degreeLabel(candidate)}。`, evidence(required));
  }
  return pass("education", `学历满足${degreeLabel(required)}要求。`, evidence(required));
}

function checkMajor(text, profile) {
  const required = requiredMajor(text);
  if (!required) return null;
  const edu = lower((profile.education || []).join(" "));
  const candidateMajor = /computer|software|cs\b|计算机|软件/.test(edu) ? 'computer' : /市场营销|广告学|marketing/.test(edu) ? 'marketing' : /会计|财务|accounting/.test(edu) ? 'accounting' : /护理|医学|medical|nursing/.test(edu) ? 'medical' : null;
  if (!candidateMajor) return unknown('major','材料未明确对应专业，需核实专业限制。',required);
  if (required === "computer" && candidateMajor === "computer") {
    return pass("major", "专业方向匹配计算机相关要求。", evidence("计算机"));
  }
  if (required !== candidateMajor) {
    return fail("major", "岗位明确限制专业，候选人教育材料未匹配该专业。", evidence(required));
  }
  return pass("major", "专业方向满足岗位要求。", evidence(required));
}

function checkExperience(text, profile) {
  const years = requiredExperienceYears(text);
  if (!years) return pass("experience", "岗位未提取到明确年限硬门槛。");
  const source = lower([...(profile.experience || []), ...(profile.projects || [])].join(" "));
  const candidateYears = candidateExperienceYears(source);
  if (candidateYears === null) {
    return unknown("experience", `岗位要求${years}年以上经验，候选人材料没有明确经验年限。`, evidence(`${years}+ years`));
  }
  if (candidateYears < years) {
    return fail("experience", `岗位要求${years}年以上经验，候选人材料只有${candidateYears}年经验。`, evidence(`${years}+ years`));
  }
  return pass("experience", `经验年限满足${years}年以上要求。`, evidence(`${years}+ years`));
}

function checkWorkAuthorization(job, text, material) {
  const isOverseas = OVERSEAS_TERMS.some((term) => lower(`${job.location} ${job.city} ${text}`).includes(term));
  const requiresAuth = WORK_AUTH_TERMS.some((term) => lower(text).includes(term));
  if (!isOverseas) return pass("work_authorization", "岗位未提取到境外工作授权硬门槛。");
  if (/没有.{0,8}(签证|工作许可|工作授权)|无.{0,8}(签证|工作许可|工作授权)|不具备.{0,8}(签证|工作许可|工作授权)/.test(material)) {
    return fail("work_authorization", "用户材料明确缺少签证或海外工作许可，不能投递该境外岗位。", evidence("没有签证"));
  }
  const hasEvidence = hasPositiveAuthorization(material);
  if (!hasEvidence) {
    const message = requiresAuth
      ? "岗位要求境外工作授权，但用户材料没有身份或工作许可证据，需核实后才能投递。"
      : "岗位地点在境外或Remote US，用户材料没有工作授权证据，需核实后才能投递。";
    return unknown("work_authorization", message, evidence(requiresAuth ? "work authorization" : job.location));
  }
  return pass("work_authorization", "用户材料包含工作授权相关线索，仍需以岗位申请页为准。", evidence("work authorization"));
}

function checkSkills(text, profile, material) {
  const required = requiredSkills(text);
  if (!required.length) return unknown("skills", "岗位未提取到可核对技能，需打开投递页确认要求。");
  const source = lower([material, profileText(profile)].join("\n"));
  const hits = required.filter((term) => hasExactTerm(source, term));
  if (!hits.length) {
    return fail("skills", `岗位技能要求未在用户材料中找到证据：${required.slice(0, 4).join(" / ")}。`, evidence(required[0]));
  }
  if (hits.length < required.length) {
    const missing = required.filter((term) => !hits.includes(term));
    return unknown("skills", `岗位明确要求${required.join(" / ")}，用户材料仅命中${hits.join(" / ")}，缺少${missing.join(" / ")}证据。`, evidence(missing[0]));
  }
  return pass("skills", `用户材料命中技能：${hits.slice(0, 4).join(" / ")}。`, evidence(hits[0]));
}

function requiredDegree(text) {
  const value = lower(text);
  if (/(bachelor|本科).{0,20}(or|或|\/).{0,20}(master|硕士)|bs\/ms|bs or ms/.test(value)) return "bachelor";
  if (/(must|required|requires|requirement|enrolled in|硬性要求|必须|要求).{0,30}(phd|doctor|博士)|(phd|doctor|博士).{0,20}(required|only|必须|硬性)/i.test(text)) return "phd";
  if (/(must|required|requires|requirement|硬性要求|必须|要求).{0,30}(master|硕士|研究生)|(master|硕士|研究生).{0,20}(required|必须|硬性)/i.test(text)) return "master";
  if (/(must|required|requires|requirement|硬性要求|必须|要求).{0,30}(bachelor|本科)|(bachelor|本科).{0,20}(required|必须|硬性)/i.test(text)) return "bachelor";
  return "";
}

function candidateDegree(profile) {
  const text = lower((profile.education || []).join(" "));
  if (/phd|doctor|博士/.test(text)) return "phd";
  if (/master|硕士|研究生/.test(text)) return "master";
  if (/bachelor|本科|学士/.test(text)) return "bachelor";
  return "unknown";
}

function requiredMajor(text) {
  const value = lower(text);
  if (/(计算机|computer science|software engineering|cs\b).{0,8}(相关专业|专业|required|requirement)|硬性要求.{0,18}(计算机|软件)/i.test(text)) return "computer";
  if (/(市场营销|广告学|marketing).{0,8}(相关专业|专业|required)|硬性要求.{0,18}(市场营销|广告学|marketing)/i.test(text)) return "marketing";
  if (/(会计|财务|accounting).{0,8}(相关专业|专业|required)|硬性要求.{0,18}(会计|财务|accounting)/i.test(text)) return "accounting";
  if (/(护理|医学|medical|nursing).{0,8}(相关专业|专业|required)|硬性要求.{0,18}(护理|医学|medical|nursing)/i.test(text)) return "medical";
  return value.includes("computer science major required") ? "computer" : "";
}

function requiredExperienceYears(text) {
  const patterns = [
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|年).{0,18}(?:experience|经验|经历).{0,12}(?:required|requires|must|要求|必须)/i,
    /(?:required|requires|must|minimum|at least|要求|必须|至少).{0,18}(\d+(?:\.\d+)?)\+?\s*(?:years?|年).{0,10}(?:experience|经验|经历)?/i,
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|年)(?:以上|及以上).{0,10}(?:experience|经验|经历)?/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

function candidateExperienceYears(source) {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:years?|年).{0,10}(?:experience|经验|经历)/i,
    /(?:experience|经验|经历).{0,10}(\d+(?:\.\d+)?)\s*(?:years?|年)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function requiredSkills(text) {
  const segments = String(text || "").split(/[.;。；\n]/).map((item) => item.trim()).filter(Boolean);
  const required = new Set();
  for (const segment of segments) {
    if (/preferred|plus|nice to have|加分|优先/i.test(segment) && !/required|must|必须|要求/i.test(segment)) continue;
    if (/required|requires|must|need|掌握|熟悉|要求|必须|硬性/i.test(segment)) {
      for (const term of TECH_TERMS) {
        if (hasExactTerm(segment, term)) required.add(term);
      }
    }
  }
  return [...required];
}

function hasExactTerm(text, term) {
  const escaped = escapeRegExp(term);
  if (/^[A-Za-z0-9+#. ]+$/.test(term)) {
    return new RegExp(`(?<![A-Za-z0-9+#.])${escaped}(?![A-Za-z0-9+#.])`, "i").test(text);
  }
  return String(text || "").includes(term);
}

function hasPositiveAuthorization(material) {
  const value = lower(material);
  const positivePatterns = [
    /\b(opt|cpt|h1b|h-1b)\b/i,
    /green card|citizen|authorized to work|work authorization|valid work permit/i,
    /绿卡|公民|合法工作许可|已有工作许可|具备工作授权|持有.*签证/
  ];
  return positivePatterns.some((pattern) => pattern.test(value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jobText(job) {
  return [
    job.title,
    job.company,
    job.description,
    ...(job.requirements || []),
    job.location,
    job.city,
    job.postingAge,
    job.deadline
  ].filter(Boolean).join("\n");
}

function profileText(profile) {
  return [
    ...(profile.education || []),
    ...(profile.skills || []),
    ...(profile.projects || []),
    ...(profile.experience || [])
  ].filter(Boolean).join("\n");
}

function pass(dimension, message, source = "") {
  return { dimension, status: "pass", message, evidence: source };
}

function fail(dimension, message, source = "") {
  return { dimension, status: "fail", message, evidence: source };
}

function unknown(dimension, message, source = "") {
  return { dimension, status: "unknown", message, evidence: source };
}

function summarize(status, failed, unknownChecks) {
  if (status === "rejected") return failed.map((check) => check.message).join("；");
  if (status === "verify") return unknownChecks.map((check) => check.message).join("；");
  return "硬性资格条件通过，可进入排序。";
}

function score(job, checks) {
  const base = Number(job.opportunityScore || job.matchScore || 70);
  const passCount = checks.filter((check) => check.status === "pass").length;
  return base + passCount;
}

function evidence(value) {
  return String(value || "");
}

function degreeLabel(value) {
  return { phd: "博士/PhD", master: "硕士/Master", bachelor: "本科/Bachelor", unknown: "未知学历" }[value] || "未知学历";
}

function typeLabel(value) {
  return { campus: "校招", internship: "实习", social: "社招" }[value] || value;
}
