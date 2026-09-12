import assert from "node:assert/strict";
import { test } from "node:test";
import { runCareerAgent as runAgent } from "./careerAgent.js";
// Existing tool tests isolate execution from semantic planning; brain.test.js
// exercises the mandatory planner and its gates with bounded plans.
const runCareerAgent = args => runAgent({ ...args, brainModel: async () => ({content:[{type:'text',text:JSON.stringify({intents:['answer','analyze','search','select','generate','interview'],subject:'current',objective:'处理测试请求',facts:[],questions:[]})}]}) });

await test('uploaded profiles receive evidence review before a freeform answer and invented examples are suppressed', async () => {
  const material = '张三\n教育经历\n某大学计算机本科\n项目经历\n使用 React 开发搜索功能\n技能栈\nReact';
  const c = {id:'uploaded',messages:[{role:'user',content:'分析刚上传的简历',id:'u'}],context:{material,profile:{name:'张三',education:['某大学计算机本科']},jobs:[]}};
  let calls=0;
  await runCareerAgent({conversation:c,emit:()=>{},persist:()=>{},model:async({system})=>{
    calls++;
    if(system.includes('简历修改建议编辑')) return {content:[{type:'text',text:JSON.stringify({annotations:[
      {quote:'使用 React 开发搜索功能',issue:'缺少职责边界',suggestion:'说明搜索界面中你负责的交互和实际处理的异常。',reason:'让读者区分个人贡献。',section:'projects',severity:'medium'},
      {quote:'使用 React 开发搜索功能',issue:'缺少数据',suggestion:'改为完成10个API并提升30%性能。',reason:'证明能力。',section:'projects',severity:'high'}
    ]})}]};
    return {content:[{type:'text',text:'建议写2024年上线10个API，使用Ant Design，迭代3个版本。'}]};
  }});
  assert.equal(calls,2);
  assert.equal(c.context.annotations.length,1);
  assert.equal(c.context.annotations[0].source,'model');
  assert.match(c.messages.at(-1).content,/你负责的交互/);
  assert.doesNotMatch(c.messages.at(-1).content,/10个API|30%|Ant Design|2024/);
});

