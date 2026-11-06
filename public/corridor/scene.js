const THREE = await import('./vendor/three.module.js').catch(error => { window.enicoBoot.fail(); throw error; });

const CHANNEL = 'enico-corridor-v1';
let parentOverlayOpen = false;
let bridgeState = { cartCount: 0, cartIds: [], myPageLabel: '마이페이지', overlayOpen: false };
let resolveCatalog;
let initialized = false;
const catalogReady = new Promise(resolve => { resolveCatalog = resolve; });
function send(type, payload = {}) {
  if (parent !== window) parent.postMessage({ channel: CHANNEL, type, ...payload }, location.origin);
}
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || !event.data || event.data.channel !== CHANNEL) return;
  const message = event.data;
  if (message.type === 'catalog' && Array.isArray(message.pieces) && Array.isArray(message.collections)) {
    if (!initialized) { initialized = true; resolveCatalog(message); }
    else if (window.corridor) updateCatalog(message);
  }
  if (message.type === 'state') {
    bridgeState = message;
    if (window.corridor) applyBridgeState();
  }
  if (message.type === 'toast' && typeof message.message === 'string') showToast(message.message);
  if (message.type === 'dismiss' && window.corridor) closeDetail();
});
send('ready');
const CATALOG = await catalogReady;
const PIECES = CATALOG.pieces;
const COLLECTIONS = CATALOG.collections;
const ALL_ITEMS = [
  ...PIECES.map((p, idx) => ({ ...p, globalIdx: idx, isCollection: false })),
  ...COLLECTIONS.map((c, cIdx) => ({
    ...c,
    globalIdx: PIECES.length + cIdx,
    isCollection: true,
    cat: 'Collection',
    catEn: c.season || 'Collection',
    priceText: `${c.itemsCount} Looks`,
  })),
];


const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function updateCartBadge() {
  const count = Number.isSafeInteger(bridgeState.cartCount) ? bridgeState.cartCount : 0;
  $('cartCountDesktop').textContent = count;
  $('cartCountMobile').textContent = count;
}
updateCartBadge();

/* ============================================================
   Three.js 3D Corridor Scene
   ============================================================ */
const canvas = $('scene');
const isMobile = () => innerWidth <= 820;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); window.enicoBoot.fail(); });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile() ? 1.5 : 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 420);

const BG_COLOR = 0xf8f9fa;
const LINE_COLOR = 0x8a8e96;
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.Fog(BG_COLOR, 18, 105);

// Curved corridor path ending in a straight gallery hall for the 3 Collection Frames
const pts = [new THREE.Vector3(0, 0, 16), new THREE.Vector3(0, 0, 4)];
for (let i = 1; i <= 15; i++) {
  const d = Math.min(1, i / 3);
  pts.push(new THREE.Vector3(
    Math.sin(i * 0.85) * 10.5 * d,
    Math.sin(i * 0.58 + 0.5) * 3.4 * d,
    4 - i * 22
  ));
}
const lastP = pts[pts.length - 1];
pts.push(new THREE.Vector3(lastP.x, lastP.y, lastP.z - 22));
pts.push(new THREE.Vector3(lastP.x, lastP.y, lastP.z - 44));
pts.push(new THREE.Vector3(lastP.x, lastP.y, lastP.z - 66));

const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
const LEN = curve.getLength();
const ENTRY = 12 / LEN;
const HW = 4.7, HH = 3.4;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function frameAt(u) {
  u = THREE.MathUtils.clamp(u, 0, 1);
  const p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
  const r = new THREE.Vector3().crossVectors(t, WORLD_UP).normalize();
  const up = new THREE.Vector3().crossVectors(r, t).normalize();
  return { p, t, r, up };
}

