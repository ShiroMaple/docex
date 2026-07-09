# docex (Document Extractor) - 安全检查报告结构化数据提取器

这是一个基于 Node.js 现代 ESM 模块规范开发的安全检查报告解析系统。它能自动扫描指定目录，解析 PDF 和 Word (docx) 文件，并通过大语言模型（OpenAI / Google Gemini）的 **Structured Outputs (结构化输出)** 功能，精准地将报告中提取出的一到多个安全隐患（问题）转换为统一的数据格式，最后支持将结果追加至多维表格中（如飞书多维表格）。

## 📁 目录结构说明

```
docex/
├── data/
│   ├── input/               # 📂 待解析文件输入目录（支持放置 .pdf 和 .docx）
│   └── output/              # 📂 提取出的中间 JSON 结果备份目录
├── src/
│   ├── index.js             # 🚀 服务主入口，串联文件扫描、文本提取、模型调用和数据追加
│   ├── config.js            # ⚙️ 环境配置加载与校验模块 (使用 dotenv)
│   ├── schema.js            # 📐 使用 Zod 定义的隐患数据标准结构模型
│   ├── extractors/          # 📝 本地文档文本抽取逻辑
│   │   ├── pdfExtractor.js  # 使用 pdf-parse 提取 PDF 文字
│   │   └── docxExtractor.js # 使用 mammoth 提取 Word (docx) 文字
│   ├── services/            # 🌐 外部服务集成
│   │   ├── llmService.js    # 大模型 Structured Output 提取服务 (适配 OpenAI / Gemini)
│   │   └── tableService.js  # 多维表格服务 (支持飞书 API 和无 Key 模拟 Mock 模式)
│   └── utils/
│       └── fileHelper.js    # 🛠️ 辅助文件工具
├── .env.template            # 🔒 环境变量模板
├── .gitignore               # 🙈 Git 忽略配置
├── package.json             # 📦 项目声明与依赖管理
└── README.md                # 📖 项目说明文档（本文件）
```

---

## ⚡ 快速开始

### 1. 安装项目依赖
确保您已安装 Node.js (推荐 v18+ LTS)，然后在项目根目录下运行 pnpm 进行依赖安装：
```bash
pnpm install
```

### 2. 配置环境变量
项目根目录下包含一个 `.env` 配置文件（已为您生成）。根据您的需要配置对应的大模型 API 密钥：

```ini
# 选择大模型提供商: google (默认) 或 openai
LLM_PROVIDER=google

# 1. 若使用 Google Gemini (推荐)
GEMINI_API_KEY=您的GeminiAPI密钥
GEMINI_MODEL=gemini-2.5-flash

# 2. 若使用 OpenAI (或其兼容 API)
OPENAI_API_KEY=您的OpenAI密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 3. 飞书多维表格配置（非必填。不配置时，程序会自动进入 Mock 模拟打印模式）
LARK_APP_ID=您的飞书AppId
LARK_APP_SECRET=您的飞书AppSecret
LARK_APP_TOKEN=您的多维表格AppToken
LARK_TABLE_ID=您的表格TableId
```

### 3. 放置测试文件
将需要解析的安全检查报告文件（`.pdf` 或 `.docx` 格式）放入 `data/input/` 文件夹中。

### 4. 运行程序
执行以下命令启动提取程序：
```bash
pnpm start
```
程序会自动执行以下流程：
1. 扫描 `data/input/` 目录；
2. 提取文件中的文本内容；
3. 调用配置的大模型，按 `src/schema.js` 的 Zod 格式进行 **结构化数据提取**；
4. 将提取到的 JSON 数据存储在 `data/output/` 文件夹中备份；
5. 将隐患数据自动追加到飞书多维表格中（如未配置飞书 API 密钥，则会在终端直观打印模拟追加结果）。

---

## 📐 安全隐患数据结构 Schema (Zod)

我们在 [src/schema.js](file:///c:/Users/gaoft/Documents/CodeSpace/docex/src/schema.js) 中定义了标准的隐患数据字段：

* **`projectName`** (`string`): 隐患对应的项目名称。
* **`issueType`** (`string`): 隐患分类（如：临时用电、高处作业、文明施工等）。
* **`inspectionArea`** (`string`): 隐患被发现的检查区域或具体位置。
* **`description`** (`string`): 隐患的现状描述。
* **`rectificationRequirement`** (`string`): 整改要求或限期整改措施。
* **`inspector`** (`string`): 检查人员姓名。
* **`inspectionDate`** (`string`): 发现隐患的日期 (YYYY-MM-DD)。
