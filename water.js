const KEY = "waterWords", SEED = 1 + Math.floor(Math.random() * 999983), RANKED = 200, CELL = 16, TILE = 64, GIVE_UP = 1500, GRAB = 60, MAX_WORDS = 3000, POWER_KEEP = 0.98, COOL = 0.97, GROW = 0.6;
const PHYSICS = { collide: 0.7, link: 0.2, bend: 0.015, tether: 1.6 };
const still = matchMedia("(prefers-reduced-motion: reduce)");
const $ = id => document.getElementById(id);
const measure = document.createElement("canvas").getContext("2d");
measure.textAlign = "center";
let config, defaults, set, world = null;
const mouse = { x: innerWidth / 2, y: innerHeight * 0.3 };

function shuffle(list, seed) {
  let s = seed;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  list.next = next;
  return list;
}

const inks = new Map();
function inkBox(text, weight, size, font, rot) {
  let ink = inks.get(weight + text);
  if (!ink) {
    measure.font = weight + " 100px " + font;
    const m = measure.measureText(text);
    inks.set(weight + text, ink = [m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent].map(v => v / 100));
  }
  const pad = 1 + size * 0.04, [left, right, up, down] = ink.map(v => v * size + pad);
  return rot ? [-up, -right, up + down, left + right] : [-left, -up, left + right, up + down];
}

const glyph = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
function wordMask(text, weight, size, font, rot, C, exact) {
  const [bx, by, bw, bh] = inkBox(text, weight, size, font, rot);
  const ox = Math.floor(bx / C), oy = Math.floor(by / C), gw = Math.ceil((bx + bw) / C) - ox, gh = Math.ceil((by + bh) / C) - oy;
  if (!exact || size < 16) return { ox, oy, gw, gh, cells: null };
  glyph.canvas.width = gw * C;
  glyph.canvas.height = gh * C;
  Object.assign(glyph, { font: weight + " " + size + "px " + font, textAlign: "center", lineWidth: 2 * (1 + size * 0.04), lineJoin: "round" });
  glyph.translate(-ox * C, -oy * C);
  if (rot) glyph.rotate(-Math.PI / 2);
  glyph.fillText(text, 0, 0);
  glyph.strokeText(text, 0, 0);
  const alpha = glyph.getImageData(0, 0, gw * C, gh * C).data, cells = new Uint8Array(gw * gh);
  for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 16) { const p = (i - 3) / 4, px = p % (gw * C), py = Math.floor(p / (gw * C)); cells[Math.floor(py / C) * gw + Math.floor(px / C)] = 1; }
  return { ox, oy, gw, gh, cells };
}

function dealSizes() {
  const words = shuffle(config.words.slice(), SEED), next = shuffle([], SEED + 1).next, dealt = [];
  for (const { share, size: [small, big] } of config.sizes) {
    for (let k = Math.round(share * RANKED); k > 0 && dealt.length < words.length; k--) dealt.push({ text: words[dealt.length], s: small + next() * (big - small) });
  }
  return dealt.sort((a, b) => b.s - a.s);
}

