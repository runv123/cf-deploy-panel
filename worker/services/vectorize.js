// ============================================================
// 云端部署器 · 服务模块：Vectorize 向量数据库
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'vectorize',
  label: 'Vectorize 向量库',
  icon: '🧠',
  freeTier: '免费档有额度（需开通）',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.vectorize || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'VECTORIZE').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('vector'),
      // Vectorize 特有：维度（默认 768，OpenAI text-embedding-3-small）
      dimensions: cfg.dimensions || 768,
      metric: cfg.metric || 'cosine',
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/vectorize/indexes`);

    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.name === opts.existingId);
      if (已选) { 记录(`复用 Vectorize: ${已选.name}`); return { id: 已选.name, name: 已选.name, created: false }; }
      记录(`使用指定 Vectorize: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.existingId, created: false };
    }

    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 Vectorize: ${标题}`); return { id: 已有.name, name: 标题, created: false }; }

    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/vectorize/indexes`, {
      method: 'POST',
      body: {
        name: 标题,
        config: { dimensions: opts.dimensions, metric: opts.metric }
      }
    });
    记录(`创建 Vectorize: ${标题} (${opts.dimensions}维/${opts.metric})`);
    return { id: 创建结果.name, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'VECTORIZE';
    if (opts.target === 'pages') {
      return { vectorize: { [name]: { index_name: resource.id } } };
    }
    return { type: 'vectorize', name, index_name: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/vectorize/indexes/${encodeURIComponent(resource.id)}`, { method: 'DELETE' });
      记录(`回滚: 已删除 Vectorize ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(Vectorize): ${错误.message}`); }
  },
};
