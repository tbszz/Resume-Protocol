import { BriefcaseBusiness, Check, Copy, Printer, WandSparkles } from "lucide-react";
import { normalizeResultItems } from "../chatResults.js";

export function MessageResult({ message, context, onSelectJob, onCopyResume, onPrintResume }) {
  const data = message.data || {};
  if (message.kind === "diagnosis") return <DiagnosisResult data={data} context={context} />;
  if (message.kind === "jobs") return <JobsResult data={data} selectedJob={context?.selectedJob} onSelect={onSelectJob} />;
  if (message.kind === "resume") return <ResumeResult variant={data.variant} onCopy={onCopyResume} onPrint={onPrintResume} />;
  if (message.kind === "interview") return <InterviewResult plan={data.plan} />;
  if (message.kind === "target") return <TargetResult job={data.job} />;
  if (message.kind === "error") return <div className="inline-error">上下文已保留，可以重新发送这条指令。</div>;
  return null;
}

function DiagnosisResult({ data, context }) {
  const strengths = normalizeResultItems(data.strengths);
  const gaps = normalizeResultItems(data.gaps || data.missing);
  const annotations = Array.isArray(data.annotations) ? data.annotations : [];
  const materialStatus = data.materialStatus || data.parseStatus || null;
  const status = materialStatus?.status || "";
  const completeness = data.completeness === null || data.completeness === undefined ? NaN : Number(data.completeness);
  const statusCompleteness = materialStatus?.completeness === null || materialStatus?.completeness === undefined ? NaN : Number(materialStatus.completeness);
  const displayCompleteness = Number.isFinite(completeness) ? completeness : statusCompleteness;
  const hasKnownCompleteness = status === "parsed" && Number.isFinite(displayCompleteness);
  const hasReadableEvidence = status === "parsed" || strengths.length > 0 || annotations.length > 0;
  return (
    <div className="result-panel diagnosis-panel">
      <header>
        <div>
          <span>资料诊断</span>
          <small>{diagnosisStatusLabel(materialStatus, hasReadableEvidence)}</small>
        </div>
        {hasKnownCompleteness ? <strong>{Math.round(displayCompleteness)}<small>%</small></strong> : <strong className="diagnosis-state">未形成结论</strong>}
      </header>
      {!hasReadableEvidence ? <DiagnosisPending gaps={gaps} status={materialStatus} /> : null}
      {hasReadableEvidence ? <DiagnosisEvidence annotations={annotations} strengths={strengths} gaps={gaps} status={materialStatus} /> : null}
    </div>
  );
}

function DiagnosisPending({ gaps, status }) {
  return (
    <section className="diagnosis-summary pending">
      <h3>还不能诊断简历内容</h3>
      <p>{status?.message || "我只确认文件已经进入资料库；在读到姓名、经历、项目或技能等原文证据前，不展示完整度，也不把通用字段清单当作结论。"}</p>
      <div className="diagnosis-next">
        <span>下一步</span>
        <p>{gaps.length ? "优先处理可读取文本和关键经历证据。" : "重新上传可复制文本的 PDF/DOCX，或直接粘贴简历正文。"}</p>
      </div>
    </section>
  );
}

function DiagnosisEvidence({ annotations, strengths, gaps, status }) {
  return (
    <>
      <section className="diagnosis-summary">
        <h3>已读取到可用证据</h3>
        <p>{status?.message || (annotations.length ? `已定位 ${annotations.length} 条原文证据批注，后续改写会沿用这些来源。` : "已从原文中识别到简历结构，后续建议会继续以材料为边界。")}</p>
      </section>
      <ResultList title="已识别证据" items={strengths} positive />
      <ResultList title="下一步补充" items={gaps} />
    </>
  );
}

function diagnosisStatusLabel(status, hasReadableEvidence) {
  if (status?.status === "parsed") return "基于已读取的简历原文";
  if (status?.status === "needs_review") return "文件已保存，读取结果需要核对";
  if (status?.status === "unreadable") return "文件已保存，未读取到可用文本";
  return hasReadableEvidence ? "基于已读取的简历原文" : "文件已保存，等待可靠读取";
}

