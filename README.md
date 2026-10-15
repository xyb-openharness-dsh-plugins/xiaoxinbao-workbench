# 留一盏灯 · 癌症心理支持工作台

面向各类肿瘤患者与家属的 DSH Desktop 心理支持与沟通工作台。当前版本 **0.3.11**。

> The first DSH workbench dedicated to supporting the emotional and psychological well-being of people living with cancer and their caregivers.

它不是一个"AI 心理医生"。它做的是把**陪伴入口、对话后整理、已经做过的量表记录、专业资料检索、历史会话**收在一处，让情绪支持和沟通整理少一点门槛；涉及病情、治疗、疼痛和用药的问题，一律交回你真实世界里的临床团队。

- [产品规格](./SPEC.md)
- [UI/交互与安全设计](./docs/DESIGN.md)
- [DSH Desktop 集成问题与修复经验](./docs/DSH-Desktop-集成问题与修复经验.md)
- [检索能力包与记忆设计](./docs/WB-技能与记忆方案.md)
- [开发日志](./docs/开发日志.md)
- [独立 UI 预览](./docs/ui-preview.html)

## 界面

### 陪伴首页 · 六个角色

![陪伴首页](./docs/screenshots/home.jpg)

六个角色是**明确可见的用户提示模板**，不是系统提示词，也不是自定义 Agent 预设：

| 角色 | 面向 | 一句话 |
| --- | --- | --- |
| 新确诊陪伴 | 患者与家属 | 先不急着想明白。我们可以先把最担心的一件事说出来。 |
| 治疗与照护同行 | 治疗中的患者与照护者 | 崩溃、修复、前行，不必按顺序来。 |
| 安宁疗护陪伴 | 患者、家属与照护者 | 想要舒服一点、想说的话，都可以慢慢讲。 |
| 哀伤同行 | 正在经历失去的人 | 你不必照着谁的时间表过日子。 |
| 日常喘息与轻松聊 | 患者与家属 | 今天先不聊治疗。要不要说说猫狗？ |
| 亲戚吐槽与边界练习 | 患者与家属 | 来吐槽让你为难的话。等你愿意，再想怎么回应。 |

### 本次回顾 · 对话结束后由你确认

![本次回顾](./docs/screenshots/review.jpg)

### 量表记录 · 只记录你自报的结果

![量表记录](./docs/screenshots/measures.jpg)

### 资料检索 · 三类检索能力包

![资料检索](./docs/screenshots/search.jpg)

### 历史对话 · 本工作台拥有的原生会话

![历史对话](./docs/screenshots/history.jpg)

### 配置 · 记录目录与检索服务

![工作台设置](./docs/screenshots/config.jpg)

### 在本机 DSH Desktop 的「已安装的工作台」中

![已安装列表](./docs/screenshots/installed.jpg)

## 功能概要

**陪伴** — 选角色、选或写一个此刻最想聊的话题，工作台把它整理成一段中文提示词写进 DSH 原生会话的输入框草稿，由你核对后自己发送。对话本身完全由 DSH 原生会话和你配置的模型承载，工作台不读对话正文。

**本次回顾** — 对话正文没有公开读取接口，所以走"复制粘贴桥接"：工作台把一个回顾请求写进会话草稿，你在 DSH 里生成回答后复制回来，工作台识别成五个字段（本次聊到 / 你想记住的话 / 中性观察 / 下一步选项 / 温和收尾），你检查、编辑、明确认可之后才保存。它是本机沟通便笺，不是心理或临床评价。

**量表记录** — 覆盖痛苦温度计（DT）、GAD-7、PHQ-9、ESAS-r。工作台提示用途和授权边界，**不展示受版权保护的题目、不自动计分、不做解释**，只记录你已经完成并愿意保存的结果。筛查不等于诊断。

**资料检索** — 三项可复用检索能力包（肿瘤指南与共识 / 肿瘤文献与临床研究 / 安宁疗护、癌痛与症状支持）。可以只把检索请求写进 DSH 会话让模型自己查，也可以在明确同意后调用你已配置的 KNOWS 服务。所有结果必须带来源。

**历史对话** — 按宿主公开的会话元数据形成时间轴，点击回到那段原生会话；完整内容始终由 DSH 原生会话显示。

**本地记忆** — 结构化回顾、量表记录、你自填的沟通偏好和明确保存的资料来源元数据，写入你选择的目录下的 `cancer-psych-support-memory.json`（可导出、可带走）。插件服务端配置与密钥单独保存在 DSH 服务数据目录，**不写进浏览器存储或安装包**。

## 边界与安全

- 不提供诊断、治疗、用药建议或心理治疗；不预测预后，不贴标签。
- 出现急剧加重的症状，或即时自伤 / 自杀 / 暴力风险，暂停角色语气，优先建议联系当地急救、就近急诊或可信任的人陪同。工作台不监测、不自动通知、不假称已联系任何人。
- 角色是可见的提示模板，不是系统提示词，也不创建自定义 Agent 预设。模型、工具权限和完整对话都由 DSH 管理。
- 仓库不含真实患者资料、真实会话或密钥；`data/mock/` 下的角色与对话均为虚构设计示例。

## 角色风格是怎么传给模型的

选中角色后，工作台把它拼成一段中文提示词写进**原生会话输入框的草稿**：

