#!/usr/bin/env node
/** Real bundle / computed styles, four schemes. No dependency or DSH restart. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { connect, evaluate, findPage, launchChrome, scratch, seedSource, serve, sleep, stageClient, until, screenshot } from './lib/harness.mjs'

const root = new URL('../', import.meta.url).pathname
const out = resolve(process.argv[2] ?? join(root, '.render/optics'))
mkdirSync(out, { recursive: true })
if (!process.argv.includes('--inventory-only')) {
const server = await serve(stageClient(join(root, 'lib/client.js')))
const chrome = launchChrome({ port: 9477, profile: scratch('550w-optics-') })
let session
const results = []
try {
  session = await connect((await findPage(9477)).webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  for (const [scheme, rgb] of [['amber','216, 53, 42'],['green','63, 174, 98'],['cyan','63, 159, 184'],['white','156, 156, 156']]) {
    const { identifier } = await session.send('Page.addScriptToEvaluateOnNewDocument', { source: seedSource({mode:'full',variant:'550w',scheme}) })
    await session.send('Page.navigate', { url: server.origin + '/index.html' })
    await until(session, `return document.querySelector('.dsh550c-host')?.shadowRoot.querySelector('#scene')?.dataset.phase ?? null`, v=>v==='a1-moonrise')
    const popup = await evaluate(session, `
      const s=document.querySelector('.dsh550c-host').shadowRoot;
      const p=s.querySelector('.win-popup');
      return {shadow:getComputedStyle(p).boxShadow,head:getComputedStyle(p.querySelector('.wp-title')).backgroundImage,
        title:getComputedStyle(p.querySelector('.wp-name')).textShadow};`)
    assert.equal(popup.shadow.match(/rgba?\(/g)?.length, 4)
    assert(popup.head.includes('linear-gradient') && popup.title.includes('8px'))
    await sleep(1250)
    const density = await evaluate(session, `
      const s=document.querySelector('.dsh550c-host').shadowRoot;
      const bus=s.querySelector('#term-bus'), range=s.querySelector('.range');
      const clip=bus.getBoundingClientRect(), r=range.getBoundingClientRect();
      return {core:s.querySelector('#term-core').childElementCount,bus:bus.childElementCount,
        visibleBus:[...bus.children].filter(n=>{const b=n.getBoundingClientRect();return b.top>=clip.top&&b.bottom<=clip.bottom}).length,
        range:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},
        ticks:s.querySelectorAll('.scale-tick').length,
        staticGrid:[...s.querySelectorAll('.graticule,.range,.base')].every(n=>getComputedStyle(n).animationName==='none')};`)
    assert(density.core >= 5 && density.visibleBus >= 14)
    assert.equal(density.ticks, 72)
    assert(density.staticGrid && density.range.bottom <= 1080)
    await until(session, `return document.querySelector('.dsh550c-host')?.shadowRoot.querySelector('#scene')?.dataset.phase ?? null`, v=>v==='b3-owned')
    await sleep(650)
    const optics = await evaluate(session, `
      const s=document.querySelector('.dsh550c-host').shadowRoot;
      const f=s.querySelector('.w-final'), cs=getComputedStyle(f), r=f.getBoundingClientRect();
      const led=getComputedStyle(s.querySelector('.led'));
      return {shadow:cs.boxShadow,textShadow:cs.textShadow,width:r.width,copy:f.textContent.trim(),
        background:cs.backgroundColor,color:cs.color,earthPlume:getComputedStyle(s.querySelector('.planet-plume')).opacity,
        cardPlume:getComputedStyle(s.querySelector('.earth-plume')).opacity,
        led:{width:led.width,height:led.height,radius:led.borderRadius,shadow:led.boxShadow},
        clip:{x:r.x-110,y:r.y-110,width:r.width+220,height:r.height+220,scale:1}};`)
    assert(optics.shadow.includes('232, 160, 32') && optics.textShadow.includes('232, 160, 32'))
    assert.equal(optics.copy, '接入成功')
    assert.equal(optics.background, 'rgb(10, 8, 5)')
    assert.equal(optics.color, 'rgb(255, 192, 67)')
    assert.equal(optics.earthPlume, '1')
    assert.equal(optics.cardPlume, '1')
    assert(Math.abs(optics.width - 1144.8) < 1)
    assert.equal(optics.led.width, '6px')
    assert.equal(optics.led.radius, '50%')
    await screenshot(session, join(out, 'scheme-' + scheme + '.png'))
    if (scheme === 'amber') {
      const {data}=await session.send('Page.captureScreenshot',{format:'png',clip:optics.clip})
      writeFileSync(join(out,'09-final-closeup.png'),Buffer.from(data,'base64'))
    }
    results.push({scheme,pass:true,density,optics,popup})
    console.log(`PASS ${scheme}: workbench accent rgba(${rgb}); 550C amber final + blue Earth ignition; core=${density.core}, visible bus=${density.visibleBus}, scale=${density.ticks}; final=${optics.width.toFixed(1)}px`)
    await session.send('Page.removeScriptToEvaluateOnNewDocument', {identifier})
  }
  writeFileSync(join(out,'four-schemes.json'),JSON.stringify(results,null,2)+'\n')
} finally {
  session?.close()
  chrome.kill()
  await server.close()
}
}

// Literal grep occurrences, including repeating-linear-gradient and both
// keyframe endpoints. Optical recipes point to the immutable source's lines.
const w = readFileSync(join(root,'src/variants/550w/assets.js'),'utf8')
const c = readFileSync(join(root,'assets/550C-source.html'),'utf8')
const names=['linear-gradient','text-shadow','box-shadow','filter:drop-shadow']
const count = (s,k) => s.split(k).length-1
const recipe = line => {
  if(line.includes('repeating-linear')) return '550C:12 CRT scanlines (neutral-black remap; a0 unchanged)'
  if(line.includes('glowW')) return '550C:25 frozen white wordmark glow'
  if(line.includes('glowR')) return '550C:26 frozen accent wordmark glow'
  if(line.includes('#hud-top{')) return '550C:36 HUD top gradient'
  if(line.includes('#hud-bot{')) return '550C:79 HUD bottom gradient'
  if(line.includes('.brand{')) return '550C:37 brand glow'
  if(line.includes('ledPulse')) return '550C:50 6px LED / 6px glow / 1.2s pulse'
  if(line.includes('inset 0 0 30px')) return '550C:44 panel inset glow'
  if(line.includes('drop-shadow(0 0 3px')) return '550C:72 site icon glow'
  if(line.includes('drop-shadow(0 0 6px')) return '550C:75 active site icon glow'
  if(line.includes('0 24px 70px')) return '550C:87 popup four-layer shadow (next source line completes it)'
  if(line.includes('.wp-title{')) return '550C:92 popup title gradient'
  if(line.includes('.wp-name{')) return '550C:37 brand/title glow, applied to popup title'
  if(line.includes('.wp-meter .big{')) return '550C:135 large numeric glow'
  if(line.includes('#b-count')) return '550C:137 accent countdown glow (brief alpha .8)'
  if(line.includes('.wp-status{')) return '550C:129 status gradient'
  if(line.includes('0 0 80px')||line.includes('0 0 14px rgba(var(--acc-glow),.95)')) return '550C:140 final three-layer shadow / two text shadows'
  if(line.includes('0 0 20px 4px')) return '550C:142 final side-column glow'
  if(line.includes('background:linear-gradient')) return '550C:49 panel-head gradient'
  return '550C:37 title glow'
}
const lines=w.split('\n')
const rows=lines.flatMap((line,i)=>names.some(k=>line.includes(k))?[`| assets.js:${i+1} | ${names.filter(k=>line.includes(k)).join(' / ')} | ${recipe(line)} | \`${(line.trim()+(line.includes('box-shadow:')&&line.trim().endsWith(',')?' '+lines[i+1].trim():'' )).replaceAll('|','\\|')}\` |`]:[])
const report = '# 光学清单\n\n计数口径：字面匹配（含 repeating-linear-gradient、keyframe 两端；不是 DOM 实例数）。550C 含按钮/波形/hover 等未在本机使用的组件，所以不为凑数量移植无关项。\n\n| 属性 | 550W | 550C |\n|---|---:|---:|\n'+names.map(k=>`| ${k} | ${count(w,k)} | ${count(c,k)} |`).join('\n')+'\n\n| grep 定位 | 属性 | 550C 配方定位 | 原文 |\n|---|---|---|---|\n'+rows.join('\n')+'\n\n补充：全界面暗角为 radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.88) 100%)（550C:13）；月盘径向体积是本轮明确要求的新增项。常规辉光保持灰阶和本机 accent；结尾横幅专用 550C 琥珀，地球及发动机卡片羽流专用淡蓝。\n'
writeFileSync(join(out,'optical-inventory.md'),report)
console.log(process.argv.includes('--inventory-only') ? 'PASS: optical-inventory.md refreshed' : 'PASS: all four schemes; optical-inventory.md and full-screen scheme PNGs written')
