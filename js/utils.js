// Formatação de números, áudio e notificações. Sem dependências do jogo.

const NUMBER_SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td'];

let notationMode = 'standard';
export function setNotationMode(mode) { notationMode = mode === 'scientific' ? 'scientific' : 'standard'; }

export function formatNumber(n) {
    if (!Number.isFinite(n) || n < 0) return '$0';
    // Valores pequenos precisam de decimais: no início do jogo a renda é
    // fracionária (0,25/s) e arredondar fazia tudo aparecer como "$0".
    if (n > 0 && n < 100) return '$' + (+n.toFixed(2)).toString();
    if (n < 1000) return '$' + Math.floor(n);

    if (notationMode === 'scientific') {
        return '$' + n.toExponential(2);
    }

    let tier = Math.min(NUMBER_SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
    let scaled = n / Math.pow(1000, tier);
    // 999.999 arredondaria para "1000.00k" em vez de subir para "1.00M"
    if (scaled >= 999.995 && tier < NUMBER_SUFFIXES.length - 1) {
        tier++;
        scaled = n / Math.pow(1000, tier);
    }
    return '$' + scaled.toFixed(2) + NUMBER_SUFFIXES[tier];
}

// O estado do som e vibração ficam aqui como flags desacopladas do DOM.
let soundEnabled = true;
export function setSoundEnabled(value) { soundEnabled = !!value; }

let soundVolume = 0.8;
export function setSoundVolume(value) {
    soundVolume = Math.max(0, Math.min(1, Number(value) || 0));
}
export function getSoundVolume() { return soundVolume; }

let hapticsEnabled = true;
export function setHapticsEnabled(value) { hapticsEnabled = !!value; }

export function vibrate(pattern = 10) {
    if (!hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
}

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
        const amp = 0.1 * soundVolume;
        gain.gain.setValueAtTime(amp, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.1), ctx.currentTime + duration / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) { /* autoplay bloqueado ou sem AudioContext */ }
}

/** Clique com frequência que escala dinamicamente com o combo do jogador */
export function playClickSound(combo = 1) {
    const pitch = 520 + Math.min(Math.floor(combo) * 14, 1100);
    playSound(pitch, 65);
    vibrate(8);
}

/** Som bitonal característico de compra/caixa registradora */
export function playCashSound() {
    if (!soundEnabled || typeof window === 'undefined') {
        vibrate(20);
        return;
    }
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        [784, 1046].forEach((f, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = f;
            const start = ctx.currentTime + idx * 0.04;
            const amp = 0.08 * soundVolume;
            gain.gain.setValueAtTime(amp, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.05), start + 0.12);
            osc.start(start);
            osc.stop(start + 0.12);
        });
        vibrate(22);
    } catch (e) { playSound(1200, 100); }
}

/** Arpeggio cintilante para cliques críticos */
export function playCritSound() {
    if (!soundEnabled || typeof window === 'undefined') {
        vibrate([15, 30, 25]);
        return;
    }
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        [1318, 1760, 2093].forEach((f, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.value = f;
            const start = ctx.currentTime + idx * 0.05;
            const amp = 0.12 * soundVolume;
            gain.gain.setValueAtTime(amp, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.04), start + 0.15);
            osc.start(start);
            osc.stop(start + 0.15);
        });
        vibrate([15, 30, 25]);
    } catch (e) { playSound(2600, 180); }
}

/** Acorde maior triunfal ao prestigiar */
export function playPrestigeSound() {
    if (!soundEnabled || typeof window === 'undefined') {
        vibrate([40, 60, 100]);
        return;
    }
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        [523, 659, 784, 1046].forEach((f, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = f;
            const start = ctx.currentTime + idx * 0.07;
            const amp = 0.14 * soundVolume;
            gain.gain.setValueAtTime(amp, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.03), start + 0.35);
            osc.start(start);
            osc.stop(start + 0.35);
        });
        vibrate([40, 60, 100]);
    } catch (e) { playSound(2000, 200); }
}

/** Som sutil e futurista de passar o cursor em botões */
export function playHoverSound() {
    if (!soundEnabled || soundVolume <= 0 || typeof window === 'undefined') return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1400;
        const amp = 0.015 * soundVolume;
        gain.gain.setValueAtTime(amp, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.03);
    } catch (e) {}
}

// ============ MÚSICA AMBIENTE PROCEDURAL (Sintetizador Web Audio) ============
let musicEnabled = false;
let musicVolume = 0.5;
export function setMusicVolume(value) {
    musicVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (musicGain && audioCtx) {
        try {
            musicGain.gain.setValueAtTime(0.045 * musicVolume, audioCtx.currentTime);
        } catch (e) {}
    }
}
export function getMusicVolume() { return musicVolume; }

let musicGain = null;
let musicTimer = null;
let currentChordIdx = 0;
let activeOscillators = [];

const AMBIENT_CHORDS = [
    [146.83, 220.00, 261.63, 329.63], // Dm9
    [116.54, 174.61, 220.00, 261.63], // Bbmaj7
    [174.61, 220.00, 261.63, 329.63], // Fmaj7
    [130.81, 196.00, 246.94, 293.66]  // Cadd9
];

export function setMusicEnabled(enabled) {
    musicEnabled = !!enabled;
    if (musicEnabled) {
        startAmbientMusic();
    } else {
        stopAmbientMusic();
    }
}

export function startAmbientMusic() {
    if (!musicEnabled || typeof window === 'undefined') return;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (!musicGain) {
        musicGain = ctx.createGain();
        musicGain.gain.setValueAtTime(0.045 * musicVolume, ctx.currentTime);
        musicGain.connect(ctx.destination);
    } else {
        musicGain.gain.setValueAtTime(0.045 * musicVolume, ctx.currentTime);
    }

    if (musicTimer) clearInterval(musicTimer);
    playNextChord();
    musicTimer = setInterval(playNextChord, 4200);
}

export function stopAmbientMusic() {
    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }
    const ctx = getAudioContext();
    if (ctx && activeOscillators.length > 0) {
        activeOscillators.forEach(({ osc, gain }) => {
            try {
                gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
                setTimeout(() => { try { osc.stop(); osc.disconnect(); } catch (e) {} }, 700);
            } catch (e) {}
        });
        activeOscillators = [];
    }
}

function playNextChord() {
    if (!musicEnabled || typeof window === 'undefined') return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const chord = AMBIENT_CHORDS[currentChordIdx];
    currentChordIdx = (currentChordIdx + 1) % AMBIENT_CHORDS.length;

    // Fade out anterior suave
    const prev = [...activeOscillators];
    activeOscillators = [];
    prev.forEach(({ osc, gain }) => {
        try {
            gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
            setTimeout(() => { try { osc.stop(); osc.disconnect(); } catch (e) {} }, 1300);
        } catch (e) {}
    });

    // Filtro analógico low-pass para som aveludado e relaxante
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, ctx.currentTime);
    filter.Q.value = 1.2;
    filter.connect(musicGain);

    chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8; // Leve chorus

        osc.connect(gain);
        gain.connect(filter);

        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 1.6);

        osc.start(ctx.currentTime);
        activeOscillators.push({ osc, gain });
    });
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