const lineMat = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0, fog: true });
{
  const seg = [], STEP = 1.65 / LEN, ACROSS_W = 6, ACROSS_H = 4;
  const corner = (f, a, b) => f.p.clone().addScaledVector(f.r, a).addScaledVector(f.up, b);
  const rings = [];
  for (let u = ENTRY; u <= 0.985; u += STEP) rings.push(frameAt(u));
  const rails = [];
  for (let k = 0; k <= ACROSS_W; k++) { const a = -HW + (2 * HW) * k / ACROSS_W; rails.push([a, -HH], [a, HH]); }
  for (let k = 1; k < ACROSS_H; k++) { const b = -HH + (2 * HH) * k / ACROSS_H; rails.push([-HW, b], [HW, b]); }
  for (let i = 0; i < rings.length; i++) {
    const f = rings[i], c = [corner(f, -HW, -HH), corner(f, HW, -HH), corner(f, HW, HH), corner(f, -HW, HH)];
    for (let k = 0; k < 4; k++) seg.push(c[k], c[(k + 1) % 4]);
    if (i) for (const [a, b] of rails) seg.push(corner(rings[i - 1], a, b), corner(f, a, b));
  }
  const fend = rings[rings.length - 1];
  for (let k = 1; k < ACROSS_W; k++) {
    const a = -HW + (2 * HW) * k / ACROSS_W;
    seg.push(corner(fend, a, -HH), corner(fend, a, HH));
  }
  for (let k = 1; k < ACROSS_H; k++) {
    const b = -HH + (2 * HH) * k / ACROSS_H;
    seg.push(corner(fend, -HW, b), corner(fend, HW, b));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(seg);
  scene.add(new THREE.LineSegments(geo, lineMat));
}

const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  const t = texLoader.load(url, undefined, undefined, () => {
    if (url === PIECES[0]?.cutoutImg || (!PIECES.length && url === COLLECTIONS[0]?.frameImg)) window.enicoBoot.fail();
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function createGarmentGeometry(w, h, seed = 1) {
  const geo = new THREE.PlaneGeometry(w, h, 20, 20);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const nx = pos.getX(k) / (w * 0.5), ny = pos.getY(k) / (h * 0.5);
    // Keep the upper attachment area still; a light fold remains below the clips.
    const drape = Math.max(0, (0.35 - ny) * 0.3);
    pos.setZ(k, Math.sin(nx * Math.PI * 3 + seed) * 0.045 * drape);
  }
  geo.computeVertexNormals();
  return geo;
}

const panels = [];
const GARMENT_ATTACHMENTS = PIECES.map(p => p.attachment);
const pieceTextures = PIECES.map(p => loadTex(p.cutoutImg));
const colTextures = COLLECTIONS.map(c => loadTex(c.frameImg));

const END_ALCOVE_U = 0.968;
const itemU = ALL_ITEMS.map((item, idx) => {
  if (item.isCollection) return END_ALCOVE_U;
  return ENTRY + 0.022 + (idx + 0.35) * ((0.905 - ENTRY - 0.022) / PIECES.length);
});

// Ceiling cables and clip hangers use the original cutout proportions and contours.
function addSuspension(mesh, f, w, h, i, echo) {
  const rig = new THREE.Group();
  rig.position.copy(mesh.position);
  rig.quaternion.copy(mesh.quaternion);
  const scale = echo ? 0.65 : 1;
  const material = new THREE.MeshBasicMaterial({
    color: 0x59616b, transparent: true, opacity: 0, fog: true,
  });
  const v = (x, y, z = 0.016) => new THREE.Vector3(x, y, z);
  const rod = (a, b, radius = 0.012 * scale) => {
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (length < 0.0001) return;
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), material);
    part.position.copy(a).add(b).multiplyScalar(0.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
    rig.add(part);
  };
  const clip = point => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.065 * scale, 0.10 * scale, 0.045 * scale), material);
    part.position.copy(point).add(v(0, -0.025 * scale, 0.016));
    rig.add(part);
  };
  const meta = GARMENT_ATTACHMENTS[i];
  const contact = point => v(w * (point[0] - 0.5), h * (0.5 - point[1]));
  const ring = center => {
    const part = new THREE.Mesh(new THREE.TorusGeometry(0.06 * scale, 0.009 * scale, 4, 16), material);
    part.position.copy(center);
    rig.add(part);
  };
  let hook;
  if (PIECES[i].mountStyle === 'existing') {
    // The camera shirt already includes its real hanger in the photograph.
    hook = contact(meta.center);
  } else if (PIECES[i].mountStyle === 'ring' || ['Bags', 'Dolls'].includes(PIECES[i].catEn)) {
    const point = contact(meta.center);
    ring(point.clone().add(v(0, 0.06 * scale, 0)));
    clip(point);
    hook = point.clone().add(v(0, 0.12 * scale, 0));
  } else {
    const left = contact(meta.left), right = contact(meta.right);
    const barY = h * 0.5 + 0.08 * scale;
    const leftBar = v(left.x, barY), rightBar = v(right.x, barY);
    const middle = v((left.x + right.x) * 0.5, barY + 0.23 * scale);
    rod(leftBar, rightBar);
    rod(leftBar, middle);
    rod(rightBar, middle);
    rod(leftBar, left, 0.008 * scale);
    rod(rightBar, right, 0.008 * scale);
    clip(left);
    clip(right);
    ring(middle.clone().add(v(0, 0.06 * scale, 0)));
    hook = middle.clone().add(v(0, 0.12 * scale, 0));
  }

  // Local Y follows the corridor ceiling, including its curves and slopes.
  const roofY = HH - mesh.position.clone().sub(f.p).dot(f.up);
  const roof = v(hook.x, roofY, hook.z);
  rod(hook, roof, 0.011 * scale);
  const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * scale, 0.065 * scale, 0.035, 10), material);
  anchor.position.copy(roof);
  rig.add(anchor);

  // A fine transverse cable ties each suspension point into the ceiling grid.
  const worldRoof = roof.clone().applyQuaternion(mesh.quaternion).add(mesh.position);
  const lateral = worldRoof.clone().sub(f.p).dot(f.r);
  const across = f.r.clone().applyQuaternion(mesh.quaternion.clone().invert());
  rod(
    roof.clone().addScaledVector(across, -HW + 0.08 - lateral),
    roof.clone().addScaledVector(across, HW - 0.08 - lateral),
    0.0065 * scale
  );

  const vertices = [];
  const vertex = new THREE.Vector3();
  for (const part of rig.children) {
    part.updateMatrix();
    const positions = part.geometry.attributes.position;
    const indices = part.geometry.index;
    const count = indices ? indices.count : positions.count;
    for (let k = 0; k < count; k++) {
      vertex.fromBufferAttribute(positions, indices ? indices.getX(k) : k).applyMatrix4(part.matrix);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    part.geometry.dispose();
  }
  rig.clear();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingSphere();
  rig.add(new THREE.Mesh(geometry, material));
  scene.add(rig);
  return { rig, material };
}

