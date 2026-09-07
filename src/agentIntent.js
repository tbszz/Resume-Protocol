const INTENT_RULES = [
  ["interview", /面试|复习|追问|模拟面试|项目深挖|算法题|八股/i],
  ["resume", /定制|岗位版|生成.*简历|改写.*简历|优化.*简历|针对.*(?:jd|岗位)/i],
  ["jobs", /找.*(?:岗位|工作|职位)|搜索.*(?:岗位|工作|职位)|岗位雷达|校招|实习|职位|招聘|jd/i],
  ["intake", /诊断|分析.*简历|检查.*简历|解析.*简历|职业资料|补充资料|完整度/i]
];

export function classifyAgentIntent(input = "") {
  const text = String(input).trim();
  if (!text) return "empty";
  return INTENT_RULES.find(([, pattern]) => pattern.test(text))?.[0] || "help";
}

export function planAgentAction(input, context = {}) {
  const intent = classifyAgentIntent(input);
  if (intent === "empty") {
    return response(intent, "none", "agent", "先说你现在最想完成什么，例如：诊断简历、找目标岗位、生成岗位版，或准备面试。");
  }
  if (intent === "intake") {
    if (!context.hasMaterial) {
      return response(intent, "none", "materials", "先把现有简历或项目材料放进职业资料区，我会从完整度和事实证据开始诊断。");
    }
    return response(intent, "analyze", "materials", "我会先分析职业资料，找出缺失信息、优势和需要补证据的项目。");
  }
  if (intent === "jobs") {
    return response(intent, "open-jobs", "jobs", "我会打开岗位雷达。选择一个真实目标岗位后，后续简历和面试计划会共用这份 JD。");
  }
  if (intent === "resume") {
    if (!context.hasProfile) {
      return response(intent, "none", "materials", "还缺少结构化职业资料。先完成一次资料分析，我才能基于真实经历生成岗位版简历。");
    }
    if (!context.hasJob) {
      return response(intent, "open-jobs", "jobs", "职业资料已经就绪；下一步先选择目标岗位，让我知道简历要针对哪一份 JD。");
    }
    return response(intent, "generate-resume", "interview", "资料和目标岗位都已就绪。我会生成岗位版项目证据，并同步准备面试追问。");
  }
  if (intent === "interview") {
    if (!context.hasVariant) {
      return response(intent, "none", "resume", "面试计划需要以一份岗位版简历为依据。先生成岗位版，我再围绕其中每一条项目证据追问。");
    }
    return response(intent, "navigate", "interview", "面试作战室已经就绪。我会带你从项目深挖、技术主线和 7 天复习计划开始。");
  }
  return response(intent, "navigate", "workflow", "你可以直接告诉我目标：诊断资料、找岗位、生成岗位版简历，或准备面试。我会判断前置条件并带你进入正确步骤。");
}

function response(intent, action, target, message) {
  return { intent, action, target, message };
}
