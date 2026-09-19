// Cenário Metrópole Cyberpunk AAA (Procedural Canvas Engine).
// Apresenta uma megalópole viva com Lua orbital holográfica, dirigível corporativo,
// monotrilho maglev de alta velocidade, tráfego aéreo e rodoviário em múltiplas faixas,
// edifícios procedurais com janelas iluminadas e reações em tempo real ao clique e ao Overclock.

import { upgrades, BUSINESS_UNLOCK_THRESHOLD } from './config.js';
import { gameState } from './state.js';
import { isFeverActive } from './economy.js';
import { playSound } from './utils.js';

// Cada tier tem silhueta, identidade arquitetônica e presença monumental no skyline.
const TIERS = [
    { w: 18, h: 36,  body: '#14253d', win: '#00ff88', accent: '#00ff88', cols: 2, cap: 24, name: 'Kiosk' },
    { w: 24, h: 62,  body: '#183050', win: '#00d4ff', accent: '#00d4ff', cols: 2, cap: 20, name: 'Startup' },
    { w: 30, h: 90,  body: '#1e3c66', win: '#ffaa00', accent: '#ffaa00', cols: 3, cap: 18, name: 'Corp' },
    { w: 36, h: 120, body: '#264c7e', win: '#ffd700', accent: '#ffd700', cols: 3, cap: 16, name: 'Multi' },
    { w: 38, h: 148, body: '#2e5892', win: '#b366ff', accent: '#b366ff', cols: 3, cap: 14, antenna: true, name: 'Fintech' },
    { w: 46, h: 176, body: '#3568aa', win: '#38bdf8', accent: '#38bdf8', cols: 4, cap: 12, matrix: true, name: 'AI Server' },
    { w: 48, h: 205, body: '#3f78c2', win: '#ff0055', accent: '#ff0055', cols: 4, cap: 10, spire: true, beam: true, name: 'Megacorp' }
];

const GROUND = 18;          // Faixa de rodovia no rodapé
const LOGICAL_H = 195;      // Altura de referência do desenho
const FRAME_MS = 30;        // ~33fps suave

let canvas = null, ctx = null;
let buildings = [], stars = [], beams = [], lastCounts = [], lastUnlocked = [];
let hovercars = [], shootingStar = null, blimp = null, monorail = null;
let clickRipples = [], laserFlares = [];
let lastFrame = 0, ready = false;
let isOverclockActiveFn = () => false;

export function registerSkylineHooks(overclockFn) {
    if (overclockFn) isOverclockActiveFn = overclockFn;
}

function rand(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

export function initSkyline() {
    if (typeof document === 'undefined') return;
    canvas = document.getElementById('skylineCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Estrelas com cintilância procedural
    stars = Array.from({ length: 80 }, (_, i) => ({
        x: rand(i * 3.1),
        y: rand(i * 7.7) * 0.62,
        r: 0.6 + rand(i * 5.3) * 1.3,
        tw: rand(i * 2.2) * 6.28
    }));

    // Frota aérea (Hovercars, Spyders corporativos e Drones)
    hovercars = [
        { x: 0.05, y: 0.22, vx: 0.00022, dir: 1,  color: '#00d4ff', size: 2.2, trailLen: 28 },
        { x: 0.85, y: 0.32, vx: -0.00018, dir: -1, color: '#ff0055', size: 2.4, trailLen: 34 },
        { x: 0.35, y: 0.18, vx: 0.00028, dir: 1,  color: '#00ff88', size: 2.0, trailLen: 22 },
        { x: 0.95, y: 0.40, vx: -0.00020, dir: -1, color: '#ffaa00', size: 2.2, trailLen: 26 },
        { x: 0.60, y: 0.26, vx: 0.00025, dir: 1,  color: '#ffd700', size: 2.3, trailLen: 30 },
        { x: 0.15, y: 0.48, vx: -0.00016, dir: -1, color: '#b366ff', size: 2.5, trailLen: 32 }
    ];

    // Dirigível Holográfico Corporativo (Blimp de Blade Runner)
    blimp = {
        x: 1.15,
        y: 0.14,
        vx: -0.000045,
        msgIndex: 0,
        nextMsgTime: 0
    };

    // Monotrilho Maglev de Alta Velocidade
    monorail = {
        x: -0.3,
        speed: 0.00065,
        active: false,
        nextSpawnTime: 3000
    };

    lastCounts = upgrades.map(() => 0);
    lastUnlocked = upgrades.map((u, i) => i === 0 || u.owned > 0 || (i > 0 && upgrades[i - 1].owned >= BUSINESS_UNLOCK_THRESHOLD));
    syncSkyline(true);
    ready = true;

    // Interatividade: clicar no canvas dispara um disparo orbital / show pirotécnico
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        spawnSkylineFlare(clickX, clickY);
    });
}

