// O cenário: uma cidade desenhada em canvas que cresce junto com o império.
//
// Em vez de receber eventos de fora, este módulo observa o estado e reage ao
// que mudou. Assim comprar, prestigiar ou carregar um save continuam
// funcionando sem precisar avisar o cenário em cada lugar do código.

import { upgrades, BUSINESS_UNLOCK_THRESHOLD } from './config.js';
import { gameState } from './state.js';

// Cada tier tem silhueta própria, para a cidade contar em que fase você está.
const TIERS = [
    { w: 11, h: 20,  body: '#1d2c42', win: '#4fc3f7', cols: 1, cap: 16 }, // Freelancer
    { w: 15, h: 34,  body: '#213450', win: '#4fc3f7', cols: 2, cap: 14 }, // Startup
    { w: 19, h: 52,  body: '#243a5c', win: '#5bd6ff', cols: 2, cap: 12 }, // Corporação
    { w: 23, h: 74,  body: '#274168', win: '#5bd6ff', cols: 3, cap: 10 }, // Multinacional
    { w: 20, h: 98,  body: '#2a4874', win: '#66e6c8', cols: 2, cap: 9, antenna: true }, // Gigante TI
    { w: 27, h: 118, body: '#2d4d80', win: '#ffd86b', cols: 3, cap: 8 },  // Império Financeiro
    { w: 25, h: 146, body: '#31548c', win: '#ffd86b', cols: 3, cap: 7, spire: true } // Império Global
];

const GROUND = 12;          // faixa de rua no rodapé
const LOGICAL_H = 190;      // altura de referência do desenho
const FRAME_MS = 45;        // ~22fps: é cenário ambiente, não precisa de 60

let canvas = null, ctx = null;
let buildings = [], stars = [], beams = [], lastCounts = [], lastUnlocked = [];
let drones = [], shootingStar = null;
let lastFrame = 0, ready = false;

// Sorteio determinístico: a mesma unidade cai sempre no mesmo lugar, então a
// cidade não "embaralha" a cada compra nem entre sessões.
function rand(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

export function initSkyline() {
    canvas = document.getElementById('skylineCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    stars = Array.from({ length: 40 }, (_, i) => ({
        x: rand(i * 3.1), y: rand(i * 7.7) * 0.6, r: 0.5 + rand(i * 5.3) * 1.1,
        tw: rand(i * 2.2) * 6.28
    }));
    drones = [
        { x: 0.1, y: 0.22, vx: 0.00012, dir: 1, color: '#00d4ff', size: 1.8 },
        { x: 0.8, y: 0.38, vx: -0.00009, dir: -1, color: '#ffaa00', size: 1.6 },
        { x: 0.4, y: 0.16, vx: 0.00015, dir: 1, color: '#00ff88', size: 2.0 },
        { x: 0.9, y: 0.28, vx: -0.00011, dir: -1, color: '#ff3366', size: 1.7 }
    ];
    lastCounts = upgrades.map(() => 0);
    lastUnlocked = upgrades.map((u, i) => i === 0 || u.owned > 0 || (i > 0 && upgrades[i - 1].owned >= BUSINESS_UNLOCK_THRESHOLD));
    syncSkyline(true);
    ready = true;
}

/** Compara a cidade com o estado e cria/remove prédios com animação. */
export function syncSkyline(instant = false) {
    if (!canvas) return;
    const now = performance.now();

    upgrades.forEach((u, tier) => {
        const target = Math.min(u.owned, TIERS[tier].cap);
        const current = lastCounts[tier];

        if (target > current) {
            for (let n = current; n < target; n++) addBuilding(tier, n, instant ? 0 : now);
        } else if (target < current) {
            // prestígio ou reset: os prédios desabam em vez de sumirem
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
    const rows = Math.max(2, Math.floor(style.h / 13));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < style.cols; c++) {
            windows.push({ r, c, on: rand(seed + r * 3 + c * 11) > 0.35, ph: rand(seed + r + c) * 6.28 });
        }
    }
    buildings.push({
        tier, index, style, windows,
        slot: rand(seed),                                   // posição horizontal 0..1
        hVar: 0.82 + rand(seed + 1.7) * 0.36,               // variação de altura
        state: at ? 'rising' : 'idle', at, seed
    });
    buildings.sort((a, b) => a.tier - b.tier);              // menores na frente
}

/** Feixe de luz + brilho quando um tier novo é liberado. */
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
    drawStars(w, groundY, now);
    drawShootingStar(w, groundY, now);
    drawFarLayer(w, groundY, scale);
    drawDrones(w, groundY, scale, now);

    // Os prédios são desenhados do tier menor para o maior, então os grandes
    // ficam ao fundo e a silhueta cresce em camadas.
    for (const b of buildings) drawBuilding(b, w, groundY, scale, now);

    drawBeams(w, groundY, now);
    drawGround(w, h, groundY);
}

