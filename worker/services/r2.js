// ============================================================
// 云端部署器 · 服务模块：R2 存储桶
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 契约：{ id, label, icon, freeTier, available, supportsUpdate,
//         collectPayload, ensure, buildBinding, rollback }
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'r2',
  label: 'R2 存储桶',
  icon: '🪣',
  freeTier: '10GB / 100万操作每月',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.r2 || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'BUCKET').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('bucket').replace(/-/g, ''),
      // R2 特有：位置提示
      locationHint: cfg.locationHint || 'wnam',
    };
  },

  // 创建或复用 R2 存储桶
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

  // R2 绑定（R2 的绑定名即 bucket 名）
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
};
