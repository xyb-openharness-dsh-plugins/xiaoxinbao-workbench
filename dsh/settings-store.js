import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const SETTINGS_FILE = 'workbench-settings.json'
const SECRETS_FILE = 'workbench-secrets.json'

function jsonFile(root, name) {
  if (!root || !isAbsolute(root)) throw new Error('工作台服务目录未配置')
  return join(resolve(root), name)
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error?.code === 'ENOENT') return fallback; throw new Error('无法读取本地工作台配置') }
}

async function atomicJson(path, value, mode = 0o600) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode })
  await rename(temporary, path)
}

export async function readSettings(root) {
  const data = await readJson(jsonFile(root, SETTINGS_FILE), {})
  const secrets = await readSecrets(root)
  return {
    dataRoot: typeof data.dataRoot === 'string' ? data.dataRoot : '',
    mineruEndpoint: safeEndpoint(data.mineruEndpoint, 'https://mineru.net/api/v4'),
    knowsEndpoint: safeEndpoint(data.knowsEndpoint, ''),
    knowsSearchPath: typeof data.knowsSearchPath === 'string' ? data.knowsSearchPath : '/search',
    mineruConfigured: Boolean(secrets.mineruApiKey),
    knowsConfigured: Boolean(secrets.knowsApiKey),
  }
}

export async function writeSettings(root, input) {
  const current = await readJson(jsonFile(root, SETTINGS_FILE), {})
  const next = { ...current }
  if (Object.hasOwn(input, 'dataRoot')) {
    const selected = String(input.dataRoot || '').trim()
    if (selected) {
      if (!isAbsolute(selected) || selected === resolve('/')) throw new Error('请选择一个具体的本地目录')
      try { if (!(await stat(selected)).isDirectory()) throw new Error('所选位置不是目录') } catch (error) { if (error?.message === '所选位置不是目录') throw error; throw new Error('所选本地目录不可访问') }
      next.dataRoot = resolve(selected)
    }
  }
  if (Object.hasOwn(input, 'mineruEndpoint')) next.mineruEndpoint = safeEndpoint(input.mineruEndpoint, 'https://mineru.net/api/v4')
  if (Object.hasOwn(input, 'knowsEndpoint')) next.knowsEndpoint = safeEndpoint(input.knowsEndpoint, '')
  if (Object.hasOwn(input, 'knowsSearchPath')) {
    const p = String(input.knowsSearchPath || '/search').trim()
    if (!p.startsWith('/') || p.startsWith('//') || p.includes('..')) throw new Error('KNOWS 检索路径必须是站内绝对路径')
    next.knowsSearchPath = p
  }
  await atomicJson(jsonFile(root, SETTINGS_FILE), next)
  return readSettings(root)
}

export async function readSecrets(root) {
  const data = await readJson(jsonFile(root, SECRETS_FILE), {})
  return {
    mineruApiKey: typeof data.mineruApiKey === 'string' ? data.mineruApiKey : '',
    knowsApiKey: typeof data.knowsApiKey === 'string' ? data.knowsApiKey : '',
  }
}

export async function writeSecrets(root, input) {
  const secrets = await readSecrets(root)
  for (const key of ['mineruApiKey', 'knowsApiKey']) {
    if (!Object.hasOwn(input, key)) continue
    const value = String(input[key] || '').trim()
    if (value && value.length > 4096) throw new Error('密钥长度超出限制')
    if (value) secrets[key] = value
    else if (input[key] === null) secrets[key] = ''
  }
  await atomicJson(jsonFile(root, SECRETS_FILE), secrets)
  return { mineruConfigured: Boolean(secrets.mineruApiKey), knowsConfigured: Boolean(secrets.knowsApiKey) }
}

export async function removeSecret(root, name) {
  if (!['mineruApiKey', 'knowsApiKey'].includes(name)) throw new Error('未知密钥项')
  const secrets = await readSecrets(root)
  secrets[name] = ''
  await atomicJson(jsonFile(root, SECRETS_FILE), secrets)
}

export function getDataFile(root, dataRoot) {
  if (!dataRoot || !isAbsolute(dataRoot) || resolve(dataRoot) === resolve('/')) throw new Error('请先选择一个本地记录目录')
  return join(resolve(dataRoot), 'cancer-psych-support-memory.json')
}

function safeEndpoint(value, fallback) {
  const text = String(value || '').trim()
  if (!text) return fallback
  let url
  try { url = new URL(text) } catch { throw new Error('API 地址格式不正确') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('API 地址仅支持 HTTP(S)，且不能包含账号、密码或片段')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('非本机 API 地址必须使用 HTTPS')
  return url.toString().replace(/\/$/, '')
}
