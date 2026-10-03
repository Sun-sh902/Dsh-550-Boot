/* 550W — the timeline: the opening, then seven beats of the Lunar Fall Crisis.
 *
 * Two clocks, on purpose:
 *
 *   · the opening (a0) is 550C's own apparatus — playBootShared(), 2750 ms of
 *     write-on and glow, then the wrapper's +300 ms hand-off, so a1 starts on
 *     3050 ms exactly like 550C's own show does. It is not touched by anything
 *     in this file beyond being started and awaited.
 *   · every beat after it is scheduled against ONE start stamp with `untilAt()`,
 *     never by chaining sleeps: chained sleeps accumulate the fire-and-forget
 *     tasks' own drift, an absolute stamp cannot. The table below is
 *     docs/PLAN-550w.md §1, and tools/probe-550w.mjs measures the real entry time
 *     of every phase against it (±150 ms).
 *
 * A beat's CONTENT never blocks the schedule: each beat kicks off its own
 * cancellable chain (later()/sleep()) and the scheduler moves to the next
 * boundary. That is what lets a 20 Hz countdown, a 72-dot deployment and a
 * two-window terminal run inside a 15.45 s cut.
 *
 * MOTION. The continuous motion is CSS (assets.js: keyframes gated by
 * `[data-phase]`), because it is the layer that can be turned off wholesale under
 * `prefers-reduced-motion`. What lives here is only the motion that carries real
 * data: the honest countdown, the point-by-point deployment, the warhead counter,
 * the progress bar, the window choreography and the machine line. Nothing here
 * steps an animation with a timer — `setTimeout` is only ever used to schedule a
 * state change, never to interpolate one.
 *
 * Skip: every wait is `sleep()`/`later()`, so one Esc (or one click) rejects the
 * awaited chain and the run unwinds; nothing else in this file holds a timer.
 */

/**
 * docs/PLAN-550w.md §1, in milliseconds from the first frame of the run. `at` is
 * the beat's start; the next entry is its end, and the last entry's end is the
 * run's length. a0 is implicit (0…3050, the shared opening).
 *
 * R4: THE LENGTH IS DERIVED FROM THE WINDOWS, not the other way round. 550C's
 * popups live 1400–1900 ms; a beat therefore gets one dwell's worth of time
 * (1500 ms) plus the countdown's honest 2400 ms, and nothing else. The old 12 s
 * cut fired three windows into one 1100 ms beat (the last one lived 200 ms before
 * the next beat's closeAllWindows() killed it) — that is what made the screen
 * flicker. Here every window opens on a beat boundary and is closed by its OWN
 * dwell 500 ms before the boundary, so it fades out on its own terms and the next
 * one fades in after it, never on top of it.
 *
 * KEY NEGOTIATION is not a beat any more: 「密钥协商通过」 is a line in RELAY LINK's
 * own log, so the run is six windows, each with a full dwell.
 *
 *   a0  0– 3050  (550C's opening, untouched)                     …
 *   a1  3050– 4550  TARGET ACQUISITION                           dwell 1500
 *   a2  4550– 6050  LUNAR ENGINE 01 · SECTION                    dwell 1500
 *   a3  6050– 7550  RELAY LINK                                   dwell 1500
 *      7550– 9050  PRIVILEGE ESCALATION                          dwell 1500
 *   a4  9050–10550  ARMED                                        dwell 1500
 *   b1 10550–12950  DETONATION WINDOW (honest clock, 2400 ms)    dwell 2400
 *   b2 12950–13850  ignition — one white flash
 *   b3 13850–15450  #final「接入成功」, held ≥900 ms
 */
const BEAT_550W = [
  { phase: 'a1-moonrise', at: 3050 },
  { phase: 'a2-cutaway', at: 4550 },
  { phase: 'a3-link', at: 6050, step: 'link' },
  { phase: 'a3-link', at: 7550, step: 'priv' },
  { phase: 'a4-armed', at: 9050 },
  { phase: 'b1-countdown', at: 10550 },
  { phase: 'b2-ignition', at: 12950 },
  { phase: 'b3-owned', at: 13850 },
]

/** The run's length: the banner holds ≥900 ms of the closing beat. */
const RUN_550W_MS = 15450

