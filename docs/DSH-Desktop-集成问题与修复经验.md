# DSH Desktop 集成问题与修复经验

更新时间：2026-10-15

本文记录"留一盏灯 · 心理支持"接入 DSH Desktop 的证据、检查顺序和问题状态。后续遇到"业务面板加载失败"时，先按本记录核对包和运行版本，再取得客户端真实异常；不要凭通用错误文案推断根因。

## 实测环境

| 项目 | 值 |
|---|---|
| DSH Desktop | `0.11.1` |
| Harness 运行时 | `@deepseek-ai/dsh 0.2.0-rc.2`（读 `@deepseek-ai/dsh-app-boot` 的 version） |
| 操作系统 | macOS `15.7.4` |
| 架构 | `arm64` |
| profile | `web`（本机不存在 `desktop` profile） |
| 工作台包版本 | `0.3.11` |

结论只在本表记录的版本上成立。

## 官方接入要求（本机 app.asar 内 `dsh-desktop-workbenches/development-guide.zh.md`）

1. 一个包同时包含 npm 包、Harness 插件 bundle 和 Desktop 工作台客户端。
2. `package.json.name`、`cordis.patch.yml` 中插件 `name`、`window.__ModuleLoader__.load({ id })` 必须一致；patch 的 `id` 是插件条目 ID，职责不同。
3. `main`/`exports["."]` 指向服务端入口；`exports["./client"]` 指向构建好的单文件客户端。
4. `dsh.bundle.patch` 指向真实 patch 文件；`dsh.client.platform` 为 `web`，`inject` 包含 `dsh-desktop-workbenches`。
5. 客户端使用共享 React，通过 `desktopWorkbenches.register({ title, repository, ... }, Component)` 注册。新包不传旧式 `id`。注册清理函数由 `ctx.effect` 管理。
6. `--dump-config` 出现插件层只证明配置正确，不能替代 UI 加载证据。
7. `customFrame` 根节点应受宿主主内容区约束；原生会话节点来自宿主的 `conversation` 属性，不应另造聊天 UI。

## 包契约逐项核对（已通过）

| 检查点 | 证据 | 判断 |
|---|---|---|
| 正式仓库身份 | `package.json.repository` 与 `register()` 都是 `https://github.com/xyb-openharness-dsh-plugins/xiaoxinbao-workbench` | 一致 |
| npm 名称 / 模块加载器 ID / Cordis patch 名称 | 均为 `dsh-cancer-psych-support-workbench` | 一致 |
| Cordis patch 条目 ID | `cancer-psych-support-workbench` | 作为条目 ID 使用，与包名区分 |
| 客户端入口与注入 | `exports["./client"]` → `lib/client.js`；平台 `web`；注入 `dsh-desktop-workbenches` | 一致 |
| 服务端入口 | `dsh/index.js` 导出 Schemastery `Config` 与 `apply`；API 前缀 `/api/cancer-psych-support-workbench/` | 一致 |
| peerDependencies | 4 条合法；`>=0.1.0-rc.0 <0.3.0-0` 对 `0.2.0-rc.2` 判定 true | 无需 compatibility.json 豁免 |
| 包内容 | `tar -tzf` 含 `package/package.json`、`package/dsh/index.js`、`package/lib/client.js`、`package/cordis.patch.yml`；与磁盘产物逐字节一致 | 一致 |

## 根因：`service.ownsSession()` 在渲染期抛错

### 现象

业务面板整页失败，直接显示英文原文：

```
Error: Workbench registration requires a client package entry name.
```

### 定位过程（记录判错的中间结论）

- **先排除了错误方向**：包名、`__ModuleLoader__.load({ id })`、`cordis.patch.yml` 的 `name`、peerDependencies 范围、`.dsh-market/state.json` 的 disabled 列表、generation 投影标记——逐项核对都与本包无关。曾以为服务端入口导出缺失或 generation 缓存（同版本复用旧产物）是根因，两轮修复后报错依旧，说明都不是。
- **报错不写服务端日志**：`~/Library/Logs/DSH Desktop/harness.log` 全量检索 `entry name` 零命中，最新启动段检索 `cancer` 零命中。这是**浏览器渲染进程**的运行时错误。
- **决定性的两行代码**：宿主客户端 bundle 里

  ```js
  sourcePackage() {
    // Cordis fiber.name is a generated short name and can collide between
    // different client plugins. The entry carries the package identity.
    const source = this.ctx.fiber?.entry?.options?.name
    if (typeof source !== 'string' || !source.trim() || source === 'dsh-desktop-workbenches') throw new Error('Workbench registration requires a client package entry name.')
    return source
  }
  ```

