// ============================================================
//  云端部署器 —— Cloudflare Pages 一键部署面板（服务端）
//  由 数码解码 独立开发并维护
//  默认部署目标：星云解码（Nebula-Decode，同为 数码解码 自主开发）
//  请勿移除作者与版权声明。
// ============================================================
const 接口地址 = 'https://api.cloudflare.com/client/v4';
const 兼容日期 = '2026-01-20';
const 绑定名 = 'KV';
// 数码解码官方源码仓库：部署时实时拉取（encoded=混淆源, plain=明文源），可换成自己的仓库
const 源码远程基础 = 'https://raw.githubusercontent.com/shuma12303/nebula-decode/main/public';

export default {
  async fetch(request, env, ctx) {
    const 路径 = new URL(request.url).pathname;
    if (路径.startsWith('/api/')) {
      const context = {
        request,
        env,
        waitUntil: ctx?.waitUntil?.bind(ctx),
        passThroughOnException: ctx?.passThroughOnException?.bind(ctx)
      };
      return request.method === 'POST' ? onRequestPost(context) : onRequest(context);
    }
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  }
};

export async function onRequestPost(context) {
  try {
    const 数据 = await context.request.json().catch(() => ({}));
    const 路径 = new URL(context.request.url).pathname.replace(/^\/api\/?/, '');
    if (路径 === 'accounts') {
      const accounts = await 调用接口(数据.credentials, '/accounts?per_page=50');
      return 返回JSON(200, { ok: true, accounts: accounts.map(账户 => ({ id: 账户.id, name: 账户.name })) });
    }
    if (路径 === 'zones') {
      const zones = await 调用接口(数据.credentials, '/zones?status=active&per_page=100');
      return 返回JSON(200, { ok: true, zones: zones.map(区域 => ({ id: 区域.id, name: 区域.name })) });
    }
    if (路径 === 'resources') {
      if (!数据.accountId) throw new Error('缺少 Account ID');
      const resources = await 读取资源列表(数据.credentials, 数据.accountId);
      return 返回JSON(200, { ok: true, ...resources });
    }
    if (路径 === 'deploy') {
      const 结果 = await 部署(数据, context);
      return 返回JSON(200, { ok: true, ...结果 });
    }
    return 返回JSON(404, { ok: false, error: '接口不存在' });
  } catch (错误) {
    return 返回JSON(500, { ok: false, error: 错误.message || String(错误) });
  }
}

export function onRequest() {
  return 返回JSON(405, { ok: false, error: '只支持 POST' });
}

