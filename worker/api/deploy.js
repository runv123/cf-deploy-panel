// ============================================================
// 云端部署器 · 部署编排
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 职责：
//  1. 补全部署参数（默认值、Account 自动选择、域名匹配）
//  2. 校验参数
//  3. 创建/复用各服务资源（按注册表逐个 ensure）
//  4. 组装 Worker/Pages 绑定（buildBinding）
//  5. 上传 Worker 或 Pages
//  6. 绑定域名
// ============================================================

import { 调用接口, 返回JSON, 生成随机名称, 清理项目名 } from './util.js';
import { 兼容日期, 源码远程基础 } from '../config.js';
import { SERVICES, getService } from '../services/index.js';
import { 绑定域名, 列出绑定域名 } from '../services/domains.js';

// POST /api/deploy —— 创建模式
export async function deploy(数据, context) {
  数据 = await 补全部署默认值(数据);
  校验部署参数(数据);
  const 日志 = [];
  const 记录 = 文本 => 日志.push(`[${new Date().toLocaleTimeString()}] ${文本}`);

  const uuid = 数据.uuid || crypto.randomUUID();
  const 操作模式 = 数据.deployMode === 'update' ? 'update' : 'create';
  const 项目名 = 操作模式 === 'update'
    ? String(数据.projectName || '').trim()
    : 清理项目名(数据.projectName || 生成随机名称('edge'));
  const 模式 = 数据.sourceMode === 'plain' ? 'plain' : 'encoded';
  const 部署方式 = 数据.deployType === 'worker' ? 'worker' : 'pages';

  记录(`准备${操作模式 === 'update' ? '更新' : '部署'} ${部署方式 === 'pages' ? 'Pages' : 'Worker'}: ${项目名}`);

  // 更新模式：只同步代码，不动绑定
  if (操作模式 === 'update') {
    if (部署方式 === 'worker') {
      await 同步Worker代码(数据.credentials, { accountId: 数据.accountId, scriptName: 项目名, sourceMode: 模式, files: 数据.files }, context, 记录);
    } else {
      await 同步Pages代码(数据.credentials, { accountId: 数据.accountId, projectName: 项目名, sourceMode: 模式, files: 数据.files }, context, 记录);
    }
    记录('更新模式只同步代码，未修改绑定/配置');
    return 返回JSON(200, { ok: true, deployType: 部署方式, projectName: 项目名, sourceMode: 模式, logs: 日志 });
  }

  // ============ 创建模式 ============
  // 1. 逐个创建/复用服务资源（注册表遍历）
  const 资源映射 = {};       // serviceId -> resource
  const 创建的资源列表 = [];   // 用于回滚
  const 绑定片段 = {};        // 组装各服务的绑定

  try {
    for (const service of SERVICES) {
      const cfg = 数据.services?.[service.id];
      if (!cfg?.enabled) continue;
      记录(`启用服务: ${service.label}`);
      const opts = { ...cfg, target: 部署方式 };
      const resource = await service.ensure(数据.credentials, 数据.accountId, opts, 记录);
      资源映射[service.id] = resource;
      绑定片段[service.id] = service.buildBinding(resource, opts);
      if (resource.created) 创建的资源列表.push({ service, resource });
    }
  } catch (错误) {
    // 回滚已创建的资源
    记录(`资源创建失败，回滚中: ${错误.message}`);
    for (const item of 创建的资源列表.reverse()) {
      await item.service.rollback(数据.credentials, 数据.accountId, item.resource, 记录).catch(() => null);
    }
    throw 错误;
  }

  // 2. 上传 Worker 或 Pages
  if (部署方式 === 'worker') {
    await 部署Worker(数据.credentials, {
      accountId: 数据.accountId,
      scriptName: 项目名,
      sourceMode: 模式,
      uuid,
      bindings: 合并Worker绑定(绑定片段),
      enableWorkersDev: !!数据.enableWorkersDev,
      files: 数据.files,
    }, context, 记录);
  } else {
    await 部署Pages(数据.credentials, {
      accountId: 数据.accountId,
      projectName: 项目名,
      sourceMode: 模式,
      uuid,
      configs: 合并Pages配置(绑定片段, uuid),
      files: 数据.files,
    }, context, 记录);
  }

  // 3. 绑定域名
  let domain = null;
  if (数据.hostname && 数据.zoneId) {
    domain = await 绑定域名(数据.credentials, {
      accountId: 数据.accountId,
      deployType: 部署方式,
      projectName: 项目名,
      zoneId: 数据.zoneId,
      hostname: 数据.hostname,
    }, 记录);
  }
  const domains = await 列出绑定域名(数据.credentials, {
    accountId: 数据.accountId,
    deployType: 部署方式,
    projectName: 项目名,
  }, 记录);

  记录('部署完成');
  return 返回JSON(200, {
    ok: true,
    deployType: 部署方式,
    projectName: 项目名,
    sourceMode: 模式,
    uuid,
    resources: 资源映射,
    domain,
    domains,
    logs: 日志,
  });
}