function hangGarment(i, u, w, h, along, yaw, topY, echo = false) {
  const f = frameAt(u);
  const y = f.up.clone();
  const n = f.t.clone().negate().applyAxisAngle(y, yaw).normalize();
  const x = new THREE.Vector3().crossVectors(y, n).normalize();
  const pos = f.p.clone()
    .addScaledVector(f.r, along)
    .addScaledVector(f.up, topY - h * 0.5);
  const mat = new THREE.MeshBasicMaterial({
    map: pieceTextures[i], transparent: true, alphaTest: 0.03,
    opacity: 0, fog: true, side: THREE.DoubleSide, forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(createGarmentGeometry(w, h, i + 1), mat);
  mesh.position.copy(pos);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  mesh.userData.globalIdx = i;
  scene.add(mesh);
  const suspension = addSuspension(mesh, f, w, h, i, echo);
  panels.push({
    mesh, i, n, x, y, w, h, echo, u, mount: 'wire',
    suspension, isCollection: false,
  });
}

// All main pieces hang upright inside the corridor, clear of its walls and floor.
PIECES.forEach((p, i) => {
  const aspect = GARMENT_ATTACHMENTS[i].aspect;
  const maxH = p.catEn === 'Dolls' ? 2.0 : p.catEn === 'Bags' ? 2.65 : p.catEn === 'Shirts' ? 3.6 : 4.0;
  const w = Math.min(3.25, maxH * aspect), h = w / aspect;
  const side = i % 2 === 0 ? 1 : -1;
  const yaw = side * (0.12 + (i % 3) * 0.07);
  const topY = (p.mountStyle === 'existing' ? 2.20 : 1.88) + [0.0, -0.12, 0.10, -0.04][i % 4];
  hangGarment(i, itemU[i], w, h, side * 1.95, yaw, topY);
});

// Smaller pieces also hang from ceiling cables on the opposite side of each bay.
for (let k = 0; k < PIECES.length - 1; k++) {
  const u = itemU[k] + (itemU[k + 1] - itemU[k]) * 0.52;
  const i = (k * 3 + 2) % PIECES.length;
  const aspect = GARMENT_ATTACHMENTS[i].aspect;
  const w = Math.min(2.05, 2.45 * aspect), h = w / aspect;
  const side = k % 2 === 0 ? -1 : 1;
  hangGarment(i, u, w, h, side * 2.45, -side * 0.22, 1.42 + (k % 3) * 0.16, true);
}

// 3 Framed Collections at the end of the corridor
{
  const f = frameAt(END_ALCOVE_U);
  const triptychSpecs = [
    { cIdx: 0, xOff:  0.0,  yOff: 0.05, zOff:  0.0,  yaw:  0.0,   w: 3.2, h: 4.0 }, // VOID (Center)
    { cIdx: 1, xOff: -3.10, yOff: 0.05, zOff:  0.70, yaw: -0.28,  w: 2.8, h: 3.5 }, // OTAKU (Left)
    { cIdx: 2, xOff:  3.10, yOff: 0.05, zOff:  0.70, yaw:  0.28,  w: 2.8, h: 3.5 }, // NomalLine (Right)
  ];
  COLLECTIONS.forEach((collection, cIdx) => {
    const { xOff, yOff, zOff, yaw, w, h } = triptychSpecs[cIdx] || { xOff: (cIdx % 2 ? -1 : 1) * 3.1, yOff: 0.05, zOff: (cIdx - 1) * 4.5, yaw: 0, w: 2.8, h: 3.5 };
    const globalIdx = PIECES.length + cIdx;
    const baseNormal = f.t.clone().negate();
    const upVec = f.up.clone();
    const n = baseNormal.clone().applyAxisAngle(upVec, yaw).normalize();
    const x = new THREE.Vector3().crossVectors(upVec, n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x).normalize();
    const pos = f.p.clone()
      .addScaledVector(f.r, xOff)
      .addScaledVector(f.up, yOff)
      .addScaledVector(f.t, zOff);

    const mat = new THREE.MeshBasicMaterial({
      map: colTextures[cIdx],
      transparent: true,
      opacity: 0,
      fog: true,
      side: THREE.DoubleSide, forceSinglePass: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    mesh.userData.globalIdx = globalIdx;
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x111113, fog: true });
    const frameBack = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.14), boxMat);
    frameBack.position.set(0, 0, -0.08);
    mesh.add(frameBack);
    scene.add(mesh);
    panels.push({
      mesh,
      i: globalIdx,
      n, x, y, w, h,
      echo: false,
      u: END_ALCOVE_U,
      mount: 'collection',
      isCollection: true,
      cIdx,
    });
  });
}

/* ============================================================
   HUD & Navigation
   ============================================================ */
const uiAnimations = new WeakMap();
const overlayTransitions = new WeakMap();
let pageLock = null, pendingNavigation = null, lastScrollAt = -Infinity;
let modalReturnFocus = null, detailReturnFocus = null;

function animateUI(element, keyframes, options = {}) {
  uiAnimations.get(element)?.cancel();
  if (reduceMotion) return null;
  const animation = element.animate(keyframes, {
    duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)', ...options,
  });
  uiAnimations.set(element, animation);
  return animation;
}

