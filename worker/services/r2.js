// ============================================================
// 云端部署器 v2 · 服务模块：R2 存储桶
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'r2',
  label: 'R2 存储桶',
  icon: '🪣',
  freeTier: '10GB / 100万操作每月',
  available: true,
  supportsUpdate: true,
  kind: 'resource',

  collectPayload(state) {
    const cfg = state.services?.r2 || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'BUCKET').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('bucket').replace(/-/g, ''),
      locationHint: cfg.locationHint || 'wnam',
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/r2/buckets`);
    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.name === opts.existingId);
      if (已选) { 记录(`复用 R2: ${已选.name}`); return { id: 已选.name, name: 已选.name, created: false }; }
      记录(`使用指定 R2: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.existingId, created: false };
    }
    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 R2: ${标题}`); return { id: 已有.name, name: 标题, created: false }; }
    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/r2/buckets`, {
      method: 'POST',
      body: { name: 标题, location_hint: opts.locationHint }
    });
    记录(`创建 R2: ${标题}`);
    return { id: 创建结果.name, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'BUCKET';
    if (opts.target === 'pages') {
      return { r2_buckets: { [name]: { name: resource.id } } };
    }
    return { type: 'r2_bucket', name, bucket_name: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/r2/buckets/${encodeURIComponent(resource.id)}`, { method: 'DELETE' });
      记录(`回滚: 已删除 R2 ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(R2): ${错误.message}`); }
  },

  // ===== v2 新增 =====
  async list(凭据, accountId) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/r2/buckets`);
    return 列表.map(项 => ({ id: 项.name, name: 项.name, domain: '', created: '' }));
  },

  async detail(凭据, accountId, id) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/r2/buckets`);
    const 项 = 列表.find(x => x.name === id);
    if (!项) throw new Error(`R2 不存在: ${id}`);
    return { id: 项.name, name: 项.name, created: '' };
  },

  async remove(凭据, accountId, id) {
    await 调用接口(凭据, `/accounts/${accountId}/r2/buckets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
