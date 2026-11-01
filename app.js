// ============================================================
// 云端部署器 v2 · 前端逻辑
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 分区：
//  1. 状态 & 常量
//  2. DOM/API 工具
//  3. 登录持久化
//  4. Dashboard 渲染
//  5. 部署表单 & 服务卡片
//  6. 项目编辑页
//  7. CodeMirror 编辑器
//  8. 页面切换 & 日志
// ============================================================

const $ = id => document.getElementById(id);

// ============ 1. 状态 & 常量 ============
const state = {
  loggedIn: false,
  credentials: null,
  accounts: [],
  zones: [],
  services: {},
  resources: [],
  packageFiles: null,
  currentProject: null,
  currentTab: 'domains',
};

const SERVICES = [
  { id: 'kv', label: 'KV 命名空间', icon: '🗄️', freeTier: '1GB / 10万读每天', defaultBind: 'KV' },
  { id: 'd1', label: 'D1 数据库', icon: '🗃️', freeTier: '5GB / 500万行读每月', defaultBind: 'DB' },
  { id: 'r2', label: 'R2 存储桶', icon: '🪣', freeTier: '10GB / 100万操作每月', defaultBind: 'BUCKET' },
  { id: 'queues', label: 'Queues 队列', icon: '📨', freeTier: '1万条/天', defaultBind: 'QUEUE' },
  { id: 'durable', label: 'Durable Objects', icon: '🧩', freeTier: '40万GB-s/月', defaultBind: 'DO', extraField: 'className', extraLabel: '类名' },
  { id: 'vectorize', label: 'Vectorize 向量库', icon: '🧠', freeTier: '免费档有额度', defaultBind: 'VECTORIZE', extraField: 'dimensions', extraLabel: '维度' },
  { id: 'workflows', label: 'Workflows 工作流', icon: '🔁', freeTier: '免费档有额度', defaultBind: 'WORKFLOW' },
  { id: 'hyperdrive', label: 'Hyperdrive 连接池', icon: '🚀', freeTier: '10万查询/天', defaultBind: 'HYPERDRIVE', extraField: 'connectionString', extraLabel: '连接串' },
];

const CRED_KEY = 'cf-deploy-v2-cred';

// ============ 2. DOM/API 工具 ============
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

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `请求失败: ${response.status}`);
  return data;
}

