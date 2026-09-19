// O cenário: uma metrópole cyberpunk desenhada em canvas que cresce junto com o império.
// Totalmente procedimental, com lua luminosa, tráfego aéreo, holoboards, holofotes e skybridges.

import { upgrades, BUSINESS_UNLOCK_THRESHOLD } from './config.js';
import { gameState } from './state.js';
import { isFeverActive } from './economy.js';

// Cada tier tem silhueta e presença monumental no skyline.
const TIERS = [
    { w: 16, h: 32,  body: '#142132', win: '#4fc3f7', cols: 2, cap: 24 }, // Freelancer
    { w: 22, h: 54,  body: '#182b42', win: '#4fc3f7', cols: 2, cap: 20 }, // Startup
    { w: 28, h: 80,  body: '#1d3654', win: '#5bd6ff', cols: 3, cap: 18 }, // Corporação
    { w: 34, h: 108, body: '#224268', win: '#5bd6ff', cols: 3, cap: 16 }, // Multinacional
    { w: 32, h: 136, body: '#274e7c', win: '#66e6c8', cols: 3, cap: 14, antenna: true }, // Gigante TI
    { w: 42, h: 164, body: '#2d5b92', win: '#ffd86b', cols: 4, cap: 12 },  // Império Financeiro
    { w: 40, h: 195, body: '#3368a8', win: '#ffd86b', cols: 4, cap: 10, spire: true } // Império Global
];

const GROUND = 14;          // faixa de rodovia no rodapé
const LOGICAL_H = 190;      // altura de referência do desenho
const FRAME_MS = 40;        // ~25fps suave

let canvas = null, ctx = null;
let buildings = [], stars = [], beams = [], lastCounts = [], lastUnlocked = [];
let hovercars = [], shootingStar = null;
let lastFrame = 0, ready = false;

function rand(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

export function initSkyline() {
    canvas = document.getElementById('skylineCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    stars = Array.from({ length: 65 }, (_, i) => ({
        x: rand(i * 3.1), y: rand(i * 7.7) * 0.65, r: 0.6 + rand(i * 5.3) * 1.2,
        tw: rand(i * 2.2) * 6.28
    }));

    hovercars = [
        { x: 0.05, y: 0.28, vx: 0.00018, dir: 1,  color: '#00d4ff', size: 2.2 },
        { x: 0.85, y: 0.42, vx: -0.00014, dir: -1, color: '#ffaa00', size: 2.0 },
        { x: 0.35, y: 0.22, vx: 0.00022, dir: 1,  color: '#00ff88', size: 2.4 },
        { x: 0.95, y: 0.36, vx: -0.00016, dir: -1, color: '#ff3366', size: 2.0 },
        { x: 0.60, y: 0.50, vx: 0.00019, dir: 1,  color: '#ffd700', size: 2.2 }
    ];

    lastCounts = upgrades.map(() => 0);
    lastUnlocked = upgrades.map((u, i) => i === 0 || u.owned > 0 || (i > 0 && upgrades[i - 1].owned >= BUSINESS_UNLOCK_THRESHOLD));
    syncSkyline(true);
    ready = true;
}

export function syncSkyline(instant = false) {
    if (!canvas) return;
    const now = performance.now();

    upgrades.forEach((u, tier) => {
        const target = Math.min(u.owned, TIERS[tier].cap);
        const current = lastCounts[tier];

        if (target > current) {
            for (let n = current; n < target; n++) addBuilding(tier, n, instant ? 0 : now);
        } else if (target < current) {
            buildings.filter(b => b.tier === tier && b.index >= target && b.state !== 'falling')
                .forEach(b => { b.state = 'falling'; b.at = now; });
        }
        lastCounts[tier] = target;
    });
}

function addBuilding(tier, index, at) {
    const style = TIERS[tier];
    const seed = tier * 97 + index * 13.7;
    const windows = [];
    const rows = Math.max(2, Math.floor(style.h / 12));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < style.cols; c++) {
            windows.push({ r, c, on: rand(seed + r * 3 + c * 11) > 0.30, ph: rand(seed + r + c) * 6.28 });
        }
    }
    buildings.push({
        tier, index, style, windows,
        slot: rand(seed),
        hVar: 0.85 + rand(seed + 1.7) * 0.32,
        state: at ? 'rising' : 'idle', at, seed
    });
    buildings.sort((a, b) => a.tier - b.tier);
}

export function celebrateUnlock(tier) {
    if (!canvas) return;
    beams.push({ tier, at: performance.now() });
}