export function pulseSkylineClick(xRatio = 0.5) {
    if (!canvas) return;
    const now = performance.now();
    clickRipples.push({
        x: xRatio,
        at: now,
        color: isOverclockActiveFn() ? '#ff0055' : '#00ff88'
    });
    if (clickRipples.length > 8) clickRipples.shift();
}

export function spawnSkylineFlare(x, y) {
    if (!canvas) return;
    const now = performance.now();
    laserFlares.push({
        x, y,
        at: now,
        color: isOverclockActiveFn() ? '#ff0055' : '#00d4ff'
    });
    playSound(880, 120);
    if (laserFlares.length > 6) laserFlares.shift();
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
    const rows = Math.max(3, Math.floor(style.h / 10));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < style.cols; c++) {
            windows.push({
                r, c,
                on: rand(seed + r * 3 + c * 11) > 0.28,
                ph: rand(seed + r + c) * 6.28
            });
        }
    }
    buildings.push({
        tier, index, style, windows,
        slot: rand(seed),
        hVar: 0.88 + rand(seed + 1.7) * 0.28,
        state: at ? 'rising' : 'idle',
        at, seed
    });
    buildings.sort((a, b) => a.tier - b.tier);
}

export function celebrateUnlock(tier) {
    if (!canvas) return;
    beams.push({ tier, at: performance.now() });
}

export function drawSkyline(now) {
    if (!ready || !ctx || !canvas) return;
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
    const isOverclock = isOverclockActiveFn();

    drawSky(w, h, groundY, isOverclock);
    drawCyberMoon(w, groundY, scale, now, isOverclock);
    drawStars(w, groundY, now);
    drawShootingStar(w, groundY, now);
    drawSearchlights(w, groundY, scale, now, isOverclock);
    drawFarCityMetropolis(w, groundY, scale, now, isOverclock);
    drawBlimp(w, groundY, scale, now, isOverclock);
    drawSkybridges(w, groundY, scale);
    drawMonorail(w, groundY, scale, now);
    drawHovercars(w, groundY, scale, now, isOverclock);

    // Prédios corporativos do jogador em camadas
    for (const b of buildings) drawBuilding(b, w, groundY, scale, now, isOverclock);

    drawBeams(w, groundY, now);
    drawLaserFlares(w, groundY, scale, now);
    drawGroundHighway(w, h, groundY, scale, now, isOverclock);

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

function drawSky(w, h, groundY, isOverclock) {
    const phase = Math.min(1, gameState.prestigeLevel / 12);
    const g = ctx.createLinearGradient(0, 0, 0, groundY);

    if (isOverclock) {
        g.addColorStop(0, '#12040b');
        g.addColorStop(0.45, '#280816');
        g.addColorStop(0.85, '#440f26');
        g.addColorStop(1, '#661633');
    } else {
        const top = mix([4, 8, 20], [22, 10, 42], phase);
        const mid = mix([8, 16, 36], [42, 18, 52], phase);
        const bottom = mix([14, 32, 64], [64, 26, 68], phase);
        g.addColorStop(0, `rgb(${top})`);
        g.addColorStop(0.55, `rgb(${mid})`);
        g.addColorStop(1, `rgb(${bottom})`);
    }

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, groundY);

    // Nebulosa volumétrica com brilho horizontal
    const neb = ctx.createRadialGradient(w * 0.45, groundY * 0.45, 15, w * 0.45, groundY * 0.45, w * 0.65);
    neb.addColorStop(0, isOverclock ? 'rgba(255, 0, 85, 0.18)' : 'rgba(0, 212, 255, 0.15)');
    neb.addColorStop(0.5, isOverclock ? 'rgba(255, 102, 0, 0.08)' : 'rgba(179, 102, 255, 0.08)');
    neb.addColorStop(1, 'transparent');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, groundY);

    // Bruma luminosa no horizonte da metrópole
    const horizonGlow = ctx.createLinearGradient(0, groundY - 50, 0, groundY);
    horizonGlow.addColorStop(0, 'transparent');
    horizonGlow.addColorStop(1, isOverclock ? 'rgba(255, 68, 102, 0.25)' : 'rgba(0, 255, 180, 0.15)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, groundY - 50, w, 50);
}

