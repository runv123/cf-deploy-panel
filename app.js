// ============================================================
// 云端部署器 · 前端逻辑
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 分区：
//  1. 状态与常量
//  2. 服务注册表（前端镜像，和后端 SERVICES 对应）
//  3. DOM 工具
//  4. 服务卡片渲染（动态）
//  5. 登录 / 账户 / Zone 读取
//  6. 现有资源读取
//  7. 表单收集 & 部署
//  8. 日志 & 界面控制
//  9. 压缩包解压（zip）
// ============================================================

const $ = id => document.getElementById(id);

// ============ 1. 状态与常量 ============
const state = {
  loggedIn: false,
  accounts: [],
  zones: [],
  services: {},      // 服务配置状态 { kv: { enabled, bindName, mode, ... } }
  resources: {},     // 现有资源 { kv: [...], d1: [...], ... }
  packageFiles: null,
};

// 前端服务注册表（镜像后端，含 collectPayload 逻辑）
const SERVICES = [
  { id: 'kv', label: 'KV 命名空间', icon: '🗄️', freeTier: '1GB / 10万读每天', defaultBind: 'KV', bindPlaceholder: 'KV' },
  { id: 'd1', label: 'D1 数据库', icon: '🗃️', freeTier: '5GB / 500万行读每月', defaultBind: 'DB', bindPlaceholder: 'DB' },
  { id: 'r2', label: 'R2 存储桶', icon: '🪣', freeTier: '10GB / 100万操作每月', defaultBind: 'BUCKET', bindPlaceholder: 'BUCKET' },
  { id: 'queues', label: 'Queues 队列', icon: '📨', freeTier: '1万条/天', defaultBind: 'QUEUE', bindPlaceholder: 'QUEUE' },
  { id: 'durable', label: 'Durable Objects', icon: '🧩', freeTier: '40万GB-s/月', defaultBind: 'DO', bindPlaceholder: 'DO', extraField: 'className', extraLabel: '类名', extraPlaceholder: 'MyObject' },
  { id: 'vectorize', label: 'Vectorize 向量库', icon: '🧠', freeTier: '免费档有额度', defaultBind: 'VECTORIZE', bindPlaceholder: 'VECTORIZE', extraField: 'dimensions', extraLabel: '维度', extraPlaceholder: '768' },
  { id: 'workflows', label: 'Workflows 工作流', icon: '🔁', freeTier: '免费档有额度', defaultBind: 'WORKFLOW', bindPlaceholder: 'WORKFLOW' },
  { id: 'hyperdrive', label: 'Hyperdrive 连接池', icon: '🚀', freeTier: '10万查询/天', defaultBind: 'HYPERDRIVE', bindPlaceholder: 'HYPERDRIVE', extraField: 'connectionString', extraLabel: '连接串', extraPlaceholder: 'postgres://...' },
];

// ============ 2. DOM 工具 ============
function fillSelect(select, items, emptyLabel) {
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.append(empty);
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} (${item.id})`;
    select.append(option);
  }
  if (items.length === 1) select.value = items[0].id;
}

function appendOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  select.append(option);
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `请求失败: ${response.status}`);
  return data;
}

function randomName(prefix) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${suffix}`;
}

function sanitizeProjectName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
}

