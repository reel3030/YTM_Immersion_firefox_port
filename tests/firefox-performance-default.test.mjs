import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const namespace = read('src/js/module/namespace.js')
const lyricsUi = read('src/js/module/lyrics-ui.js')
const css = read('src/css/style.css')

const firefoxExpression = namespace.match(/const IS_FIREFOX = (.+);/)

test('Firefox は軽量モードを既定にし、他のブラウザーは従来どおり', () => {
  assert.ok(firefoxExpression, 'Firefox 判定が必要')
  const isFirefox = new Function('navigator', `return ${firefoxExpression[1]}`)
  assert.equal(isFirefox({ userAgent: 'Mozilla/5.0 Firefox/140.0' }), true)
  assert.equal(isFirefox({ userAgent: 'Mozilla/5.0 Chrome/140.0.0.0' }), false)
  assert.equal(isFirefox(undefined), false)
  assert.match(namespace, /lowCpuMode: IS_FIREFOX,/)
})

test('保存済みの設定で Firefox の軽量モード既定値を上書きできる', () => {
  assert.match(lyricsUi, /async function restoreLowCpuPreference\(\)/)
  assert.match(lyricsUi, /if \(IS_FIREFOX && firefoxPerformanceInitialized !== true\)/)
  assert.match(lyricsUi, /else if \(savedLowCpuMode !== null\) \{\s*config\.lowCpuMode = !!savedLowCpuMode;/)
  assert.equal((lyricsUi.match(/await restoreLowCpuPreference\(\);/g) || []).length, 2)
})

test('既存 Firefox には一度だけ軽量設定を適用し、以降は利用者の選択を尊重する', async () => {
  const start = lyricsUi.indexOf('async function restoreLowCpuPreference()')
  const end = lyricsUi.indexOf('\nasync function initSettings()', start)
  const restoreSource = lyricsUi.slice(start, end)
  const makeRestore = (config, values, isFirefox) => {
    const storage = {
      async get(key) { return values.get(key) ?? null },
      async set(key, value) { values.set(key, value) },
    }
    return new Function('config', 'storage', 'IS_FIREFOX', `${restoreSource}; return restoreLowCpuPreference`)(config, storage, isFirefox)
  }

  const values = new Map([['ytm_low_cpu_mode', false]])
  const config = { lowCpuMode: false }
  await makeRestore(config, values, true)()
  assert.equal(config.lowCpuMode, true)
  assert.equal(values.get('ytm_low_cpu_mode'), true)

  values.set('ytm_low_cpu_mode', false)
  await makeRestore(config, values, true)()
  assert.equal(config.lowCpuMode, false)

  const chromeConfig = { lowCpuMode: false }
  await makeRestore(chromeConfig, values, false)()
  assert.equal(chromeConfig.lowCpuMode, false)
})

test('軽量モードでは背景アニメーションと高コストのぼかしを止める', () => {
  assert.match(css, /body\.ytm-custom-layout\.ytm-lightweight-mode #ytm-custom-bg \{\s*animation: none !important;/)
  assert.match(css, /body\.ytm-custom-layout\.ytm-lightweight-mode ytmusic-player-bar,[\s\S]*?backdrop-filter: none !important;/)
  assert.match(lyricsUi, /config\.lowCpuMode \? LYRIC_LIGHT_FRAME_MS : LYRIC_FRAME_MS/)
  assert.match(lyricsUi, /const LYRIC_LIGHT_FRAME_MS = 1000 \/ 30;/)
})
