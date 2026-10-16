// 从 DSH 原生会话读取对话正文，生成可由用户核对修改的回顾草稿。
//
// 依据：宿主 @deepseek-ai/dsh-session-query 在标准 desktop 部署中由 dsh-base
// 常驻挂载（cordis.patch.yml 明确保留 exact reads），服务名为 `sessionQuery`。
// 这里只使用它的一个只读方法 readSurface(sessionId)，且不引入该包作为依赖：
// 服务通过 ctx 注入拿到，事件文本按 dsh-session 的事件形状自行抽取，
// 这样包体积和 peerDependencies 都不需要变化，抽取逻辑也能被单元测试直接覆盖。

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const MAX_TURNS = 40
const MAX_CHARS = 20000

// assistant/message 的正文嵌在 data.message.content 里，user/message 的正文
// 就是 data.content —— 这一层差异来自 dsh-session 的 assertMessageEventShape。
export function eventText(event) {
  if (!event || typeof event !== 'object') return ''
  if (event.type === 'user/message') return contentText(event.data?.content)
  if (event.type === 'assistant/message') return contentText(event.data?.message?.content)
  return ''
}

function contentText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    // 只取 text 块。thinking/reasoning 属于模型内部过程，不进入回顾草稿，
    // 避免把模型的推理片段当成"用户说过的话"记录下来。
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text.trim())
  }
  return parts.filter(Boolean).join('\n').trim()
}

// 把 readSurface 返回的当前表面事件折成按时间顺序的 {role, text} 列表。
// 只保留 user/assistant 两种消息：tool/result 是工具输出，不属于"我们聊了什么"。
export function conversationTurns(events) {
  const turns = []
  for (const event of Array.isArray(events) ? events : []) {
    const role = event?.type === 'user/message' ? 'user' : event?.type === 'assistant/message' ? 'assistant' : ''
    if (!role) continue
    const text = eventText(event)
    if (!text) continue
    turns.push({ role, text })
  }
  return turns
}

// 结束对话的收尾指令不能算进正文：它只是让模型产出回顾格式，不是用户想说的话。
const REVIEW_REQUEST_MARKER = '生成一份简短、可由我修改的「本次回顾草稿」'

export function trimTurns(turns, maxTurns = MAX_TURNS) {
  const usable = (Array.isArray(turns) ? turns : []).filter((turn) => !(turn.role === 'user' && turn.text.includes(REVIEW_REQUEST_MARKER)))
  if (usable.length <= maxTurns) return { turns: usable, truncated: false }
  return { turns: usable.slice(usable.length - maxTurns), truncated: true }
}

function clip(text, max) {
  const value = String(text ?? '').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

// 生成回顾草稿。刻意"只做搬运，不做心理推断"：
// - summary/neutralObservation 由用户和模型后续补写，这里只放可核验的对话回放；
// - userWords 摘取用户自己说过的最长一句，不做改写，也不评价；
// - 草稿里的每一段都标注来源，方便用户判断这一段是不是自己愿意留下的。
// 本函数不写盘：保存仍必须经 POST /reviews 且 approved === true。
export function buildReviewDraft(turns, options = {}) {
  const { turns: kept, truncated } = trimTurns(turns, options.maxTurns || MAX_TURNS)
  const users = kept.filter((turn) => turn.role === 'user')
  const assistants = kept.filter((turn) => turn.role === 'assistant')
  if (!kept.length) return null
  const longest = users.map((turn) => turn.text).sort((a, b) => b.length - a.length)[0] || ''
  const topics = users.map((turn) => clip(turn.text.replace(/\s+/g, ' '), 60)).filter(Boolean).slice(-6)
  return {
    summary: clip([
      `本次会话共 ${kept.length} 条消息（我 ${users.length} 条，助手 ${assistants.length} 条）。`,
      topics.length ? `最后提到的几件事：${topics.join(' / ')}。` : '',
      truncated ? `只保留了最近 ${kept.length} 条，更早的内容请回原生会话查看。` : '',
    ].filter(Boolean).join(''), 1200),
    userWords: clip(longest, 2000),
    neutralObservation: '',
    nextStep: '',
    closing: '',
    source: { messageCount: kept.length, truncated, readFrom: 'DSH 原生会话' },
  }
}

// 服务端读会话。sessionId 来自客户端、是不可信输入，所以：
// 1) 先做形状校验，避免把任意字符串透传给宿主服务；
// 2) 只调用只读的 readSurface，写入能力一概不碰；
// 3) 读不到就明确报错，绝不返回空草稿冒充成功。
export async function readSessionDraft(ctx, sessionId, options = {}) {
  const id = String(sessionId || '').trim()
  if (!id || id.length > 160) throw new Error('会话标识无效')
  const query = ctx?.get ? ctx.get('sessionQuery', false) : ctx?.sessionQuery
  if (!query?.readSurface) throw new Error('当前 DSH 没有提供会话读取服务（sessionQuery），无法直接生成回顾。')
  let surface
  try { surface = await query.readSurface(id) } catch (error) {
    throw new Error(`读取这段会话失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const turns = conversationTurns(surface?.events)
  const draft = buildReviewDraft(turns, options)
  if (!draft) throw new Error('这段会话里还没有可整理的对话内容。')
  const text = turns.reduce((sum, turn) => sum + turn.text.length, 0)
  if (text > MAX_CHARS) {
    // 超长会话只截取尾部，并在草稿里说明，避免把整段聊天写进本地记录文件。
    const { turns: kept } = trimTurns(turns, Math.max(6, Math.floor(options.maxTurns || MAX_TURNS / 2)))
    return buildReviewDraft(kept, { maxTurns: kept.length })
  }
  return draft
}

// 归属校验：sessionId 是客户端可控输入。如果不核对它就交给 sessionQuery，
// 任何一个会话 id 都能被读出来并写进本地记录，等于把"只读本工作台的会话"
// 这个承诺作废。宿主把归属持久化在 <harness>/desktop-workbenches/state.json
// 的 sessionBindings[sessionId] = owner，owner 由 register 时声明的
// repository 推导（github 仓库 identity）。
//
// 读不到该文件时（宿主版本不同、权限不足）不能默认放行，也不能一律拒绝：
// 一律拒绝会让功能在别的 Desktop 版本上直接不可用。这里返回 'unknown'，
// 由调用方决定——当前选择是仍然允许读取，但把校验结果原样返回给界面，
// 让用户看得见这次读取有没有经过归属核对。
export async function checkSessionOwnership(serviceRoot, sessionId, ownerId) {
  const id = String(sessionId || '').trim()
  if (!id) return 'unknown'
  // serviceRoot 形如 <harness>/cancer-psych-support-workbench，
  // 宿主状态在其同级的 desktop-workbenches/state.json。
  const file = join(dirname(resolve(serviceRoot)), 'desktop-workbenches', 'state.json')
  try {
    const raw = await readFile(file, 'utf8')
    const bindings = JSON.parse(raw)?.state?.sessionBindings
    if (!bindings || typeof bindings !== 'object') return 'unknown'
    const bound = bindings[id]
    if (!bound) return 'unbound'
    return bound === ownerId ? 'owned' : 'other'
  } catch {
    return 'unknown'
  }
}