// POST /api/deploy-update —— 更新模式
export async function update(数据, context) {
  return deploy(数据, context);
}

// ============ 补全参数 ============
async function 补全部署默认值(数据) {
  if (!数据?.credentials?.email || !数据?.credentials?.key) return 数据;
  const 输出 = { ...数据 };
  let zones = null;

  if (!输出.accountId) {
    const accounts = await 调用接口(输出.credentials, '/accounts?per_page=50');
    if (!accounts.length) throw new Error('当前凭据没有可用账户');
    输出.accountId = accounts[0].id;
    输出.accountName = accounts[0].name;
  }
  if (!输出.deployType) 输出.deployType = 'pages';
  if (!输出.sourceMode) 输出.sourceMode = 'encoded';
  if (输出.deployMode === 'update') return 输出;

  if (输出.autoDomain && !输出.hostname) {
    zones = await 调用接口(输出.credentials, '/zones?status=active&per_page=100');
    if (zones.length) {
      输出.zoneId = 输出.zoneId || zones[0].id;
      输出.zoneName = zones[0].name;
      输出.hostname = `${生成随机名称('edge')}.${zones[0].name}`;
    }
  }
  if (输出.hostname && !输出.zoneId) {
    zones = zones || await 调用接口(输出.credentials, '/zones?status=active&per_page=100');
    const zone = zones
      .filter(区域 => 输出.hostname === 区域.name || 输出.hostname.endsWith(`.${区域.name}`))
      .sort((甲, 乙) => 乙.name.length - 甲.name.length)[0];
    if (!zone) throw new Error(`找不到匹配域名 ${输出.hostname} 的 Cloudflare Zone`);
    输出.zoneId = zone.id;
    输出.zoneName = zone.name;
  }
  if (输出.hostname && 输出.zoneId) {
    zones = zones || await 调用接口(输出.credentials, '/zones?status=active&per_page=100');
    const zone = zones.find(区域 => 区域.id === 输出.zoneId) || (输出.zoneName ? { id: 输出.zoneId, name: 输出.zoneName } : null);
    if (zone && 输出.hostname === zone.name) {
      输出.hostname = `${生成随机名称('edge')}.${zone.name}`;
      输出.zoneName = zone.name;
    }
  }
  return 输出;
}

function 校验部署参数(数据) {
  if (!数据?.credentials?.email || !数据?.credentials?.key) throw new Error('缺少 Cloudflare 邮箱或 Global API Key');
  if (!数据.accountId) throw new Error('缺少 Account ID');
  if (数据.deployMode === 'update' && !String(数据.projectName || '').trim()) throw new Error('更新现有项目时必须选择项目名称');
  if (数据.deployMode === 'update') return;
  if (数据.hostname && !数据.zoneId) throw new Error('绑定域名时必须选择 Zone');
}

// ============ 合并绑定 ============
function 合并Worker绑定(绑定片段) {
  // 绑定片段：{ serviceId: { type, name, ... } } 或 { serviceId: null }
  const 结果 = [];
  for (const key of Object.keys(绑定片段)) {
    const 片段 = 绑定片段[key];
    if (!片段) continue;
    if (Array.isArray(片段)) { 结果.push(...片段); continue; }
    if (片段.type) 结果.push(片段);
  }
  return 结果;
}

function 合并Pages配置(绑定片段, uuid) {
  // Pages deployment_configs 结构
  const 单项 = {
    compatibility_date: 兼容日期,
    env_vars: { UUID: { type: 'plain_text', value: uuid } },
  };
  for (const key of Object.keys(绑定片段)) {
    const 片段 = 绑定片段[key];
    if (!片段) continue;
    for (const 配置字段 of Object.keys(片段)) {
      // 片段形如 { kv_namespaces: {...}, d1_databases: {...} }
      单项[配置字段] = { ...(单项[配置字段] || {}), ...片段[配置字段] };
    }
  }
  return { production: 单项, preview: 单项 };
}

