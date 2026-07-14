# DocEx (Document Extractor) - 智能文档数据结构化提取系统

DocEx 是一款基于 **Next.js Fullstack (App Router)**、**Tailwind CSS**、**Framer Motion** 以及 **大语言模型 (Structured Outputs / Vision)** 开发的智能文档数据提取与校验系统。系统能够自动识别、解析多页 PDF 及 Word (.docx) 报告，支持图文交织多模态理解，并支持将对齐数据一键推送至 WPS 多维表及飞书多维表格。

---

## 🚀 核心功能特性

### 1. 📂 多模态预处理网关
* **PDF 图像化切片**：自动提取电子 PDF 文字层，并同步将每一页报告高保真渲染为 PNG 截图，支持 Vision 多模态视觉理解。
* **Word (docx) 交织还原**：解析 Word 内部结构，提取文本的同时将内嵌图片提取为 Base64 二进制流，完美还原图文并茂的版面结构。

### 2. 🧙 三步向导式核对表工作流
* **步骤 1：文件上传与解析进度卡片**：
  * 支持拖拽及多文件批量上传，支持实时流式解析进度条。
  * 提供**文档单独重试按钮**，重试时可一键移除相关记录、重新解析并重新计算 Token。
* **步骤 2：字段定义与 AI 微调**：
  * **动态字段矩阵**：支持自由增删改提取的目标字段（项目名、类别、描述等）以及其映射键名（Docex Key）。
  * **提示词微调设置**：内置行业专家提示词，支持一键“AI 优化”，并配有“恢复默认”一键重置功能。
* **步骤 3：数据对齐、核对与推送**：
  * 优雅扁平的“核对表”容器，粘性吸顶表头防止错位，支持一次性容纳大量记录，并实时显示统计。
  * 支持就地双击编辑、手动添加空白行、以及删除不合规记录。
  * **多维对齐**：支持一键“已核对识别结果，推送至多维表格”。
  * **本地备份**：提供“导出为 Excel (xlsx)”一键下载功能。

### 3. 🛡️ 智能大模型网关 (Multi-Config & Rate Limit)
* **多配置管理**：支持“默认配置（只读，服务商 XiaoMi）”与“自定义配置模板”的动态切换、命名保存及删除。
* **安全混淆**：敏感的 API Key 仅存在于用户浏览器 `localStorage` 中，后端内存即时消费，零服务器痕迹。
* **共享防护 (Rate Limiting)**：针对公共默认 AI 密钥，限制**每个 IP 地址每分钟最多请求 5 次**，超出则拦截并返回 `429` 状态码，防恶意滥用。

### 4. 📊 多平台云端多维表格网关
* **双平台对齐**：支持 WPS（金山文档）多维表和飞书多维表。
* **自定义凭证**：支持填写自定义 App ID / App Secret，实现一套凭证、通过不同链接推送多张表格。
* **Wiki 链接智能解析**：兼容飞书 `/base/` 及 `/wiki/` 知识库挂载型多维表链接，自动在后台完成 `wikiToken` 到 `appToken` 的无感解析与代理写入。
* **智能自增序号**：自带“自增序号列配置”开关（默认启用），写入数据前自动读取云端最后一行序号索引进行顺延递增。

### 5. 🧹 物理切片生命周期管理 (TTL & Cleanup)
* **手动删除联动**：删除历史文件记录时，同步清除其上传的源文件和所有的 PNG 图片切片文件夹，确保磁盘不残留多余碎图。
* **TTL 7天自动回收**：系统在每次上传文件时，自动执行 TTL 检查，物理销毁上传时间超过 7 天的文件及图片目录。

---

## 🛠️ 技术栈

* **前端**：React 19, Next.js (App Router), Tailwind CSS, Framer Motion, Lucide React
* **后端**：Next.js Web API Routes, OpenAI NodeJS SDK (Structured Outputs), Mammoth, PDF-Parse, PDF2Pic
* **数据存储**：客户端 `localStorage` (管理密钥配置) + 后端本地轻量 `lowdb` (管理文件记录)
* **工具库**：XLSX (Excel 导出), Axios (网络请求)

---

## ⚡ 快速启动

### 1. 依赖安装
确保本地安装有 Node.js (推荐 v18+ LTS) 与 `pnpm` 包管理工具：
```bash
pnpm install
```

### 2. 环境变量配置
在项目根目录创建并配置 `.env` 文件（可参考现有的 `.env`）：
```ini
LLM_PROVIDER=xiaomi

# 默认 LLM 凭证（后端安全读取）
OPENAI_API_KEY=您的默认APIKEY
OPENAI_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
OPENAI_MODEL=mimo-v2.5

# 默认飞书测试凭证
LARK_APP_ID=您的LARK_APP_ID
LARK_APP_SECRET=您的LARK_APP_SECRET

# 默认WPS测试凭证
WPS_APP_ID=您的WPS_APP_ID
WPS_APP_SECRET=您的WPS_APP_SECRET
```

### 3. 本地启动开发服务器（支持热重载）
```bash
pnpm dev
```
打开浏览器访问 [http://localhost:3000](http://localhost:3000) 即可开始调试。

### 4. 生产环境构建与启动
```bash
pnpm build
pnpm start
```

---

## 🎛️ 生产环境部署建议（必读）

在正式将 DocEx 部署至生产服务器前，请务必阅读并调整以下环境参数：

### 1. PM2 启动限制：单进程模式运行
由于本项目使用基于本地文件的轻量 JSON 存储，为防多进程同时写入 `data/db.json` 发生文件锁死及冲突，**请确保 PM2 以单实例（Single instance）运行**：
```bash
pm2 start npm --name "docex" --run dev
```

### 2. Nginx 反向代理参数调整
大文档切片及 AI 解析属于长耗时、大文件操作，请确保 Nginx 配置了足够大的包体限制和读取超时：
```nginx
server {
    client_max_body_size 100M; # 允许大文件上传
    
    location / {
        proxy_read_timeout 300s; # 延长读取超时时间至5分钟
        proxy_send_timeout 300s;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### 3. 提示词防注入网关
项目在 `/api/extract` 设有提示词安全攻击防御过滤，如果用户输入的描述包含 `.env`、`passwd`、`api_key` 等词汇会被拦截。内测期间如遇正常字段误杀，可在 `src/app/api/extract/route.js` 的 `checkPromptSecurity` 正则规则中做针对性微调。
