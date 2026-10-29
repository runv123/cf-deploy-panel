// ============================================================
// 云端部署器 · API 路由分发
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 返回JSON } from './util.js';
import * as 认证 from './auth.js';
import * as 资源 from './resources.js';
import * as 部署 from './deploy.js';

// 处理 /api/* 请求（POST 或 GET）
export async function handleApi(context) {
  const 路径 = new URL(context.request.url).pathname.replace(/^\/api\/?/, '');
  const 方法 = context.request.method;
  try {
    if (方法 === 'POST') return await handlePost(路径, context);
    if (方法 === 'GET') return await handleGet(路径, context);
    return 返回JSON(405, { ok: false, error: '只支持 POST / GET' });
  } catch (错误) {
    return 返回JSON(500, { ok: false, error: 错误.message || String(错误) });
  }
}

async function handlePost(路径, context) {
  const 数据 = await context.request.json().catch(() => ({}));

  if (路径 === 'accounts') return 认证.accounts(数据, context);
  if (路径 === 'zones') return 认证.zones(数据, context);
  if (路径 === 'resources') return 资源.list(数据, context);
  if (路径 === 'deploy') return 部署.deploy(数据, context);
  if (路径 === 'deploy-update') return 部署.update(数据, context);

  return 返回JSON(404, { ok: false, error: '接口不存在' });
}

async function handleGet(路径, context) {
  if (路径 === 'health') return 返回JSON(200, { ok: true, time: new Date().toISOString() });
  return 返回JSON(404, { ok: false, error: '接口不存在' });
}
