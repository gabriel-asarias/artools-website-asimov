/* =====================================================================
   ARTOOLS Pigmentum 0.1 — interações
   Stack: GSAP 3.13 (ScrollTrigger, SplitText, DrawSVG) + Lenis 1.1.13 (via CDN)
   ===================================================================== */

/* =====================================================================
   CALIBRAÇÃO — sistema de coordenadas do vídeo (1280 × 720)
   ===================================================================== */
const PEN_TIP_X = 557;      // ponta da caneta no ÚLTIMO frame (x)
const PEN_TIP_Y = 490;      // ponta da caneta no ÚLTIMO frame (y)
const LINE_START = 0.9;     // progresso do scroll em que a tinta começa a sair

// Trajetória da ponta medida quadro a quadro (tempo do vídeo em s, x, y).
// O último ponto é ancorado em PEN_TIP_X/Y: ajustar as constantes acima desloca o traço inteiro.
const TIP_TRACK = [
  [7.125, 646.5, 527.3],
  [7.250, 635.3, 526.0],
  [7.375, 622.3, 525.0],
  [7.500, 607.7, 522.7],
  [7.625, 591.7, 516.7],
  [7.750, 574.7, 507.3],
  [7.875, 557.3, 490.0],
];

// Ampliação do vídeo de fundo (desktop: a partir da esquerda; mobile: do centro).
// 1.1 é o máximo em que a caneta inteira cabe no início do vídeo em 1440px.
const MEDIA_SCALE_DESKTOP = 1.1;
const MEDIA_SCALE_MOBILE = 1.03;

const VIDEO_SRC = 'assets/video/hero-scroll.mp4';
const FPS = 24;

/* ===================================================================== */
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const MOBILE = () => innerWidth <= 768;
const $ = (s) => document.querySelector(s);

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

const hero = $('#hero');
const video = $('#video');
const state = { progress: 0, target: 0, smooth: 0, lastSet: -1, duration: 7.916667, ready: false };
window.__hero = state;

const mediaScale = () => (MOBILE() ? MEDIA_SCALE_MOBILE : MEDIA_SCALE_DESKTOP);
gsap.set('#heroMedia', { scale: mediaScale() });

/* ---------- Traço de tinta ---------- */
const DX = PEN_TIP_X - TIP_TRACK[TIP_TRACK.length - 1][1];
const DY = PEN_TIP_Y - TIP_TRACK[TIP_TRACK.length - 1][2];
const TRACK = TIP_TRACK.map(([t, x, y]) => [t, x + DX, y + DY]);
const ink = { lengths: [0], total: 0 };

function buildInk() {
  const pts = TRACK.map(([, x, y]) => [x, y]);
  $('#inkPath').setAttribute('d', 'M' + pts.map((p) => p.join(' ')).join('L'));
  for (let i = 1; i < pts.length; i++) ink.lengths[i] = ink.lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  ink.total = ink.lengths[ink.lengths.length - 1];
  // cota de espessura no meio do traço, com a etiqueta no papel livre (abaixo/à esquerda)
  const m = pts[3], d = [pts[4][0] - pts[2][0], pts[4][1] - pts[2][1]], l = Math.hypot(...d);
  const u = [d[0] / l, d[1] / l], n = [u[1], -u[0]];
  const s = (k) => [m[0] - n[0] * k, m[1] - n[1] * k];
  const o = (k) => [m[0] + n[0] * k, m[1] + n[1] * k];
  const arrow = (from, to) => {
    const v = [to[0] - from[0], to[1] - from[1]], vl = Math.hypot(...v), w = [v[0] / vl, v[1] / vl], q = [-w[1], w[0]];
    const b = [to[0] - w[0] * 7, to[1] - w[1] * 7];
    return `M${from.join(' ')}L${to.join(' ')}M${(b[0] + q[0] * 3).toFixed(1)} ${(b[1] + q[1] * 3).toFixed(1)}L${to.join(' ')}L${(b[0] - q[0] * 3).toFixed(1)} ${(b[1] - q[1] * 3).toFixed(1)}`;
  };
  const elbow = o(64), shoulder = [elbow[0] - 96, elbow[1]];
  $('#inkCotaPath').setAttribute('d', arrow(o(26), o(3)) + arrow(s(26), s(3)) + `M${o(26).join(' ')}L${elbow.join(' ')}L${shoulder.join(' ')}`);
  const tx = shoulder[0] + 4, ty = shoulder[1] - 8;
  const t = $('#inkCotaText'); t.setAttribute('x', tx); t.setAttribute('y', ty);
  const bg = $('#inkCotaBg'); bg.setAttribute('x', tx - 6); bg.setAttribute('y', ty - 16); bg.setAttribute('width', 76); bg.setAttribute('height', 22);
}
function inkLengthAt(t) {
  if (t <= TRACK[0][0]) return 0;
  for (let i = 1; i < TRACK.length; i++) {
    if (t <= TRACK[i][0]) {
      const k = (t - TRACK[i - 1][0]) / (TRACK[i][0] - TRACK[i - 1][0]);
      return ink.lengths[i - 1] + k * (ink.lengths[i] - ink.lengths[i - 1]);
    }
  }
  return ink.total;
}
let lastInk = -1;
function renderInk(t, progress) {
  const L = progress < LINE_START ? 0 : inkLengthAt(t);
  if (Math.abs(L - lastInk) < 0.05) return;
  lastInk = L;
  gsap.set('#inkPath', { drawSVG: `0 ${Math.max(L, 0.001)}`, visibility: L > 0.05 ? 'visible' : 'hidden' });
  const head = $('#inkHead');
  if (L > 0.5) { const pt = $('#inkPath').getPointAtLength(L); head.setAttribute('cx', pt.x); head.setAttribute('cy', pt.y); head.setAttribute('opacity', 1); }
  else head.setAttribute('opacity', 0);
  gsap.to('#inkCota', { opacity: L >= ink.total - 0.5 ? 1 : 0, duration: 0.6, ease: 'expo.out', overwrite: true });
}

