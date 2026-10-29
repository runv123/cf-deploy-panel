// ============================================================
// 云端部署器 · 服务模块：域名绑定
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 这个不是注册表服务，而是被部署流程调用的辅助模块。
// Pages：创建 CNAME 指向 *.pages.dev
// Worker：优先 workers/domains，失败回落 workers/routes
// ============================================================

import { 调用接口 } from '../api/util.js';

export async function 绑定域名(凭据, 选项, 记录) {
  if (选项.deployType === 'pages') {
    const 结果 = await 调用接口(凭据,
      `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}/domains`,
      { method: 'POST', body: { name: 选项.hostname } }
    );
    记录(`Pages 域名已绑定: ${选项.hostname}`);
    try {
      await 调用接口(凭据, `/zones/${选项.zoneId}/dns_records`, {
        method: 'POST',
        body: { type: 'CNAME', name: 选项.hostname, content: `${选项.projectName}.pages.dev`, proxied: true }
      });
      记录(`CNAME 记录已创建: ${选项.hostname} → ${选项.projectName}.pages.dev`);
    } catch (dns错误) {
      记录(`CNAME 创建跳过(可能已存在): ${dns错误.message}`);
    }
    return { hostname: 结果.name || 选项.hostname, type: 'pages' };
  }

  // Worker：优先自定义域名，失败回落 Route
  const 请求体 = {
    environment: 'production',
    hostname: 选项.hostname,
    service: 选项.projectName,
    zone_id: 选项.zoneId,
  };
  try {
    const 结果 = await 调用接口(凭据, `/accounts/${选项.accountId}/workers/domains`, {
      method: 'PUT', body: 请求体
    });
    记录(`Worker 自定义域名已绑定: ${选项.hostname}`);
    return { hostname: 结果.hostname || 选项.hostname, type: 'worker' };
  } catch (错误) {
    await 调用接口(凭据, `/zones/${选项.zoneId}/workers/routes`, {
      method: 'POST',
      body: { pattern: `${选项.hostname}/*`, script: 选项.projectName }
    });
    记录(`Worker Route 已绑定: ${选项.hostname}/*`);
    return { hostname: 选项.hostname, type: 'route', warning: 错误.message };
  }
}

export async function 列出绑定域名(凭据, 选项, 记录) {
  try {
    if (选项.deployType === 'pages') {
      const 列表 = await 调用接口(凭据,
        `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}/domains`);
      return 列表.map(项 => ({ hostname: 项.name || 项.hostname, status: 项.status || '' }));
    }
    const 列表 = await 调用接口(凭据, `/accounts/${选项.accountId}/workers/domains?per_page=100`);
    return 列表
      .filter(项 => 项.service === 选项.projectName || 项.script === 选项.projectName)
      .map(项 => ({ hostname: 项.hostname || 项.domain, status: 项.status || '' }));
  } catch (错误) {
    记录(`域名列表读取失败: ${错误.message}`);
    return [];
  }
}
