// ============================================================
// 云端部署器 · API 基础工具
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ============================================================

import { 接口地址 } from '../config.js';

// 调用 Cloudflare 接口（自动处理 success/errors，返回 result）
export async function 调用接口(凭据, 路径, 选项 = {}) {
  const 响应体 = await 调用原始接口(凭据, 路径, 选项);
  if (响应体 && typeof 响应体 === 'object' && 'success' in 响应体) {
    if (!响应体.success) {
      const 消息 = (响应体.errors || []).map(错误 => 错误.message || JSON.stringify(错误)).join('; ') || 'Cloudflare API 请求失败';
      const 异常 = new Error(消息);
      异常.response = 响应体;
      throw 异常;
    }
    return 响应体.result;
  }
  return 响应体;
}

// 调用 Cloudflare 原始接口（返回整个响应体，含 success/result）
export async function 调用原始接口(凭据, 路径, 选项 = {}) {
  const headers = {
    'X-Auth-Email': 凭据.email,
    'X-Auth-Key': 凭据.key,
    ...(选项.headers || {}),
  };
  return await 请求JSON(`${接口地址}${路径}`, headers, 选项);
}

// 带 JWT 的接口（Pages 静态资源上传用）
export async function 调用JWT接口(jwt, 路径, 选项 = {}) {
  const headers = {
    Authorization: `Bearer ${jwt}`,
    ...(选项.headers || {}),
  };
  return await 请求JSON(`${接口地址}${路径}`, headers, 选项);
}

// 通用 JSON 请求
export async function 请求JSON(地址, headers, 选项 = {}) {
  let body = 选项.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const 响应 = await fetch(地址, { method: 选项.method || 'GET', headers, body });
  const contentType = 响应.headers.get('content-type') || '';
  const 响应体 = contentType.includes('application/json') ? await 响应.json() : await 响应.text();
  if (!响应.ok) {
    const 消息 = typeof 响应体 === 'string'
      ? 响应体
      : (响应体.errors || []).map(错误 => 错误.message || JSON.stringify(错误)).join('; ');
    throw new Error(`${响应.status} ${响应.statusText}${消息 ? ` - ${消息}` : ''}`);
  }
  if (响应体 && typeof 响应体 === 'object' && 'success' in 响应体) {
    if (!响应体.success) {
      const 消息 = (响应体.errors || []).map(错误 => 错误.message || JSON.stringify(错误)).join('; ') || 'Cloudflare API 请求失败';
      throw new Error(消息);
    }
    return 响应体.result;
  }
  return 响应体;
}

// 生成随机名称
export function 生成随机名称(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// 清理项目名
export function 清理项目名(名称) {
  return String(名称 || 生成随机名称('edge')).trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    || 生成随机名称('edge');
}

// 返回 JSON 响应
export function 返回JSON(状态码, 数据) {
  return new Response(JSON.stringify(数据), {
    status: 状态码,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// 字节转 Base64
export function 字节转Base64(bytes) {
  let 二进制 = '';
  const 步长 = 0x8000;
  for (let index = 0; index < bytes.length; index += 步长) {
    二进制 += String.fromCharCode(...bytes.slice(index, index + 步长));
  }
  return btoa(二进制);
}

// Base64 转字节
export function Base64转字节(base64) {
  const 二进制 = atob(base64);
  const 字节 = new Uint8Array(二进制.length);
  for (let index = 0; index < 二进制.length; index++) 字节[index] = 二进制.charCodeAt(index);
  return 字节;
}

// 内容类型映射
export function 内容类型(ext) {
  const 映射 = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    wasm: 'application/wasm', pdf: 'application/pdf', xml: 'application/xml',
  };
  return 映射[ext] || 'application/octet-stream';
}

// 提取扩展名
export function 提取扩展名(path) {
  const 匹配 = /\.([a-z0-9]+)$/i.exec(String(path || ''));
  return 匹配 ? 匹配[1].toLowerCase() : 'txt';
}

// 计算资源 Hash（Pages 静态资源去重）
export async function 计算资源Hash(bytes, extension) {
  const 摘要 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${字节转Base64(bytes)}${extension}`));
  return [...new Uint8Array(摘要)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
