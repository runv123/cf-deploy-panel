# 云端部署器（CF 部署项目）

> 本面板由 **数码解码** 独立开发，用于一键部署旗下星云解码（Nebula-Decode）系列项目到 Cloudflare。

一个部署在 Cloudflare Pages 上的**一键部署面板**。填入 Cloudflare 邮箱 + Global API Key，即可在浏览器里一键完成：Pages/Worker 项目创建、随机 UUID、随机 KV、随机项目名，以及可选的随机子域名绑定。

面板本身也是一套 Pages 项目（静态前端 + Pages 高级模式 Worker），部署一次后长期使用。

---

## 一、这个面板能做什么

| 能力 | 说明 |
| --- | --- |
| **登录** | 只填邮箱 + Global API Key，前端不写 localStorage，Key 不持久化。 |
| **一键部署** | 随机项目名 + 随机 UUID + 随机 KV + Pages 部署，默认使用加密/混淆源。 |
| **上传压缩包部署** | 选择 `.zip` 压缩包，浏览器本地解压后把**全部文件**上传到新建的 Pages 项目；包内含 `_worker.js` 时自动作为 Pages 高级模式脚本提交（适合星云解码这类单文件终端项目）。 |
| **高级部署** | 可选 Pages / Worker；可选加密混淆 / 明文源；可选「随机新建 / 更新现有」；可指定 Account、Zone、自定义域名、复用现有 KV。 |
| **域名绑定** | Pages 自动创建 CNAME 指向 `*.pages.dev`；Worker 优先走 workers/domains，失败自动回落 Route。 |
| **实时日志** | 每一步操作实时输出到页面日志面板。 |

---

## 二、项目结构

| 文件 / 目录 | 说明 |
| --- | --- |
| `index.html` | 面板页面：登录页 → 一键部署 → 高级设置 → 日志。 |
| `styles.css` | 浅色玻璃拟态样式，含移动端响应式。 |
| `app.js` | 前端逻辑：登录校验、账户/Zone 读取、**zip 解压**、部署参数收集、日志展示。 |
| `_worker.js` | Pages 高级模式 Worker：提供 `/api/*` 接口，转发 Cloudflare API 完成部署。 |
| `tests/validate.mjs` | 自动化校验脚本（元素 ID 交叉校验 + Worker API 冒烟测试）。 |

---

## 三、把面板部署到 Cloudflare（操作步骤）

### 方式一：控制台上传（推荐新手）

1. 打开 <https://dash.cloudflare.com>，登录你的 Cloudflare 账号。
2. 左侧进入 **Workers 和 Pages** → 点击 **创建** → 选择 **Pages** → **上传资产**。
3. 项目名称填 `deploy-panel`（或任意名字）。
4. 把本目录的 **5 个文件**（`index.html`、`styles.css`、`app.js`、`_worker.js`、`README.md`）**一起拖拽**到上传区；不要上传 `tests/` 目录。
5. 点击 **部署**，等待完成，会得到一个 `xxx.pages.dev` 地址。
6. **重要**：进入该项目的 **设置 → 运行时（Runtime）**，把 **兼容性日期（Compatibility date）** 设为 `2026-01-20`，保存。

> 说明：`_worker.js` 是 Pages 高级模式入口。只要它和静态文件在同一目录一起上传，Pages 会自动把它当 Worker 运行，`/api/*` 接口由此提供。

### 方式二：wrangler 命令行

```bash
# 首次使用需登录
npx wrangler login

# 在项目目录下执行（把 . 换成你的目录）
npx wrangler pages deploy . --project-name deploy-panel
```

部署后同样建议到控制台把兼容性日期设为 `2026-01-20`。

---

## 四、使用面板（操作步骤）

1. 打开你部署好的面板地址（`https://deploy-panel.xxx.pages.dev`）。
2. **登录页**：填入 Cloudflare 邮箱 + **Global API Key**，点「登录并继续」。
   - Global API Key 在 Cloudflare 控制台 **我的个人资料 → API 令牌 → Global API Key → 查看** 处获取。
3. 进入 **一键部署** 页：
   - **可选域名**：选择要绑定的 Zone（不选则不绑定）。
   - **随机子域名预览**：勾选「绑定随机子域名」后这里会显示将生成的随机子域名。
   - **部署包（可选）**：点击选择你的 `.zip` 压缩包。
     - 选中后会提示解析出的文件数量；含 `_worker.js` 时会提示将作为 Pages 高级模式脚本提交。
     - **不选**压缩包时，则部署远程默认源。
   - 点「**一键部署**」，观察下方日志，成功后结果行会显示访问地址 / UUID。
4. 需要更细的控制时，展开 **高级设置**：
   - 「刷新账户/域名」读取你的 Account 与 Zone 列表；
   - 「读取现有项目」列出已有的 Worker / Pages / KV，供「更新现有」模式选择；
   - 可切换部署方式（Pages / Worker）、部署源（加密混淆 / 明文）、操作模式（随机新建 / 更新现有）；
   - 更新模式只同步代码，**不会**修改 UUID、KV 绑定、域名或项目配置。

---

## 五、配置说明（`_worker.js` 顶部常量）

```js
const 接口地址 = 'https://api.cloudflare.com/client/v4';                          // Cloudflare API
const 兼容日期 = '2026-01-20';                                                    // 部署产物的 compatibility_date
const 绑定名 = 'KV';                                                              // KV 绑定名（与目标源码一致）
const 源码远程基础 = 'https://raw.githubusercontent.com/shuma12303/nebula-decode/main/public'; // 数码解码官方源码仓库
```

- `源码远程基础`：**不选压缩包**时，面板会从这里（数码解码官方仓库）实时拉取 `_worker.js` 作为部署源码。要部署自己的项目时改成你的仓库地址。
- `绑定名`：目标源码约定通过名为 `KV` 的 KV 绑定读取配置；源码头部的 `cf_terminal_cfg`、`cf_terminal_ips` 键会在初始化时写入。
- `兼容日期`：会写进部署产物的运行时配置。

---

## 六、版权与作者

- 本部署面板（`index.html` / `app.js` / `styles.css` / `_worker.js`）由 **数码解码** 独立开发并维护。
- 面板默认部署的目标项目 **星云解码（Nebula-Decode）** 同为 **数码解码** 自主开发，作者主页：<https://github.com/shuma12303/nebula-decode>。
- 请勿移除本源文件中的作者与版权声明。

---

## 七、本地开发

```bash
# 语法检查
node --check app.js
node --check _worker.js

# 自动化校验：HTML/JS 元素 ID 交叉校验 + Worker API 冒烟测试（不访问真实网络）
node tests/validate.mjs

# 本地起静态服务预览前端（/api 会 404，需部署到 Pages 才有后端）
npx serve .
```

---

## 八、注意事项与安全提示

- **兼容性日期**：部署面板和部署产物都依赖 `2026-01-20`，部署后请务必在控制台确认。
- **子请求限制**：Cloudflare 免费版 Worker 单次请求的子请求数上限约 **50**。上传压缩包时，面板按每批 50 个资源上传；文件数非常多的包可能受此限制。
- **Global API Key 权限很大**，仅在自己信任的部署面板上使用；面板的 `/api` 只做转发，不落库、不写本地存储。
- 部署完成后，建议到 Cloudflare 后台确认生成的项目、KV 和域名记录符合预期。