```js
input.setDraft(`请以「${active.name}」的方式陪我聊聊。${active.intro}
...
先承接情绪、配合聊天，并问我此刻更想被倾听、整理还是听建议；...`)
```

需要知道三件事：

1. 它是一条**用户消息**，不是系统提示词。所以需要你点发送才会真正进入上下文——这正是"草稿由用户确认"的设计，不是自动注入。
2. 它只在**新建会话**（"开始陪伴" → "进入陪伴"）时写入一次。已经拥有会话时按钮变成"继续这段对话"，不重复写草稿；此时换角色只改变本地界面状态，不会再传一次风格说明。
3. 之后的多轮对话靠 DSH 会话自己的上下文延续，没有独立的角色系统提示，长时间对话后风格可能漂移。

也就是说：**"角色"是一段可见、可编辑、由你发送的提示词模板**，模型的回答由它自己按这段提示理解——工作台不假装拥有一个独立的角色人格，也不替你决定发送什么。

## 开发

需要 Node.js 22+。

```sh
npm run build
npm run check
npm pack --dry-run
```

`npm run build` 把 `assets/` 里的插画转成 data URI，注入 `src/client.js` 的占位符，产出**已构建的单文件客户端** `lib/client.js` 和独立预览 `docs/ui-preview.html`。Desktop 不会替你构建，所以 `lib/client.js` 必须提交。`npm run check` 包含语法检查和单元测试（本地存储、认可保存、密钥隔离、数据路径、KNOWS URL 组装、v1 记忆升级）。

## 安装到 DSH Desktop

包同时是 npm 包、DSH 插件 bundle 和 Desktop 工作台。安装用官方 CLI 的 pnpm 透传入口：

```sh
npm pack
dsh plugin --profile web add ./dsh-cancer-psych-support-workbench-0.3.11.tgz
```

安装后**完整退出并重开 DSH Desktop**（不是关窗口）。重启后在左侧模式切换器里就能看到「留一盏灯 · 心理支持」。

两个已知的 pnpm 陷阱：

- **同版本重装会静默短路。** `pnpm add file:<tgz>` 在版本号没变时会打印 `Already up to date` 却不替换物理文件，于是重启后仍然加载旧产物。改完代码要重新出包时，先 `pnpm remove` 再 `pnpm add`，或直接升版本号。
- **pnpm 会剪掉 generation 投影链接。** Desktop 的 pnpm 包装器在运行前会把 `dsh.desktop.generationProjection.plugins` 里的包临时从 manifest 中摘掉，pnpm 于是把这些链接当成多余项删掉，运行后只 restore manifest、不重建 `node_modules`。若 `dsh --profile web --dump-config` 开始报 `cannot resolve profile bundle "..."`，用官方投影模块重建，不要手改 manifest：

  ```js
  import { exposeMissingGenerationLinks } from '<asar>/node_modules/dsh-desktop-market-installer/generations/projection.mjs'
  await exposeMissingGenerationLinks(process.env.DSH_HOME, 'web')
  ```

## 已知宿主接口陷阱：`service.ownsSession()` 会抛错

宿主的 `desktopWorkbenches` 服务在 `ownsSession(sessionId)` / `isActive()` 内部会读取**该服务自身绑定**的 Cordis fiber 名称（`this.ctx.fiber.entry.options.name`）：

```js
sourcePackage() {
  const source = this.ctx.fiber?.entry?.options?.name
  if (typeof source !== 'string' || !source.trim() || source === 'dsh-desktop-workbenches') {
    throw new Error('Workbench registration requires a client package entry name.')
  }
  return source
}
```

注册时没有问题：工作台是通过 `ctx.desktopWorkbenches` 这个 Cordis 追踪代理访问服务的，读 `.ctx` 会被重绑到**调用方**的 fiber，所以拿到的是我们自己的包名。问题出在渲染：宿主渲染业务面板时传的是**原始 service 实例**（`h(item.Component, { service, entry, ... })`），其 `this.ctx` 固定指向宿主自己的 fiber，于是名称等于宿主包名 `dsh-desktop-workbenches`，命中守卫抛错，整页渲染失败。

这个错误与本插件的包名、`__ModuleLoader__.load({ id })` 或 `package.json` 无关——本包这三项都是正确的。本包在 `src/client.js` 里用局部包装 + 按宿主自己的判据回退来兜住它：

```js
const ownsSession = (id) => {
  if (!id) return false
  try { if (service?.ownsSession?.(id) === true) return true; if (service?.ownsSession) return false } catch {}
  try { return service?.state?.sessionBindings?.[id] === entry?.id } catch { return false }
}
```

注意**不能简单写成 `catch { return false }`**：那会让历史会话永远不被归属，每次都要求你新建工作区。回退判据 `state.sessionBindings[id] === entry.id` 与宿主渲染路径自己用的完全一致。宿主端修复前，任何直接调用 `ownsSession()` / `isActive()` 且不做容错的工作台都会在渲染时整页失败。

## 素材

六角色人物为透明背景的女性陪伴插画，蓝发角色采用年轻丸子头造型；小胰宝 logo 和暖橙陪伴插画保存在 `assets/`。

## 许可

MIT，见 [LICENSE](./LICENSE)。
