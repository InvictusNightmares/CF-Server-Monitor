import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

let vite
let useServerCardData
let getCustomPingItems

before(async () => {
  globalThis.localStorage = { getItem: () => null }
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error'
  })
  ;({ useServerCardData, getCustomPingItems } = await vite.ssrLoadModule(
    '/src/frontend/composables/useServerCardData.js'
  ))
})

after(async () => {
  await vite?.close()
  delete globalThis.localStorage
})

const names = ['Claude', 'GPT', 'Gemini', 'Grok']
const sysConfig = Object.fromEntries(names.map((name, index) => [`node_${index + 1}_name`, name]))

function serverWithModelNodes() {
  const server = { ping_ct: 30, ping_cu: 40, ping_cm: 50, loss_ct: 0, loss_cu: 0, loss_cm: 0, loss_bd: false }
  names.forEach((name, index) => {
    const key = `node_${index + 1}`
    server[key] = `api${index + 1}.example:443`
    server[`ping_${key}`] = 60 + index
    server[`loss_${key}`] = 0
  })
  return server
}

test('cards retain all four model nodes alongside the three network rows', () => {
  const rows = useServerCardData({ server: serverWithModelNodes(), sysConfig }).threeNetDetails.value
  assert.deepEqual(rows.map(row => row.key), ['ct', 'cu', 'cm', 'node_1', 'node_2', 'node_3', 'node_4'])
  assert.deepEqual(rows.slice(3).map(row => row.label), names)
})

test('upstream network fallback does not duplicate model nodes', () => {
  const server = { ...serverWithModelNodes(), loss_ct: false, loss_cu: false, loss_cm: false }
  const rows = useServerCardData({ server, sysConfig }).threeNetDetails.value
  assert.deepEqual(rows.map(row => row.key), ['node_1', 'node_2', 'node_3', 'node_4'])
})

test('cards and table use each site model labels before global labels', () => {
  const server = { ...serverWithModelNodes(), node_1_name: 'Site Claude' }
  const rows = useServerCardData({ server, sysConfig }).threeNetDetails.value
  assert.equal(rows.find(row => row.key === 'node_1').label, 'Site Claude')
  assert.equal(getCustomPingItems(server, sysConfig)[0].label, 'Site Claude')
})

test('disabled model probes are omitted without hiding zero packet loss', () => {
  const server = { ...serverWithModelNodes(), ping_node_2: false, loss_node_2: false }
  const rows = useServerCardData({ server, sysConfig }).threeNetDetails.value
  assert.deepEqual(rows.filter(row => row.key.startsWith('node_')).map(row => row.key), ['node_1', 'node_3', 'node_4'])
  assert.deepEqual(getCustomPingItems(server, sysConfig).map(item => item.key), ['node_1', 'node_3', 'node_4'])
})