function randomName(prefix) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${suffix}`;
}

// ============ 3. 登录持久化 ============
function saveCredentials(cred) {
  if ($('rememberMe').checked) localStorage.setItem(CRED_KEY, JSON.stringify(cred));
  else localStorage.removeItem(CRED_KEY);
}

function loadCredentials() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function tryAutoLogin() {
  const cred = loadCredentials();
  if (!cred) return false;
  $('email').value = cred.email;
  $('key').value = cred.key;
  $('rememberMe').checked = true;
  try {
    await doLogin(cred);
    return true;
  } catch { return false; }
}

async function login() {
  const cred = { email: $('email').value.trim(), key: $('key').value.trim() };
  if (!cred.email || !cred.key) { setLoginStatus('请填写邮箱和 Key', 'error'); return; }
  saveCredentials(cred);
  setLoginStatus('登录中...');
  setBusy(true);
  try {
    await doLogin(cred);
    setLoginStatus('登录成功', 'success');
  } catch (error) {
    setLoginStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function doLogin(cred) {
  const [accountsRes, zonesRes] = await Promise.all([
    post('/api/accounts', { credentials: cred }),
    post('/api/zones', { credentials: cred }),
  ]);
  state.credentials = cred;
  state.accounts = accountsRes.accounts || [];
  state.zones = zonesRes.zones || [];
  state.loggedIn = true;
  fillSelect($('accountId'), state.accounts, '自动选择第一个账户');
  fillSelect($('zoneId'), state.zones, '不绑定域名');
  fillSelect($('projectZone'), state.zones, '选择 Zone');
  showPage('dashboard');
  await loadDashboard();
}

// ============ 4. Dashboard 渲染 ============
async function loadDashboard() {
  if (!state.credentials) return;
  const accountId = $('accountId').value || state.accounts[0]?.id;
  const type = document.querySelector('.tag.active')?.dataset.type || '';
  const q = $('searchBox').value.trim();
  const query = new URLSearchParams({ accountId, type, q });
  const res = await getJson(`/api/dashboard?${query}`);
  state.resources = res.resources || [];
  renderDashboard();
}

function renderDashboard() {
  const projects = state.resources.filter(r => r.kind === 'project');
  const resources = state.resources.filter(r => r.kind !== 'project');
  renderProjectGrid(projects);
  renderResourceList(resources);
  $('projectCount').textContent = projects.length;
  $('resourceCount').textContent = resources.length;
}

function renderProjectGrid(projects) {
  const grid = $('projectGrid');
  grid.innerHTML = '';
  if (!projects.length) { grid.innerHTML = '<p class="empty">暂无项目</p>'; return; }
  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.id = p.id;
    card.dataset.type = p.type;
    const title = document.createElement('strong');
    title.textContent = `${p.type === 'pages' ? '📄' : '⚙️'} ${p.name}`;
    const meta = document.createElement('span');
    meta.className = 'project-meta';
    meta.textContent = p.domain ? p.domain : (p.type === 'worker' ? `${p.name}.workers.dev` : `${p.name}.pages.dev`);
    card.append(title, meta);
    card.addEventListener('click', () => openProject(p.type, p.name));
    grid.append(card);
  }
}

function renderResourceList(resources) {
  const list = $('resourceList');
  list.innerHTML = '';
  if (!resources.length) { list.innerHTML = '<p class="empty">暂无资源</p>'; return; }
  for (const r of resources) {
    const row = document.createElement('div');
    row.className = 'resource-row';
    const label = document.createElement('span');
    label.className = 'resource-label';
    const service = SERVICES.find(s => s.id === r.type);
    label.textContent = `${service?.icon || '🗂️'} ${r.name}`;
    const type = document.createElement('span');
    type.className = 'resource-type';
    type.textContent = r.label;
    const del = document.createElement('button');
    del.className = 'secondary small';
    del.textContent = '删除';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`删除 ${r.name}？`)) return;
      try {
        await post('/api/project/delete', { credentials: state.credentials, accountId: $('accountId').value || state.accounts[0]?.id, type: r.type, name: r.id });
        await loadDashboard();
      } catch (err) { setDashResult(err.message, 'error'); }
    });
    row.append(label, type, del);
    list.append(row);
  }
}

function setDashResult(text, type = '') {
  $('dashResult').textContent = text;
  $('dashResult').className = `result ${type}`.trim();
}

// ============ 5. 部署表单 & 服务卡片 ============
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
    check.checked = cfg.enabled;
    check.addEventListener('change', () => { cfg.enabled = check.checked; card.classList.toggle('enabled', check.checked); form.classList.toggle('page-hidden', !check.checked); });
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
    const bindWrap = document.createElement('label');
    bindWrap.innerHTML = '<span>绑定名</span>';
    const bindInput = document.createElement('input');
    bindInput.value = cfg.bindName;
    bindInput.addEventListener('change', () => cfg.bindName = bindInput.value.trim() || service.defaultBind);
    bindWrap.append(bindInput);
    row1.append(bindWrap);
    const modeWrap = document.createElement('label');
    modeWrap.innerHTML = '<span>资源</span>';
    const modeSelect = document.createElement('select');
    appendOption(modeSelect, 'new', '新建随机');
    appendOption(modeSelect, 'existing', '复用现有');
    modeSelect.value = cfg.mode;
    modeSelect.addEventListener('change', () => { cfg.mode = modeSelect.value; existingWrap.classList.toggle('page-hidden', modeSelect.value !== 'existing'); });
    modeWrap.append(modeSelect);
    row1.append(modeWrap);
    form.append(row1);
    const existingWrap = document.createElement('div');
    existingWrap.className = 'service-form-row page-hidden';
    const existLabel = document.createElement('label');
    existLabel.innerHTML = '<span>已有资源</span>';
    const existSelect = document.createElement('select');
    existSelect.addEventListener('change', () => cfg.existingId = existSelect.value);
    existLabel.append(existSelect);
    existingWrap.append(existLabel);
    form.append(existingWrap);
    if (service.extraField) {
      const extraRow = document.createElement('div');
      extraRow.className = 'service-form-row';
      const extraLabel = document.createElement('label');
      extraLabel.innerHTML = `<span>${service.extraLabel}</span>`;
      const extraInput = document.createElement('input');
      extraInput.value = cfg[service.extraField] || '';
      extraInput.addEventListener('change', () => cfg[service.extraField] = extraInput.value);
      extraLabel.append(extraInput);
      extraRow.append(extraLabel);
      form.append(extraRow);
    }
    card.append(form);
    container.append(card);
  }
}

function collectPayload() {
  const credentials = state.credentials;
  const deployType = $('deployType').value;
  const projectName = $('projectName').value.trim();
  const sourceType = $('sourceType').value;
  const payload = {
    credentials,
    accountId: $('accountId').value || state.accounts[0]?.id,
    deployMode: 'create',
    deployType,
    projectName,
    uuid: crypto.randomUUID(),
    hostname: $('hostname').value.trim(),
    zoneId: $('zoneId').value,
    enableWorkersDev: $('enableWorkersDev').checked,
    services: {},
  };
  // 源码
  if (sourceType === 'code') payload.code = window.editor ? window.editor.getValue() : ($('codeEditor').value || '');
  else if (sourceType === 'url') { payload.sourceUrl = $('sourceUrl').value.trim(); payload.sourceRef = $('sourceRef').value.trim(); }
  else if (state.packageFiles?.length) payload.files = state.packageFiles;
  // 服务
  for (const service of SERVICES) {
    const cfg = state.services[service.id];
    if (!cfg?.enabled) continue;
    payload.services[service.id] = { enabled: true, bindName: cfg.bindName, mode: cfg.mode, existingId: cfg.existingId || '', title: cfg.title || randomName(service.id) };
    for (const extra of ['className', 'dimensions', 'connectionString']) if (cfg[extra]) payload.services[service.id][extra] = cfg[extra];
  }
  return payload;
}

async function runDeploy() {
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
    renderResultActions({ url, uuid: result.uuid });
    await loadDashboard();
  } catch (error) {
    setResult(error.message, 'error');
    log(`错误: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

