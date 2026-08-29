# Resume Protocol 重构技术设计

- 状态：已确认
- 日期：2026-08-30
- 对应 PRD：`docs/prd/2026-08-30-resume-protocol-prd.md`

## 1. 设计目标

本设计将现有内存态单页原型重构为可在单台云服务器持续运行的模块化应用。重点不是增加更多采集脚本，而是建立稳定的个人背景库、岗位监控、匹配解释和事实约束简历生成闭环。

## 2. 总体架构

```text
┌─────────────────────────────────────────┐
│ React Web                               │
│ 背景库 | 监控方案 | 岗位雷达 | 简历工作台 │
└──────────────────┬──────────────────────┘
                   │ HTTPS / JSON
┌──────────────────▼──────────────────────┐
│ Node.js API（模块化单体）               │
│ auth | profile | monitoring | jobs      │
│ matching | resumes | exports | notices  │
└───────────┬───────────────────┬─────────┘
            │                   │
┌───────────▼────────┐ ┌────────▼─────────┐
│ PostgreSQL         │ │ 私有附件存储      │
│ 业务数据＋任务租约 │ │ 本地卷或 S3 兼容  │
└───────────▲────────┘ └──────────────────┘
            │
┌───────────┴─────────────────────────────┐
│ Worker / Scheduler                      │
│ 采集 → 标准化 → 快照 → 匹配 → 简历生成  │
└───────────┬─────────────────────────────┘
            │ 子进程 JSON 契约
┌───────────▼─────────────────────────────┐
│ Python Hiring-Radar Collector           │
│ 固定上游提交，仅负责读取公开岗位         │
└─────────────────────────────────────────┘
```

P0 采用模块化单体，而不是拆分多个网络微服务。API 与 Worker 可以共享领域代码，但以不同进程启动。这样既能隔离长任务，也能保持部署和调试简单。

## 3. 模块边界

### 3.1 `profile`

负责文件接收、文本提取、事实解析、来源追溯、冲突检测和背景库编辑。模型输出不得直接写入简历，必须先转换为受约束的事实记录。

### 3.2 `monitoring`

负责监控方案、调度时间、任务租约、超时、重试、熔断和运行日志。

### 3.3 `collectors`

定义统一 `JobCollector` 契约，Hiring-Radar 是首个实现。业务层只能接收内部 `CollectedJob`，不能依赖上游字段命名。

### 3.4 `jobs`

负责岗位标准化、唯一标识、快照、生命周期、搜索和筛选。

### 3.5 `matching`

负责 JD 解析、事实召回、硬性条件检查、评分和解释。

### 3.6 `resumes`

负责模板、事实选材、模型生成、真实性校验、版本和导出。

### 3.7 `notifications`

负责站内事件。外部通知渠道通过适配器扩展。

## 4. Hiring-Radar 集成

### 4.1 采用方式

采用 `wrap first, fork later`：

- 固定上游提交 `f49ec607e4cb89091a9447c9f527e43d0afdc6a4`。
- 将其作为独立 Python 运行时或受控 vendor 目录部署。
- 保留 MIT License、版本和上游来源说明。
- Node Worker 使用参数数组调用 CLI，不拼接 shell 字符串。
- 强制使用 `--json`，stdout 只允许 JSON；stderr 作为任务日志保存。

暂不将 Hiring-Radar 直接改写为 JavaScript，也不让它直接连接业务数据库。

### 4.2 Windows 兼容

上游为本地解析器硬编码 `python3`，在只有 `python.exe` 的 Windows 环境会失败。包装层必须使用已配置的 Python 可执行文件；若维护 vendor 补丁，应将子解析器改为 `sys.executable`。

### 4.3 进程约束

每个来源调用必须设置：

- 任务级超时，初始建议 90 秒。
- stdout 大小上限。
- stderr 截断与保存。
- 退出码映射。
- 一次有限重试。
- 来源级指数退避和熔断。

### 4.4 数据契约

上游字段映射为：

```ts
type CollectedJob = {
  sourceKey: string;
  sourceJobId?: string;
  title: string;
  company: string;
  department?: string;
  team?: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  publishedAt?: string;
  updatedAt?: string;
  compensation?: string;
  description: string;
  detailUrl?: string;
  applyUrl?: string;
  rawPayload: unknown;
};
```

