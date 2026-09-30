/**
 * 550W — stylesheet and markup.
 *
 * Hand-written (not extracted): there is no upstream page for this machine. It
 * borrows 550C's *language* — one shadow root, phase-scoped CSS animation, no
 * per-frame JavaScript — and none of its pixels.
 *
 * The composition is three depth layers plus three full-screen impact layers:
 *
 *   .w-layer[data-depth="0"]  field   stars and three grid planes   (parallax 0.35)
 *   .w-layer[data-depth="1"]  mid     globe, engine sites, links    (parallax 1)
 *   .w-layer[data-depth="2"]  front   12 candidate trajectories     (parallax 2.2)
 *
 * Every phase is a value of `data-phase` on `.w-stage`, which the timeline flips
 * six times in 18 s; the motion itself is CSS, so the main thread stays idle and
 * the parallax ratio is a pair of CSS variables rather than a rAF loop.
 *
 * Palette: one cold-white/cyan token set, with the three non-default schemes
 * mapped onto it (琥珀 stays "override nothing" = this machine's own palette).
 */
const CSS_550W = `
  /* ── tokens ─────────────────────────────────────────────────────────── */
  :host{
    --w-bg:#04070a; --w-field:#050b12;
    --w-grid:rgba(150,200,230,.16);
    --w-ice:#dfe9f5; --w-cyan:#6fd6e8; --w-dim:#7d93a6; --w-ink:#f4f8fc; --w-warn:#ffcf6a;
    --caption-fill:#04070a; --caption-symbol:#6fd6e8;
  }
  /* The machine's own palette is the default (amber = no override). The other
     three are global schemes applied to THIS token set: a token the machine does
     not use simply never changes. */
  :host([data-scheme="green"]){
    --w-field:#04100a; --w-grid:rgba(140,230,180,.16);
    --w-ice:#dff5e6; --w-cyan:#57d68a; --w-dim:#7fa78f; --w-ink:#f2fbf5; --w-warn:#ffcf6a;
    --caption-fill:#04100a; --caption-symbol:#57d68a;
  }
  :host([data-scheme="cyan"]){
    --w-field:#04101a; --w-grid:rgba(120,215,235,.18);
    --w-ice:#dcf3fb; --w-cyan:#3fc8dc; --w-dim:#7ba0ad; --w-ink:#f0fbff; --w-warn:#ffcf6a;
    --caption-fill:#04101a; --caption-symbol:#3fc8dc;
  }
  :host([data-scheme="white"]){
    --w-field:#0b0d0f; --w-grid:rgba(210,220,230,.14);
    --w-ice:#eceff3; --w-cyan:#c3cbd4; --w-dim:#8d959d; --w-ink:#ffffff; --w-warn:#e8d9a8;
    --caption-fill:#0b0d0f; --caption-symbol:#c3cbd4;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  :host{height:100%;background:var(--w-bg);color:var(--w-ice);
    font-family:"SF Mono",Menlo,Monaco,Consolas,"Courier New",monospace;font-size:12px;
    overflow:hidden;-webkit-font-smoothing:antialiased;}

  /* ── stage / layers / parallax ──────────────────────────────────────── */
  .w-stage{position:absolute;inset:0;perspective:900px;overflow:hidden;background:var(--w-bg);}
  .w-layer{position:absolute;inset:0;will-change:transform;
    animation:w-drift 18s linear both;}
  /* Only the field bleeds past the viewport (its grids and stars are full-bleed
     texture that must not show an edge while it drifts); the mid and front
     layers stay aligned with the viewport so their HUD and labels sit where the
     geometry says they do. */
  .w-field{inset:-20%;}
  .w-layer[data-depth="0"]{--w-drift:35;}
  .w-layer[data-depth="1"]{--w-drift:100;}
  .w-layer[data-depth="2"]{--w-drift:220;}
  /* One shared keyframe, three speeds: the ratio 35 : 100 : 220 IS the parallax
     contract the acceptance probe measures (0.35 : 1 : 2.2). */
  @keyframes w-drift{from{transform:translate3d(0,0,0);}to{transform:translate3d(0,calc(var(--w-drift) * -1px),0);}}

  /* ── depth 0: field ─────────────────────────────────────────────────── */
  .w-stars{position:absolute;inset:0;opacity:.85;background-repeat:repeat;
    background-image:
      radial-gradient(1px 1px at 20% 30%,rgba(223,233,245,.55),transparent),
      radial-gradient(1px 1px at 70% 15%,rgba(111,214,232,.45),transparent),
      radial-gradient(1px 1px at 40% 70%,rgba(223,233,245,.35),transparent),
      radial-gradient(1px 1px at 85% 60%,rgba(223,233,245,.30),transparent),
      radial-gradient(1px 1px at 12% 85%,rgba(111,214,232,.35),transparent);
    background-size:340px 280px;}
  .w-grid{position:absolute;left:-20%;right:-20%;top:50%;height:120%;
    background-image:
      repeating-linear-gradient(to right,var(--w-grid) 0 1px,transparent 1px 64px),
      repeating-linear-gradient(to bottom,var(--w-grid) 0 1px,transparent 1px 64px);
    opacity:.75;}
  .w-grid--far{transform:perspective(700px) rotateX(72deg) scale(1.6);opacity:.34;}
  .w-grid--floor{transform:perspective(700px) rotateX(64deg) translateY(28%);opacity:.75;}
  .w-grid--ceil{transform:perspective(700px) rotateX(-58deg) translateY(-34%);opacity:.5;}

  /* ── depth 1: globe, sites, links, ring ─────────────────────────────── */
  .w-globe{position:absolute;left:50%;top:50%;width:min(52vh,52vw);height:min(52vh,52vw);
    transform:translate(-50%,-50%) scale(1);opacity:1;
    transition:transform 2.6s cubic-bezier(.3,.1,.2,1),opacity 1.4s ease;}
  .w-globe > svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
  .w-graticule{opacity:.38;}
  .w-graticule circle,.w-graticule ellipse{fill:none;stroke:var(--w-ice);stroke-width:.7;}
  .w-sites{position:absolute;inset:0;}
  .w-site{position:absolute;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;
    background:var(--w-cyan);box-shadow:0 0 8px rgba(111,214,232,.7);opacity:.55;}
  .w-link{fill:none;stroke:var(--w-cyan);stroke-width:.9;opacity:.55;stroke-dashoffset:0;}
  .w-ring circle{fill:none;stroke:var(--w-cyan);stroke-width:2;
    stroke-dasharray:1320;stroke-dashoffset:1320;transform:rotate(-90deg);transform-origin:50% 50%;}

  /* ── depth 2: candidate trajectories ────────────────────────────────── */
  /* The trajectories and their labels share one box with the SVG's aspect
     ratio, so a label's percentage is the same coordinate the path was drawn
     at — otherwise preserveAspectRatio: meet would letterbox the drawing and
     leave every label offset from its own curve. */
  .w-canvas{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);
    aspect-ratio:1200 / 700;}
  .w-branches{position:absolute;inset:0;width:100%;height:100%;}
  .w-branch{fill:none;stroke:var(--w-ice);stroke-width:1.15;opacity:.85;
    stroke-dasharray:1;stroke-dashoffset:0;pathLength:1;}
  .w-front .w-readout{position:absolute;font-size:9.5px;letter-spacing:.16em;color:var(--w-dim);
    text-transform:uppercase;white-space:nowrap;opacity:.85;}

  /* ── HUD strips (mid layer) ─────────────────────────────────────────── */
  .w-hud{position:absolute;top:50%;transform:translateY(-50%);width:min(23vw,260px);
    display:flex;flex-direction:column;gap:5px;opacity:0;font-size:10px;letter-spacing:.1em;}
  .w-hud--l{left:2.4vw;}
  .w-hud--r{right:2.4vw;text-align:right;}
  .w-hud .w-k{color:var(--w-dim);}
  .w-hud .w-v{color:var(--w-ink);}
  .w-gauge{display:flex;align-items:center;gap:6px;justify-content:flex-end;}
  .w-gauge .w-bar{flex:1;height:3px;background:rgba(223,233,245,.12);position:relative;overflow:hidden;}
  .w-gauge .w-bar i{position:absolute;inset:0;transform-origin:left center;transform:scaleX(var(--v,.5));
    background:linear-gradient(90deg,var(--w-cyan),var(--w-ice));}
  .w-gauge .w-num{width:46px;color:var(--w-cyan);font-variant-numeric:tabular-nums;}

  /* ── impact layers ──────────────────────────────────────────────────── */
  .w-impact{position:absolute;inset:0;pointer-events:none;opacity:0;}
  .w-bloom{background:radial-gradient(circle at 50% 50%,rgba(111,214,232,.55) 0,rgba(111,214,232,.12) 32%,transparent 62%);}
  .w-dim{background:radial-gradient(circle at 50% 50%,rgba(2,4,6,.55) 0,rgba(1,2,3,.97) 58%);}
  .w-pulse{background:radial-gradient(circle at 50% 50%,#ffffff 0,var(--w-cyan) 26%,rgba(4,7,10,0) 72%);}
  .w-flash{background:linear-gradient(180deg,rgba(223,233,245,0) 39%,rgba(223,233,245,.8) 50%,rgba(223,233,245,0) 61%);}

  /* ── countdown / identity ───────────────────────────────────────────── */
  .w-count{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    font-size:clamp(44px,9vw,110px);letter-spacing:.08em;color:var(--w-ink);opacity:0;
    font-variant-numeric:tabular-nums;text-shadow:0 0 32px rgba(111,214,232,.55);}
  .w-id{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0;}
  .w-id-word{font-size:clamp(46px,10vw,132px);letter-spacing:.22em;color:var(--w-ink);
    text-shadow:0 0 26px rgba(111,214,232,.7),0 0 70px rgba(111,214,232,.32);
    clip-path:inset(0 100% 0 0);}
  .w-id-line{margin-top:14px;font-size:11px;letter-spacing:.42em;color:var(--w-cyan);text-transform:uppercase;}
  .w-horizon{position:absolute;left:0;right:0;top:50%;height:1px;transform:scaleX(1);opacity:.5;
    background:linear-gradient(90deg,transparent,var(--w-ice) 18%,var(--w-ice) 82%,transparent);
    box-shadow:0 0 22px rgba(111,214,232,.65);}

  /* ── skip hint (the port's own #hint idiom, first machine to use it) ─── */
  #hint{position:absolute;left:0;right:0;bottom:26px;text-align:center;font-size:10px;
    letter-spacing:.28em;color:var(--w-dim);opacity:0;transition:opacity .5s;
    text-transform:uppercase;pointer-events:none;}
  #hint.show{opacity:.72;}

  /* ── intro keyframes: a "from" only — an element's base style is where it
     settles, so dropping a phase never undoes the phase before it ───────── */
  @keyframes w-fadein{from{opacity:0;}}
  @keyframes w-risein{from{opacity:0;transform:translateY(6px);}}
  @keyframes w-gridin{from{opacity:0;}}
  @keyframes w-globein{from{opacity:0;transform:translate(-50%,-50%) scale(.62);}}
  @keyframes w-siteon{from{opacity:.2;background:var(--w-dim);}}
  @keyframes w-draw{from{opacity:.12;stroke-dashoffset:1;}}
  @keyframes w-readline{from{opacity:0;transform:translateX(-6px);}}
  @keyframes w-linkon{from{opacity:0;stroke-dashoffset:1;}}
  @keyframes w-fill{from{transform:scaleX(0);}}
  @keyframes w-horizon{0%{transform:scaleX(0);opacity:0;}22%{transform:scaleX(1);opacity:1;}
    100%{transform:scaleX(1);opacity:.5;}}
  @keyframes w-flash{0%{opacity:0;}28%{opacity:.62;}100%{opacity:0;}}
  @keyframes w-prune{0%{opacity:.9;}35%{opacity:1;stroke-width:2.6;}100%{opacity:.07;stroke-width:1;}}
  @keyframes w-bloom{0%{opacity:0;transform:scale(.55);}20%{opacity:.95;}100%{opacity:0;transform:scale(1.25);}}
  @keyframes w-dim{from{opacity:0;}70%{opacity:.92;}to{opacity:.96;}}
  @keyframes w-dimup{from{opacity:.96;}}
  @keyframes w-ring{from{stroke-dashoffset:1320;opacity:.85;}to{stroke-dashoffset:0;opacity:.2;}}
  @keyframes w-pulse{0%{opacity:0;transform:scale(.2);}12%{opacity:1;transform:scale(1.05);}
    38%{opacity:.75;transform:scale(1.3);}100%{opacity:0;transform:scale(1.6);}}
  @keyframes w-print{from{clip-path:inset(0 100% 0 0);}to{clip-path:inset(0 0 0 0);}}

  /* ── layer visibility, gated per phase: "not yet" is one switch ──────── */
  .w-mid,.w-front{transition:opacity .7s ease;}
  .w-stage[data-phase="w0-wake"] .w-mid,
  .w-stage[data-phase="w0-wake"] .w-front,
  .w-stage[data-phase="w1-grid"] .w-front{opacity:0;}

  /* ── phase: w0-wake (0.0–1.4) ───────────────────────────────────────── */
  .w-stage[data-phase="w0-wake"] .w-stars{animation:w-fadein .9s ease-out .15s backwards;}
  .w-stage[data-phase="w0-wake"] .w-horizon{animation:w-horizon .9s cubic-bezier(.2,.9,.1,1) .1s both;}

  /* ── phase: w1-grid (1.4–4.4) — impact #1, the planar flash ─────────── */
  .w-stage[data-phase="w1-grid"] .w-grid--far{animation:w-gridin 1.1s ease-out backwards;}
  .w-stage[data-phase="w1-grid"] .w-grid--floor{animation:w-gridin 1.3s ease-out .12s backwards;}
  .w-stage[data-phase="w1-grid"] .w-grid--ceil{animation:w-gridin 1.5s ease-out .24s backwards;}
  .w-stage[data-phase="w1-grid"] .w-globe{animation:w-globein 1.6s cubic-bezier(.16,.9,.2,1) .35s backwards;}
  /* Sites light in a ring: the stagger is --i, the animation exists only while
     the phase is on, and the lit look is the base style. */
  .w-site{--i:0;}
  .w-stage[data-phase="w1-grid"] .w-site{animation:w-siteon .55s ease-out calc(var(--i) * 55ms) backwards;}
  .w-stage[data-phase="w1-grid"] .w-flash{animation:w-flash .55s ease-out both;}

  /* ── phase: w2-parallel (4.4–7.0) ───────────────────────────────────── */
  .w-stage[data-phase="w2-parallel"] .w-hud{opacity:1;animation:w-fadein .8s ease-out backwards;}
  .w-stage[data-phase="w2-parallel"] .w-branch{
    animation:w-draw 1.05s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 90ms) backwards;}
  .w-stage[data-phase="w2-parallel"] .w-readout{
    animation:w-readline .5s ease-out calc(var(--i) * 90ms + 260ms) backwards;}
  .w-branch.pruned{stroke:var(--w-ink);animation:w-prune .5s ease-out both;}
  .w-branch.keep{stroke:var(--w-cyan);stroke-width:1.8;opacity:.95;}

  /* ── phase: w3-network (7.0–10.6) — impact #2, the mesh closes ──────── */
  .w-stage[data-phase="w3-network"] .w-globe{transform:translate(-50%,-50%) scale(.78);}
  .w-stage[data-phase="w3-network"] .w-link{animation:w-linkon .9s ease-out calc(var(--i) * 45ms) backwards;}
  .w-stage[data-phase="w3-network"] .w-bloom{animation:w-bloom 1.6s ease-out 2.9s both;}

  /* ── phase: w4-alloc (10.6–13.4) ────────────────────────────────────── */
  .w-stage[data-phase="w3-network"] .w-hud,
  .w-stage[data-phase="w4-alloc"] .w-hud,
  .w-stage[data-phase="w5-ignition"] .w-hud{opacity:1;}
  .w-stage[data-phase="w4-alloc"] .w-gauge .w-bar i{
    animation:w-fill 1.9s cubic-bezier(.25,.9,.2,1) calc(var(--i) * 70ms) backwards;}

  /* ── phase: w5-ignition (13.4–16.0) — impact #3, the blackout ───────── */
  .w-stage[data-phase="w5-ignition"] .w-dim{animation:w-dim 2.4s ease-in both;}
  .w-stage[data-phase="w5-ignition"] .w-count{opacity:1;animation:w-fadein .5s ease-out backwards;}
  .w-stage[data-phase="w5-ignition"] .w-ring circle{animation:w-ring 2.4s cubic-bezier(.4,.05,.2,1) both;}
  .w-stage[data-phase="w5-ignition"] .w-globe{opacity:.5;transform:translate(-50%,-50%) scale(.62);}

  /* ── phase: w6-pulse (16.0–18.0) — impact #4 + the ID freeze ────────── */
  .w-stage[data-phase="w6-pulse"] .w-dim{opacity:0;animation:w-dimup .9s ease-out both;}
  .w-stage[data-phase="w6-pulse"] .w-pulse{animation:w-pulse 1.15s cubic-bezier(.1,.9,.2,1) .05s both;}
  .w-stage[data-phase="w6-pulse"] .w-count{opacity:0;}
  .w-stage[data-phase="w6-pulse"] .w-id{opacity:1;animation:w-risein .5s ease-out .8s backwards;}
  .w-stage[data-phase="w6-pulse"] .w-id-word{animation:w-print 1.05s cubic-bezier(.2,.8,.2,1) .9s both;}

  /* ── simple mode: a 3 s beat on the same DOM ────────────────────────── */
  /* The machine has no separate "app" surface: everything it can draw is in one
     markup, and simple mode hides the layers it has no time for. */
  :host([data-mode="simple"]) .w-hud,
  :host([data-mode="simple"]) .w-front,
  :host([data-mode="simple"]) .w-bloom{display:none;}
  .w-stage[data-phase="s0-wake"] .w-stars{animation:w-fadein .5s ease-out backwards;}
  .w-stage[data-phase="s0-wake"] .w-horizon{animation:w-horizon .7s cubic-bezier(.2,.9,.1,1) both;}
  .w-stage[data-phase="s1-ring"] .w-globe{animation:w-globein 1.1s cubic-bezier(.16,.9,.2,1) backwards;}
  .w-stage[data-phase="s1-ring"] .w-site{animation:w-siteon .5s ease-out calc(var(--i) * 22ms) backwards;}
  .w-stage[data-phase="s1-ring"] .w-ring circle{animation:w-ring 1.5s cubic-bezier(.4,.05,.2,1) .1s both;}
  .w-stage[data-phase="s1-ring"] .w-flash{animation:w-flash .5s ease-out .15s both;}
  .w-stage[data-phase="s2-id"] .w-globe{transform:translate(-50%,-50%) scale(.9);}
  .w-stage[data-phase="s2-id"] .w-id{animation:w-risein .4s ease-out backwards;}
  .w-stage[data-phase="s2-id"] .w-id-word{animation:w-print .7s cubic-bezier(.2,.8,.2,1) .1s both;}
`