// ============ 6. 项目编辑页 ============
async function openProject(type, name) {
  state.currentProject = { type, name };
  $('projectTitle').textContent = `${type === 'pages' ? '📄' : '⚙️'} ${name}`;
  showPage('project');
  await loadProject();
}

async function loadProject() {
  const { type, name } = state.currentProject;
  const res = await post('/api/project/detail', {
    credentials: state.credentials,
    accountId: $('accountId').value || state.accounts[0]?.id,
    type, name,
  });
  renderDomains(res.domains || []);
  renderDeployHistory(res.deployments || []);
  renderSettings(res.project || {});
}

function renderDomains(domains) {
  const list = $('domainList');
  list.innerHTML = '';
  if (!domains.length) { list.innerHTML = '<p class="empty">暂无绑定域名</p>'; return; }
  for (const d of domains) {
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.innerHTML = `<span class="resource-label">🌐 ${d.hostname}</span><span class="resource-type">${d.status || 'active'}</span>`;
    const del = document.createElement('button');
    del.className = 'secondary small';
    del.textContent = '解绑';
    del.addEventListener('click', async () => {
      try {
        await post('/api/project/domain-remove', { credentials: state.credentials, accountId: $('accountId').value || state.accounts[0]?.id, type: state.currentProject.type, name: state.currentProject.name, hostname: d.hostname, zoneId: $('projectZone').value });
        await loadProject();
      } catch (err) { setDashResult(err.message, 'error'); }
    });
    row.append(del);
    list.append(row);
  }
}

function renderDeployHistory(deployments) {
  const list = $('deployHistory');
  list.innerHTML = '';
  if (!deployments.length) { list.innerHTML = '<p class="empty">暂无部署历史</p>'; return; }
  for (const d of deployments) {
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.innerHTML = `<span class="resource-label">#${d.id}</span><span class="resource-type">${d.created_on || ''}</span>`;
    list.append(row);
  }
}

