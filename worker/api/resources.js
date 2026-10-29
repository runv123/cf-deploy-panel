// ============================================================
// 云端部署器 · 读取现有资源列表（多服务）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 返回JSON } from './util.js';
import { getService } from '../services/index.js';

// 读取所有已启用服务的现有资源
export async function list(数据, context) {
  if (!数据.accountId) throw new Error('缺少 Account ID');
  const 凭据 = 数据.credentials;
  const accountId = 数据.accountId;

  // 每个服务读取自己的列表
  const 服务列表 = 数据.services || {};  // { kv: true, d1: true, ... }
  const 启用 = Object.keys(服务列表).filter(id => 服务列表[id]);

  const 结果 = {};
  const warnings = [];
  const tasks = 启用.map(async id => {
    const service = getService(id);
    if (!service) return;
    try {
      结果[id] = await 读取服务列表(凭据, accountId, service);
    } catch (错误) {
      warnings.push(`${service.label} 列表读取失败: ${错误.message}`);
      结果[id] = [];
    }
  });

  await Promise.all(tasks);
  return 返回JSON(200, { ok: true, resources: 结果, warnings });
}

// 按服务类型读取列表
async function 读取服务列表(凭据, accountId, service) {
  switch (service.id) {
    case 'kv': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
      return 列表.map(项 => ({ id: 项.id, name: 项.title }));
    }
    case 'd1': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/d1/database`);
      return 列表.map(项 => ({ id: 项.uuid, name: 项.name }));
    }
    case 'r2': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/r2/buckets`);
      return 列表.map(项 => ({ id: 项.name, name: 项.name }));
    }
    case 'queues': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/queues`);
      return 列表.map(项 => ({ id: 项.id, name: 项.name }));
    }
    case 'vectorize': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/vectorize/indexes`);
      return 列表.map(项 => ({ id: 项.name, name: 项.name }));
    }
    case 'workflows': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/workflows`);
      return 列表.map(项 => ({ id: 项.id, name: 项.name }));
    }
    case 'hyperdrive': {
      const 列表 = await 调用接口(凭据, `/accounts/${accountId}/hyperdrive/configs`);
      return 列表.map(项 => ({ id: 项.id, name: 项.name }));
    }
    case 'durable': {
      // DO 没有独立列表 API，返回空
      return [];
    }
    default:
      return [];
  }
}
