import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const indexPath = join(here, '..', 'dsh', 'index.js')

// 这组测试来自一次真实的安装后故障：界面一切正常（侧栏有入口、模式菜单能选中、
// 面板能渲染），但顶部一直挂着「请求失败（404）」，所有记录都读不出来。
//
// 根因在服务端入口的 inject 声明上，我把它写成了
//   export const inject = { required: [...], optional: ['sessionQuery'] }
// 意图是「sessionQuery 可选」。但 Cordis 的 Inject.resolve()
// （@deepseek-ai/cordis/lib/index.js:1491-1498）对对象形式的约定是
// 「服务名 → 拦截配置」：对象的每一个键都被当成一个待注入的服务名。
// 于是它去找叫 `required` 和 `optional` 的两个服务，插件永远停在 pending：
//   cancer-psych-support-workbench (dsh-...): pending (waiting for services: required, optional)
// apply() 不执行，ctx.webServer.register() 不跑，路由一个都没注册，
// 宿主对 /api/cancer-psych-support-workbench/* 只能回通用 404。
//
// 注意这条链路是静默的：没有 error，只有一行 warn，安装也「成功」了。
// 因此这里必须从源码层面把声明形式钉死，不能只指望人记得。
test('inject 必须是数组形式：对象形式会被 Cordis 当成「服务名→拦截配置」', async () => {
  const source = await readFile(indexPath, 'utf8')
  const match = source.match(/^export const inject\s*=\s*(.+)$/m)
  assert.ok(match, '服务端入口必须声明 inject')

  const value = match[1].trim()
  assert.ok(
    value.startsWith('['),
    `inject 必须是数组；当前是 "${value}"。写成 { required: [...], optional: [...] } 会让 Cordis ` +
      '把 "required" 和 "optional" 当成要注入的服务名，插件停在 pending，路由不注册，界面报 404。',
  )
  const names = JSON.parse(value.replace(/'/g, '"'))
  assert.ok(Array.isArray(names), 'inject 数组必须能被 JSON 解析成字符串列表')
  for (const name of names) {
    assert.equal(typeof name, 'string', `inject 项必须是服务名字符串，收到 ${typeof name}`)
  }
  assert.deepEqual(names, ['webServer', 'connection'], 'inject 只声明硬依赖；sessionQuery 在运行时可选读取')
})

// sessionQuery 不能出现在 inject 里：列了就是硬依赖，缺它的宿主上整个工作台起不来。
// 「本次回顾」改为运行时取（见 session-review.js 的 readSessionDraft），
// 取不到时给一句用户看得懂的提示，只影响这一个功能。
test('sessionQuery 走运行时可选读取，不是注入的必需服务', async () => {
  const source = await readFile(indexPath, 'utf8')
  const match = source.match(/^export const inject\s*=\s*(.+)$/m)
  assert.ok(!match[1].includes('sessionQuery'), 'sessionQuery 不能写进 inject，否则缺它的宿主上整个工作台不激活')

  const review = await readFile(join(here, '..', 'dsh', 'session-review.js'), 'utf8')
  assert.match(review, /get\(\s*['"]sessionQuery['"]/, 'sessionQuery 应由 readSessionDraft 用 ctx.get 名弱取')
})

// 路由注册必须在 apply() 里，且前缀和客户端请求的前缀一致 ——
// 上面那次故障表现为「路由压根没注册」，所以顺手把一致性钉住。
test('服务端注册的 API 前缀与客户端 fetch 的前缀一致', async () => {
  const server = await readFile(indexPath, 'utf8')
  const client = await readFile(join(here, '..', 'src', 'client.js'), 'utf8')
  const serverPrefix = server.match(/const PREFIX\s*=\s*'([^']+)'/)?.[1]
  const clientPrefix = client.match(/fetch\(`(\/api\/[^/]+)\$\{path\}`/)?.[1]
  assert.ok(serverPrefix, '服务端必须定义 PREFIX')
  assert.equal(clientPrefix, serverPrefix, '客户端请求的路径前缀必须和服务端注册的前缀相同')
  assert.match(server, /ctx\.webServer\.register\(\{[\s\S]*?kind:\s*'prefix'/, '路由必须经 ctx.webServer.register 以 prefix 方式注册')
})
