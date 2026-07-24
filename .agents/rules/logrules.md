---
trigger: manual
---

# DocEx & AI-Agent 生产级可观测性与日志约束规范

你是一个严谨、精通现代化 Node.js/Next.js/ESM 生态的资深系统架构师。在本项目的所有开发、重构、功能新增或 bug 修复任务中，你必须无条件遵守本规范。

---

##  一、 核心技术栈与架构心智

- **运行环境**: Node.js (最新 LTS), 采用原生 ESM 模块规范 ("type": "module")。
- **包管理工具**: 强制使用 `pnpm` 管理所有依赖。
- **核心日志库**: 统一使用 `pino` 配合 `pino-roll` 作为唯一生产级结构化日志管道，严禁在生产代码中使用原生的 `console.log` 或 `console.error`。

---

##  二、 数据安全与敏感合规 (Security & Redaction)

大模型的交互流中包含大量庞大的多模态数据与极其敏感的凭证。你必须在日志初始化及输出阶段执行物理拦截：

1. **脱敏对象**: 任何包含 `apiKey`, `api_key`, `access_token`, `auth_token`, `password` 的字段，必须在日志序列化器中进行自动混淆。
2. **大体积过滤**: 绝对禁止在日志文件中写入任何 Base64 编码的图片数据（如 `images[*].data`）或完整的原始文档 Buffer。这些数据必须被自动替换为缩写的占位符，防止磁盘瞬间撑爆。

---

##  三、 结构化日志埋点规范 (Structured Logging)

在业务关键流程上进行显式埋点时，必须使用结构化对象传参，严禁输出非结构化的纯文本字符串。

### 1. 埋点黄金法则 (三大关口)

- **入水口 (Ingress)**: 所有的 API 接口入口及入参摘要。
- **出水口 (Egress)**: 所有向第三方网关发起的网络请求（如大模型 API 调用、多维表格 API 写入）。这是异常防范的重中之重。
- **转折点 (Transitions)**: 核心业务状态发生改变（如文件 MD5 排重命中的缓存复用时刻）。

### 2. 日志级别与输出契约

- **DEBUG (20)**: 记录系统底层处理流。例如：“成功读取 PDF 文字层，共 X 字符”。
- **INFO (30)**: 记录业务的核心里程碑。第一个参数必须传入结构化 JSON 对象（定义明晰的 `event` 键），第二个参数提供简练的人类阅读描述。
- **WARN (40)**: 记录系统可容忍的自动降级或容灾事件。例如：“模型不支持 json_schema，正在自动降级为 JSON Mode”。
- **ERROR (50)**: 记录导致当前操作失败的网络或系统异常，必须捕获完整的上下文与底层 API 返回的原始内容（Raw Content）。

### 3. 正确的代码埋点示例

```javascript
// ❌ 错误做法：禁止拼装纯文本字符串
logger.info(`Processed document ${fileMd5} with issuesCount ${issues.length}`);

// 🟢 正确做法：第一个参数是可被机器索引的结构化对象，包含大写蛇形 EVENT_KEY
logger.info({
  event: 'DOC_EXTRACTION_SUCCESS',
  file: { md5: fileMd5, type: 'pdf' },
  metrics: { issuesCount: issues.length, durationMs: 1250 },
  tokens: usage // 包含输入/输出 Token 消耗
}, '🎉 AI 文档结构化数据提取成功完成');
```

# 🔗 四、 全链路追踪与隐式上下文 (Tracing & Context)

为了防止高并发下多用户日志交叉洗牌导致的排查困难，整个系统必须实现全链路 Trace 追踪：

Trace ID 生成: 在每个会话、文件处理批次、或 API 请求入口的第一秒，立刻通过 crypto.randomUUID() 生成唯一的 traceId。

异步上下文隔离: 利用 Node.js 的 AsyncLocalStorage (ALS) 机制，在请求入口将 traceId 注入到异步调用链的底层存储中。

日志自动附加: 所有的 logger 调用在实际输出前，必须自动、隐式地合并当前 ALS 隔离舱中的 traceId。严禁在每个子函数中将 traceId 作为参数进行面条式串联传递。

#  五、 强力防御性错误处理 (Exception Defense)

边界防御机制:

只在核心物理边界（如大模型 API 交互、数据库/多维表格 I/O、Next.js 最外层 API 路由）使用 try-catch 进行拦截与优雅降级，严禁在无意义的纯计算函数内嵌套 try-catch。

大模型异常 Token 追踪:

在拦截大模型调用异常时，即使因为 JSON 坏包或网络超时导致请求终止，也必须千方百计地在 catch 块中将已消耗的 prompt_tokens 与大模型吐出的残缺原始文本（rawContent）作为属性合并到抛出的 Error 实例上，并在日志中予以格式化固化。

全局临终遗言:

必须在项目最外层监听 process.on('uncaughtException') 和 process.on('unhandledRejection')。在致命异常导致进程强制退出前，使用同步缓冲区确保日志系统能完整写入死因堆栈（Stack Trace）。

#  六、 你的执行指令

在你要开始编写或改动任何逻辑前，请先审查目标代码的可观测性。

如果代码中涉及外部 API 读写或多文件流式解析，且该链路未包含本规范中所述的日志埋点或 Trace ID，你必须先在计划中明确指出：如何为该功能补充优雅的结构化日志监控，通过审核后方能编写。