function drawCyberMoon(w, groundY, scale, now, isOverclock) {
    const mx = Math.max(70, w * 0.84);
    const my = groundY * 0.28;
    const mr = Math.min(26 * scale, 34);

    ctx.save();

    // 1. Halo luminosa / atmosfera externa
    const haloColor = isOverclock ? 'rgba(255, 0, 85, 0.42)' : 'rgba(0, 212, 255, 0.38)';
    const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2);
    halo.addColorStop(0, haloColor);
    halo.addColorStop(0.45, isOverclock ? 'rgba(255, 100, 120, 0.14)' : 'rgba(0, 180, 255, 0.12)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Anel Orbital Megastrutural (Metade Traseira)
    const ringAngle = -0.32;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ringAngle);

    ctx.strokeStyle = isOverclock ? 'rgba(255, 68, 102, 0.55)' : 'rgba(0, 212, 255, 0.55)';
    ctx.lineWidth = 1.6 * scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, mr * 1.85, mr * 0.42, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Estações espaciais na órbita traseira
    const stationAngles = [Math.PI * 1.25, Math.PI * 1.55, Math.PI * 1.85];
    for (const sa of stationAngles) {
        const stx = Math.cos(sa) * mr * 1.85;
        const sty = Math.sin(sa) * mr * 0.42;
        const bOn = Math.sin(now / 360 + sa * 12) > 0;
        ctx.fillStyle = bOn ? '#ffffff' : (isOverclock ? '#ff0055' : '#00ff88');
        ctx.beginPath();
        ctx.arc(stx, sty, 1.8 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 3. Disco da Lua com Esfericidade Gradiente
    const moonGrad = ctx.createLinearGradient(mx - mr * 0.8, my - mr * 0.8, mx + mr, my + mr);
    moonGrad.addColorStop(0, '#ffffff');
    moonGrad.addColorStop(0.5, isOverclock ? '#ffccd8' : '#e0f4ff');
    moonGrad.addColorStop(0.85, isOverclock ? '#bb4466' : '#5b96be');
    moonGrad.addColorStop(1, isOverclock ? '#4a1122' : '#17304e');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // 4. Insígnia Holográfica da Corporação projetada na Lua
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = isOverclock ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 255, 200, 0.4)';
    ctx.lineWidth = 1.2;
    // Círculos concêntricos e linhas quânticas
    ctx.beginPath();
    ctx.arc(mx, my, mr * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mx - mr * 0.6, my); ctx.lineTo(mx + mr * 0.6, my);
    ctx.moveTo(mx, my - mr * 0.6); ctx.lineTo(mx, my + mr * 0.6);
    ctx.stroke();

    ctx.restore();

    // 5. Anel Orbital Megastrutural (Metade Frontal)
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ringAngle);

    ctx.strokeStyle = isOverclock ? 'rgba(255, 68, 102, 0.95)' : 'rgba(0, 255, 220, 0.95)';
    ctx.lineWidth = 2.0 * scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, mr * 1.85, mr * 0.42, 0, 0, Math.PI);
    ctx.stroke();

    // Estações orbitais na órbita frontal
    const frontAngles = [Math.PI * 0.25, Math.PI * 0.52, Math.PI * 0.78];
    for (const fa of frontAngles) {
        const stx = Math.cos(fa) * mr * 1.85;
        const sty = Math.sin(fa) * mr * 0.42;
        const bOn = Math.sin(now / 280 + fa * 9) > 0;
        ctx.fillStyle = bOn ? '#ffffff' : (isOverclock ? '#ffd700' : '#00d4ff');
        ctx.beginPath();
        ctx.arc(stx, sty, 2.2 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();
}

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
}

