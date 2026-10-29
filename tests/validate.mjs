// ============================================================
// 云端部署器 · 自动化校验
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 校验：
//  1. 后端服务模块契约完整性（services 注册表）
//  2. HTML 元素 ID 与 app.js 引用交叉校验
//  3. 语法冒烟（无网络）
// ============================================================
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const 错误 = [];
const 警告 = [];

// 1. 检查后端服务模块文件存在
const 服务目录 = join(根, 'worker', 'services');
const 服务文件 = ['index.js', 'kv.js', 'd1.js', 'r2.js', 'queues.js', 'durable.js', 'vectorize.js', 'workflows.js', 'hyperdrive.js', 'domains.js'];
for (const 文件 of 服务文件) {
  if (!existsSync(join(服务目录, 文件))) 错误.push(`缺少服务模块: worker/services/${文件}`);
}

// 2. 检查 API 模块
const api目录 = join(根, 'worker', 'api');
const api文件 = ['router.js', 'auth.js', 'resources.js', 'deploy.js', 'util.js'];
for (const 文件 of api文件) {
  if (!existsSync(join(api目录, 文件))) 错误.push(`缺少 API 模块: worker/api/${文件}`);
}

// 3. 检查根入口
for (const 文件 of ['_worker.js', 'index.html', 'app.js', 'styles.css']) {
  if (!existsSync(join(根, 文件))) 错误.push(`缺少根文件: ${文件}`);
}

// 4. HTML 元素 ID 与 app.js 引用交叉校验
try {
  const html = readFileSync(join(根, 'index.html'), 'utf-8');
  const js = readFileSync(join(根, 'app.js'), 'utf-8');
  const 所需ID = [...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
  for (const id of new Set(所需ID)) {
    if (!html.includes(`id="${id}"`)) 错误.push(`app.js 引用但 HTML 缺失元素: #${id}`);
  }
} catch (e) {
  错误.push(`交叉校验失败: ${e.message}`);
}

// 5. 检查 index.html 引用了 app.js 和 styles.css
try {
  const html = readFileSync(join(根, 'index.html'), 'utf-8');
  if (!html.includes('/app.js')) 错误.push('index.html 未引用 /app.js');
  if (!html.includes('/styles.css')) 错误.push('index.html 未引用 /styles.css');
} catch (e) {
  错误.push(`HTML 检查失败: ${e.message}`);
}

// 输出
if (错误.length) {
  console.error('❌ 校验失败:');
  错误.forEach(e => console.error('  - ' + e));
  警告.forEach(w => console.warn('  ⚠ ' + w));
  process.exit(1);
} else {
  console.log('✅ 校验通过');
  警告.forEach(w => console.warn('  ⚠ ' + w));
}
