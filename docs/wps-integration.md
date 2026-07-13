# WPS 开放平台·多维表格集成经验与避坑指南

> 适用版本：WPS 开放平台 API v7 (DBSheet)
> 更新时间：2026-07-13

---

## 一、 快速接入指引

接入 WPS 多维表格只需配置以下环境变量：

```ini
WPS_APP_ID=your_wps_app_id
WPS_APP_SECRET=your_wps_app_secret
WPS_BASE_ID=cbGbLglUXASe # 分享链接 /l/ 后、? 前的部分
```

---

## 二、 核心集成经验总结

### 1. 鉴权机制 (OAuth2)
WPS 开放平台支持 **OAuth2 Client Credentials (客户端凭证)** 模式。
* **端点**：`POST https://openapi.wps.cn/oauth2/token`
* **格式约束**：必须使用 `application/x-www-form-urlencoded` 传参，若用 JSON Payload 发送会报 400 或 404。
* **Token 缓存**：有效期为 7200 秒（2小时），建议在服务内存中缓存并提前 5 分钟刷新。

### 2. 多维表格 API 路由
* **获取表结构 (Schema)**：
  `GET https://openapi.wps.cn/v7/coop/dbsheet/{file_id}/schema`
* **批量新增记录**：
  `POST https://openapi.wps.cn/v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/records/create`
  > **⚠️ 注意**：请求 Body 中 `records` 下的 `fields_value` 必须是一个**序列化的 JSON 字符串**，而非 JSON 对象！

---

## 三、 实战避坑指南 (重要)

我们在此次云服务器与本地联合验证部署中，重点攻克了以下两个“隐蔽坑点”：

### 🚨 坑点一：表头变动导致写入失败 (`Field not found`)
* **现象**：当多维表格在网页端被修改（例如添加新字段或修改已有字段名）后，本地服务运行正常，但云服务器推送报错 `Field not found`。
* **根本原因**：
  为提高性能，服务在内存中缓存了多维表格的 Schema（`_schemaCache`）。如果缓存永久有效，那么在服务不重启的情况下，表格结构的任何线上修改都无法被云服务器感知。此时，云服务器仍然使用旧的 Schema 做字段自动匹配并写入，导致字段缺失报错。
* **防坑方案（MVP阶段简易适配）**：
  不要永久缓存 Schema。在 `wpsService.js` 中引入 **TTL 短暂缓存机制**（如 30 秒缓存有效期），从而保证在网页端修改完表格后，服务端在短时间内能自动同步最新表头。
* **💡 生产建议优化方案（推荐）**：
  为了实现更好的用户体验与稳定性，在实际系统开发中，**建议在页面上提供一个“验证多维表格链接有效性与写入权限”的功能或按钮**，逻辑如下：
  1. **手动刷新缓存**：当用户更新多维表格链接后自动触发，或者由用户主动点击按钮时，执行 API 调用。在执行的瞬间，**强制清除并清空本地内存中的 Schema 缓存**。
  2. **权限与有效性验证**：发送一个轻量级的 Schema 请求或空行测试探针，验证当前 `fileId` 是否合法、以及该开放平台应用是否已获得该文档的读写授权。
  3. **实时结果反馈**：通过页面给出“连接成功/表头对齐完毕”或“连接失败，请确认应用授权”的视觉反馈，引导用户处理权限问题。

---

### 🚨 坑点二：添加审计字段导致推送崩溃 (`CoreExecutionFailed`)
* **现象**：在多维表格中加入了 “最后修改人” 和 “最后修改时间” 字段后，写入报错 `CoreExecutionFailed`（核心执行失败）。
* **根本原因**：
  WPS 的 “最后修改时间” 等审计字段是系统自动填充的 **只读字段 (System Fields)**。
  由于该类字段名字中包含了 “时间” 等普通词汇，系统的模糊匹配逻辑误将业务的 `inspectionDate`（检查日期）自动映射到了 `最后修改时间` 字段。
  当 API 请求尝试写入一个只读系统列时，WPS 服务端接口就会引发写冲突报错。
* **防坑方案**：
  1. 识别 WPS 的系统只读字段类型，包括：
     * `CreatedTime` (创建时间)
     * `CreatedBy` / `Creator` (创建人)
     * `LastModifiedTime` (最后修改时间)
     * `LastModifiedBy` / `Modifier` (最后修改人)
  2. 在自动映射和最终写入组装数据时，**强制过滤掉黑名单中的所有字段类型**：
     ```javascript
     const READ_ONLY_TYPES = ['CreatedTime', 'CreatedBy', 'Creator', 'LastModifiedTime', 'LastModifiedBy', 'Modifier'];
     const writeableFields = sheet.fields.filter(f => !READ_ONLY_TYPES.includes(f.type));
     const writeableWpsNames = new Set(writeableFields.map(f => f.name));
     
     // 过滤映射
     for (const [wpsName, docexKey] of Object.entries(resolvedMapping)) {
       if (writeableWpsNames.has(wpsName)) {
         docexToWps[docexKey] = wpsName;
       }
     }
     ```
     通过这种“自动除外”的防护，能够确保多维表格在后期随意拓展任何审计字段、关联统计字段时，都不会影响现有 API 的稳定性。