const conversation = () => ({ id: "c1", messages: [{ role: "user", content: "帮我分析简历", id: "u1" }], context: { material: "张三\n教育经历\n某大学计算机本科\n项目经历\n使用 React 完成求职系统\n技能栈\nReact TypeScript", jobs: [] } });
await test("model requests tool, receives its result, and finishes a real response", async () => {
  const c = conversation();
  const events = [];
  let calls = 0;
  await runCareerAgent({ conversation: c, emit: (type, data) => events.push({ type, data }), persist: () => {},
    model: async ({ messages }) => {
      calls++;
      if (calls === 1) return { content: [{ type: "tool_use", id: "tool1", name: "analyze_resume", input: {} }], stop_reason: "tool_use" };
      if (calls === 2) return { content: [{ type: "text", text: JSON.stringify({ annotations: [
        { id: "a1", quote: "使用 React 完成求职系统", issue: "项目缺少结果", suggestion: "补充真实结果", reason: "便于核验", section: "projects", severity: "medium" }
      ] }) }], stop_reason: "end_turn" };
      assert.equal(messages.at(-1).content[0].type, "tool_result");
      assert.equal(messages.at(-1).content[0].tool_use_id, "tool1");
      assert.ok(JSON.parse(messages.at(-1).content[0].content).profile);
      return { content: [{ type: "text", text: "你的项目缺少可核对的成果，请补充实际指标。" }], stop_reason: "end_turn" };
    }
  });
  assert.equal(calls, 3);
  assert.ok(c.context.profile);
  assert.match(c.messages.at(-1).content, /原文：使用 React 完成求职系统/);
  assert.match(c.messages.at(-1).content, /建议：补充真实结果/);
  assert.ok(events.some(e => e.type === "status" && e.data.tool === "analyze_resume"));
});
await test("unknown tool is returned as an error without executing arbitrary actions", async () => {
  let calls = 0;
  await runCareerAgent({ conversation: conversation(), persist: () => {}, emit: () => {}, model: async ({ messages }) => {
    if (++calls === 1) return { content: [{ type: "tool_use", id: "t", name: "run_shell", input: { command: "anything" } }] };
    assert.equal(messages.at(-1).content[0].is_error, true);
    return { content: [{ type: "text", text: "请提供简历资料。" }] };
  } });
});
await test("loop is bounded", async () => {
  await assert.rejects(runCareerAgent({ conversation: conversation(), emit: () => {}, persist: () => {}, model: async () => ({content: [{type:"tool_use",id:"t",name:"unknown",input:{}}]}) }), /工具调用次数/);
});
await test("provider failure does not masquerade as local AI success", async () => {
  await assert.rejects(runCareerAgent({ conversation: conversation(), emit: () => {}, persist: () => {}, model: async () => {throw new Error("provider unavailable");} }), /provider unavailable/);
});
await test("generate resume keeps audited empty fields and uses JD title", async () => {
  const jd = "前端开发工程师（校招）\n岗位职责：负责React与TypeScript业务页面开发，配合后端进行接口联调。\n任职要求：计算机相关本科，掌握React、TypeScript和Git。";
  const c = {
    id: "c2",
    messages: [{ role: "user", content: `${conversation().context.material}\n\n${jd}\n请生成完整岗位版简历。`, id: "u1" }],
    context: { material: conversation().context.material, jobs: [], uploadStatus:{status:"needs_review",extraction:{status:"partial"}} }
  };
  const events = [];
  let calls = 0;

  await runCareerAgent({
    conversation: c,
    emit: (type, data) => events.push({ type, data }),
    persist: () => {},
    model: async ({ system, messages }) => {
      calls++;
      if (calls === 1) {
        return {
          content: [
            { type: "tool_use", id: "analyze", name: "analyze_resume", input: {} },
            { type: "tool_use", id: "select", name: "select_job", input: { description: jd, title: "前端开发工程师（校招）", role: "frontend" } },
            { type: "tool_use", id: "generate", name: "generate_resume", input: { role: "frontend" } }
          ],
          stop_reason: "tool_use"
        };
      }
      if (calls === 2) {
        assert.match(system, /简历修改建议编辑/);
        return { content: [{ type: "text", text: JSON.stringify({ annotations: [
          { id: "a1", quote: "使用 React 完成求职系统", issue: "项目缺少结果", suggestion: "补充真实结果", reason: "便于核验", section: "projects", severity: "medium" }
        ] }) }], stop_reason: "end_turn" };
      }
      if (calls === 3) {
        assert.match(system, /中文简历编辑/);
        const request = JSON.parse(messages.at(-1).content);
        assert.equal(request.target.title, "前端开发工程师（校招）");
        return { content: [{ type: "text", text: JSON.stringify({
          name: "张三",
          targetTitle: "前端开发工程师（校招）",
          contact: {},
          summary: "熟悉React和TypeScript。",
          education: ["某大学计算机本科"],
          skills: ["React", "TypeScript"],
          projects: ["使用 React 完成求职系统"],
          experience: ["前端实习：参与样式调优"],
          awards: ["校级奖学金"],
          gaps: []
        }) }], stop_reason: "end_turn" };
      }
      if (calls === 4) {
        assert.match(system, /简历事实审校员/);
        const request = JSON.parse(messages.at(-1).content);
        assert.equal(request.draft.summary.includes("熟悉React"), true);
        return { content: [{ type: "text", text: JSON.stringify({
          name: "张三",
          targetTitle: "前端开发工程师（校招）",
          contact: {},
          summary: "",
          education: ["某大学计算机本科"],
          skills: ["React", "TypeScript"],
          projects: ["使用 React 完成求职系统"],
          experience: [],
          awards: [],
          gaps: ["缺少可证实摘要", "缺少可证实实习经历", "缺少奖项"]
        }) }], stop_reason: "end_turn" };
      }

      assert.equal(messages.at(-1).role, "user");
      const toolResults = messages.at(-1).content;
      assert.equal(toolResults.length, 3);
      assert.equal(toolResults.every((item) => item.type === "tool_result" && !item.is_error), true);
      return { content: [{ type: "text", text: "岗位版简历已生成。" }], stop_reason: "end_turn" };
    }
  });

  assert.equal(calls, 5);
  assert.equal(c.context.variant.title, "前端开发工程师（校招）");
  assert.equal(c.context.variant.targetTitle, "前端开发工程师（校招）");
  assert.match(c.context.variant.sourceNotice, /已识别页面/);
  assert.match(c.messages.at(-1).content, /已识别页面/);
  assert.equal(c.context.variant.summary, "");
  assert.deepEqual(c.context.variant.experience, []);
  assert.deepEqual(c.context.variant.awards, []);
  assert.equal(c.context.formalResume, c.context.variant);
  assert.ok(events.some(e => e.type === "message" && e.data.kind === "resume"));
});
await test("search jobs filters eligibility and separates uncertainties from recommendation cards", async () => {
  const c = conversation();
  c.context.material += ' Git';
  c.messages = [{ role: "user", content: "国内海外均可，帮我找前端校招岗位", id: "u1" }];
  c.context.profile = {
    education: ["某大学计算机本科"],
    skills: ["React", "TypeScript", "Git"],
    projects: ["使用 React 完成求职系统"],
    experience: []
  };
  const events = [];
  let calls = 0;

  await runCareerAgent({
    conversation: c,
    emit: (type, data) => events.push({ type, data }),
    persist: () => {},
    search: async () => ({
      sources: [{ id: "snapshot", ok: true }],
      jobs: [
        { id: "phd", title: "Machine Learning PhD Intern", description: "PhD required.", requirements: ["PhD"], type: "internship", location: "United States", matchScore: 99 },
        { id: "auth", title: "Frontend New Grad", description: "US work authorization required.", requirements: ["React"], type: "campus", location: "United States", postingAge: "1d", matchScore: 95 },
        { id: "react", title: "前端开发工程师（校招）", description: "计算机相关专业，掌握 React、TypeScript、Git。", requirements: ["React", "TypeScript", "Git"], type: "campus", location: "上海", postingAge: "1d", matchScore: 86 }
      ]
    }),
    model: async ({ system, messages }) => {
      calls++;
      assert.equal(String(system).includes("MiniMax"), false);
      if (system.includes('简历修改建议编辑')) { calls--; return {content:[{type:'text',text:'{"annotations":[]}'}]}; }
      assert.match(system, /旧推荐.*重新做资格核验/);
      if (calls === 1) return { content: [{ type: "tool_use", id: "jobs", name: "search_jobs", input: { query: "前端 React", type: "campus" } }], stop_reason: "tool_use" };
      const payload = JSON.parse(messages.at(-1).content[0].content);
      assert.deepEqual(payload.jobs.map((job) => job.id), ["react"]);
      assert.deepEqual(payload.rejected.map((job) => job.id), ["phd"]);
      assert.deepEqual(payload.uncertainties.map((job) => job.id), ["auth"]);
      return { content: [{ type: "text", text: "找到 1 个可投递岗位，另有 1 个需核实授权。" }], stop_reason: "end_turn" };
    }
  });

  const jobsMessage = events.find(e => e.type === "message" && e.data.kind === "jobs").data;
  assert.deepEqual(jobsMessage.data.jobs.map((job) => job.id), ["react"]);
  assert.deepEqual(jobsMessage.data.uncertainties.map((job) => job.id), ["auth"]);
  assert.deepEqual(jobsMessage.data.rejected.map((job) => job.id), ["phd"]);
  assert.equal(jobsMessage.content.includes("推荐"), false);
});