### 根因

`sourcePackage()` 读的是 **service 实例自己绑定的** fiber 名称，而不是调用方的。

- **注册时正常**：工作台通过 `ctx.desktopWorkbenches` 访问服务，那是 Cordis 的追踪代理（`Service.tracker` 声明 `{ property: 'ctx' }`，`createTraceable` 在读取该属性时返回**访问者**的 ctx）。所以 `.ctx` 被重绑到我们的 fiber，`sourcePackage()` 返回我们的包名，`register()` 成功——这也解释了为什么 `desktop-storage.json` 的 `known-providers.v1` 里确实留下了本项目的条目。
- **渲染时抛错**：宿主渲染业务面板时传的是**原始 service 实例**：

  ```js
  h('div', { className: 'dshWbCustomFrame', hidden: id !== item.id, ... },
    h(PanelBoundary, null, h(item.Component, { service, entry: item, active: id === item.id, conversation })))
  ```

  这个实例的 `this.ctx` 固定指向宿主自己的 fiber，于是名称等于宿主包名 `dsh-desktop-workbenches`，命中守卫抛错，整页渲染失败。

用户看到的是**本插件自己的 ErrorBoundary** 打印的英文原文（`${error.name}: ${error.message}`），不是宿主的中文文案"业务面板加载失败"——这一点本身就是"错误由我方组件抛出"的证据。

`sourcePackage()` 的调用点共 4 处：`register()`（安全）、`isActive()`、`ownsSession()`、`ensureSession()`。经 grep 确认宿主自身 UI **不调用**后三者，所以只有插件自己的调用点需要容错。

### 修复

`src/client.js` 中把 `ownsSession` 包一层，并按**宿主渲染路径自己使用的判据**回退：

```js
const ownsSession = (id) => {
  if (!id) return false
  try { if (service?.ownsSession?.(id) === true) return true; if (service?.ownsSession) return false } catch {}
  try { return service?.state?.sessionBindings?.[id] === entry?.id } catch { return false }
}
```

关键点：

- **不能简单写成 `catch { return false }`**。那会让历史会话永远不被归属，每次都要求用户新建工作区，是功能退化。
- 回退判据 `state.sessionBindings[id] === entry.id` 与宿主渲染路径自己的 `hasCurrentSession` 判断完全同源。
- 未使用 `ensureSession()`，因此不需要额外容错。

### 验证（真 DOM + 真 React，目标是安装副本）

用宿主 app.asar 内的 `react`/`react-dom` 与 `jsdom` 在 Node 里渲染安装副本，并让 mock 的 `ownsSession()` **故意抛同一个错误**：

```
[1] register descriptor = {"title":"留一盏灯 · 心理支持","repository":"https://github.com/xyb-openharness-dsh-plugins/xiaoxinbao-workbench","panelTitle":"心理支持","customFrame":true}
[2] 宿主守卫抛错 4 次，全部被吸收 = ✔
[3] 主界面无错误态 = ✔
[4] 找到「历史对话」标签 = ✔
[5] 回退归属生效 = ✔ 历史会话被正确归属并显示
[6] React key 警告 = ✔ 无
```

### 真实 GUI 验收

DSH Desktop `0.11.1` 实机：

- 左侧模式切换器菜单列出 6 项，含「留一盏灯 · 心理支持」。
- 点开后 `main.cps-frame` 完整渲染：六个角色卡、五个标签、安全声明全部正确；`document.body.innerText` 不含 `Workbench registration requires`，也不含「业务面板加载失败」。
- 五个标签逐个点击，均无错误态。
- `/api/desktop-workbenches/state` 的 `state.active` = `xyb-openharness-dsh-plugins/xiaoxinbao-workbench`，连续轮询稳定；`added` 与 `pinned` 均含本项目；`history` 中两个历史会话被正确归属。
- 界面边界：`coversSidebar: false`、无横向溢出、13 个可聚焦控件。

## 安装链路的两个 pnpm 陷阱

### 陷阱 1：同版本重装静默短路

`pnpm add file:<tgz>` 在版本号未变时打印 `Already up to date` 且**不替换物理文件**，只改 `package.json`/`pnpm-lock.yaml`/符号链接。结果是"重新安装后重启，还是旧构建"。**改完代码必须升版本号，或先 `pnpm remove` 再 `pnpm add`。**

### 陷阱 2：pnpm 会剪掉 generation 投影链接

