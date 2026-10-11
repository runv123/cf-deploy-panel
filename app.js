// 云端部署器 · 前端逻辑 —— 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
const $ = id => document.getElementById(id);

const state = {
  loggedIn: false,
  accounts: [],
  zones: [],
  workers: [],
  pages: [],
  kvs: [],
  packageFiles: null,
  history: []
};

const HISTORY_KEY = 'cf-deploy-history';

loadHistory();
setRandomNames();
$('uuid').value = crypto.randomUUID();
fillSelect($('accountId'), [], '自动选择第一个账户');
fillSelect($('zoneId'), [], '自动随机子域名');
fillSelect($('quickZone'), [], '无可用域名');
fillProjectSelect();
fillKvSelect();
renderHistory();

$('loginButton').addEventListener('click', login);
$('backToLogin').addEventListener('click', () => {
  state.loggedIn = false;
  showPage('login');
  setLoginStatus('已返回登录页');
});
$('quickDeploy').addEventListener('click', () => runDeploy(collectQuickPayload));
$('deploy').addEventListener('click', () => runDeploy(collectAdvancedPayload));

$('newNames').addEventListener('click', setRandomNames);

$('newUuid').addEventListener('click', () => {
  $('uuid').value = crypto.randomUUID();
});

$('bindDomain').addEventListener('change', updateQuickDomainPreview);
$('quickZone').addEventListener('change', updateQuickDomainPreview);

$('packageFile').addEventListener('change', onPackageChange);

$('clearLogs').addEventListener('click', () => {
  $('logs').textContent = '';
});

$('clearHistory').addEventListener('click', () => {
  if (!confirm('确定清空本机部署历史？此操作不可撤销。')) return;
  state.history = [];
  saveHistory();
  renderHistory();
  log('部署历史已清空');
});

$('accountId').addEventListener('change', async () => {
  if ($('accountId').value) await loadResources();
});

$('zoneId').addEventListener('change', () => {
  if (!$('advancedHostname').value.trim()) return;
  const zone = state.zones.find(item => item.id === $('zoneId').value);
  if (zone && $('advancedHostname').value.trim().split('.').length <= 2) $('advancedHostname').value = zone.name;
});

$('deployMode').addEventListener('change', syncModeState);

$('existingProject').addEventListener('change', () => {
  const selected = parseProjectValue($('existingProject').value);
  if (!selected) return;
  $('deployMode').value = 'update';
  $('deployType').value = selected.type;
  $('projectName').value = selected.name;
  syncModeState();
  setResult(`已选择 ${selected.type === 'pages' ? 'Pages' : 'Worker'} 项目，更新模式只同步代码`, 'success');
});

$('kvId').addEventListener('change', () => {
  const selected = state.kvs.find(item => item.id === $('kvId').value);
  if (selected) $('kvTitle').value = selected.title || '';
});

$('loadAccounts').addEventListener('click', async () => {
  setResult('刷新 Cloudflare 账户和域名中...');
  setBusy(true);
  try {
    await loadCloudflareBase();
    setResult('账户和域名读取完成', 'success');
    if ($('accountId').value) await loadResources();
  } catch (error) {
    setResult(error.message, 'error');
    log(`错误: ${error.message}`);
  } finally {
    setBusy(false);
  }
});

$('loadResources').addEventListener('click', async () => {
  setBusy(true);
  try {
    await loadResources();
  } catch (error) {
    setResult(error.message, 'error');
    log(`错误: ${error.message}`);
  } finally {
    setBusy(false);
  }
});

async function login() {
  setLoginStatus('登录中...');
  setBusy(true);
  try {
    await loadCloudflareBase();
    state.loggedIn = true;
    showPage('deploy');
    setLoginStatus('登录成功', 'success');
    setResult('已登录，可以一键部署', 'success');
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
    post('/api/zones', { credentials })
  ]);
  state.accounts = accountsRes.accounts || [];
  state.zones = zonesRes.zones || [];
  fillSelect($('accountId'), state.accounts, '自动选择第一个账户');
  fillSelect($('zoneId'), state.zones, '自动随机子域名');
  fillSelect($('quickZone'), state.zones, state.zones.length ? '不绑定域名' : '无可用域名');
  updateQuickDomainPreview();
  log(`账户数量: ${state.accounts.length}`);
  log(`可用 Zone: ${state.zones.length}`);
}