async function 部署(数据, context) {
  数据 = await 补全部署默认值(数据);
  校验部署参数(数据);
  const 日志 = [];
  const 记录 = 文本 => 日志.push(`[${new Date().toLocaleTimeString()}] ${文本}`);
  const uuid = 数据.uuid || crypto.randomUUID();
  const 操作模式 = 数据.deployMode === 'update' ? 'update' : 'create';
  const 原始项目名 = String(数据.projectName || '').trim();
  const 项目名 = 操作模式 === 'update' ? 原始项目名 : 清理项目名(原始项目名 || 生成随机名称('edge'));
  const 模式 = 数据.sourceMode === 'plain' ? 'plain' : 'encoded';
  const 部署方式 = 数据.deployType === 'worker' ? 'worker' : 'pages';
  const 上传文件 = 解析上传文件(数据.files);
  记录(`准备${操作模式 === 'update' ? '更新' : '部署'} ${部署方式 === 'pages' ? 'Pages' : 'Worker'}: ${项目名}`);
  if (上传文件) {
    记录(`部署源: 上传压缩包，共 ${上传文件.length} 个文件`);
  } else {
    记录(`部署源: ${模式 === 'plain' ? '明文源' : '加密/混淆源'}，实时联网拉取`);
  }
  if (操作模式 === 'update') {
    if (部署方式 === 'worker') {
      await 同步Worker代码(数据.credentials, {
        accountId: 数据.accountId,
        scriptName: 项目名,
        sourceMode: 模式,
        files: 上传文件
      }, context, 记录);
    } else {
      await 同步Pages代码(数据.credentials, {
        accountId: 数据.accountId,
        projectName: 项目名,
        sourceMode: 模式,
        files: 上传文件
      }, context, 记录);
    }
    记录('更新模式只同步代码，未修改 UUID、KV、域名或项目配置');
    return { deployType: 部署方式, projectName: 项目名, sourceMode: 模式, logs: 日志 };
  }
  const 命名空间 = await 获取或创建KV(数据.credentials, 数据.accountId, {
    id: 数据.kvId,
    title: 数据.kvTitle || 生成随机名称('store')
  }, 记录);
  if (命名空间.created) {
    await 初始化KV(数据.credentials, 数据.accountId, 命名空间.id, uuid, 记录);
  } else {
    记录('复用现有 KV，保留原配置');
  }
  if (部署方式 === 'worker') {
    await 部署Worker(数据.credentials, {
      accountId: 数据.accountId,
      scriptName: 项目名,
      sourceMode: 模式,
      uuid,
      kvId: 命名空间.id,
      enableWorkersDev: !!数据.enableWorkersDev,
      files: 上传文件
    }, context, 记录);
  } else {
    await 部署Pages(数据.credentials, {
      accountId: 数据.accountId,
      projectName: 项目名,
      sourceMode: 模式,
      uuid,
      kvId: 命名空间.id,
      files: 上传文件
    }, context, 记录);
  }
  let domain = null;
  if (数据.hostname && 数据.zoneId) {
    domain = await 绑定域名(数据.credentials, {
      accountId: 数据.accountId,
      deployType: 部署方式,
      projectName: 项目名,
      zoneId: 数据.zoneId,
      hostname: 数据.hostname
    }, 记录);
  }
  const domains = await 列出绑定域名(数据.credentials, {
    accountId: 数据.accountId,
    deployType: 部署方式,
    projectName: 项目名
  }, 记录);
  记录('部署完成');
  return {
    deployType: 部署方式,
    projectName: 项目名,
    sourceMode: 模式,
    uuid,
    kv: { id: 命名空间.id, title: 命名空间.title || 数据.kvTitle || '' },
    domain,
    domains,
    logs: 日志
  };
}
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

