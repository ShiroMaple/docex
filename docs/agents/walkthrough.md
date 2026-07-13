# docex “文本辅助 + 视觉优先”双路混合重构完成总结

本项目已彻底移除对 Google Gemini 模式的支持，精简了配置结构，全面聚焦于国内的 OpenAI 兼容端（如 MiMo-V2.5 ）。同时，针对 PDF 和 DOCX 文档，实现了高精度、高容错的**“文本辅助 + 视觉主通道”双路融合重构**，并新增了 **Token 消耗统计和输出功能**。

---

## 🛠️ 修改细节一览

### 1. 依赖依赖项升级
- 卸载了与系统冲突的 `pdf-parse` 和存在 native 编译问题的 `pdf-img-convert`。
- 安装了 **`pdfjs-dist@5.4.296`** 和 **`pdf-to-png-converter@4.1.1`**。
  - *注*：`pdf-to-png-converter` 底层使用 `@napi-rs/canvas`，在 Windows 运行环境下拥有**免安装编译工具链**的免环境配置特性。
  - *注*：统一锁定 `pdfjs-dist` 版本为 `5.4.296`，彻底消除了不同库之间引用的 API 和 Worker 版本冲突问题。

### 2. PDF 双路解析器实现
- **文字层提取（辅助通道）**：
  直接在 [pdfExtractor.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/extractors/pdfExtractor.js) 中利用同一版本的 `pdfjs-dist` 读取 PDF 字符流（`getTextContent`），如果解析失败（如纯扫描/图片 PDF），优雅退化为返回空字符串 `""`，继续运行而不报错中断。
- **页面图片通道（主视觉通道）**：
  利用 `pdfToPng` 将页面渲染为高分辨率的 PNG 图片 Base64 流，并固定 `viewportScale: 1.5`（宽度约 1080px），在确保警示线、红框、现场图和专有名词清晰可辨的同时，将单张 Base64 压减在 100KB 左右，防止 Payload 撑爆中转网关大小上限。

### 3. Word (docx) 图文交织提取
- 在 [docxExtractor.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/extractors/docxExtractor.js) 中，利用 `mammoth` 转化为 HTML，并通过正则表达式**把所有的 base64 图像标签与普通段落文本彻底剥离**，组装成结构明晰的交织零件流，避免 base64 数据泄露至 `text` 字段引起大模型上下文崩溃。

### 4. 大模型服务层适配、强力降级与 Token 追踪
- 在 [llmService.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/services/llmService.js) 中，彻底去除了 Google Gemini 的依赖与配置。
- 升级 `callOpenAI` 方法以适应 PDF（辅助文本+页面截图数组）和 DOCX（图文交织数组）两种数据模型。
- 改进返回格式：大模型解析结果不再单返回 Zod 提取的数据本身，而是返回统一的 `{ data: SafetyReport, usage: TokenUsage }` 格式，捕获了大模型的 `response.usage` 属性。
- 针对国内兼容网关增加了极强的降级防御机制：若首选的 `json_schema` (completions.parse) 报错，**程序会自动切换至 `json_object` 模式 (JSON Mode)**，并在系统提示词中追加强 Schema 规则指引。拿到内容后，在本地通过 `JSON.parse` 解析并执行 Zod 的 `safeParse` 做二次检验，同样记录并追踪其降级后的 Token 消耗。

