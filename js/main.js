// Ponto de entrada: liga os eventos da interface e roda os loops.

import { SAVE_KEY } from './config.js';
import { gameState } from './state.js';
import { formatNumber, showNotification, playSound, setSoundEnabled, showBanner, shockwave } from './utils.js';
import { initPixiEngine, spawnClickParticle } from './vfx.js';
import {
    addMoney, getClickValue, getCritChance, getCritMultiplier, getRawDPS,
    getRunEffectValue, prestige, runAI, checkAchievements, spawnGoldenEvent,
    applyOfflineProgress, setAutomationEnabled, getEffectiveMultiplier
} from './economy.js';
import { el, cacheDomRefs } from './ui/dom.js';
import { createUpgradeButtons, setBulkMode } from './ui/businesses.js';
import { updateDisplay, resetUnlockTracking } from './ui/hud.js';
import { initChart, recordChartSample, toggleChart } from './ui/chart.js';
import {
    openModal, closeModal, exportSave, resetGame,
    buyMoneyUpgrade, buyPrestigeShopItem
} from './ui/modals.js';
import { initSkyline, syncSkyline, drawSkyline, pruneSkyline } from './skyline.js';

// Namespaces só para o console de depuração (ver `exposeDebugApi` no fim).
import * as config from './config.js';
import * as economy from './economy.js';
import * as ui from './ui/hud.js';
import * as uiCards from './ui/businesses.js';
import * as uiModals from './ui/modals.js';
import * as utils from './utils.js';
import * as skyline from './skyline.js';

// ============ AÇÕES DA INTERFACE ============
// Um mapa de nome → função, acionado por `data-action` no HTML. Evita
// onclick inline, que exigiria expor tudo no escopo global.
/** O prestígio derruba a cidade e reconstrói do zero. */
function doPrestige() {
    const before = gameState.prestigeLevel;
    prestige(() => {
        createUpgradeButtons();
        resetUnlockTracking();
        syncSkyline();
    });
    if (gameState.prestigeLevel > before) {
        shockwave('#ffd700');
        showBanner('Renascimento', `Prestígio ${gameState.prestigeLevel}`,
            `Multiplicador ×${getEffectiveMultiplier().toFixed(2)} — a cidade recomeça`, true);
    }
}

const ACTIONS = {
    prestige: doPrestige,
    toggleChart,
    openModal: target => openModal(target),
    closeModal: target => closeModal(target),
    setBulk: target => setBulkMode(target === 'max' ? 'max' : Number(target)),
    buyUpgrade: target => buyMoneyUpgrade(target),
    buyPrestige: target => buyPrestigeShopItem(target),
    exportSave,
    importSave: () => document.getElementById('importInput').click(),
    resetGame
};

// Um único listener para a página inteira, em vez de um por botão.
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action]');
    if (trigger) {
        const action = ACTIONS[trigger.dataset.action];
        if (action) { action(trigger.dataset.target); return; }
    }
    // clique no fundo escurecido fecha a modal
    if (e.target.classList.contains('modal')) closeModal(e.target.id);
});

// ============ CLIQUE PRINCIPAL ============
function handleMainClick(e) {
    if (document.querySelector('.modal.active')) return;

    const before = gameState.money;
    const base = getClickValue();
    const isCrit = Math.random() < getCritChance();
    addMoney(isCrit ? base * getCritMultiplier() : base, true);

    spawnClickParticle(gameState.money - before, e.clientX, e.clientY - 20, isCrit);
    if (isCrit) playSound(2600, 180);
}

// ============ TECLADO ============
window.addEventListener('keydown', (e) => {
    const modalOpen = !!document.querySelector('.modal.active');
    if ((e.key === ' ' || e.key === 'Enter') && !modalOpen) {
        e.preventDefault();
        document.getElementById('clickButton').click();
        return;
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
        return;
    }
    if (modalOpen) return;
    if (e.key === 'p' || e.key === 'P') doPrestige();
    if (e.key === 'c' || e.key === 'C') toggleChart();
    if (e.key === 's' || e.key === 'S') openModal('statsModal');
});