/* ---------- Progresso: barra do topo + anel + cursor ---------- */
let lastStageTxt = '';
function renderUI(t) {
  const max = document.documentElement.scrollHeight - innerHeight;
  const page = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;   // progresso do scroll da página
  $('#topFill').style.transform = `scaleX(${page})`;
  $('#topHead').style.transform = `translateX(${page * innerWidth}px)`;
  $('#topProgress').classList.toggle('moving', page > 0.002 && page < 0.998);
  $('#ringProg').style.strokeDashoffset = 150.8 * (1 - page);
  $('#ringPct').textContent = String(Math.min(Math.round(page * 100), 99)).padStart(2, '0');
  const s2 = document.getElementById('ponta');
  if (s2) $('#nav').classList.toggle('solid', s2.getBoundingClientRect().top < $('#nav').offsetHeight);
  const txt = t >= 2.45 ? 'Traçar' : 'Role';
  if (txt !== lastStageTxt) { $('#cursorText').textContent = txt; lastStageTxt = txt; }
}

/* ---------- Debug (?debug) ---------- */
let hud;
function setupDebug() {
  $('#debugLayer').innerHTML = `<g stroke="#D6A461" stroke-width="1" vector-effect="non-scaling-stroke" fill="none">
      <circle cx="${PEN_TIP_X}" cy="${PEN_TIP_Y}" r="14"/><path d="M${PEN_TIP_X - 26} ${PEN_TIP_Y}H${PEN_TIP_X + 26}M${PEN_TIP_X} ${PEN_TIP_Y - 26}V${PEN_TIP_Y + 26}"/></g>` +
    TRACK.map(([, x, y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="#D6A461"/>`).join('');
  hud = document.createElement('div'); hud.className = 'debug-hud'; document.body.appendChild(hud);
  // clique no vídeo → coordenadas no sistema 1280×720
  $('#sticky').addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    const svg = $('#ink'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    state.lastClick = `const PEN_TIP_X = ${Math.round(p.x)};\nconst PEN_TIP_Y = ${Math.round(p.y)};`;
    console.log('[debug] clique em\n' + state.lastClick);
  });
}
function renderDebug(t) {
  if (!hud) return;
  hud.innerHTML = `<b>?debug</b>  scroll ${(state.progress * 100).toFixed(1)}%\n` +
    `vídeo   ${t.toFixed(3)}s · frame ${Math.round(t * FPS)}/${Math.round(state.duration * FPS)}\n` +
    `alvo    ${state.target.toFixed(3)}s · seeking ${video.seeking}\n` +
    `ponta   ${PEN_TIP_X}, ${PEN_TIP_Y} · tinta ${state.progress >= LINE_START ? 'ON' : 'off'}\n` +
    (state.lastClick ? `clique  ${state.lastClick.replace(/\n/g, ' ')}` : 'clique no vídeo para medir');
}

/* ---------- Vídeo: carrega inteiro em memória (seek instantâneo) ---------- */
async function loadVideo() {
  try {
    const res = await fetch(VIDEO_SRC);
    if (!res.ok) throw new Error('fetch');
    video.src = URL.createObjectURL(await res.blob());
  } catch (e) {
    video.src = VIDEO_SRC;   // fallback (ex.: file://)
  }
  if (video.readyState < 1) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  state.duration = video.duration || state.duration;
}

// iOS/Safari: play() + pause() na primeira interação para liberar o seek
function unlockVideo() {
  const go = () => { const p = video.play(); if (p && p.then) p.then(() => video.pause()).catch(() => {}); };
  ['touchstart', 'pointerdown', 'wheel', 'keydown'].forEach((ev) => window.addEventListener(ev, go, { once: true, passive: true }));
}

/* ---------- Loop único de render (rAF) ---------- */
function loop() {
  const diff = state.target - state.smooth;
  state.smooth = Math.abs(diff) < 0.0005 ? state.target : state.smooth + diff * 0.2;   // lerp
  const t = state.smooth;
  if (state.ready && !video.seeking && Math.abs(t - state.lastSet) > 0.5 / FPS) {   // seek só quando muda ≥ ½ frame
    video.currentTime = Math.min(t, state.duration - 0.001);
    state.lastSet = t;
  }
  renderInk(t, state.progress);
  renderUI(t);
  renderCursor();
  if (DEBUG) renderDebug(t);
  requestAnimationFrame(loop);
}

/* ---------- Cursor customizado (só sobre o vídeo, fora do texto) ---------- */
const cur = { x: 0, y: 0, tx: 0, ty: 0, on: false };
function renderCursor() {
  if (!cur.on) return;
  cur.x += (cur.tx - cur.x) * 0.18; cur.y += (cur.ty - cur.y) * 0.18;
  $('#cursor').style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
}
function setupCursor() {
  if (!FINE || REDUCED) return;
  const area = $('#hero'), el = $('#cursor');
  const show = (v) => { el.classList.toggle('on', v); area.classList.toggle('cursor-hide', v); };
  area.addEventListener('pointermove', (e) => {
    const overUI = !!e.target.closest('.hero-copy, a, button, .ring');
    if (!cur.on) { cur.x = e.clientX; cur.y = e.clientY; }
    cur.tx = e.clientX; cur.ty = e.clientY; cur.on = true;
    show(!overUI);
  });
  area.addEventListener('pointerleave', () => show(false));
}

/* ---------- Navegação ---------- */
function setupNav() {
  const menu = $('#pillMenu'), ind = menu.querySelector('.pill-indicator');
  const links = [...menu.querySelectorAll('a')];
  const move = (a) => { ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft}px)`; };
  const active = () => links.find((l) => l.getAttribute('aria-current') === 'true') || links[0];
  links.forEach((a) => {
    a.addEventListener('mouseenter', () => move(a));
    a.addEventListener('focus', () => move(a));
    a.addEventListener('click', (e) => {
      e.preventDefault(); setActive(a.getAttribute('href'));
      const id = a.getAttribute('href') === '#design' ? '#hero' : a.getAttribute('href');
      const target = document.querySelector(id);
      if (target && window.__lenis) window.__lenis.scrollTo(target, { duration: 1.4 });
    });
  });
  function setActive(href) {
    const a = links.find((l) => l.getAttribute('href') === href); if (!a) return;
    links.forEach((l) => l.removeAttribute('aria-current')); a.setAttribute('aria-current', 'true'); move(a);
  }
  window.__setNav = setActive;
  menu.addEventListener('mouseleave', () => move(active()));
  const place = () => { ind.style.transition = 'none'; move(active()); ind.offsetWidth; ind.style.transition = ''; };
  document.fonts.ready.then(place); addEventListener('resize', place);

  const burger = $('#burger'), mm = $('#mobileMenu');
  const close = () => { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menu'); mm.classList.remove('open'); };
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    mm.classList.toggle('open', open);
    if (open) mm.querySelector('a').focus();
  });
  mm.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mm.classList.contains('open')) { close(); burger.focus(); } });
}