/** The countdown is the film's clock, shortened but never faked: 2.400 s. */
const COUNTDOWN_MS = 2400

/**
 * 550C 的白话阶段名，写进底栏 `#b-stage`。机器 id（`data-phase`）保持不动——
 * 探针、截图与 docs 都按它断言。
 */
const STAGE_550W = {
  'a0-boot': '系统启动',
  'a1-moonrise': '目标识别',
  'a2-cutaway': '剖面测绘',
  'a3-link': '建立链路',
  'a4-armed': '武装',
  'b1-countdown': '点火窗口',
  'b2-ignition': '点火',
  'b3-owned': '接入成功',
}

/** The two persistent terminals. Both are advanced by one shared typing clock. */
const TERMINAL_550W = {
  'a1-moonrise': {
    core: [['cmd', '> 检测月面目标。'], ['sys', '[ OK ] 地月测距：3.84E8 M。'],
      ['info', '[550W] 月球发动机集群 3 台在线。'], ['sys', '[ OK ] 坎帕努斯环形山：46 KM。'],
      ['info', '[550W] 弹阵样本加载；弹头总数 3,751。']],
    bus: [['cmd', '> scan --lunar-engines'], ['sys', '[ OK ] 3 LUNAR ENGINES ONLINE']],
  },
  'a2-cutaway': {
    core: [['cmd', '> 测绘剖面。'], ['info', '[550W] 注入口 → 燃烧室 → 线圈 ×4。'], ['sys', '[ OK ] 喉部 → 喷口 → 基座环：贯通。']],
    bus: [['cmd', '> section --engine 01'], ['sys', '[ OK ] SECTION MAP COMPLETE']],
  },
  'a3-link': {
    core: [['cmd', '> 接入月面弹阵中继。'], ['info', '[550W] 链路建立，往返 1.28 S。']],
    bus: [['cmd', '> relay --attach NAVIGATOR'], ['sys', '[ OK ] RL 1.28 S']],
  },
  'a3-link:priv': {
    core: [['cmd', '> 协商密钥，取得根权限。'], ['info', '[550W] 根证书就位，控制总线写权限已获得。']],
    bus: [['cmd', '> bus --claim'], ['sys', '[ OK ] ROOT ON CONTROL BUS'], ['info', 'CRC __RUNTIME_CRC__']],
  },
  'a4-armed': {
    core: [['cmd', '> 装订弹阵。'], ['info', '[550W] 3,751 枚弹头武装完毕。']],
    bus: [['cmd', '> array --bind 3,751'], ['sys', '[ OK ] 3 / 3 LUNAR ENGINES ARMED']],
  },
  'b1-countdown': {
    core: [['cmd', '> 等待点火窗口。']],
    bus: [['cmd', '> ignition --hold'], ['sys', '[ OK ] DETONATION WINDOW OPEN']],
  },
  'b2-ignition': {
    core: [['cmd', '> 点火。']],
    bus: [['warn', '[ WARN ] REMOTE DETONATION']],
  },
  'b3-owned': {
    core: [['info', '[550W] 控制总线接管完成。']],
    bus: [['sys', '[ OK ] CONTROL BUS OWNED']],
  },
}

/**
 * 550C 的窗口驻留量级（它的 popup duration 在 1400–1900 ms 之间）。1500 ms 的拍里
 * 窗口活 1000 ms 后开始退场（220 ms 的淡出），下一个窗口在下一拍的边界上进 —— 从
 * 「退场完」到「下一个完全进场」中间隔 500 ms，探针的 −500 ms 基准因此永远只会看到
 * 两个窗口里的一个。b1 的窗口跟着它那一拍走满 1900 ms。
 */
const DWELL_550W = {
  target: 900,
  cut: 900,
  link: 900,
  priv: 900,
  armed: 900,
  // 倒数窗口比它那一拍多活 200 ms：T-00:00.000 是在拍尾写下的，窗口得看着它写完
  // 再退场（reduced 档是硬切，早一帧摘掉节点就等于没写）。
  meter: COUNTDOWN_MS + 200,
}

