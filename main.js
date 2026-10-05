(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header background once the page scrolls
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Horizon fades out and sinks slightly as the hero scrolls away
  const horizon = document.querySelector('.horizon');
  let horizonQueued = false;
  const updateHorizon = () => {
    horizonQueued = false;
    const p = Math.min(1, window.scrollY / (window.innerHeight * 0.6));
    horizon.style.setProperty('--fade', (1 - p).toFixed(3));
    horizon.style.setProperty('--sink', `${(p * 60).toFixed(1)}px`);
  };
  window.addEventListener('scroll', () => {
    if (!horizonQueued) { horizonQueued = true; requestAnimationFrame(updateHorizon); }
  }, { passive: true });
  updateHorizon();

  // Hero headline: 질문으로 구조화 → 설계 → 진단, then 질문 flips to 답 first
  // and only after that do the answer words 실행 → 구현 → 처방 follow.
  const makeSlot = (el) => {
    const words = [...el.children];
    const fit = () => { el.style.width = `${words.find((w) => w.classList.contains('is-active')).offsetWidth}px`; };
    const set = (i) => {
      // When the cycle wraps, the incoming word is parked above; drop it below
      // without animating so it still rises into place
      const next = words[i];
      if (next.classList.contains('is-past')) {
        next.style.transition = 'none';
        next.classList.remove('is-past');
        void next.offsetWidth;
        next.style.transition = '';
      }
      words.forEach((w, j) => {
        w.classList.toggle('is-active', j === i);
        w.classList.toggle('is-past', j < i);
      });
      fit();
    };
    return { set, fit };
  };
  const kindSlot = makeSlot(document.querySelector('[data-slot="kind"]'));
  const verbSlot = makeSlot(document.querySelector('[data-slot="verb"]'));
  // [kind index, verb index]: 질문 → 구조화/설계/진단, 답 → 실행/구현/처방
  const steps = [[0, 0], [0, 1], [0, 2], [1, 3], [1, 4], [1, 5]];
  let step = 0;
  kindSlot.set(0); verbSlot.set(0);

  setInterval(() => {
    const prevKind = steps[step][0];
    step = (step + 1) % steps.length;
    const [kind, verb] = steps[step];
    if (kind !== prevKind) {
      kindSlot.set(kind);
      setTimeout(() => verbSlot.set(verb), reduceMotion ? 0 : 700);
    } else {
      verbSlot.set(verb);
    }
  }, 2600);

  const refit = () => { kindSlot.fit(); verbSlot.fit(); };
  window.addEventListener('resize', refit);
  if (document.fonts) document.fonts.ready.then(refit);

  // Waveform canvas
  const cv = document.querySelector('[data-wave]');
  const g = cv.getContext('2d');
  // Siri-style glow: translucent colour lobes that swell and drift, added
  // together so overlaps burn toward white, plus a thin white ribbon at the core.
  const lobes = [
    { rgb: '255, 168, 64', k: 1.5, speed: 1 / 900, amp: 1.0, shift: 0.0 },   // orange
    { rgb: '86, 132, 255', k: 2.1, speed: -1 / 750, amp: 0.7, shift: 1.6 },  // blue
    { rgb: '240, 118, 226', k: 1.9, speed: 1 / 680, amp: 0.75, shift: 3.1 },  // pink
    { rgb: '72, 200, 88', k: 1.4, speed: -1 / 1000, amp: 0.95, shift: 4.4 }, // green
  ];
  const canFilter = typeof g.filter === 'string';
  let W = 0, H = 0;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // Bell-shaped attenuation (siriwave): 1 at the centre, 0 toward the ends
  const atten = (u) => Math.pow(4 / (4 + Math.pow(u, 4)), 4);
  const STEP = 3;
  const SQUEEZE = 1.7;
  const uAt = (x) => ((x / W) * 4 - 2) * SQUEEZE;

  const lobePath = (cy, A, k, ph, x0) => {
    g.beginPath(); g.moveTo(0, cy);
    for (let x = 0; x <= W; x += STEP) {
      const u = uAt(x) - x0;
      g.lineTo(x, cy - A * atten(u) * Math.sin(k * u - ph));
    }
    g.lineTo(W, cy); g.closePath();
  };

  const drawLobes = (cy, maxA, t, alpha) => {
    lobes.forEach((l, i) => {
      // Each lobe breathes in amplitude and drifts slightly sideways
      const A = maxA * l.amp * (0.7 + 0.3 * Math.sin(t / (1300 + i * 270) + l.shift));
      const x0 = 0.25 * Math.sin(t / (2100 + i * 400) + l.shift);
      const grad = g.createLinearGradient(0, cy - maxA, 0, cy + maxA);
      grad.addColorStop(0, `rgba(${l.rgb}, 0.15)`);
      grad.addColorStop(0.5, `rgba(${l.rgb}, ${alpha})`);
      grad.addColorStop(1, `rgba(${l.rgb}, 0.15)`);
      g.fillStyle = grad;
      lobePath(cy, A, l.k, t * l.speed + l.shift, x0);
      g.fill();
    });
  };

  const draw = (t) => {
    g.clearRect(0, 0, W, H);
    const cy = H / 2, maxA = H * 0.38;
    g.globalCompositeOperation = 'lighter';

    // Soft glow pass, then a tighter pass for definition
    if (canFilter) g.filter = 'blur(14px)';
    drawLobes(cy, maxA, t, 0.55);
    if (canFilter) g.filter = 'blur(3px)';
    drawLobes(cy, maxA, t, 0.35);
    if (canFilter) g.filter = 'none';

    // White ribbon twisting through the centre
    g.shadowColor = 'rgba(255, 255, 255, 0.9)'; g.shadowBlur = 16;
    g.lineWidth = 2;
    [0, Math.PI].forEach((off, i) => {
      // Fade the ribbon out toward both ends instead of a hard straight line
      const a = i ? 0.55 : 0.85;
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(0.5, `rgba(255, 255, 255, ${a})`);
      grad.addColorStop(0.8, 'rgba(255, 255, 255, 0)');
      g.strokeStyle = grad;
      g.beginPath();
      for (let x = 0; x <= W; x += STEP) {
        const u = uAt(x);
        const y = cy - maxA * 0.22 * atten(u * 1.15) * Math.sin(2.2 * u - t / 520 + off);
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    });
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-over';
  };

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);

  const loop = (now) => {
    if (visible) draw(now);
    requestAnimationFrame(loop);
  };

  resize();
  window.addEventListener('resize', () => { resize(); if (reduceMotion) draw(0); });
  if (reduceMotion) draw(0); else requestAnimationFrame(loop);
})();