function detectUnlocks() {
    upgrades.forEach((u, i) => {
        const unlocked = i === 0 || u.owned > 0 || (i > 0 && upgrades[i - 1].owned >= BUSINESS_UNLOCK_THRESHOLD);
        if (unlocked && !lastUnlocked[i] && lastUnlocked.some(Boolean)) celebrateUnlock(i);
        lastUnlocked[i] = unlocked;
    });
}

function drawSky(w, h, groundY) {
    // O céu esquenta com o prestígio: cada renascimento muda a hora do dia.
    const phase = Math.min(1, gameState.prestigeLevel / 12);
    const top = mix([8, 12, 28], [38, 16, 52], phase);
    const bottom = mix([16, 32, 58], [92, 40, 66], phase);
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, `rgb(${top})`);
    g.addColorStop(1, `rgb(${bottom})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, groundY);
}

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
}

function drawStars(w, groundY, now) {
    for (const s of stars) {
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 900 + s.tw));
        ctx.globalAlpha = tw * 0.7;
        ctx.fillStyle = '#cfe8ff';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * groundY, s.r, 0, 6.283);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// Silhueta distante fixa: dá profundidade sem depender do progresso.
function drawFarLayer(w, groundY, scale) {
    ctx.fillStyle = 'rgba(14,26,46,0.75)';
    const count = 22;
    for (let i = 0; i < count; i++) {
        const bw = (10 + rand(i * 4.4) * 16) * scale;
        const bh = (14 + rand(i * 8.8) * 40) * scale;
        const x = (i / count) * (w + 40) - 20 + rand(i) * 8;
        ctx.fillRect(x, groundY - bh, bw, bh);
    }
}

function drawBuilding(b, w, groundY, scale, now) {
    const s = b.style;
    const bw = s.w * scale;
    const fullH = s.h * b.hVar * scale;
    const x = 6 + b.slot * Math.max(1, w - bw - 12);

    // Progresso da animação: sobe do chão ao nascer, afunda ao ser destruído.
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

    // corpo com leve gradiente para não ficar chapado
    const g = ctx.createLinearGradient(x, y, x + bw, y);
    g.addColorStop(0, s.body);
    g.addColorStop(1, shade(s.body, -18));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, bh);

    // topo iluminado
    ctx.fillStyle = shade(s.body, 26);
    ctx.fillRect(x, y, bw, Math.max(1, 1.5 * scale));

    drawWindows(b, x, y, bw, bh, scale, now);

    if (s.antenna && grow > 0.9) {
        ctx.strokeStyle = 'rgba(120,200,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y);
        ctx.lineTo(x + bw / 2, y - 9 * scale);
        ctx.stroke();
        blink(x + bw / 2, y - 9 * scale, scale, now, b.seed, '#ff6b6b');
    }
    if (s.spire && grow > 0.9) {
        ctx.fillStyle = shade(s.body, 30);
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y - 14 * scale);
        ctx.lineTo(x + bw, y);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        blink(x + bw / 2, y - 14 * scale, scale, now, b.seed, '#ffd700');
    }
    if (b.tier >= 4 && b.index % 2 === 0 && grow > 0.9) {
        drawHoloBillboard(x, y, bw, scale, now, b.seed);
    }
    ctx.globalAlpha = 1;
}

function drawWindows(b, x, y, bw, bh, scale, now) {
    const s = b.style;
    const pad = 2.5 * scale;
    const cw = (bw - pad * (s.cols + 1)) / s.cols;
    const rowH = 5 * scale, gap = 3.2 * scale;
    const rows = Math.floor((bh - pad * 2) / (rowH + gap));

    for (const win of b.windows) {
        if (win.r >= rows) continue;
        // As luzes respiram devagar: a cidade parece habitada.
        const life = 0.5 + 0.5 * Math.sin(now / 1400 + win.ph);
        if (!win.on && life < 0.92) continue;
        ctx.globalAlpha = win.on ? 0.55 + life * 0.45 : 0.25;
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
    const on = Math.sin(now / 520 + seed) > 0;
    ctx.globalAlpha = on ? 1 : 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * scale, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawBeams(w, groundY, now) {
    beams = beams.filter(beam => now - beam.at < 1400);
    for (const beam of beams) {
        const t = (now - beam.at) / 1400;
        const targets = buildings.filter(b => b.tier === beam.tier);
        const b = targets[0];
        const slot = b ? b.slot : rand(beam.tier * 97);
        const x = 6 + slot * Math.max(1, w - 20);
        const g = ctx.createLinearGradient(x, 0, x, groundY);
        const a = Math.sin(t * Math.PI) * 0.55;
        g.addColorStop(0, `rgba(0,255,180,0)`);
        g.addColorStop(1, `rgba(0,255,180,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 14, 0, 28, groundY);
    }
}