function placeWords(W, H, font) {
  const ranked = dealSizes();
  const aspect = W / H, area = W * H, C = area > 400000 ? 4 : 2, GW = Math.ceil(W / C), GH = Math.ceil(H / C), cells = [];
  for (let y = 0; y < H; y += C) for (let x = 0; x < W; x += C) cells.push([x, y, Math.hypot((x - W / 2) / aspect, y - H / 2)]);
  cells.sort((a, b) => a[2] - b[2]);
  const fits = (grid, x, y, m) => {
    const x0 = Math.round(x / C) + m.ox, y0 = Math.round(y / C) + m.oy;
    if (x0 < 0 || y0 < 0 || x0 + m.gw > GW || y0 + m.gh > GH) return false;
    for (let j = 0; j < m.gh; j++) for (let i = 0; i < m.gw; i++) if ((!m.cells || m.cells[j * m.gw + i]) && grid[(y0 + j) * GW + x0 + i]) return false;
    return true;
  };
  const take = (grid, x, y, m) => {
    const x0 = Math.round(x / C) + m.ox, y0 = Math.round(y / C) + m.oy;
    for (let j = 0; j < m.gh; j++) for (let i = 0; i < m.gw; i++) if (!m.cells || m.cells[j * m.gw + i]) grid[(y0 + j) * GW + x0 + i] = 1;
  };
  const snap = v => Math.round(v / C) * C;
  const placeAll = scale => {
    const next = shuffle([], SEED).next, grid = new Uint8Array(GW * GH), nodes = [], room = Math.sqrt(area / Math.max(12, ranked.length)) * 0.75;
    const MIN = Math.max(9, room * 0.12), MAX = (MIN + Math.min(96, room * 0.75)) * 2.6, sizeOf = s => (MIN + (MAX - MIN) * s) * scale;
    const spiral = (sx, sy, m) => {
      const start = next() * Math.PI * 2;
      for (let k = 0; k < 9000; k++) {
        const r = 0.12 * k, ang = start + 0.15 * k;
        if (r * Math.max(aspect, 1) > Math.max(W, H) * 0.75) return null;
        const x = sx + r * Math.cos(ang) * aspect, y = sy + r * Math.sin(ang);
        if (fits(grid, x, y, m)) return [x, y];
      }
      return null;
    };
    let missed = 0, inked = 0;
    const place = (text, size, weight, rot, m, spot) => {
      take(grid, spot[0], spot[1], m);
      const [, , bw, bh] = inkBox(text, weight, size, font, rot);
      inked += bw * bh;
      nodes.push({ text, x: snap(spot[0]), y: snap(spot[1]), size, weight, rot });
    };
    const [smallest, biggest] = config.fun.size, open = $("menu").open ? $("panel").getBoundingClientRect().left : W;
    for (const text of config.fun.words) {
      const size = sizeOf(smallest + next() * (biggest - smallest)), m = wordMask(text, 600, size, font, false, C, true);
      const spot = spiral(open * (0.15 + 0.7 * next()), H * (0.1 + 0.8 * next()), m);
      if (spot) place(text, size, 600, false, m, spot);
    }
    ranked.forEach((w, i) => {
      const size = sizeOf(w.s), weight = 400 + 100 * Math.round(3 * Math.sqrt(w.s)), rot = i > 1 && next() < 0.3, m = wordMask(w.text, weight, size, font, rot, C, true);
      let spot = spiral(W * ((0.5 + i * 0.7548776662 + SEED / 997) % 1), H * ((0.5 + i * 0.5698402910) % 1), m);
      if (!spot && i >= 10) spot = cells.find(([x, y]) => fits(grid, x, y, m));
      if (!spot) { if (i < 10) missed++; return; }
      place(w.text, size, weight, rot, m, spot);
    });
    return { grid, nodes, missed, covered: inked / area };
  };
  let placed, scale = 1;
  for (let tries = 0; tries < 7; tries++) {
    const attempt = placeAll(scale);
    if (attempt.missed && placed && !placed.missed) break;
    placed = attempt;
    if (attempt.missed) scale *= 0.88;
    else if (attempt.covered < 0.5) scale *= Math.min(1.5, Math.sqrt(0.5 / attempt.covered));
    else break;
  }
  const { grid, nodes } = placed, next = shuffle([], SEED + 99).next, queue = [];
  [[26, 8], [18, 6], [13, 4], [10, 2], [8, 1.5], [7, 1]].forEach(([base, spread], pass) => {
    for (const [x, y] of shuffle(cells.slice(), SEED + 7 + pass)) {
      if (nodes.length >= MAX_WORDS) break;
      if (grid[Math.floor(y / C) * GW + Math.floor(x / C)]) continue;
      const size = base + next() * spread;
      for (let tries = 0; tries < 10; tries++) {
        if (!queue.length) queue.push(...shuffle(config.words.slice(), SEED + nodes.length));
        const pick = tries % queue.length, rot = (tries + Math.floor(next() * 2)) % 2 === 1, m = wordMask(queue[pick], 400, size, font, rot, C);
        if (!fits(grid, x, y, m)) continue;
        take(grid, x, y, m);
        nodes.push({ text: queue[pick], x: snap(x), y: snap(y), size, weight: 400, rot });
        queue.splice(pick, 1);
        break;
      }
    }
  });
  return nodes;
}

