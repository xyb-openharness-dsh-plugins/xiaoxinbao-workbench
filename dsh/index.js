import Schema from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { readSettings, writeSettings, readSecrets, writeSecrets, removeSecret } from './settings-store.js'
import { listRecords, addReview, addMeasurement, addKnowledgeSource, saveCommunicationPreferences, deleteRecord, clearRecords } from './record-store.js'
import { resolveKnowsEndpoint } from './knows-url.js'
import { readSessionDraft, checkSessionOwnership } from './session-review.js'

export const name = 'cancer-psych-support-workbench'
// 必须是数组形式。Cordis 的 Inject.resolve()（cordis/lib/index.js:1491-1498）
// 对对象形式的定义是「服务名 → 拦截配置」：对象的每个键都被当成一个要注入的
// 服务名。写成 { required: [...], optional: [...] } 会让它去找名为 `required`
// 和 `optional` 的两个不存在的服务，插件永远停在 pending（日志：
// "pending (waiting for services: required, optional)"），apply() 不执行，
// 所有 /api/... 路由都不注册，界面就报「请求失败（404）」。
//
// sessionQuery 因此不能列在这里 —— 列了就变成硬依赖，缺它的宿主上整个工作台
// 起不来。改为运行时可选读取：见 dsh/session-review.js 的 readSessionDraft()，
// 用 ctx.get('sessionQuery', false) 取（不要求 inject 声明），取不到就给一句
// 用户看得懂的提示，只影响「本次回顾」这一个功能。
export const inject = ['webServer', 'connection']
export const Config = Schema.object({ root: Schema.string().required() })

const PREFIX = '/api/cancer-psych-support-workbench'
const MAX_BODY = 64 * 1024
// 与 package.json 的 repository 对应，宿主用它作为会话归属的 owner id。
const WORKBENCH_OWNER = 'xyb-openharness-dsh-plugins/xiaoxinbao-workbench'

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  let raw = '', total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) throw new Error('请求内容过大')
    raw += chunk
  }
  try { return raw ? JSON.parse(raw) : {} } catch { throw new Error('请求不是有效 JSON') }
}

function normalizeSearchResult(payload) {
  const candidates = Array.isArray(payload) ? payload : payload?.results || payload?.items || payload?.data?.results || payload?.data?.items || payload?.hits || payload?.data?.hits || []
  if (!Array.isArray(candidates)) throw new Error('KNOWS 返回格式不符合通用检索协议')
  return candidates.slice(0, 20).map((item) => ({
    title: String(item?.title || item?.name || item?.document?.title || '未命名资料').slice(0, 400),
    url: safeResultUrl(item?.url || item?.link || item?.source_url || item?.document?.url),
    snippet: String(item?.snippet || item?.content || item?.text || item?.summary || item?.document?.content || '').slice(0, 5000),
    source: String(item?.source || item?.publisher || item?.organization || item?.document?.source || '').slice(0, 300),
    publishedAt: String(item?.publishedAt || item?.published_at || item?.date || item?.document?.date || '').slice(0, 80),
  }))
}

function safeResultUrl(raw) {
  try {
    const url = new URL(String(raw || ''))
    return url.protocol === 'https:' ? url.href : ''
  } catch { return '' }
}

async function callKnows(root, query) {
  const settings = await readSettings(root)
  const secrets = await readSecrets(root)
  if (!settings.knowsEndpoint || !secrets.knowsApiKey) throw new Error('请先在配置中填写 KNOWS API 地址和密钥')
  const q = String(query || '').trim()
  if (!q || q.length > 1000) throw new Error('检索问题不能为空，且不超过 1000 字')
  const endpoint = resolveKnowsEndpoint(settings.knowsEndpoint, settings.knowsSearchPath)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${secrets.knowsApiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: q, q }),
    signal: AbortSignal.timeout(30000),
  })
  const raw = await response.text()
  if (raw.length > 2_000_000) throw new Error('KNOWS 返回内容超过限制')
  let data
  try { data = JSON.parse(raw) } catch { throw new Error('KNOWS 返回了非 JSON 内容') }
  if (!response.ok) throw new Error(`KNOWS 检索失败（HTTP ${response.status}）`)
  return normalizeSearchResult(data)
}

