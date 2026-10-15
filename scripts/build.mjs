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
const source = (await readFile(resolve(root, 'src/client.js'), 'utf8'))
  .replace('/*__ASSET_MAP__*/', Object.entries(assets).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(','))
  .replace("'__CPS_CSS__'", JSON.stringify(css))
await writeFile(resolve(root, 'lib/client.js'), source)
let preview = await readFile(resolve(root, 'docs/ui-preview.template.html'), 'utf8')
preview = preview.replaceAll('__BACKGROUND__', background).replaceAll('__LOGO__', assets.logo)
for (let i = 0; i < 6; i++) preview = preview.replaceAll(`__ROLE${i}__`, assets[`role${i}`])
await writeFile(resolve(root, 'docs/ui-preview.html'), preview)
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
console.log(`Built ${pkg.name}@${pkg.version} client (${Buffer.byteLength(source)} bytes) and standalone UI preview.`)
