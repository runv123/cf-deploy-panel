// ============================================================
// 云端部署器 v2 · Dashboard API
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// GET /api/dashboard
// 遍历所有服务，调用各自 list()，返回统一资源数组。
// 支持 type（标签分类过滤）和 q（搜索）。
// ============================================================

import { 调用接口, 返回JSON } from './util.js';
import { SERVICES } from '../services/index.js';

// 列出 Dashboard 全部资源
export async function dashboard(数据, context) {
  const { credentials, accountId, type, q } = 数据;
  if (!credentials?.email || !credentials?.key) throw new Error('缺少凭据');
  if (!accountId) throw new Error('缺少 Account ID');

  const results = [];
  const warnings = [];

  // 遍历所有服务，各自 list
  for (const service of SERVICES) {
    if (type && service.id !== type) continue;  // 标签分类过滤
    try {
      const items = await service.list(credentials, accountId);
      for (const item of items) {
        results.push({
          id: item.id,
          name: item.name,
          domain: item.domain || '',
          created: item.created || '',
          type: service.id,
          label: service.label,
          kind: service.kind || 'resource',
        });
      }
    } catch (错误) {
      warnings.push(`${service.label} 列表读取失败: ${错误.message}`);
    }
  }

  // 搜索过滤
  const 过滤后 = q
    ? results.filter(r => String(r.name).includes(q) || String(r.domain).includes(q))
    : results;

  return 返回JSON(200, { ok: true, resources: 过滤后, warnings });
}
