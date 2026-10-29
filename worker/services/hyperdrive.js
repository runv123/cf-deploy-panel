// ============================================================
// 云端部署器 · 服务模块：Hyperdrive 数据库连接池
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'hyperdrive',
  label: 'Hyperdrive 连接池',
  icon: '🚀',
  freeTier: '10万查询/天',
  available: true,
  supportsUpdate: true,

  collectPayload(state) {
    const cfg = state.services?.hyperdrive || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'HYPERDRIVE').trim(),
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('hd'),
      // Hyperdrive 需要连接外部数据库
      connectionString: cfg.connectionString || '',
      databaseType: cfg.databaseType || 'postgres',
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    if (!opts.connectionString) throw new Error('Hyperdrive 需要填写外部数据库连接字符串');

    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/hyperdrive/configs`);

    if (opts.mode === 'existing' && opts.existingId) {
      const 已选 = 列表.find(项 => 项.id === opts.existingId);
      if (已选) { 记录(`复用 Hyperdrive: ${已选.name}`); return { id: 已选.id, name: 已选.name, created: false }; }
      记录(`使用指定 Hyperdrive: ${opts.existingId}`);
      return { id: opts.existingId, name: opts.title || opts.existingId, created: false };
    }

    const 标题 = opts.title;
    const 已有 = 列表.find(项 => 项.name === 标题);
    if (已有) { 记录(`复用 Hyperdrive: ${标题}`); return { id: 已有.id, name: 标题, created: false }; }

    const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/hyperdrive/configs`, {
      method: 'POST',
      body: { name: 标题, connection_string: opts.connectionString, database_type: opts.databaseType }
    });
    记录(`创建 Hyperdrive: ${标题}`);
    return { id: 创建结果.id, name: 标题, created: true };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'HYPERDRIVE';
    if (opts.target === 'pages') {
      return { hyperdrive: { [name]: { id: resource.id } } };
    }
    return { type: 'hyperdrive', name, id: resource.id };
  },

  async rollback(凭据, accountId, resource, 记录) {
    if (!resource?.created) return;
    try {
      await 调用接口(凭据, `/accounts/${accountId}/hyperdrive/configs/${resource.id}`, { method: 'DELETE' });
      记录(`回滚: 已删除 Hyperdrive ${resource.name}`);
    } catch (错误) { 记录(`回滚失败(Hyperdrive): ${错误.message}`); }
  },
};