async function runDeploy(collector) {
  if (!state.loggedIn) {
    setResult('请先登录', 'error');
    showPage('login');
    return;
  }
  setResult('部署中...');
  hideResultActions();
  setBusy(true);
  try {
    const payload = collector();
    const result = await post('/api/deploy', payload);
    (result.logs || []).forEach(log);
    const info = buildDeployInfo(payload, result);
    setResult(info.text, 'success');
    if (payload.deployMode !== 'update') {
      recordHistory(info);
      renderResultActions(info);
    }
  } catch (error) {
    setResult(error.message, 'error');
    log(`错误: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function buildDeployInfo(payload, result) {
  if (payload.deployMode === 'update') {
    return { text: `${result.projectName} 代码同步完成`, projectName: result.projectName, uuid: null, url: null, mode: 'update' };
  }
  const subdomain = `${result.projectName}.pages.dev`;
  const url = result.domain?.hostname
    ? `https://${result.domain.hostname}/${result.uuid}`
    : `https://${subdomain}/${result.uuid}`;
  return {
    text: `${result.projectName} 部署完成`,
    projectName: result.projectName,
    uuid: result.uuid,
    url,
    rootUrl: `https://${subdomain}`,
    domain: result.domain?.hostname || '',
    mode: 'create'
  };
}

function formatDeployResult(payload, result) {
  return buildDeployInfo(payload, result).text;
}

function renderResultActions(info) {
  const box = $('resultActions');
  box.innerHTML = '';
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
  box.append(actionButton('打开面板', () => window.open(info.url, '_blank', 'noopener')));
  box.classList.remove('page-hidden');
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

async function loadResources() {
  const credentials = getCredentials();
  const accountId = $('accountId').value;
  if (!accountId) throw new Error('请先读取并选择 Account');
  setResult('读取现有项目和 KV 中...');
  const resources = await post('/api/resources', { credentials, accountId });
  state.workers = resources.workers || [];
  state.pages = resources.pages || [];
  state.kvs = resources.kvs || [];
  fillProjectSelect();
  fillKvSelect();
  log(`现有 Worker: ${state.workers.length}`);
  log(`现有 Pages: ${state.pages.length}`);
  log(`现有 KV: ${state.kvs.length}`);
  (resources.warnings || []).forEach(warning => log(`提示: ${warning}`));
  setResult('现有项目读取完成', 'success');
}

function getCredentials() {
  const email = $('email').value.trim();
  const key = $('key').value.trim();
  if (!email || !key) throw new Error('请填写 Cloudflare 邮箱和 Global API Key');
  return { email, key };
}

function collectQuickPayload() {
  const selectedZone = state.zones.find(item => item.id === $('quickZone').value) || state.zones[0];
  const shouldBindDomain = $('bindDomain').checked && !!selectedZone;
  const hostname = shouldBindDomain ? randomSubdomain(selectedZone.name) : '';
  const payload = {
    credentials: getCredentials(),
    accountId: $('accountId').value,
    deployMode: 'create',
    deployType: 'pages',
    sourceMode: 'encoded',
    projectName: resolveProjectName(),
    uuid: crypto.randomUUID(),
    kvTitle: randomName('store'),
    hostname,
    zoneId: shouldBindDomain ? selectedZone.id : '',
    autoDomain: false
  };
  if (state.packageFiles && state.packageFiles.length) {
    payload.files = state.packageFiles;
  }
  return payload;
}

function resolveProjectName() {
  const custom = sanitizeProjectName($('quickProjectName').value);
  if (custom) return custom;
  const file = $('packageFile').files && $('packageFile').files[0];
  if (file) {
    const base = sanitizeProjectName(file.name.replace(/\.zip$/i, ''));
    if (base) return `${base.slice(0, 44)}-${randomName('edge').split('-')[1]}`;
  }
  return randomName('edge');
}

function sanitizeProjectName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
}

function collectAdvancedPayload() {
  const credentials = getCredentials();
  const deployMode = $('deployMode').value;
  const selectedProject = parseProjectValue($('existingProject').value);
  if (deployMode === 'update') {
    const projectName = $('projectName').value.trim() || selectedProject?.name || '';
    if (!projectName) throw new Error('更新现有项目时必须选择或填写项目名称');
    return {
      credentials,
      accountId: $('accountId').value,
      deployMode,
      deployType: $('deployType').value,
      sourceMode: $('sourceMode').value,
      projectName
    };
  }
  const hostname = $('advancedHostname').value.trim();
  const zoneId = $('zoneId').value;
  if (hostname && !zoneId && state.zones.length) {
    const matched = matchZone(hostname);
    if (matched) $('zoneId').value = matched.id;
  }
  if (hostname && !$('zoneId').value && !hostname.includes('.')) throw new Error('自定义域名需要完整域名或先选择 Zone');
  return {
    credentials,
    accountId: $('accountId').value,
    deployMode,
    deployType: $('deployType').value,
    sourceMode: $('sourceMode').value,
    projectName: $('projectName').value.trim() || randomName('edge'),
    uuid: $('uuid').value.trim() || crypto.randomUUID(),
    kvTitle: $('kvTitle').value.trim() || randomName('store'),
    kvId: $('kvId').value,
    hostname,
    zoneId: $('zoneId').value,
    autoDomain: false,
    enableWorkersDev: $('enableWorkersDev').checked
  };
}

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

function fillProjectSelect() {
  const select = $('existingProject');
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = state.workers.length || state.pages.length ? '请选择要更新的项目' : '暂无项目，先读取';
  select.append(empty);
  for (const worker of state.workers) appendOption(select, `worker:${worker.name}`, `Worker: ${worker.title || worker.name}`);
  for (const page of state.pages) {
    const kvText = page.kvId ? ` / 已有 KV: ${shortId(page.kvId)}` : '';
    appendOption(select, `pages:${page.name}`, `Pages: ${page.title || page.name}${kvText}`);
  }
}

function fillKvSelect() {
  const select = $('kvId');
  select.innerHTML = '';
  appendOption(select, '', $('deployMode').value === 'update' ? '更新模式不修改 KV' : '新建随机 KV');
  for (const kv of state.kvs) appendOption(select, kv.id, `${kv.title || kv.id} (${kv.id})`);
}

function appendOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  select.append(option);
}

function parseProjectValue(value) {
  if (!value || !value.includes(':')) return null;
  const index = value.indexOf(':');
  return {
    type: value.slice(0, index),
    name: value.slice(index + 1)
  };
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `请求失败: ${response.status}`);
  return data;
}