function syncScrollLock() {
  const modalOpen = parentOverlayOpen;
  const menuOpen = !$('mobileMenuOverlay').hidden;
  const locked = modalOpen || menuOpen;
  document.querySelector('.site-header').inert = opened !== null || locked;
  document.querySelector('.hud').inert = modalOpen || menuOpen;
  $('mobileMenuOverlay').inert = modalOpen;
  if (locked && !pageLock) {
    cancelNavigation();
    const y = scrollY;
    scrollTo({ top: y, behavior: 'instant' });
    pageLock = { y, progress: prog };
    progTarget = prog;
    document.body.style.setProperty('--page-lock-top', -y + 'px');
    document.documentElement.classList.add('scene-locked');
    document.body.classList.add('locked');
  } else if (!locked && pageLock) {
    const saved = pageLock;
    document.body.classList.remove('locked');
    document.documentElement.classList.remove('scene-locked');
    document.body.style.removeProperty('--page-lock-top');
    scrollTo({ top: saved.y, behavior: 'instant' });
    pageLock = null;
    progTarget = THREE.MathUtils.clamp(saved.y / maxScroll(), 0, 1);
  }
}

function setOverlayVisible(element, show) {
  const previous = overlayTransitions.get(element);
  if (previous?.show === show && !previous.done) return previous.promise;
  if (show && !element.hidden && previous?.show && previous.done) { syncScrollLock(); return Promise.resolve(true); }
  previous?.animations.forEach(animation => animation.cancel());
  if (!show && element.hidden) return Promise.resolve(true);
  const state = { show, done: false, animations: [] };
  overlayTransitions.set(element, state);
  element.hidden = false;
  element.style.pointerEvents = '';
  syncScrollLock();
  if (!reduceMotion) {
    const fade = element.animate(
      show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: show ? 180 : 150, easing: 'ease-out', fill: 'both' }
    );
    state.animations.push(fade);
    const surface = element.querySelector('nav');
    if (surface) {
      state.animations.push(surface.animate(
        show ? [{ transform: 'translateY(16px)' }, { transform: 'translateY(0)' }]
             : [{ transform: 'translateY(0)' }, { transform: 'translateY(8px)' }],
        { duration: show ? 240 : 150, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
      ));
    }
  }
  state.promise = Promise.all(state.animations.map(animation => animation.finished.catch(() => {}))).then(() => {
    if (overlayTransitions.get(element) !== state) return false;
    element.hidden = !show;
    element.style.pointerEvents = '';
    state.animations.forEach(animation => animation.cancel());
    state.done = true;
    syncScrollLock();
    return true;
  });
  return state.promise;
}

function restoreFocus(element) {
  if (element?.isConnected && !element.closest('[hidden], [inert]')) {
    element.focus({ preventScroll: true });
  }
}

const ticks = $('ticks');
let active = -1;

ALL_ITEMS.forEach((item, idx) => {
  const t = document.createElement('button');
  t.className = 'tick' + (item.isCollection ? ' col-tick' : '');
  t.type = 'button';
  const tickPrefix = item.isCollection ? `C0${item.num}` : pad(idx + 1);
  t.innerHTML = `<span>${tickPrefix} · ${escapeHTML(item.title)}</span><i></i>`;
  t.onclick = () => goTo(idx, { openOnArrival: item.isCollection });
  ticks.append(t);
});

function setActive(i) {
  if (i === active || i < 0 || i >= ALL_ITEMS.length) return;
  const item = ALL_ITEMS[i], titleEl = $('title'), first = active < 0;
  active = i;
  if (item.isCollection) {
    $('cur').textContent = `0${item.num}`;
    $('tot').textContent = `0${COLLECTIONS.length}`;
  } else {
    $('cur').textContent = pad(i + 1);
    $('tot').textContent = pad(PIECES.length);
  }
  $('subKo').textContent = item.sub || '';
  $('meta').textContent = `${item.catEn} · ${item.priceText}${item.isSoldOut ? ' · SOLD OUT' : ''}`;
  [...ticks.children].forEach((t, k) => t.classList.toggle('on', k === i));
  titleEl.textContent = item.title;
  titleEl.classList.remove('out', 'in');
  if (!first) animateUI(titleEl, [{ opacity: 0.45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }]);
}

const AHEAD = 0.026;
const U0 = 0.004;
const U1 = END_ALCOVE_U - (2.8 / LEN);
let prog = 0, progTarget = 0;
const maxScroll = () => Math.max(1, $('scroll').offsetHeight - innerHeight);
const scrollFor = i => {
  if (ALL_ITEMS[i]?.isCollection) return maxScroll();
  return ((itemU[i] - AHEAD - U0) / (U1 - U0)) * maxScroll();
};
function cancelNavigation() {
  if (!pendingNavigation) return;
  pendingNavigation = null;
  scrollTo({ top: scrollY, behavior: 'instant' });
}
function goTo(i, { openOnArrival = false } = {}) {
  if (!ALL_ITEMS[i]) return;
  cancelNavigation();
  if (opened !== null) closeDetail();
  const top = THREE.MathUtils.clamp(scrollFor(i), 0, maxScroll());
  pendingNavigation = { i, top, progress: top / maxScroll(), openOnArrival, deadline: performance.now() + 6000 };
  scrollTo({ top, behavior: reduceMotion ? 'instant' : 'smooth' });
}
addEventListener('scroll', () => {
  if (pageLock) return;
  lastScrollAt = performance.now();
  progTarget = THREE.MathUtils.clamp(scrollY / maxScroll(), 0, 1);
  if (opened !== null && Math.abs(scrollY - detailScrollOrigin) > 2) closeDetail();
}, { passive: true });
addEventListener('wheel', cancelNavigation, { passive: true });
addEventListener('touchstart', cancelNavigation, { passive: true });
addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) cancelNavigation();
});