async function 读取资源列表(凭据, accountId) {
  const [workerResult, pagesResult, kvResult] = await Promise.allSettled([
    调用接口(凭据, `/accounts/${accountId}/workers/scripts?per_page=100`),
    读取Pages项目列表(凭据, accountId),
    调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`)
  ]);
  const warnings = [];
  const workers = 提取列表(workerResult, warnings, 'Worker')
    .map(项目 => ({ name: 项目.id || 项目.script_name || 项目.name, title: 项目.id || 项目.script_name || 项目.name }))
    .filter(项目 => 项目.name);
  const pages = 提取列表(pagesResult, warnings, 'Pages')
    .map(项目 => ({
      name: 项目.name,
      title: 项目.name,
      kvId: 提取PagesKV(项目),
      domains: 项目.domains || []
    }))
    .filter(项目 => 项目.name);
  const kvs = 提取列表(kvResult, warnings, 'KV')
    .map(空间 => ({ id: 空间.id, title: 空间.title }))
    .filter(空间 => 空间.id);
  return { workers, pages, kvs, warnings };
}

function 提取PagesKV(项目) {
  const 配置 = 项目?.deployment_configs || {};
  for (const 环境 of ['production', 'preview']) {
    const 命名空间 = 配置[环境]?.kv_namespaces || {};
    const 绑定 = 命名空间[绑定名] || Object.values(命名空间)[0];
    if (绑定?.namespace_id) return 绑定.namespace_id;
    if (typeof 绑定 === 'string') return 绑定;
  }
  return '';
}

async function 读取Pages项目列表(凭据, accountId) {
  try {
    return await 调用接口(凭据, `/accounts/${accountId}/pages/projects`);
  } catch (错误) {
    if (!String(错误.message || '').includes('Invalid list options')) throw 错误;
    return await 调用接口(凭据, `/accounts/${accountId}/pages/projects?page=1`);
  }
}

function 提取列表(result, warnings, label) {
  if (result.status === 'fulfilled') return Array.isArray(result.value) ? result.value : [];
  warnings.push(`${label} 列表读取失败: ${result.reason?.message || result.reason}`);
  return [];
}

function 校验部署参数(数据) {
  if (!数据?.credentials?.email || !数据?.credentials?.key) throw new Error('缺少 Cloudflare 邮箱或 Global API Key');
  if (!数据.accountId) throw new Error('缺少 Account ID');
  if (数据.deployMode === 'update' && !String(数据.projectName || '').trim()) throw new Error('更新现有项目时必须选择项目名称');
  if (数据.deployMode === 'update') return;
  if (数据.hostname && !数据.zoneId) throw new Error('绑定域名时必须选择 Zone');
}
async function 部署Worker(凭据, 选项, context, 记录) {
  const 代码 = await 读取源代码(选项.sourceMode, context, 选项.files);
  const 表单 = new FormData();
  const 元数据 = {
    main_module: 'worker.js',
    compatibility_date: 兼容日期,
    bindings: [
      { type: 'plain_text', name: 'UUID', text: 选项.uuid },
      { type: 'kv_namespace', name: 绑定名, namespace_id: 选项.kvId }
    ]
  };
  表单.append('metadata', new Blob([JSON.stringify(元数据)], { type: 'application/json' }), 'metadata.json');
  表单.append('worker.js', new Blob([代码], { type: 'application/javascript+module' }), 'worker.js');
  await 调用接口(凭据, `/accounts/${选项.accountId}/workers/scripts/${encodeURIComponent(选项.scriptName)}`, {
    method: 'PUT',
    body: 表单
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
    method: 'PUT',
    body: 表单
  });
  记录('Worker 代码已同步，现有绑定和设置按原值提交');
}

async function 读取Worker设置(凭据, accountId, scriptName) {
  try {
    return await 调用接口(凭据, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/settings`);
  } catch (错误) {
    throw new Error(`读取现有 Worker 设置失败，已停止更新以避免覆盖 KV/UUID 配置: ${错误.message}`);
  }
}

function 生成保留Worker元数据(设置) {
  const 元数据 = {};
  for (const 字段 of [
    'main_module',
    'compatibility_date',
    'compatibility_flags',
    'bindings',
    'migrations',
    'usage_model',
    'limits',
    'placement',
    'tail_consumers',
    'logpush'
  ]) {
    if (设置?.[字段] !== undefined && 设置?.[字段] !== null) 元数据[字段] = 设置[字段];
  }
  if (!元数据.main_module) 元数据.main_module = 'worker.js';
  if (!元数据.compatibility_date) throw new Error('无法读取现有 Worker compatibility_date，已停止更新以避免修改配置');
  if (!Array.isArray(元数据.bindings)) throw new Error('无法读取现有 Worker 绑定，已停止更新以避免覆盖 KV/UUID 配置');
  return 元数据;
}

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
  记录('Pages 更新模式不修改 KV/变量/域名配置');
  await 上传Pages部署(凭据, 选项.accountId, 选项.projectName, 代码, 选项.files, 记录);
  记录('Pages 代码同步完成');
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
    method: 'POST',
    body: 表单
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
    const 内容 = '<!doctype html><meta charset="utf-8"><title>Deploy</title>';
    const 字节 = new TextEncoder().encode(内容);
    const hash = await 计算资源Hash(字节, 'html');
    资源列表.push({ path: '/index.html', hash, bytes: 字节, ext: 'html' });
  }
  const hashes = 资源列表.map(项 => 项.hash);
  const missing = await 调用JWT接口(jwt, '/pages/assets/check-missing', {
    method: 'POST',
    body: { hashes }
  });
  const 需要上传 = new Set(Array.isArray(missing) ? missing : hashes);
  const 上传负载 = [];
  for (const 项 of 资源列表) {
    if (!需要上传.has(项.hash)) continue;
    上传负载.push({
      key: 项.hash,
      value: 字节转Base64(项.bytes),
      metadata: { contentType: 内容类型(项.ext) },
      base64: true
    });
  }
  for (let index = 0; index < 上传负载.length; index += 50) {
    await 调用JWT接口(jwt, '/pages/assets/upload', {
      method: 'POST',
      body: 上传负载.slice(index, index + 50)
    });
  }
  if (上传负载.length) 记录(`已上传 ${上传负载.length} 个资源（跳过 ${资源列表.length - 上传负载.length} 个已存在）`);
  await 调用JWT接口(jwt, '/pages/assets/upsert-hashes', {
    method: 'POST',
    body: { hashes }
  }).catch(() => null);
  const manifest = {};
  for (const 项 of 资源列表) manifest[项.path] = 项.hash;
  return manifest;
}