const W_GRATICULE = [
  '<circle cx="210" cy="210" r="180"/>',
  '<ellipse cx="210" cy="210" rx="180" ry="66"/>',
  '<ellipse cx="210" cy="210" rx="66" ry="180"/>',
  '<ellipse cx="210" cy="210" rx="132" ry="180"/>',
  '<ellipse cx="210" cy="210" rx="180" ry="132"/>',
  '<ellipse cx="210" cy="210" rx="26" ry="180"/>',
].join('')

/** One composition for both modes: everything 550W can draw lives in here. */
const BOOT_MARKUP_550W = `
<div class="w-stage" data-phase="w0-wake">
  <div class="w-layer w-field" data-depth="0">
    <div class="w-stars"></div>
    <div class="w-grid w-grid--far"></div>
    <div class="w-grid w-grid--floor"></div>
    <div class="w-grid w-grid--ceil"></div>
  </div>
  <div class="w-layer w-mid" data-depth="1">
    <div class="w-globe" id="w-globe">
      <svg viewBox="0 0 420 420" class="w-graticule">${W_GRATICULE}</svg>
      <svg viewBox="0 0 420 420" class="w-links" id="w-links"></svg>
      <svg viewBox="0 0 420 420" class="w-ring" id="w-ring"><circle cx="210" cy="210" r="209"/></svg>
      <div class="w-sites" id="w-sites"></div>
    </div>
    <div class="w-hud w-hud--l" id="w-hud-l"></div>
    <div class="w-hud w-hud--r" id="w-hud-r"></div>
  </div>
  <div class="w-layer w-front" data-depth="2">
    <div class="w-canvas">
      <svg viewBox="0 0 1200 700" class="w-branches" id="w-branches"></svg>
    </div>
  </div>
  <div class="w-impact w-bloom"></div>
  <div class="w-impact w-dim"></div>
  <div class="w-impact w-pulse"></div>
  <div class="w-impact w-flash"></div>
  <div class="w-horizon"></div>
  <div class="w-count" id="w-count">03.000</div>
  <div class="w-id" id="w-id">
    <div class="w-id-word">550W</div>
    <div class="w-id-line">MAKER 550W · PLANETARY ENGINE NETWORK · ONLINE</div>
  </div>
  <div id="hint">点击 / Esc 跳过</div>
</div>
`
