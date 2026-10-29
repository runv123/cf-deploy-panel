// ============================================================
// 云端部署器 · 认证与账户/Zone 读取
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 调用接口, 返回JSON } from './util.js';

// 读取账户列表
export async function accounts(数据, context) {
  const accounts = await 调用接口(数据.credentials, '/accounts?per_page=50');
  return 返回JSON(200, {
    ok: true,
    accounts: accounts.map(账户 => ({ id: 账户.id, name: 账户.name })),
  });
}

// 读取 Zone（域名）列表
export async function zones(数据, context) {
  const zones = await 调用接口(数据.credentials, '/zones?status=active&per_page=100');
  return 返回JSON(200, {
    ok: true,
    zones: zones.map(区域 => ({ id: 区域.id, name: 区域.name })),
  });
}