function makeWorld(W, H) {
  const font = getComputedStyle(document.body).fontFamily, dpr = Math.min(2, devicePixelRatio || 1);
  const words = [], letters = [];
  placeWords(W, H, font).forEach((n, i) => {
    const size = Math.round(n.size * 2) / 2, style = n.weight + " " + size + "px " + font, colour = config.colours[i % config.colours.length];
    measure.font = style;
    const total = measure.measureText(n.text).width, [, by, , bh] = inkBox(n.text, n.weight, size, font, false);
    const oy = by + bh / 2, cos = n.rot ? 0 : 1, sin = n.rot ? -1 : 0, word = { first: letters.length, count: 0, awake: false };
    let prefix = "";
    for (const ch of n.text) {
      const before = measure.measureText(prefix).width, adv = measure.measureText(ch).width, lx = before + adv / 2 - total / 2;
      const hx = n.x + lx * cos - oy * sin, hy = n.y + lx * sin + oy * cos;
      prefix += ch;
      letters.push({ wi: words.length, ch, style, colour, size, oy, adv, h: bh, base: n.rot ? -Math.PI / 2 : 0,
        r: Math.max(adv, size * 0.2) * 0.48, hx, hy, x: hx, y: hy, vx: 0, vy: 0, awake: false, mark: 0, stamp: 0 });
      word.count++;
    }
    words.push(word);
  });
  for (const w of words) for (let i = 0; i < w.count; i++) {
    const k = w.first + i, l = letters[k];
    l.prev = i > 0 ? k - 1 : -1;
    l.next = i < w.count - 1 ? k + 1 : -1;
    l.next2 = i < w.count - 2 ? k + 2 : -1;
    if (l.next >= 0) l.rest = Math.hypot(letters[k + 1].hx - l.hx, letters[k + 1].hy - l.hy);
    if (l.next2 >= 0) l.rest2 = Math.hypot(letters[k + 2].hx - l.hx, letters[k + 2].hy - l.hy);
  }

  const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;
  const cover = (x, y, r, visit, size = CELL, across = cols, down = rows) => {
    const c0 = Math.max(0, Math.floor((x - r) / size)), c1 = Math.min(across - 1, Math.floor((x + r) / size));
    const r0 = Math.max(0, Math.floor((y - r) / size)), r1 = Math.min(down - 1, Math.floor((y + r) / size));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) visit(row * across + col);
  };
  const gridOf = () => {
    const grid = Array.from({ length: cols * rows }, () => []);
    letters.forEach(l => cover(l.hx, l.hy, l.r, c => grid[c].push(l)));
    return grid;
  };
  let grid = gridOf(), mark = 0;
  for (const a of letters) {
    mark++;
    cover(a.hx, a.hy, a.r, c => {
      for (const b of grid[c]) {
        if (b === a || b.wi === a.wi || b.mark === mark) continue;
        b.mark = mark;
        const d = Math.hypot(b.hx - a.hx, b.hy - a.hy);
        if (d < a.r + b.r) { const fit = Math.max(0.3, d * 0.98) / (a.r + b.r); a.r *= fit; b.r *= fit; }
      }
    });
  }
  grid = gridOf();

  const sprites = new Map();
  for (const l of letters) {
    const key = l.ch + l.style + l.colour;
    if (!sprites.has(key)) sprites.set(key, { l, pw: Math.ceil((l.adv + l.size * 0.6 + 4) * dpr), ph: Math.ceil((l.h + 4) * dpr) });
    l.sprite = sprites.get(key);
  }
  let sx = 0, sy = 0, row = 0;
  for (const s of sprites.values()) {
    if (sx + s.pw > 2048) { sx = 0; sy += row; row = 0; }
    Object.assign(s, { sx, sy });
    sx += s.pw;
    row = Math.max(row, s.ph);
  }
  const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  const sheet = canvas(2048, Math.max(1, sy + row)), ink = sheet.getContext("2d");
  ink.textAlign = "center";
  for (const s of sprites.values()) {
    ink.setTransform(dpr, 0, 0, dpr, s.sx + s.pw / 2, s.sy + s.ph / 2);
    Object.assign(ink, { font: s.l.style, fillStyle: s.l.colour });
    ink.fillText(s.l.ch, 0, -s.l.oy);
  }

  const tcols = Math.ceil(W / TILE), trows = Math.ceil(H / TILE), tiles = Array.from({ length: tcols * trows }, () => []);
  const tileCover = (l, visit) => cover(l.hx, l.hy, l.reach, visit, TILE, tcols, trows);
  letters.forEach(l => { l.reach = Math.hypot(l.sprite.pw, l.sprite.ph) / 2 / dpr; tileCover(l, t => tiles[t].push(l)); });

  const rest = canvas(Math.round(W * dpr), Math.round(H * dpr)), live = canvas(rest.width, rest.height);
  const restInk = rest.getContext("2d"), liveInk = live.getContext("2d");
  liveInk.textAlign = "center";
  const put = (ctx, l, x, y, angle, scale = 1) => {
    const s = l.sprite, c = Math.cos(angle) * scale, n = Math.sin(angle) * scale;
    ctx.setTransform(dpr * c, dpr * n, -dpr * n, dpr * c, dpr * x, dpr * y);
    ctx.drawImage(sheet, s.sx, s.sy, s.pw, s.ph, -s.pw / (2 * dpr), -s.ph / (2 * dpr), s.pw / dpr, s.ph / dpr);
  };
  const angleOf = l => {
    if (l.prev < 0 && l.next < 0) return l.base;
    const a = l.prev >= 0 ? letters[l.prev] : l, b = l.next >= 0 ? letters[l.next] : l;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  letters.forEach(l => put(restInk, l, l.hx, l.hy, l.base));

  const dirty = new Set();
  const redrawTiles = () => {
    for (const t of dirty) {
      const col = t % tcols, row = Math.floor(t / tcols), edge = n => Math.round(n * TILE * dpr);
      const x0 = edge(col), y0 = edge(row), w = edge(col + 1) - x0, h = edge(row + 1) - y0;
      restInk.save();
      restInk.setTransform(1, 0, 0, 1, 0, 0);
      restInk.beginPath();
      restInk.rect(x0, y0, w, h);
      restInk.clip();
      restInk.clearRect(x0, y0, w, h);
      for (const l of tiles[t]) if (!l.awake) put(restInk, l, l.hx, l.hy, l.base);
      restInk.restore();
    }
    dirty.clear();
  };
  const present = () => {
    liveInk.setTransform(1, 0, 0, 1, 0, 0);
    liveInk.clearRect(0, 0, live.width, live.height);
    const hot = [];
    for (const l of awake) if (l.heat > 0.02) hot.push(l); else put(liveInk, l, l.x, l.y, angleOf(l));
    for (const l of hot) {
      const h = l.heat, own = held && l.wi === held.wi, grow = 1 + GROW * h, j = own ? 4 * h * h * grow : 0;
      const x = own ? held.l.x + (l.x - held.l.x) * grow : l.x, y = own ? held.l.y + (l.y - held.l.y) * grow : l.y;
      Object.assign(liveInk, { globalAlpha: 1, shadowBlur: 0 });
      put(liveInk, l, x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, angleOf(l) + (Math.random() - 0.5) * j / 20, grow);
      const colour = `hsl(${45 - 40 * h} 90% ${70 - 12 * h}%)`;
      Object.assign(liveInk, { globalAlpha: 0.8 * h, font: l.style, fillStyle: colour, shadowColor: colour, shadowBlur: 10 * h });
      liveInk.fillText(l.ch, 0, -l.oy);
    }
    Object.assign(liveInk, { globalAlpha: 1, shadowBlur: 0 });
  };

  let awake = [], returning = 0, raf = 0, frame = 0, held = null;
  const awakeWords = new Set(), dynamic = new Map();
  const wakeWord = wi => {
    const w = words[wi];
    if (w.awake) return;
    w.awake = true;
    awakeWords.add(wi);
    for (let k = w.first; k < w.first + w.count; k++) { letters[k].awake = true; awake.push(letters[k]); tileCover(letters[k], t => dirty.add(t)); }
  };
  const sleepWord = wi => {
    Object.assign(words[wi], { awake: false, broken: false });
    awakeWords.delete(wi);
    for (let k = words[wi].first; k < words[wi].first + words[wi].count; k++) {
      Object.assign(letters[k], { awake: false, x: letters[k].hx, y: letters[k].hy, vx: 0, vy: 0, heat: 0 });
      tileCover(letters[k], t => dirty.add(t));
    }
  };
  const collide = (a, b) => {
    const dx = b.x + b.vx - a.x - a.vx, dy = b.y + b.vy - a.y - a.vy, reach = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) return false;
    const fade = Math.max(0, 1 - Math.max(0, returning - 180) / 420);
    const d = Math.sqrt(d2) || 1e-3, f = (reach - d) / d * PHYSICS.collide * fade, share = b.r * b.r / (a.r * a.r + b.r * b.r);
    a.vx -= dx * f * share; a.vy -= dy * f * share;
    b.vx += dx * f * (1 - share); b.vy += dy * f * (1 - share);
    return true;
  };
  const spring = (a, b, length, strength) => {
    const dx = b.x + b.vx - a.x - a.vx, dy = b.y + b.vy - a.y - a.vy, d = Math.hypot(dx, dy) || 1e-3, f = (d - length) / d * strength * 0.5;
    a.vx += dx * f; a.vy += dy * f;
    b.vx -= dx * f; b.vy -= dy * f;
  };

  const step = () => {
    returning = held ? 0 : returning + 1;
    if (held) {
      held.power = held.power * POWER_KEEP + Math.hypot(mouse.x - held.x, mouse.y - held.y);
      Object.assign(held, { x: mouse.x, y: mouse.y });
      const w = words[held.wi], charge = held.power / set.power;
      for (let k = w.first; k < w.first + w.count; k++) letters[k].heat = Math.min(1, charge);
      if (charge > 1) blast();
    }
    showMeter(held ? held.power / set.power : 0);
    const home = set.home * Math.min(20, 1 + returning / 60);
    for (const l of awake) {
      if (held && l.wi === held.wi) continue;
      l.vx += (l.hx - l.x) * home;
      l.vy += (l.hy - l.y) * home;
      if (l.heat) l.heat *= COOL;
    }
    for (const l of awake) {
      if (words[l.wi].broken) continue;
      if (l.next >= 0) spring(l, letters[l.next], l.rest, PHYSICS.link);
      if (l.next2 >= 0) spring(l, letters[l.next2], l.rest2, PHYSICS.bend);
    }
    const pin = held && held.l;
    if (pin) Object.assign(pin, { vx: mouse.x - pin.x, vy: mouse.y - pin.y });
    const stamp = ++frame;
    dynamic.clear();
    for (const l of awake) cover(l.x + l.vx, l.y + l.vy, l.r, c => { let list = dynamic.get(c); if (!list) dynamic.set(c, list = []); list.push(l); });
    for (const a of awake) {
      a.stamp = stamp;
      mark++;
      cover(a.x + a.vx, a.y + a.vy, a.r, c => {
        for (const b of dynamic.get(c) || []) {
          if (b === a || b.mark === mark || b.stamp === stamp || b.wi === a.wi) continue;
          b.mark = mark;
          collide(a, b);
        }
        for (const b of grid[c]) {
          if (b.awake || b.mark === mark || b.wi === a.wi) continue;
          b.mark = mark;
          if (collide(a, b)) wakeWord(b.wi);
        }
      });
    }
    for (const l of awake) {
      l.vx *= 1 - set.friction; l.vy *= 1 - set.friction;
      l.x += l.vx; l.y += l.vy;
      if (l.x < 0 || l.x > W) { l.x = Math.max(0, Math.min(W, l.x)); l.vx *= -0.3; }
      if (l.y < 0 || l.y > H) { l.y = Math.max(0, Math.min(H, l.y)); l.vy *= -0.3; }
    }
    for (const l of awake) {
      if (l.next < 0 || words[l.wi].broken) continue;
      const b = letters[l.next], dx = b.x - l.x, dy = b.y - l.y, d = Math.hypot(dx, dy) || 1e-3, max = l.rest * PHYSICS.tether;
      if (d <= max) continue;
      const k = (d - max) / d / 2;
      l.x += dx * k; l.y += dy * k;
      b.x -= dx * k; b.y -= dy * k;
    }
    if (pin) Object.assign(pin, { x: mouse.x, y: mouse.y });
    for (const wi of [...awakeWords]) {
      if (held && wi === held.wi) continue;
      const w = words[wi];
      let settled = true;
      if (returning <= GIVE_UP) for (let k = w.first; k < w.first + w.count && settled; k++) {
        const l = letters[k];
        settled = Math.abs(l.x - l.hx) + Math.abs(l.y - l.hy) <= 0.3 && Math.abs(l.vx) + Math.abs(l.vy) <= 0.02;
      }
      if (settled) sleepWord(wi);
    }
    awake = awake.filter(l => l.awake);
    redrawTiles();
    present();
  };
  const blast = () => {
    const { x, y, wi } = held, reach = set.reach;
    held = null;
    words[wi].broken = true;
    cover(x, y, reach, c => { for (const l of grid[c]) if (!l.awake && (l.hx - x) ** 2 + (l.hy - y) ** 2 < reach * reach) wakeWord(l.wi); });
    for (const l of awake) {
      const d = Math.hypot(l.x - x, l.y - y) || 1, own = l.wi === wi, angle = own ? Math.random() * 2 * Math.PI : Math.atan2(l.y - y, l.x - x);
      const speed = set.blast * (own ? 1 + Math.random() : Math.max(0, 1 - d / reach));
      l.vx += Math.cos(angle) * speed; l.vy += Math.sin(angle) * speed;
    }
  };
  const tick = () => {
    raf = 0;
    step();
    if (awake.length) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && set.grab && !still.matches && !document.hidden) raf = requestAnimationFrame(tick); };
  const nearest = (x, y) => {
    let best = null, gap = 0;
    for (const l of letters) {
      const d = (l.x - x) ** 2 + (l.y - y) ** 2;
      if (d < GRAB * GRAB && (!best || l.size > best.size || (l.size === best.size && d < gap))) { best = l; gap = d; }
    }
    return best;
  };
  return {
    rest, live, kick,
    grab(x, y) {
      const l = nearest(x, y);
      if (!l || !set.grab) return;
      held = { l, wi: l.wi, x, y, power: 0 };
      words[l.wi].broken = false;
      wakeWord(l.wi);
      kick();
    },
    cursor() { return held ? "grabbing" : set.grab ? "grab" : ""; },
    drop() { held = null; showMeter(0); kick(); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    settle() {
      for (const wi of [...awakeWords]) sleepWord(wi);
      awake = [];
      redrawTiles();
      present();
    },
  };
}