function setRandomNames() {
  $('projectName').value = randomName('edge');
  $('kvTitle').value = randomName('store');
  $('kvId').value = '';
  $('existingProject').value = '';
  $('deployMode').value = 'create';
  updateQuickDomainPreview();
  syncModeState();
}

function updateQuickDomainPreview() {
  const selectedZone = state.zones.find(item => item.id === $('quickZone').value) || state.zones[0];
  if (!$('bindDomain').checked) {
    $('quickHostnamePreview').value = '不绑定域名';
    return;
  }
  if (!selectedZone) {
    $('quickHostnamePreview').value = '账号内没有可用域名';
    return;
  }
  $('quickHostnamePreview').value = randomSubdomain(selectedZone.name);
}

function randomSubdomain(zoneName) {
  return `${randomName('edge')}.${zoneName}`;
}

function randomName(prefix) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${suffix}`;
}

function shortId(id) {
  return id && id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id;
}

function matchZone(hostname) {
  return state.zones
    .filter(zone => hostname === zone.name || hostname.endsWith(`.${zone.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

async function onPackageChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    state.packageFiles = null;
    $('packageHint').textContent = '选择一个 .zip 压缩包即可一键部署它；不选则部署远程默认源。压缩包内含 _worker.js 时会作为 Pages 高级模式脚本一起提交。';
    $('packageHint').className = 'form-note span-two';
    return;
  }
  if (!/\.zip$/i.test(file.name)) {
    state.packageFiles = null;
    event.target.value = '';
    $('packageHint').textContent = '只支持 .zip 压缩包，请重新选择。';
    $('packageHint').className = 'form-note span-two error-note';
    return;
  }
  try {
    $('packageHint').textContent = `正在解析 ${file.name} ...`;
    $('packageHint').className = 'form-note span-two';
    const files = await unzipToFiles(file);
    if (!files.length) throw new Error('压缩包内没有可部署的文件');
    state.packageFiles = files;
    const 有Worker = files.some(item => item.path.endsWith('_worker.js'));
    $('packageHint').textContent = `已读取 ${file.name}：共 ${files.length} 个文件${有Worker ? '（含 _worker.js，将作为 Pages 高级模式脚本提交）' : ''}`;
    $('packageHint').className = 'form-note span-two';
    log(`已解析压缩包: ${file.name}，文件数 ${files.length}`);
    for (const item of files.slice(0, 20)) log(`  · ${item.path} (${item.size} 字节)`);
    if (files.length > 20) log(`  · ... 其余 ${files.length - 20} 个文件省略`);
  } catch (error) {
    state.packageFiles = null;
    event.target.value = '';
    $('packageHint').textContent = `解析失败: ${error.message}`;
    $('packageHint').className = 'form-note span-two error-note';
    log(`压缩包解析失败: ${error.message}`);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.history = Array.isArray(parsed) ? parsed.filter(item => item && item.projectName) : [];
  } catch {
    state.history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 50)));
  } catch {
    // 本地存储不可用时静默降级，不影响部署
  }
}

