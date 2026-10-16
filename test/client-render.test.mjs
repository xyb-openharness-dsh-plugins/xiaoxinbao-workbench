import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'src', 'client.js')

// 这组测试来自一次真实的使用故障：点「认可并保存到本机」保存回顾时，整个面板
// 崩成一行 `Error: Minified React error #130`（解码后是
// "Element type is invalid: expected a string ... but got: undefined"）。
//
// 根因在客户端的 key 补全辅助函数 keyOne()：它遇到数组子节点时会走
// `React.cloneElement(child, { key })`，而 cloneElement 只能克隆元素、不能克隆
// 数组 —— 对数组调用它会得到一个 type 为 undefined 的坏元素，渲染时就是 #130。
//
// 触发条件正好是「保存」：保存前「已保存回顾」区域是 `reviews.length ?
// reviews.map(...) : <p>占位</p>` 里的占位元素（单个元素），保存后变成
// map 出来的卡片数组。父级是数组子节点 → withKeys 里 child 是数组 →
// cloneElement(数组) → 坏元素。列表从空变非空（或反过来）的瞬间必崩。
//
// 所以这里钉死两件事：keyOne 必须先递归数组，且不能有任何地方对数组调 cloneElement。
test('keyOne 递归处理数组子节点，不对数组调用 cloneElement（React #130）', async () => {
  const source = await readFile(clientPath, 'utf8')
  const m = source.match(/const keyOne = \(child, key\) => \{([\s\S]*?)\n      \}/)
  assert.ok(m, 'src/client.js 必须定义 keyOne')

  const body = m[1]
  // 数组必须先被递归展开，且必须出现在 cloneElement 调用之前。
  // 注意源码里注释也提到 cloneElement，所以先剥掉注释再比较位置。
  const code = body.replace(/\/\/.*$/gm, '')
  const arrayIdx = code.search(/Array\.isArray\(child\)/)
  const cloneIdx = code.search(/cloneElement/)
  assert.ok(arrayIdx >= 0, 'keyOne 必须判断 Array.isArray(child)：数组不能交给 cloneElement')
  assert.ok(cloneIdx >= 0, 'keyOne 需要用 cloneElement 给单个元素补 key')
  assert.ok(
    arrayIdx < cloneIdx,
    '数组分支必须排在 cloneElement 之前 —— 否则数组会被当成元素克隆，产出 type=undefined 的坏元素',
  )
  assert.match(
    body,
    /Array\.isArray\(child\)\)\s*return child\.map\(/,
    '数组分支应递归为每个子项补 key（return child.map(...)）',
  )
})

// 顺手钉住 withKeys：它按位置给兄弟节点补 key，数组项要展开到下一层。
test('withKeys 对嵌套数组按两级下标补 key', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(
    source,
    /const withKeys = \(children\) => children\.map\(\(child, i\) => \(\s*Array\.isArray\(child\)\s*\?\s*child\.map\(\(sub, j\) => keyOne\(sub, `cps-\$\{i\}-\$\{j\}`\)\)/,
    'withKeys 必须把嵌套数组的元素展开补 key，而不是把整个数组当一个子节点',
  )
})

// 话题 chip 的选中态：只有 hover 没有选中态时，用户点完看不出选了哪个。
test('话题 chip 有选中态（is-active），不是只有 hover', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(
    source,
    /'cps-chip' \+ \(topic === x \? ' is-active' : ''\)/,
    '选中卡上的话题 chip 必须按 topic 状态追加 is-active 类',
  )
  const css = await readFile(join(here, '..', 'src', 'client.css'), 'utf8')
  assert.match(css, /\.cps-selected-topics button\.is-active\{[^}]*background/, '选中态必须有区别于 hover 的背景色')
  assert.match(css, /\.cps-topic-chips button\.is-active\{[^}]*background/, '弹窗里的 chip 也要有选中态')
})