function 提取扩展名(path) {
  const 匹配 = /\.([a-z0-9]+)$/i.exec(String(path || ''));
  return 匹配 ? 匹配[1].toLowerCase() : 'txt';
}

function 内容类型(ext) {
  const 映射 = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    wasm: 'application/wasm',
    pdf: 'application/pdf',
    xml: 'application/xml'
  };
  return 映射[ext] || 'application/octet-stream';
}

async function 生成WorkerBundle(workerCode) {
  const 内层 = new FormData();
  const 元数据 = {
    main_module: 'worker.js',
    compatibility_date: 兼容日期
  };
  内层.set('metadata', JSON.stringify(元数据));
  内层.set('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
  return await new Response(内层).blob();
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
        deployment_configs: 生成Pages配置(选项)
      }
    });
    记录('Pages 项目已创建');
    return 项目;
  }
  await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}`, {
    method: 'PATCH',
    body: { deployment_configs: 合并Pages配置(项目.deployment_configs || {}, 选项) }
  });
  记录('Pages 项目配置已更新');
  return 项目;
}

function 生成Pages配置(选项) {
  const 单项 = {
    compatibility_date: 兼容日期,
    env_vars: { UUID: { type: 'plain_text', value: 选项.uuid } },
    kv_namespaces: { [绑定名]: { namespace_id: 选项.kvId } }
  };
  return { production: 单项, preview: 单项 };
}

function 合并Pages配置(已有, 选项) {
  const 输出 = structuredClone(已有 || {});
  for (const 名称 of ['production', 'preview']) {
    输出[名称] = 输出[名称] || {};
    输出[名称].compatibility_date = 兼容日期;
    输出[名称].env_vars = 输出[名称].env_vars || {};
    输出[名称].env_vars.UUID = { type: 'plain_text', value: 选项.uuid };
    输出[名称].kv_namespaces = 输出[名称].kv_namespaces || {};
    输出[名称].kv_namespaces[绑定名] = { namespace_id: 选项.kvId };
  }
  return 输出;
}
async function 获取或创建KV(凭据, accountId, 选项, 记录) {
  const 列表 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  if (选项.id) {
    const 已选 = 列表.find(项 => 项.id === 选项.id);
    if (已选) {
      记录(`复用 KV: ${已选.title}`);
      return { ...已选, created: false };
    }
    记录(`使用指定 KV: ${选项.id}`);
    return { id: 选项.id, title: 选项.title || 选项.id, created: false };
  }
  const 标题 = 选项.title;
  const 已有 = 列表.find(项 => 项.title === 标题);
  if (已有) {
    记录(`复用 KV: ${标题}`);
    return { ...已有, created: false };
  }
  const 创建结果 = await 调用接口(凭据, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: { title: 标题 }
  });
  记录(`创建 KV: ${标题}`);
  return { ...创建结果, title: 标题, created: true };
}

async function 初始化KV(凭据, accountId, namespaceId, uuid, 记录) {
  // 星云解码（Nebula-Decode，数码解码自主开发）的配置键：cf_terminal_cfg（JSON 配置）+ cf_terminal_ips（优选 IP 数组）
  // loadConfig 逐字段合并（KV > 环境变量 > 默认值），因此只需写入用户选择的 UUID，其余字段自动回落默认。
  const 初始配置 = JSON.stringify({ uuid: String(uuid || '').trim().toLowerCase() });
  await 调用原始接口(凭据, `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/cf_terminal_cfg`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: 初始配置
  });
  await 调用原始接口(凭据, `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/cf_terminal_ips`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: '[]'
  });
  记录('KV 已写入星云解码初始配置（UUID 已固化）');
}

async function 启用WorkersDev(凭据, accountId, scriptName) {
  const 路径 = `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`;
  try {
    await 调用接口(凭据, 路径, { method: 'POST', body: { enabled: true } });
  } catch {
    await 调用接口(凭据, 路径, { method: 'PUT', body: { enabled: true } });
  }
}

async function 绑定域名(凭据, 选项, 记录) {
  if (选项.deployType === 'pages') {
    const 结果 = await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}/domains`, {
      method: 'POST',
      body: { name: 选项.hostname }
    });
    记录(`Pages 域名已绑定: ${选项.hostname}`);
    // 自动创建 CNAME 记录指向 Pages 项目，同账号域名可自动通过验证
    try {
      await 调用接口(凭据, `/zones/${选项.zoneId}/dns_records`, {
        method: 'POST',
        body: { type: 'CNAME', name: 选项.hostname, content: `${选项.projectName}.pages.dev`, proxied: true }
      });
      记录(`CNAME 记录已创建: ${选项.hostname} → ${选项.projectName}.pages.dev`);
    } catch (dns错误) {
      记录(`CNAME 记录创建跳过(可能已存在): ${dns错误.message}`);
    }
    return { hostname: 结果.name || 选项.hostname, type: 'pages' };
  }
  const 请求体 = {
    environment: 'production',
    hostname: 选项.hostname,
    service: 选项.projectName,
    zone_id: 选项.zoneId
  };
  try {
    const 结果 = await 调用接口(凭据, `/accounts/${选项.accountId}/workers/domains`, {
      method: 'PUT',
      body: 请求体
    });
    记录(`Worker 自定义域名已绑定: ${选项.hostname}`);
    return { hostname: 结果.hostname || 选项.hostname, type: 'worker' };
  } catch (错误) {
    await 调用接口(凭据, `/zones/${选项.zoneId}/workers/routes`, {
      method: 'POST',
      body: { pattern: `${选项.hostname}/*`, script: 选项.projectName }
    });
    记录(`Worker Route 已绑定: ${选项.hostname}/*`);
    return { hostname: 选项.hostname, type: 'route', warning: 错误.message };
  }
}