// ============ 3. 服务卡片渲染 ============
function renderServiceCards() {
  const container = $('serviceCards');
  container.innerHTML = '';
  for (const service of SERVICES) {
    const cfg = state.services[service.id] || { enabled: false, bindName: service.defaultBind, mode: 'new', existingId: '' };
    state.services[service.id] = cfg;

    const card = document.createElement('div');
    card.className = 'service-card';
    card.dataset.service = service.id;

    const header = document.createElement('div');
    header.className = 'service-card-header';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.id = `svc-${service.id}`;
    check.checked = cfg.enabled;
    check.addEventListener('change', () => {
      cfg.enabled = check.checked;
      card.classList.toggle('enabled', check.checked);
      form.classList.toggle('page-hidden', !check.checked);
    });
    const title = document.createElement('span');
    title.className = 'service-title';
    title.textContent = `${service.icon} ${service.label}`;
    const tier = document.createElement('span');
    tier.className = 'service-tier';
    tier.textContent = service.freeTier;
    header.append(check, title, tier);
    card.append(header);

    const form = document.createElement('div');
    form.className = 'service-card-form page-hidden';
    if (cfg.enabled) { form.classList.remove('page-hidden'); card.classList.add('enabled'); }

    const row1 = document.createElement('div');
    row1.className = 'service-form-row';
    // 绑定名
    const bindWrap = document.createElement('label');
    bindWrap.innerHTML = `<span>绑定名</span>`;
    const bindInput = document.createElement('input');
    bindInput.value = cfg.bindName;
    bindInput.placeholder = service.bindPlaceholder;
    bindInput.addEventListener('change', () => cfg.bindName = bindInput.value.trim() || service.defaultBind);
    bindWrap.append(bindInput);
    row1.append(bindWrap);

    // 模式（新建/复用）
    const modeWrap = document.createElement('label');
    modeWrap.innerHTML = `<span>资源</span>`;
    const modeSelect = document.createElement('select');
    appendOption(modeSelect, 'new', '新建随机');
    appendOption(modeSelect, 'existing', '复用现有');
    modeSelect.value = cfg.mode;
    modeSelect.addEventListener('change', () => {
      cfg.mode = modeSelect.value;
      existingWrap.classList.toggle('page-hidden', modeSelect.value !== 'existing');
    });
    modeWrap.append(modeSelect);
    row1.append(modeWrap);
    form.append(row1);

    // 复用现有下拉
    const existingWrap = document.createElement('div');
    existingWrap.className = 'service-form-row page-hidden';
    const existLabel = document.createElement('label');
    existLabel.innerHTML = `<span>已有资源</span>`;
    const existSelect = document.createElement('select');
    existSelect.dataset.noFill = '1';
    existSelect.addEventListener('change', () => cfg.existingId = existSelect.value);
    existLabel.append(existSelect);
    existingWrap.append(existLabel);
    form.append(existingWrap);

    // 额外字段（durable/vectorize/hyperdrive）
    if (service.extraField) {
      const extraRow = document.createElement('div');
      extraRow.className = 'service-form-row';
      const extraLabel = document.createElement('label');
      extraLabel.innerHTML = `<span>${service.extraLabel}</span>`;
      const extraInput = document.createElement('input');
      extraInput.value = cfg[service.extraField] || '';
      extraInput.placeholder = service.extraPlaceholder;
      extraInput.addEventListener('change', () => cfg[service.extraField] = extraInput.value);
      extraLabel.append(extraInput);
      extraRow.append(extraLabel);
      form.append(extraRow);
    }

    card.append(form);
    container.append(card);
  }
  refreshResourceSelects();
}

function refreshResourceSelects() {
  for (const service of SERVICES) {
    const card = document.querySelector(`.service-card[data-service="${service.id}"]`);
    if (!card) continue;
    const cfg = state.services[service.id];
    const existSelect = card.querySelector('select[data-no-fill]');
    if (!existSelect) continue;
    existSelect.innerHTML = '';
    const 资源列表 = state.resources[service.id] || [];
    appendOption(existSelect, '', 资源列表.length ? '选择已有资源' : '暂无（先读取）');
    for (const item of 资源列表) appendOption(existSelect, item.id, item.name);
    if (cfg.existingId) existSelect.value = cfg.existingId;
  }
}

