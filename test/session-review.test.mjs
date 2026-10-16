import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eventText, conversationTurns, buildReviewDraft, readSessionDraft, checkSessionOwnership } from '../dsh/session-review.js'

// 与 dsh/index.js 的 WORKBENCH_OWNER 保持一致（由 register 的 repository 推导）。
const OWNER = 'xyb-openharness-dsh-plugins/xiaoxinbao-workbench'

// 真实事件形状来自 @deepseek-ai/dsh-session 的 assertMessageEventShape：
// user/message 的正文就是 data.content；assistant/message 的正文在
// data.message.content 里多嵌一层。这两个形状写错会让回顾草稿变成空字符串，
// 所以单独钉住。
const userEvent = (text) => ({ seq: 1, type: 'user/message', data: { id: 'u1', role: 'user', content: [{ type: 'text', text }] } })
const assistantEvent = (text) => ({ seq: 2, type: 'assistant/message', data: { message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text }] } } })

test('eventText 按宿主事件形状取正文', () => {
  assert.equal(eventText(userEvent('我最近很累')), '我最近很累')
  assert.equal(eventText(assistantEvent('听起来这段时间不容易')), '听起来这段时间不容易')
})

test('eventText 忽略推理块与工具结果', () => {
  const withReasoning = { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: '内部推理不该进草稿' }, { type: 'text', text: '留在外面的话' }] } } }
  assert.equal(eventText(withReasoning), '留在外面的话')
  assert.equal(eventText({ type: 'tool/result', data: { message: { content: [{ type: 'text', text: '工具输出' }] } } }), '')
})

test('conversationTurns 只保留用户与助手消息，并丢弃空消息', () => {
  const turns = conversationTurns([userEvent('第一句'), assistantEvent('回应'), { type: 'tool/result', data: {} }, userEvent('   ')])
  assert.deepEqual(turns, [{ role: 'user', text: '第一句' }, { role: 'assistant', text: '回应' }])
})

test('buildReviewDraft 摘要只做搬运，不做心理推断', () => {
  const draft = buildReviewDraft(conversationTurns([userEvent('我最近很累'), assistantEvent('听起来不容易'), userEvent('我不想谈了，先这样吧')]))
  assert.match(draft.summary, /共 3 条消息/)
  assert.match(draft.summary, /我 2 条/)
  assert.equal(draft.userWords, '我不想谈了，先这样吧')
  // 空白字段必须留空，等用户自己写；不能由程序替用户下判断。
  assert.equal(draft.neutralObservation, '')
  assert.equal(draft.nextStep, '')
  assert.equal(draft.closing, '')
  assert.equal(draft.source.messageCount, 3)
})

test('buildReviewDraft 摘录用户最长的一句原话，不做改写', () => {
  const draft = buildReviewDraft(conversationTurns([userEvent('短'), userEvent('这是一句明显更长的原话')]))
  assert.equal(draft.userWords, '这是一句明显更长的原话')
})

test('收尾指令不计入回顾正文', () => {
  const turns = conversationTurns([userEvent('真正想说的话'), userEvent('请根据我们刚才这段对话，生成一份简短、可由我修改的「本次回顾草稿」。')])
  assert.equal(turns.length, 2, 'turn 列表仍是原始对话')
  const draft = buildReviewDraft(turns)
  assert.equal(draft.userWords, '真正想说的话', '摘录时不该把收尾指令当成用户原话')
  assert.match(draft.summary, /共 1 条消息/, '统计口径也不该算上收尾指令')
})

test('没有可用内容时返回 null，而不是空草稿冒充成功', () => {
  assert.equal(buildReviewDraft([]), null)
  assert.equal(buildReviewDraft(conversationTurns([{ type: 'tool/result', data: {} }])), null)
})

test('超长会话只保留最近的若干条并标记截断', () => {
  const many = conversationTurns(Array.from({ length: 60 }, (_, i) => userEvent(`第${i + 1}句`)))
  const draft = buildReviewDraft(many, { maxTurns: 10 })
  assert.equal(draft.source.messageCount, 10)
  assert.equal(draft.source.truncated, true)
  assert.match(draft.summary, /只保留了最近 10 条/)
})

test('readSessionDraft 拒绝空会话标识', async () => {
  const ctx = { get: () => ({ readSurface: async () => ({ events: [] }) }) }
  await assert.rejects(() => readSessionDraft(ctx, '   '), /会话标识无效/)
})

test('readSessionDraft 在缺少 sessionQuery 时给出可读错误', async () => {
  await assert.rejects(() => readSessionDraft({ get: () => undefined }, 's1'), /没有提供会话读取服务/)
})

test('readSessionDraft 把宿主读取失败转成用户能看懂的提示', async () => {
  const ctx = { get: () => ({ readSurface: async () => { throw new Error('no such session') } }) }
  await assert.rejects(() => readSessionDraft(ctx, 's1'), /读取这段会话失败/)
})

test('readSessionDraft 只调用只读的 readSurface', async () => {
  let asked = ''
  const ctx = { get: (name) => { assert.equal(name, 'sessionQuery'); return { readSurface: async (id) => { asked = id; return { events: [userEvent('说了句实话')] } } } } }
  const draft = await readSessionDraft(ctx, 'session-1')
  assert.equal(asked, 'session-1')
  assert.equal(draft.userWords, '说了句实话')
})

test('归属核对：只有本工作台的会话才算是 owned', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'cps-owner-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = join(base, 'cancer-psych-support-workbench')
  await mkdir(join(base, 'desktop-workbenches'), { recursive: true })
  await writeFile(join(base, 'desktop-workbenches', 'state.json'), JSON.stringify({
    state: { sessionBindings: { 's-mine': OWNER, 's-other': 'someone/else' } },
  }))
  assert.equal(await checkSessionOwnership(root, 's-mine', OWNER), 'owned')
  assert.equal(await checkSessionOwnership(root, 's-other', OWNER), 'other')
  assert.equal(await checkSessionOwnership(root, 's-unknown', OWNER), 'unbound')
  assert.equal(await checkSessionOwnership(root, '', OWNER), 'unknown')
})

test('归属核对：读不到宿主状态文件时返回 unknown，而不是假装核对通过', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'cps-owner2-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  // 没有 desktop-workbenches/state.json
  assert.equal(await checkSessionOwnership(join(base, 'cancer-psych-support-workbench'), 's-1', OWNER), 'unknown')
})