// ============ IMPORTAÇÃO DE SAVE ============
function handleSaveImport(e) {
    const file = e.target.files[0];
    if (!file || file.size > 500000) {
        alert('Arquivo grande demais!');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const raw = evt.target.result;
            if (!raw || raw.length < 10) throw new Error('Vazio');
            if (!gameState.isValidSaveShape(JSON.parse(raw))) throw new Error('Formato inválido');
            localStorage.setItem(SAVE_KEY, raw);
            location.reload();
        } catch (err) {
            alert('Save inválido ou corrompido!');
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// ============ INICIALIZAÇÃO ============
function init() {
    cacheDomRefs();

    const lastSaveTime = gameState.load();
    gameState.validate();

    // Preferências ficam fora do save do jogo: são do dispositivo, não da partida.
    const soundOn = localStorage.getItem('soundEnabled') !== 'false';
    const autoOn = localStorage.getItem('aiEnabled') !== 'false';
    el.soundToggle.checked = soundOn;
    el.aiToggle.checked = autoOn;
    setSoundEnabled(soundOn);
    setAutomationEnabled(autoOn);

    el.soundToggle.addEventListener('change', (e) => {
        localStorage.setItem('soundEnabled', e.target.checked);
        setSoundEnabled(e.target.checked);
    });
    el.aiToggle.addEventListener('change', (e) => {
        localStorage.setItem('aiEnabled', e.target.checked);
        setAutomationEnabled(e.target.checked);
    });
    document.getElementById('clickButton').addEventListener('click', handleMainClick);
    document.getElementById('importInput').addEventListener('change', handleSaveImport);

    createUpgradeButtons();
    initChart();
    initSkyline();
    initPixiEngine();
    updateDisplay();

    if (gameState.unlockedAchievements.length > 0) {
        el.achBadge.style.display = 'flex';
        el.achBadge.textContent = gameState.unlockedAchievements.length;
    }
    checkAchievements(showAchievementBadge);

    const offline = applyOfflineProgress(lastSaveTime);
    if (offline.earnings > 0) {
        const t = offline.seconds < 3600
            ? Math.floor(offline.seconds / 60) + 'm'
            : (offline.seconds / 3600).toFixed(1) + 'h';
        showNotification(`Bem-vindo de volta! +${formatNumber(offline.earnings)} (${t} offline)`, '🌙', 6000);
    }

    setInterval(simulationTick, SIM_INTERVAL_MS);
    requestAnimationFrame(renderLoop);
}

function showAchievementBadge(count) {
    el.achBadge.style.display = 'flex';
    el.achBadge.textContent = count;
}

// ============ LOOPS ============
// Simulação e renderização são separadas de propósito:
//
// - Simulação em setInterval: continua rodando com a aba em segundo plano
//   (mesmo limitada a ~1×/s) e usa tempo real, então nenhuma renda é perdida.
// - Renderização em requestAnimationFrame: acompanha o monitor (60fps, contra
//   os 10fps travados de antes) e o navegador a pausa sozinho quando a aba
//   está oculta — não adianta desenhar para ninguém.
const SIM_INTERVAL_MS = 100;
const MAX_CATCHUP_MS = 3600000;   // sanidade contra o relógio do sistema pulando
const AUTOSAVE_MS = 1000;

let lastTickTime = Date.now();
let saveAccumulator = 0;
let goldenEventTimer = 0;
let nextGoldenEventAt = 40000 + Math.random() * 40000;

function simulationTick() {
    const now = Date.now();
    let deltaMs = now - lastTickTime;
    lastTickTime = now;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) deltaMs = 0;
    deltaMs = Math.min(deltaMs, MAX_CATCHUP_MS);

    gameState.validate();

    const rawDps = getRawDPS();
    if (rawDps > 0 && Number.isFinite(rawDps)) addMoney(rawDps * (deltaMs / 1000));

    tickGoldenEvents(deltaMs);
    runAI();
    checkAchievements(showAchievementBadge);
    recordChartSample();
    syncSkyline();
    pruneSkyline();

    saveAccumulator += deltaMs;
    if (saveAccumulator >= AUTOSAVE_MS) {
        gameState.save();
        saveAccumulator = 0;
    }
}

function tickGoldenEvents(deltaMs) {
    const rate = getRunEffectValue('goldenRate', 1)
        * (1 - gameState.prestigeShopLevels.goldenLuck * 0.15);
    goldenEventTimer += deltaMs;
    if (goldenEventTimer > nextGoldenEventAt * Math.max(0.2, rate)) {
        goldenEventTimer = 0;
        nextGoldenEventAt = 40000 + Math.random() * 40000;
        spawnGoldenEvent();
    }
}

function renderLoop(now) {
    updateDisplay();
    drawSkyline(now || performance.now());
    requestAnimationFrame(renderLoop);
}

// Os módulos não vazam nada para o escopo global. Em desenvolvimento isso
// atrapalharia inspecionar e testar pelo console, então expomos um único
// namespace — e só fora de produção.
function exposeDebugApi() {
    const isDev = location.hostname === 'localhost'
        || location.hostname === '127.0.0.1'
        || location.search.includes('debug');
    if (!isDev) return;
    window.MM = { state: gameState, config, economy, utils, skyline,
        ui: { ...ui, ...uiCards, ...uiModals, el }, simulationTick };
    console.info('MoneyMaker: API de depuração em window.MM');
}

init();
exposeDebugApi();