export function drawSkyline(now) {
    if (!ready || !ctx) return;
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;

    detectUnlocks();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const scale = h / LOGICAL_H;
    const groundY = h - GROUND * scale;

    drawSky(w, h, groundY);
    drawMoon(w, groundY, scale, now);
    drawStars(w, groundY, now);
    drawShootingStar(w, groundY, now);
    drawSearchlights(w, groundY, scale, now);
    drawFarLayer(w, groundY, scale);
    drawHovercars(w, groundY, scale, now);

    // Prédios em camadas do menor para o maior
    for (const b of buildings) drawBuilding(b, w, groundY, scale, now);

    drawSkybridges(w, groundY, scale);
    drawBeams(w, groundY, now);
    drawGround(w, h, groundY);

    if (isFeverActive()) {
        drawFeverWeather(w, groundY, now);
    }
}

function detectUnlocks() {
    upgrades.forEach((u, i) => {
        const unlocked = i === 0 || u.owned > 0 || (i > 0 && upgrades[i - 1].owned >= BUSINESS_UNLOCK_THRESHOLD);
        if (unlocked && !lastUnlocked[i] && lastUnlocked.some(Boolean)) celebrateUnlock(i);
        lastUnlocked[i] = unlocked;
    });
}

function drawSky(w, h, groundY) {
    const phase = Math.min(1, gameState.prestigeLevel / 12);
    const top = mix([6, 10, 24], [28, 12, 48], phase);
    const bottom = mix([14, 28, 54], [78, 32, 60], phase);
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, `rgb(${top})`);
    g.addColorStop(0.65, `rgb(${mix([10, 20, 38], [50, 22, 54], phase)})`);
    g.addColorStop(1, `rgb(${bottom})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, groundY);

    // Nebulosa suave
    const neb = ctx.createRadialGradient(w * 0.45, groundY * 0.35, 10, w * 0.45, groundY * 0.35, w * 0.5);
    neb.addColorStop(0, 'rgba(0, 212, 255, 0.07)');
    neb.addColorStop(0.5, 'rgba(179, 102, 255, 0.04)');
    neb.addColorStop(1, 'transparent');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, groundY);
}

function drawMoon(w, groundY, scale, now) {
    const mx = Math.max(70, w * 0.84);
    const my = groundY * 0.28;
    const mr = Math.min(26 * scale, 34);

    // Halo luminoso
    const halo = ctx.createRadialGradient(mx, my, mr * 0.7, mx, my, mr * 2.6);
    halo.addColorStop(0, 'rgba(0, 212, 255, 0.32)');
    halo.addColorStop(0.5, 'rgba(0, 212, 255, 0.10)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Disco da Lua
    const moonGrad = ctx.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
    moonGrad.addColorStop(0, '#ffffff');
    moonGrad.addColorStop(0.7, '#d2eeff');
    moonGrad.addColorStop(1, '#7bbbee');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // Cratera estética
    ctx.fillStyle = 'rgba(70, 110, 160, 0.28)';
    ctx.beginPath();
    ctx.arc(mx - mr * 0.32, my - mr * 0.22, mr * 0.22, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.26, my + mr * 0.28, mr * 0.18, 0, Math.PI * 2);
    ctx.arc(mx - mr * 0.1, my + mr * 0.42, mr * 0.14, 0, Math.PI * 2);
    ctx.fill();
}

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
}

function drawStars(w, groundY, now) {
    for (const s of stars) {
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 800 + s.tw));
        ctx.globalAlpha = tw * 0.85;
        ctx.fillStyle = '#e8f4ff';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * groundY, s.r, 0, 6.283);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawSearchlights(w, groundY, scale, now) {
    ctx.save();
    const count = 2;
    for (let i = 0; i < count; i++) {
        const sx = w * (0.28 + i * 0.44);
        const angle = -Math.PI / 2 + Math.sin(now / 2200 + i * 2.1) * 0.42;
        const len = groundY * 1.25;
        const tx = sx + Math.sin(angle) * len;
        const ty = groundY - Math.cos(angle) * len;

        const g = ctx.createLinearGradient(sx, groundY, tx, ty);
        g.addColorStop(0, 'rgba(0, 212, 255, 0.22)');
        g.addColorStop(0.8, 'rgba(0, 212, 255, 0.04)');
        g.addColorStop(1, 'transparent');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx - 8 * scale, groundY);
        ctx.lineTo(tx - 35 * scale, ty);
        ctx.lineTo(tx + 35 * scale, ty);
        ctx.lineTo(sx + 8 * scale, groundY);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function drawFarLayer(w, groundY, scale) {
    const count = Math.max(30, Math.floor(w / 34));
    for (let i = 0; i < count; i++) {
        const bw = (14 + rand(i * 4.4) * 22) * scale;
        const bh = (20 + rand(i * 8.8) * 65) * scale;
        const x = (i / count) * (w + 40) - 20 + rand(i) * 10;

        ctx.fillStyle = 'rgba(12, 22, 38, 0.88)';
        ctx.fillRect(x, groundY - bh, bw, bh);

        // Pontos de luz distante
        ctx.fillStyle = 'rgba(0, 212, 255, 0.35)';
        for (let r = 0; r < Math.floor(bh / 14); r++) {
            if (rand(i * 19 + r) > 0.45) {
                ctx.fillRect(x + bw * 0.3, groundY - bh + r * 14 * scale + 4, 1.8 * scale, 1.8 * scale);
            }
        }
    }
}

function drawBuilding(b, w, groundY, scale, now) {
    const s = b.style;
    const bw = s.w * scale;
    const fullH = s.h * b.hVar * scale;
    const x = 8 + b.slot * Math.max(1, w - bw - 16);

    let grow = 1, alpha = 1;
    if (b.state === 'rising') {
        const t = Math.min(1, (now - b.at) / 620);
        grow = easeOutBack(t);
        if (t >= 1) b.state = 'idle';
    } else if (b.state === 'falling') {
        const t = Math.min(1, (now - b.at) / 420);
        grow = 1 - t; alpha = 1 - t;
        if (t >= 1) { b.dead = true; return; }
    }

    const bh = fullH * grow;
    if (bh <= 1) return;
    const y = groundY - bh;

    ctx.globalAlpha = alpha;

    // Fachada iluminada com gradiente e borda
    const g = ctx.createLinearGradient(x, y, x + bw, y);
    g.addColorStop(0, s.body);
    g.addColorStop(1, shade(s.body, -22));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, bh);

    // Contorno neon sutil
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, bw, bh);

    // Linha do topo
    ctx.fillStyle = shade(s.body, 36);
    ctx.fillRect(x, y, bw, Math.max(1, 2 * scale));

    drawWindows(b, x, y, bw, bh, scale, now);

    if (s.antenna && grow > 0.9) {
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y);
        ctx.lineTo(x + bw / 2, y - 12 * scale);
        ctx.stroke();
        blink(x + bw / 2, y - 12 * scale, scale, now, b.seed, '#ff4466');
    }
    if (s.spire && grow > 0.9) {
        ctx.fillStyle = shade(s.body, 42);
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y - 18 * scale);
        ctx.lineTo(x + bw, y);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        blink(x + bw / 2, y - 18 * scale, scale, now, b.seed, '#ffd700');
    }
    if (b.tier >= 3 && b.index % 2 === 0 && grow > 0.9) {
        drawHoloBillboard(x, y, bw, scale, now, b.seed);
    }
    ctx.globalAlpha = 1;
}

function drawWindows(b, x, y, bw, bh, scale, now) {
    const s = b.style;
    const pad = 3 * scale;
    const cw = (bw - pad * (s.cols + 1)) / s.cols;
    const rowH = 5.5 * scale, gap = 3.6 * scale;
    const rows = Math.floor((bh - pad * 2) / (rowH + gap));

    for (const win of b.windows) {
        if (win.r >= rows) continue;
        const life = 0.5 + 0.5 * Math.sin(now / 1200 + win.ph);
        if (!win.on && life < 0.90) continue;
        ctx.globalAlpha = win.on ? 0.65 + life * 0.35 : 0.28;
        ctx.fillStyle = s.win;
        ctx.fillRect(
            x + pad + win.c * (cw + pad),
            y + pad + win.r * (rowH + gap),
            cw, rowH
        );
    }
    ctx.globalAlpha = 1;
}

function blink(x, y, scale, now, seed, color) {
    const on = Math.sin(now / 480 + seed) > 0;
    ctx.globalAlpha = on ? 1 : 0.20;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.0 * scale, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawSkybridges(w, groundY, scale) {
    const tall = buildings.filter(b => b.tier >= 3 && b.state === 'idle');
    for (let i = 0; i < tall.length - 1; i++) {
        const b1 = tall[i], b2 = tall[i + 1];
        const x1 = 8 + b1.slot * (w - b1.style.w * scale - 16);
        const x2 = 8 + b2.slot * (w - b2.style.w * scale - 16);
        const dist = Math.abs(x1 - x2);
        if (dist > 35 * scale && dist < 120 * scale) {
            const minX = Math.min(x1 + b1.style.w * scale, x2 + b2.style.w * scale);
            const maxX = Math.max(x1, x2);
            const bridgeY = groundY - 60 * scale;
            ctx.fillStyle = 'rgba(0, 212, 255, 0.25)';
            ctx.fillRect(minX, bridgeY, maxX - minX, 4 * scale);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(minX, bridgeY + 1 * scale, maxX - minX, 1 * scale);
        }
    }
}

function drawBeams(w, groundY, now) {
    beams = beams.filter(beam => now - beam.at < 1600);
    for (const beam of beams) {
        const t = (now - beam.at) / 1600;
        const targets = buildings.filter(b => b.tier === beam.tier);
        const b = targets[0];
        const slot = b ? b.slot : rand(beam.tier * 97);
        const x = 8 + slot * Math.max(1, w - 24);
        const g = ctx.createLinearGradient(x, 0, x, groundY);
        const a = Math.sin(t * Math.PI) * 0.75;
        g.addColorStop(0, `rgba(0,255,180,0)`);
        g.addColorStop(1, `rgba(0,255,180,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 18, 0, 36, groundY);
    }
}

