// ============================================================
// 云端部署器 · 服务模块：Workflows 工作流
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'workflows',
  label: 'Workflows 工作流',
  icon: '🔁',
  freeTier: '免费档有额度（需开通）',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.workflows || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'WORKFLOW').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('wf'),
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/workflows`);

    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.id === opts.existingId);
      if (已选) { 记录(`复用 Workflow: ${已选.name}`); return { id: 已选.id, name: 已选.name, created: false }; }
      记录(`使用指定 Workflow: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.title || opts.existingId, created: false };
    }

    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 Workflow: ${标题}`); return { id: 已有.id, name: 标题, created: false }; }

    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/workflows`, {
      method: 'POST',
      body: { name: 标题 }
    });
    记录(`创建 Workflow: ${标题}`);
    return { id: 创建结果.id, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'WORKFLOW';
    if (opts.target === 'pages') {
      return { workflows: { [name]: { name: resource.id } } };
    }
    return { type: 'workflow', name, workflow_name: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/workflows/${resource.id}`, { method: 'DELETE' });
      记录(`回滚: 已删除 Workflow ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(Workflow): ${错误.message}`); }
  },
};
