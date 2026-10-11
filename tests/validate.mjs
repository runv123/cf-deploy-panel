import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const html = await read('../index.html');
const app = await read('../app.js');
const workerSrc = await read('../_worker.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${ok ? '' : ` (${extra})`}`);
  if (!ok) failed++;
};

console.log('--- 1. 静态校验 ---');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const usedIds = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missingIds = [...usedIds].filter(id => !htmlIds.has(id));
check(`app.js 引用的 ${usedIds.size} 个元素 ID 均存在于 index.html`, missingIds.length === 0, `缺少: ${missingIds.join(',')}`);
check('index.html 引入 /styles.css 与 /app.js', html.includes('href="/styles.css"') && html.includes('src="/app.js"'));
check('无残留分块标记 PART', !/PART\d/.test(html + app + workerSrc));

console.log('--- 2. Worker 模块加载 (ESM) ---');
const mod = await import('data:text/javascript;base64,' + Buffer.from(workerSrc).toString('base64'));
check('默认导出 fetch 处理器与 onRequestPost', typeof mod.default?.fetch === 'function' && typeof mod.onRequestPost === 'function');

console.log('--- 3. API 冒烟测试 (stub fetch) ---');
const CF = 'https://api.cloudflare.com/client/v4';
const requests = [];
const kvs = [];
const uploadedAssets = [];
const creds = { email: 'a@b.com', key: 'fake-key' };
const j = (result, status = 200) => new Response(
  JSON.stringify(status >= 400 ? { success: false, errors: [{ message: 'not found' }] } : { success: true, result }),
  { status, statusText: status === 404 ? 'Not Found' : 'OK', headers: { 'content-type': 'application/json' } }
);
const bodyOf = opts => { try { return JSON.parse(opts.body); } catch { return {}; } };

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  requests.push(`${method} ${u}`);
  if (u.includes('raw.githubusercontent.com')) return new Response('export default { fetch() {} }', { status: 200 });
  if (!u.startsWith(CF)) throw new Error(`未预期的外部请求: ${u}`);
  const p = u.slice(CF.length);
  if (p.startsWith('/accounts?')) return j([{ id: 'acc1', name: '测试账户' }]);
  if (p.startsWith('/zones?')) return j([{ id: 'zone1', name: 'example.com' }]);
  if (p.startsWith('/zones/') && p.endsWith('/dns_records')) return j({ id: 'dns1' });
  if (p.startsWith('/zones/') && p.endsWith('/workers/routes')) return j({ id: 'route1' });
  if (p.startsWith('/pages/assets/check-missing')) return j(bodyOf(opts).hashes || []);
  if (p.startsWith('/pages/assets/upload')) {
    const payload = Array.isArray(bodyOf(opts)) ? bodyOf(opts) : (() => { try { return JSON.parse(opts.body); } catch { return []; } })();
    if (Array.isArray(payload)) uploadedAssets.push(...payload);
    else if (typeof opts.body === 'string') uploadedAssets.push({ raw: opts.body });
    return j(null);
  }
  if (p.startsWith('/pages/assets/')) return j(null);
  if (p.includes('/upload-token')) return j({ jwt: 'jwt-1' });
  if (p.includes('/deployments')) return j({ url: 'https://demo.pages.dev' });
  if (p.endsWith('/domains') || p.includes('/domains?')) {
    if (method === 'POST') return j({ name: bodyOf(opts).name });
    return j([{ name: 'sub1.example.com', status: 'active' }]);
  }
  if (p.startsWith('/accounts/acc1/workers/domains')) return j([]);
  if (p.includes('/workers/scripts/') && p.endsWith('/settings')) {
    return j({ main_module: 'worker.js', compatibility_date: '2026-01-20', bindings: [{ type: 'kv_namespace', name: 'C', namespace_id: 'kv1' }] });
  }
  if (p.startsWith('/accounts/acc1/workers/scripts')) {
    if (method === 'PUT') return j({ id: 'script' });
    if (p.includes('subdomain')) return j({ enabled: true });
    return j([]);
  }
  if (p.startsWith('/accounts/acc1/storage/kv/namespaces')) {
    if (p.includes('/values/')) return j(null);
    if (method === 'POST') {
      const ns = { id: 'kv1', title: bodyOf(opts).title };
      kvs.push(ns);
      return j(ns);
    }
    return j(kvs);
  }
  if (p.startsWith('/accounts/acc1/pages/projects')) {
    const listPath = p.split('?')[0] === '/accounts/acc1/pages/projects';
    if (listPath && method === 'GET') {
      return j([{ name: 'old-pages', deployment_configs: { production: { kv_namespaces: { C: { namespace_id: 'kv1' } } } } }]);
    }
    if (listPath && method === 'POST') return j({ name: bodyOf(opts).name });
    if (method === 'GET' && p.includes('/pages/projects/old-pages')) {
      return j({ name: 'old-pages', deployment_configs: { production: { kv_namespaces: { C: { namespace_id: 'kv1' } } } } });
    }
    if (p.includes('/upload-token')) return j({ jwt: 'jwt-1' });
    if (p.includes('/deployments')) return j({ url: 'https://demo.pages.dev' });
    if (method === 'GET') return j(null, 404);
    return j({ name: 'ok' });
  }
  throw new Error(`未处理的请求: ${method} ${p}`);
};
const post = (path, payload) => mod.onRequestPost({
  request: new Request(`https://panel.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }),
  env: {},
  waitUntil() {}
});
const parse = async res => ({ status: res.status, data: await res.json() });

let r = await parse(await post('/api/accounts', { credentials: creds }));
check('POST /api/accounts 返回账户列表', r.status === 200 && r.data.ok && r.data.accounts?.[0]?.id === 'acc1');
r = await parse(await post('/api/zones', { credentials: creds }));
check('POST /api/zones 返回域名列表', r.status === 200 && r.data.zones?.[0]?.name === 'example.com');

r = await parse(await post('/api/deploy', {
  credentials: creds,
  accountId: 'acc1',
  deployMode: 'create',
  deployType: 'pages',
  sourceMode: 'encoded',
  projectName: 'edge测试 Demo',
  uuid: '11111111-2222-3333-4444-555555555555',
  kvTitle: 'store-test',
  hostname: 'sub1.example.com',
  zoneId: 'zone1'
}));
check('Pages 新建部署返回 200', r.status === 200 && r.data.ok, JSON.stringify(r.data).slice(0, 200));
check('项目名清理为 edge-demo', r.data.projectName === 'edge-demo', `实际 ${r.data.projectName}`);
check('随机 KV 已创建并绑定', r.data.kv?.id === 'kv1');
check('域名绑定与域名列表', r.data.domain?.hostname === 'sub1.example.com' && r.data.domains?.length === 1);
check('日志包含部署完成与 Pages 地址', (r.data.logs || []).some(l => l.includes('部署完成')) && (r.data.logs || []).some(l => l.includes('Pages 地址')));
check('部署时拉取了远程源码', requests.some(u => u.includes('raw.githubusercontent.com')));
check('创建了 KV 初始值', requests.some(u => u.includes('/values/c')));

r = await parse(await post('/api/resources', { credentials: creds, accountId: 'acc1' }));
check('资源列表含 Pages/KV', r.status === 200 && r.data.pages?.[0]?.name === 'old-pages' && r.data.pages[0].kvId === 'kv1' && r.data.kvs?.length === 1);

console.log('--- 3b. 上传压缩包部署 ---');
uploadedAssets.length = 0;
const fetchCountBefore = requests.filter(u => u.includes('raw.githubusercontent.com')).length;
r = await parse(await post('/api/deploy', {
  credentials: creds,
  accountId: 'acc1',
  deployMode: 'create',
  deployType: 'pages',
  sourceMode: 'encoded',
  projectName: 'pkg-demo',
  uuid: '11111111-2222-3333-4444-555555555555',
  kvTitle: 'store-pkg',
  files: [
    { path: '/index.html', base64: Buffer.from('<h1>hi</h1>').toString('base64') },
    { path: '/assets/app.js', base64: Buffer.from('console.log(1)').toString('base64') },
    { path: '/_worker.js', base64: Buffer.from('export default { fetch() {} }').toString('base64') }
  ]
}));
check('上传包新建 Pages 部署返回 200', r.status === 200 && r.data.ok, JSON.stringify(r.data).slice(0, 200));
check('日志显示上传压缩包文件数', (r.data.logs || []).some(l => l.includes('上传压缩包') && l.includes('3 个文件')));
check('日志显示上传静态资源数', (r.data.logs || []).some(l => l.includes('准备上传 3 个静态资源')));
check('上传了 3 个资源到 CF', uploadedAssets.length === 3, `实际 ${uploadedAssets.length}`);
check('上传包部署时未拉取远程源码', requests.filter(u => u.includes('raw.githubusercontent.com')).length === fetchCountBefore);
check('manifest 包含全部上传路径', (r.data.logs || []).some(l => l.includes('上传压缩包')));

uploadedAssets.length = 0;
r = await parse(await post('/api/deploy', {
  credentials: creds,
  accountId: 'acc1',
  deployMode: 'create',
  deployType: 'pages',
  projectName: 'pkg-no-worker',
  uuid: '11111111-2222-3333-4444-555555555555',
  kvTitle: 'store-pkg2',
  files: [
    { path: '/index.html', base64: Buffer.from('<h1>hi</h1>').toString('base64') }
  ]
}));
check('上传包缺少 _worker.js 时返回错误', r.status === 500 && String(r.data.error).includes('_worker.js'), JSON.stringify(r.data).slice(0, 160));

r = await parse(await post('/api/deploy', {
  credentials: creds,
  accountId: 'acc1',
  deployMode: 'update',
  deployType: 'pages',
  projectName: 'old-pages',
  files: [
    { path: '/_worker.js', base64: Buffer.from('export default { fetch() {} }').toString('base64') },
    { path: '/style.css', base64: Buffer.from('body{}').toString('base64') }
  ]
}));
check('更新模式支持上传包且只同步代码', r.status === 200 && r.data.ok && (r.data.logs || []).some(l => l.includes('代码同步完成')));

r = await parse(await post('/api/deploy', {
  credentials: creds,
  accountId: 'acc1',
  deployMode: 'update',
  deployType: 'worker',
  sourceMode: 'plain',
  projectName: 'old-worker'
}));
check('Worker 更新模式只同步代码', r.status === 200 && r.data.ok && (r.data.logs || []).some(l => l.includes('代码已同步')));

r = await parse(await post('/api/deploy', {}));
check('缺少凭据返回错误', r.status === 500 && r.data.ok === false && String(r.data.error).includes('邮箱'));
r = await parse(await post('/api/nope', {}));
check('未知接口返回 404', r.status === 404);

console.log('--- 4. fetch 处理器路由 ---');
const env = { ASSETS: { fetch: async () => new Response('asset-page') } };
let resp = await mod.default.fetch(new Request('https://panel.test/index.html'), env, {});
check('静态资源交给 ASSETS', (await resp.text()) === 'asset-page');
resp = await mod.default.fetch(new Request('https://panel.test/api/deploy'), env, {});
check('GET /api 返回 405', resp.status === 405);

console.log(failed === 0 ? '\n全部校验通过' : `\n${failed} 项校验失败`);
process.exit(failed ? 1 : 0);
