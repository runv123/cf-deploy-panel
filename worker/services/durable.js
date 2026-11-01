// ============================================================
// 云端部署器 v2 · 服务模块：Durable Objects
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 生成随机名称 } from '../api/util.js';

export default {
  id: 'durable',
  label: 'Durable Objects',
  icon: '🧩',
  freeTier: '40万GB-s / 100万请求每月',
  available: true,
  supportsUpdate: true,
  kind: 'resource',

  collectPayload(state) {
    const cfg = state.services?.durable || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'DO').trim(),
      className: cfg.className || 'MyObject',
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('do'),
    };
  },

  async ensure(凭据, accountId, opts, 记录) {
    const 标题 = opts.title;
    记录(`Durable Object 类 ${opts.className} 将在 Worker 上传时注册（命名空间: ${标题}）`);
    return { id: opts.existingId || 标题, name: 标题, created: false, className: opts.className };
  },

  buildBinding(resource, opts) {
    const name = opts.bindName || 'DO';
    const 类名 = resource.className || opts.className || 'MyObject';
    if (opts.target === 'pages') {
      return { durable_objects: { [name]: { class_name: 类名 } } };
    }
    return { type: 'durable_object', name, class_name: 类名 };
  },

  async rollback() { /* DO 绑定随 Worker 上传，无独立资源可回滚 */ },

  // ===== v2 新增 =====
  // DO 没有独立列表 API（绑定在 Worker 源码里），Dashboard 显示占位
  async list() { return []; },
  async detail() { throw new Error('Durable Objects 无独立详情，请在 Worker 源码中查看'); },
  async remove() { /* DO 无法独立删除，随 Worker 处理 */ },
};