function draw() {
  if (!config || !innerWidth || !innerHeight) return;
  if (world) world.stop();
  world = makeWorld(innerWidth, innerHeight);
  $("wall").replaceChildren(world.rest, world.live);
}

function look() {
  document.documentElement.style.setProperty("--ink", set.ink);
  document.documentElement.style.setProperty("--r", set.glow + "px");
  moveLights();
}

function showMeter(level) {
  const meter = $("meter");
  if (meter.hidden !== !level) meter.hidden = !level;
  if (level) meter.style.setProperty("--p", Math.min(1, level).toFixed(3));
}

function moveLights() {
  $("light").style.translate = `${mouse.x - set.glow}px ${mouse.y - set.glow}px`;
  $("glow").style.translate = `${mouse.x - set.glow * 1.3}px ${mouse.y - set.glow * 1.3}px`;
}

function control(key, spec) {
  const toggle = typeof spec.value === "boolean", row = document.createElement("label");
  row.className = toggle ? "toggle" : "slider";
  row.innerHTML = toggle ? `<input type="checkbox"><span>${spec.label}</span>`
    : `<span>${spec.label}</span><b></b><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}">`;
  const input = row.querySelector("input"), shown = row.querySelector("b");
  if (toggle) input.checked = set[key]; else input.value = shown.textContent = set[key];
  input.oninput = () => {
    set[key] = toggle ? input.checked : +input.value;
    if (shown) shown.textContent = input.value;
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(set).filter(([k, v]) => v !== defaults[k])))); } catch (e) {}
    if (key === "grab" && world) world.settle();
    look();
  };
  return row;
}

