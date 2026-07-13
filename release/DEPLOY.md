# DocEx Web — 服务器部署指南

## 目录结构

```
docex-web/
├── src/
│   ├── server.js            # Web 服务入口（Express，端口 3000）
│   ├── config.js            # 读取环境变量
│   ├── schema.js            # Zod 数据结构定义
│   ├── extractors/
│   │   ├── pdfExtractor.js  # PDF → 文本 + 图片
│   │   └── docxExtractor.js # DOCX → 图文交织流
│   └── services/
│       ├── llmService.js    # MiMo-V2.5 大模型调用
│       └── wpsService.js    # WPS 多维表格 API
├── public/
│   └── index.html           # 前端单页面
├── data/
│   ├── tmp/                 # 上传临时文件（自动清理）
│   └── output/              # 可选：本地备份（暂未启用）
├── package.json
├── .env.template            # 环境变量模板
└── DEPLOY.md                # 本文件
```

## 部署步骤

### 1. 安装 Node.js

确保服务器已安装 **Node.js 18+**（推荐 LTS 版本）：

```bash
node -v   # 确认版本 >= 18
npm -v
```

### 2. 安装依赖

```bash
npm install
# 或使用 pnpm（推荐）
npm install -g pnpm && pnpm install
```

> ⚠️ `pdf-to-png-converter` 依赖 `@napi-rs/canvas`，在 Linux 服务器上需要安装图形依赖：
> ```bash
> # Ubuntu / Debian
> apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
> ```

### 3. 配置环境变量

```bash
cp .env.template .env
# 编辑 .env，填入真实的 Key
nano .env
```

必填项：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | MiMo API Key |
| `OPENAI_BASE_URL` | `https://token-plan-cn.xiaomimimo.com/v1` |
| `OPENAI_MODEL` | `mimo-v2.5` |
| `WPS_APP_ID` | WPS 开放平台 App ID |
| `WPS_APP_SECRET` | WPS 开放平台 App Secret |
| `WPS_BASE_ID` | 默认多维表格 fileId（分享链接 `/l/` 后面的部分） |

### 4. 启动服务

```bash
node src/server.js
# 服务监听 http://0.0.0.0:3000
```

**后台持久运行（推荐用 PM2）：**

```bash
npm install -g pm2
pm2 start src/server.js --name docex-web
pm2 save
pm2 startup
```

### 5. 防火墙 / 反向代理

- 开放 `3000` 端口，或在 Nginx 中配置反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        # 上传大文件需要调整限制
        client_max_body_size 60M;
    }
}
```

## API 接口说明

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 前端页面 |
| `/api/upload` | POST (multipart) | 上传文件 + fileId → 返回解析结果 |
| `/api/schema` | GET `?fileId=xxx` | 获取 WPS 目标表字段列表 |
| `/api/push` | POST (JSON) | 推送确认后的隐患列表到 WPS |

## 注意事项

- 上传的文件会暂存在 `data/tmp/`，处理完成后**自动删除**
- 大型 PDF（多页）处理耗时约 30–120 秒，属正常现象
- 默认接受最大 **50MB** 的上传文件