$('logoHomeBtn').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('logoHomeBtn').click(); } };
$('logoHomeBtn').onclick = () => {
  cancelNavigation();
  closeDetail();
  scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' });
};
$('navColBtn').onclick = () => goTo(PIECES.length);

/* ============================================================
   Raycast & Detail Pose (Fixed so mobile & desktop NEVER cut off the garment!)
   ============================================================ */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), mouse = new THREE.Vector2();
const mouseTarget = new THREE.Vector2();
let hovered = null, opened = null, focusedPanel = null, cameraTransition = null;
let tapGesture = null, detailScrollOrigin = 0, scenePickBlockedUntil = 0;
const dPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };
const alphaMasks = new WeakMap();

function visibleAtHit(hit) {
  const texture = hit.object.material.map;
  const source = texture?.image;
  if (!source || !hit.uv) return true;
  if (!alphaMasks.has(texture)) {
    try {
      const scratch = document.createElement('canvas');
      scratch.width = Math.min(256, source.width);
      scratch.height = Math.max(1, Math.round(scratch.width * source.height / source.width));
      const context = scratch.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0, scratch.width, scratch.height);
      alphaMasks.set(texture, { pixels: context.getImageData(0, 0, scratch.width, scratch.height).data, w: scratch.width, h: scratch.height });
    } catch { alphaMasks.set(texture, null); }
  }
  const mask = alphaMasks.get(texture);
  if (!mask) return true;
  const x = THREE.MathUtils.clamp(Math.floor(hit.uv.x * mask.w), 0, mask.w - 1);
  const y = THREE.MathUtils.clamp(Math.floor((1 - hit.uv.y) * mask.h), 0, mask.h - 1);
  return mask.pixels[(y * mask.w + x) * 4 + 3] > 36;
}

function pick(event) {
  const rect = canvas.getBoundingClientRect();
  ptr.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(panels.map(panel => panel.mesh), false);
  const hit = hits.find(hit => hit.distance < 65 && visibleAtHit(hit));
  return hit ? panels.find(panel => panel.mesh === hit.object) : null;
}

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || performance.now() < scenePickBlockedUntil || parentOverlayOpen || !$('mobileMenuOverlay').hidden) return;
  cancelNavigation();
  tapGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, yScroll: scrollY, moved: false, time: performance.now() };
}, { passive: true });
canvas.addEventListener('pointermove', event => {
  if (tapGesture && event.pointerId === tapGesture.id && Math.hypot(event.clientX - tapGesture.x, event.clientY - tapGesture.y) > 9) tapGesture.moved = true;
  if (event.pointerType === 'touch' || pageLock) return;
  mouseTarget.set((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
  hovered = pick(event);
  canvas.classList.toggle('hover', !!hovered);
}, { passive: true });
canvas.addEventListener('pointerleave', () => {
  mouseTarget.set(0, 0); hovered = null; canvas.classList.remove('hover');
});
canvas.addEventListener('pointercancel', () => { tapGesture = null; }, { passive: true });
canvas.addEventListener('pointerup', event => {
  const tap = tapGesture;
  tapGesture = null;
  if (performance.now() < scenePickBlockedUntil || parentOverlayOpen || !$('mobileMenuOverlay').hidden || !tap || tap.id !== event.pointerId || tap.moved || Math.abs(scrollY - tap.yScroll) > 4 ||
      performance.now() - tap.time > 700 || performance.now() - lastScrollAt < 90) return;
  if (opened !== null) { closeDetail(); return; }
  const panel = pick(event);
  if (panel) openPanel(panel);
}, { passive: true });
canvas.addEventListener('click', event => {
  if (event.detail !== 0 || performance.now() < scenePickBlockedUntil || parentOverlayOpen || !$('mobileMenuOverlay').hidden) return;
  if (opened !== null) { closeDetail(); return; }
  const panel = pick(event);
  if (panel) openPanel(panel);
});

function beginCameraTransition(duration = 650) {
  cameraTransition = {
    start: performance.now(), duration: reduceMotion ? 0 : duration,
    pos: camera.position.clone(), look: cLook.clone(), up: camera.up.clone(),
  };
}

function detailPose(panel) {
  const card = $('detail');
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!panel || !card || card.hidden || width <= 0 || height <= 0) return false;
  // An iframe can temporarily lose its layout during parent overlay transitions.
  const layoutParent = card.offsetParent;
  if (!layoutParent || card.offsetWidth <= 0 || card.offsetHeight <= 0) return false;
  const parent = layoutParent.getBoundingClientRect();
  const surface = canvas.getBoundingClientRect();
  if (parent.width <= 0 || parent.height <= 0 || surface.width <= 0 || surface.height <= 0) return false;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), aspect = width / height;
  const mobile = isMobile(), sideCard = !mobile || width > height;
  // Layout coordinates exclude the card's entry animation.
  const cardLeft = parent.left + card.offsetLeft - surface.left;
  const cardTop = parent.top + card.offsetTop - surface.top;
  const area = sideCard
    ? { left: 20, right: Math.max(80, cardLeft - 20), top: 20, bottom: height - 20 }
    : { left: 16, right: width - 16, top: 16, bottom: Math.max(80, cardTop - 16) };
  const availableW = Math.max(48, area.right - area.left) * 0.9;
  const availableH = Math.max(48, area.bottom - area.top) * 0.9;
  const framingH = panel.h + (panel.suspension ? 0.5 : 0);
  const d = Math.max(
    framingH / (2 * tan * availableH / height),
    panel.w / (2 * tan * aspect * availableW / width)
  );
  const center = panel.mesh.position.clone().addScaledVector(panel.y, panel.suspension ? 0.25 : 0);
  const visibleW = 2 * d * tan * aspect, visibleH = 2 * d * tan;
  const shiftX = (0.5 - (area.left + area.right) / (2 * width)) * visibleW;
  const shiftY = ((area.top + area.bottom) / (2 * height) - 0.5) * visibleH;
  dPose.look.copy(center).addScaledVector(panel.x, shiftX).addScaledVector(panel.y, shiftY);
  dPose.pos.copy(dPose.look).addScaledVector(panel.n, d);
  dPose.up.copy(panel.y).normalize();
  return true;
}