/* ---------- Botões magnéticos (DS) ---------- */
function setupMagnetic() {
  if (!FINE || REDUCED) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    el.style.transition = 'transform .6s var(--ease-architect)';
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ---------- Entrada (carregamento) ---------- */
function intro() {
  $('#nav').classList.add('loaded');
  if (REDUCED) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });   // expo.out = --ease-architect
  const h1 = SplitText.create('#hero-title', { type: 'words', mask: 'words' });
  const lede = SplitText.create('#lede', { type: 'lines', mask: 'lines' });
  tl.to('#heroMedia', { opacity: 1, duration: 1.6, ease: 'power1.out' }, 0)                                         // vídeo surge do Osso
    .from('#eyebrow', { y: 30, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'power1.out', clearProps: 'filter' }, 0.3)   // animationIn
    .from(h1.words, { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.08 }, 0.4)                                             // text-reveal
    .from(lede.lines, { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.1, onComplete: () => lede.revert() }, 0.7)
    .from(['#hint', '#ctas > *'], { y: 30, opacity: 0, filter: 'blur(10px)', duration: 0.8, stagger: 0.1, ease: 'power1.out', clearProps: 'filter' }, 0.95)
    .from('.ring', { scale: 0.6, opacity: 0, duration: 1 }, 1.1);
}

/* ---------- Scroll: Lenis + ScrollTrigger ---------- */
let lenis;
function setupScroll() {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis;
}

function setupTriggers() {
  // 1) Progresso → tempo do vídeo (scrub). O loop rAF faz o lerp e o seek.
  const proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1, ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true },
    onUpdate: () => { state.progress = proxy.p; state.target = proxy.p * state.duration; },
  });
  // 2) 1ª → 2ª dobra. O texto rola para fora com a página (100vh de scroll); `leave` é a
  //    fração do progresso em que isso acontece. Nesse trecho o texto sobe um pouco mais rápido
  //    (parallax) e os véus somem, deixando a 2ª dobra só com o vídeo. O vídeo só "respira".
  const base = mediaScale();
  const leave = Math.min(1, innerHeight / (hero.offsetHeight - innerHeight));
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: 0.8 } })
    .to('#heroCopy', { y: MOBILE() ? -24 : -80, opacity: 0, duration: leave }, 0)
    .to('.veil', { opacity: 0, duration: leave * 0.75 }, leave * 0.25)
    .to('#hintWrap', { opacity: 0, duration: 0.12 }, 0.02)
    .fromTo('#heroMedia', { scale: base }, { scale: base * 1.035, duration: 1 }, 0);
}