async function handle(req, res, config, ctx) {
  const url = new URL(req.url, 'http://localhost')
  const route = url.pathname.slice(PREFIX.length) || '/'
  if (route === '/settings' && req.method === 'GET') return send(res, 200, { settings: await readSettings(config.root) })
  if (route === '/settings' && req.method === 'POST') return send(res, 200, { settings: await writeSettings(config.root, await readBody(req)) })
  if (route === '/settings/secrets' && req.method === 'POST') return send(res, 200, { settings: await writeSecrets(config.root, await readBody(req)) })
  if (route.startsWith('/settings/secrets/') && req.method === 'DELETE') {
    const which = route.endsWith('/mineru') ? 'mineruApiKey' : route.endsWith('/knows') ? 'knowsApiKey' : ''
    if (!which) return send(res, 404, { error: '未知密钥项' })
    await removeSecret(config.root, which)
    return send(res, 200, { ok: true })
  }
  const settings = await readSettings(config.root)
  const records = () => listRecords(settings.dataRoot)
  if (route === '/records' && req.method === 'GET') {
    if (!settings.dataRoot) return send(res, 200, { schemaVersion: 2, reviews: [], measurements: [], knowledgeSources: [], communicationPreferences: '' })
    return send(res, 200, await records())
  }
  if (route === '/records' && req.method === 'DELETE') return send(res, 200, await clearRecords(settings.dataRoot))
  if (route === '/export' && req.method === 'GET') return send(res, 200, { exportedAt: new Date().toISOString(), workbench: name, ...(settings.dataRoot ? await records() : { reviews: [], measurements: [] }) })
  if (route === '/reviews' && req.method === 'POST') return send(res, 201, { review: await addReview(settings.dataRoot, await readBody(req)) })
  // 直接读会话正文生成回顾草稿。只读，不落盘：用户核对修改后仍需再 POST /reviews
  // 并带 approved: true 才会写入本地记录文件。
  if (route === '/reviews/from-session' && req.method === 'POST') {
    const body = await readBody(req)
    // 归属核对：只允许读本工作台自己的会话。'other' 明确拒绝；
    // 'unknown' 表示读不到宿主状态文件，放行但把结论回传，界面会照实说明。
    const ownership = await checkSessionOwnership(config.root, body.sessionId, WORKBENCH_OWNER)
    if (ownership === 'other') return send(res, 403, { error: '这段会话属于其他工作台，本工作台不会读取。' })
    const draft = await readSessionDraft(ctx, body.sessionId)
    return send(res, 200, { draft, ownership, roleId: String(body.roleId || '').slice(0, 80) })
  }
  if (route === '/measurements' && req.method === 'POST') return send(res, 201, { measurement: await addMeasurement(settings.dataRoot, await readBody(req)) })
  if (route === '/knowledge-sources' && req.method === 'POST') return send(res, 201, { source: await addKnowledgeSource(settings.dataRoot, await readBody(req)) })
  if (route === '/preferences' && req.method === 'PUT') return send(res, 200, { communicationPreferences: await saveCommunicationPreferences(settings.dataRoot, (await readBody(req)).communicationPreferences) })
  const deleteMatch = route.match(/^\/(reviews|measurements|knowledge-sources)\/([\w-]{1,80})$/)
  if (deleteMatch && req.method === 'DELETE') return send(res, 200, { deleted: await deleteRecord(settings.dataRoot, deleteMatch[1] === 'knowledge-sources' ? 'knowledgeSources' : deleteMatch[1], deleteMatch[2]) })
  if (route === '/knowledge/search' && req.method === 'POST') {
    const body = await readBody(req)
    return send(res, 200, { results: await callKnows(config.root, body.query), source: 'KNOWS' })
  }
  return send(res, 404, { error: '未找到此工作台接口' })
}

export function apply(ctx, config) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: PREFIX,
    handler: async (req, res) => {
      const rejection = ctx.connection?.requestRejection?.(req)
      if (!ctx.connection?.requestRejection || rejection !== undefined) return send(res, rejection || 403, { error: '需要通过 DSH 本机授权会话访问' })
      try { await handle(req, res, config, ctx) }
      catch (error) { send(res, 400, { error: error instanceof Error ? error.message : String(error) }) }
    },
  }), 'cancer-psych-support-workbench: api')
}