function fillDetail(idx) {
  const item = ALL_ITEMS[idx];
  $('dCat').textContent = item.catEn;
  $('dTitle').textContent = item.title;
  $('dSub').textContent = item.sub || '';
  $('dPrice').textContent = item.isSoldOut ? `${item.priceText} · SOLD OUT` : item.priceText;
  $('dPrice').classList.toggle('sold-out', Boolean(item.isSoldOut));
  $('dAddCartBtn').disabled = Boolean(item.isSoldOut);

  // Un-cropped object-contain thumbnails; clicking opens full un-cropped Product/Collection Detail Modal!
  const thumbs = $('dThumbs');
  thumbs.innerHTML = '';
  (item.gallery || []).slice(0, 4).forEach((gUrl, gIdx) => {
    const b = document.createElement('button');
    b.className = 'd-thumb' + (gIdx === 0 ? ' on' : '');
    b.type = 'button';
    b.innerHTML = `<img src="${escapeHTML(gUrl)}" alt="${escapeHTML(item.title)} ${gIdx + 1}" loading="lazy" decoding="async">`;
    b.onclick = () => {
      if (item.isCollection) openModal('collectionDetail', { id: item.id, imgIdx: gIdx });
      else openModal('productDetail', { prodIdx: idx, imgIdx: gIdx });
    };
    thumbs.append(b);
  });

  if (item.isCollection) {
    $('dAddCartBtn').textContent = `컬렉션 룩북 열기 (${item.itemsCount}장)`;
    $('dAddCartBtn').onclick = () => openModal('collectionDetail', { id: item.id, imgIdx: 0 });
    $('dFullViewBtn').textContent = '다른 컬렉션 보기';
    $('dFullViewBtn').onclick = () => openPanelByIndex(PIECES.length + (item.num % COLLECTIONS.length));
  } else {
    $('dAddCartBtn').textContent = item.isSoldOut ? '품절 · SOLD OUT' : bridgeState.cartIds.includes(item.id) ? '장바구니에 담긴 상품' : '장바구니 담기';
    $('dAddCartBtn').onclick = () => {
      if (!item.isSoldOut) send('add-to-cart', { id: item.id });
    };
    $('dFullViewBtn').textContent = '사진·상세 보기';
    $('dFullViewBtn').onclick = () => openModal('productDetail', { prodIdx: idx, imgIdx: 0 });
  }
}

function openPanel(panel) {
  cancelNavigation();
  if (opened === null) detailReturnFocus = document.activeElement;
  opened = panel.i;
  detailScrollOrigin = pageLock ? pageLock.y : scrollY;
  focusedPanel = panel;
  setActive(panel.i);
  fillDetail(panel.i);
  send('select', { id: ALL_ITEMS[panel.i].id, kind: ALL_ITEMS[panel.i].isCollection ? 'collection' : 'product' });
  document.body.classList.add('open');
  $('detail').hidden = false;
  $('detail').scrollTop = 0;
  if (detailPose(panel)) beginCameraTransition(isMobile() ? 580 : 680);
  hovered = null;
  mouseTarget.set(0, 0);
  canvas.classList.remove('hover');
  syncScrollLock();
}
function openPanelByIndex(idx) {
  const main = panels.find(panel => panel.i === idx && !panel.echo);
  if (main) openPanel(main);
}
function closeDetail() {
  if (opened === null) return;
  tapGesture = null;
  scenePickBlockedUntil = Math.max(scenePickBlockedUntil, performance.now() + 250);
  opened = null;
  focusedPanel = null;
  beginCameraTransition(isMobile() ? 520 : 620);
  document.body.classList.remove('open');
  $('detail').hidden = true;
  syncScrollLock();
  restoreFocus(detailReturnFocus);
}
$('closeBtn').onclick = closeDetail;
$('dPrev').onclick = () => openPanelByIndex((opened - 1 + ALL_ITEMS.length) % ALL_ITEMS.length);
$('dNext').onclick = () => openPanelByIndex((opened + 1) % ALL_ITEMS.length);

