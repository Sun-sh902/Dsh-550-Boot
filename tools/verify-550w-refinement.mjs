#!/usr/bin/env node
/** Quantified layout/typography audit against the shipped bundle; no DSH restart. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { connect, evaluate, findPage, launchChrome, scratch, seedSource, serve, sleep, stageClient, until, screenshot } from './lib/harness.mjs'

const root = new URL('../', import.meta.url).pathname
const args = process.argv.slice(2)
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const out = resolve(option('--out', join(root, '.render/refinement')))
const baseline = option('--baseline', null)
const port = Number(option('--port', '9352'))
const [width, height] = option('--viewport', '1920x1080').split('x').map(Number)
mkdirSync(out, { recursive: true })
const assets = readFileSync(join(root, 'src/variants/550w/assets.js'), 'utf8')
const show = readFileSync(join(root, 'src/variants/550w/show.js'), 'utf8')
const authoredWindows = source => source.slice(source.indexOf('    <div class="popup" data-p="target">'), source.indexOf('  <div id="hud-bot">'))
const hash = value => createHash('sha256').update(value).digest('hex')
const freeze = { windows: hash(authoredWindows(assets)) }
if (baseline !== null) {
  const previous = readFileSync(join(baseline, 'assets.js'), 'utf8')
  assert.equal(authoredWindows(assets), authoredWindows(previous), 'six authored windows changed')
  const previousShow = readFileSync(join(baseline, 'show.js'), 'utf8')
  for (const name of ['BEAT_550W', 'DWELL_550W']) {
    const block = source => new RegExp('const ' + name + ' = [\\s\\S]*?\\n[}\\]]').exec(source)[0]
    assert.equal(block(show), block(previousShow), name + ' changed')
    freeze[name] = hash(block(show))
  }
  const bootCSS = source => source.slice(source.indexOf('  /* ===== 开机动画'), source.indexOf('  /* ===== 主界面骨架'))
  assert.equal(bootCSS(assets), bootCSS(previous), 'shared opening CSS changed')
}
assert(!/@keyframes\s+(winScan|scanDown)|\.win-popup::after|\.param\s+\.scan/.test(assets), 'vertical scan remains')

const server = await serve(stageClient(join(root, 'lib/client.js')))
const chrome = launchChrome({ port, profile: scratch('550w-refinement-') })
let session
const result = { viewport: [width, height], freeze, shots: [], failures: [], typography: [], strokes: [], svg: [] }
try {
  session = await connect((await findPage(port)).webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: seedSource({ mode: 'full', variant: '550w', scheme: 'amber' }) + `
    window.__refinement = {collisions:[],activeWindows:{},fonts:{},strokes:{},unsafeLoops:[],svg:null};
    const liveFrames=new Set(),nativeFrame=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{const id=nativeFrame(t=>{liveFrames.delete(id);callback(t)});liveFrames.add(id);return id};
    window.cancelAnimationFrame=id=>{liveFrames.delete(id);nativeCancel(id)};
    window.__refinementFrames=liveFrames;
    const rect = r => ({x:r.x,y:r.y,w:r.width,h:r.height});
    const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
    const inspect = () => {
      const s = document.querySelector('.dsh550c-host')?.shadowRoot;
      if (s) {
        const app=s.querySelector('#app'), phase=s.querySelector('#scene')?.dataset.phase;
        const panels=[...s.querySelectorAll('.w,.win-popup')].map(n=>({text:n.id||n.closest('.popup')?.dataset.p,r:rect(n.getBoundingClientRect())}));
        for(const label of s.querySelectorAll('.lab')) {
          const r=rect(label.getBoundingClientRect());
          for(const panel of panels) if(overlap(r,panel.r)) window.__refinement.collisions.push({phase,label:label.textContent,panel:panel.text,r});
        }
        for(const n of s.querySelectorAll('#app *, .win-popup *')) {
          const text=[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim());
          if(!text) continue;
          const cs=getComputedStyle(n), raw=parseFloat(cs.fontSize);
          let screen=raw;
          // SVG font-size is in user units; compare physical base size before the camera transform.
          if(n instanceof SVGElement) screen=raw * (Math.min(innerWidth,innerHeight)*.68/400);
          const key=screen.toFixed(2);
          window.__refinement.fonts[key] ??= [];
          const selector=n.tagName.toLowerCase()+'.'+n.getAttribute('class');
          if(!window.__refinement.fonts[key].includes(selector)) window.__refinement.fonts[key].push(selector);
        }
        for(const n of s.querySelectorAll('#app *, .win-popup *')) {
          const cs=getComputedStyle(n);
          if(n instanceof SVGElement && cs.stroke!=='none') window.__refinement.strokes[parseFloat(cs.strokeWidth)]='SVG';
          for(const edge of ['Top','Right','Bottom','Left']) if(cs['border'+edge+'Style']!=='none') window.__refinement.strokes[parseFloat(cs['border'+edge+'Width'])]='border';
        }
        for(const p of s.querySelectorAll('.popup')) {
          const name=p.dataset.p, status=p.querySelector('.wp-status');
          const data=window.__refinement.activeWindows[name]??={clocks:[],progress:[],logs:[]};
          const clock=status.querySelector('.wp-elapsed')?.textContent;
          const progress=status.querySelector('.wp-prog .f')?.style.transform;
          const logs=[...p.querySelectorAll('.wp-log .ll')].filter(n=>n.style.opacity!=='0').length;
          if(clock&&!data.clocks.includes(clock)) data.clocks.push(clock);
          if(progress&&!data.progress.includes(progress)) data.progress.push(progress);
          if(!data.logs.includes(logs)) data.logs.push(logs);
        }
        for(const animation of app.getAnimations({subtree:true})) {
          const effect=animation.effect, timing=effect.getTiming(), target=effect.target;
          if(timing.iterations!==Infinity || timing.duration>=2500 || !effect.getKeyframes().some(k=>'opacity' in k)) continue;
          const cs=getComputedStyle(target);
          const tiny=(target.matches('.led')||effect.pseudoElement==='::before'&&target.matches('.live'))&&parseFloat(cs.width)<=8&&parseFloat(cs.height)<=8;
          // REC's pseudo-element is 6x6; its parent is text, so inspect the pseudo style.
          const led=target.matches('.live')&&effect.pseudoElement==='::before'&&parseFloat(getComputedStyle(target,'::before').width)<=8&&parseFloat(getComputedStyle(target,'::before').height)<=8;
          if(!tiny&&!led) window.__refinement.unsafeLoops.push(target.className);
        }
      }
      if(performance.now()<18500) setTimeout(inspect,50);
    }; setTimeout(inspect,0);
  ` })
  await session.send('Page.navigate', { url: server.origin + '/index.html' })
  await until(session, `return document.readyState==='interactive'||document.readyState==='complete'`, v=>v)
  const started = Date.now()
  for (const at of [1900, 3700, 5200, 8200, 9700, 11600, 13350, 14500]) {
    await sleep(Math.max(0, at - (Date.now() - started)))
    const shot = await evaluate(session, `
      const s=document.querySelector('.dsh550c-host').shadowRoot;
      const round=n=>Math.round(n*100)/100;
      const rect=n=>{const r=n.getBoundingClientRect();return {x:round(r.x),y:round(r.y),w:round(r.width),h:round(r.height)}};
      const labels=[...s.querySelectorAll('.lab:not([data-layout-hidden])')].map(n=>({text:n.textContent,rect:rect(n),nowrap:getComputedStyle(n).whiteSpace==='nowrap'}));
      const fill = (panel,blocks) => {
        const p=s.querySelector(panel),r=p.getBoundingClientRect();
        const occupied=blocks.reduce((sum,selector)=>sum+[...p.querySelectorAll(selector)].reduce((total,n)=>{
          const b=n.getBoundingClientRect(); const clip=n.closest('.terminal')?.getBoundingClientRect();
          return total+Math.max(0,Math.min(b.bottom,r.bottom-parseFloat(getComputedStyle(p).paddingBottom),clip?.bottom??Infinity)-Math.max(b.top,r.top,clip?.top??-Infinity));
        },0),0);
        return {panelHeight:round(r.height),occupied:round(occupied),percent:round(occupied/r.height*100),padding:getComputedStyle(p).padding};
      };
      return {phase:s.querySelector('#scene').dataset.phase,labels,
        panels:[...s.querySelectorAll('.w,.win-popup')].map(n=>({id:n.id||n.closest('.popup')?.dataset.p,rect:rect(n)})),
        fill:{engine:fill('#w-engine',['.w-head','.engine-pair','.engine-data','.engine-spec','.array-count']),
          core:fill('#w-term',['.w-head','.terminal .ln']),bus:fill('#w-bus',['.w-head','.terminal .ln','.plan'])},
        banner:rect(s.querySelector('.w-final')),
        ignition:{earthOpacity:+getComputedStyle(s.querySelector('.planet-plume')).opacity,
          cardOpacity:+getComputedStyle(s.querySelector('.earth-plume')).opacity,
          count:s.querySelector('#earth-engine-count').textContent},
        finalStyle:(()=>{const c=getComputedStyle(s.querySelector('.w-final'));return {
          fontFamily:c.fontFamily,color:c.color,background:c.backgroundColor,borderTop:c.borderTopColor,
          borderBottom:c.borderBottomColor,padding:c.padding,fontSize:c.fontSize,
          letterSpacing:c.letterSpacing,fontWeight:c.fontWeight}})()};`)
    shot.at = at
    result.shots.push(shot)
    await screenshot(session, join(out, String(at).padStart(5, '0') + 'ms.png'))
  }
  await sleep(Math.max(0, 15000 - (Date.now() - started)))
  const fullBanner = await evaluate(session, `
    const r=document.querySelector('.dsh550c-host').shadowRoot.querySelector('.w-final').getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height};`)
  const { data } = await session.send('Page.captureScreenshot', {
    format: 'png', clip: { x:fullBanner.x-100,y:fullBanner.y-100,width:fullBanner.w+200,height:fullBanner.h+200,scale:1 },
  })
  writeFileSync(join(out, '09-final-closeup.png'), Buffer.from(data, 'base64'))
  result.audit = await evaluate(session, `return window.__refinement`)
  result.svg = await evaluate(session, `
    const s=document.querySelector('.dsh550c-host').shadowRoot, rows=[];
    for(const svg of s.querySelectorAll('#app svg')) {
      const vb=svg.viewBox.baseVal, failures=[], coordinates=[];
      for(const n of svg.querySelectorAll('path,line,circle,ellipse,text')) {
        for(const key of ['x','y','x1','x2','y1','y2','cx','cy']) if(n.hasAttribute(key)) {
          const value=parseFloat(n.getAttribute(key));coordinates.push({tag:n.tagName,class:n.getAttribute('class'),key,value});
          if(value<0||value>400) failures.push({key,value});
        }
        if(n.tagName!=='text') {
          const b=n.getBBox(), matrix=svg.getScreenCTM().inverse().multiply(n.getScreenCTM());
          for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]) {
            const p=new DOMPoint(x,y).matrixTransform(matrix);
            if(p.x<vb.x-.05||p.y<vb.y-.05||p.x>vb.x+vb.width+.05||p.y>vb.y+vb.height+.05) failures.push({class:n.getAttribute('class'),point:[p.x,p.y]});
          }
        }
      }
      rows.push({viewBox:svg.getAttribute('viewBox'),coordinates,failures});
    }
    const ticks=[...s.querySelectorAll('.scale-label')].map(n=>({value:n.textContent,x:+n.getAttribute('x'),y:+n.getAttribute('y')}));
    const moon=s.querySelector('.moon-disc'),earth=s.querySelector('.earth-disc');
    return {rows,ticks,distance:s.querySelector('#distance-line').getAttribute('d'),
      moon:[+moon.getAttribute('cx'),+moon.getAttribute('cy')],earth:[+earth.getAttribute('cx'),+earth.getAttribute('cy')],
      moonLabels:s.querySelectorAll('.lab[data-p="a1-moonrise"]').length,
      busLabels:[...s.querySelectorAll('.lab')].filter(n=>n.textContent.includes('CONTROL BUS')).length};`)
  result.typography = Object.keys(result.audit.fonts).map(Number).sort((a,b)=>a-b)
  result.strokes = Object.keys(result.audit.strokes).map(Number).sort((a,b)=>a-b)
  const fail = (condition,message) => { if(!condition) result.failures.push(message) }
  fail(result.audit.collisions.length===0, 'label/panel intersections')
  fail(result.audit.unsafeLoops.length===0, 'large opacity loop under 2.5 s')
  if(width===1920&&height===1080) {
    for(const target of [9,9.5,10.5,12,13]) {
      fail(result.typography.some(size=>Math.abs(size-target)<=.5),
        '550C typography level '+target+' px has no 550W counterpart')
    }
  }
  fail(result.strokes.every(n=>[1,1.5,2].includes(n)), 'fourth line width')
  fail(result.svg.rows.every(row=>row.failures.length===0), 'SVG outside viewBox')
  fail(result.svg.moonLabels===1 && result.svg.busLabels===0, 'duplicate annotation')
  for(const [name,data] of Object.entries(result.audit.activeWindows)) {
    fail(data.clocks.length>=5&&data.progress.length>=5, name+' stopwatch/progress is not live')
    if(['link','priv'].includes(name)) fail(data.logs.length>=2,name+' log is not sequential')
  }
  const a1=result.shots.find(shot=>shot.at===3700)
  for(const [name,data] of Object.entries(a1.fill)) fail(data.percent>=70,name+' fill below 70%')
  const b1=result.shots.find(shot=>shot.at===11600)
  const b2=result.shots.find(shot=>shot.at===13350)
  const b3=result.shots.find(shot=>shot.at===14500)
  fail(b1.ignition.earthOpacity===0&&b1.ignition.cardOpacity===0,'plume lit before b2')
  fail(b2.ignition.earthOpacity>.9&&b2.ignition.cardOpacity>.9&&b2.ignition.count==='10,000','b2 ignition incomplete')
  fail(b3.ignition.earthOpacity===1&&b3.ignition.cardOpacity===1,'plume extinguished before end')
  fail(b3.finalStyle.color==='rgb(255, 192, 67)'&&b3.finalStyle.background==='rgb(10, 8, 5)'&&
    b3.finalStyle.borderTop==='rgb(232, 160, 32)'&&b3.finalStyle.borderBottom==='rgb(232, 160, 32)',
    'final banner differs from 550C amber')
  await until(session, `return document.querySelector('.dsh550c-host')===null`, v=>v, {timeout:6000})
  await sleep(150)
  result.liveFramesAfterExit=await evaluate(session, `return window.__refinementFrames.size`)
  fail(result.liveFramesAfterExit===0,'requestAnimationFrame outlived overlay')
  writeFileSync(join(out,'layout-audit.json'),JSON.stringify(result,null,2)+'\n')
  console.log('frozen window content / timeline / dwell: PASS',freeze)
  console.log('typography (physical base px; SVG user-unit compensation):',result.typography.join(' / '))
  console.log('line widths:',result.strokes.join(' / '))
  console.log('all-run sampled label/panel intersections:',result.audit.collisions.length)
  console.log('SVG out-of-viewBox:',result.svg.rows.flatMap(row=>row.failures).length)
  console.log('unsafe <2.5s opacity loops:',result.audit.unsafeLoops.length,'/ live rAF after exit:',result.liveFramesAfterExit)
  console.log('a1 panel fill (actual occupied blocks, EXCLUDES empty flex space/padding/gaps):',Object.entries(a1.fill).map(([k,v])=>k+' '+v.percent+'%').join(' / '))
  console.log('plume b1/b2/b3:',[b1,b2,b3].map(s=>s.phase+' '+s.ignition.earthOpacity+'/'+s.ignition.cardOpacity+' COUNT '+s.ignition.count).join('; '))
  console.log('final style:',b3.finalStyle)
  console.log('all six window stopwatches/progress + link/priv sequential logs:',Object.entries(result.audit.activeWindows).map(([name,data])=>name+': '+data.clocks.length+' clock values / '+data.progress.length+' progress values / log steps '+data.logs.join(',')).join('; '))
  assert.deepEqual(result.failures,[])
  console.log('PASS: eight full-screen shots + final closeup + layout-audit.json')
} finally {
  session?.close()
  chrome.kill()
  await server.close()
}
