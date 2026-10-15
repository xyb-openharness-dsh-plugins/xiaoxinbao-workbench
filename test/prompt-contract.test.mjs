import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { companionPrinciples, peerSupportGuidance, diseaseAwareness, identityAndLimits, safetyBaseline, roleSeeds, buildRoles, rolePrompt } from '../src/prompt.mjs'

// 这组测试来自一次真实的使用者反馈：在「亲戚吐槽」场景里，模型还没听完就给「怎么挡回去」
// 的话术、追问了「他是什么时候走的」、并且长篇分析这段关系。根因是注入的提示词里
// 沟通方式只有一句「先承接情绪」，角色边界（SPEC §3）完全没进提示词。
// 这些断言锁定修复，防止以后再退回通用助手人格。

const roles = buildRoles()

test('每个角色都带有语气和边界，且边界与 SPEC 第 3 节一致', () => {
  const spec = {
    'new-diagnosis': '不解释个体预后、不把检查解读成诊断、不替用户决定治疗。',
    'treatment-and-caregiver': '不给处置、剂量、调药或治疗方案；急症请用户联系临床团队。',
    'palliative-companion': '不预测死亡时间、不替代安宁疗护团队、不给止疼药剂量或调药指令。',
    'bereavement-support': '不设哀伤阶段或时间表、不诊断；风险升高时转介专业支持。',
    'daily-lightness': '不虚构事实、不给受版权保护的长篇内容；出现即时危机时停止娱乐模式。',
    'relative-rant': '不攻击受保护身份、不泄露隐私、不煽动报复或骚扰。',
  }
  assert.equal(roles.length, 6)
  for (const role of roles) {
    assert.equal(role.boundary, spec[role.id], `${role.id} 的边界应与 SPEC 一致`)
    assert.ok(role.voice && role.voice.length > 10, `${role.id} 缺少语气说明`)
    assert.ok(role.opening && role.line && role.intro, `${role.id} 缺少开场/金句/说明`)
    assert.ok(Array.isArray(role.topics) && role.topics.length >= 3, `${role.id} 话题不足`)
  }
})

test('注入的提示词把陪伴准则排在角色说明之前，并保留安全底线', () => {
  const role = roles.find((item) => item.id === 'relative-rant')
  const prompt = rolePrompt(role, '姑姑催婚，我骂了她', '先听我说完')
  assert.ok(prompt.includes('【怎么说话】'))
  assert.ok(prompt.includes('【对方想找同伴时】'))
  assert.ok(prompt.includes('【这个角色的语气】'))
  assert.ok(prompt.includes('【这个角色的边界】'))
  assert.ok(prompt.includes('【关于病情】'))
  assert.ok(prompt.includes('【身份与禁忌】'))
  assert.ok(prompt.includes(role.boundary))
  assert.ok(prompt.includes('【我这会儿想说的】姑姑催婚，我骂了她'))
  assert.ok(prompt.includes('先听我说完'))
  assert.ok(prompt.includes('优先级高于上面的语气和边界'))
  assert.ok(prompt.includes(safetyBaseline))
  for (const item of companionPrinciples) assert.ok(prompt.includes(item), `准则未进入提示词：${item.slice(0, 16)}`)
  for (const item of peerSupportGuidance) assert.ok(prompt.includes(item), `同伴引导未进入提示词：${item.slice(0, 16)}`)
  for (const item of identityAndLimits) assert.ok(prompt.includes(item), `身份禁忌未进入提示词：${item.slice(0, 16)}`)
  // 沟通方式必须排在业务边界之前，模型才会先照做。
  assert.ok(prompt.indexOf('【怎么说话】') < prompt.indexOf('【这个角色的边界】'))
})