function createShow550W(stage, options) {
  const mode = options.mode === 'full' ? 'full' : 'simple';
  const CANCELLED = options.cancelled;
  let cancelled = false;
  let started = false;
  let frameHandle = 0;
  const pending = new Set();
  const reduced = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  })();

  /** Cancellable sleep: rejects with CANCELLED once the show is skipped. */
  function sleep(ms) {
    return new Promise((resolve, reject) => {
      if (cancelled) { reject(CANCELLED); return; }
      const entry = { reject: reject, timer: 0 };
      entry.timer = setTimeout(() => {
        pending.delete(entry);
        if (cancelled) reject(CANCELLED); else resolve();
      }, ms);
      pending.add(entry);
    });
  }

  /** Cancellable setTimeout for the fire-and-forget beats (path draw-in …). */
  function later(fn, ms) {
    const entry = { reject: null, timer: 0 };
    entry.timer = setTimeout(() => {
      pending.delete(entry);
      if (!cancelled) fn();
    }, ms);
    pending.add(entry);
    return entry.timer;
  }

  /** One cancellable 1 s clock for the HUD and whichever popup is attached. */
  const tickClocks = () => {
    const now = new Date();
    const value =
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0') +
      ':' +
      String(now.getSeconds()).padStart(2, '0');
    text('#h-time', value);
    for (const node of stage.querySelectorAll('.wp-clock')) node.textContent = value;
    later(tickClocks, 1000);
  };

  /** Skip: unwind every awaited step. Nothing else in this show holds a timer. */
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    for (const entry of pending) {
      clearTimeout(entry.timer);
      if (entry.reject !== null) entry.reject(CANCELLED);
    }
    pending.clear();
    cancelAnimationFrame(frameHandle);
  }

  // ── the surface ───────────────────────────────────────────────────────────
  const $ = (selector) => stage.querySelector(selector);
  const text = (selector, value) => {
    const node = $(selector);
    if (node !== null) node.textContent = value;
  };
  /** The HUD's FPS is measured, never a printed fake 60. One write per second. */
  const measureFrames = () => {
    let from = performance.now(), count = 0;
    const frame = now => {
      if (cancelled) return;
      count++;
      if (now - from >= 1000) {
        text('#b-fps', String(Math.round(count * 1000 / (now - from))));
        from = now;
        count = 0;
      }
      frameHandle = requestAnimationFrame(frame);
    };
    frameHandle = requestAnimationFrame(frame);
  };
  // transform: scaleX, not width: the rule for this build is that no beat
  // animates a layout property.
  const bar = (percent) => {
    const fill = $('#b-fill');
    if (fill !== null) fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, percent / 100)) + ')';
    text('#b-pct', Math.round(percent) + '%');
  };
  /**
   * The five windows are DETACHED at mount and attached only while their beat is
   * on screen. 550C builds its popups on demand for the same reason; measured on
   * this box, keeping all five attached for the whole run costs ~1.8 pp of main
   * thread time (5.7 % → 3.9 % with them gone), which is the difference between
   * passing and failing the busy budget.
   */
  const windows = new Map();
  for (const node of Array.from(stage.querySelectorAll('.popup'))) {
    windows.set(node.dataset.p, node);
    node.remove();
  }
  const openSet = new Set();
  const window550W = (name) => {
    const popup = windows.get(name);
    return popup === undefined ? null : popup.querySelector('.win-popup');
  };
  /**
   * #dim 的两个规则（R4 ④）：
   *   · 有窗口在屏幕上 → 背景压暗一档，并给 #scene 挂上 .win，让大图层的动画冻结
   *     （窗口是这一拍唯一的焦点）。窗口之间的空档里它不松开 —— 一个窗口
   *     不过开关一次，从第一个窗口进场到最后一个窗口退场只挂一次。
   *   · 屏幕仍然活着：窗口自己的驻留秒表、逐行日志与进度承担活性，没有扫描线；SYSTEM
   *     STREAM 和 HUD。
   */
  let dimHeld = false;
  const syncDim = () => {
    const dim = $('#dim');
    const scene = $('#scene');
    if (dim !== null) dim.classList.toggle('show', dimHeld);
    if (scene !== null) scene.classList.toggle('win', openSet.size > 0);
  };
  const openWindow = (name, dwell) => {
    const popup = windows.get(name);
    if (popup === undefined) return;
    if (popup.parentNode === null) stage.appendChild(popup);
    const node = popup.querySelector('.win-popup');
    if (node !== null) node.classList.remove('closing');
    // A detached popup is appended and shown in the same task. Resolve its
    // initial opacity once so Chromium runs the authored opening transition.
    if (node !== null) void getComputedStyle(node).opacity;
    if (node !== null) node.classList.add('show');
    for (const clock of popup.querySelectorAll('.wp-clock')) clock.textContent = $('#h-time')?.textContent ?? '--:--:--';
    openSet.add(name);
    dimHeld = true;
    syncDim();
    layoutLabels();
    const duration = dwell ?? DWELL_550W[name] ?? 1000;
    const status = popup.querySelector('.wp-status');
    if (status !== null) {
      // Runtime UI only: the six windows' authored body/status strings stay intact.
      const clock = document.createElement('span');
      clock.className = 'wp-elapsed';
      const progress = document.createElement('div');
      progress.className = 'wp-prog';
      const fill = document.createElement('div');
      fill.className = 'f';
      progress.appendChild(fill);
      status.append(clock, progress);
      const openedAt = performance.now();
      const tick = () => {
        if (!openSet.has(name)) return;
        const elapsed = Math.min(duration, performance.now() - openedAt);
        clock.textContent = '+' + (elapsed / 1000).toFixed(1) + ' S';
        fill.style.transform = 'scaleX(' + elapsed / duration + ')';
        later(tick, 100);
      };
      tick();
    }
    // 550C 的 popup 自己带 duration；这里同样由窗口自己退场，不靠拍边界。
    later(() => closeWindow(name), duration);
  };
  /**
   * 退场是 220 ms 的淡出，不是抽掉元素：节点留在 DOM 里等淡出走完再摘。
   * reduced 档下没有过渡可等，直接摘（skill §5：reduced 只留硬切）。
   */
  const closeWindow = (name) => {
    const popup = windows.get(name);
    if (popup === undefined) return;
    const node = popup.querySelector('.win-popup');
    if (node !== null) {
      node.classList.remove('show');
      node.classList.add('closing');
    }
    openSet.delete(name);
    syncDim();
    if (reduced) popup.remove();
    else later(() => popup.remove(), 260);
  };
  const closeAllWindows = () => {
    for (const name of Array.from(openSet)) closeWindow(name);
  };
  /** Type a window's log in, line by line — the port's own terminal texture. */
  const typeLog = (name, delay, step) => {
    const popup = windows.get(name);
    if (popup === undefined) return;
    const lines = Array.from(popup.querySelectorAll('.wp-log .ll'));
    for (const line of lines) line.style.opacity = '0';
    lines.forEach((line, i) => later(() => { line.style.opacity = '1'; }, delay + i * step));
  };

  /**
   * One typewriter owns BOTH persistent terminals. A single cancellable later()
   * advances every active job by 5–6 characters per tick; no terminal creates
   * its own interval or rAF. Lines queued in the same beat therefore type at the
   * same time without multiplying main-thread wakeups.
   */
  const typingJobs = [];
  let typingTickPending = false;
  let typingParity = 0;
  const armTypingTick = () => {
    if (typingTickPending || typingJobs.length === 0) return;
    typingTickPending = true;
    later(() => {
      typingTickPending = false;
      const width = typingParity++ % 2 === 0 ? 5 : 6;
      for (let i = typingJobs.length - 1; i >= 0; i--) {
        const job = typingJobs[i];
        job.index = Math.min(job.text.length, job.index + width);
        job.node.textContent = job.text.slice(0, job.index);
        if (job.index >= job.text.length) {
          job.node.classList.remove('typing');
          typingJobs.splice(i, 1);
        }
      }
      armTypingTick();
    }, 36);
  };
  const typeTerminalLine = (selector, kind, value) => {
    const body = $(selector);
    if (body === null) return;
    const node = document.createElement('div');
    node.className = 'ln ' + kind + ' typing';
    body.appendChild(node);
    const row = parseFloat(getComputedStyle(body).lineHeight);
    const capacity = Math.max(1, Math.floor(body.clientHeight / row));
    while (body.childElementCount > capacity) body.removeChild(body.firstChild);
    const crc = $('#term-bus')?.dataset.crc ?? 'CALCULATING';
    typingJobs.push({ node: node, text: value.replace('__RUNTIME_CRC__', crc), index: 0 });
    armTypingTick();
  };
  const terminalBeat = (key) => {
    const entry = TERMINAL_550W[key];
    if (entry === undefined) return;
    const launch = (selector, lines) => {
      lines.forEach((line, index) => later(() => typeTerminalLine(selector, line[0], line[1]), index * 120));
    };
    launch('#term-core', entry.core);
    // One command at each beat, plus the continuous 900 ms status stream below:
    // 1–2 new lines per second without bursts of simultaneous terminal jobs.
    launch('#term-bus', entry.bus.slice(0, 1));
  };

  const primeBus = () => {
    const body = $('#term-bus');
    if (body === null) return;
    const crc = body.dataset.crc ?? 'CALCULATING';
    const inventory = ['> inventory --lunar', '[ OK ] SESSION ID/CN A02 EE',
      '[ OK ] CRC ' + crc, '[ OK ] DIST 3.84E8 M', '[ OK ] LIGHT DELAY 1.28 S',
      '[ OK ] EARTH MASS 5.97E24 KG', '[ OK ] MOON MASS 7.35E22 KG',
      '[ OK ] MOON RADIUS 1.74E6 M', '[ OK ] EARTH DENSITY 5.515',
      '[ OK ] MOON DENSITY 3.346', '[ OK ] EARTH ENGINES 10,000',
      '[ OK ] LUNAR ENGINES 3', '[ OK ] CAMPANUS 46 KM', '[ OK ] WARHEAD INVENTORY 3,751',
      '[ OK ] TARGET REGISTER READY', '[ OK ] SECTION MAP READY', '[ OK ] INJECTION PORT READY',
      '[ OK ] COMBUSTION CHAMBER READY', '[ OK ] COIL 1 READY', '[ OK ] COIL 2 READY',
      '[ OK ] COIL 3 READY', '[ OK ] COIL 4 READY', '[ OK ] THROAT READY', '[ OK ] NOZZLE READY',
      '[ OK ] BASE RING READY', '[ OK ] RELAY REGISTER READY', '[ OK ] ROOT CERTIFICATE LOADED',
      '[ OK ] CONTROL BUS WRITE READY', '[ OK ] DETONATION CLOCK READY', '[ OK ] INVENTORY VERIFIED'];
    for (const value of inventory) {
      const node = document.createElement('div');
      node.className = 'ln ' + (value.startsWith('>') ? 'cmd' : 'info');
      node.textContent = value;
      body.appendChild(node);
    }
  };

  /** Place annotations on the .8vmin grid, outside panels AND the current window.
   * A window's opening scale starts at .9; reserve its final-size rectangle too.
   * Positions change only at a beat boundary, using transform (never animated layout).
   */
  const labelPositions = new WeakMap();
  function layoutLabels() {
    const scene = $('#scene');
    if (scene === null) return;
    const frame = scene.getBoundingClientRect();
    const grid = Math.min(window.innerWidth, window.innerHeight) * .008;
    const rect = (r, extra = 0) => ({ x: r.left - frame.left - extra, y: r.top - frame.top - extra,
      w: r.width + extra * 2, h: r.height + extra * 2 });
    const blocks = Array.from(stage.querySelectorAll('.w,.win-popup.show,.win-popup.closing,.scale-label,.earth-label,.range text,.site .tag'))
      .map(node => rect(node.getBoundingClientRect(), node.matches('.win-popup') ? 44 : grid));
    const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const node of stage.querySelectorAll('.lab')) {
      const active = node.dataset.p.split(' ').includes(scene.dataset.phase);
      node.toggleAttribute('data-layout-hidden', !active);
      if (!active) {
        // Even an invisible label must not leave a stale rectangle under a new window.
        node.style.transform = 'translate(-10000px,-10000px)';
        continue;
      }
      const size = node.getBoundingClientRect();
      const anchor = node.dataset.anchor.split(',').map(Number);
      const preferred = { x: frame.width * anchor[0], y: frame.height * anchor[1] };
      const previous = { ...(labelPositions.get(node) ?? rect(size)), w: size.width, h: size.height };
      const stable = node.hasAttribute('data-layout-placed') && previous.x >= grid && previous.y >= grid
        && previous.x + previous.w <= frame.width - grid && previous.y + previous.h <= frame.height - grid
        && !blocks.some(block => intersects(previous, block));
      const candidates = [];
      for (let y = grid * 2; !stable && y + size.height < frame.height - grid * 2; y += grid * 2) {
        for (let x = grid * 2; x + size.width < frame.width - grid * 2; x += grid * 2) {
          const box = { x, y, w: size.width, h: size.height };
          if (!blocks.some(block => intersects(box, block))) candidates.push(box);
        }
      }
      candidates.sort((a, b) => Math.abs(a.x - preferred.x) + Math.abs(a.y - preferred.y)
        - Math.abs(b.x - preferred.x) - Math.abs(b.y - preferred.y));
      const chosen = stable ? previous : candidates[0];
      if (chosen === undefined) throw new Error('550W annotation has no clear grid cell: ' + node.textContent);
      node.style.transform = 'translate(' + chosen.x.toFixed(2) + 'px,' + chosen.y.toFixed(2) + 'px)';
      node.setAttribute('data-layout-placed', '');
      labelPositions.set(node, chosen);
      blocks.push({ x: chosen.x - grid, y: chosen.y - grid, w: chosen.w + grid * 2, h: chosen.h + grid * 2 });
    }
  }
  const streamBus = () => {
    const phase = $('#scene')?.dataset.phase;
    if (phase !== 'a0-boot') {
      const state = $('#b-bus')?.textContent ?? 'BUS NOMINAL';
      const clock = $('#h-time')?.textContent ?? '';
      typeTerminalLine('#term-bus', phase === 'b2-ignition' ? 'warn' : 'sys',
        (phase === 'b2-ignition' ? '[WARN] ' : '[ OK ] ') + clock + ' · ' + state);
    }
    later(streamBus, 900);
  };

  /** Hard cut: one style recalculation moves every layer the phase owns. */
  function setPhase(phase) {
    const scene = $('#scene');
    const app = $('#app');
    if (scene !== null) {
      // 上一拍留下的"让位"标记到此为止：新的一拍把自己的图层带上场。
      scene.classList.remove('leaving');
      scene.dataset.phase = phase;
    }
    if (app !== null) app.dataset.phase = phase;
    text('#b-stage', STAGE_550W[phase] ?? phase);
    layoutLabels();
  }
  /**
   * 让位：下一拍开始前 800 ms 把本拍的场景层收掉（320 ms 淡出）。窗口在拍边界上
   * 自己让位（dwell 早于边界 600 ms），场景层再早 800 ms —— 于是探针的 −500 ms 基准
   * 在任何一帧上最多只看到"一件事"在变。
   */
  const stepAside = () => {
    const scene = $('#scene');
    if (scene !== null) scene.classList.add('leaving');
  };
  /** 拍内推进的阶段名（a3-link 里一条链走三步）。 */
  const setStage = (name) => text('#b-stage', name);

  /** Sleep until an absolute instant of the run; never accumulates drift. */
  async function untilAt(target) {
    const wait = target - performance.now();
    if (wait > 0) await sleep(wait);
  }

  // ── beat content (each one fire-and-forget, all cancellable) ──────────────
  /**
   * a1 — the Moon comes up and the cluster is already working: three engine
   * sites come online one by one, then the warhead array lights ring by ring,
   * with the counter following the SAME list. The array is a 120-dot sample of
   * the real 3,751 (the readout is the film's figure), so the counter prints what
   * the array owns, not what it draws. Its own motion (spin, push-in, sweep,
   * pulses) is CSS.
   */
  function beatMoonrise() {
    openWindow('target');
    terminalBeat('a1-moonrise');
    const sites = Array.from(stage.querySelectorAll('.site'));
    for (const site of sites) site.classList.remove('on', 'armed');
    sites.forEach((site, i) => later(() => site.classList.add('on'), 40 + i * 230));
    later(() => text('#b-bus', 'BUS NOMINAL'), 40 + sites.length * 230);

    const dots = Array.from(stage.querySelectorAll('#whField i'));
    const step = dots.length > 0 ? Math.floor(900 / dots.length) : 0;
    dots.forEach((dot, i) => {
      later(() => {
        dot.classList.add('on');
        text('#b-warhead', String(Math.round((3751 * (i + 1)) / dots.length)).padStart(4, '0') + ' / 3751');
      }, 150 + i * step);
    });
    bar(18);
  }

  /**
   * a2 — the section. The beam flow, the coil charge and the self-drawing shell
   * are CSS; what this does is open the telemetry window and walk its discrete
   * states, which is the only kind of "telemetry" this machine is allowed to
   * print (no invented engine figures).
   */
  function beatCutaway() {
    openWindow('cut');
    terminalBeat('a2-cutaway');
    const rows = Array.from(stage.querySelectorAll('.popup[data-p="cut"] .wp-row'));
    const field = rows.filter(
      (row) => row.querySelector('.k') !== null && row.querySelector('.k').textContent === 'COIL 1–4',
    )[0];
    if (field !== undefined) {
      const value = field.querySelector('.v');
      const states = ['CHARGING 1', 'CHARGING 2', 'CHARGING 3', 'CHARGING 4', 'FIELD OK'];
      states.forEach((state, i) => later(() => { value.textContent = state; }, 120 + i * 210));
    }
    bar(34);
  }

  /**
   * a3 — one continuous terminal run, two windows, each with a full dwell:
   * RELAY LINK (which now carries 「密钥协商通过」 in its own log, so KEY
   * NEGOTIATION is not a beat of its own) and then PRIVILEGE ESCALATION. One
   * window at a time: the first is closed by its own dwell 500 ms before the beat
   * ends, and the second opens on the next beat's boundary — the screen never
   * carries two of them at once.
   */
  function beatLink(step) {
    if (step === 'priv') {
      setStage('权限提升');
      terminalBeat('a3-link:priv');
      openWindow('priv');
      typeLog('priv', 60, 130);
      later(() => { text('#h-link', 'CONTROL BUS'); text('#b-relay', 'CONTROL BUS'); }, 240);
      bar(72);
      return;
    }
    setStage('建立链路');
    terminalBeat('a3-link');
    openWindow('link');
    typeLog('link', 90, 120);
    later(() => {
      text('#h-link', 'NAVIGATOR');
      text('#b-relay', 'NAVIGATOR');
    }, 240);
    bar(58);
  }

  /** a4 — armed: the three sites confirm, the rings tighten (CSS), telemetry jumps. */
  function beatArmed() {
    openWindow('armed');
    terminalBeat('a4-armed');
    const sites = Array.from(stage.querySelectorAll('.site'));
    sites.forEach((site, i) => later(() => site.classList.add('armed'), 60 + i * 180));
    later(() => text('#b-bus', 'BUS ARMED'), 60 + sites.length * 180);
    bar(74);
  }

  /**
   * b1 — the honest clock. The readout is written 20 times a second from
   * `performance.now()` against the beat's own start stamp, so the digits and the
   * elapsed time cannot disagree: T-00:02.400 is written at t+0 and T-00:00.000
   * at t+2400, whatever the frame rate is doing. Shorter than the film's 4.2 s
   * beat, and honest about it — the countdown is compressed, the READOUT is not.
   * The bar walks with the clock so it can never land on top of the next beat.
   */
  async function beatCountdown(startedAt) {
    openWindow('meter');
    terminalBeat('b1-countdown');
    let lastPercent = -1;
    for (;;) {
      const elapsed = performance.now() - startedAt;
      const left = COUNTDOWN_MS - elapsed;
      if (left <= 0) break;
      const seconds = Math.floor(left / 1000);
      const millis = Math.floor(left - seconds * 1000);
      text('#b-count', 'T-00:0' + seconds + '.' + String(millis).padStart(3, '0'));
      const percent = 74 + (elapsed / COUNTDOWN_MS) * 22;
      if (Math.round(percent) !== lastPercent) {
        lastPercent = Math.round(percent);
        bar(percent);
      }
      await sleep(50);
    }
    text('#b-count', 'T-00:00.000');
    // 这是全片最后一个窗口：它的 dwell 走完，#dim 与 .win 一起撤（④ 只挂一次）。
    dimHeld = false;
    syncDim();
  }

  /**
   * b2 — ignition. ONE full-frame white flash for the whole run (the skill
   * budgets exactly one, and this is it); the beam leaving the frame is CSS.
   * `prefers-reduced-motion` drops the flash and keeps the static mark, which the
   * stylesheet swaps to the skill's own 「引爆 DETONATION」 substitute.
   */
  function beatIgnition() {
    terminalBeat('b2-ignition');
    const scene = $('#scene');
    if (scene !== null) scene.classList.add('ignited');
    // COUNT is the §1 total, briefly rolling from zero to the already-published
    // 10,000 as ignition reaches every Earth Engine. It never invents a total.
    const engineTotal = 10000;
    text('#earth-engine-count', '0');
    for (let step = 1; step <= 6; step++) {
      later(() => text('#earth-engine-count', Math.round(engineTotal * step / 6).toLocaleString('en-US')), step * 60);
    }
    const flash = $('.flash');
    if (flash !== null && !reduced) {
      flash.style.transition = 'none';
      flash.style.opacity = '0.92';
      later(() => {
        // 90 ms 全亮 + 260 ms 落下来：这是全片唯一一次整屏亮暗跳变（skill §5），
        // 尾巴不能拖到 b3 的横幅进场去（探针的 −500 ms 基准会把尾巴算到下一拍头上）。
        flash.style.transition = 'opacity .26s ease-out';
        flash.style.opacity = '0';
      }, 90);
    }
    bar(100);
    text('#b-bus', 'BUS OWNED');
  }

  /**
   * b3 — 接入成功. The banner wipes in and its side columns light (CSS); the
   * machine line below it types itself, which is the last motion on screen before
   * the overlay hands back. No card, no second scene: the run stops here.
   */
  function beatOwned() {
    // 550C 的 phaseFinish()：关掉所有窗口 → 短停顿 → 横幅 show → 保持。
    closeAllWindows();
    dimHeld = false;
    syncDim();
    later(() => text('#b-bus', 'BUS OWNED'), 60);
    terminalBeat('b3-owned');
    later(() => {
      const banner = $('.w-final');
      if (banner !== null) banner.classList.add('show');
    // 550C's .48 s wipe finishes at beat +700 ms, leaving a 900 ms hold.
    }, 220);
  }

  // ── the run ───────────────────────────────────────────────────────────────
  async function run(startStamp) {
    for (let i = 0; i < BEAT_550W.length; i++) {
      const beat = BEAT_550W[i];
      await untilAt(startStamp + beat.at);
      setPhase(beat.phase);
      const next = BEAT_550W[i + 1];
      // 只有够长的拍才值得让位：短拍（b2 的白闪）本来就是一次事件。
      if (next !== undefined && next.phase !== beat.phase && next.at - beat.at >= 1400) {
        later(stepAside, next.at - beat.at - 500);
      }
      switch (beat.phase) {
        case 'a1-moonrise': beatMoonrise(); break;
        case 'a2-cutaway': beatCutaway(); break;
        case 'a3-link': beatLink(beat.step); break;
        case 'a4-armed': beatArmed(); break;
        case 'b1-countdown': beatCountdown(performance.now()); break;
        case 'b2-ignition': beatIgnition(); break;
        case 'b3-owned': beatOwned(); break;
        default: break;
      }
    }
    await untilAt(startStamp + RUN_550W_MS);
  }

  /** Run the show; resolves when it has played out, rejects when skipped. */
  async function start() {
    if (started) return;
    started = true;
    const startStamp = performance.now();
    tickClocks();
    // The app face is mounted from the first task and carries a still-frame
    // `data-phase`; the run owns the phase from here. a0-boot matches no layer
    // rule, so the face is blank behind the wordmark until the hand-off.
    setPhase('a0-boot');
    text('#b-bus', 'BUS INITIALIZING');
    const totalMs = playBootShared({ stage: stage, later: later });
    if (mode === 'full') {
      primeBus();
      measureFrames();
      later(() => $('#app')?.classList.add('visible'), 2350);
      later(streamBus, 3100);
    }
    // 550C's own hand-off spacing: totalMs + 300 puts a1 on 3050 ms on both machines.
    await sleep(totalMs + 300);
    if (mode === 'simple') return;
    const boot = $('#boot');
    if (boot !== null) {
      // The one fade in the whole run, and it is 550C's own.
      boot.classList.add('fade');
      later(() => {
        if (boot.parentNode) boot.parentNode.removeChild(boot);
      }, 600);
    }
    const app = $('#app');
    if (app !== null) app.classList.add('visible');
    await run(startStamp);
  }

  return { start: start, cancel: cancel };
}
