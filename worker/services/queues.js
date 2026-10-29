// ============================================================
// 云端部署器 · 服务模块：Queues 消息队列
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'queues',
  label: 'Queues 队列',
  icon: '📨',
  freeTier: '1万条/天（2026 起免费）',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.queues || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'QUEUE').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('queue'),
      // Queues 特有：重试/延迟（默认按官方）
      maxRetries: cfg.maxRetries ?? 3,
      delaySeconds: cfg.delaySeconds ?? 0,
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/queues`);

    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.id === opts.existingId);
      if (已选) { 记录(`复用 Queue: ${已选.name}`); return { id: 已选.id, name: 已选.name, created: false }; }
      记录(`使用指定 Queue: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.title || opts.existingId, created: false };
    }

    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 Queue: ${标题}`); return { id: 已有.id, name: 标题, created: false }; }

    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/queues`, {
      method: 'POST',
      body: { queue_name: 标题 }
    });
    记录(`创建 Queue: ${标题}`);
    return { id: 创建结果.id, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'QUEUE';
    if (opts.target === 'pages') {
      return { queues: { [name]: { queue_id: resource.id } } };
    }
    return { type: 'queue', name, queue_id: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/queues/${resource.id}`, { method: 'DELETE' });
      记录(`回滚: 已删除 Queue ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(Queue): ${错误.message}`); }
  },
};
