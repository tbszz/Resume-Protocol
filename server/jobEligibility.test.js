import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateJobEligibility, filterEligibleJobs } from "./jobEligibility.js";

const bachelorProfile = {
  education: ["华东某大学 计算机科学 本科 2022-2026"],
  skills: ["React", "TypeScript", "Python", "FastAPI", "PostgreSQL", "Git"],
  projects: ["校园岗位助手：使用 React、TypeScript 和 FastAPI 开发岗位搜索与收藏系统。"],
  experience: ["某软件公司 前端实习：参与后台表单组件开发和接口联调。"]
};

const material = [
  "张三",
  "华东某大学 计算机科学 本科 2022-2026",
  "校园岗位助手：使用 React、TypeScript 和 FastAPI 开发岗位搜索与收藏系统。",
  "某软件公司 前端实习：参与后台表单组件开发和接口联调。",
  "技能栈 React TypeScript Python FastAPI PostgreSQL Git"
].join("\n");

await test("rejects PhD-only internships for a bachelor profile", () => {
  const result = evaluateJobEligibility({
    id: "phd-ai",
    title: "Machine Learning PhD Intern",
    description: "Must be enrolled in a PhD program. Internship for PhD students.",
    requirements: ["PhD required"],
    type: "internship",
    location: "United States",
    postingAge: "1d",
    matchScore: 95
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "rejected");
  assert.equal(result.checks.some((check) => check.dimension === "education" && check.status === "fail"), true);
  assert.match(result.reason, /博士|PhD/);
});

await test("keeps overseas work authorization as verify when candidate material is silent", () => {
  const result = evaluateJobEligibility({
    id: "us-fe",
    title: "Frontend Intern",
    description: "Applicants must already have US work authorization. No visa sponsorship.",
    requirements: ["US work authorization required"],
    type: "internship",
    location: "New York, NY",
    postingAge: "2d",
    matchScore: 88
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "verify");
  assert.equal(result.checks.some((check) => check.dimension === "work_authorization" && check.status === "unknown"), true);
});

await test("rejects expired or closed jobs", () => {
  const result = evaluateJobEligibility({
    id: "closed-fe",
    title: "Frontend Intern",
    description: "Applications closed. Deadline: 2026-08-01.",
    requirements: ["React"],
    type: "internship",
    location: "上海",
    matchScore: 88
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "rejected");
  assert.equal(result.checks.some((check) => check.dimension === "freshness" && check.status === "fail"), true);
});

await test("rejects explicit major mismatch and keeps only passed jobs in recommendation list", () => {
  const jobs = [
    {
      id: "marketing",
      title: "市场营销管培生",
      description: "硬性要求：市场营销、广告学相关专业。",
      requirements: ["市场营销专业"],
      type: "campus",
      location: "上海",
      postingAge: "1d",
      matchScore: 91
    },
    {
      id: "react",
      title: "前端开发工程师（校招）",
      description: "计算机相关专业，掌握 React、TypeScript、Git。",
      requirements: ["React", "TypeScript", "Git"],
      type: "campus",
      location: "上海",
      postingAge: "1d",
      matchScore: 86
    },
    {
      id: "auth",
      title: "Frontend Intern",
      description: "US work authorization required.",
      requirements: ["React"],
      type: "internship",
      location: "United States",
      postingAge: "1d",
      matchScore: 95
    }
  ];
  const result = filterEligibleJobs(jobs, bachelorProfile, { material, type: "campus", now: "2026-09-08T00:00:00.000Z" });

  assert.deepEqual(result.jobs.map((job) => job.id), ["react"]);
  assert.deepEqual(result.rejected.map((job) => job.id), ["marketing", "auth"]);
  assert.equal(result.jobs[0].eligibility.status, "passed");
  assert.equal(result.uncertainties.length, 0);
});

await test("does not reject PhD preference when bachelor or master is accepted", () => {
  const result = evaluateJobEligibility({
    id: "research",
    title: "AI Research Intern",
    description: "Bachelor or Master students accepted. PhD preferred. React and TypeScript required.",
    requirements: ["Bachelor or Master", "PhD preferred", "React", "TypeScript"],
    type: "internship",
    location: "上海",
    postingAge: "1d",
    matchScore: 84
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.notEqual(result.status, "rejected");
  assert.equal(result.checks.some((check) => check.dimension === "education" && check.status === "fail"), false);
});

await test("keeps unknown education as verify instead of guessing bachelor from computer words", () => {
  const result = evaluateJobEligibility({
    id: "bachelor-required",
    title: "Frontend Intern",
    description: "Bachelor degree required. React and TypeScript required.",
    requirements: ["Bachelor required", "React", "TypeScript"],
    type: "internship",
    location: "上海",
    postingAge: "1d",
    matchScore: 80
  }, { ...bachelorProfile, education: ["计算机课程项目经历"] }, { material: "计算机课程项目经历\nReact TypeScript", type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "verify");
  assert.equal(result.checks.some((check) => check.dimension === "education" && check.status === "unknown"), true);
});

await test("compares explicit experience years and does not treat dates as years of experience", () => {
  const tooJunior = evaluateJobEligibility({
    id: "senior",
    title: "Frontend Engineer",
    description: "5+ years frontend experience required. React and TypeScript required.",
    requirements: ["5+ years experience", "React", "TypeScript"],
    type: "social",
    location: "上海",
    postingAge: "1d",
    matchScore: 80
  }, { ...bachelorProfile, experience: ["2年 前端开发经验"] }, { material: `${material}\n2年 前端开发经验`, type: "social", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(tooJunior.status, "rejected");
  assert.equal(tooJunior.checks.some((check) => check.dimension === "experience" && check.status === "fail"), true);

  const dateOnly = evaluateJobEligibility({
    id: "mid",
    title: "Frontend Engineer",
    description: "3+ years frontend experience required. React and TypeScript required.",
    requirements: ["3+ years experience", "React", "TypeScript"],
    type: "social",
    location: "上海",
    postingAge: "1d",
    matchScore: 80
  }, bachelorProfile, { material: `${material}\n2025年7月至9月 某软件公司 前端实习`, type: "social", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(dateOnly.status, "verify");
  assert.equal(dateOnly.checks.some((check) => check.dimension === "experience" && check.status === "unknown"), true);
});

await test("marks overseas locations as verify without positive authorization and rejects explicit no visa material", () => {
  const remoteUs = {
    id: "remote-us",
    title: "Frontend Intern",
    description: "React and TypeScript required.",
    requirements: ["React", "TypeScript"],
    type: "internship",
    location: "Remote US",
    postingAge: "1d",
    matchScore: 82
  };

  const unknownAuth = evaluateJobEligibility(remoteUs, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });
  assert.equal(unknownAuth.status, "verify");
  assert.equal(unknownAuth.checks.some((check) => check.dimension === "work_authorization" && check.status === "unknown"), true);

  const noVisa = evaluateJobEligibility(remoteUs, bachelorProfile, { material: `${material}\n目前没有签证或海外工作许可`, type: "internship", now: "2026-09-08T00:00:00.000Z" });
  assert.equal(noVisa.status, "rejected");
  assert.equal(noVisa.checks.some((check) => check.dimension === "work_authorization" && check.status === "fail"), true);
});

await test("matches required skills by exact terms and keeps partial required skills as verify", () => {
  const noGo = evaluateJobEligibility({
    id: "go",
    title: "Go Backend Intern",
    description: "Go required. PostgreSQL preferred.",
    requirements: ["Go required"],
    type: "internship",
    location: "上海",
    postingAge: "1d",
    matchScore: 80
  }, { ...bachelorProfile, skills: ["Google Analytics", "JavaScript"] }, { material: "Google Analytics JavaScript email", type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(noGo.status, "rejected");
  assert.equal(noGo.checks.some((check) => check.dimension === "skills" && check.status === "fail"), true);

  const partial = evaluateJobEligibility({
    id: "react-ts",
    title: "Frontend Intern",
    description: "React and TypeScript required.",
    requirements: ["React", "TypeScript"],
    type: "internship",
    location: "上海",
    postingAge: "1d",
    matchScore: 80
  }, { ...bachelorProfile, skills: ["React"], projects: [], experience: [] }, { material: "React", type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(partial.status, "verify");
  assert.equal(partial.checks.some((check) => check.dimension === "skills" && check.status === "unknown"), true);
});

await test("keeps incomplete aggregator records as verify even when title matches", () => {
  const result = evaluateJobEligibility({
    id: "title-only",
    title: "Frontend Intern",
    type: "internship",
    location: "上海",
    matchScore: 88
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "verify");
  assert.equal(result.checks.some((check) => check.dimension === "source_completeness" && check.status === "unknown"), true);
  assert.equal(result.checks.some((check) => check.dimension === "freshness" && check.status === "unknown"), true);
});

await test("keeps GitHub adapter metadata-only records as verify and ignores fetchedAt as freshness proof", () => {
  const result = evaluateJobEligibility({
    id: "github-summary",
    source: "github-job-source",
    title: "Frontend Intern",
    description: "Acme 校招/New Grad岗位。 岗位：Frontend Intern 地点：Remote US 来源仓库：https://github.com/example/jobs",
    requirements: ["来源：2026 SWE College Jobs", "岗位类型：实习/Intern", "地点：Remote US"],
    type: "internship",
    location: "Remote US",
    updatedAt: "2026-09-08T00:00:00.000Z",
    matchScore: 90
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "verify");
  assert.equal(result.checks.some((check) => check.dimension === "source_completeness" && check.status === "unknown"), true);
  assert.equal(result.checks.some((check) => check.dimension === "freshness" && check.status === "unknown"), true);
});

await test("marks PhD internship titles as education verification when hard requirement is not explicit", () => {
  const result = evaluateJobEligibility({
    id: "phd-title",
    title: "Data Science: AI Experiences PhD Internship",
    description: "Work on AI experiences with Python.",
    requirements: ["Python"],
    type: "internship",
    location: "上海",
    postingAge: "1d",
    matchScore: 86
  }, bachelorProfile, { material, type: "internship", now: "2026-09-08T00:00:00.000Z" });

  assert.equal(result.status, "verify");
  assert.equal(result.checks.some((check) => check.dimension === "education" && check.status === "unknown"), true);
});

await test("passes matching marketing major and keeps unknown major as verify", () => {
  const marketing = evaluateJobEligibility({
    id: "marketing-ok",
    title: "市场营销管培生",
    description: "硬性要求：市场营销、广告学相关专业。要求掌握SQL。",
    requirements: ["市场营销专业", "SQL"],
    type: "campus",
    location: "上海",
    postingAge: "1d",
    matchScore: 75
  }, { education: ["某大学 市场营销 本科 2022-2026"], skills: ["SQL"], projects: [], experience: [] }, { material: "某大学 市场营销 本科 2022-2026\nSQL", type: "campus", now: "2026-09-08T00:00:00.000Z" });
  assert.equal(marketing.status, "passed");

  const unknown = evaluateJobEligibility({
    id: "marketing-unknown",
    title: "市场营销管培生",
    description: "硬性要求：市场营销、广告学相关专业。要求掌握SQL。",
    requirements: ["市场营销专业", "SQL"],
    type: "campus",
    location: "上海",
    postingAge: "1d",
    matchScore: 75
  }, { education: ["某大学 本科 2022-2026"], skills: ["SQL"], projects: [], experience: [] }, { material: "某大学 本科 2022-2026\nSQL", type: "campus", now: "2026-09-08T00:00:00.000Z" });
  assert.equal(unknown.status, "verify");
  assert.equal(unknown.checks.some((check) => check.dimension === "major" && check.status === "unknown"), true);
});
