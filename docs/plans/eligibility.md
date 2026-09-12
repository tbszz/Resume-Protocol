# Eligibility Contract

岗位搜索先做资格判别，再做排序。这个规则来自一次概念拆解：把“推荐岗位”拆成可审计的原子事实，而不是把标题匹配当成推荐。

## Decision Order

1. 明确不符合硬条件的岗位进入 `rejected`，不能进入推荐卡，也不能进入 `context.jobs` 可选列表。
2. 条件未知或聚合信息不足的岗位进入 `uncertainties`，只能展示为“待核实”，不能称为推荐。
3. 只有 `passed` 岗位进入 `jobs`，再按资格分与匹配分排序。

## Checked Dimensions

每个岗位带 `eligibility`：

```json
{
  "status": "passed | verify | rejected",
  "reason": "中文原因",
  "score": 92,
  "checks": [
    {
      "dimension": "education | major | experience | work_authorization | job_type | skills | freshness | source_completeness",
      "status": "pass | unknown | fail",
      "message": "中文判断",
      "evidence": "来自岗位或材料的证据片段"
    }
  ]
}
```

## Public Search Result

`search_jobs` 的工具结果和 `kind: "jobs"` 消息 data 都返回：

```json
{
  "jobs": [],
  "uncertainties": [],
  "rejected": [],
  "sources": [],
  "query": "React frontend"
}
```

`jobs` 只包含资格通过的岗位。`uncertainties` 用于前端展示待核实原因，例如海外工作授权、完整 JD 缺失、学历或技能证据不足、时效未证实。`rejected` 可用于审计或折叠展示，不应出现在推荐卡或可选岗位列表。

## Resume Annotations

`analyze_resume` 和可行时的 `generate_resume` 会返回 `annotations`：

```json
{
  "id": "a1",
  "quote": "必须逐字来自原始简历",
  "issue": "问题",
  "suggestion": "建议",
  "reason": "原因",
  "section": "projects",
  "severity": "medium",
  "source": "model | rule"
}
```

模型建议只有在 `quote` 能精确定位到原始材料时才会保留。模型没有返回可定位建议时，后端只返回基础规则检查，并标记 `source: "rule"`。