/* =====================================================================
   2ª DOBRA — A PONTA
   ===================================================================== */
// Curvas de nível: anéis "desenhados à mão" com a mesma espessura de 0.1 mm (1px)
function buildTopo() {
  const svg = $('#topo'), ns = 'http://www.w3.org/2000/svg';
  const fields = [
    { x: 180, y: 860, rings: 11, r0: 50, gap: 44, seed: 1.3 },
    { x: 1300, y: 140, rings: 9, r0: 40, gap: 50, seed: 4.1 },
  ];
  fields.forEach((f, fi) => {
    const g = document.createElementNS(ns, 'g');
    for (let k = 0; k < f.rings; k++) {
      const amp = 8 + k * 3.2, pts = [];
      for (let i = 0; i <= 140; i++) {
        const a = (i / 140) * Math.PI * 2;
        const r = f.r0 + k * f.gap + amp * (Math.sin(3 * a + f.seed + k * .35) + .6 * Math.sin(5 * a - f.seed * 2 + k * .2) + .35 * Math.sin(2 * a + k));
        pts.push(`${(f.x + Math.cos(a) * r * 1.25).toFixed(1)} ${(f.y + Math.sin(a) * r).toFixed(1)}`);
      }
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M' + pts.join('L') + 'Z');
      if (fi === 0 && k === 6) p.classList.add('lume');   // um único traço Lume
      g.appendChild(p);
    }
    svg.appendChild(g);
  });
}

function countSpec(el) {
  const from = parseFloat(el.dataset.from), to = parseFloat(el.dataset.to), dec = +el.dataset.dec;
  const o = { v: from };
  gsap.to(o, { v: to, duration: 1.6, ease: 'expo.out', overwrite: true, onUpdate: () => { el.textContent = o.v.toFixed(dec); } });
}

function setupFold2() {
  buildTopo();
  if (REDUCED) return;

  // ---- ENTRADA (dispara aos 70% da tela; ao subir de volta, reverte = saída para cima) ----
  // wordsClass "s2w" → máscara "s2w-mask" (CSS dá folga em cima para os acentos de DÉCIMO/MILÍMETRO)
  const sans = SplitText.create('#s2-title .t-sans', { type: 'words', mask: 'words', wordsClass: 's2w' });
  const serif = SplitText.create('#s2-title .t-serif', { type: 'words', mask: 'words', wordsClass: 's2w' });
  const animIn = { y: 30, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'power1.out' };   // DS animationIn
  const enter = gsap.timeline({
    defaults: { ease: 'expo.out' },
    scrollTrigger: {
      trigger: '#s2Inner', start: 'top 70%', toggleActions: 'play none none reverse',
      onEnter: () => document.querySelectorAll('.spec-n').forEach(countSpec),
      onEnterBack: () => document.querySelectorAll('.spec-n').forEach(countSpec),
    },
  });
  enter
    .from('#topo path', { drawSVG: '0%', duration: 2.6, stagger: 0.025 }, 0)
    .from('.s2-eyebrow', animIn, 0.05)
    .from(sans.words, { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.07 }, 0.1)                            // text-reveal
    .fromTo('#s2Outline', { clipPath: 'inset(-20% 100% -10% 0)' }, { clipPath: 'inset(-20% 0% -10% 0)', duration: 1.4 }, 0.3)   // lettering vazado "risca" da esquerda p/ direita
    .from(serif.words, { yPercent: 110, opacity: 0, duration: 1.2 }, 0.5)
    .from(['#s2Lede', '.s2-specs', '.s2-ctas'], { ...animIn, stagger: 0.1 }, 0.65)
    .from('.cc .cc-in', { y: 90, opacity: 0, scale: 0.94, filter: 'blur(14px)', duration: 1.4, stagger: 0.12 }, 0.2)
    .from('#lumeSign', { drawSVG: '0%', duration: 1.8, ease: 'power2.inOut' }, 0.9)
    .fromTo('#pontaRing', { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1 }, 1.1)
    .fromTo('#pontaLead', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, 1.4);

  // ---- PARALLAX (camadas em velocidades diferentes) ----
  const para = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '#ponta', start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
  document.querySelectorAll('.cc[data-speed]').forEach((el) => para.fromTo(el, { y: -(+el.dataset.speed) }, { y: +el.dataset.speed }, 0));
  para.fromTo('.cc-main .cc-img img', { yPercent: -5 }, { yPercent: 5 }, 0)
      .fromTo('#topo', { y: 60 }, { y: -60 }, 0)
      .fromTo('.s2-orb', { yPercent: 20 }, { yPercent: -30 }, 0)
      .fromTo('.s2-strip .marquee-container', { x: 0 }, { x: -160 }, 0);

  // ---- SAÍDA (rolando para a próxima dobra: sobe, desfoca e some) ----
  gsap.fromTo('#s2Inner', { opacity: 1, y: 0, filter: 'blur(0px)' }, {
    opacity: 0.15, y: -70, filter: 'blur(8px)', ease: 'none',
    scrollTrigger: { trigger: '#s2Inner', start: 'bottom 80%', end: 'bottom 15%', scrub: true },
  });

  // ---- Hero sai de cena enquanto a 2ª dobra sobe ----
  gsap.fromTo('#sticky', { filter: 'blur(0px)', opacity: 1 }, {
    filter: 'blur(10px)', opacity: 0.35, ease: 'none',
    scrollTrigger: { trigger: '#ponta', start: 'top bottom', end: 'top 30%', scrub: true },
  });

  // ---- Menu pílula acompanha a seção ----
  const nav = (h) => window.__setNav && window.__setNav(h);
  ScrollTrigger.create({ trigger: '#ponta', start: 'top 55%', end: 'bottom 55%',
    onEnter: () => nav('#ponta'), onEnterBack: () => nav('#ponta'), onLeave: () => nav('#tinta'), onLeaveBack: () => nav('#design') });
}

