# WPS 开放平台·多维表格集成经验总结

> 适用版本：WPS 开放平台 API v7（2026-07）

---

## 一、凭证配置

接入 WPS 多维表格只需要以下三个环境变量：

| 变量名 | 必要性 | 获取方式 |
|--------|--------|----------|
| `WPS_APP_ID` | **必要** | WPS 开放平台 → 我的应用 → AppID |
| `WPS_APP_SECRET` | **必要** | WPS 开放平台 → 我的应用 → AppSecret |
| `WPS_BASE_ID` | **必要** | 从分享链接 URL 中提取（见下方） |

### 如何从分享链接提取 `file_id`

分享链接格式：
```
https://365.kdocs.cn/l/{file_id}?R={base64_redirect}
```

示例：
```
https://365.kdocs.cn/l/cbGbLglUXASe?R=L1MvMQ==
                        ↑ 这一段就是 file_id
```

**只需提取 `/l/` 之后、`?` 之前的字符串**，即 `cbGbLglUXASe`，填入 `WPS_BASE_ID`。
`?R=...` 参数是页面内部跳转参数，与 API 调用无关，**不需要包含**。

---

## 二、鉴权流程

使用 **OAuth2 Client Credentials（客户端凭证）** 模式，无需用户登录授权。

```
POST https://openapi.wps.cn/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={WPS_APP_ID}&client_secret={WPS_APP_SECRET}
```

> ?? **注意事项**
> - 必须使用 `application/x-www-form-urlencoded` 格式，用 JSON body 发送会返回 400/404。
> - 返回的 `access_token` 有效期约 7200s（2小时），建议本地缓存并提前 5 分钟刷新。
> - 正确路径是 `oauth2/token`（`openapi.wps.cn/oauth2/token`），`oauth/v2/token` 是错误的。

---

## 三、核心 API 接口

所有接口均以 Bearer Token 方式鉴权：
```
Authorization: Bearer {access_token}
```

### 3.1 获取表格 Schema

```
GET https://openapi.wps.cn/v7/coop/dbsheet/{file_id}/schema
```

返回所有 Sheet 的结构信息，包括：
- `sheets[].id`：Sheet 的数字 ID（整数），创建记录时用到
- `sheets[].name`：Sheet 名称（如 "数据表"）
- `sheets[].sheet_type`：数据表为 `xlEtDataBaseSheet`，仪表盘为 `xlDbDashBoardSheet`
- `sheets[].fields[]`：字段列表，每项含 `id`（字母，如 B/C）和 `name`（中文字段名）

**实测数据示例**（测试多维表格）：
```json
{
  "sheets": [{
    "id": 1,
    "name": "数据表",
    "sheet_type": "xlEtDataBaseSheet",
    "fields": [
      { "id": "B", "name": "文本",      "type": "MultiLineText" },
      { "id": "C", "name": "数字",      "type": "Number" },
      { "id": "D", "name": "日期",      "type": "Date" },
      { "id": "E", "name": "单选项",    "type": "SingleSelect" },
      { "id": "F", "name": "图片和附件","type": "Attachment" },
      { "id": "G", "name": "评分",      "type": "Rating" }
    ]
  }]
}
```

---

### 3.2 创建记录（写入数据行）

```
POST https://openapi.wps.cn/v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/records/create
Content-Type: application/json
```

**请求 Body：**
```json
{
  "prefer_id": false,
  "records": [
    {
      "fields_value": "{\"字段名1\":\"值1\",\"字段名2\":42}"
    }
  ]
}
```

> ?? **关键坑点**
> - `fields_value` 是一个 **JSON 字符串**（二次序列化），不是 JSON 对象。
> - `prefer_id: false` 时按字段名写入，`true` 时按字段字母 ID（如 B/C）写入。
> - `sheet_id` 是 Schema 接口返回的整数（如 `1`），不是字段字母 ID。
> - `records` 数组中可包含多条记录，实现批量写入。

**实测成功示例：**
```json
// 请求
{
  "prefer_id": false,
  "records": [{
    "fields_value": "{\"文本\":\"API测试\",\"数字\":42,\"日期\":\"2026/07/10\",\"单选项\":\"选项1\",\"评分\":5}"
  }]
}

// 响应
{
  "code": 0,
  "msg": "",
  "data": {
    "records": [{ "id": "H", "fields": "..." }]
  }
}
```

---

## 四、不支持的接口

| 接口 | 原因 |
|------|------|
| `GET /v7/form/ksform/shares/{share_code}/info` | 返回 403，不支持应用授权模式，需要用户委托授权（scope: kso.form.readwrite），不适合服务端对服务端场景 |

---

## 五、可省略的信息

| 信息项 | 可否省略 | 说明 |
|--------|---------|------|
| `WPS_TABLE_NAME`（表名）| ? 可省略 | 代码自动取第一张 `xlEtDataBaseSheet` 类型的表 |
| `sheet_id` / `view_id` | ? 可省略 | 通过 Schema 接口自动发现 |
| URL 中的 `?R=...` 参数 | ? 可省略 | 页内跳转参数，与 API 无关 |
| `tableId` / `viewId` | ? 不存在 | WPS API 不需要，与飞书多维表格概念不同 |

---

## 六、代码实现参考

核心服务实现见 `src/services/wpsService.js`，封装了：
1. Token 获取与本地缓存（`getAccessToken()`）
2. Schema 自动发现与缓存（`getSchema(sheetName?)`）
3. 业务数据批量写入（`appendRecords(issues, sheetName?)`）

### 字段映射说明

`appendRecords()` 内部将 docex 隐患结构映射为目标表字段名（需根据实际表格字段名调整）：

```js
{
  '项目名称': issue.projectName,
  '问题类型': issue.issueType,
  '检查区域': issue.inspectionArea,
  '问题描述': issue.description,
  '整改要求': issue.rectificationRequirement,
  '检查人员': issue.inspector,
  '检查日期': issue.inspectionDate
}
```

---

## 七、新表接入 Checklist

- [ ] 在 WPS 开放平台确认应用，获得 `APP_ID` 和 `APP_SECRET`
- [ ] 打开目标多维表格，从分享链接提取 `file_id`（`/l/` 后、`?` 前的部分）
- [ ] 将三个变量写入 `.env`：`WPS_APP_ID`、`WPS_APP_SECRET`、`WPS_BASE_ID`
- [ ] 确认目标表的字段名，更新 `wpsService.js` 中的字段映射
- [ ] 运行 `node scratch/test-wps.js` 验证写入成功

---

*文档生成时间：2026-07-10*