await test("analyze resume emits source-quoted annotations without invented quotes", async () => {
  const c = conversation();
  const events = [];
  let calls = 0;

  await runCareerAgent({
    conversation: c,
    emit: (type, data) => events.push({ type, data }),
    persist: () => {},
    model: async ({ system, messages }) => {
      calls++;
      if (calls === 1) return { content: [{ type: "tool_use", id: "tool1", name: "analyze_resume", input: {} }], stop_reason: "tool_use" };
      if (calls === 2) {
        assert.match(system, /简历修改建议编辑/);
        return { content: [{ type: "text", text: JSON.stringify({ annotations: [
          { id: "a1", quote: "使用 React 完成求职系统", issue: "缺少真实成果", suggestion: "补充真实指标或反馈", reason: "用于岗位版简历事实审校", section: "projects", severity: "high" }
        ] }) }], stop_reason: "end_turn" };
      }
      const payload = JSON.parse(messages.at(-1).content[0].content);
      assert.ok(payload.annotations.length >= 1);
      assert.equal(payload.annotations.every((item) => c.context.material.includes(item.quote)), true);
      assert.equal(payload.annotations.every((item) => item.source === "model"), true);
      return { content: [{ type: "text", text: "已分析。" }], stop_reason: "end_turn" };
    }
  });

  const diagnosis = events.find(e => e.type === "message" && e.data.kind === "diagnosis").data;
  assert.ok(diagnosis.data.annotations.length >= 1);
  assert.equal(diagnosis.data.annotations.every((item) => c.context.material.includes(item.quote)), true);
  assert.deepEqual(Object.keys(diagnosis.data.annotations[0]).sort(), ["id", "issue", "quote", "reason", "section", "severity", "source", "suggestion"].sort());
  assert.equal(diagnosis.data.annotations[0].source, "model");
});
await test("analyze resume keeps parsed material when annotation model fails", async () => {
  const c = conversation();
  let calls = 0;

  await runCareerAgent({
    conversation: c,
    emit: () => {},
    persist: () => {},
    model: async ({ messages }) => {
      calls++;
      if (calls === 1) return { content: [{ type: "tool_use", id: "tool1", name: "analyze_resume", input: {} }], stop_reason: "tool_use" };
      if (calls === 2) throw new Error("annotation unavailable");
      const result = messages.at(-1).content[0];
      assert.equal(result.is_error, true);
      assert.match(JSON.parse(result.content).error, /annotation unavailable/);
      return { content: [{ type: "text", text: "建议生成失败，但材料已保存。" }], stop_reason: "end_turn" };
    }
  });

  assert.equal(c.context.material, conversation().context.material);
  assert.ok(c.context.profile);
});

