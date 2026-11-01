// ============================================================
// 云端部署器 v2 · 服务模块：KV 命名空间
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 默认KV绑定名 } from '../config.js';
import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'kv',
  label: 'KV 命名空间',
  icon: '🗄️',
  freeTier: '1GB / 10万读每天',
  available: true,
  supportsUpdate: true,
  kind: 'resource',   // 账户级资源（非项目类）

  collectPayload(state) {
    const cfg = state.services?.kv || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 默认KV绑定名).trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('store'),
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.id === opts.existingId);
      if (已选) { 记录(`复用 KV: ${已选.title}`); return { id: 已选.id, name: 已选.title, created: false }; }
      记录(`使用指定 KV: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.title || opts.existingId, created: false };
    }
    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.title === 标题);
    if (已有) { 记录(`复用 KV: ${标题}`); return { id: 已有.id, name: 标题, created: false }; }
    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST', body: { title: 标题 }
    });
    记录(`创建 KV: ${标题}`);
    return { id: 创建结果.id, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 默认KV绑定名;
    if (opts.target === 'pages') {
      return { kv_namespaces: { [name]: { namespace_id: resource.id } } };
    }
    return { type: 'kv_namespace', name, namespace_id: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces/${resource.id}`, { method: 'DELETE' });
      记录(`回滚: 已删除 KV ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(KV): ${错误.message}`); }
  },

  // ===== v2 新增：Dashboard 支持 =====
  async list(凭据, accountId) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
    return 列表.map(项 => ({ id: 项.id, name: 项.title, domain: '', created: 项.created_on || '' }));
  },

  async detail(凭据, accountId, id) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
    const 项 = 列表.find(x => x.id === id);
    if (!项) throw new Error(`KV 不存在: ${id}`);
    return { id: 项.id, name: 项.title, created: 项.created_on || '' };
  },

  async remove(凭据, accountId, id) {
    await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces/${id}`, { method: 'DELETE' });
  },
};