function drawGround(w, h, groundY) {
    const g = ctx.createLinearGradient(0, groundY, 0, h);
    g.addColorStop(0, 'rgba(0,212,255,0.20)');
    g.addColorStop(1, 'rgba(4,8,18,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.strokeStyle = 'rgba(0,212,255,0.45)';
    ctx.lineWidth = 1;
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

/** Remove os prédios que terminaram de cair (chamado pelo loop de simulação). */
export function pruneSkyline() {
    if (buildings.some(b => b.dead)) buildings = buildings.filter(b => !b.dead);
}

function drawDrones(w, groundY, scale, now) {
    const dt = FRAME_MS;
    for (const d of drones) {
        d.x += d.vx * dt;
        if (d.x > 1.1) d.x = -0.1;
        if (d.x < -0.1) d.x = 1.1;

        const px = d.x * w;
        const py = d.y * groundY + Math.sin(now / 900 + d.x * 8) * 3 * scale;
        const len = 20 * scale * (d.dir > 0 ? -1 : 1);

        // Rastro de luz
        const g = ctx.createLinearGradient(px, py, px + len, py);
        g.addColorStop(0, d.color);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, 1.2 * scale);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + len, py);
        ctx.stroke();

        // Veículo com brilho
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(px, py, d.size * scale, 0, 6.283);
        ctx.fill();
    }
}

function drawShootingStar(w, groundY, now) {
    if (!shootingStar && Math.random() < 0.008) {
        shootingStar = {
            x: rand(now) * 0.7 * w,
            y: rand(now + 1) * 0.3 * groundY,
            vx: 3.5 + rand(now + 2) * 3.5,
            vy: 1.5 + rand(now + 3) * 2,
            life: 1
        };
    }
    if (shootingStar) {
        shootingStar.x += shootingStar.vx;
        shootingStar.y += shootingStar.vy;
        shootingStar.life -= 0.035;
        if (shootingStar.life <= 0) {
            shootingStar = null;
            return;
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.life * 0.9})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(shootingStar.x, shootingStar.y);
        ctx.lineTo(shootingStar.x - shootingStar.vx * 5, shootingStar.y - shootingStar.vy * 5);
        ctx.stroke();
    }
}

function drawHoloBillboard(x, y, bw, scale, now, seed) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 450 + seed);
    const colors = ['#00d4ff', '#ff00aa', '#00ff88', '#ffd700'];
    const col = colors[Math.floor(Math.abs(seed * 10)) % colors.length];
    const boardW = Math.min(bw * 0.75, 24 * scale);
    const boardH = 8 * scale;
    const bx = x + (bw - boardW) / 2;
    const by = y - boardH - 2 * scale;

    ctx.globalAlpha = pulse * 0.85;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boardW, boardH);

    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(6, Math.floor(6.5 * scale))}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', bx + boardW / 2, by + boardH / 2);
    ctx.globalAlpha = 1;
}