/* =====================================================================
   3ª DOBRA — A TINTA
   ===================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';

// ---- Folha de teste: desenhar, secar em 2 s, medir, testar água ----
function setupPad() {
  const svg = $('#pad'), layer = $('#userInk'), water = $('#water'), status = $('#labStatus');
  const DEFAULT_STATUS = 'Tinta molhada em Lume · seca para o preto em 2 s';
  let path = null, last = null, total = 0, dryTimer;
  const setStatus = (html) => { status.innerHTML = html; };
  const toLocal = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  // escala da folha: 600 unidades = 15 cm → 1 unidade = 0.25 mm
  const meter = () => {
    $('#mLen').innerHTML = `${(total * 0.025).toFixed(1)}<small>cm</small>`;
    $('#mLeft').innerHTML = `${(400 - total * 0.00025).toFixed(4)}<small>m</small>`;
    $('#mPct').innerHTML = `${((total * 0.00025) / 400 * 100).toFixed(5)}<small>%</small>`;
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    svg.setPointerCapture(e.pointerId);
    const p = toLocal(e); last = p;
    path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    layer.appendChild(path);
    $('#padHint').classList.add('gone');
    clearTimeout(dryTimer); setStatus('<b>Molhada</b> · traçando com a ponta 0.1');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!path) return;
    const p = toLocal(e), d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 1.2) return;
    total += d; last = p;
    path.setAttribute('d', path.getAttribute('d') + `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    meter();
  });
  const end = () => {
    if (!path) return;
    const p = path; path = null;
    requestAnimationFrame(() => p.classList.add('dry'));          // transição de 2 s: Lume → preto
    setStatus('Secando…');
    clearTimeout(dryTimer); dryTimer = setTimeout(() => setStatus('<b>Seco em 2 s</b> · pode passar a mão'), 2000);
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

  // Teste da água: Pigmentum fica, tinta comum borra
  $('#btnWater').addEventListener('click', () => {
    const btn = $('#btnWater'); btn.disabled = true;
    layer.querySelectorAll('path').forEach((p) => p.classList.add('dry'));
    setStatus('Derramando água…');
    const drops = [[440, 230], [500, 260], [380, 190], [210, 220], [560, 180], [300, 300], [120, 180]];
    drops.forEach(([x, y], i) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 0); water.appendChild(c);
      gsap.to(c, { attr: { r: 50 + (i % 3) * 30 }, duration: REDUCED ? 0 : 1.8, delay: REDUCED ? 0 : i * 0.12, ease: 'expo.out' });
    });
    const t = REDUCED ? 0 : 2.2;
    gsap.to('#bleedMap', { attr: { scale: 18 }, duration: t, ease: 'power2.out' });
    gsap.to('#bleedBlur', { attr: { stdDeviation: 1.8 }, duration: t, ease: 'power2.out' });
    gsap.to('#common path', { attr: { stroke: '#5B6470' }, opacity: 0.7, duration: t });
    setTimeout(() => {
      gsap.to('#water circle', { opacity: 0, duration: REDUCED ? 0 : 1.6, onComplete: () => { water.innerHTML = ''; } });   // a água evapora
      setStatus('<b>Pigmentum intacta.</b> A tinta comum borrou.');
      btn.disabled = false;
    }, REDUCED ? 0 : 2600);
  });

  $('#btnClear').addEventListener('click', () => {
    layer.innerHTML = ''; water.innerHTML = ''; total = 0; meter();
    gsap.to('#bleedMap', { attr: { scale: 0 }, duration: 0.6 });
    gsap.to('#bleedBlur', { attr: { stdDeviation: 0 }, duration: 0.6 });
    gsap.to('#common path', { attr: { stroke: '#1C1C1C' }, opacity: 1, duration: 0.6 });
    $('#padHint').classList.remove('gone'); setStatus(DEFAULT_STATUS);
  });
}

// ---- Lente: partículas de pigmento assentando nas fibras (campo escuro) ----
function setupLens() {
  const c = $('#lensCanvas'), ctx = c.getContext('2d'), W = c.width, H = c.height;
  const fibers = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function buildFibers() {
    fibers.length = 0;
    for (let f = 0; f < 7; f++) {
      const y0 = rnd(30, H - 30), y1 = rnd(30, H - 30), cy = rnd(0, H), pts = [];
      for (let i = 0; i <= 60; i++) { const t = i / 60, mt = 1 - t; pts.push([t * W, mt * mt * y0 + 2 * mt * t * cy + t * t * y1]); }
      fibers.push(pts);
    }
  }
  let parts = [];
  function init() {
    buildFibers();
    parts = Array.from({ length: 190 }, () => {
      const fib = fibers[(Math.random() * fibers.length) | 0], pt = fib[(Math.random() * fib.length) | 0];
      return { x: rnd(0, W), y: rnd(0, H), vx: rnd(-1, 1), vy: rnd(-1, 1), tx: pt[0] + rnd(-3, 3), ty: pt[1] + rnd(-3, 3), s: rnd(0.8, 2.2), lume: Math.random() < 0.18, stuck: false };
    });
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
  }
  function step(draw = true) {
    for (const p of parts) {
      if (p.stuck) { p.x += rnd(-0.15, 0.15); p.y += rnd(-0.15, 0.15); continue; }
      p.vx += (p.tx - p.x) * 0.0012 + rnd(-0.25, 0.25); p.vy += (p.ty - p.y) * 0.0012 + rnd(-0.25, 0.25);
      p.vx *= 0.95; p.vy *= 0.95; p.x += p.vx; p.y += p.vy;
      if (Math.hypot(p.tx - p.x, p.ty - p.y) < 2.5) p.stuck = true;
    }
    if (!draw) return;
    ctx.fillStyle = 'rgba(5, 5, 5, .3)'; ctx.fillRect(0, 0, W, H);            // rastro
    ctx.lineCap = 'round';
    for (const f of fibers) {
      ctx.beginPath(); f.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    for (const p of parts) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fillStyle = p.lume ? 'rgba(214,164,97,.95)' : (p.stuck ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.55)');
      ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.28, W / 2, H / 2, W * 0.52);   // vinheta da lente
    v.addColorStop(0, 'rgba(5,5,5,0)'); v.addColorStop(1, 'rgba(5,5,5,.95)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  init();
  if (REDUCED) { for (let i = 0; i < 900; i++) step(false); ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H); step(); return; }
  let running = false, hiddenAt = 0;
  const tick = () => { if (!running) return; step(); requestAnimationFrame(tick); };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (performance.now() - hiddenAt > 4000) init(); if (!running) { running = true; tick(); } }   // replay ao voltar
    else { running = false; hiddenAt = performance.now(); }
  }, { threshold: 0.1 }).observe(c);
}

function setupFold3() {
  setupPad();
  setupLens();
  // lanterna (flashlight do Gemini) nos cards
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('[data-flashlight]'); if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - r.left}px`); card.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
  });
  if (REDUCED) return;

  // ---- A tinta se espalha pela página enquanto a seção sobe ----
  // power2.in: a mancha começa pequena (gota) e acelera até cobrir tudo
  gsap.fromTo('.s3-ink', { '--r': '0%' }, { '--r': '106%', ease: 'power2.in', scrollTrigger: { trigger: '#tinta', start: 'top bottom', end: 'top 5%', scrub: true } });
  // a 2ª dobra afunda na tinta
  gsap.fromTo('.s2-body', { filter: 'blur(0px)' }, { filter: 'blur(6px)', ease: 'none', scrollTrigger: { trigger: '#tinta', start: 'top 70%', end: 'top 10%', scrub: true } });

  // ---- ENTRADA ----
  const sans = SplitText.create('#s3-title .t-sans', { type: 'words', mask: 'words', wordsClass: 's3w' });
  const animIn = { y: 30, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'power1.out' };
  gsap.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger: '#s3Inner', start: 'top 40%', toggleActions: 'play none none reverse' } })
    .from('.s3-eyebrow', animIn, 0)
    .from(sans.words, { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.07 }, 0.05)
    .from('#s3-title .t-serif', { y: 40, opacity: 0, filter: 'blur(14px)', duration: 1.4, clearProps: 'filter' }, 0.35)   // serif com gradiente: blur-in inteiro
    .from('.s3-head-side', animIn, 0.5)
    .from('.s3-in-card', { y: 90, opacity: 0, scale: 0.94, filter: 'blur(14px)', duration: 1.4, stagger: 0.1 }, 0.4)
    .from('#preset .sk', { drawSVG: '0%', duration: 1.6, stagger: 0.18, ease: 'power2.inOut' }, 0.9)
    .from('.lens', { scale: 0.4, rotate: -60, opacity: 0, filter: 'blur(10px)', duration: 1.6 }, 1)
    .from('.s3-foot', animIn, 1.1);

  // ---- PARALLAX ----
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '#tinta', start: 'top bottom', end: 'bottom top', scrub: 0.6 } })
    .fromTo('.s3-giant', { xPercent: 4 }, { xPercent: -34 }, 0)
    .fromTo('.s3-orb-a', { yPercent: 40 }, { yPercent: -40 }, 0)
    .fromTo('.s3-orb-b', { yPercent: -20 }, { yPercent: 50 }, 0)
    .fromTo('.lens', { y: 70 }, { y: -70 }, 0)
    .fromTo('.props', { y: 60 }, { y: -40 }, 0);

  // ---- SAÍDA ----
  gsap.fromTo('#s3Inner', { opacity: 1, y: 0, filter: 'blur(0px)' }, {
    opacity: 0.15, y: -70, filter: 'blur(8px)', ease: 'none',
    scrollTrigger: { trigger: '#s3Inner', start: 'bottom 80%', end: 'bottom 15%', scrub: true },
  });

  // ---- Menu ----
  const nav = (h) => window.__setNav && window.__setNav(h);
  ScrollTrigger.create({ trigger: '#tinta', start: 'top 55%', end: 'bottom 55%',
    onEnter: () => nav('#tinta'), onEnterBack: () => nav('#tinta'), onLeave: () => nav('#especificacoes'), onLeaveBack: () => nav('#ponta') });
}

/* =====================================================================
   4ª DOBRA — ESPECIFICAÇÕES · COMPRAR · RODAPÉ
   ===================================================================== */