function recordHistory(info) {
  if (!info || info.mode === 'update' || !info.projectName) return;
  state.history.unshift({
    projectName: info.projectName,
    uuid: info.uuid || '',
    url: info.url || '',
    domain: info.domain || '',
    account: $('accountId').selectedOptions?.[0]?.textContent || '',
    time: new Date().toISOString()
  });
  state.history = state.history.slice(0, 50);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  const panel = $('historyPanel');
  const list = $('historyList');
  if (!state.history.length) {
    panel.classList.add('page-hidden');
    list.innerHTML = '';
    return;
  }
  panel.classList.remove('page-hidden');
  list.innerHTML = '';
  for (const item of state.history) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const info = document.createElement('div');
    info.className = 'history-info';
    const title = document.createElement('strong');
    title.textContent = item.projectName;
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${formatTime(item.time)}${item.domain ? ` · 域名 ${item.domain}` : ''}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    if (item.url) {
      const open = document.createElement('a');
      open.href = item.url;
      open.target = '_blank';
      open.rel = 'noopener';
      open.className = 'secondary small history-open';
      open.textContent = '打开';
      actions.append(open);
      actions.append(actionButton('复制', () => copyText(item.url)));
    }
    actions.append(actionButton('删除', () => removeHistory(item)));

    row.append(info, actions);
    list.append(row);
  }
}

function removeHistory(item) {
  state.history = state.history.filter(entry => !(entry.projectName === item.projectName && entry.time === item.time));
  saveHistory();
  renderHistory();
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
      files.push({
        path,
        base64: bytesToBase64(content),
        size: content.length
      });
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

function syncModeState() {
  const updating = $('deployMode').value === 'update';
  $('deploy').textContent = updating ? '更新部署' : '高级部署';
  $('modeHint').textContent = updating
    ? '更新模式只同步代码，不创建 KV，不修改 UUID、KV 绑定、域名或 Pages 项目配置。'
    : '新建模式会按表单配置随机 UUID、KV 和可选域名。';
  for (const id of ['uuid', 'kvTitle', 'kvId', 'advancedHostname', 'zoneId', 'enableWorkersDev']) {
    $(id).disabled = updating;
  }
  if ($('kvId').options[0]) $('kvId').options[0].textContent = updating ? '更新模式不修改 KV' : '新建随机 KV';
}

function showPage(page) {
  $('loginPage').classList.toggle('page-hidden', page !== 'login');
  $('deployPage').classList.toggle('page-hidden', page !== 'deploy');
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