/* ============================================================
   Mobile Menu Controls
   ============================================================ */
function openMenu() {
  setOverlayVisible($('mobileMenuOverlay'), true);
  requestAnimationFrame(() => $('mobileMenuClose').focus({ preventScroll: true }));
}
function closeMenu() {
  return setOverlayVisible($('mobileMenuOverlay'), false).then(closed => {
    if (closed) restoreFocus($('mobileMenuBtn'));
    return closed;
  });
}
$('mobileMenuBtn').onclick = openMenu;
$('mobileMenuClose').onclick = closeMenu;
document.querySelectorAll('[data-m-action]').forEach(button => {
  button.onclick = async () => {
    const act = button.dataset.mAction;
    if (act === 'collection') {
      if (await closeMenu()) goTo(PIECES.length);
    } else {
      openModal(act);
      closeMenu();
    }
  };
});

/* ============================================================
   Original enicoveck.com Modals (ProductDetailPopup, CollectionDetailPopup, CartOverlay, InfoPopup)
   ============================================================ */
function openModal(type, payload = {}) {
  modalReturnFocus = (!$('mobileMenuOverlay').hidden || $('mobileMenuOverlay').contains(document.activeElement)) ? $('mobileMenuBtn') : document.activeElement;
  if (type === 'productDetail') {
    const item = PIECES[payload.prodIdx];
    if (item) send('open-product', { id: item.id, imageIndex: payload.imgIdx || 0 });
  } else if (type === 'collectionDetail') {
    const item = payload.id ? COLLECTIONS.find(collection => collection.id === payload.id) : COLLECTIONS[payload.colIdx];
    if (item) send('open-collection', { id: item.id, imageIndex: payload.imgIdx || 0 });
  } else if (type === 'cart') send('open-cart');
  else if (type === 'community') send('open-community');
  else if (type === 'shop') send('open-shop-info');
  else if (['about', 'contact', 'mypage'].includes(type)) send('open-info', { info: type });
}
function closeModal() { send('close-overlay'); }
function bindOutsideScroll(surface, active, dismiss) {
  let gesture = null;
  surface.addEventListener('wheel', event => {
    if (event.target !== surface || !active() || event.ctrlKey || Math.abs(event.deltaY) < 1 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    dismiss();
  }, { passive: true });
  surface.addEventListener('touchstart', event => {
    gesture = event.target === surface && active() && event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  surface.addEventListener('touchmove', event => {
    if (!gesture || !active() || event.touches.length !== 1) { gesture = null; return; }
    const dx = event.touches[0].clientX - gesture.x, dy = event.touches[0].clientY - gesture.y;
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.2) { gesture = null; dismiss(); }
  }, { passive: true });
  surface.addEventListener('touchend', () => { gesture = null; }, { passive: true });
  surface.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
}
bindOutsideScroll(canvas, () => opened !== null && !parentOverlayOpen && $('mobileMenuOverlay').hidden, closeDetail);
function applyBridgeState() {
  const wasOpen = parentOverlayOpen;
  parentOverlayOpen = Boolean(bridgeState.overlayOpen);
  updateCartBadge();
  document.querySelector('[data-modal="mypage"]').textContent = '04 /// ' + bridgeState.myPageLabel;
  document.querySelector('[data-m-action="mypage"]').textContent = bridgeState.myPageLabel;
  syncScrollLock();
  if (opened !== null) fillDetail(opened);
  if (wasOpen && !parentOverlayOpen) {
    closeDetail();
    restoreFocus(modalReturnFocus);
  }
}
function updateCatalog(catalog) {
  const products = new Map(catalog.pieces.map(item => [item.id, item]));
  const collections = new Map(catalog.collections.map(item => [item.id, item]));
  for (const piece of PIECES) { const next = products.get(piece.id); if (next) Object.assign(piece, next); }
  for (const collection of COLLECTIONS) { const next = collections.get(collection.id); if (next) Object.assign(collection, next); }
  for (const item of ALL_ITEMS) {
    const next = item.isCollection ? collections.get(item.id) : products.get(item.id);
    if (next) Object.assign(item, next, item.isCollection ? { catEn: next.season || 'Collection', priceText: `${next.itemsCount} Looks` } : {});
  }
  const previous = active; active = -1; setActive(previous);
  if (opened !== null) fillDetail(opened);
}

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.onclick = () => openModal(btn.dataset.modal);
});
$('desktopCartBtn').onclick = () => openModal('cart');

