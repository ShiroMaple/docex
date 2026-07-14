// In-memory rate limiter for default LLM key
const ipRequestLogs = {};

// Clean up expired logs every 1 minute to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const ip of Object.keys(ipRequestLogs)) {
      ipRequestLogs[ip] = ipRequestLogs[ip].filter(timestamp => now - timestamp < 60000);
      if (ipRequestLogs[ip].length === 0) {
        delete ipRequestLogs[ip];
      }
    }
  }, 60000);
}

/**
 * 校验默认 AI 配置的使用频次限制（每个 IP 限制为 5 次 / 分钟）
 * @param {string} ip - 客户端 IP
 * @returns {boolean} 是否允许访问
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  const cleanIp = ip ? ip.split(',')[0].trim() : '127.0.0.1';
  
  if (!ipRequestLogs[cleanIp]) {
    ipRequestLogs[cleanIp] = [];
  }
  
  // 仅保留过去 60 秒内的请求时间戳
  ipRequestLogs[cleanIp] = ipRequestLogs[cleanIp].filter(timestamp => now - timestamp < 60000);
  
  if (ipRequestLogs[cleanIp].length >= 5) {
    return false; // 触发限流
  }
  
  ipRequestLogs[cleanIp].push(now);
  return true;
}
