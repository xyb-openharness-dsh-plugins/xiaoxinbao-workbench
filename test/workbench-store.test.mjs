import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSettings, writeSettings, readSecrets, writeSecrets, getDataFile } from '../dsh/settings-store.js'
import { addReview, addMeasurement, addKnowledgeSource, saveCommunicationPreferences, listRecords, deleteRecord, clearRecords } from '../dsh/record-store.js'
import { resolveKnowsEndpoint } from '../dsh/knows-url.js'

test('KNOWS search path remains beneath configured API base path', () => {
  assert.equal(resolveKnowsEndpoint('https://knows.example/api/v1', '/search').href, 'https://knows.example/api/v1/search')
})

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'cps-wb-'))
  const serviceRoot = join(base, 'dsh-service')
  const dataRoot = join(base, 'user-selected-data')
  await mkdir(serviceRoot)
  await mkdir(dataRoot)
  return { base, serviceRoot, dataRoot }
}

test('settings keep keys out of client-visible config and store them in a separate file', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  const saved = await writeSettings(f.serviceRoot, { dataRoot: f.dataRoot, knowsEndpoint: 'https://knows.example/api', knowsSearchPath: '/v1/search' })
  assert.equal(saved.dataRoot, f.dataRoot)
  assert.equal(saved.knowsEndpoint, 'https://knows.example/api')
  const status = await writeSecrets(f.serviceRoot, { knowsApiKey: 'test-secret-key' })
  assert.equal(status.knowsConfigured, true)
  const visible = await readSettings(f.serviceRoot)
  assert.equal(visible.knowsConfigured, true)
  assert.equal('knowsApiKey' in visible, false)
  assert.equal((await readSecrets(f.serviceRoot)).knowsApiKey, 'test-secret-key')
})

test('settings reject non-HTTPS remote endpoints and non-directory storage paths', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  await assert.rejects(writeSettings(f.serviceRoot, { knowsEndpoint: 'http://knowledge.example' }), /必须使用 HTTPS/)
  const file = join(f.base, 'not-a-directory.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, '{}'))
  await assert.rejects(writeSettings(f.serviceRoot, { dataRoot: file }), /不是目录/)
})

test('records only save approved reviews and explicit scale scores in the selected directory', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  await writeSettings(f.serviceRoot, { dataRoot: f.dataRoot })
  await assert.rejects(addReview(f.dataRoot, { summary: 'test' }), /明确认可/)
  const review = await addReview(f.dataRoot, { approved: true, roleId: 'new-diagnosis', summary: '虚构回顾', neutralObservation: '用户说感到紧张' })
  const measurement = await addMeasurement(f.dataRoot, { instrumentId: 'gad7', instrumentName: 'GAD-7', score: '8', version: 'fictional test only' })
  assert.ok(review.id)
  assert.ok(measurement.id)
  const records = await listRecords(f.dataRoot)
  assert.equal(records.reviews.length, 1)
  assert.equal(records.measurements.length, 1)
  assert.match(getDataFile('', f.dataRoot), /cancer-psych-support-memory\.json$/)
  assert.equal(await deleteRecord(f.dataRoot, 'reviews', review.id), true)
  const cleared = await clearRecords(f.dataRoot)
  assert.deepEqual(cleared, { schemaVersion: 2, reviews: [], measurements: [], knowledgeSources: [], communicationPreferences: '' })
  const disk = JSON.parse(await readFile(getDataFile('', f.dataRoot), 'utf8'))
  assert.deepEqual(disk.reviews, [])
})

test('memory keeps user-authored communication preferences and source metadata, not document content', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  await saveCommunicationPreferences(f.dataRoot, '先听我说完，再问我要不要建议。')
  const source = await addKnowledgeSource(f.dataRoot, { title: '虚构指南来源', url: 'https://example.org/guideline', source: '示例机构', publishedAt: '2025', note: '只保留来源备注' })
  const records = await listRecords(f.dataRoot)
  assert.equal(records.communicationPreferences, '先听我说完，再问我要不要建议。')
  assert.equal(records.knowledgeSources[0].id, source.id)
  assert.equal('content' in records.knowledgeSources[0], false)
  await assert.rejects(addKnowledgeSource(f.dataRoot, { title: 'invalid', url: 'javascript:alert(1)' }), /必须使用 HTTPS/)
  await assert.rejects(addKnowledgeSource(f.dataRoot, { title: 'insecure', url: 'http://example.org' }), /必须使用 HTTPS/)
  assert.equal(await deleteRecord(f.dataRoot, 'knowledgeSources', source.id), true)
})

test('version 1 memory upgrades on next write without dropping existing reviews', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  const legacy = { schemaVersion: 1, reviews: [{ id: 'old-review', summary: '保留' }], measurements: [] }
  const { writeFile } = await import('node:fs/promises')
  await writeFile(getDataFile('', f.dataRoot), JSON.stringify(legacy))
  const migrated = await listRecords(f.dataRoot)
  assert.equal(migrated.schemaVersion, 2)
  assert.equal(migrated.reviews[0].id, 'old-review')
  assert.deepEqual(migrated.knowledgeSources, [])
  assert.equal(migrated.communicationPreferences, '')
  await saveCommunicationPreferences(f.dataRoot, '先倾听')
  const persisted = JSON.parse(await readFile(getDataFile('', f.dataRoot), 'utf8'))
  assert.equal(persisted.schemaVersion, 2)
  assert.equal(persisted.reviews[0].id, 'old-review')
})

test('records require an existing selected directory and cap text length', async (t) => {
  const f = await fixture(); t.after(() => rm(f.base, { recursive: true, force: true }))
  await assert.rejects(addMeasurement(join(f.base, 'missing'), { instrumentId: 'dt', instrumentName: 'DT', score: '1' }), /重新选择/)
  await assert.rejects(addReview(f.dataRoot, { approved: true, summary: 'x'.repeat(13000) }), /过长/)
})