适配层使用运行时 schema 校验。字段缺失可以降级，但 title、company、description 与至少一个稳定链接或来源 ID 不得同时为空。

## 5. 调度与任务状态

### 5.1 数据库任务表

任务表至少保存：

- `id`、`type`、`payload`。
- `status`：queued/running/succeeded/failed/cancelled。
- `available_at`、`leased_until`、`leased_by`。
- `attempts`、`max_attempts`。
- `last_error`、`started_at`、`finished_at`。

Worker 使用带条件更新的租约获取任务。进程崩溃后租约到期，任务可以重新领取。任务处理必须幂等。

### 5.2 监控任务生成

Scheduler 每分钟扫描已启用监控方案。到期方案按“方案＋来源＋计划时间桶”生成幂等键，避免多个实例重复入队。

### 5.3 失败策略

- 网络超时：短退避重试。
- 上游字段变化：记录 schema 错误并熔断来源。
- 全部来源失败：监控方案标记 degraded，不删除已有岗位。
- 模型失败：与采集任务隔离，不回滚已入库岗位。

## 6. 数据模型

### 6.1 背景库

#### `documents`

保存附件元数据、对象存储键、哈希、MIME、大小、解析状态和错误。

#### `profile_facts`

保存事实类别、结构化值、原文片段、置信度、启用状态和规范化时间范围。

#### `fact_sources`

关联事实与文档，保存页码、段落或字符区间。一个事实可以来自多个材料。

#### `fact_conflicts`

保存互相矛盾的事实关系和用户处理状态。

### 6.2 监控与岗位

#### `monitor_profiles`

保存名称、关键词、排除词、地点、岗位类型、频率、阈值和状态。

#### `monitor_sources`

保存监控方案选择的公司、Hiring-Radar source key 和来源配置。

#### `collection_runs`

保存每次来源采集的时间、状态、数量、耗时、上游版本和错误。

#### `job_postings`

保存岗位稳定标识、当前字段、生命周期、首次和最后出现时间。

#### `job_snapshots`

保存每次重要变化的内容哈希、完整 JD、结构化字段和采集时间。

#### `job_matches`

保存岗位快照、背景库版本、总分、分项得分、命中事实和能力缺口。

### 6.3 简历

#### `resume_drafts`

关联岗位快照、匹配结果、模板、生成状态和模型信息。

#### `resume_versions`

保存版本号、结构化内容、来源版本、编辑者和确认状态。

#### `resume_claim_sources`

把简历中的每条 claim 或 bullet 关联到一个或多个 `profile_facts`。

## 7. 岗位去重与生命周期

### 7.1 唯一标识

优先级：

1. `sourceKey + sourceJobId`。
2. 规范化 apply URL。
3. `sourceKey + normalized(company/title/location/detailUrl)` 的哈希。

### 7.2 内容哈希

对规范化后的标题、地点、类型、薪资和 JD 计算内容哈希。哈希变化时创建新快照，并判断是否需要重新匹配和生成草稿。

### 7.3 下线判断

不能因一次缺失直接关闭岗位。每次完整来源采集完成后，更新该来源的出现集合；连续三轮缺失标记疑似下线，超过配置时间再关闭。失败或部分采集不得推进缺失计数。

## 8. 匹配设计

### 8.1 输入

- 当前岗位快照。
- 启用状态的背景事实。
- 用户偏好。
- 匹配权重版本。

### 8.2 输出

- 总分及五类分项得分。
- 硬性条件风险。
- 命中的 `fact_ids`。
- 未命中的岗位要求。
- 推荐用于简历的事实排序。

### 8.3 可重复性

评分结果记录规则版本、模型版本和背景库版本。相同输入在确定性规则部分必须产生相同结果。

## 9. 简历生成设计

### 9.1 阶段一：事实选材

根据岗位要求检索并排序事实，生成只包含 `fact_ids`、章节和目标长度的简历计划。选材阶段不产生新事实。

### 9.2 阶段二：受约束表达

把事实原文、目标岗位和模板约束交给模型，要求输出结构化 JSON。每个 bullet 必须返回引用的 `fact_ids`。

### 9.3 阶段三：真实性校验

- 引用的事实必须存在且启用。
- 技能、公司、项目、时间和指标与事实不冲突。
- 未引用事实的经历或成果不得通过。
- 缺口只能进入分析区，不能进入简历正文。

