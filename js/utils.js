// Formatação de números, som e notificações.

// ============ UTILITÁRIOS ============
const NUMBER_SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td'];
function formatNumber(n) {
    if (!Number.isFinite(n) || n < 0) return '$0';
    // valores pequenos precisam de decimais: no início do jogo a renda é fracionária
    // (0,25/s) e arredondar fazia tudo aparecer como "$0", parecendo que nada acontecia
    if (n > 0 && n < 100) return '$' + (+n.toFixed(2)).toString();
    if (n < 1000) return '$' + Math.floor(n);
    let tier = Math.min(NUMBER_SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
    let scaled = n / Math.pow(1000, tier);
    if (scaled >= 999.995 && tier < NUMBER_SUFFIXES.length - 1) {
        tier++;
        scaled = n / Math.pow(1000, tier);
    }
    return '$' + scaled.toFixed(2) + NUMBER_SUFFIXES[tier];
}

function playSound(freq = 800, duration = 100) {
    if (!document.getElementById('soundToggle').checked) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = Math.max(50, Math.min(10000, freq));
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) {}
}

let toastCount = 0;
function showNotification(text, icon = '✨', duration = 2500) {
    const el = document.createElement('div');
    el.className = 'toast';
    const bottom = 20 + (toastCount * 56);
    el.style.bottom = bottom + 'px';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${text}</span>`;
    document.body.appendChild(el);
    toastCount++;
    playSound(2000, 150);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => { el.remove(); toastCount = Math.max(0, toastCount - 1); }, 250);
    }, duration);
}

function spawnClickParticleDOM(amount, x, y, isCrit = false) {
    const el = document.createElement('div');
    el.className = 'click-particle' + (isCrit ? ' crit' : '');
    el.textContent = (isCrit ? 'CRÍTICO! ' : '') + '+' + formatNumber(amount);
    el.style.left = (x + (Math.random() * 40 - 20)) + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

function spawnConfettiDOM() {
    const colors = ['#ffd700', '#00d4ff', '#00ff88', '#ffaa00', '#b366ff'];
    for (let i = 0; i < 40; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        el.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
        el.style.animationDelay = (Math.random() * 0.3) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }
}
