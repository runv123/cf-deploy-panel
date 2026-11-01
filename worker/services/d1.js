// ============================================================
// 云端部署器 v2 · 服务模块：D1 数据库
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'd1',
  label: 'D1 数据库',
  icon: '🗃️',
  freeTier: '5GB / 500万行读每月',
  available: true,
  supportsUpdate: true,
  kind: 'resource',

  collectPayload(state) {
    const cfg = state.services?.d1 || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'DB').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('db'),
      locationHint: cfg.locationHint || 'wnam',
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/d1/database`);
    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.uuid === opts.existingId);
      if (已选) { 记录(`复用 D1: ${已选.name}`); return { id: 已选.uuid, name: 已选.name, created: false }; }
      记录(`使用指定 D1: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.title || opts.existingId, created: false };
    }
    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 D1: ${标题}`); return { id: 已有.uuid, name: 标题, created: false }; }
    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/d1/database`, {
      method: 'POST',
      body: { name: 标题, primary_location_hint: opts.locationHint }
    });
    记录(`创建 D1: ${标题}`);
    return { id: 创建结果.uuid, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'DB';
    if (opts.target === 'pages') {
      return { d1_databases: { [name]: { id: resource.id } } };
    }
    return { type: 'd1', name, id: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/d1/database/${resource.id}`, { method: 'DELETE' });
      记录(`回滚: 已删除 D1 ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(D1): ${错误.message}`); }
  },

  // ===== v2 新增 =====
  async list(凭据, accountId) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/d1/database`);
    return 列表.map(项 => ({ id: 项.uuid, name: 项.name, domain: '', created: '' }));
  },

  async detail(凭据, accountId, id) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/d1/database`);
    const 项 = 列表.find(x => x.uuid === id);
    if (!项) throw new Error(`D1 不存在: ${id}`);
    return { id: 项.uuid, name: 项.name, created: '' };
  },

  async remove(凭据, accountId, id) {
    await 调用接口(凭据, `/accounts/${accountId}/d1/database/${id}`, { method: 'DELETE' });
  },
};