async function 列出绑定域名(凭据, 选项, 记录) {
  try {
    if (选项.deployType === 'pages') {
      const 列表 = await 调用接口(凭据, `/accounts/${选项.accountId}/pages/projects/${encodeURIComponent(选项.projectName)}/domains`);
      return 列表.map(项 => ({ hostname: 项.name || 项.hostname, status: 项.status || '' }));
    }
    const 列表 = await 调用接口(凭据, `/accounts/${选项.accountId}/workers/domains?per_page=100`);
    return 列表
      .filter(项 => 项.service === 选项.projectName || 项.script === 选项.projectName)
      .map(项 => ({ hostname: 项.hostname || 项.domain, status: 项.status || '' }));
  } catch (错误) {
    记录(`域名列表读取失败: ${错误.message}`);
    return [];
  }
}
function 解析上传文件(files) {
  if (!Array.isArray(files) || !files.length) return null;
  const 输出 = [];
  for (const 项 of files) {
    const 路径 = 规范化资源路径(项?.path);
    if (!路径 || typeof 项?.base64 !== 'string') continue;
    输出.push({ path: 路径, bytes: Base64转字节(项.base64) });
  }
  return 输出.length ? 输出 : null;
}

function 规范化资源路径(path) {
  if (!path) return '';
  const 清理 = String(path).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  if (!清理 || 清理.includes('..') || 清理.endsWith('/')) return '';
  return `/${清理}`;
}