function drawStars(w, groundY, now) {
    for (const s of stars) {
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 750 + s.tw));
        ctx.globalAlpha = tw * 0.9;
        ctx.fillStyle = '#e8f4ff';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * groundY, s.r, 0, 6.283);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawSearchlights(w, groundY, scale, now, isOverclock) {
    ctx.save();
    const count = 3;
    const speed = isOverclock ? 1200 : 2200;
    for (let i = 0; i < count; i++) {
        const sx = w * (0.18 + i * 0.32);
        const angle = -Math.PI / 2 + Math.sin(now / speed + i * 2.1) * 0.44;
        const len = groundY * 1.35;
        const tx = sx + Math.sin(angle) * len;
        const ty = groundY - Math.cos(angle) * len;

        const g = ctx.createLinearGradient(sx, groundY, tx, ty);
        const color = isOverclock ? '255, 0, 85' : (i === 1 ? '0, 255, 136' : '0, 212, 255');
        g.addColorStop(0, `rgba(${color}, 0.28)`);
        g.addColorStop(0.75, `rgba(${color}, 0.04)`);
        g.addColorStop(1, 'transparent');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx - 10 * scale, groundY);
        ctx.lineTo(tx - 40 * scale, ty);
        ctx.lineTo(tx + 40 * scale, ty);
        ctx.lineTo(sx + 10 * scale, groundY);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// Cidade Distante: Metrópole Cyberpunk com 40+ arranha-céus, janelas coloridas e luzes de aviação
function drawFarCityMetropolis(w, groundY, scale, now, isOverclock) {
    const count = Math.max(38, Math.floor(w / 26));

    for (let i = 0; i < count; i++) {
        const seed = i * 43.19;
        const bw = (16 + rand(seed) * 24) * scale;
        const bh = (35 + rand(seed + 1.2) * 95) * scale;
        const x = (i / count) * (w + 40) - 20;
        const y = groundY - bh;

        // Fachada do edifício distante
        const bodyColor = isOverclock ? 'rgba(28, 12, 24, 0.94)' : 'rgba(12, 20, 36, 0.94)';
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x, y, bw, bh);

        // Borda neon sutil no topo do prédio
        ctx.fillStyle = isOverclock ? 'rgba(255, 68, 102, 0.45)' : 'rgba(0, 212, 255, 0.35)';
        ctx.fillRect(x, y, bw, 1.5 * scale);

        // Grade de janelas iluminadas
        const cols = Math.max(2, Math.floor(bw / (4.5 * scale)));
        const rows = Math.max(3, Math.floor(bh / (8 * scale)));
        const pal = [
            'rgba(0, 212, 255, 0.75)',
            'rgba(255, 215, 0, 0.65)',
            'rgba(0, 255, 136, 0.65)',
            'rgba(255, 68, 102, 0.55)',
            'rgba(255, 255, 255, 0.85)'
        ];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const winOn = rand(seed + r * 7 + c * 13) > 0.42;
                if (!winOn) continue;
                const colIdx = Math.floor(rand(seed + r + c) * pal.length);
                ctx.fillStyle = isOverclock ? 'rgba(255, 80, 120, 0.75)' : pal[colIdx];
                ctx.fillRect(
                    x + 2 * scale + c * (3.5 * scale),
                    y + 4 * scale + r * (7 * scale),
                    1.8 * scale,
                    3.2 * scale
                );
            }
        }

        // Luz de aviação piscante nos topos mais altos
        if (bh > 70 * scale) {
            const bBlink = Math.sin(now / 420 + seed) > 0.2;
            if (bBlink) {
                ctx.fillStyle = isOverclock ? '#ffffff' : '#ff3344';
                ctx.beginPath();
                ctx.arc(x + bw / 2, y - 2 * scale, 1.6 * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// Dirigível Holográfico (Blade Runner Blimp)
const BLIMP_MESSAGES = [
    'MONEYMAKER TYCOON // CAPITAL GLOBAL',
    '📈 BOLSA QUÂNTICA: ALTA DE +100X',
    'IA NEURAL AUTÔNOMA // REATOR OPERACIONAL',
    'COLÔNIAS EM ÓRBITA // REGISTRO ABERTO',
    '⚡ ATIVE SOBRECARGA PARA +50% LUCRO',
    'COMPRE NA BAIXA • VENDA NA ALTA'
];

function drawBlimp(w, groundY, scale, now, isOverclock) {
    if (!blimp) return;
    blimp.x += blimp.vx;
    if (blimp.x < -0.25) blimp.x = 1.25;

    if (now > blimp.nextMsgTime) {
        blimp.msgIndex = (blimp.msgIndex + 1) % BLIMP_MESSAGES.length;
        blimp.nextMsgTime = now + 9000;
    }

    const bx = blimp.x * w;
    const by = groundY * blimp.y;
    const bw = 85 * scale;
    const bh = 22 * scale;

    ctx.save();

    // Chassi do dirigível
    ctx.fillStyle = isOverclock ? '#320d1c' : '#142236';
    ctx.beginPath();
    ctx.ellipse(bx, by, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isOverclock ? '#ff0055' : '#00d4ff';
    ctx.lineWidth = 1.4 * scale;
    ctx.stroke();

    // Cabine inferior
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 12 * scale, by + bh / 2 - 2 * scale, 24 * scale, 4 * scale);

    // Luz estroboscópica de navegação
    const navOn = Math.sin(now / 300) > 0;
    ctx.fillStyle = navOn ? '#ff3344' : '#00ff88';
    ctx.beginPath();
    ctx.arc(bx - bw / 2, by, 2 * scale, 0, Math.PI * 2);
    ctx.arc(bx + bw / 2, by, 2 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Painel Holográfico de LED Suspenso
    const holW = 100 * scale;
    const holH = 12 * scale;
    const hx = bx - holW / 2;
    const hy = by + bh / 2 + 3 * scale;

    ctx.fillStyle = 'rgba(6, 12, 24, 0.85)';
    ctx.fillRect(hx, hy, holW, holH);
    ctx.strokeStyle = isOverclock ? '#ff0055' : '#ffd700';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx, hy, holW, holH);

    ctx.fillStyle = isOverclock ? '#ffffff' : '#ffd700';
    ctx.font = `bold ${Math.max(6, Math.floor(6.5 * scale))}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BLIMP_MESSAGES[blimp.msgIndex], bx, hy + holH / 2);

    // Cone de holofote do dirigível apontado para o solo
    const spotGrad = ctx.createLinearGradient(bx, by + bh / 2, bx - 30 * scale, groundY);
    spotGrad.addColorStop(0, 'rgba(0, 212, 255, 0.22)');
    spotGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.moveTo(bx - 6 * scale, by + bh / 2);
    ctx.lineTo(bx - 40 * scale, groundY);
    ctx.lineTo(bx + 15 * scale, groundY);
    ctx.lineTo(bx + 6 * scale, by + bh / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

// Monotrilho Maglev de Alta Velocidade
function drawMonorail(w, groundY, scale, now) {
    if (!monorail) return;

    if (!monorail.active && now > monorail.nextSpawnTime) {
        monorail.active = true;
        monorail.x = -0.2;
    }

    if (!monorail.active) return;

    monorail.x += monorail.speed;
    if (monorail.x > 1.25) {
        monorail.active = false;
        monorail.nextSpawnTime = now + 8000 + Math.random() * 6000;
        return;
    }

    const mx = monorail.x * w;
    const trackY = groundY - 48 * scale;
    const trainLen = 42 * scale;
    const trainH = 5 * scale;

    ctx.save();

    // Trilho Magnético
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.35)';
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.moveTo(0, trackY);
    ctx.lineTo(w, trackY);
    ctx.stroke();

    // Corpo do trem
    ctx.fillStyle = '#e8f4ff';
    ctx.fillRect(mx, trackY - trainH, trainLen, trainH);

    // Janelas iluminadas em ciano
    ctx.fillStyle = '#00d4ff';
    for (let c = 0; c < 5; c++) {
        ctx.fillRect(mx + 3 * scale + c * (7 * scale), trackY - trainH + 1 * scale, 4 * scale, 2.5 * scale);
    }

    // Farol laser frontal
    const headG = ctx.createLinearGradient(mx + trainLen, trackY, mx + trainLen + 35 * scale, trackY);
    headG.addColorStop(0, 'rgba(0, 255, 200, 0.75)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.beginPath();
    ctx.moveTo(mx + trainLen, trackY - trainH);
    ctx.lineTo(mx + trainLen + 35 * scale, trackY - trainH - 6 * scale);
    ctx.lineTo(mx + trainLen + 35 * scale, trackY + 6 * scale);
    ctx.lineTo(mx + trainLen, trackY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawBuilding(b, w, groundY, scale, now, isOverclock) {
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

    // Fachada iluminada com gradiente e profundidade
    const g = ctx.createLinearGradient(x, y, x + bw, y);
    g.addColorStop(0, isOverclock ? '#3a1222' : s.body);
    g.addColorStop(1, shade(isOverclock ? '#3a1222' : s.body, -24));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, bh);

    // Contorno neon nítido
    ctx.strokeStyle = isOverclock ? 'rgba(255, 68, 102, 0.75)' : s.accent;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, bw, bh);

    // Friso superior no topo
    ctx.fillStyle = isOverclock ? '#ff0055' : shade(s.body, 42);
    ctx.fillRect(x, y, bw, Math.max(1.5, 2.5 * scale));

    drawWindows(b, x, y, bw, bh, scale, now, isOverclock);

    // Efeito Especial: Queda de Código Matrix para Servidores de IA (Tier 5)
    if (s.matrix && grow > 0.9) {
        drawMatrixWaterfall(x, y, bw, bh, scale, now);
    }

    // Antena com baliza piscante
    if (s.antenna && grow > 0.9) {
        ctx.strokeStyle = isOverclock ? '#ff0055' : 'rgba(0, 212, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y);
        ctx.lineTo(x + bw / 2, y - 14 * scale);
        ctx.stroke();
        blink(x + bw / 2, y - 14 * scale, scale, now, b.seed, isOverclock ? '#ffffff' : '#ff4466');
    }

    // Pináculo monumental
    if (s.spire && grow > 0.9) {
        ctx.fillStyle = shade(s.body, 45);
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y - 22 * scale);
        ctx.lineTo(x + bw, y);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        blink(x + bw / 2, y - 22 * scale, scale, now, b.seed, '#ffd700');
    }

    // Feixe orbital direto para o espaço para o Império Galáctico (Tier 6)
    if (s.beam && grow > 0.9) {
        drawOrbitalBeam(x + bw / 2, y - 22 * scale, scale, now);
    }

    // Outdoors Holográficos nos Tiers intermediários
    if (b.tier >= 2 && b.index % 2 === 0 && grow > 0.9) {
        drawHoloBillboard(x, y, bw, scale, now, b.seed, isOverclock);
    }

    ctx.globalAlpha = 1;
}

function drawWindows(b, x, y, bw, bh, scale, now, isOverclock) {
    const s = b.style;
    const pad = 3 * scale;
    const cw = (bw - pad * (s.cols + 1)) / s.cols;
    const rowH = 5.5 * scale, gap = 3.6 * scale;
    const rows = Math.floor((bh - pad * 2) / (rowH + gap));

    for (const win of b.windows) {
        if (win.r >= rows) continue;
        const life = 0.5 + 0.5 * Math.sin(now / 1100 + win.ph);
        if (!win.on && life < 0.88) continue;
        ctx.globalAlpha = win.on ? 0.75 + life * 0.25 : 0.25;
        ctx.fillStyle = isOverclock ? '#ff6699' : s.win;
        ctx.fillRect(
            x + pad + win.c * (cw + pad),
            y + pad + win.r * (rowH + gap),
            cw, rowH
        );
    }
    ctx.globalAlpha = 1;
}

function drawMatrixWaterfall(x, y, bw, bh, scale, now) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 136, 0.75)';
    ctx.font = `${Math.max(5, Math.floor(5.5 * scale))}px monospace`;
    const colCount = Math.floor(bw / (6 * scale));
    for (let c = 0; c < colCount; c++) {
        const fallY = y + ((now * 0.08 + c * 25) % Math.max(10, bh - 10 * scale));
        const char = (c + Math.floor(now / 200)) % 2 === 0 ? '1' : '0';
        ctx.fillText(char, x + 3 * scale + c * (6 * scale), fallY);
    }
    ctx.restore();
}

function drawOrbitalBeam(topX, topY, scale, now) {
    ctx.save();
    const beamPulse = 0.6 + 0.4 * Math.sin(now / 180);
    const g = ctx.createLinearGradient(topX, topY, topX, 0);
    g.addColorStop(0, 'rgba(255, 0, 85, 0.85)');
    g.addColorStop(0.5, 'rgba(255, 215, 0, 0.55)');
    g.addColorStop(1, 'rgba(0, 212, 255, 0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(topX - 2 * scale * beamPulse, 0, 4 * scale * beamPulse, topY);
    ctx.restore();
}

function blink(x, y, scale, now, seed, color) {
    const on = Math.sin(now / 450 + seed) > 0.1;
    ctx.globalAlpha = on ? 1 : 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.2 * scale, 0, 6.283);
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
        if (dist > 30 * scale && dist < 130 * scale) {
            const minX = Math.min(x1 + b1.style.w * scale, x2 + b2.style.w * scale);
            const maxX = Math.max(x1, x2);
            const bridgeY = groundY - 65 * scale;
            ctx.fillStyle = 'rgba(0, 212, 255, 0.35)';
            ctx.fillRect(minX, bridgeY, maxX - minX, 4.5 * scale);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(minX, bridgeY + 1 * scale, maxX - minX, 1.2 * scale);
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
        const a = Math.sin(t * Math.PI) * 0.8;
        g.addColorStop(0, `rgba(0, 255, 180, 0)`);
        g.addColorStop(1, `rgba(0, 255, 180, ${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 20, 0, 40, groundY);
    }
}

function drawLaserFlares(w, groundY, scale, now) {
    laserFlares = laserFlares.filter(f => now - f.at < 1000);
    for (const f of laserFlares) {
        const progress = (now - f.at) / 1000;
        const alpha = 1 - progress;
        const radius = (progress * 45 + 5) * scale;

        ctx.save();
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2.5 * scale * (1 - progress);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Raio vertical que atinge o ponto
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - 1.5 * scale, 0, 3 * scale, f.y);
        ctx.restore();
    }
}

// Rodovia Cyberpunk no rodapé com tráfego animado em 2 sentidos
function drawGroundHighway(w, h, groundY, scale, now, isOverclock) {
    ctx.save();

    // Faixa base de asfalto tecnológico
    const g = ctx.createLinearGradient(0, groundY, 0, h);
    g.addColorStop(0, isOverclock ? '#330818' : '#0a1628');
    g.addColorStop(0.3, '#060d18');
    g.addColorStop(1, '#02050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Linha neon do divisor de pistas
    ctx.strokeStyle = isOverclock ? 'rgba(255, 0, 85, 0.85)' : 'rgba(0, 255, 136, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(w, groundY + 0.5);
    ctx.stroke();

    // Linha de centro tracejada
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8 * scale, 12 * scale]);
    ctx.lineDashOffset = -now * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 8 * scale);
    ctx.lineTo(w, groundY + 8 * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fluxo contínuo de faróis: Pista 1 (Esquerda -> Direita)
    const trafficCars = 8;
    for (let i = 0; i < trafficCars; i++) {
        const tx = ((now * 0.12 + i * (w / trafficCars)) % (w + 40)) - 20;
        const ty = groundY + 4.5 * scale;
        const tg = ctx.createLinearGradient(tx - 15 * scale, ty, tx, ty);
        tg.addColorStop(0, 'transparent');
        tg.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.moveTo(tx - 15 * scale, ty);
        ctx.lineTo(tx, ty);
        ctx.stroke();
    }

    // Fluxo contínuo de lanternas traseiras: Pista 2 (Direita -> Esquerda)
    for (let i = 0; i < trafficCars; i++) {
        const rx = w - (((now * 0.09 + i * (w / trafficCars)) % (w + 40)) - 20);
        const ry = groundY + 12 * scale;
        const rg = ctx.createLinearGradient(rx + 16 * scale, ry, rx, ry);
        rg.addColorStop(0, 'transparent');
        rg.addColorStop(1, 'rgba(255, 40, 80, 0.9)');
        ctx.strokeStyle = rg;
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.moveTo(rx + 16 * scale, ry);
        ctx.lineTo(rx, ry);
        ctx.stroke();
    }

    ctx.restore();
}

function easeOutBack(t) {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function shade(hex, amount) {
    if (!hex || hex[0] !== '#') return 'rgb(20,40,70)';
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amount), g = clamp(((n >> 8) & 255) + amount), b = clamp((n & 255) + amount);
    return `rgb(${r},${g},${b})`;
}

export function pruneSkyline() {
    if (buildings.some(b => b.dead)) buildings = buildings.filter(b => !b.dead);
}

function drawHovercars(w, groundY, scale, now, isOverclock) {
    const dt = FRAME_MS;
    const speedMult = isOverclock ? 1.5 : 1.0;
    for (const d of hovercars) {
        d.x += d.vx * dt * speedMult;
        if (d.x > 1.18) d.x = -0.18;
        if (d.x < -0.18) d.x = 1.18;

        const px = d.x * w;
        const py = d.y * groundY + Math.sin(now / 750 + d.x * 6) * 3.5 * scale;
        const len = d.trailLen * scale * (d.dir > 0 ? -1 : 1);

        // Rastro laser brilhante
        const g = ctx.createLinearGradient(px, py, px + len, py);
        g.addColorStop(0, isOverclock ? '#ff0055' : d.color);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.2, 2.0 * scale);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + len, py);
        ctx.stroke();

        // Veículo voador
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, d.size * scale, 0, 6.283);
        ctx.fill();
    }
}