`<HARNESS>/.desktop-bin/pnpm-runner.mjs` 的 `suspendGenerationProjectionForPnpm(profileDirectory)` 在 pnpm 运行前，从 `manifest.dependencies` 与 `pnpm.overrides` 中**临时删除** `dsh.desktop.generationProjection.plugins` 里的包名（`dsh plugin` 输出会打印 `excluded N generation projection(s) from pnpm`）。pnpm 因此看不到这些投影，把 `node_modules/` 下它们的链接当作多余项删掉；runner 结束后 `restore()` 只还原 **manifest 字段**，**不重建 node_modules 链接**。于是 `--dump-config` 开始报：

```
dsh: failed to prepare profile bundle "billion-context"
```

**修复方式**是在 app.asar 内用官方投影模块重建，不要手改 manifest：

```js
import { exposeMissingGenerationLinks } from '<asar>/node_modules/dsh-desktop-market-installer/generations/projection.mjs'
await exposeMissingGenerationLinks(dshHome, 'web')   // 只为缺失/错误的 generation 链接重建
```

`exposeMissingGenerationLinks` 只处理 `.generations/live/` 标记内的链接，已存在正确链接或实体目录会跳过，绝不触碰实体目录。重建后 `--dump-config` 恢复 `exit=0`。

### 安装入口

`dsh plugin --profile web add <tgz>` 是本机唯一可用的本地安装方式（GUI"添加插件"的市场路径需要 catalog 条目，不接任意本地 `.tgz`）。`profiles/web/pnpm-lock.yaml` 会把本地 tgz 解析成 `file:` 依赖，安装副本为**实体目录**而非 generation 投影——因此本包不受 generation id 缓存影响，但每次用 pnpm 装包仍需复查 profile 健康。

## 标准流程

1. **先核实现状**：记录 DSH Desktop/Harness 版本、系统/架构、profile 实际安装版本、启用状态与包位置；不以 Downloads 源码版本代替运行版本。
2. **静态核对契约**：检查包名/模块 ID/patch 名称、入口导出、构建产物、`inject`、`repository`、`peerDependencies`、包内容；确认安装副本与磁盘产物逐字节一致（`cmp`）。
3. **按官方文档验证安装能力**：探测当前 Desktop/CLI 接受的本地输入形式，不猜测、不直接编辑 app 文件。
4. **区分三层证据**：配置层（`--dump-config` 出现插件层）、列表层（`/api/desktop-workbenches/state` 的 `added`/`pinned`）、真实界面层（GUI 中实际渲染与操作）。前两层不能替代第三层。
5. **取客户端真实异常**：报错可能在浏览器渲染进程而不写服务端日志。用 `curl http://127.0.0.1:43129/plugins/events`（无需授权）确认宿主服务的 bundle rev，再比对内容；必要时用宿主 app.asar 内的真实 React + jsdom 复现渲染期异常。
6. **一次性修复并复验**：根因明确后集中修改，升版本号，跑 `npm run build` / `npm run check` / `npm pack`，重装、重启、按第 4 步三层取证。
7. **记录经验**：在本文和 `docs/开发日志.md` 增加日期、版本、症状、原因、改动、验证命令与桌面证据，不记录任何患者真实资料、会话内容或密钥。

## 认证本机 Workbench API

`/api/desktop-workbenches/*` 需要按 authority 绑定的签名 cookie，`Bearer` / `X-DSH-Token` 均无效。正确做法：从 `harness.log` 最新一行 `dsh web: http://127.0.0.1:43129/?token=<T>` 取本次启动 token，然后

```sh
curl -s -c /tmp/jar.txt -o /dev/null "http://127.0.0.1:43129/?token=<T>"   # HTTP 303，写入 cookie
curl -s -b /tmp/jar.txt "http://127.0.0.1:43129/api/desktop-workbenches/state"
```

`/plugins/events`（SSE）反而是匿名的，可直接读图与 bundle rev。

## 未验证项

- 本记录全部证据来自 macOS `arm64` / Desktop `0.11.1`；其他平台与版本未验证。
- 宿主端尚未修复 `sourcePackage()` 的 fiber 绑定语义。任何直接调用 `ownsSession()` / `isActive()` 且不做容错的工作台，在本机版本上仍会在渲染时整页失败。
- 若当前模型没有联网工具，"资料检索"只能把请求交给 DSH 会话，需由助手明确说明无法核实来源。
- `scripts/check-workbench-package.mjs` 不存在，官方规范第 8 节提到的该脚本未执行。
