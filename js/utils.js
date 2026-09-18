// Formatação de números, áudio e notificações. Sem dependências do jogo.

const NUMBER_SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td'];

export function formatNumber(n) {
    if (!Number.isFinite(n) || n < 0) return '$0';
    // Valores pequenos precisam de decimais: no início do jogo a renda é
    // fracionária (0,25/s) e arredondar fazia tudo aparecer como "$0".
    if (n > 0 && n < 100) return '$' + (+n.toFixed(2)).toString();
    if (n < 1000) return '$' + Math.floor(n);

    let tier = Math.min(NUMBER_SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
    let scaled = n / Math.pow(1000, tier);
    // 999.999 arredondaria para "1000.00k" em vez de subir para "1.00M"
    if (scaled >= 999.995 && tier < NUMBER_SUFFIXES.length - 1) {
        tier++;
        scaled = n / Math.pow(1000, tier);
    }
    return '$' + scaled.toFixed(2) + NUMBER_SUFFIXES[tier];
}

// O estado do som fica aqui como flag: assim este módulo não precisa conhecer
// o DOM nem a checkbox que o controla.
let soundEnabled = true;
export function setSoundEnabled(value) { soundEnabled = !!value; }

// Singleton de AudioContext reutilizável: evita estourar o limite de contextos do navegador
let audioCtx = null;
function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

export function playSound(freq = 800, duration = 100) {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = Math.max(50, Math.min(10000, freq));
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) { /* autoplay bloqueado ou sem AudioContext */ }
}

/** Faixa central para acontecimentos grandes — um toast de canto não dá conta. */
export function showBanner(kicker, title, sub = '', gold = false) {
    if (typeof document === 'undefined') return;
    const node = document.createElement('div');
    node.className = 'banner' + (gold ? ' gold' : '');
    node.innerHTML =
        `<div class="banner-kicker">${kicker}</div>` +
        `<div class="banner-title">${title}</div>` +
        (sub ? `<div class="banner-sub">${sub}</div>` : '');
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2900);
}

/** Onda de choque a partir do centro da tela. */
export function shockwave(color) {
    if (typeof document === 'undefined') return;
    const node = document.createElement('div');
    node.className = 'shockwave';
    if (color) node.style.borderColor = color;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 950);
}

const MAX_TOASTS = 4;
let activeToasts = [];

function repositionToasts() {
    activeToasts.forEach((t, i) => {
        t.style.bottom = (20 + i * 56) + 'px';
    });
}

export function showNotification(text, icon = '✨', duration = 2500) {
    if (typeof document === 'undefined') return;

    // Remove os mais antigos se exceder o limite visual
    while (activeToasts.length >= MAX_TOASTS) {
        const oldest = activeToasts.shift();
        if (oldest) {
            if (oldest._timer) clearTimeout(oldest._timer);
            if (oldest._leaveTimer) clearTimeout(oldest._leaveTimer);
            if (oldest.parentNode) oldest.remove();
        }
    }

    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<span class="toast-icon">${icon}</span><span>${text}</span>`;
    document.body.appendChild(node);
    activeToasts.push(node);
    repositionToasts();

    playSound(2000, 150);

    node._timer = setTimeout(() => {
        node.classList.add('leaving');
        node._leaveTimer = setTimeout(() => {
            if (node.parentNode) node.remove();
            activeToasts = activeToasts.filter(t => t !== node);
            repositionToasts();
        }, 250);
    }, duration);
}

