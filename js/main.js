// Inicialização, atalhos de teclado e loop principal.

// ============ KEYBOARD ============
window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !document.querySelector('.modal.active')) {
        e.preventDefault();
        document.getElementById('clickButton').click();
    }
    if (e.key === 'p' || e.key === 'P') prestige();
    if (e.key === 'c' || e.key === 'C') toggleChart();
    if (e.key === 's' || e.key === 'S') openModal('statsModal');
    if (e.key === 'Escape') Object.keys({infoModal:1, economyModal:1, statsModal:1, settingsModal:1}).forEach(id => closeModal(id));
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) closeModal(e.target.id);
});

document.getElementById('clickButton').addEventListener('click', (e) => {
    if (!document.querySelector('.modal.active')) {
        const before = gameState.money;
        const baseClick = getClickValue();
        const isCrit = Math.random() < gameState.critChance;
        addMoney(isCrit ? baseClick * gameState.critMultiplier : baseClick, true);
        const gained = gameState.money - before;
        spawnClickParticle(gained, e.clientX, e.clientY - 20, isCrit);
        if (isCrit) playSound(2600, 180);
    }
});

document.getElementById('soundToggle').addEventListener('change', (e) => {
    localStorage.setItem('soundEnabled', e.target.checked);
});

document.getElementById('aiToggle').addEventListener('change', (e) => {
    localStorage.setItem('aiEnabled', e.target.checked);
});

document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || file.size > 500000) { alert('Arquivo grande!'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = evt.target.result;
            if (!data || data.length < 10) throw new Error('Vazio');
            const parsed = JSON.parse(data);
            if (!gameState.isValidSaveShape(parsed)) throw new Error('Formato inválido');
            localStorage.setItem('mm_save_v15', data);
            location.reload();
        } catch (err) { alert('Save inválido ou corrompido!'); e.target.value = ''; }
    };
    reader.readAsText(file);
});

// ============ INICIALIZAÇÃO ============
cacheDomRefs();
gameState.load();
gameState.validate();
document.getElementById('soundToggle').checked = localStorage.getItem('soundEnabled') !== 'false';
document.getElementById('aiToggle').checked = localStorage.getItem('aiEnabled') !== 'false';

createUpgradeButtons();
initChart();
initPixiEngine();
updateDisplay();
if (gameState.unlockedAchievements.length > 0) {
    el.achBadge.style.display = 'flex';
    el.achBadge.textContent = gameState.unlockedAchievements.length;
}
checkAchievements();

if (gameState._offlineEarnings > 0) {
    const secs = gameState._offlineSeconds;
    const timeStr = secs < 3600 ? Math.floor(secs / 60) + 'm' : (secs / 3600).toFixed(1) + 'h';
    showNotification(`Bem-vindo de volta! +${formatNumber(gameState._offlineEarnings)} (${timeStr} offline)`, '🌙', 6000);
}

// ============ LOOP PRINCIPAL (baseado em tempo real) ============
// Navegadores limitam setInterval em abas de fundo (~1×/s): assumir 100ms fixos
// fazia o jogador perder até 90% da renda com a aba minimizada.
let lastTickTime = Date.now();
let saveAccumulator = 0;

function gameTick() {
    const now = Date.now();
    let deltaMs = now - lastTickTime;
    lastTickTime = now;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) deltaMs = 0;
    deltaMs = Math.min(deltaMs, 3600000); // sanidade contra relógio do sistema pulando

    gameState.validate();

    const rawDps = getRawDPS();
    if (rawDps > 0 && Number.isFinite(rawDps)) addMoney(rawDps * (deltaMs / 1000));

    const goldenRate = getRunEffectValue('goldenRate', 1) *
        (1 - gameState.prestigeShopLevels.goldenLuck * 0.15);
    goldenEventTimer += deltaMs;
    if (goldenEventTimer > nextGoldenEventAt * Math.max(0.2, goldenRate)) {
        goldenEventTimer = 0;
        nextGoldenEventAt = 40000 + Math.random() * 40000;
        spawnGoldenEvent();
    }

    runAI();
    updateDisplay();
    checkAchievements();

    saveAccumulator += deltaMs;
    if (saveAccumulator >= 1000) {
        gameState.save();
        saveAccumulator = 0;
    }
}

setInterval(gameTick, 100);
