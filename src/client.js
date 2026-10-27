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
  // 会话面板分隔线（家族基线：1px 线 + 11px 透明热区 + 品牌色发光 + ⠿ 把手）
  const SPLITTER_BRAND = '#168e73'
  const splitterRgba = (hex, alpha) => {
    const n = parseInt(String(hex).replace('#', ''), 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const splitterStyle = {
    position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
    zIndex: 2, background: 'rgba(53, 128, 100, 0.18)', cursor: 'col-resize', touchAction: 'none',
    transition: 'background .15s ease, box-shadow .15s ease',
  }
  const splitterHoverStyle = { ...splitterStyle, background: SPLITTER_BRAND, boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}` }
  const splitterDragStyle = { ...splitterHoverStyle, boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}` }
  const splitterHitStyle = { position: 'absolute', top: 0, bottom: 0, left: -5, width: 11, background: 'transparent', cursor: 'col-resize' }
  const splitterGripStyle = {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
    color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
    opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
  }
  const DRAG_SHIELD_ATTR = 'data-cps-drag-shield'
  const mountDragShield = () => {
    unmountDragShield()
    const el = document.createElement('div')
    el.setAttribute(DRAG_SHIELD_ATTR, '')
    Object.assign(el.style, { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4, background: 'transparent', cursor: 'col-resize' })
    document.body.appendChild(el)
  }
  const unmountDragShield = () => document.querySelectorAll('[' + DRAG_SHIELD_ATTR + ']').forEach((el) => el.remove())
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
      // React 把 varargs 子节点当作数组，数组子节点必须带 key，否则每次渲染都告警。
      // 这个文件里绝大多数兄弟节点位置和文案都固定，用位置补 key 最简单也最稳。
      // 已经自己带 key（含显式 null）的元素保持原样，映射出来的列表仍走各自的 key。
      const rawCreateElement = React.createElement
      // React 要求「数组子节点」里的每个元素带 key，否则控制台每次都告警。
      // 这里统一补：已经带 key 的元素（含 list.map 出来的项）保持不变，避免覆盖业务 key。
      const keyOne = (child, key) => {
        if (!child || typeof child !== 'object') return child
        // 数组要递归进去给每个元素补 key。如果对数组本身调用 cloneElement，
        // 得到的是一个 type 为 undefined 的坏元素 —— 渲染时报
        // "Element type is invalid ... got: undefined"（压缩后就是 React error #130）。
        // 真实触发场景：列表从空变成非空（例如保存回顾后「已保存回顾」区域
        // 从「暂无」占位换成 map 出来的卡片数组），父组件用数组套数组接收子节点。
        if (Array.isArray(child)) return child.map((sub, j) => keyOne(sub, `${key}-${j}`))
        if (child.key != null) return child
        return React.cloneElement(child, { key })
      }
      const withKeys = (children) => children.map((child, i) => (
        Array.isArray(child)
          ? child.map((sub, j) => keyOne(sub, `cps-${i}-${j}`))
          : keyOne(child, `cps-${i}`)
      ))
      const h = (type, props, ...children) => {
        // 单子节点且不是数组时，React 不要求 key。
        if (children.length === 1 && !Array.isArray(children[0])) return rawCreateElement(type, props, children[0])
        return rawCreateElement(type, props, ...withKeys(children))
      }
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
        const [reviewPaste, setReviewPaste] = useState('')
        const [measurementDraft, setMeasurementDraft] = useState({ instrumentId: 'dt', score: '', note: '' })
        const [history, setHistory] = useState([])
        const [searchQuery, setSearchQuery] = useState('')
        const [knowledgeResults, setKnowledgeResults] = useState([])
        const [externalConsent, setExternalConsent] = useState(false)
        const [searchBusy, setSearchBusy] = useState(false)
        const [health, setHealth] = useState('')
        const [showSession, setShowSession] = useState(false)
        // 会话面板（AI 对话区）占根容器宽度的百分比，25%–45%，步进 2%。初始 35% 与基线一致；
        // 用户拖过的宽度存在 localStorage，下次进入保持不变。
        const [agentPct, setAgentPct] = useState(() => {
          try { const v = Number(localStorage.getItem('cps-agent-width')); if (v >= 25 && v <= 45) return v } catch {}
          return 35
        })
        const [hovering, setHovering] = useState(false)
        const [draggingUi, setDraggingUi] = useState(false)
        const splitRef = React.useRef(null)
        const splitDrag = React.useRef(false)
        const pctRef = React.useRef(agentPct)
        pctRef.current = agentPct
        const applyPct = (n) => {
          const next = Math.min(45, Math.max(25, Math.round(n)))
          setAgentPct(next)
          try { localStorage.setItem('cps-agent-width', String(next)) } catch {}
          return next
        }
        const startSplitDrag = (e) => {
          if (!splitRef.current) return
          splitDrag.current = true
          setDraggingUi(true)
          setHovering(true)
          try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}
          mountDragShield()
          document.body.style.userSelect = 'none'
          document.body.style.cursor = 'col-resize'
          e.preventDefault()
        }
        const onSplitterKeyDown = (e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); applyPct(pctRef.current + 2) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); applyPct(pctRef.current - 2) }
          else if (e.key === 'Home') { e.preventDefault(); applyPct(25) }
          else if (e.key === 'End') { e.preventDefault(); applyPct(45) }
        }
        useEffect(() => {
          const move = (e) => {
            if (!splitDrag.current || !splitRef.current) return
            const rect = splitRef.current.getBoundingClientRect()
            applyPct(((rect.right - e.clientX) / rect.width) * 100)
          }
          const up = () => {
            if (!splitDrag.current) return
            splitDrag.current = false
            setDraggingUi(false)
            unmountDragShield()
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
          window.addEventListener('pointercancel', up)
          return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', up)
            unmountDragShield()
          }
        }, [])
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
        // 新建一段本工作台的会话。
        //
        // 这里必须用 service.newSession(workspaceId) 而不是 newWorkspaceSession()：
        // 后者第一句就是 ctx.uiWorkspace.pickDirectory()，每次都会弹系统目录选择器，
        // 换来的却是复用同一个工作区的会话。newSession 只在完全没有可用工作区时
        // 才回退到 newWorkspaceSession()（首次使用弹一次，是正确行为）。
        // 两个方法都不经过宿主那个会抛「requires a client package entry name」的
        // sourcePackage() 守卫，所以可以安全直接调用。
        const newSessionId = async () => {
          if (typeof service?.newSession !== 'function') throw new Error('当前 DSH 没有提供新建工作台会话的接口。')
          let workspaceId
          try { workspaceId = service.defaultWorkspace?.()?.workspaceId } catch { workspaceId = undefined }
          // 传 undefined 时宿主自己再解析一次 defaultWorkspace，行为一致。
          return await service.newSession(workspaceId)
        }
        const beginSession = async () => {
          if (busy) return
          setBusy(true); flash('')
          try {
            // 已经有一段属于自己的会话时，不重建：用户可能只是想回到刚才那段。
            let id = currentSession
            if (!id || !ownsSession(id)) id = await newSessionId()
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
        // 明确的「新开一段对话」入口：现有会话和历史内容都留在原处，
        // 新会话不继承上一段的上下文，也不再重复写入开场草稿之外的东西。
        const startFreshSession = async () => {
          if (busy) return
          if (!(await window.confirm('新开一段对话？之前那段会保留在「历史对话」里，这段对话不会带上它的上下文。'))) return
          setBusy(true); flash('')
          try {
            const id = await newSessionId()
            if (!id) { flash('已取消选择工作区，没有创建会话。'); return }
            const scoped = ctx.sessions.scope(id)
            const input = scoped?.get?.('conversation')?.input?.for?.(scoped)
            setTopic(active.opening)
            if (!input?.setDraft) throw new Error('当前宿主没有提供原生会话输入接口。')
            input.setDraft(rolePrompt(active, active.opening, communicationPreferences))
            setPromptedRoleId(active.id)
            setShowSession(true); flash('已新开一段对话，并把角色设定放进输入框。请核对后发送。')
          } catch (e) { flash(e.message || '暂时无法新开会话。', true) }
          finally { setBusy(false) }
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
        // 回顾草稿解析：把【本次聊到】等标题切分成结构化字段。
        // 对话内容可能来自「直接读取会话」或用户自己粘贴，两条路共用这一段。
        const parseReviewText = (text) => {
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
          return parsed
        }
        // 直接在页面里粘贴助手回复。此前这里读系统剪贴板，但 DSH Desktop 主进程的
        // 权限白名单只放行剪贴板写入与通知，读取一定被拒，所以那条路径在这台宿主上
        // 永远不会成功，改为用户自己在页面里粘贴一次。
        const pasteReview = () => {
          const text = reviewPaste.trim()
          if (!text) return flash('先把你复制的助手回复粘贴到上面的文本框。', true)
          const parsed = parseReviewText(text)
          if (!Object.keys(parsed).length) parsed.summary = text
          setReviewDraft({ ...reviewDraft, ...parsed }); setReviewPaste(''); flash('已识别回顾草稿。请逐项检查、修改，再决定是否保存。')
        }
        // 直接读这次会话，省掉"复制粘贴"这一步。服务端只做只读提取，
        // 拿回来的是草稿而不是已保存记录；保存仍要用户点确认。
        const readReviewFromSession = async () => {
          if (!ownsCurrent) return flash('先在「陪伴」页开始或恢复一段本工作台的会话。', true)
          if (busy) return
          setBusy(true); flash('')
          try {
            const result = await request('/reviews/from-session', { method: 'POST', body: JSON.stringify({ sessionId: currentSession, roleId: active.id }) })
            const draft = result.draft || {}
            setReviewDraft({
              summary: draft.summary || '', userWords: draft.userWords || '',
              neutralObservation: draft.neutralObservation || '', nextStep: draft.nextStep || '', closing: draft.closing || '',
            })
            // 服务端会回传归属核对结论。'unknown' 表示读不到宿主状态文件，
            // 这时不能假装核对过了——照实说明，用户自己判断要不要用这份草稿。
            const caveat = result.ownership === 'unknown' ? '（没能核对到这段会话的归属文件，请再确认它确实是本工作台的会话。）' : ''
            flash(`已从这段会话读出 ${draft.source?.messageCount || 0} 条消息，整理成草稿。请逐项检查、修改，再决定是否保存。${caveat}`)
          } catch (e) { flash(e.message || '读取这段会话失败。', true) }
          finally { setBusy(false) }
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
        // children 用展开传入，所以都是数组子节点；React 要求它们带 key。
        // 这些卡片里的兄弟节点位置和文案都固定，按位置补 key 即可。
        const card = (className, children) => h('section', { className }, ...children.map((child, i) => (child && child.key == null ? { ...child, key: `${className}-${i}` } : child)))
        const button = (label, onClick, cls = '', disabled = false, key) => h('button', { type: 'button', className: cls, onClick, disabled, ...(key === undefined ? {} : { key }) }, label)
        const renderReview = () => h('div', { className: 'cps-page' }, [
          h('div', { className: 'cps-page-heading', key: 'heading' }, [
            h('div', { key: 'copy' }, [h('p', { className: 'cps-kicker', key: 'kicker' }, '对话结束后 · 由你确认'), h('h1', { key: 'title' }, '本次回顾'), h('p', { key: 'lede' }, '可以直接读取这段会话生成草稿，也可以把助手回复自己粘贴进来。无论哪种方式，都要你逐项检查、修改，再决定要不要保存。')]),
            h('div', { className: 'cps-heading-actions', key: 'actions' }, [button('生成回顾请求', startReview, 'cps-secondary', false, 'ask'), button(busy ? '读取中…' : '读取这段会话生成草稿', readReviewFromSession, 'cps-primary', busy || !ownsCurrent, 'read')]),
          ]),
          !ownsCurrent ? h('p', { className: 'cps-small-note', key: 'nosession' }, '当前没有属于本工作台的会话。先在「陪伴」页开始一段对话，或到「历史对话」里恢复一段。') : null,
          h('details', { className: 'cps-paste-box', key: 'paste' }, [
            h('summary', { key: 'summary' }, '或者：手动粘贴助手回复'),
            h('p', { className: 'cps-small-note', key: 'hint' }, '在原生会话里让助手按格式输出回顾，复制它的回复，粘贴到下面，再点识别。（这个工作台无法读取你的系统剪贴板，所以需要你自己按一次粘贴。）'),
            h('label', { key: 'field' }, '粘贴助手回复', h('textarea', { value: reviewPaste, onChange: (e) => setReviewPaste(e.target.value), placeholder: '把助手回复整段粘贴到这里，包含【本次聊到】等标题。' })),
            h('div', { className: 'cps-review-actions', key: 'go' }, button('清空', () => setReviewPaste(''), 'cps-secondary', false, 'clear'), button('粘贴并识别', pasteReview, 'cps-secondary', false, 'parse')),
          ]),
          card('cps-review-card', [
            h('label', { key: 'summary' }, '本次聊到', h('textarea', { value: reviewDraft.summary, onChange: (e) => setReviewDraft({ ...reviewDraft, summary: e.target.value }), placeholder: '概括这次谈到的主题；只保留你愿意记录的内容。' })),
            h('label', { key: 'userWords' }, '你想记住的话', h('textarea', { value: reviewDraft.userWords, onChange: (e) => setReviewDraft({ ...reviewDraft, userWords: e.target.value }), placeholder: '可选：用自己的话记录此刻的感受或需要。' })),
            h('label', { key: 'neutral' }, '中性观察', h('textarea', { value: reviewDraft.neutralObservation, onChange: (e) => setReviewDraft({ ...reviewDraft, neutralObservation: e.target.value }), placeholder: '描述已表达的感受、压力来源或需要，不贴标签、不做诊断。' })),
            h('label', { key: 'next' }, '下一步选项', h('textarea', { value: reviewDraft.nextStep, onChange: (e) => setReviewDraft({ ...reviewDraft, nextStep: e.target.value }), placeholder: '最多几条可选择的小事；不需要时留空。' })),
            h('label', { key: 'closing' }, '温和收尾', h('textarea', { value: reviewDraft.closing, onChange: (e) => setReviewDraft({ ...reviewDraft, closing: e.target.value }), placeholder: '具体、不过度积极，也可以留白。' })),
            h('div', { className: 'cps-review-actions', key: 'save' }, [button('清空草稿', () => setReviewDraft({ summary: '', userWords: '', neutralObservation: '', nextStep: '', closing: '' }), 'cps-secondary', false, 'clear'), button('认可并保存到本机', saveReview, 'cps-primary', false, 'save')]),
          ]),
          h('p', { className: 'cps-small-note', key: 'note' }, '回顾是你的私人沟通便笺，不是临床评估。「读取这段会话」只读你属于本工作台的那段原生会话，用来填这份草稿；只有你点「认可并保存到本机」之后才会写进本地记录文件。'),
          h('div', { className: 'cps-record-list', key: 'records' }, [
            h('h2', { key: 'title' }, '已保存回顾'),
            reviews.length ? reviews.map((r) => h('article', { key: r.id, className: 'cps-record' }, h('div', null, h('strong', null, roles.find((x) => x.id === r.roleId)?.name || '陪伴回顾'), h('small', null, formatDate(r.createdAt))), h('p', null, r.summary || r.userWords || r.neutralObservation), button('删除', () => deleteRecord('reviews', r.id), 'cps-delete'))) : h('p', { className: 'cps-empty', key: 'empty' }, '你确认保存的回顾会出现在这里。'),
          ]),
        ])
        const status = error || notice
        return h('main', { className: 'cps-frame' },
          h('header', { className: 'cps-topbar' }, h('div', { className: 'cps-brand' }, h('img', { src: ASSETS.logo, alt: '小胰宝' }), h('b', null, 'DSH'), h('i'), h('strong', null, '留一盏灯'), h('span', null, '心理支持与沟通工作台'), h('small', null, 'v0.3.14')), h('div', { className: 'cps-top-actions' }, h('span', { className: 'cps-service-state' }, health), button('⚙ 配置', () => setTab('配置'), `cps-settings-button${tab === '配置' ? ' active' : ''}`))),
          h('nav', { className: 'cps-tabs', 'aria-label': '工作台页面' }, ['陪伴', '本次回顾', '量表记录', '资料检索', '历史对话'].map((name) => button(name, () => setTab(name), `cps-tab${tab === name ? ' active' : ''}`, false, name))),
          status ? h('div', { className: `cps-alert${error ? ' is-error' : ''}`, role: 'status' }, status) : null,
          tab === '陪伴' ? h('div', { className: `cps-main${showSession ? ' with-chat' : ''}`, ref: splitRef, style: showSession ? { '--cps-agent': agentPct + '%', position: 'relative' } : undefined },
            h('section', { className: 'cps-home' },
              h('div', { className: 'cps-heading' }, [h('p', { className: 'cps-kicker', key: 'kicker' }, '这段路，可以有人陪你走'), h('h1', { key: 'title' }, '此刻，你想和谁聊一会儿？'), h('p', { key: 'lede' }, '可聊病情生活，也可吐槽全世界，你觉得如何。')]),
              h('div', { className: 'cps-role-grid' }, roles.map((role) => h('button', { key: role.id, className: `cps-role${role.id === roleId ? ' selected' : ''}`, onClick: () => { setRoleId(role.id); setNotice(''); setError('') }, 'aria-pressed': role.id === roleId }, h('img', { src: role.portrait, alt: '' }), h('strong', null, role.name), h('span', { className: 'cps-rule' }), h('span', { className: 'cps-role-line' }, `“${role.line}”`), h('small', null, role.group)))),
              h('div', { className: 'cps-selected' }, h('div', { className: 'cps-selected-row' }, h('div', { className: 'cps-selected-copy', key: 'copy' }, [h('strong', { key: 'intro' }, active.intro), h('p', { key: 'hosted' }, '对话由 DSH 原生会话和你配置的模型承载。')]), button(ownsCurrent ? '继续这段对话' : '开始陪伴', () => { if (ownsCurrent) { setShowSession(true); setNotice('') } else { setTopic(active.opening); setModal(true) } }, 'cps-primary', busy, 'cta')), h('div', { className: 'cps-selected-topics' }, [h('small', { key: 'cap' }, '可以就这样开始：'), ...active.topics.map((x) => button(x, () => setTopic(topic === x ? '' : x), 'cps-chip' + (topic === x ? ' is-active' : ''), false, `sel-${x}`))])),
              h('div', { className: 'cps-crisis-note' }, '如果你或身边的人现在有伤害自己的危险，或出现急剧加重的身体症状，请立即联系当地急救服务、就近急诊或可信任的人陪同。')),
            showSession ? [
              h('div', {
                className: 'cps-splitter', role: 'separator', 'aria-orientation': 'vertical', key: 'splitter',
                'aria-label': '调整 AI 对话面板宽度', 'aria-valuemin': 25, 'aria-valuemax': 45, 'aria-valuenow': agentPct, tabIndex: 0,
                onPointerDown: startSplitDrag,
                onPointerEnter: () => setHovering(true),
                onPointerLeave: () => setHovering(false),
                onKeyDown: onSplitterKeyDown,
                style: { ...(draggingUi ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle), right: agentPct + '%' },
              },
                h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
                (hovering || draggingUi) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
              h('section', { className: 'cps-chat-area', key: 'chat' }, h('div', { className: 'cps-chat-toolbar' }, h('strong', null, `${active.name} · DSH 原生会话`), button('新开一段对话', startFreshSession, 'cps-secondary', busy), button('生成本次回顾', startReview, 'cps-secondary'), button('重发角色设定', () => sendRolePrompt(active), 'cps-secondary', busy), button('返回角色', () => setShowSession(false), 'cps-link')), h('div', { className: 'cps-conversation' }, ownsCurrent ? conversation : h('div', { className: 'cps-no-chat' }, '创建或恢复工作台会话后，这里会显示 DSH 原生对话。'))),
            ] : null) : null,
          tab === '陪伴' && selectedRoleChanged ? h('div', { className: 'cps-alert', role: 'status' }, `已切换到「${active.name}」，但当前会话仍按上一个角色的设定在聊。`,
            button('把新角色设定发进这段对话', () => sendRolePrompt(active), 'cps-secondary', busy)) : null,
          tab === '本次回顾' ? renderReview() : null,
          tab === '量表记录' ? h('div', { className: 'cps-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, [h('p', { className: 'cps-kicker', key: 'kicker' }, '自愿 · 筛查不等于诊断'), h('h1', { key: 'title' }, '量表与自评'), h('p', { key: 'lede' }, '可以先聊，再由你决定要不要了解或完成一项量表。请使用有授权且经验证的中文版；工作台不展示受版权保护的题目。')])),
            h('div', { className: 'cps-instrument-grid' }, instruments.map((scale) => h('article', { key: scale.id, className: 'cps-instrument' }, h('strong', null, scale.name), h('span', null, scale.scope), h('p', null, scale.note), button('请助手介绍这项量表', () => setNativeDraft(`请先询问我是否愿意了解「${scale.name}」。简要说明它的筛查用途、使用边界、经验证中文版与授权版本的查找途径；不要在未核实授权前复刻题目，不要做诊断。请先问我是否愿意继续。`), 'cps-secondary')))),
            h('section', { className: 'cps-measure-form' }, h('h2', { key: 'title' }, '记录我已完成的结果'), h('p', null, '只记录你主动填写的结果；不同量表分数不可直接比较。若结果让你担心，可带给肿瘤团队或心理专业人员一起讨论。'), h('div', { className: 'cps-form-row' }, h('label', null, '量表', h('select', { value: measurementDraft.instrumentId, onChange: (e) => setMeasurementDraft({ ...measurementDraft, instrumentId: e.target.value }) }, instruments.map((x) => h('option', { key: x.id, value: x.id }, x.name))),), h('label', null, '结果/分数', h('input', { value: measurementDraft.score, maxLength: 80, onChange: (e) => setMeasurementDraft({ ...measurementDraft, score: e.target.value }), placeholder: '按你使用的版本记录' })), h('label', null, '备注（可选）', h('input', { value: measurementDraft.note, maxLength: 400, onChange: (e) => setMeasurementDraft({ ...measurementDraft, note: e.target.value }), placeholder: '版本、完成时间或想讨论的问题' })), button('保存记录', saveMeasurement, 'cps-primary'))),
            h('div', { className: 'cps-record-list' }, h('h2', { key: 'title' }, '自评时间轴'), measurements.length ? measurements.map((r) => h('article', { key: r.id, className: 'cps-record' }, h('div', null, h('strong', null, r.instrumentName), h('small', null, formatDate(r.createdAt))), h('p', null, `结果：${r.score}${r.note ? ` · ${r.note}` : ''}`), button('删除', () => deleteRecord('measurements', r.id), 'cps-delete'))) : h('p', { className: 'cps-empty', key: 'empty' }, '尚无记录；不做提醒或打卡。'))
          ) : null,
          tab === '资料检索' ? h('div', { className: 'cps-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, [h('p', { className: 'cps-kicker', key: 'kicker' }, '三类检索 · 必须提供来源'), h('h1', { key: 'title' }, '规范、共识与证据'), h('p', { key: 'lede' }, '问题先去掉身份信息，再交由 DSH 原生会话检索。若当前模型没有联网工具，助手必须明确说无法核实。')])),
            h('label', { className: 'cps-search-field' }, '想查什么？', h('textarea', { value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: '例如：某癌种治疗期间的情绪支持建议，或安宁疗护疼痛评估框架' })),
            h('div', { className: 'cps-search-grid' }, searchSkills.map((skill) => h('article', { className: 'cps-search-card', key: skill.id }, h('div', { className: 'cps-search-icon' }, skill.id === 'guidelines' ? '§' : skill.id === 'evidence' ? '⌕' : '♡'), h('h2', { key: 'name' }, skill.name), h('p', { key: 'short' }, skill.short), button('在 DSH 中开始检索', () => prepareSearch(skill), 'cps-secondary')))),
            h('section', { className: 'cps-knows-search' }, h('h2', { key: 'title' }, '检索已配置的 KNOWS 知识源'), h('p', null, settings.knowsConfigured && settings.knowsEndpoint ? `已配置：${settings.knowsEndpoint}` : '请先在右上角配置 KNOWS 地址与密钥。'), h('label', { className: 'cps-consent' }, h('input', { type: 'checkbox', checked: externalConsent, onChange: (e) => setExternalConsent(e.target.checked) }), '我会先去掉可识别患者信息，并同意将这个问题发送到 KNOWS。'), button(searchBusy ? '检索中…' : '搜索 KNOWS', searchKnows, 'cps-primary', searchBusy), knowledgeResults.length ? h('div', { className: 'cps-knows-results' }, knowledgeResults.map((r, i) => h('article', { key: `${r.url}-${i}`, className: 'cps-knows-result' }, h('a', { href: r.url || undefined, target: '_blank', rel: 'noopener noreferrer' }, r.title), h('p', null, r.snippet), h('small', null, [r.source, r.publishedAt].filter(Boolean).join(' · ') || '来源/日期未返回；请核验原文'), button(knowledgeSources.some((saved) => saved.url === r.url) ? '已保存来源' : '保存来源', () => saveKnowledgeSource({ title: r.title, url: r.url, source: r.source, publishedAt: r.publishedAt }), 'cps-secondary', !r.url || knowledgeSources.some((saved) => saved.url === r.url))))) : null),
            h('section', { className: 'cps-source-form' }, h('h2', { key: 'title' }, '手动保存资料来源'), h('p', null, '只保存标题、链接、来源和你写的简短备注，不保存指南或论文全文。'), h('div', { className: 'cps-form-row' }, h('input', { value: manualSource.title, onChange: (e) => setManualSource({ ...manualSource, title: e.target.value }), placeholder: '资料标题' }), h('input', { value: manualSource.url, onChange: (e) => setManualSource({ ...manualSource, url: e.target.value }), placeholder: 'https:// 原文链接' }), h('input', { value: manualSource.source, onChange: (e) => setManualSource({ ...manualSource, source: e.target.value }), placeholder: '发布机构/期刊' }), h('input', { value: manualSource.publishedAt, onChange: (e) => setManualSource({ ...manualSource, publishedAt: e.target.value }), placeholder: '版本/日期' }), h('input', { value: manualSource.note, maxLength: 2000, onChange: (e) => setManualSource({ ...manualSource, note: e.target.value }), placeholder: '简短备注（可选，不含患者身份信息）' }), button('保存来源', async () => { if (await saveKnowledgeSource(manualSource)) setManualSource({ title: '', url: '', source: '', publishedAt: '', note: '' }) }, 'cps-secondary'))),
            h('div', { className: 'cps-record-list' }, h('h2', { key: 'title' }, '已保存的资料来源'), knowledgeSources.length ? knowledgeSources.map((source) => h('article', { key: source.id, className: 'cps-record' }, h('div', null, h('strong', null, source.title), h('small', null, [source.source, source.publishedAt].filter(Boolean).join(' · ') || formatDate(source.savedAt))), h('p', null, source.note || source.url), button('删除', () => deleteRecord('knowledge-sources', source.id), 'cps-delete'))) : h('p', { className: 'cps-empty', key: 'empty' }, '你明确保存的来源会出现在这里。')),
            h('p', { className: 'cps-small-note' }, '检索流程会要求标注发布机构、地区、版本/日期和可点击链接。0.3.2 的 MinerU 仅有连接配置，尚未启用文件上传/解析。不要将可识别患者资料发送给第三方。')) : null,
          tab === '历史对话' ? h('div', { className: 'cps-page' }, [h('div', { className: 'cps-page-heading', key: 'heading' }, [h('div', { key: 'copy' }, [h('p', { className: 'cps-kicker', key: 'kicker' }, 'DSH 原生会话'), h('h1', { key: 'title' }, '历史对话'), h('p', { key: 'lede' }, '按宿主公开会话摘要整理；完整消息由原生会话恢复查看。想重新开始时用「新开一段对话」，新会话不会带上旧对话的上下文。')]), button(busy ? '正在准备…' : '新开一段对话', startFreshSession, 'cps-primary', busy)]), history.length ? h('ol', { className: 'cps-timeline' }, history.map((s) => h('li', { key: s.id }, [h('div', { key: 'meta' }, [h('strong', { key: 'title' }, s.title || '陪伴对话'), h('small', { key: 'time' }, formatDate(s.updatedAt))]), button('回到这段对话', () => openHistory(s.id), 'cps-secondary', false, 'open')]))) : h('p', { className: 'cps-empty', key: 'empty' }, '还没有本工作台的原生会话。')]) : null,
          tab === '配置' ? h('div', { className: 'cps-page cps-config-page' }, h('div', { className: 'cps-page-heading' }, h('div', null, [h('p', { className: 'cps-kicker', key: 'kicker' }, '右上角配置'), h('h1', { key: 'title' }, '工作台设置'), h('p', { key: 'lede' }, '所有密钥由本机 DSH 服务端保存，不写入浏览器存储或工作台安装包。')])),
            h('section', { className: 'cps-config-card' }, h('h2', { key: 'title' }, '本地记录目录'), h('p', null, settings.dataRoot || '尚未选择。回顾、量表、沟通偏好与资料来源不会保存到别处。'), button('选择本地目录', chooseDataRoot, 'cps-secondary')),
            h('section', { className: 'cps-config-card' }, h('h2', { key: 'title' }, 'MinerU 文档解析服务'), h('p', null, '配置地址与密钥状态。0.3.2 尚未启用文件上传或解析；不要通过此工作台发送患者资料。'), h('label', null, 'API 地址', h('input', { value: settings.mineruEndpoint || '', onChange: (e) => setSettings({ ...settings, mineruEndpoint: e.target.value }), placeholder: 'https://mineru.net/api/v4' })), h('label', null, `API Key · ${settings.mineruConfigured ? '已配置' : '未配置'}`, h('input', { type: 'password', value: secretDraft.mineruApiKey, autoComplete: 'new-password', onChange: (e) => setSecretDraft({ ...secretDraft, mineruApiKey: e.target.value }), placeholder: settings.mineruConfigured ? '已保存；留空则保持不变' : '粘贴 MinerU API Key' })), settings.mineruConfigured ? button('移除 MinerU 密钥', () => clearSecret('mineru'), 'cps-delete') : null),
            h('section', { className: 'cps-config-card' }, h('h2', { key: 'title' }, 'KNOWS 资料检索'), h('p', null, '配置你已获授权的 KNOWS 服务。当前适配器使用 Bearer Key 与 JSON POST；接口路径可按服务说明填写。'), h('label', null, 'API 地址', h('input', { value: settings.knowsEndpoint || '', onChange: (e) => setSettings({ ...settings, knowsEndpoint: e.target.value }), placeholder: 'https://…' })), h('label', null, '检索路径', h('input', { value: settings.knowsSearchPath || '/search', onChange: (e) => setSettings({ ...settings, knowsSearchPath: e.target.value }), placeholder: '/search' })), h('label', null, `API Key · ${settings.knowsConfigured ? '已配置' : '未配置'}`, h('input', { type: 'password', value: secretDraft.knowsApiKey, autoComplete: 'new-password', onChange: (e) => setSecretDraft({ ...secretDraft, knowsApiKey: e.target.value }), placeholder: settings.knowsConfigured ? '已保存；留空则保持不变' : '粘贴 KNOWS API Key' })), settings.knowsConfigured ? button('移除 KNOWS 密钥', () => clearSecret('knows'), 'cps-delete') : null),
            h('section', { className: 'cps-config-card' }, h('h2', { key: 'title' }, '我的沟通偏好'), h('p', null, '由你填写和修改，例如“先听我说完再给建议”“尽量用简短句子”。这是用户自述，不是助手推断；会用于后续新会话开场。'), h('textarea', { value: communicationPreferences, maxLength: 4000, onChange: (e) => setCommunicationPreferences(e.target.value), placeholder: '可选；不想保存就留空' }), button('保存沟通偏好', savePreferences, 'cps-secondary')),
            h('section', { className: 'cps-config-card' }, h('h2', { key: 'title' }, '记忆与隐私'), h('p', null, '完整对话由 DSH 保存。此工作台只保存你认可的回顾、手动录入的量表结果、用户自述的沟通偏好和资料来源元数据，不复制聊天正文或资料全文。'), h('div', { className: 'cps-config-actions' }, button('导出已保存记录', generateExport, 'cps-secondary'), button('删除全部本地记忆', async () => { if (!window.confirm('删除全部回顾、量表、沟通偏好和已保存资料来源？此操作无法撤销。')) return; try { await request('/records', { method: 'DELETE' }); await refreshRecords(); flash('本地记忆已清空。') } catch (e) { flash(e.message, true) } }, 'cps-delete'))),
            h('div', { className: 'cps-config-footer' }, button('保存配置', saveSettings, 'cps-primary'))
          ) : null,
          modal ? h('div', { className: 'cps-overlay', onMouseDown: (e) => { if (e.target === e.currentTarget) setModal(false) } }, h('section', { className: 'cps-modal', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'cps-modal-title' }, h('button', { className: 'cps-modal-close', onClick: () => setModal(false), 'aria-label': '关闭' }, '×'), h('p', { className: 'cps-kicker' }, active.name), h('h2', { id: 'cps-modal-title' }, '先从此刻最想说的开始'), h('p', null, '你可以选一个话题，也可以直接写。不会自动发送。'), h('div', { className: 'cps-topic-chips' }, active.topics.map((x) => button(x, () => setTopic(x), 'cps-chip' + (topic === x ? ' is-active' : ''), false, x))), h('textarea', { value: topic, onChange: (e) => setTopic(e.target.value), 'aria-label': '本次想聊的话题' }), h('div', { className: 'cps-modal-actions' }, button('先不聊', () => setModal(false), 'cps-secondary'), button(busy ? '正在准备…' : '进入陪伴', beginSession, 'cps-primary', busy)))) : null,
          h('footer', { className: 'cps-footer' }, h('span', null, '你可以随时换个角色、暂停建议或退出。'), h('span', null, '不替代医疗或心理专业服务。'))
        )
      }
      function apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-cps-workbench', '')
          style.textContent = css
          document.head.appendChild(style)
          // initialization: 'new-session' 让宿主在打开本工作台、却没有可用最近会话时
          // 自动新建一段归属本工作台的会话 —— 用户不必先手工建会话再回来。
          // 该字段宿主不做校验，直接透传进 entry（见宿主 open() 的分支）。
          const unregister = ctx.desktopWorkbenches.register({ title: '留一盏灯 · 心理支持', repository: 'https://github.com/xyb-openharness-dsh-plugins/xiaoxinbao-workbench', description: '面向各类肿瘤患者与家属的情绪支持、专业检索与沟通整理工作台', panelTitle: '心理支持', customFrame: true, initialization: 'new-session' }, Panel)
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