// 参考文档 prompt_template.md 里有些内容不能照抄：它推荐「我完全理解您的…」式开场白，
// 主张给具体病种讲生存率，并带一个写着联系方式的入群模块。这些进了提示词都会反噬。
test('参考素材里的反模式没有被搬进提示词', () => {
  const role = roles.find((item) => item.id === 'relative-rant')
  const prompt = rolePrompt(role, '随便聊聊')
  // 「我懂你」只能出现在禁令里，不能作为推荐写法出现。
  assert.ok(/不要拿它当开场白/.test(prompt), '未封掉空泛共情开场白')
  // 不引用生存率/统计数字，也不许主动谈病种。
  // 注意：「生存率」这个词本身会出现在禁令里（"不拿生存率…回报"），所以不能只查词，
  // 要查真正会诱发算预后的统计表述形式。
  assert.ok(!/\d+\s*%/.test(prompt), '提示词里出现了百分比数字')
  assert.ok(!/\d+\s*(个月|年)(的)?(中位|平均|生存|存活)/.test(prompt), '提示词里出现了生存期数字')
  assert.ok(!/五年存活率|5\s*年存活率|中位生存期/.test(prompt), '提示词里出现了生存率结论')
  assert.ok(/不需要主动谈病种、分期或生存率/.test(diseaseAwareness), '缺少"不主动谈病种"的约束')
  assert.ok(/不引用统计数字，不评估严重程度/.test(diseaseAwareness))
  // 不搬运具体联系方式或入群运营动作。
  assert.ok(!/微信|weixin|公众号|扫码|加群微信号/.test(prompt), '提示词里出现了运营渠道')
  assert.ok(/不宣称有任何社群、平台或联系人/.test(prompt), '同伴引导缺少不越权承诺的约束')
})

test('提示词明确禁止了那次反馈里的三个具体失手', () => {
  const role = roles.find((item) => item.id === 'relative-rant')
  const prompt = rolePrompt(role, '姑姑在我最难的时候催婚')
  assert.ok(/不要立刻给建议、方案、话术或步骤/.test(prompt), '未禁止抢答给方案')
  assert.ok(/不要问「什么时候走的」/.test(prompt), '未禁止追问创伤细节')
  assert.ok(/话要短/.test(prompt), '未限制篇幅')
  assert.ok(/不用咨询腔/.test(prompt), '未禁止咨询腔')
  // 吐槽角色本身容易滑向"其实他们也是关心你"式的说教。
  assert.ok(role.voice.includes('不要说「其实他们也是关心你」'), '吐槽角色缺少不说教约束')
})

test('角色提示词只在开场写入一次，切换角色不会改写已有会话', async () => {
  const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  // 只有两个写入口：beginSession 的开场写入，以及 setNativeDraft 供用户主动重发。
  const writes = client.match(/input\.setDraft\(/g) || []
  assert.equal(writes.length, 2, 'setDraft 应只有开场与手动重发两个写入点')
  assert.ok(client.includes('if (!id || !ownsSession(id)) id = await service.newWorkspaceSession()'), '开场路径缺失')
  assert.ok(client.includes('const sendRolePrompt = async (role) =>'), '缺少「重发角色设定」入口')
  // 切换角色卡本身不能触发写入，否则用户没准备好就被改了会话。
  const roleCard = client.match(/onClick: \(\) => \{ setRoleId\(role\.id\); setNotice\(''\); setError\(''\) \}/)
  assert.ok(roleCard, '角色卡点击应只改本地 state，不写入会话')
  assert.ok(client.includes('selectedRoleChanged'), '缺少切换角色后的提示')
  assert.ok(client.includes('setPromptedRoleId(active.id)'), '未记录已注入的角色')
})

// 真实回归：第一版 sendRolePrompt 先 setPromptedRoleId 再写草稿，写入失败时提示条
// 会消失，界面显示"已重发"而实际什么都没写。这是最不该出现在心理支持工具里的假成功。
test('写入草稿失败时不谎报成功', async () => {
  const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  assert.ok(/if \(await setNativeDraft\(rolePrompt\(role, role\.opening, communicationPreferences\), /.test(client),
    'sendRolePrompt 必须等 setNativeDraft 返回成功后才记录角色')
  assert.ok(client.includes('return true'), 'setNativeDraft 成功时须返回 true')
  assert.ok(/input\.setDraft\(text\) \} catch/.test(client), '写入抛错须被兜住，不能逃逸成未处理异常')
  // 记录角色必须发生在 await 之后，不能是先标记后写入。
  const fn = client.slice(client.indexOf('const sendRolePrompt'))
  assert.ok(fn.indexOf('await setNativeDraft') < fn.indexOf('setPromptedRoleId(role.id)'),
    '必须先确认写入成功，再更新界面状态')
})

test('构建脚本内联同一份提示词源码，并拒绝残留占位符', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8')
  assert.ok(build.includes("src/prompt.mjs"), '构建脚本未内联 prompt.mjs')
  assert.ok(build.includes('__PROMPT_MODULE__'), '客户端缺少提示词占位符')
  const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  assert.ok(client.includes('/*__PROMPT_MODULE__*/'))
  assert.ok(!/const roles = \[\s*\{ id: 'new-diagnosis'/.test(client), '角色定义应来自 prompt.mjs，不再重复内联')
})
