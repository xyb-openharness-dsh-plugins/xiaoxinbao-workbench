import { access, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDataFile } from './settings-store.js'

const MAX_RECORDS = 2000
const MAX_FIELD_LENGTH = 12000

async function readAll(file) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'))
    return {
      schemaVersion: 2,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      measurements: Array.isArray(data.measurements) ? data.measurements : [],
      knowledgeSources: Array.isArray(data.knowledgeSources) ? data.knowledgeSources : [],
      communicationPreferences: clean(data.communicationPreferences || '', 4000),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 2, reviews: [], measurements: [], knowledgeSources: [], communicationPreferences: '' }
    throw new Error('无法读取本地记录文件；原文件未修改')
  }
}

async function writeAll(file, data) {
  try { await access(dirname(file)); if (!(await stat(dirname(file))).isDirectory()) throw new Error('所选记录位置不是目录') }
  catch (error) { if (error?.message === '所选记录位置不是目录') throw error; throw new Error('所选记录目录不可访问；请重新选择') }
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

function clean(value, max = MAX_FIELD_LENGTH) {
  const text = String(value ?? '').trim()
  if (text.length > max) throw new Error('记录内容过长')
  return text
}

export async function listRecords(dataRoot) {
  return readAll(getDataFile('', dataRoot))
}

export async function addReview(dataRoot, input) {
  if (input?.approved !== true) throw new Error('只有明确认可的回顾才能保存')
  const data = await readAll(getDataFile('', dataRoot))
  if (data.reviews.length + data.measurements.length + data.knowledgeSources.length >= MAX_RECORDS) throw new Error('本地记录已达到上限，请先导出或删除旧记录')
  const record = {
    id: randomUUID(), roleId: clean(input.roleId, 80), sessionId: clean(input.sessionId, 160), createdAt: new Date().toISOString(),
    summary: clean(input.summary), userWords: clean(input.userWords), neutralObservation: clean(input.neutralObservation), nextStep: clean(input.nextStep), closing: clean(input.closing), approved: true,
  }
  data.reviews.unshift(record)
  await writeAll(getDataFile('', dataRoot), data)
  return record
}

const allowedInstruments = new Set(['dt', 'gad7', 'phq9', 'esas'])
export async function addMeasurement(dataRoot, input) {
  const data = await readAll(getDataFile('', dataRoot))
  if (data.reviews.length + data.measurements.length + data.knowledgeSources.length >= MAX_RECORDS) throw new Error('本地记录已达到上限，请先导出或删除旧记录')
  if (!allowedInstruments.has(input?.instrumentId)) throw new Error('量表标识无效')
  const record = {
    id: randomUUID(), instrumentId: input.instrumentId, instrumentName: clean(input.instrumentName, 120), score: clean(input.score, 80), note: clean(input.note, 400),
    version: clean(input.version, 120), sessionId: clean(input.sessionId, 160), createdAt: new Date().toISOString(),
  }
  if (!record.score) throw new Error('请填写你已完成的量表结果')
  data.measurements.unshift(record)
  await writeAll(getDataFile('', dataRoot), data)
  return record
}

export async function saveCommunicationPreferences(dataRoot, value) {
  const data = await readAll(getDataFile('', dataRoot))
  data.communicationPreferences = clean(value, 4000)
  await writeAll(getDataFile('', dataRoot), data)
  return data.communicationPreferences
}

export async function addKnowledgeSource(dataRoot, input) {
  const data = await readAll(getDataFile('', dataRoot))
  if (data.reviews.length + data.measurements.length + data.knowledgeSources.length >= MAX_RECORDS) throw new Error('本地记录已达到上限，请先导出或删除旧记录')
  let url
  try { url = new URL(clean(input?.url, 2000)) } catch { throw new Error('资料链接格式不正确') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('资料链接必须使用 HTTPS')
  const record = {
    id: randomUUID(), title: clean(input?.title, 400), url: url.href,
    source: clean(input?.source, 300), publishedAt: clean(input?.publishedAt, 80),
    note: clean(input?.note, 2000), savedAt: new Date().toISOString(),
  }
  if (!record.title) throw new Error('请填写资料标题')
  data.knowledgeSources.unshift(record)
  await writeAll(getDataFile('', dataRoot), data)
  return record
}

export async function deleteRecord(dataRoot, type, id) {
  if (!['reviews', 'measurements', 'knowledgeSources'].includes(type)) throw new Error('记录类型无效')
  const data = await readAll(getDataFile('', dataRoot))
  const previous = data[type].length
  data[type] = data[type].filter((item) => item.id !== id)
  if (data[type].length === previous) return false
  await writeAll(getDataFile('', dataRoot), data)
  return true
}

export async function clearRecords(dataRoot) {
  const data = { schemaVersion: 2, reviews: [], measurements: [], knowledgeSources: [], communicationPreferences: '' }
  await writeAll(getDataFile('', dataRoot), data)
  return data
}