function drawGround(w, h, groundY) {
    const g = ctx.createLinearGradient(0, groundY, 0, h);
    g.addColorStop(0, 'rgba(0, 212, 255, 0.35)');
    g.addColorStop(0.2, 'rgba(10, 20, 36, 0.95)');
    g.addColorStop(1, 'rgba(4, 8, 16, 1.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Faixa neon da rodovia
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(w, groundY + 0.5);
    ctx.stroke();
}

function easeOutBack(t) {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amount), g = clamp(((n >> 8) & 255) + amount), b = clamp((n & 255) + amount);
    return `rgb(${r},${g},${b})`;
}

export function pruneSkyline() {
    if (buildings.some(b => b.dead)) buildings = buildings.filter(b => !b.dead);
}

function drawHovercars(w, groundY, scale, now) {
    const dt = FRAME_MS;
    for (const d of hovercars) {
        d.x += d.vx * dt;
        if (d.x > 1.15) d.x = -0.15;
        if (d.x < -0.15) d.x = 1.15;

        const px = d.x * w;
        const py = d.y * groundY + Math.sin(now / 800 + d.x * 6) * 3 * scale;
        const len = 24 * scale * (d.dir > 0 ? -1 : 1);

        // Rastro de laser
        const g = ctx.createLinearGradient(px, py, px + len, py);
        g.addColorStop(0, d.color);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, 1.6 * scale);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + len, py);
        ctx.stroke();

        // Veículo
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(px, py, d.size * scale, 0, 6.283);
        ctx.fill();
    }
}

