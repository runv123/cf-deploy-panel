// ============================================================
// 云端部署器 v2 · 项目管理 API（仅项目类：Workers/Pages）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// GET   /api/project/detail    → 项目详情 + 域名 + 部署历史
// POST  /api/project/delete    → 删除项目
// POST  /api/project/domain    → 绑定域名
// POST  /api/project/domain-remove → 解绑域名
// ============================================================

import { 调用接口, 返回JSON } from './util.js';
import { getService } from '../services/index.js';

// 项目详情（含域名、部署历史）
export async function detail(数据, context) {
  const { credentials, accountId, type, name } = 数据;
  if (!credentials?.email || !credentials?.key) throw new Error('缺少凭据');
  if (!accountId || !type || !name) throw new Error('缺少参数（accountId/type/name）');

  const service = getService(type);
  if (!service) throw new Error(`未知项目类型: ${type}`);
  if (service.kind !== 'project') throw new Error(`不是项目类服务: ${type}`);

  const 项目 = await service.detail(credentials, accountId, name);
  const 域名 = await service.listDomains(credentials, accountId, name);
  const 历史 = await service.listDeployments(credentials, accountId, name);

  return 返回JSON(200, { ok: true, project: 项目, domains: 域名, deployments: 历史 });
}

// 删除项目
export async function remove(数据, context) {
  const { credentials, accountId, type, name } = 数据;
  if (!credentials?.email || !credentials?.key) throw new Error('缺少凭据');
  if (!accountId || !type || !name) throw new Error('缺少参数（accountId/type/name）');

  const service = getService(type);
  if (!service) throw new Error(`未知项目类型: ${type}`);
  if (service.kind !== 'project') throw new Error(`不是项目类服务: ${type}`);

  await service.remove(credentials, accountId, name);
  return 返回JSON(200, { ok: true, deleted: name });
}

// 绑定域名
export async function addDomain(数据, context) {
  const { credentials, accountId, type, name, hostname, zoneId } = 数据;
  if (!credentials?.email || !credentials?.key) throw new Error('缺少凭据');
  if (!accountId || !type || !name || !hostname || !zoneId) throw new Error('缺少参数');

  const service = getService(type);
  if (!service) throw new Error(`未知项目类型: ${type}`);

  const result = await service.addDomain(credentials, { accountId, type, projectName: name, hostname, zoneId });
  return 返回JSON(200, { ok: true, domain: result });
}

// 解绑域名
export async function removeDomain(数据, context) {
  const { credentials, accountId, type, name, hostname } = 数据;
  if (!credentials?.email || !credentials?.key) throw new Error('缺少凭据');
  if (!accountId || !type || !name || !hostname) throw new Error('缺少参数');

  const service = getService(type);
  if (!service) throw new Error(`未知项目类型: ${type}`);

  const result = await service.removeDomain(credentials, { accountId, type, projectName: name, hostname });
  return 返回JSON(200, { ok: true, domain: result });
}