function renderSettings(project) {
  $('settingsInfo').innerHTML = `<pre>${JSON.stringify(project, null, 2)}</pre>`;
}

// ============ 7. CodeMirror 编辑器 ============
function setupEditor() {
  if (typeof CodeMirror === 'undefined') return;
  window.editor = CodeMirror.fromTextArea($('codeEditor'), {
    mode: 'javascript',
    lineNumbers: true,
    theme: 'default',
  });
}

// ============ 8. 页面切换 & 日志 ============
function showPage(page) {
  for (const id of ['loginPage', 'dashboardPage', 'deployPage', 'projectPage']) {
    $(id).classList.toggle('page-hidden', id !== page + 'Page');
  }
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

function log(text) {
  const target = $('logs');
  target.textContent += `${text}\n`;
  target.scrollTop = target.scrollHeight;
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
  box.append(link);
}

function hideResultActions() {
  $('resultActions').innerHTML = '';
  $('resultActions').classList.add('page-hidden');
}

// ============ zip 解压 ============
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
    const nameStart = offset + 30;
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
    } else { offset = dataEnd; }
  }
  return files;
}

function findNextLocalHeader(buffer, view, from) {
  for (let i = from; i + 4 <= buffer.length; i++) if (view.getUint32(i, true) === 0x04034b50) return i;
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
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

async function onPackageChange(event) {
  const file = event.target.files?.[0];
  if (!file) { state.packageFiles = null; return; }
  if (!/\.zip$/i.test(file.name)) { state.packageFiles = null; $('sourceHint').textContent = '只支持 .zip'; return; }
  try {
    const files = await unzipToFiles(file);
    if (!files.length) throw new Error('压缩包空');
    state.packageFiles = files;
    $('sourceHint').textContent = `已读取 ${file.name}：${files.length} 个文件`;
  } catch (error) {
    state.packageFiles = null;
    $('sourceHint').textContent = `解析失败: ${error.message}`;
  }
}

// ============ 初始化 ============
function init() {
  renderServiceCards();
  setupEditor();
  showPage('login');

  $('loginButton').addEventListener('click', login);
  $('newDeploy').addEventListener('click', () => { $('projectName').value = randomName('edge'); showPage('deploy'); });
  $('backToDash').addEventListener('click', () => showPage('dashboard'));
  $('backToDash2').addEventListener('click', () => showPage('dashboard'));
  $('deploy').addEventListener('click', runDeploy);
  $('newNames').addEventListener('click', () => $('projectName').value = randomName('edge'));
  $('clearLogs').addEventListener('click', () => $('logs').textContent = '');
  $('packageFile').addEventListener('change', onPackageChange);
  $('searchBox').addEventListener('input', loadDashboard);
  $('sourceType').addEventListener('change', () => {
    const type = $('sourceType').value;
    $('zipWrap').classList.toggle('page-hidden', type !== 'zip');
    $('codeWrap').classList.toggle('page-hidden', type !== 'code');
    $('sourceUrl').closest('label').classList.toggle('page-hidden', type !== 'url');
  });

  // 标签分类切换
  document.querySelectorAll('#tagTabs .tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('#tagTabs .tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      loadDashboard();
    });
  });

  // 编辑页标签
  document.querySelectorAll('#projectTabs .tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('#projectTabs .tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      state.currentTab = tag.dataset.tab;
      $('tabDomains').classList.toggle('page-hidden', state.currentTab !== 'domains');
      $('tabSettings').classList.toggle('page-hidden', state.currentTab !== 'settings');
    });
  });

  $('deleteProject').addEventListener('click', async () => {
    if (!confirm('确认删除该项目？')) return;
    try {
      await post('/api/project/delete', { credentials: state.credentials, accountId: $('accountId').value || state.accounts[0]?.id, type: state.currentProject.type, name: state.currentProject.name });
      showPage('dashboard');
      await loadDashboard();
    } catch (err) { setDashResult(err.message, 'error'); }
  });

  // 自动登录
  tryAutoLogin();
}

init();
