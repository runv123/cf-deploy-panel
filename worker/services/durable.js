// ============================================================
// 云端部署器 · 服务模块：Durable Objects
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

  collectPayload(state) {
    const cfg = state.services?.durable || {};
    return {
      enabled: !!cfg.enabled,
      bindName: (cfg.bindName || 'DO').trim(),
      className: cfg.className || 'MyObject',   // 类名（Worker 源码里 export 的类）
      mode: cfg.mode === 'existing' ? 'existing' : 'new',
      existingId: cfg.existingId || '',
      title: cfg.title || 生成随机名称('do'),
    };
  },

  // Durable Objects 没有独立"创建命名空间"API，靠 Worker 上传时的绑定 + 类声明
  // 这里 ensure 只负责"复用或登记"，实际类在 Worker 源码里
  async ensure(凭据, accountId, opts, 记录) {
    const 标题 = opts.title;
    记录(`Durable Object 类 ${opts.className} 将在 Worker 上传时注册（命名空间: ${标题}）`);
    // DO 没有 API 可预先创建；返回一个占位，buildBinding 负责生成绑定
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
};