function JobsResult({ data, selectedJob, onSelect }) {
  const jobs = data.jobs || [];
  const uncertainties = data.uncertainties || [];
  const rejected = data.rejected || jobs.filter((job) => job.eligibility?.status === "rejected");
  const visibleJobs = jobs.filter((job) => job.eligibility?.status !== "rejected");
  if (!visibleJobs.length && !uncertainties.length && !rejected.length) return null;
  return (
    <div className="result-panel jobs-panel">
      <header><span>岗位候选</span><small>不符硬性条件的岗位不作为推荐</small></header>
      {visibleJobs.length ? (
        <div className="job-list">
          {visibleJobs.map((job) => {
            const selected = selectedJob?.id === job.id;
            const status = job.eligibility?.status || "verify";
            const link = safeHttpUrl(job.applyUrl || job.sourceUrl || job.url);
            return (
              <div key={job.id || `${job.company}-${job.title}`} className={`job-row ${status}` + (selected ? " selected" : "")}>
                <button type="button" onClick={() => onSelect(job)}>
                  <span className="job-icon"><BriefcaseBusiness size={16} /></span>
                  <span className="job-main">
                    <strong>{job.title}</strong>
                    <small>{job.company || "招聘团队"} · {job.location || "地点待确认"}</small>
                    <em>{eligibilityLabel(status)}</em>
                  </span>
                  <span className="job-score"><b>{job.fitScore || job.opportunityScore || job.matchScore || "--"}</b><small>参考</small></span>
                  <span className="job-action">{selected ? <><Check size={14} />已选择</> : "选择"}</span>
                </button>
                {link ? <a href={link} target="_blank" rel="noopener noreferrer">原文</a> : null}
              </div>
            );
          })}
        </div>
      ) : <p className="job-empty">没有发现硬性条件明确匹配的岗位。</p>}
      <JobNotes title="待核实" items={uncertainties} />
      <JobNotes title="不符条件" items={rejected} rejected />
    </div>
  );
}

function JobNotes({ title, items = [], rejected = false }) {
  if (!items.length) return null;
  return (
    <section className={"job-notes" + (rejected ? " rejected" : "")}>
      <h3>{title}</h3>
      {items.map((item) => <JobNote key={item.id || item.title || item.reason || item} item={item} />)}
    </section>
  );
}

function JobNote({ item }) {
  if (typeof item === "string") return <p>{item}</p>;
  const link = safeHttpUrl(item.applyUrl || item.sourceUrl || item.url);
  const checks = item.eligibility?.checks || [];
  return (
    <details className="job-note">
      <summary>{formatJobNote(item)}</summary>
      {item.eligibility?.reason || item.reason || item.note ? <p>{item.eligibility?.reason || item.reason || item.note}</p> : null}
      {checks.length ? <ul>{checks.map((check) => <li key={`${check.dimension}-${check.message}`}>{check.dimension}: {check.message || check.status}{check.evidence ? ` · ${check.evidence}` : ""}</li>)}</ul> : null}
      {link ? <a href={link} target="_blank" rel="noopener noreferrer">查看原文</a> : null}
    </details>
  );
}

function formatJobNote(item) {
  return [item.company, item.title, item.eligibility?.reason || item.reason || item.note].filter(Boolean).join(" · ");
}

function eligibilityLabel(status) {
  if (status === "passed") return "硬性条件匹配";
  if (status === "verify") return "需要核验资格";
  return "条件不符";
}

