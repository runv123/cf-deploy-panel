// ============================================================
// 云端部署器 · 服务注册表（架构核心）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 每个 Cloudflare 服务对应 services/<id>.js 一个模块。
// 模块默认导出统一契约对象，注册到下面的 SERVICES 数组。
// 新增服务 = 新建一个文件 + 在这里注册一行，前端自动生成卡片。
// ============================================================

import kv from './kv.js';
import d1 from './d1.js';
import r2 from './r2.js';
import queues from './queues.js';
import durable from './durable.js';
import vectorize from './vectorize.js';
import workflows from './workflows.js';
import hyperdrive from './hyperdrive.js';

export const SERVICES = [
  kv, d1, r2, queues, durable, vectorize, workflows, hyperdrive,
];

export function getService(id) {
  return SERVICES.find(service => service.id === id) || null;
}

export function availableServices() {
  return SERVICES.filter(service => service.available);
}

export function validateServices() {
  const errors = [];
  const seen = new Set();
  for (const service of SERVICES) {
    if (!service || typeof service !== 'object') { errors.push('服务模块必须导出对象'); continue; }
    if (!service.id || seen.has(service.id)) errors.push(`重复或缺失 id: ${service.id}`);
    seen.add(service.id);
    for (const method of ['collectPayload', 'ensure', 'buildBinding']) {
      if (typeof service[method] !== 'function') errors.push(`服务 ${service.id} 缺少方法 ${method}`);
    }
  }
  return errors;
}