function drawShootingStar(w, groundY, now) {
    if (!shootingStar && Math.random() < 0.015) {
        shootingStar = {
            x: rand(now) * 0.7 * w,
            y: rand(now + 1) * 0.3 * groundY,
            vx: 4.5 + rand(now + 2) * 4.5,
            vy: 2.0 + rand(now + 3) * 2.5,
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
        ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.life * 0.95})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(shootingStar.x, shootingStar.y);
        ctx.lineTo(shootingStar.x - shootingStar.vx * 6, shootingStar.y - shootingStar.vy * 6);
        ctx.stroke();
    }
}

const BILLBOARD_MESSAGES = ['MONEYMAKER', '📈 BULL RUN', 'HODL 💎', 'DIVIDENDOS', '100X', 'WALL ST', 'PROFIT'];

function drawHoloBillboard(x, y, bw, scale, now, seed, isOverclock) {
    const pulse = 0.7 + 0.3 * Math.sin(now / 350 + seed);
    const colors = ['#00d4ff', '#ff00aa', '#00ff88', '#ffd700', '#b366ff'];
    const idx = Math.floor(Math.abs(seed * 11)) % colors.length;
    const col = isOverclock ? '#ff0055' : colors[idx];
    const msg = BILLBOARD_MESSAGES[Math.floor(Math.abs(seed * 7)) % BILLBOARD_MESSAGES.length];

    const boardW = Math.min(bw * 0.92, 52 * scale);
    const boardH = 11 * scale;
    const bx = x + (bw - boardW) / 2;
    const by = y - boardH - 3 * scale;

    ctx.globalAlpha = pulse * 0.95;
    ctx.fillStyle = 'rgba(8, 16, 32, 0.85)';
    ctx.fillRect(bx, by, boardW, boardH);

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, boardW, boardH);

    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(6, Math.floor(6.8 * scale))}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, bx + boardW / 2, by + boardH / 2);
    ctx.globalAlpha = 1;
}

function drawFeverWeather(w, groundY, now) {
    ctx.save();
    // Chuva digital dourada
    ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
    const drops = 25;
    for (let i = 0; i < drops; i++) {
        const dx = (rand(i * 17) * w + (now * 0.22)) % w;
        const dy = (rand(i * 29) * groundY + (now * 0.5)) % groundY;
        ctx.fillRect(dx, dy, 1.8, 8);
    }
    ctx.restore();
}
