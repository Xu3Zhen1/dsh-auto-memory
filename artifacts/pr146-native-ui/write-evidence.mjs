import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const coverage = JSON.parse(fs.readFileSync(path.join(dir, 'coverage.json')))
const names = [...new Set(coverage.flatMap(row => row.screenshots || []))].sort()
if (names.some(name => name.includes('operations-外部来源') || path.basename(name) !== name)) throw Error('Unexpected screenshot path')
const manifest = {
  generatedAt: new Date().toISOString(),
  scope: 'Real isolated DSH captures. Fixture and partial-viewport limits are per entry in coverage.json. Source hashes describe the final build, not an assertion that every historical capture used that revision.',
  finalSourceHashes: Object.fromEntries(['lib/client.js', 'lib/index.js', 'lib/skin-assets.js'].map(name => [name, sha(path.join(dir, '../..', name))])),
  screenshots: names.map(name => {
    const file = path.join(dir, name), bytes = fs.readFileSync(file)
    return { file: name, sha256: sha(file), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), modifiedAt: fs.statSync(file).mtime.toISOString(), entries: coverage.filter(row => row.screenshots?.includes(name)).map(row => row.id) }
  }),
}
fs.writeFileSync(path.join(dir, 'evidence-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`${names.length} screenshots hashed; excluded private and failed captures`)