### 5. 配置文件与入口流适配
- 清理了 [config.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/config.js)、[.env](file:///c:/Users/gaoft/Documents/CodeSpace/docex/.env) 和 [.env.template](file:///c:/Users/gaoft/Documents/CodeSpace/docex/.env.template)。
- 在 [index.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/index.js) 中，提取大模型返回的 `usage`，在终端控制台高亮输出（例如 `📊 Token 消耗: 输入 3992 | 输出 568 | 总计 4560`），并将其无缝存入本地备份的 JSON 文件。

---

## 🧪 验证结果演示

测试所使用的输入文件为：`data/input/测试文件.pdf`（一个包含 4 页、图文混排的石油化工现场安全隐患检查报告）。

### 💻 终端运行输出
```bash
🚀 启动 Document Extractor (docex) 安全检查报告解析服务...
📂 输入目录: C:\Users\gaoft\Documents\CodeSpace\docex\data\input
📂 输出目录: C:\Users\gaoft\Documents\CodeSpace\docex\data\output
🤖 当前大模型服务商: OPENAI

🔍 扫描发现 1 个待处理的文件...

--------------------------------------------------
📄 正在处理文件: 测试文件.pdf
⏳ [1/4] 正在解析 PDF 双路数据（无损文本与高精截图）...
✅ [1/4] PDF 解析完成：文字参考层共 1229 字符，页面截图共 4 页。
⏳ [2/4] 正在调用多模态大模型进行安全隐患提取 (Structured Output)...
⏳ 正在尝试使用 json_schema 结构化输出模式...
⚠️ 您的大模型服务商不支持 completions.parse (json_schema)，正在自动降级为标准 JSON Mode 进行兼容提取...
✅ [2/4] 大模型识别完成！共提取出 2 条隐患。
📊 Token 消耗: 输入 3992 | 输出 568 | 总计 4560
⏳ [3/4] 正在保存中间解析结果到本地...
✅ [3/4] 备份完成: 测试文件_result.json
⏳ [4/4] 正在将隐患追加到多维表格...
✨ 成功将 2 条安全隐患数据追加到飞书多维表格！
🎉 文件 测试文件.pdf 处理完成！

==================================================
✅ 所有文件处理任务完成！
```

### 📁 解析出的结构化隐患数据（含 Token 消耗记录 `测试文件_result.json`）
```json
{
  "fileName": "测试文件.pdf",
  "processedAt": "2026-07-10T01:09:17.728Z",
  "tokenUsage": {
    "promptTokens": 3992,
    "completionTokens": 568,
    "totalTokens": 4560
  },
  "issues": [
    {
      "projectName": "100万吨/年甲苯择形歧化系统配套项目",
      "issueType": "脚手架",
      "inspectionArea": "经二北路西侧管廊50柱",
      "description": "配合管线保温搭设的落地式脚手架，地基为软土地面，部分立杆底部未铺设通长垫板、采用小块钢板代替，存在因基础不均匀沉降导致架体失稳、变形的风险。（不符合《石油化工工程钢脚手架搭设安全技术规范》SH/T3555-2014第5.3.1.2条款相关规定）",
      "rectificationRequirement": "已告知承包商架设负责人落实整改，要求脚手架地基应平整坚实，地基应满足承载力要求，非混凝土地面立杆底部设置的垫板长度不少于2跨。（限期6月25日整改完成）",
      "inspector": "张进锋",
      "inspectionDate": "2026-06-22"
    },
    {
      "projectName": "烯烃一部技改技措及检维修项目",
      "issueType": "脚手架",
      "inspectionArea": "2#芳烃抽提T101/T102",
      "description": "设备检修脚手架搭设作业，横向扫地杆设置在纵向扫地杆上方，立杆在平台下方断开位置设置的可调托撑未撑紧；20m层平台下方断开位置立杆缺失，平台底部未采取撑顶措施，顶层作业平台缺少内防护栏杆。（不符合《建筑施工扣件式钢管脚手架安全技术规范》JGJ130-2011第6.3.2条、《石油化工工程钢脚手架搭设安全技术规范》SHT3555-2014第6.5.1.a）条、第5.3.1.6.e）条款相关规定）",
      "rectificationRequirement": "已告知承包商搭设负责人落实整改，横向扫地杆应采用直角扣件固定在紧靠纵向扫地杆下方的立杆上，脚手架遇设备平台需断开时，断开部位宜采用支撑与平台下表面牢固撑紧，脚手架作业层四周应搭设防护栏。（限期6月22日整改完成）",
      "inspector": "马洪岩",
      "inspectionDate": "2026-06-22"
    }
  ]
}
```
经过测试，Token 消耗量被完美捕获并持久化输出，整个混合重构方案全部达成并完美闭环。