await test("analyze resume falls back to rule annotations when model quotes cannot be located", async () => {
  const c = conversation();
  let calls = 0;

  await runCareerAgent({
    conversation: c,
    emit: () => {},
    persist: () => {},
    model: async () => {
      calls++;
      if (calls === 1) return { content: [{ type: "tool_use", id: "tool1", name: "analyze_resume", input: {} }], stop_reason: "tool_use" };
      if (calls === 2) return { content: [{ type: "text", text: JSON.stringify({ annotations: [
        { id: "bad", quote: "这是原文没有的项目成果", issue: "x", suggestion: "y", reason: "z", section: "projects", severity: "high" }
      ] }) }], stop_reason: "end_turn" };
      return { content: [{ type: "text", text: "已分析。" }], stop_reason: "end_turn" };
    }
  });

  assert.ok(c.context.annotations.length >= 1);
  assert.equal(c.context.annotations.every((item) => item.source === "rule"), true);
  assert.equal(c.context.annotations.every((item) => c.context.material.includes(item.quote)), true);
});

await test('later freeform advice is audited against original material', async () => {
  const c = conversation();
  c.context.profile = {name:'张三'};
  c.context.annotations = [{quote:'使用 React 完成求职系统'}];
  let calls = 0;
  await runCareerAgent({conversation:c,emit:()=>{},persist:()=>{},model:async({system})=>{
    calls++;
    if (system.includes('事实审校员')) return {content:[{type:'text',text:JSON.stringify({answer:'请补充搜索功能中你实际负责的交互和验收方式。'})}]};
    return {content:[{type:'text',text:'写完成10个接口，提升30%。'}]};
  }});
  assert.equal(calls,2);
  assert.match(c.messages.at(-1).content,/实际负责/);
  assert.doesNotMatch(c.messages.at(-1).content,/10|30/);
});

await test('invalid annotation JSON is repaired without bypassing source validation', async () => {
  const c=conversation(); c.context.profile={name:'张三'};
  let repaired=false;
  await runCareerAgent({conversation:c,emit:()=>{},persist:()=>{},model:async({system})=>{
    if(system.includes('简历修改建议编辑')) return {content:[{type:'text',text:'{"annotations":[invalid'}]};
    if(system.includes('只修复JSON格式')) { repaired=true; return {content:[{type:'text',text:JSON.stringify({annotations:[{quote:'使用React完成求职系统',issue:'缺少职责',suggestion:'说明实际负责的交互。',reason:'便于核实贡献。',section:'projects',severity:'medium'}]})}]}; }
    return {content:[{type:'text',text:'已完成'}]};
  }});
  assert.equal(repaired,true);
  assert.equal(c.context.annotations[0].quote,'使用 React 完成求职系统');
  assert.equal(c.context.annotations[0].source,'model');
});

await test('superficial model comments do not omit project and internship evidence checks', async () => {
  const c=conversation();
  c.context.material+='\n工作与实习经历\n某公司前端实习，参与后台表单组件开发和接口联调。';
  c.context.profile={name:'张三'};
  await runCareerAgent({conversation:c,emit:()=>{},persist:()=>{},model:async({system})=>{
    if(system.includes('简历修改建议编辑')) return {content:[{type:'text',text:JSON.stringify({annotations:[{quote:'某大学计算机本科',issue:'补充学校全称',suggestion:'填写真实全称。',reason:'核对资料。',section:'education',severity:'low'}]})}]};
    return {content:[{type:'text',text:'已完成'}]};
  }});
  for(const section of ['projects','experience']) {
    const a=c.context.annotations.find(a=>a.section===section);
    assert.equal(a.source,'rule');assert(c.context.material.includes(a.quote));
  }
  assert.match(c.messages.at(-1).content,/职责边界/);
});