addEventListener('keydown', event => {
  const layer = !$('mobileMenuOverlay').hidden ? $('mobileMenuOverlay') : opened !== null ? $('detail') : null;
  if (event.key === 'Escape') {
    if (parentOverlayOpen) closeModal();
    else if (!$('mobileMenuOverlay').hidden) closeMenu();
    else if (opened !== null) closeDetail();
    if (layer) event.preventDefault();
  }
  if (event.key === 'Tab' && layer) {
    const controls = [...layer.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !layer.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }
});

/* ============================================================
   Render Loop
   ============================================================ */
let lineTarget = 0.52, start = performance.now(), last = start;
const sPos = new THREE.Vector3(), sLook = new THREE.Vector3(), sUp = new THREE.Vector3();
const cPos = new THREE.Vector3(), cLook = new THREE.Vector3(), cUp = new THREE.Vector3();

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isMobile() ? 76 : 66;
  camera.updateProjectionMatrix();
  if (focusedPanel && !parentOverlayOpen && !$('detail').hidden) {
    if (detailPose(focusedPanel)) beginCameraTransition(280);
  } else if (!pageLock) {
    progTarget = THREE.MathUtils.clamp(scrollY / maxScroll(), 0, 1);
  }
}
addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
let detailSize = '';
new ResizeObserver(() => {
  if (!focusedPanel || parentOverlayOpen || $('detail').hidden) return;
  const size = $('detail').offsetWidth + ':' + $('detail').offsetHeight;
  if (size === detailSize || !detailPose(focusedPanel)) return;
  detailSize = size;
  if (!cameraTransition) beginCameraTransition(240);
}).observe($('detail'));
resize();

const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

function frame(now) {
  if (document.hidden || parentOverlayOpen) { last = now; requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const age = (now - start) / 1000;
  const intro = reduceMotion ? 1 : THREE.MathUtils.clamp((age - 0.15) / 1.2, 0, 1);

  lineMat.opacity += ((lineTarget * intro) - lineMat.opacity) * Math.min(1, dt * 6);
  panels.forEach(p => {
    const introOpacity = THREE.MathUtils.smoothstep(intro, 0.16, 0.82);
    p.mesh.material.opacity = p === focusedPanel ? 1 : (p.echo ? 0.85 : 1) * introOpacity;
    if (p.suspension) p.suspension.material.opacity = p.mesh.material.opacity;
  });

  if (!pageLock) prog += (progTarget - prog) * (reduceMotion ? 1 : 1 - Math.exp(-dt * (isMobile() ? 14 : 10)));
  mouse.lerp(mouseTarget, reduceMotion ? 1 : 1 - Math.exp(-dt * 7));
  const u = U0 + (U1 - U0) * prog - (1 - ease(intro)) * 0.01;
  const f = frameAt(u), fa = frameAt(Math.min(1, u + 0.014));
  const par = (reduceMotion || isMobile()) ? 0 : 1;

  sPos.copy(f.p);
  sLook.copy(fa.p).addScaledVector(fa.r, mouse.x * 0.3 * par).addScaledVector(fa.up, -mouse.y * 0.18 * par);
  sUp.copy(f.up);

  const targetPos = opened !== null ? dPose.pos : sPos;
  const targetLook = opened !== null ? dPose.look : sLook;
  const targetUp = opened !== null ? dPose.up : sUp;
  if (cameraTransition) {
    const t = cameraTransition.duration === 0 ? 1 : THREE.MathUtils.clamp((now - cameraTransition.start) / cameraTransition.duration, 0, 1);
    const blend = ease(t);
    cPos.lerpVectors(cameraTransition.pos, targetPos, blend);
    cLook.lerpVectors(cameraTransition.look, targetLook, blend);
    cUp.lerpVectors(cameraTransition.up, targetUp, blend).normalize();
    if (t === 1) cameraTransition = null;
  } else {
    cPos.copy(targetPos); cLook.copy(targetLook); cUp.copy(targetUp);
  }
  camera.position.copy(cPos);
  camera.up.copy(cUp);
  camera.lookAt(cLook);

  let best = 0, bd = Infinity;
  itemU.forEach((pu, i) => {
    const d = pu - u;
    const score = d < -0.005 ? Infinity : d;
    if (score < bd) { bd = score; best = i; }
  });
  if (bd === Infinity) best = Math.min(PIECES.length, ALL_ITEMS.length - 1);
  if (opened === null) setActive(best);
  if (pendingNavigation && !pageLock) {
    const navigation = pendingNavigation;
    if (Math.abs(scrollY - navigation.top) < 2 && (Math.abs(prog - navigation.progress) < 0.0008 || now > navigation.deadline)) {
      prog = navigation.progress;
      progTarget = navigation.progress;
      pendingNavigation = null;
      if (navigation.openOnArrival) openPanelByIndex(navigation.i);
    } else if (now > navigation.deadline) pendingNavigation = null;
  }

  panels.forEach(p => {
    const s = p.isCollection && p === hovered ? 1.04 : 1;
    p.mesh.scale.x += (s - p.mesh.scale.x) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 12));
    p.mesh.scale.y = p.mesh.scale.x;
  });

  // Pieces beyond the fully opaque fog cannot contribute to the image.
  const visibleDepth = scene.fog.far + 15;
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  for (const panel of panels) {
    const delta = panel.mesh.position.clone().sub(camera.position);
    const visible = delta.dot(cameraForward) < visibleDepth;
    panel.mesh.visible = visible;
    if (panel.suspension) panel.suspension.rig.visible = visible;
  }
  renderer.render(scene, camera);
  if (window.enicoBoot.state !== 'ready' && (pieceTextures[0]?.image?.complete || (!PIECES.length && colTextures[0]?.image?.complete))) window.enicoBoot.ready();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.corridor = {
  open: i => openPanelByIndex(i),
  close: closeDetail,
  goTo,
  modal: openModal,
  closeModal,
  setScrollProgress: p => {
    scrollTo({ top: p * maxScroll(), behavior: 'instant' });
    prog = p;
    progTarget = p;
  },
};
applyBridgeState();
send('scene-ready');
