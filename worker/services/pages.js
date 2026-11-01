// ============================================================
// 云端部署器 v2 · 服务模块：Cloudflare Pages（项目类）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口 } from '../api/util.js';
import { 绑定域名, 列出绑定域名, 解绑域名 } from './domains.js';

export default {
  id: 'pages',
  label: 'Pages 项目',
  icon: '📄',
  freeTier: '500 构建/月',
  available: true,
  supportsUpdate: true,
  kind: 'project',   // 项目类，有完整编辑页

  // Dashboard 列出所有 Pages 项目
  async list(凭据, accountId) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/pages/projects`);
    return 列表.map(项目 => ({
      id: 项目.name,
      name: 项目.name,
      domain: 项目.domains?.[0] || '',
      created: 项目.created_on || '',
    }));
  },

  // 项目详情
  async detail(凭据, accountId, name) {
    return await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}`);
  },

  // 列出域名
  async listDomains(凭据, accountId, name) {
    return await 列出绑定域名(凭据, { accountId, deployType: 'pages', projectName: name }, () => {});
  },

  // 列出部署历史
  async listDeployments(凭据, accountId, name) {
    return await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}/deployments`);
  },

  // 删除项目
  async remove(凭据, accountId, name) {
    await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },

  // 添加域名
  async addDomain(凭据, 选项) {
    return await 绑定域名(凭据, {
      accountId: 选项.accountId,
      deployType: 'pages',
      projectName: 选项.projectName,
      zoneId: 选项.zoneId,
      hostname: 选项.hostname,
    }, () => {});
  },

  // 移除域名
  async removeDomain(凭据, 选项) {
    return await 解绑域名(凭据, {
      accountId: 选项.accountId,
      deployType: 'pages',
      projectName: 选项.projectName,
      zoneId: 选项.zoneId,
      hostname: 选项.hostname,
    }, () => {});
  },

  // 回滚到指定部署版本（B：CF 部署历史）
  async rollbackTo(凭据, accountId, name, deploymentId) {
    await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}/deployments/${deploymentId}/retry`, { method: 'POST' });
  },
};
