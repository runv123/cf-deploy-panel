// ============================================================
// 云端部署器 v2 · 服务模块：Cloudflare Worker（项目类）
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口 } from '../api/util.js';
import { 绑定域名, 列出绑定域名, 解绑域名 } from './domains.js';

export default {
  id: 'worker',
  label: 'Worker 脚本',
  icon: '⚙️',
  freeTier: '10万请求/天',
  available: true,
  supportsUpdate: true,
  kind: 'project',   // 项目类

  // Dashboard 列出所有 Worker
  async list(凭据, accountId) {
    const 列表 = await 调用接口(凭据, `/accounts/${accountId}/workers/scripts?per_page=100`);
    return 列表.map(脚本 => ({
      id: 脚本.id || 脚本.name,
      name: 脚本.id || 脚本.name,
      domain: '',
      created: 脚本.created_on || '',
    }));
  },

  // Worker 详情（脚本设置）
  async detail(凭据, accountId, name) {
    return await 调用接口(凭据, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}`);
  },

  // 列出域名（Worker 走自定义域）
  async listDomains(凭据, accountId, name) {
    return await 列出绑定域名(凭据, { accountId, deployType: 'worker', projectName: name }, () => {});
  },

  // 列出部署（Worker 是单一脚本，无多部署历史；返回空）
  async listDeployments() { return []; },

  // 删除 Worker
  async remove(凭据, accountId, name) {
    await 调用接口(凭据, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },

  // 添加域名
  async addDomain(凭据, 选项) {
    return await 绑定域名(凭据, {
      accountId: 选项.accountId,
      deployType: 'worker',
      projectName: 选项.projectName,
      zoneId: 选项.zoneId,
      hostname: 选项.hostname,
    }, () => {});
  },

  // 移除域名
  async removeDomain(凭据, 选项) {
    return await 解绑域名(凭据, {
      accountId: 选项.accountId,
      deployType: 'worker',
      projectName: 选项.projectName,
      zoneId: 选项.zoneId,
      hostname: 选项.hostname,
    }, () => {});
  },

  // 读取 Worker 代码（编辑页用）
  async getCode(凭据, accountId, name) {
    const 结果 = await 调用接口(凭据, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}/content`);
    return 结果;
  },
};