校验失败时先进行一次受限修复；仍失败则删除异常 claim，并在草稿中提示。

### 9.4 本地规则降级

模型不可用时，使用事实排序和模板拼装生成基础简历，不执行开放式改写。降级版本必须在 UI 明确标记。

## 10. API 草案

### 背景库

- `POST /api/documents`
- `GET /api/documents`
- `GET /api/profile/facts`
- `PATCH /api/profile/facts/:id`
- `DELETE /api/profile/facts/:id`
- `GET /api/profile/conflicts`

### 监控方案

- `GET /api/monitor-profiles`
- `POST /api/monitor-profiles`
- `PATCH /api/monitor-profiles/:id`
- `POST /api/monitor-profiles/:id/run`
- `GET /api/monitor-profiles/:id/runs`

### 岗位

- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/snapshots`
- `GET /api/jobs/:id/match`

### 简历

- `GET /api/resume-drafts`
- `POST /api/jobs/:id/resume-drafts`
- `GET /api/resume-drafts/:id`
- `POST /api/resume-drafts/:id/versions`
- `POST /api/resume-versions/:id/export`

### 任务与通知

- `GET /api/tasks/:id`
- `GET /api/notifications`
- `PATCH /api/notifications/:id`

## 11. 前端结构

建议目录按领域拆分：

```text
src/
├── app/
├── features/
│   ├── profile/
│   ├── monitoring/
│   ├── jobs/
│   ├── resumes/
│   ├── notifications/
│   └── settings/
├── components/
├── api/
└── styles/
```

服务端建议按同样领域边界组织 route、service、repository 和 schema，避免继续扩大 `server/index.js`。

## 12. 部署

Docker Compose 包含：

- `web-api`：构建前端并提供 API。
- `worker`：执行采集、匹配、模型和导出任务。
- `postgres`：业务数据库。
- 可选 `object-storage`：本地部署时可用 MinIO；也可直接使用云对象存储。

单台服务器 P0 不引入 Kubernetes。Web/API 和 Worker 使用同一镜像的不同启动命令，Python 采集运行时随 Worker 镜像安装。

## 13. 安全设计

- 单用户认证使用安全会话 cookie，生产环境强制 HTTPS。
- 模型密钥和存储凭据只通过环境变量或挂载密钥提供。
- 子进程参数使用 allowlist，禁止任意脚本路径和任意 shell。
- Hiring-Radar slug、公司 key 和关键词分别校验长度与字符范围。
- 附件下载使用鉴权接口或短期签名 URL。
- 日志不记录简历全文、附件内容和模型密钥。
- Moka 来源默认禁用。

## 14. 测试策略

### 单元测试

- 事实解析、冲突检测和来源关联。
- 上游字段映射、schema 校验和岗位指纹。
- 快照变化与下线状态机。
- 调度租约和幂等键。
- 匹配评分和事实召回。
- 真实性校验与异常 claim 删除。

### 集成测试

- 使用 fixture 执行 Hiring-Radar JSON 契约测试。
- PostgreSQL repository 和事务测试。
- 文件解析与对象存储测试。
- 模型适配器成功、超时、限流和错误输出测试。

### API 测试

覆盖背景库、监控方案、任务、岗位、草稿、版本和导出权限。

### 端到端测试

固定 fixture 完成：上传材料 → 自动入库 → 创建监控方案 → 模拟发现岗位 → 自动生成草稿 → 编辑 → 导出。

### 持续运行测试

验证重复调度不产生重复岗位或草稿，Worker 中断后租约能够恢复，单来源失败不阻塞其他来源。

## 15. 迁移顺序

1. 建立构建基线，修复依赖和测试环境。
2. 引入数据库、迁移框架和 repository 层，替换内存状态。
3. 建立背景事实及来源模型，修复现有材料解析。
4. 接入 Hiring-Radar 适配器及契约测试。
5. 实现监控方案、调度、快照和岗位生命周期。
6. 实现透明匹配和自动草稿触发。
7. 实现事实约束生成、版本和导出。
8. 拆分前端领域模块并完成端到端流程。
9. 完成 Docker Compose、监控、备份和安全收口。

详细实施任务、测试先后和文件级修改将在单独的 implementation plan 中给出。
