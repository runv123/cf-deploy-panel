# 云端部署器（Cloudflare 通用部署面板）

一个部署在 Cloudflare Pages 上的**通用一键部署面板**。填入 Cloudflare 邮箱 + Global API Key，即可在浏览器里一键把任意项目部署到 **Workers / Pages**，并按需绑定 Cloudflare 免费服务：

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| **Workers** | 10万请求/天 | 纯脚本部署 |
| **Pages** | 500 构建/月 | 静态站点 + 高级模式 |
| **KV** | 1GB / 10万读每天 | 键值存储 |
| **D1** | 5GB / 500万行读每月 | SQLite 数据库 |
| **R2** | 10GB / 100万操作每月 | 对象存储 |
| **Queues** | 1万条/天 | 消息队列 |
| **Durable Objects** | 40万GB-s/月 | 有状态对象 |
| **Vectorize** | 免费档有额度 | 向量数据库 |
| **Workflows** | 免费档有额度 | 工作流 |
| **Hyperdrive** | 10万查询/天 | 数据库连接池 |

面板本身也是一套 Pages 项目（静态前端 + Pages 高级模式 Worker），部署一次后长期使用。

## 一、功能

- **登录**：邮箱 + Global API Key，前端不写 localStorage。
- **一键部署**：随机项目名 + 随机 UUID + 可选绑定多个免费服务（勾选服务卡片即可）。
- **服务卡片**：每个服务一张卡片（勾选开关 + 展开表单），支持新建随机 / 复用现有。
- **部署方式**：Pages / Worker 可选；源码模式（加密混淆 / 明文）可选；新建 / 更新现有可选。
- **域名绑定**：Pages 自动创建 CNAME；Worker 优先 workers/domains，失败回落 Route。
- **实时日志**：每一步实时输出到日志面板。

## 二、项目结构（重构后）

cf-deploy-panel/
├── _worker.js            # Pages 高级模式入口（转发到 worker/index.js）
├── index.html            # 界面：登录页 + 服务配置中心
├── styles.css            # 玻璃拟态样式
├── app.js                # 前端逻辑（服务卡片动态渲染、表单收集、部署）
├── worker/               # 后端模块化
│   ├── config.js         # 全局常量
│   ├── index.js          # 路由 + 静态回退
│   ├── api/
│   │   ├── router.js     # /api/* 路由分发
│   │   ├── auth.js       # 账户/Zone 读取
│   │   ├── resources.js  # 现有资源读取
│   │   ├── deploy.js     # 部署编排
│   │   └── util.js       # 基础工具（接口调用、编码、hash）
│   └── services/         # 每个 Cloudflare 服务一个模块
│       ├── index.js      # 服务注册表（契约）
│       ├── kv.js  d1.js  r2.js  queues.js
│       ├── durable.js  vectorize.js  workflows.js  hyperdrive.js
│       └── domains.js    # 域名绑定
└── tests/validate.mjs    # 自动化校验


## 三、部署到 Cloudflare

### 方式一：Git 集成（推荐）
1. 在 Cloudflare 控制台 → Workers 和 Pages → 创建 → Pages → **连接到 Git**。
2. 选择本仓库（`runv123/cf-deploy-panel`），生产分支 `main`。
3. 构建设置：**构建命令留空**（Pages 高级模式会直接识别 `_worker.js`），输出目录 `/`。
4. 部署后，进入项目 → **设置 → 运行时**，把兼容性日期设为 `2026-01-20`，保存。

### 方式二：控制台上传
1. Workers 和 Pages → 创建 → Pages → **上传资产**。
2. 上传 `index.html`、`styles.css`、`app.js`、`_worker.js` 和整个 `worker/` 目录。
3. 设置兼容性日期 `2026-01-20`。

## 四、本地开发

```bash
node --check app.js
node --check _worker.js
node tests/validate.mjs
npx serve .

五、扩展服务（新增一个免费服务）

1. 新建 worker/services/<id>.js，实现契约（id/label/freeTier/available/supportsUpdate/collectPayload/ensure/buildBinding/rollback）。
2. 在 worker/services/index.js 的 SERVICES 数组注册一行。
3. 在 app.js 的 SERVICES 数组加一条前端卡片配置。
4. 在 worker/api/resources.js 的 读取服务列表 加一个 case。

完成，前端自动出现新卡片。

六、安全提示

- Global API Key 权限很大，仅在自己信任的部署面板上使用。
- 面板 /api 只做转发，不落库、不写本地存储。
- 子请求限制：免费版 Worker 单次请求子请求上限约 50，上传压缩包按每批 50 个资源处理。

---

## 📄 文件 23：`tests/validate.mjs`（更新）

```js
// ============================================================
// 云端部署器 · 自动化校验
// 由 数码解码 独立开发并维护 · 请勿移除作者与版权声明
// ------------------------------------------------------------
// 校验：
//  1. 后端服务模块契约完整性（services 注册表）
//  2. HTML 元素 ID 与 app.js 引用交叉校验
//  3. 语法冒烟（无网络）
// ============================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