function setupFold4() {
  // Âncoras internas (Comprar agora, Ficha técnica, rodapé…) com rolagem suave do Lenis
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('#pillMenu')) return;
    const target = a.getAttribute('href').length > 1 && document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (window.__lenis && !REDUCED) window.__lenis.scrollTo(target, { duration: 1.4 }); else target.scrollIntoView();
  });

  // Peça ↔ linha da tabela ↔ balão (destaque cruzado, mouse e teclado)
  const bp = $('#bp');
  const hl = (n) => { document.querySelectorAll('[data-part]').forEach((el) => el.classList.toggle('hl', el.dataset.part === n)); bp.classList.toggle('has-hl', !!n); };
  document.querySelectorAll('.part, .balloon, .part-row').forEach((el) => {
    el.addEventListener('pointerenter', () => hl(el.dataset.part)); el.addEventListener('pointerleave', () => hl(null));
    el.addEventListener('focus', () => hl(el.dataset.part)); el.addEventListener('blur', () => hl(null));
  });

  // Kits: total animado (preços FICTÍCIOS)
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const tot = { v: 99.9 };
  const update = (animate = true) => {
    const r = document.querySelector('input[name="pack"]:checked'), v = +r.value, u = +r.dataset.units;
    gsap.to(tot, { v, duration: animate && !REDUCED ? 0.9 : 0, ease: 'expo.out', overwrite: true, onUpdate: () => { $('#total').textContent = brl(tot.v); } });
    $('#totalSub').textContent = `ou 3× de ${brl(v / 3)} sem juros · ${brl(v / u)} por caneta`;
    $('#buyMsg').textContent = '';
  };
  document.querySelectorAll('input[name="pack"]').forEach((r) => r.addEventListener('change', () => update()));
  update(false);
  $('#packs').addEventListener('submit', () => {
    const r = document.querySelector('input[name="pack"]:checked');
    const name = r.closest('.pack').querySelector('.pack-name').firstChild.textContent.trim();
    $('#buyMsg').textContent = `${name} adicionado ao carrinho · checkout [CONFIRMAR]`;
  });
  $('#news').addEventListener('submit', () => { $('#newsMsg').textContent = 'Inscrição confirmada ✓'; $('#newsEmail').value = ''; });
  $('#toTop').addEventListener('click', () => { if (window.__lenis && !REDUCED) window.__lenis.scrollTo(0, { duration: 2.2 }); else scrollTo(0, 0); });

  if (REDUCED) {   // estado final: vista explodida montada, tudo visível
    gsap.set('#pCapGroup', { x: -150 }); gsap.set('#pPlug', { x: 70 }); gsap.set('#bpDimOverall', { opacity: 0 });
    $('.ft-giant').classList.add('is-filled');
    return;
  }

  const animIn = { y: 30, opacity: 0, filter: 'blur(10px)', duration: 0.8, ease: 'power1.out' };
  const nav = (h) => window.__setNav && window.__setNav(h);

  // ---- Entrada do cabeçalho ----
  const s4sans = SplitText.create('#s4-title .t-sans', { type: 'words', mask: 'words', wordsClass: 's4w' });
  gsap.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger: '#especificacoes', start: 'top 60%', toggleActions: 'play none none reverse' } })
    .from('#especificacoes .s4-eyebrow', animIn, 0)
    .from(s4sans.words, { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.07 }, 0.05)
    .from('#s4-title .t-line:last-child', { y: 30, opacity: 0, filter: 'blur(12px)', duration: 1.2, clearProps: 'filter' }, 0.3)
    .from('.s4-side', { ...animIn, y: 40, duration: 1.1 }, 0.4)
    .from('.bp-cap', { opacity: 0, duration: 0.8 }, 0.6);

  // ---- O desenho se constrói e explode com o scroll ----
  const build = (st) => gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: st })
    .fromTo('#bp .bp-axis', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0)
    .fromTo('#bp .bp-line', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.3, stagger: 0.008 }, 0.02)                 // contorno
    .fromTo('#bp .bp-fill, #bp .bp-text', { opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.26)
    .fromTo('#bpDims path, #bpTitleBlock path', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.14, stagger: 0.02 }, 0.3)   // cotas
    .fromTo('#bpDims text, #bpTitleBlock text', { opacity: 0 }, { opacity: 1, duration: 0.05, stagger: 0.015 }, 0.38)
    .to('#bpDimOverall', { opacity: 0, duration: 0.05 }, 0.5)
    .to('#pCapGroup', { x: -150, duration: 0.18, ease: 'power2.inOut' }, 0.5)                                              // vista explodida
    .to('#pPlug', { x: 70, duration: 0.18, ease: 'power2.inOut' }, 0.53)
    .fromTo('#pCart', { opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.6)                                                   // linha oculta
    .fromTo('#bpNibDim path', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.08 }, 0.66)
    .fromTo('#bpNibDim text', { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0.72)
    .fromTo('.balloon', { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.05, stagger: 0.035, ease: 'expo.out' }, 0.74)
    .fromTo('.part-row', { opacity: 0.35 }, { opacity: 1, duration: 0.05, stagger: 0.035 }, 0.74)
    .set({}, {}, 1);
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1025px)', () => { build({ trigger: '#s4Stage', start: 'top top', end: '+=170%', pin: true, scrub: 0.8, anticipatePin: 1 }); });
  mm.add('(max-width: 1024px)', () => { build({ trigger: '#bp', start: 'top 85%', end: 'bottom 20%', scrub: 0.8 }); });

  // ---- Comprar: entrada + parallax ----
  gsap.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger: '#comprar', start: 'top 65%', toggleActions: 'play none none reverse' } })
    .from('.s5-visual', { scale: 0.9, opacity: 0, filter: 'blur(14px)', duration: 1.4, clearProps: 'filter' }, 0)
    .from('.s5-pen', { xPercent: -25, rotate: -40, opacity: 0, duration: 1.6 }, 0.05)
    .from('#comprar .s4-eyebrow', animIn, 0.2)
    .from('#s5-title .t-line', { yPercent: 60, opacity: 0, filter: 'blur(10px)', duration: 1.2, stagger: 0.12, clearProps: 'filter' }, 0.25)
    .from('.pack', { y: 30, opacity: 0, filter: 'blur(8px)', duration: 0.9, stagger: 0.08, clearProps: 'filter' }, 0.45)
    .from(['.total', '.trust'], { y: 24, opacity: 0, duration: 0.8, stagger: 0.1 }, 0.7);
  gsap.fromTo('.s5-visual', { y: 60 }, { y: -60, ease: 'none', scrollTrigger: { trigger: '#comprar', start: 'top bottom', end: 'bottom top', scrub: 0.6 } });

  // ---- Rodapé: o último traço atravessa a página ----
  gsap.fromTo('#ftInk', { drawSVG: '0%' }, { drawSVG: '100%', ease: 'none', scrollTrigger: { trigger: '.ft', start: 'top bottom', end: 'top 35%', scrub: true } });
  gsap.fromTo('#ftInkDot', { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.6, ease: 'expo.out', scrollTrigger: { trigger: '.ft', start: 'top 38%', toggleActions: 'play none none reverse' } });
  gsap.from('.ft-cols > *', { ...animIn, stagger: 0.1, scrollTrigger: { trigger: '.ft-cols', start: 'top 85%', toggleActions: 'play none none reverse' } });
  ScrollTrigger.create({ trigger: '.ft-giant', start: 'top 90%', onEnter: () => $('.ft-giant').classList.add('is-filled'), onLeaveBack: () => $('.ft-giant').classList.remove('is-filled') });

  ScrollTrigger.create({ trigger: '#especificacoes', start: 'top 55%', onEnter: () => nav('#especificacoes'), onLeaveBack: () => nav('#tinta') });
}