function showCursor(e) {
  const shape = !world || e.pointerType !== "mouse" || e.target.closest?.("#menu") ? "" : world.cursor();
  if (document.body.style.cursor !== shape) document.body.style.cursor = shape;
}

const point = e => {
  Object.assign(mouse, { x: e.clientX, y: e.clientY });
  moveLights();
  showCursor(e);
};
addEventListener("pointermove", e => { if (set) point(e); }, { passive: true });
addEventListener("pointerdown", e => {
  if (!set || e.button !== 0 || e.target.closest?.("#menu")) return;
  if (world) world.grab(e.clientX, e.clientY);
  point(e);
});
const release = e => { if (world) world.drop(); if (set && e.clientX != null) showCursor(e); };
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
document.documentElement.addEventListener("mouseleave", release);
addEventListener("click", e => { if ($("menu").open && !$("menu").contains(e.target)) $("menu").open = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden && world) world.stop(); });
addEventListener("resize", () => { clearTimeout(draw.timer); draw.timer = setTimeout(draw, 250); });
$("reset").onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };

fetch("config.json").then(r => r.json()).then(c => {
  config = c;
  defaults = Object.fromEntries(Object.entries(c.settings).map(([k, spec]) => [k, spec.value]));
  try { set = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { set = Object.assign({}, defaults); }
  for (const [key, spec] of Object.entries(c.settings)) $("foot").before(control(key, spec));
  look();
  return document.fonts.ready;
}).then(draw).catch(e => {
  $("error").hidden = false;
  $("error").textContent = "Could not start: " + e.message + ". Serve this folder over http, for example with python -m http.server.";
});
