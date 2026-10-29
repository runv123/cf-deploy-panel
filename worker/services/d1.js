// ============================================================
// 云端部署器 · 服务模块：D1 数据库
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 契约：{ id, label, icon, freeTier, available, supportsUpdate,
//         collectPayload, ensure, buildBinding, rollback }
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'd1',
  label: 'D1 数据库',
  icon: '🗃️',
  freeTier: '5GB / 500万行读每月',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.d1 || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'DB').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('db'),
      // D1 特有：主位置提示（免费档可用）
      locationHint: cfg.locationHint || 'wnam',
    };
  },

  // 创建或复用 D1 数据库
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

  // D1 绑定（D1 没有单独的绑定名，绑定名即数据库 ID 映射）
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
};