// ============ Worker 部署 ============
async function 部署Worker(凭据, 选项, context, 记录) {
  const 代码 = await 读取源代码(选项.sourceMode, context, 选项.files);
  const 表单 = new FormData();
  const 元数据 = {
    main_module: 'worker.js',
    compatibility_date: 兼容日期,
    bindings: [
      { type: 'plain_text', name: 'UUID', text: 选项.uuid },
      ...(选项.bindings || []),
    ],
  };
  表单.append('metadata', new Blob([JSON.stringify(元数据)], { type: 'application/json' }), 'metadata.json');
  表单.append('worker.js', new Blob([代码], { type: 'application/javascript+module' }), 'worker.js');
  await 调用接口(凭据, `/accounts/${选项.accountId}/workers/scripts/${encodeURIComponent(选项.scriptName)}`, {
    method: 'PUT', body: 表单,
  });
  记录('Worker 脚本上传完成');
  if (选项.enableWorkersDev) {
    await 启用WorkersDev(凭据, 选项.accountId, 选项.scriptName);
    记录('workers.dev 默认域名已启用');
  }
}

async function 同步Worker代码(凭据, 选项, context, 记录) {
  const 代码 = await 读取源代码(选项.sourceMode, context, 选项.files);
  const 设置 = await 读取Worker设置(凭据, 选项.accountId, 选项.scriptName);
  const 元数据 = 生成保留Worker元数据(设置);
  const 表单 = new FormData();
  表单.append('metadata', new Blob([JSON.stringify(元数据)], { type: 'application/json' }), 'metadata.json');
  表单.append('worker.js', new Blob([代码], { type: 'application/javascript+module' }), 'worker.js');
  await 调用接口(凭据, `/accounts/${选项.accountId}/workers/scripts/${encodeURIComponent(选项.scriptName)}`, {
    method: 'PUT', body: 表单,
  });
  记录('Worker 代码已同步，现有绑定和设置按原值提交');
}

async function 读取Worker设置(凭据, accountId, scriptName) {
  try {
    return await 调用接口(凭据, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/settings`);
  } catch (错误) {
    throw new Error(`读取现有 Worker 设置失败，已停止更新以避免覆盖绑定配置: ${错误.message}`);
  }
}

function 生成保留Worker元数据(设置) {
  const 元数据 = {};
  for (const 字段 of ['main_module', 'compatibility_date', 'compatibility_flags', 'bindings', 'migrations', 'usage_model', 'limits', 'placement', 'tail_consumers', 'logpush']) {
    if (设置?.[字段] !== undefined && 设置?.[字段] !== null) 元数据[字段] = 设置[字段];
  }
  if (!元数据.main_module) 元数据.main_module = 'worker.js';
  if (!元数据.compatibility_date) throw new Error('无法读取现有 Worker compatibility_date，已停止更新以避免修改配置');
  if (!Array.isArray(元数据.bindings)) throw new Error('无法读取现有 Worker 绑定，已停止更新以避免覆盖配置');
  return 元数据;
}

async function 启用WorkersDev(凭据, accountId, scriptName) {
  const 路径 = `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`;
  try {
    await 调用接口(凭据, 路径, { method: 'POST', body: { enabled: true } });
  } catch {
    await 调用接口(凭据, 路径, { method: 'PUT', body: { enabled: true } });
  }
}

// ============ Pages 部署 ============
async function 部署Pages(凭据, 选项, context, 记录) {
  const 项目 = await 创建或更新Pages项目(凭据, 选项, 记录);
  const 代码 = await 读取源代码(选项.sourceMode, context, 选项.files);
  await 上传Pages部署(凭据, 选项.accountId, 选项.projectName, 代码, 选项.files, 记录);
  记录(`Pages 项目已配置: ${项目.name}`);
  记录('Pages 部署上传完成');
}

async function 同步Pages代码(凭据, 选项, context, 记录) {
  try {
    await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}`);
  } catch (错误) {
    if (String(错误.message).includes('404')) throw new Error(`找不到现有 Pages 项目: ${选项.projectName}`);
    throw 错误;
  }
  const 代码 = await 读取源代码(选项.sourceMode, context, 选项.files);
  记录('Pages 更新模式不修改绑定/变量/域名配置');
  await 上传Pages部署(凭据, 选项.accountId, 选项.projectName, 代码, 选项.files, 记录);
  记录('Pages 代码同步完成');
}

