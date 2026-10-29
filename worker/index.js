// ============================================================
// 云端部署器 · 后端入口（Pages 高级模式）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// _worker.js 转发到这里。
// 职责：路由 /api/* 到 api/router.js；非 API 请求走静态资源 ASSETS。
// ============================================================

import { handleApi } from './api/router.js';
import { 返回JSON } from './api/util.js';

export default {
  async fetch(request, env, ctx) {
    const 路径 = new URL(request.url).pathname;

    // 所有 /api/* 交给路由分发
    if (路径.startsWith('/api/')) {
      const context = {
        request,
        env,
        waitUntil: ctx?.waitUntil?.bind(ctx),
        passThroughOnException: ctx?.passThroughOnException?.bind(ctx),
      };
      return handleApi(context);
    }

    // 健康检查
    if (路径 === '/health') return 返回JSON(200, { ok: true });

    // 静态资源（Pages ASSETS）
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};
