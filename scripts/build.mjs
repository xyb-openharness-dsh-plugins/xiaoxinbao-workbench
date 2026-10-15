import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataUri = async (relative, mime) => `data:${mime};base64,${(await readFile(resolve(root, relative))).toString('base64')}`
const assets = {
  logo: await dataUri('assets/xyb-logo.png', 'image/png'),
  role0: await dataUri('assets/characters/female/role-0.webp', 'image/webp'),
  role1: await dataUri('assets/characters/female/role-1.webp', 'image/webp'),
  role2: await dataUri('assets/characters/female/role-2.webp', 'image/webp'),
  role3: await dataUri('assets/characters/female/role-3.webp', 'image/webp'),
  role4: await dataUri('assets/characters/female/role-4.webp', 'image/webp'),
  role5: await dataUri('assets/characters/female/role-5.webp', 'image/webp'),
}
const background = await dataUri('assets/warm-sitting-companions.jpg', 'image/jpeg')
const css = (await readFile(resolve(root, 'src/client.css'), 'utf8')).replaceAll('__BACKGROUND__', background)
// src/prompt.mjs 是纯逻辑模块，test/ 直接 import 它做契约测试；这里剥掉 export 关键字
// 内联进客户端 bundle，保证「被测试的提示词」和「真正发出去的提示词」是同一份源码。
const promptModule = (await readFile(resolve(root, 'src/prompt.mjs'), 'utf8')).replace(/^export /gm, '')
const source = (await readFile(resolve(root, 'src/client.js'), 'utf8'))
  .replace('/*__ASSET_MAP__*/', Object.entries(assets).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(','))
  .replace('/*__PROMPT_MODULE__*/', promptModule)
  .replace("'__CPS_CSS__'", JSON.stringify(css))
for (const token of ['__PROMPT_MODULE__', '__ASSET_MAP__', '__CPS_CSS__']) if (source.includes(token)) throw new Error(`客户端占位符未被完整替换：${token}`)
await writeFile(resolve(root, 'lib/client.js'), source)
let preview = await readFile(resolve(root, 'docs/ui-preview.template.html'), 'utf8')
preview = preview.replaceAll('__BACKGROUND__', background).replaceAll('__LOGO__', assets.logo)
for (let i = 0; i < 6; i++) preview = preview.replaceAll(`__ROLE${i}__`, assets[`role${i}`])
await writeFile(resolve(root, 'docs/ui-preview.html'), preview)
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
console.log(`Built ${pkg.name}@${pkg.version} client (${Buffer.byteLength(source)} bytes) and standalone UI preview.`)