async function 创建或更新Pages项目(凭据, 选项, 记录) {
  let 项目 = null;
  try {
    项目 = await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}`);
  } catch (错误) {
    if (!String(错误.message).includes('404')) throw 错误;
  }
  if (!项目) {
    项目 = await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects`, {
      method: 'POST',
      body: {
        name: 选项.projectName,
        production_branch: 'main',
        deployment_configs: 选项.configs,
      },
    });
    记录('Pages 项目已创建');
    return 项目;
  }
  await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}`, {
    method: 'PATCH',
    body: { deployment_configs: 合并Pages配置(选项.configs, 选项.uuid) },
  });
  记录('Pages 项目配置已更新');
  return 项目;
}

async function 上传Pages部署(凭据, accountId, projectName, workerCode, files, 记录) {
  const manifest = await 上传Pages静态资源(凭据, accountId, projectName, files, 记录);
  const 表单 = new FormData();
  表单.append('manifest', JSON.stringify(manifest));
  表单.append('branch', 'main');
  表单.append('commit_dirty', 'true');
  表单.append('commit_message', 'deploy from hosted deployer');
  const workerBundle = await 生成WorkerBundle(workerCode);
  表单.append('_worker.bundle', workerBundle, '_worker.bundle');
  const deployment = await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`, {
    method: 'POST', body: 表单,
  });
  if (deployment?.url) 记录(`Pages 地址: ${deployment.url}`);
}

async function 上传Pages静态资源(凭据, accountId, projectName, files, 记录) {
  const { jwt } = await 调用接口(凭据, `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/upload-token`);
  const 资源列表 = [];
  if (files) {
    记录(`准备上传 ${files.length} 个静态资源`);
    for (const 项 of files) {
      const 扩展 = 提取扩展名(项.path);
      const hash = await 计算资源Hash(项.bytes, 扩展);
      资源列表.push({ path: 项.path, hash, bytes: 项.bytes, ext: 扩展 });
    }
  } else {
    const 内容 = '<!doctype html><html><body><h1>Deploy</h1></body></html>';
    const 字节 = new TextEncoder().encode(内容);
    const hash = await 计算资源Hash(字节, 'html');
    资源列表.push({ path: '/index.html', hash, bytes: 字节, ext: 'html' });
  }
  const hashes = 资源列表.map(项 => 项.hash);
  const missing = await 调用JWT接口(jwt, '/pages/assets/check-missing', { method: 'POST', body: { hashes } });
  const 需要上传 = new Set(Array.isArray(missing) ? missing : hashes);
  const 上传负载 = [];
  for (const 项 of 资源列表) {
    if (!需要上传.has(项.hash)) continue;
    上传负载.push({ key: 项.hash, value: 字节转Base64(项.bytes), metadata: { contentType: 内容类型(项.ext) }, base64: true });
  }
  for (let index = 0; index < 上传负载.length; index += 50) {
    await 调用JWT接口(jwt, '/pages/assets/upload', { method: 'POST', body: 上传负载.slice(index, index + 50) });
  }
  if (上传负载.length) 记录(`已上传 ${上传负载.length} 个资源（跳过 ${资源列表.length - 上传负载.length} 个已存在）`);
  await 调用JWT接口(jwt, '/pages/assets/upsert-hashes', { method: 'POST', body: { hashes } }).catch(() => null);
  const manifest = {};
  for (const 项 of 资源列表) manifest[项.path] = 项.hash;
  return manifest;
}

async function 生成WorkerBundle(workerCode) {
  const 内层 = new FormData();
  const 元数据 = { main_module: 'worker.js', compatibility_date: 兼容日期 };
  内层.set('metadata', JSON.stringify(元数据));
  内层.set('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
  return await new Response(内层).blob();
}

// ============ 源码读取 ============
async function 读取源代码(mode, context, files) {
  if (files) {
    const 入口 = 查找入口文件(files);
    if (!入口) throw new Error('上传的压缩包中未找到 _worker.js，无法作为高级模式脚本部署');
    return 入口;
  }
  const 文件名 = '_worker.js';
  const 远程地址 = `${源码远程基础}/${encodeURIComponent(文件名)}?t=${Date.now()}`;
  const 响应 = await fetch(远程地址, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  if (!响应.ok) throw new Error(`实时拉取源文件失败: ${响应.status} ${响应.statusText}`);
  const 内容 = await 响应.text();
  if (!内容.trim()) throw new Error('实时拉取源文件失败: 远程源文件为空');
  return 内容;
}

function 查找入口文件(files) {
  if (!files) return null;
  const 候选 = files.find(项 => 项.path.toLowerCase() === '/_worker.js')
    || files.find(项 => 项.path.toLowerCase().endsWith('/_worker.js'))
    || files.find(项 => 项.path.toLowerCase().endsWith('.js') && /worker/i.test(项.path));
  return 候选 ? new TextDecoder().decode(候选.bytes) : null;
}
