import assert from "node:assert/strict";
import { classifyAgentIntent, planAgentAction } from "./agentIntent.js";

assert.equal(classifyAgentIntent("帮我诊断一下这份简历"), "intake");
assert.equal(classifyAgentIntent("找上海的 AI Agent 校招岗位"), "jobs");
assert.equal(classifyAgentIntent("按照这个 JD 生成前端岗位版简历"), "resume");
assert.equal(classifyAgentIntent("根据当前项目准备面试和追问"), "interview");
assert.equal(classifyAgentIntent("我接下来应该做什么"), "help");

{
  const result = planAgentAction("", {});
  assert.equal(result.intent, "empty");
  assert.equal(result.action, "none");
  assert.match(result.message, /最想完成什么/);
}

{
  const result = planAgentAction("诊断简历", { hasMaterial: true });
  assert.equal(result.action, "analyze");
  assert.equal(result.target, "materials");
}

{
  const result = planAgentAction("生成岗位版简历", { hasProfile: false, hasJob: false });
  assert.equal(result.action, "none");
  assert.equal(result.target, "materials");
  assert.match(result.message, /职业资料/);
}

{
  const result = planAgentAction("生成岗位版简历", { hasProfile: true, hasJob: false });
  assert.equal(result.target, "jobs");
  assert.match(result.message, /目标岗位/);
}

{
  const result = planAgentAction("生成岗位版简历", { hasProfile: true, hasJob: true });
  assert.equal(result.action, "generate-resume");
  assert.equal(result.target, "interview");
}

{
  const result = planAgentAction("准备面试", { hasVariant: false });
  assert.equal(result.action, "none");
  assert.equal(result.target, "resume");
}

{
  const result = planAgentAction("准备面试", { hasVariant: true });
  assert.equal(result.action, "navigate");
  assert.equal(result.target, "interview");
}

console.log("agentIntent tests passed");