// ============ 4. 登录 / 账户 / Zone ============
async function login() {
  setLoginStatus('登录中...');
  setBusy(true);
  try {
    await loadCloudflareBase();
    state.loggedIn = true;
    showPage('deploy');
    setLoginStatus('登录成功', 'success');
    setResult('已登录，可以配置部署', 'success');
  } catch (error) {
    setLoginStatus(error.message, 'error');
    log(`登录失败: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function loadCloudflareBase() {
  const credentials = getCredentials();
  const [accountsRes, zonesRes] = await Promise.all([
    post('/api/accounts', { credentials }),
    post('/api/zones', { credentials }),
  ]);
  state.accounts = accountsRes.accounts || [];
  state.zones = zonesRes.zones || [];
  fillSelect($('accountId'), state.accounts, '自动选择第一个账户');
  fillSelect($('zoneId'), state.zones, '不绑定域名');
  log(`账户数量: ${state.accounts.length}`);
  log(`可用 Zone: ${state.zones.length}`);
}

function getCredentials() {
  const email = $('email').value.trim();
  const key = $('key').value.trim();
  if (!email || !key) throw new Error('请填写 Cloudflare 邮箱和 Global API Key');
  return { email, key };
}

// ============ 5. 现有资源读取 ============
async function loadResources() {
  const credentials = getCredentials();
  const accountId = $('accountId').value || state.accounts[0]?.id;
  if (!accountId) throw new Error('请先读取并选择 Account');
  setResult('读取现有资源中...');
  const services = {};
  for (const service of SERVICES) {
    services[service.id] = !!state.services[service.id]?.enabled;
  }
  const res = await post('/api/resources', { credentials, accountId, services });
  state.resources = res.resources || {};
  refreshResourceSelects();
  (res.warnings || []).forEach(w => log(`提示: ${w}`));
  setResult('现有资源读取完成', 'success');
}

// ============ 6. 表单收集 & 部署 ============
function collectPayload() {
  const credentials = getCredentials();
  const deployMode = $('deployMode').value;
  const deployType = $('deployType').value;
  const projectName = $('projectName').value.trim();

  if (deployMode === 'update') {
    if (!projectName) throw new Error('更新模式必须填写项目名');
    return { credentials, deployMode, deployType, projectName, sourceMode: $('sourceMode').value };
  }

  const services = {};
  for (const service of SERVICES) {
    const cfg = state.services[service.id];
    if (!cfg?.enabled) continue;
    services[service.id] = {
      enabled: true,
      bindName: cfg.bindName,
      mode: cfg.mode,
      existingId: cfg.existingId || '',
      title: cfg.title || randomName(service.id),
    };
    for (const extra of ['className', 'dimensions', 'connectionString']) {
      if (cfg[extra]) services[service.id][extra] = cfg[extra];
    }
  }

  const payload = {
    credentials,
    accountId: $('accountId').value || state.accounts[0]?.id,
    deployMode,
    deployType,
    sourceMode: $('sourceMode').value,
    projectName,
    uuid: $('uuid').value.trim() || crypto.randomUUID(),
    hostname: $('hostname').value.trim(),
    zoneId: $('zoneId').value,
    enableWorkersDev: $('enableWorkersDev').checked,
    services,
  };
  if (state.packageFiles && state.packageFiles.length) payload.files = state.packageFiles;
  return payload;
}

async function runDeploy() {
  if (!state.loggedIn) { setResult('请先登录', 'error'); showPage('login'); return; }
  setResult('部署中...');
  hideResultActions();
  setBusy(true);
  try {
    const payload = collectPayload();
    const result = await post('/api/deploy', payload);
    (result.logs || []).forEach(log);
    const url = result.domain?.hostname
      ? `https://${result.domain.hostname}`
      : (result.deployType === 'worker' ? `https://${result.projectName}.workers.dev` : `https://${result.projectName}.pages.dev`);
    setResult(`${result.projectName} 部署完成`, 'success');
    renderResultActions({ url, uuid: result.uuid, projectName: result.projectName });
  } catch (error) {
    setResult(error.message, 'error');
    log(`错误: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function renderResultActions(info) {
  const box = $('resultActions');
  box.innerHTML = '';
  box.classList.remove('page-hidden');
  const link = document.createElement('a');
  link.href = info.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'result-link';
  link.textContent = info.url;
  const wrap = document.createElement('div');
  wrap.className = 'result-link-wrap';
  wrap.append(link);
  box.append(wrap);
  box.append(actionButton('复制链接', () => copyText(info.url)));
  box.append(actionButton('复制 UUID', () => copyText(info.uuid)));
  box.append(actionButton('打开', () => window.open(info.url, '_blank', 'noopener')));
}

function actionButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary small';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function hideResultActions() {
  const box = $('resultActions');
  box.innerHTML = '';
  box.classList.add('page-hidden');
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    log(`已复制: ${text}`);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    log(`已复制: ${text}`);
  }
}

// ============ 7. 日志 & 界面控制 ============
function log(text) {
  const target = $('logs');
  target.textContent += `${text}\n`;
  target.scrollTop = target.scrollHeight;
}

function setBusy(busy) {
  for (const button of document.querySelectorAll('button')) button.disabled = busy;
}

function setLoginStatus(text, type = '') {
  $('loginStatus').textContent = text;
  $('loginStatus').className = `result ${type}`.trim();
}

function setResult(text, type = '') {
  $('result').textContent = text;
  $('result').className = `result ${type}`.trim();
}

function showPage(page) {
  $('loginPage').classList.toggle('page-hidden', page !== 'login');
  $('deployPage').classList.toggle('page-hidden', page !== 'deploy');
}

// ============ 8. 压缩包解压（zip） ============
async function unzipToFiles(file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buffer.buffer);
  const decoder = new TextDecoder('utf-8');
  const files = [];
  for (let offset = 0; offset + 4 <= buffer.length;) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    let nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength > buffer.length) break;
    const rawName = decoder.decode(buffer.subarray(nameStart, nameEnd));
    const dataStart = nameEnd + extraLength;
    const hasDataDescriptor = (flags & 0x08) !== 0;
    let size = compressedSize;
    if (hasDataDescriptor || size === 0) {
      const nextOffset = findNextLocalHeader(buffer, view, dataStart);
      size = nextOffset === -1 ? buffer.length - dataStart : nextOffset - dataStart;
    }
    const dataEnd = Math.min(dataStart + size, buffer.length);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const path = normalizeZipPath(rawName);
    if (path && !path.endsWith('/')) {
      const content = await decompressEntry(compressed, method);
      files.push({ path, base64: bytesToBase64(content), size: content.length });
    }
    if (hasDataDescriptor) {
      const nextOffset = findNextLocalHeader(buffer, view, dataStart);
      if (nextOffset === -1) break;
      offset = nextOffset;
    } else {
      offset = dataEnd;
    }
  }
  return files;
}

function findNextLocalHeader(buffer, view, from) {
  for (let index = from; index + 4 <= buffer.length; index++) {
    if (view.getUint32(index, true) === 0x04034b50) return index;
  }
  return -1;
}

async function decompressEntry(compressed, method) {
  if (method === 0) return compressed;
  if (method !== 8) throw new Error(`不支持的压缩方式 (method=${method})`);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function normalizeZipPath(path) {
  const cleaned = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  if (!cleaned || cleaned.includes('..')) return '';
  return cleaned.endsWith('/') ? cleaned : `/${cleaned.replace(/^\/+/, '')}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

async function onPackageChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) { state.packageFiles = null; $('packageHint').textContent = '选择 .zip 压缩包即可一键部署；不选则拉取远程默认源。'; return; }
  if (!/\.zip$/i.test(file.name)) {
    state.packageFiles = null;
    event.target.value = '';
    $('packageHint').textContent = '只支持 .zip 压缩包，请重新选择。';
    return;
  }
  try {
    $('packageHint').textContent = `正在解析 ${file.name} ...`;
    const files = await unzipToFiles(file);
    if (!files.length) throw new Error('压缩包内没有可部署的文件');
    state.packageFiles = files;
    const 有Worker = files.some(item => item.path.endsWith('_worker.js'));
    $('packageHint').textContent = `已读取 ${file.name}：共 ${files.length} 个文件${有Worker ? '（含 _worker.js，将作为高级模式脚本提交）' : ''}`;
    log(`已解析压缩包: ${file.name}，文件数 ${files.length}`);
  } catch (error) {
    state.packageFiles = null;
    event.target.value = '';
    $('packageHint').textContent = `解析失败: ${error.message}`;
    log(`压缩包解析失败: ${error.message}`);
  }
}

// ============ 初始化 ============
function init() {
  $('uuid').value = crypto.randomUUID();
  renderServiceCards();
  showPage('login');

  $('loginButton').addEventListener('click', login);
  $('backToLogin').addEventListener('click', () => {
    state.loggedIn = false;
    showPage('login');
    setLoginStatus('已返回登录页');
  });
  $('deploy').addEventListener('click', runDeploy);
  $('newNames').addEventListener('click', () => {
    $('uuid').value = crypto.randomUUID();
    $('projectName').value = randomName('edge');
    setResult('已重新随机', 'success');
  });
  $('loadResources').addEventListener('click', async () => {
    setBusy(true);
    try { await loadResources(); } catch (error) { setResult(error.message, 'error'); log(`错误: ${error.message}`); }
    finally { setBusy(false); }
  });
  $('clearLogs').addEventListener('click', () => { $('logs').textContent = ''; });
  $('packageFile').addEventListener('change', onPackageChange);
}

init();