function drawShootingStar(w, groundY, now) {
    if (!shootingStar && Math.random() < 0.012) {
        shootingStar = {
            x: rand(now) * 0.7 * w,
            y: rand(now + 1) * 0.3 * groundY,
            vx: 4.0 + rand(now + 2) * 4.0,
            vy: 1.8 + rand(now + 3) * 2.5,
            life: 1
        };
    }
    if (shootingStar) {
        shootingStar.x += shootingStar.vx;
        shootingStar.y += shootingStar.vy;
        shootingStar.life -= 0.038;
        if (shootingStar.life <= 0) {
            shootingStar = null;
            return;
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.life * 0.95})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(shootingStar.x, shootingStar.y);
        ctx.lineTo(shootingStar.x - shootingStar.vx * 5.5, shootingStar.y - shootingStar.vy * 5.5);
        ctx.stroke();
    }
}

const BILLBOARD_MESSAGES = ['MONEYMAKER', '📈 BULL RUN', 'HODL 💎', 'DIVIDENDOS', '100X', 'WALL ST', 'PROFIT'];

function drawHoloBillboard(x, y, bw, scale, now, seed) {
    const pulse = 0.65 + 0.35 * Math.sin(now / 400 + seed);
    const colors = ['#00d4ff', '#ff00aa', '#00ff88', '#ffd700', '#b366ff'];
    const idx = Math.floor(Math.abs(seed * 11)) % colors.length;
    const col = colors[idx];
    const msg = BILLBOARD_MESSAGES[Math.floor(Math.abs(seed * 7)) % BILLBOARD_MESSAGES.length];

    const boardW = Math.min(bw * 0.88, 48 * scale);
    const boardH = 10 * scale;
    const bx = x + (bw - boardW) / 2;
    const by = y - boardH - 3 * scale;

    ctx.globalAlpha = pulse * 0.90;
    ctx.fillStyle = 'rgba(8, 16, 32, 0.75)';
    ctx.fillRect(bx, by, boardW, boardH);

    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boardW, boardH);

    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(6, Math.floor(6.5 * scale))}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, bx + boardW / 2, by + boardH / 2);
    ctx.globalAlpha = 1;
}

function drawFeverWeather(w, groundY, now) {
    ctx.save();
    // Chuva digital dourada
    ctx.fillStyle = 'rgba(255, 215, 0, 0.65)';
    const drops = 18;
    for (let i = 0; i < drops; i++) {
        const dx = (rand(i * 17) * w + (now * 0.2)) % w;
        const dy = (rand(i * 29) * groundY + (now * 0.45)) % groundY;
        ctx.fillRect(dx, dy, 1.5, 6);
    }
    ctx.restore();
}