function ResumeResult({ variant, onCopy, onPrint }) {
  if (!variant) return null;
  const resumeText = formatResumeText(variant);
  return (
    <div className="result-panel resume-panel">
      <header>
        <div><span>岗位版简历</span><h3>{variant.title}</h3></div>
        <strong>{variant.fitScore}<small>/100</small></strong>
      </header>
      <div className="resume-identity">
        <strong>{variant.name || "姓名待补充"}</strong>
        <span>{[variant.targetTitle || variant.title, ...Object.values(variant.contact || {}).filter(Boolean)].filter(Boolean).join(" · ")}</span>
      </div>
      <p className="resume-summary">{variant.summary}</p>
      <div className="result-toolbar">
        <button type="button" onClick={() => onCopy(resumeText)}><Copy size={15} />复制</button>
        <button type="button" onClick={(event) => onPrint(event.currentTarget.closest(".resume-panel"))}><Printer size={15} />打印 PDF</button>
      </div>
      <ResumeSection title="教育经历" items={variant.education} />
      <ResumeSection title="技能" items={variant.skills} inline />
      <ResumeSection title="项目经历" items={variant.projects} numbered />
      <ResumeSection title="工作与实习经历" items={variant.experience} />
      <ResumeSection title="荣誉与证书" items={variant.awards} />
      <footer><WandSparkles size={14} />{variant.interviewPlan ? "已包含针对性面试计划" : "可继续生成针对性面试计划"}</footer>
    </div>
  );
}

function InterviewResult({ plan }) {
  if (!plan) return null;
  return (
    <div className="result-panel interview-panel">
      <header><span>面试准备</span><small>{plan.roleLabel}</small></header>
      <div className="topic-row">
        {(plan.technicalTopics || []).map((topic) => (
          <span key={topic.id || topic.title}><b>{topic.priority}</b>{topic.title}</span>
        ))}
      </div>
      <div className="interview-columns">
        <section>
          <h3>项目追问</h3>
          {(plan.resumeDefense || []).map((question) => <p key={question}>{question}</p>)}
        </section>
        <section>
          <h3>七天节奏</h3>
          {(plan.schedule || []).slice(0, 7).map((item) => (
            <p key={item.day}><b>{item.day}</b><span>{item.title}</span></p>
          ))}
        </section>
      </div>
    </div>
  );
}

function TargetResult({ job }) {
  if (!job) return null;
  return (
    <div className="target-card">
      <span><BriefcaseBusiness size={15} />当前目标</span>
      <strong>{job.company} · {job.title}</strong>
    </div>
  );
}

function ResultList({ title, items = [], positive = false }) {
  const normalizedItems = Array.isArray(items) && items.every((item) => typeof item === "string") ? items.filter(Boolean) : normalizeResultItems(items);
  if (!normalizedItems.length) return null;
  return (
    <section className={"result-list" + (positive ? " positive" : "")}>
      <h3>{title}</h3>
      {normalizedItems.slice(0, 4).map((item) => <p key={item}><span aria-hidden="true">{positive ? <Check size={12} /> : "→"}</span><span>{item}</span></p>)}
    </section>
  );
}

function ResumeSection({ title, items = [], inline = false, numbered = false }) {
  if (!items.length) return null;
  if (inline) {
    return (
      <section className="resume-section">
        <h3>{title}</h3>
        <div className="skill-row">{items.map((item) => <span key={item}>{item}</span>)}</div>
      </section>
    );
  }
  return (
    <section className="resume-section">
      <h3>{title}</h3>
      <div className={numbered ? "project-output" : "resume-list"}>
        {items.map((item, index) => (
          <div key={item}><span>{numbered ? String(index + 1).padStart(2, "0") : "•"}</span><p>{item}</p></div>
        ))}
      </div>
    </section>
  );
}

function formatResumeText(variant) {
  const contact = Object.values(variant.contact || {}).filter(Boolean).join(" · ");
  const section = (title, items = []) => items.length ? [`## ${title}`, ...items.map((item) => "- " + item), ""] : [];
  return [
    "# " + (variant.name || "个人简历"),
    variant.targetTitle || variant.title || "",
    contact,
    "",
    variant.summary,
    "",
    ...section("教育经历", variant.education),
    ...section("技能", variant.skills),
    ...section("项目经历", variant.projects),
    ...section("工作与实习经历", variant.experience),
    ...section("荣誉与证书", variant.awards)
  ].filter(Boolean).join("\n");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
