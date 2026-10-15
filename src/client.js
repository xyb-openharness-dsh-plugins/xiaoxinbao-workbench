(() => {
  const ASSETS = Object.freeze({ /*__ASSET_MAP__*/ })
  const css = '__CPS_CSS__'
  /*__PROMPT_MODULE__*/
  const roles = buildRoles(ASSETS)
  const searchSkills = [
    { id: 'guidelines', name: '指南与共识', short: '按癌种、地区和版本查找诊疗指南', prompt: '检索肿瘤诊疗规范、指南与共识。优先 CACA、CSCO、ASCO、ESMO、NCCN、WHO 等发布方的当前版本；说明地区、发布日期/版本、适用范围与链接。区分指南原文和二手解读；找不到可核验原文时明确说未找到。不要据此替个人决定治疗。' },
    { id: 'evidence', name: '文献与临床研究', short: '查原始研究、综述与临床试验', prompt: '进行循证资料检索。优先原始研究、系统综述、指南和 ClinicalTrials.gov / WHO ICTRP 等登记源；注明研究设计、发表年份、主要限制、研究人群与链接。不要把早期试验或相关性说成已证实疗效，不推断用户个人适用性。' },
    { id: 'palliative', name: '症状与安宁疗护', short: '查疼痛、症状支持和照护框架', prompt: '检索癌痛和姑息/安宁疗护资料。优先 WHO、国家/地区专业学会及医疗机构发布的现行指南；引用来源与年份。整理症状记录和向医生提问的要点，不给个人处方、剂量、停药或调药指令。新发或快速加重症状应提示联系医疗团队/急救。' },
  ]
  const instruments = [
    { id: 'dt', name: '痛苦温度计（DT）', scope: '整体心理困扰筛查', note: '查看 NCCN 当前授权版本；此处不复刻题目或问题清单。' },
    { id: 'gad7', name: 'GAD-7', scope: '焦虑症状筛查', note: '使用经验证的中文版和适用版本；筛查不能诊断。' },
    { id: 'phq9', name: 'PHQ-9', scope: '抑郁症状筛查', note: '部分项目可能与肿瘤症状重叠；请与专业人员结合情境解释。' },
    { id: 'esas', name: 'ESAS-r', scope: '姑息照护常见症状自评', note: '授权与本地适用版本需先核验；症状变化应反馈照护团队。' },
  ]
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const formatDate = (v) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString() : '刚刚' }
  const request = async (path, options = {}) => {
    const response = await fetch(`/api/cancer-psych-support-workbench${path}`, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`)
    return body
  }

  window.__ModuleLoader__.load({
    id: 'dsh-cancer-psych-support-workbench',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement
      const useState = React.useState
      const useEffect = React.useEffect
      const useCallback = React.useCallback
      const useSyncExternalStore = React.useSyncExternalStore

      function App({ service, entry, conversation }) {
        const [tab, setTab] = useState('陪伴')
        const [roleId, setRoleId] = useState('treatment-and-caregiver')
        const [promptedRoleId, setPromptedRoleId] = useState('')
        const [topic, setTopic] = useState('')
        const [modal, setModal] = useState(false)
        const [busy, setBusy] = useState(false)
        const [notice, setNotice] = useState('')
        const [error, setError] = useState('')
        const [settings, setSettings] = useState({ dataRoot: '', mineruEndpoint: 'https://mineru.net/api/v4', knowsEndpoint: '', mineruConfigured: false, knowsConfigured: false })
        const [secretDraft, setSecretDraft] = useState({ mineruApiKey: '', knowsApiKey: '' })
        const [reviews, setReviews] = useState([])
        const [measurements, setMeasurements] = useState([])
        const [knowledgeSources, setKnowledgeSources] = useState([])
        const [communicationPreferences, setCommunicationPreferences] = useState('')
        const [manualSource, setManualSource] = useState({ title: '', url: '', source: '', publishedAt: '', note: '' })
        const [reviewDraft, setReviewDraft] = useState({ summary: '', userWords: '', neutralObservation: '', nextStep: '', closing: '' })
        const [measurementDraft, setMeasurementDraft] = useState({ instrumentId: 'dt', score: '', note: '' })
        const [history, setHistory] = useState([])
        const [searchQuery, setSearchQuery] = useState('')
        const [knowledgeResults, setKnowledgeResults] = useState([])
        const [externalConsent, setExternalConsent] = useState(false)
        const [searchBusy, setSearchBusy] = useState(false)
        const [health, setHealth] = useState('')
        const [showSession, setShowSession] = useState(false)
        const active = roles.find((item) => item.id === roleId) || roles[1]
        // 角色设定只在开场写入一次，之后的对话风格靠那条消息维持；所以切换角色卡时
        // 已经开始的会话不会自动变风格。这里据此提示用户，并提供重新写入的入口。
        const selectedRoleChanged = Boolean(promptedRoleId) && promptedRoleId !== roleId
        const ctx = service?.ctx
        // 宿主的 service.ownsSession()/isActive() 内部会读取 service 自身的 Cordis fiber 名称
        // （this.ctx.fiber.entry.options.name）。register() 时我们通过 ctx.desktopWorkbenches
        // 这个 Cordis 追踪代理访问，.ctx 会被重绑到调用方 fiber，所以注册能成功；
        // 但宿主渲染业务面板时传的是原始 service 实例，其 this.ctx 固定指向宿主自己的 fiber，
        // 名称因此等于宿主包名 dsh-desktop-workbenches，命中宿主守卫并抛出
        // 「Workbench registration requires a client package entry name.」，导致整页渲染失败。
        // 归属判断失败不应让面板崩溃，也不能退化成“永远不归属”：按宿主渲染路径自身使用的
        // 判据回退（state.sessionBindings[id] === entry.id），语义与宿主完全一致。
        const ownsSession = (id) => {
          if (!id) return false
          try { if (service?.ownsSession?.(id) === true) return true; if (service?.ownsSession) return false } catch {}
          try { return service?.state?.sessionBindings?.[id] === entry?.id } catch { return false }
        }
        const snapshot = useSyncExternalStore(
          useCallback((cb) => ctx?.sessions?.list?.subscribe?.(cb) || (() => {}), [ctx]),
          useCallback(() => ctx?.sessions?.list?.getSnapshot?.() || { byId: {} }, [ctx]),
          () => ({ byId: {} }),
        )
        const currentSession = service?.currentSession?.() || ''
        const ownsCurrent = Boolean(currentSession && ownsSession(currentSession))
        useEffect(() => {
          let live = true
          Promise.all([request('/settings'), request('/records')]).then(([s, r]) => {
            if (!live) return
            setSettings(s.settings)
            setReviews(r.reviews || [])
            setMeasurements(r.measurements || [])
            setKnowledgeSources(r.knowledgeSources || [])
            setCommunicationPreferences(r.communicationPreferences || '')
            setHealth('本地服务已连接')
          }).catch((e) => { if (live) setHealth(e.message) })
          return () => { live = false }
        }, [])
        useEffect(() => {
          setHistory(Object.entries(snapshot.byId || {}).filter(([id]) => ownsSession(id)).map(([id, item]) => ({ id, title: item?.title || item?.name || '', updatedAt: item?.updatedAt || item?.lastActiveAt || item?.createdAt || '' })).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)))
        }, [snapshot, service])
        const flash = (message, isError = false) => { setNotice(isError ? '' : message); setError(isError ? message : '') }
        const refreshRecords = async () => {
          const data = await request('/records')
          setReviews(data.reviews || []); setMeasurements(data.measurements || [])
          setKnowledgeSources(data.knowledgeSources || []); setCommunicationPreferences(data.communicationPreferences || '')
        }
        const beginSession = async () => {
          if (busy) return
          setBusy(true); flash('')
          try {
            let id = currentSession
            if (!id || !ownsSession(id)) id = await service.newWorkspaceSession()
            if (!id) { flash('已取消选择工作区，没有创建会话。'); return }
            const scoped = ctx.sessions.scope(id)
            const input = scoped?.get?.('conversation')?.input?.for?.(scoped)
            if (!input?.setDraft) throw new Error('当前宿主没有提供原生会话输入接口。')
            input.setDraft(rolePrompt(active, topic, communicationPreferences))
            setPromptedRoleId(active.id)
            setShowSession(true); flash('已准备原生 DSH 会话草稿，请在会话中核对并发送。')
          } catch (e) { flash(e.message || '暂时无法创建会话。', true) }
          finally { setBusy(false); setModal(false) }
        }
        // 返回是否真的写进了草稿。调用方只有拿到 true 才能更新界面状态，
        // 否则会出现"提示已经重发、实际什么都没写"的假成功。
        const setNativeDraft = async (text, successMessage = '整理请求已放入 DSH 原生会话输入框，请核对后发送。') => {
          const id = service.currentSession()
          if (!id || !ownsSession(id)) { flash('先选择或创建本工作台的原生会话。', true); setTab('陪伴'); return false }
          const scoped = ctx.sessions.scope(id)
          const input = scoped?.get?.('conversation')?.input?.for?.(scoped)
          if (!input?.setDraft) { flash('当前宿主没有提供原生会话输入接口。', true); return false }
          try { input.setDraft(text) } catch (e) { flash(e?.message || '宿主拒绝写入会话草稿。', true); return false }
          setTab('陪伴'); setShowSession(true); flash(successMessage); return true
        }
        const sendRolePrompt = async (role) => {
          if (await setNativeDraft(rolePrompt(role, role.opening, communicationPreferences), '已把角色设定写进 DSH 原生会话输入框，请核对后发送。')) setPromptedRoleId(role.id)
        }
        const startReview = () => setNativeDraft(`请根据我们刚才这段对话，生成一份简短、可由我修改的「本次回顾草稿」。只总结用户明确表达的内容，不推断诊断、预后或心理状态。请按以下标题输出：\n【本次聊到】概括主题\n【用户原话】可摘录一句用户明确说过的话；没有则写“未记录”\n【中性观察】只描述用户明确提到的感受、压力来源、需要；不贴标签、不评价对错\n【下一步选项】最多 3 条、可选择或跳过，不给医疗/用药指令\n【温和收尾】肯定其已经做的具体努力，给出积极但真实的鼓励，不强迫积极\n【量表邀请】只询问是否愿意了解合适的经验证筛查工具，不自行打分或诊断。若无足够信息，请直接说明。请不要声称这是一份临床评估。`)
        const pasteReview = async () => {
          try {
            const text = await navigator.clipboard.readText()
            if (!text.trim()) return flash('剪贴板没有回顾文本。', true)
            const sections = [
              ['summary', '本次聊到'], ['userWords', '用户原话'], ['neutralObservation', '中性观察'], ['nextStep', '下一步选项'], ['closing', '温和收尾'],
            ]
            const parsed = {}
            for (let i = 0; i < sections.length; i++) {
              const [key, label] = sections[i]
              const nextLabels = sections.slice(i + 1).map((x) => x[1]).concat(['量表邀请'])
              const start = text.indexOf(`【${label}】`)
              if (start < 0) continue
              const contentStart = start + label.length + 2
              const endPositions = nextLabels.map((n) => text.indexOf(`【${n}】`, contentStart)).filter((n) => n >= 0)
              const end = endPositions.length ? Math.min(...endPositions) : text.length
              parsed[key] = text.slice(contentStart, end).trim()
            }
            if (!Object.keys(parsed).length) parsed.summary = text.trim()
            setReviewDraft({ ...reviewDraft, ...parsed }); flash('已识别回顾草稿。请逐项检查、修改，再决定是否保存。')
          } catch (e) { flash(e.message || '无法读取剪贴板；也可以手动粘贴。', true) }
        }
        const prepareSearch = (skill) => {
          const q = searchQuery.trim()
          if (!q) { flash('先写下想查的问题。', true); return }
          const prompt = `请用当前 DSH 会话中已启用的搜索工具完成以下任务。${skill.prompt}\n\n检索问题：${q}\n\n安全规则：不要在搜索词中带入姓名、医院号、联系方式或可识别身份的病历细节；不确定时先去标识化。每条实质性医学结论都给出可点击来源及发布日期/版本；如当前没有联网工具或检索失败，明确说明无法检索，不得编造来源或假装已搜索。`
          setNativeDraft(prompt)
        }
        const searchKnows = async () => {
          const q = searchQuery.trim()
          if (!q) return flash('先写下想查的问题。', true)
          if (!externalConsent) return flash('请先确认已去掉可识别信息，并同意将问题发送到配置的 KNOWS 服务。', true)
          if (!window.confirm('这次检索会把问题文字发送给你配置的 KNOWS 服务。请确认内容已去掉姓名、医院号、联系方式等可识别信息。继续吗？')) return
          setSearchBusy(true)
          try {
            const result = await request('/knowledge/search', { method: 'POST', body: JSON.stringify({ query: q }) })
            setKnowledgeResults(result.results || [])
            flash(`KNOWS 返回 ${result.results?.length || 0} 条结果；请检查原始来源、版本与适用地区。`)
          } catch (e) { flash(e.message || 'KNOWS 检索失败。', true) }
          finally { setSearchBusy(false) }
        }
        const savePreferences = async () => {
          if (!settings.dataRoot) return flash('先选择本地记录目录，再保存沟通偏好。', true)
          try {
            await request('/preferences', { method: 'PUT', body: JSON.stringify({ communicationPreferences }) })
            await refreshRecords(); flash('沟通偏好已保存在本机；后续新会话会附带这段用户自述。')
          } catch (e) { flash(e.message || '沟通偏好保存失败。', true) }
        }
        const saveKnowledgeSource = async (source) => {
          if (!settings.dataRoot) { flash('先选择本地记录目录，再保存资料来源。', true); return false }
          try {
            await request('/knowledge-sources', { method: 'POST', body: JSON.stringify(source) })
            await refreshRecords(); flash('资料来源元数据已保存；没有复制原文。')
            return true
          } catch (e) { flash(e.message || '资料来源保存失败。', true); return false }
        }
        const chooseDataRoot = async () => {
          try {
            const path = await ctx?.uiWorkspace?.pickDirectory?.()
            if (!path) return flash('已取消选择，存储位置没有变化。')
            const result = await request('/settings', { method: 'POST', body: JSON.stringify({ dataRoot: path }) })
            setSettings(result.settings); await refreshRecords(); flash('本地记录目录已更新。')
          } catch (e) { flash(e.message || '无法设置本地目录。', true) }
        }
        const saveSettings = async () => {
          try {
            const result = await request('/settings', { method: 'POST', body: JSON.stringify({ mineruEndpoint: settings.mineruEndpoint, knowsEndpoint: settings.knowsEndpoint }) })
            if (secretDraft.mineruApiKey || secretDraft.knowsApiKey) await request('/settings/secrets', { method: 'POST', body: JSON.stringify(secretDraft) })
            setSecretDraft({ mineruApiKey: '', knowsApiKey: '' })
            const latest = await request('/settings')
            setSettings(latest.settings); flash('配置已保存在本机 DSH 工作台目录；密钥不会回显。')
          } catch (e) { flash(e.message || '配置保存失败。', true) }
        }
        const clearSecret = async (which) => {
          try {
            await request(`/settings/secrets/${which}`, { method: 'DELETE' })
            const latest = await request('/settings'); setSettings(latest.settings)
            flash('密钥已从本机 DSH 配置中移除。')
          } catch (e) { flash(e.message || '无法移除密钥。', true) }
        }
        const generateExport = async () => {
          try {
            const response = await request('/export')
            const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cancer-support-memory-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
            flash('已导出本工作台的已保存摘要和量表记录。')
          } catch (e) { flash(e.message || '导出失败。', true) }
        }
        const saveReview = async () => {
          if (!settings.dataRoot) return flash('先在右上角配置中选择本地记录目录，才能保存回顾。', true)
          if (!reviewDraft.summary.trim() && !reviewDraft.userWords.trim() && !reviewDraft.neutralObservation.trim()) return flash('先填写或粘贴回顾内容，再确认保存。', true)
          try {
            await request('/reviews', { method: 'POST', body: JSON.stringify({ roleId: active.id, sessionId: ownsCurrent ? currentSession : '', ...reviewDraft, approved: true }) })
            setReviewDraft({ summary: '', userWords: '', neutralObservation: '', nextStep: '', closing: '' }); await refreshRecords(); flash('这份回顾已按你的确认保存在本机。')
          } catch (e) { flash(e.message || '保存失败。', true) }
        }
        const saveMeasurement = async () => {
          if (!settings.dataRoot) return flash('先在右上角配置中选择本地记录目录，才能保存量表结果。', true)
          const scale = instruments.find((x) => x.id === measurementDraft.instrumentId)
          if (!measurementDraft.score.trim()) return flash('请填写你已完成的量表结果；不需要时可跳过。', true)
          try {
            await request('/measurements', { method: 'POST', body: JSON.stringify({ instrumentId: scale.id, instrumentName: scale.name, score: measurementDraft.score.trim(), note: measurementDraft.note.trim(), version: '用户自述/待核验版本', sessionId: ownsCurrent ? currentSession : '' }) })
            setMeasurementDraft({ ...measurementDraft, score: '', note: '' }); await refreshRecords(); flash('已保存量表记录。它是筛查信息，不构成诊断。')
          } catch (e) { flash(e.message || '量表记录保存失败。', true) }
        }
        const deleteRecord = async (type, id) => {
          try { await request(`/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshRecords(); flash('已删除这条本地记录。') }
          catch (e) { flash(e.message || '删除失败。', true) }
        }
        const openHistory = (id) => { try { service.openSession(id); setTab('陪伴'); setShowSession(true); flash('已恢复 DSH 原生会话。') } catch (e) { flash(e.message || '无法打开此会话。', true) } }
        const card = (className, children) => h('section', { className }, ...children)
        const button = (label, onClick, cls = '', disabled = false, key) => h('button', { type: 'button', className: cls, onClick, disabled, ...(key === undefined ? {} : { key }) }, label)
        const renderReview = () => h('div', { className: 'cps-page' }, [
          h('div', { className: 'cps-page-heading', key: 'heading' }, [
            h('div', { key: 'copy' }, h('p', { className: 'cps-kicker' }, '对话结束后 · 由你确认'), h('h1', null, '本次回顾'), h('p', null, '在 DSH 会话生成草稿后，复制助手回复并粘贴到这里；检查、编辑，再决定要不要保存。')),
            h('div', { className: 'cps-heading-actions', key: 'actions' }, button('生成回顾请求', startReview, 'cps-secondary'), button('粘贴 DSH 回顾并识别', pasteReview, 'cps-primary')),
          ]),
          card('cps-review-card', [
            h('label', { key: 'summary' }, '本次聊到', h('textarea', { value: reviewDraft.summary, onChange: (e) => setReviewDraft({ ...reviewDraft, summary: e.target.value }), placeholder: '概括这次谈到的主题；只保留你愿意记录的内容。' })),
            h('label', { key: 'userWords' }, '你想记住的话', h('textarea', { value: reviewDraft.userWords, onChange: (e) => setReviewDraft({ ...reviewDraft, userWords: e.target.value }), placeholder: '可选：用自己的话记录此刻的感受或需要。' })),
            h('label', { key: 'neutral' }, '中性观察', h('textarea', { value: reviewDraft.neutralObservation, onChange: (e) => setReviewDraft({ ...reviewDraft, neutralObservation: e.target.value }), placeholder: '描述已表达的感受、压力来源或需要，不贴标签、不做诊断。' })),
            h('label', { key: 'next' }, '下一步选项', h('textarea', { value: reviewDraft.nextStep, onChange: (e) => setReviewDraft({ ...reviewDraft, nextStep: e.target.value }), placeholder: '最多几条可选择的小事；不需要时留空。' })),
            h('label', { key: 'closing' }, '温和收尾', h('textarea', { value: reviewDraft.closing, onChange: (e) => setReviewDraft({ ...reviewDraft, closing: e.target.value }), placeholder: '具体、不过度积极，也可以留白。' })),
            h('div', { className: 'cps-review-actions', key: 'save' }, button('清空草稿', () => setReviewDraft({ summary: '', userWords: '', neutralObservation: '', nextStep: '', closing: '' }), 'cps-secondary'), button('认可并保存到本机', saveReview, 'cps-primary')),
          ]),
          h('p', { className: 'cps-small-note', key: 'note' }, '回顾是你的私人沟通便笺，不是临床评估。完整聊天仍只保存在 DSH 原生会话中；工作台不会读取或复制聊天正文。'),
          h('div', { className: 'cps-record-list', key: 'records' }, [
            h('h2', null, '已保存回顾'),
            reviews.length ? reviews.map((r) => h('article', { key: r.id, className: 'cps-record' }, h('div', null, h('strong', null, roles.find((x) => x.id === r.roleId)?.name || '陪伴回顾'), h('small', null, formatDate(r.createdAt))), h('p', null, r.summary || r.userWords || r.neutralObservation), button('删除', () => deleteRecord('reviews', r.id), 'cps-delete'))) : h('p', { className: 'cps-empty' }, '你确认保存的回顾会出现在这里。'),
          ]),
        ])
        const status = error || notice
        return h('main', { className: 'cps-frame' },
          h('header', { className: 'cps-topbar' }, h('div', { className: 'cps-brand' }, h('img', { src: ASSETS.logo, alt: '小胰宝' }), h('b', null, 'DSH'), h('i'), h('strong', null, '留一盏灯'), h('span', null, '心理支持与沟通工作台'), h('small', null, 'v0.3.13')), h('div', { className: 'cps-top-actions' }, h('span', { className: 'cps-service-state' }, health), button('⚙ 配置', () => setTab('配置'), `cps-settings-button${tab === '配置' ? ' active' : ''}`))),
          h('nav', { className: 'cps-tabs', 'aria-label': '工作台页面' }, ['陪伴', '本次回顾', '量表记录', '资料检索', '历史对话'].map((name) => button(name, () => setTab(name), `cps-tab${tab === name ? ' active' : ''}`, false, name))),
          status ? h('div', { className: `cps-alert${error ? ' is-error' : ''}`, role: 'status' }, status) : null,
          tab === '陪伴' ? h('div', { className: `cps-main${showSession ? ' with-chat' : ''}` },
            h('section', { className: 'cps-home' },
              h('div', { className: 'cps-heading' }, h('p', { className: 'cps-kicker' }, '这段路，可以有人陪你走'), h('h1', null, '此刻，你想和谁聊一会儿？'), h('p', null, '不用提前把话整理好。先有人听你说，也可以只聊生活，不聊病情。')),
              h('div', { className: 'cps-role-grid' }, roles.map((role) => h('button', { key: role.id, className: `cps-role${role.id === roleId ? ' selected' : ''}`, onClick: () => { setRoleId(role.id); setNotice(''); setError('') }, 'aria-pressed': role.id === roleId }, h('img', { src: role.portrait, alt: '' }), h('strong', null, role.name), h('span', { className: 'cps-rule' }), h('span', { className: 'cps-role-line' }, `“${role.line}”`), h('small', null, role.group)))),
              h('div', { className: 'cps-selected' }, h('div', null, h('strong', null, active.intro), h('p', null, '对话由 DSH 原生会话和你配置的模型承载。'), button(ownsCurrent ? '继续这段对话' : '开始陪伴', () => { if (ownsCurrent) { setShowSession(true); setNotice('') } else { setTopic(active.opening); setModal(true) } }, 'cps-primary', busy))),
              h('div', { className: 'cps-crisis-note' }, '如果你或身边的人现在有伤害自己的危险，或出现急剧加重的身体症状，请立即联系当地急救服务、就近急诊或可信任的人陪同。')),
            showSession ? h('section', { className: 'cps-chat-area' }, h('div', { className: 'cps-chat-toolbar' }, h('strong', null, `${active.name} · DSH 原生会话`), button('生成本次回顾', startReview, 'cps-secondary'), button('重发角色设定', () => sendRolePrompt(active), 'cps-secondary', busy), button('返回角色', () => setShowSession(false), 'cps-link')), h('div', { className: 'cps-conversation' }, ownsCurrent ? conversation : h('div', { className: 'cps-no-chat' }, '创建或恢复工作台会话后，这里会显示 DSH 原生对话。'))) : null) : null,
          tab === '陪伴' && selectedRoleChanged ? h('div', { className: 'cps-alert', role: 'status' }, `已切换到「${active.name}」，但当前会话仍按上一个角色的设定在聊。`,
            button('把新角色设定发进这段对话', () => sendRolePrompt(active), 'cps-secondary', busy)) : null,
          tab === '本次回顾' ? renderReview() : null,
          tab === '量表记录' ? h('div', { className: 'cps-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, h('p', { className: 'cps-kicker' }, '自愿 · 筛查不等于诊断'), h('h1', null, '量表与自评'), h('p', null, '可以先聊，再由你决定要不要了解或完成一项量表。请使用有授权且经验证的中文版；工作台不展示受版权保护的题目。'))),
            h('div', { className: 'cps-instrument-grid' }, instruments.map((scale) => h('article', { key: scale.id, className: 'cps-instrument' }, h('strong', null, scale.name), h('span', null, scale.scope), h('p', null, scale.note), button('请助手介绍这项量表', () => setNativeDraft(`请先询问我是否愿意了解「${scale.name}」。简要说明它的筛查用途、使用边界、经验证中文版与授权版本的查找途径；不要在未核实授权前复刻题目，不要做诊断。请先问我是否愿意继续。`), 'cps-secondary')))),
            h('section', { className: 'cps-measure-form' }, h('h2', null, '记录我已完成的结果'), h('p', null, '只记录你主动填写的结果；不同量表分数不可直接比较。若结果让你担心，可带给肿瘤团队或心理专业人员一起讨论。'), h('div', { className: 'cps-form-row' }, h('label', null, '量表', h('select', { value: measurementDraft.instrumentId, onChange: (e) => setMeasurementDraft({ ...measurementDraft, instrumentId: e.target.value }) }, instruments.map((x) => h('option', { key: x.id, value: x.id }, x.name))),), h('label', null, '结果/分数', h('input', { value: measurementDraft.score, maxLength: 80, onChange: (e) => setMeasurementDraft({ ...measurementDraft, score: e.target.value }), placeholder: '按你使用的版本记录' })), h('label', null, '备注（可选）', h('input', { value: measurementDraft.note, maxLength: 400, onChange: (e) => setMeasurementDraft({ ...measurementDraft, note: e.target.value }), placeholder: '版本、完成时间或想讨论的问题' })), button('保存记录', saveMeasurement, 'cps-primary'))),
            h('div', { className: 'cps-record-list' }, h('h2', null, '自评时间轴'), measurements.length ? measurements.map((r) => h('article', { key: r.id, className: 'cps-record' }, h('div', null, h('strong', null, r.instrumentName), h('small', null, formatDate(r.createdAt))), h('p', null, `结果：${r.score}${r.note ? ` · ${r.note}` : ''}`), button('删除', () => deleteRecord('measurements', r.id), 'cps-delete'))) : h('p', { className: 'cps-empty' }, '尚无记录；不做提醒或打卡。'))
          ) : null,
          tab === '资料检索' ? h('div', { className: 'cps-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, h('p', { className: 'cps-kicker' }, '三类检索 · 必须提供来源'), h('h1', null, '规范、共识与证据'), h('p', null, '问题先去掉身份信息，再交由 DSH 原生会话检索。若当前模型没有联网工具，助手必须明确说无法核实。'))),
            h('label', { className: 'cps-search-field' }, '想查什么？', h('textarea', { value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: '例如：某癌种治疗期间的情绪支持建议，或安宁疗护疼痛评估框架' })),
            h('div', { className: 'cps-search-grid' }, searchSkills.map((skill) => h('article', { className: 'cps-search-card', key: skill.id }, h('div', { className: 'cps-search-icon' }, skill.id === 'guidelines' ? '§' : skill.id === 'evidence' ? '⌕' : '♡'), h('h2', null, skill.name), h('p', null, skill.short), button('在 DSH 中开始检索', () => prepareSearch(skill), 'cps-secondary')))),
            h('section', { className: 'cps-knows-search' }, h('h2', null, '检索已配置的 KNOWS 知识源'), h('p', null, settings.knowsConfigured && settings.knowsEndpoint ? `已配置：${settings.knowsEndpoint}` : '请先在右上角配置 KNOWS 地址与密钥。'), h('label', { className: 'cps-consent' }, h('input', { type: 'checkbox', checked: externalConsent, onChange: (e) => setExternalConsent(e.target.checked) }), '我会先去掉可识别患者信息，并同意将这个问题发送到 KNOWS。'), button(searchBusy ? '检索中…' : '搜索 KNOWS', searchKnows, 'cps-primary', searchBusy), knowledgeResults.length ? h('div', { className: 'cps-knows-results' }, knowledgeResults.map((r, i) => h('article', { key: `${r.url}-${i}`, className: 'cps-knows-result' }, h('a', { href: r.url || undefined, target: '_blank', rel: 'noopener noreferrer' }, r.title), h('p', null, r.snippet), h('small', null, [r.source, r.publishedAt].filter(Boolean).join(' · ') || '来源/日期未返回；请核验原文'), button(knowledgeSources.some((saved) => saved.url === r.url) ? '已保存来源' : '保存来源', () => saveKnowledgeSource({ title: r.title, url: r.url, source: r.source, publishedAt: r.publishedAt }), 'cps-secondary', !r.url || knowledgeSources.some((saved) => saved.url === r.url))))) : null),
            h('section', { className: 'cps-source-form' }, h('h2', null, '手动保存资料来源'), h('p', null, '只保存标题、链接、来源和你写的简短备注，不保存指南或论文全文。'), h('div', { className: 'cps-form-row' }, h('input', { value: manualSource.title, onChange: (e) => setManualSource({ ...manualSource, title: e.target.value }), placeholder: '资料标题' }), h('input', { value: manualSource.url, onChange: (e) => setManualSource({ ...manualSource, url: e.target.value }), placeholder: 'https:// 原文链接' }), h('input', { value: manualSource.source, onChange: (e) => setManualSource({ ...manualSource, source: e.target.value }), placeholder: '发布机构/期刊' }), h('input', { value: manualSource.publishedAt, onChange: (e) => setManualSource({ ...manualSource, publishedAt: e.target.value }), placeholder: '版本/日期' }), h('input', { value: manualSource.note, maxLength: 2000, onChange: (e) => setManualSource({ ...manualSource, note: e.target.value }), placeholder: '简短备注（可选，不含患者身份信息）' }), button('保存来源', async () => { if (await saveKnowledgeSource(manualSource)) setManualSource({ title: '', url: '', source: '', publishedAt: '', note: '' }) }, 'cps-secondary'))),
            h('div', { className: 'cps-record-list' }, h('h2', null, '已保存的资料来源'), knowledgeSources.length ? knowledgeSources.map((source) => h('article', { key: source.id, className: 'cps-record' }, h('div', null, h('strong', null, source.title), h('small', null, [source.source, source.publishedAt].filter(Boolean).join(' · ') || formatDate(source.savedAt))), h('p', null, source.note || source.url), button('删除', () => deleteRecord('knowledge-sources', source.id), 'cps-delete'))) : h('p', { className: 'cps-empty' }, '你明确保存的来源会出现在这里。')),
            h('p', { className: 'cps-small-note' }, '检索流程会要求标注发布机构、地区、版本/日期和可点击链接。0.3.2 的 MinerU 仅有连接配置，尚未启用文件上传/解析。不要将可识别患者资料发送给第三方。')) : null,
          tab === '历史对话' ? h('div', { className: 'cps-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, h('p', { className: 'cps-kicker' }, 'DSH 原生会话'), h('h1', null, '历史对话'), h('p', null, '按宿主公开会话摘要整理；完整消息由原生会话恢复查看。'))), history.length ? h('ol', { className: 'cps-timeline' }, history.map((s) => h('li', { key: s.id }, h('div', null, h('strong', null, s.title || '陪伴对话'), h('small', null, formatDate(s.updatedAt))), button('回到这段对话', () => openHistory(s.id), 'cps-secondary')))) : h('p', { className: 'cps-empty' }, '还没有本工作台的原生会话。')) : null,
          tab === '配置' ? h('div', { className: 'cps-page cps-config-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, h('p', { className: 'cps-kicker' }, '右上角配置'), h('h1', null, '工作台设置'), h('p', null, '所有密钥由本机 DSH 服务端保存，不写入浏览器存储或工作台安装包。'))),
            h('section', { className: 'cps-config-card' }, h('h2', null, '本地记录目录'), h('p', null, settings.dataRoot || '尚未选择。回顾、量表、沟通偏好与资料来源不会保存到别处。'), button('选择本地目录', chooseDataRoot, 'cps-secondary')),
            h('section', { className: 'cps-config-card' }, h('h2', null, 'MinerU 文档解析服务'), h('p', null, '配置地址与密钥状态。0.3.2 尚未启用文件上传或解析；不要通过此工作台发送患者资料。'), h('label', null, 'API 地址', h('input', { value: settings.mineruEndpoint || '', onChange: (e) => setSettings({ ...settings, mineruEndpoint: e.target.value }), placeholder: 'https://mineru.net/api/v4' })), h('label', null, `API Key · ${settings.mineruConfigured ? '已配置' : '未配置'}`, h('input', { type: 'password', value: secretDraft.mineruApiKey, autoComplete: 'new-password', onChange: (e) => setSecretDraft({ ...secretDraft, mineruApiKey: e.target.value }), placeholder: settings.mineruConfigured ? '已保存；留空则保持不变' : '粘贴 MinerU API Key' })), settings.mineruConfigured ? button('移除 MinerU 密钥', () => clearSecret('mineru'), 'cps-delete') : null),
            h('section', { className: 'cps-config-card' }, h('h2', null, 'KNOWS 资料检索'), h('p', null, '配置你已获授权的 KNOWS 服务。当前适配器使用 Bearer Key 与 JSON POST；接口路径可按服务说明填写。'), h('label', null, 'API 地址', h('input', { value: settings.knowsEndpoint || '', onChange: (e) => setSettings({ ...settings, knowsEndpoint: e.target.value }), placeholder: 'https://…' })), h('label', null, '检索路径', h('input', { value: settings.knowsSearchPath || '/search', onChange: (e) => setSettings({ ...settings, knowsSearchPath: e.target.value }), placeholder: '/search' })), h('label', null, `API Key · ${settings.knowsConfigured ? '已配置' : '未配置'}`, h('input', { type: 'password', value: secretDraft.knowsApiKey, autoComplete: 'new-password', onChange: (e) => setSecretDraft({ ...secretDraft, knowsApiKey: e.target.value }), placeholder: settings.knowsConfigured ? '已保存；留空则保持不变' : '粘贴 KNOWS API Key' })), settings.knowsConfigured ? button('移除 KNOWS 密钥', () => clearSecret('knows'), 'cps-delete') : null),
            h('section', { className: 'cps-config-card' }, h('h2', null, '我的沟通偏好'), h('p', null, '由你填写和修改，例如“先听我说完再给建议”“尽量用简短句子”。这是用户自述，不是助手推断；会用于后续新会话开场。'), h('textarea', { value: communicationPreferences, maxLength: 4000, onChange: (e) => setCommunicationPreferences(e.target.value), placeholder: '可选；不想保存就留空' }), button('保存沟通偏好', savePreferences, 'cps-secondary')),
            h('section', { className: 'cps-config-card' }, h('h2', null, '记忆与隐私'), h('p', null, '完整对话由 DSH 保存。此工作台只保存你认可的回顾、手动录入的量表结果、用户自述的沟通偏好和资料来源元数据，不复制聊天正文或资料全文。'), h('div', { className: 'cps-config-actions' }, button('导出已保存记录', generateExport, 'cps-secondary'), button('删除全部本地记忆', async () => { if (!window.confirm('删除全部回顾、量表、沟通偏好和已保存资料来源？此操作无法撤销。')) return; try { await request('/records', { method: 'DELETE' }); await refreshRecords(); flash('本地记忆已清空。') } catch (e) { flash(e.message, true) } }, 'cps-delete'))),
            h('div', { className: 'cps-config-footer' }, button('保存配置', saveSettings, 'cps-primary'))
          ) : null,
          modal ? h('div', { className: 'cps-overlay', onMouseDown: (e) => { if (e.target === e.currentTarget) setModal(false) } }, h('section', { className: 'cps-modal', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'cps-modal-title' }, h('button', { className: 'cps-modal-close', onClick: () => setModal(false), 'aria-label': '关闭' }, '×'), h('p', { className: 'cps-kicker' }, active.name), h('h2', { id: 'cps-modal-title' }, '先从此刻最想说的开始'), h('p', null, '你可以选一个话题，也可以直接写。不会自动发送。'), h('div', { className: 'cps-topic-chips' }, active.topics.map((x) => button(x, () => setTopic(x), 'cps-chip', false, x))), h('textarea', { value: topic, onChange: (e) => setTopic(e.target.value), 'aria-label': '本次想聊的话题' }), h('div', { className: 'cps-modal-actions' }, button('先不聊', () => setModal(false), 'cps-secondary'), button(busy ? '正在准备…' : '进入陪伴', beginSession, 'cps-primary', busy)))) : null,
          h('footer', { className: 'cps-footer' }, h('span', null, '你可以随时换个角色、暂停建议或退出。'), h('span', null, '不替代医疗或心理专业服务。'))
        )
      }
      function apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-cps-workbench', '')
          style.textContent = css
          document.head.appendChild(style)
          const unregister = ctx.desktopWorkbenches.register({ title: '留一盏灯 · 心理支持', repository: 'https://github.com/xyb-openharness-dsh-plugins/xiaoxinbao-workbench', description: '面向各类肿瘤患者与家属的情绪支持、专业检索与沟通整理工作台', panelTitle: '心理支持', customFrame: true }, Panel)
          return () => { if (typeof unregister === 'function') unregister(); style.remove() }
        })
      }
      class ErrorBoundary extends React.Component {
        constructor(props) { super(props); this.state = { error: null } }
        static getDerivedStateFromError(error) { return { error } }
        render() {
          if (this.state.error) return h('pre', { style: { padding: 24, whiteSpace: 'pre-wrap', color: '#8b2f1c' } }, `${this.state.error.name}: ${this.state.error.message}`)
          return this.props.children
        }
      }
      function Panel(props) { return h(ErrorBoundary, null, h(App, props)) }
      return { name: 'dsh-cancer-psych-support-workbench', apply, inject: ['desktopWorkbenches'] }
    },
  })
})()
