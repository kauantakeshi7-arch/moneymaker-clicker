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

export function playSound(freq = 800, duration = 100) {
    if (!soundEnabled) return;
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
    } catch (e) { /* autoplay bloqueado ou sem AudioContext */ }
}

let toastCount = 0;
export function showNotification(text, icon = '✨', duration = 2500) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.style.bottom = (20 + toastCount * 56) + 'px';
    node.innerHTML = `<span class="toast-icon">${icon}</span><span>${text}</span>`;
    document.body.appendChild(node);
    toastCount++;
    playSound(2000, 150);
    setTimeout(() => {
        node.classList.add('leaving');
        setTimeout(() => { node.remove(); toastCount = Math.max(0, toastCount - 1); }, 250);
    }, duration);
}
