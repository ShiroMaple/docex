# docex “文本辅助 + 视觉优先”双路混合重构方案

本项目由于最终运行环境限制，将**完全移除 Google Gemini 模式的支持**，后续的开发与模型适配将**全部专注于国内的 OpenAI 兼容端（如 MiMo-V2.5, 通义千问, DeepSeek 等）**。

为了解决大模型视觉解析在识别小字体、专有名词、技术代码等场景下容易出现 OCR 幻觉，以及印章遮挡导致的文字丢失问题，我们制定了**“文本辅助 + 视觉通道”**双路并行的重构方案。

---

## 重构核心设计

### 1. PDF 报告双路解析逻辑
* **文本参考路（辅助通道）**：
  - 重新安装 `pdf-parse` (使用其原生 ESM 模块)。
  - 调用文本抽取器读取 PDF 的字符层。如果 PDF 是扫描件或文字已图片化导致提取失败或提取为空，**程序不做停止报错，而是将参考文本设为空 `""`，仅使用视觉通路进行提取**。
* **页面视觉路（主通道）**：
  - 安装并引入 `pdf-img-convert`（纯 JS 实现的 PDF 渲染器，免除复杂的系统二进制环境配置）。
  - 将 PDF 的每一页以高分辨率渲染为 PNG 图片并转换为 Base64 格式。
* **LLM 传参拼装**：
  - 组装成多模态消息：`参考文本 (Text)` + `第一页图片 (Image)` + `第二页图片 (Image)` + ... + `User提示词 (Text)`。

### 2. DOCX 报告双路解析逻辑
* 由于 Word 文档 (.docx) 是流式排版文档（Reflowable Layout），不存在 PDF 那种绝对坐标文字重叠、公章物理遮挡文字的问题，且文字读取是 100% 精准的。
* 在 Node.js 中将 Word 直接渲染为物理页面图片需要依赖庞大的系统级软件（如 LibreOffice），极不轻量。
* **图文交织方案**：
  - 我们继续采用 `mammoth` 转换为 HTML 文本的方案。它能完美以 `<table>` 格式保留表格布局，并把图片提取为独立的 Base64 二进制流。
  - 将提取结果拼装为符合物理顺序的图文交织列表：`文本段落/表格1 (Text)` + `内嵌图片1 (Image)` + `文本段落2 (Text)` + ...
  - 这能提供最高清的插图视觉、100% 准确的文本，同时无需在运行环境引入繁重的 Word 页面渲染器。

---

## 需用户确认的事项

1. **依赖项变更**：
   - 移除 `pdf-parse` 的卸载决定，重新安装并升级 `pdf-parse`；
   - 安装 `pdf-img-convert`。
   - *执行命令*：`pnpm add pdf-parse pdf-img-convert`。
2. **完全移除 Gemini 模式**：
   - 彻底删除 `src/services/llmService.js` 中关于 Google Gemini 的代码与引用，精简配置结构。

---

## 拟更改的文件

#### [MODIFY] [package.json](file:///c:/Users/gaoft/Documents/CodeSpace/docex/package.json)
引入新依赖 `pdf-img-convert`。

#### [MODIFY] [pdfExtractor.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/extractors/pdfExtractor.js)
实现双路提取：
- `extractPdf(filePath)` 返回：
  ```javascript
  {
    text: "从 PDF 提取出的纯文本或空字符串",
    images: [
      { data: "base64Data", mimeType: "image/png" },
      ...
    ]
  }
  ```

#### [MODIFY] [docxExtractor.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/extractors/docxExtractor.js)
规范化 DOCX 提取器，将转换后的图文数据命名适配一致。

#### [MODIFY] [llmService.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/services/llmService.js)
- 完全移除 `callGemini` 及 `@google/genai` 客户端。
- 升级并重写 `callOpenAI`，组装 PDF 的双路内容（无损文本 + 多页图片），以及 DOCX 的流式图文交织内容。
- 增强 `json_object` 降级容错机制。

#### [MODIFY] [index.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/index.js)
微调提取管道，适配新的统一多模态返回值结构。

#### [MODIFY] [.env.template](file:///c:/Users/gaoft/Documents/CodeSpace/docex/.env.template) & [.env](file:///c:/Users/gaoft/Documents/CodeSpace/docex/.env)
彻底移除 Gemini 相关配置。

---

## 验证计划

1. 运行安装命令安装依赖。
2. 依次修改对应代码文件。
3. 清理 `.env` 文件，只保留 OpenAI / MiMo 相关配置。
4. 放入测试用 PDF 报告。
5. 运行 `pnpm start` 验证程序是否稳定产出提取结果，且中间输出无异常。
