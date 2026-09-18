// Efeitos visuais: PixiJS acelerado por GPU, com fallback em DOM quando a
// biblioteca não carrega (CDN bloqueada, rede offline).

import { formatNumber } from './utils.js';

let pixiApp = null;
let pixiAmbientTimer = 0;

// Celulares têm menos GPU e tela menor: menos partículas, mesmo efeito.
const isSmallScreen = () => window.innerWidth < 600;
const CONFETTI_COUNT = () => isSmallScreen() ? 45 : 90;
const AMBIENT_INTERVAL_MS = () => isSmallScreen() ? 3800 : 2200;

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

export async function initPixiEngine() {
    try {
        if (typeof PIXI === 'undefined') throw new Error('PIXI não carregado');
        const app = new PIXI.Application();
        await app.init({
            resizeTo: window, backgroundAlpha: 0, antialias: true,
            autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2)
        });
        app.canvas.style.position = 'fixed';
        app.canvas.style.inset = '0';
        app.canvas.style.zIndex = '150';
        app.canvas.style.pointerEvents = 'none';
        document.body.appendChild(app.canvas);
        pixiApp = app;
        pixiApp.ticker.add(() => {
            pixiAmbientTimer += pixiApp.ticker.deltaMS;
            if (pixiAmbientTimer > AMBIENT_INTERVAL_MS()) {
                pixiAmbientTimer = 0;
                spawnAmbientMote();
            }
        });
    } catch (e) {
        console.warn('PixiJS indisponível, usando fallback DOM para efeitos:', e);
        pixiApp = null;
    }
}

function spawnAmbientMote() {
    if (!pixiApp) return;
    const icons = ['$', '💰', '✦'];
    const txt = new PIXI.Text({
        text: icons[Math.floor(Math.random() * icons.length)],
        style: { fontFamily: 'Orbitron, monospace', fontSize: 12 + Math.random() * 10, fill: 0x00d4ff }
    });
    txt.alpha = 0.001;
    txt.x = Math.random() * pixiApp.screen.width;
    txt.y = pixiApp.screen.height + 20;
    txt.alpha = 0.15 + Math.random() * 0.15;
    pixiApp.stage.addChild(txt);
    let elapsed = 0;
    const duration = 6000 + Math.random() * 3000;
    const startY = txt.y;
    const drift = (Math.random() - 0.5) * 60;
    const tick = () => {
        elapsed += pixiApp.ticker.deltaMS;
        const t = Math.min(1, elapsed / duration);
        txt.y = startY - (startY + 40) * t;
        txt.x += drift * 0.002;
        txt.alpha = (1 - t) * 0.28;
        if (t >= 1) {
            pixiApp.stage.removeChild(txt); txt.destroy();
            pixiApp.ticker.remove(tick);
        }
    };
    pixiApp.ticker.add(tick);
}

export function spawnClickParticle(amount, x, y, isCrit = false) {
    if (!pixiApp) return spawnClickParticleDOM(amount, x, y, isCrit);
    const text = new PIXI.Text({
        text: (isCrit ? 'CRÍTICO! ' : '') + '+' + formatNumber(amount),
        style: {
            fontFamily: 'Orbitron, monospace', fontSize: isCrit ? 24 : 18, fontWeight: '800',
            fill: isCrit ? 0xffd700 : 0x00ff88, stroke: { color: 0x001a10, width: 3 },
            dropShadow: { color: isCrit ? 0xffd700 : 0x00ff88, blur: isCrit ? 14 : 8, distance: 0, alpha: 0.85 }
        }
    });
    text.anchor.set(0.5);
    text.x = x + (Math.random() * 40 - 20);
    text.y = y;
    text.scale.set(0.7);
    pixiApp.stage.addChild(text);
    let elapsed = 0;
    const duration = 900;
    const tick = () => {
        elapsed += pixiApp.ticker.deltaMS;
        const t = Math.min(1, elapsed / duration);
        text.y = y - 70 * easeOutQuad(t);
        text.alpha = 1 - t;
        text.scale.set(0.7 + 0.45 * Math.min(1, t / 0.15));
        if (t >= 1) {
            pixiApp.stage.removeChild(text); text.destroy();
            pixiApp.ticker.remove(tick);
        }
    };
    pixiApp.ticker.add(tick);
}

export function spawnConfetti() {
    if (!pixiApp) return spawnConfettiDOM();
    const colors = [0xffd700, 0x00d4ff, 0x00ff88, 0xffaa00, 0xb366ff];
    const pieces = [];
    const count = CONFETTI_COUNT();
    for (let i = 0; i < count; i++) {
        const g = new PIXI.Graphics();
        const color = colors[Math.floor(Math.random() * colors.length)];
        if (Math.random() > 0.5) g.circle(0, 0, 4).fill(color); else g.rect(-4, -4, 8, 8).fill(color);
        g.x = Math.random() * pixiApp.screen.width;
        g.y = -20 - Math.random() * 200;
        g.vy = 2.5 + Math.random() * 3.5;
        g.vx = (Math.random() - 0.5) * 2.5;
        g.rotSpeed = (Math.random() - 0.5) * 0.25;
        pixiApp.stage.addChild(g);
        pieces.push(g);
    }
    let elapsed = 0;
    const duration = 3200;
    const tick = () => {
        elapsed += pixiApp.ticker.deltaMS;
        pieces.forEach(p => {
            p.y += p.vy; p.x += p.vx; p.rotation += p.rotSpeed;
            p.alpha = Math.max(0, 1 - elapsed / duration);
        });
        if (elapsed >= duration) {
            pieces.forEach(p => { pixiApp.stage.removeChild(p); p.destroy(); });
            pixiApp.ticker.remove(tick);
        }
    };
    pixiApp.ticker.add(tick);
}

// ============ FALLBACK EM DOM ============
// Usado quando o PixiJS não carrega. Mesma leitura visual, via CSS.
function spawnClickParticleDOM(amount, x, y, isCrit = false) {
    const node = document.createElement('div');
    node.className = 'click-particle' + (isCrit ? ' crit' : '');
    node.textContent = (isCrit ? 'CRÍTICO! ' : '') + '+' + formatNumber(amount);
    node.style.left = (x + (Math.random() * 40 - 20)) + 'px';
    node.style.top = y + 'px';
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 900);
}

function spawnConfettiDOM() {
    const colors = ['#ffd700', '#00d4ff', '#00ff88', '#ffaa00', '#b366ff'];
    const count = isSmallScreen() ? 20 : 40;
    for (let i = 0; i < count; i++) {
        const node = document.createElement('div');
        node.className = 'confetti-piece';
        node.style.left = Math.random() * 100 + 'vw';
        node.style.background = colors[Math.floor(Math.random() * colors.length)];
        node.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        node.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
        node.style.animationDelay = (Math.random() * 0.3) + 's';
        document.body.appendChild(node);
        setTimeout(() => node.remove(), 3500);
    }
}