/* ---------- Movimento reduzido: estado final estático ---------- */
function staticFinal() {
  state.smooth = state.target = state.duration; state.progress = 1;
  gsap.set('#inkPath', { drawSVG: '100%' }); gsap.set('#inkCota', { opacity: 1 });
}

/* ---------- Boot ---------- */
buildInk();
setupNav();
setupMagnetic();
if (DEBUG) setupDebug();
document.fonts.ready.then(intro);

if (REDUCED) {
  staticFinal();
  setupFold2();
  setupFold3();
  setupFold4();
} else {
  setupScroll();
  setupCursor();
  unlockVideo();
  requestAnimationFrame(loop);
  loadVideo().then(() => {
    state.ready = true;
    setupTriggers();
    document.fonts.ready.then(() => { setupFold2(); setupFold3(); setupFold4(); ScrollTrigger.refresh(); });
    ScrollTrigger.refresh();
    // ?debug&p=0.5 → pula direto para um ponto do scroll (para calibrar / testar)
    if (params.has('p')) {
      const p = Math.min(1, Math.max(0, parseFloat(params.get('p')) || 0));
      lenis.scrollTo(hero.offsetTop + p * (hero.offsetHeight - innerHeight), { immediate: true, force: true });
      ScrollTrigger.update();
    }
  });
}