function Base64转字节(base64) {
  const 二进制 = atob(base64);
  const 字节 = new Uint8Array(二进制.length);
  for (let index = 0; index < 二进制.length; index++) 字节[index] = 二进制.charCodeAt(index);
  return 字节;
}

function 查找入口文件(files) {
  if (!files) return null;
  const 候选 = files.find(项 => 项.path.toLowerCase() === '/_worker.js')
    || files.find(项 => 项.path.toLowerCase().endsWith('/_worker.js'))
    || files.find(项 => 项.path.toLowerCase().endsWith('.js') && /worker/i.test(项.path));
  return 候选 ? new TextDecoder().decode(候选.bytes) : null;
}

function 查找根静态资源(files) {
  if (!files) return null;
  const 索引 = files.find(项 => /^\/(index\.html|index\.htm)$/i.test(项.path));
  if (索引) return 索引;
  return files.find(项 => /\.(html|htm)$/i.test(项.path)) || files[0] || null;
}

async function 读取源代码(mode, context, files) {
  if (files) {
    const 入口 = 查找入口文件(files);
    if (!入口) throw new Error('上传的压缩包中未找到 _worker.js，无法作为 Pages 高级模式脚本部署');
    return 入口;
  }
  const 文件名 = '_worker.js';
  const 远程地址 = `${源码远程基础}/${encodeURIComponent(文件名)}?t=${Date.now()}`;
  const 响应 = await fetch(远程地址, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });
  if (!响应.ok) throw new Error(`实时拉取源文件失败: ${响应.status} ${响应.statusText}`);
  const 内容 = await 响应.text();
  if (!内容.trim()) throw new Error('实时拉取源文件失败: 远程源文件为空');
  return 内容;
}

async function 调用接口(凭据, 路径, 选项 = {}) {
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

async function 调用原始接口(凭据, 路径, 选项 = {}) {
  const headers = {
    'X-Auth-Email': 凭据.email,
    'X-Auth-Key': 凭据.key,
    ...(选项.headers || {})
  };
  return await 请求JSON(`${接口地址}${路径}`, headers, 选项);
}

async function 调用JWT接口(jwt, 路径, 选项 = {}) {
  const headers = {
    Authorization: `Bearer ${jwt}`,
    ...(选项.headers || {})
  };
  return await 请求JSON(`${接口地址}${路径}`, headers, 选项);
}

async function 请求JSON(地址, headers, 选项 = {}) {
  let body = 选项.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const 响应 = await fetch(地址, {
    method: 选项.method || 'GET',
    headers,
    body
  });
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

async function 计算资源Hash(bytes, extension) {
  const 摘要 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${字节转Base64(bytes)}${extension}`));
  return [...new Uint8Array(摘要)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function 字节转Base64(bytes) {
  let 二进制 = '';
  const 步长 = 0x8000;
  for (let index = 0; index < bytes.length; index += 步长) {
    二进制 += String.fromCharCode(...bytes.slice(index, index + 步长));
  }
  return btoa(二进制);
}

function 返回JSON(状态码, 数据) {
  return new Response(JSON.stringify(数据), {
    status: 状态码,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function 清理项目名(名称) {
  return String(名称 || 生成随机名称('edge')).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 生成随机名称('edge');
}

function 生成随机名称(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
