// Regras do jogo: valores derivados, custos, renda, compras, prestígio,
// automação e eventos. Tudo aqui é função do estado — o estado em si só
// guarda dados (state.js) e os números de balanceamento vêm de config.js.

import {
    upgrades, MONEY_CAP, COST_GROWTH, MILESTONE_TIERS, MONEY_UPGRADES_BY_ID,
    ACHIEVEMENTS, PRESTIGE_SHOP, COMBO_MILESTONES, FEVER_COMBO_THRESHOLD,
    COMBO_TIMEOUT_MS, BUSINESS_UNLOCK_THRESHOLD, BASE_CRIT_CHANCE, BASE_CRIT_MULTIPLIER,
    BASE_CLICK_PERCENT, MANAGER_COST_FACTOR, OFFLINE_CAP_SECONDS,
    OFFLINE_BASE_EFFICIENCY, getPrestigeCostForLevel, getPrestigeMultiplierForLevel
} from './config.js';
import { gameState } from './state.js';
import { formatNumber, showNotification, playSound } from './utils.js';
import { spawnConfetti } from './vfx.js';

// ============ EFEITOS DOS UPGRADES DE RUN ============
// Um acumulador por forma de combinar: produto, soma, presença, último valor.

function runEffects(type) {
    const out = [];
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === type) out.push(up.effect);
    }
    return out;
}

export function getRunUpgradeProduct(type) {
    let product = 1;
    for (const e of runEffects(type)) product *= e.value;
    return product;
}

export function getRunUpgradeSum(type) {
    let sum = 0;
    for (const e of runEffects(type)) sum += e.value;
    return sum;
}

export function hasRunEffect(type) {
    return runEffects(type).length > 0;
}

export function getRunEffectValue(type, fallback) {
    const found = runEffects(type);
    return found.length ? found[found.length - 1].value : fallback;
}

// Sinergias: bônus global derivado de quantos negócios de um tipo você acumulou.
// O teto (`cap`) é obrigatório — sem ele o bônus cresce junto com a contagem e
// retroalimenta: mais negócios → mais multiplicador → mais negócios.
export function getSynergyMultiplier() {
    let bonus = 0;
    for (const e of runEffects('synergy')) {
        const count = upgrades[e.source].owned;
        bonus += Math.min(Math.floor(count / e.per) * e.value, e.cap);
    }
    return 1 + bonus;
}

export function isFeverActive() {
    return hasRunEffect('fever') && gameState.combo >= FEVER_COMBO_THRESHOLD;
}

// ============ MULTIPLICADORES ============
let activeAbilityMultiplierFn = () => 1;
let hyperClickActiveFn = () => false;

export function registerAbilityHooks(getMultFn, isCritFn) {
    if (getMultFn) activeAbilityMultiplierFn = getMultFn;
    if (isCritFn) hyperClickActiveFn = isCritFn;
}

// Decomposto em fatores nomeados: é a fonte única da verdade e aparece assim
// na tela de estatísticas, o que torna qualquer desequilíbrio visível.
export function getMultiplierBreakdown() {
    return {
        prestígio: getPrestigeMultiplierForLevel(gameState.prestigeLevel),
        conquistas: 1 + gameState.unlockedAchievements.length * 0.01,
        lojaPrestígio: 1 + gameState.prestigeShopLevels.globalIncome * 0.1,
        upgrades: getRunUpgradeProduct('globalMult'),
        sinergias: getSynergyMultiplier(),
        eventoDourado: Date.now() < gameState.tempBoostExpiry ? gameState.tempBoostMult : 1,
        febre: isFeverActive() ? 2 : 1,
        habilidade: activeAbilityMultiplierFn()
    };
}

export function getEffectiveMultiplier() {
    const b = getMultiplierBreakdown();
    return b.prestígio * b.conquistas * b.lojaPrestígio * b.upgrades * b.sinergias * b.eventoDourado * b.febre * b.habilidade;
}

export function getClickPercent() {
    return (BASE_CLICK_PERCENT + gameState.prestigeShopLevels.clickPower * 0.05)
        * getRunUpgradeProduct('clickMult');
}

export function getCritChance() {
    if (hyperClickActiveFn()) return 1.0;
    const base = BASE_CRIT_CHANCE + gameState.prestigeShopLevels.critChance * 0.02;
    return Math.min(0.75, base + getRunUpgradeSum('critChanceAdd'));
}

export function getCritMultiplier() {
    return BASE_CRIT_MULTIPLIER * getRunUpgradeProduct('critMult');
}

// ============ NEGÓCIOS ============
export function getUpgradeCost(idx) {
    const u = upgrades[idx];
    return Math.min(MONEY_CAP, u.baseCost * Math.pow(COST_GROWTH, Math.min(u.owned, 4500)));
}

/** Custo de comprar `qty` unidades de uma vez (soma da série geométrica). */
export function getBulkCost(idx, qty) {
    if (qty <= 0) return 0;
    const first = getUpgradeCost(idx);
    return first * (Math.pow(COST_GROWTH, qty) - 1) / (COST_GROWTH - 1);
}

/** Quantas unidades o orçamento compra (inverso da série geométrica). */
export function getMaxAffordable(idx, budget = gameState.money) {
    const first = getUpgradeCost(idx);
    if (budget < first) return 0;
    const n = Math.log(1 + (budget * (COST_GROWTH - 1)) / first) / Math.log(COST_GROWTH);
    return Math.max(0, Math.floor(n + 1e-9));
}

export function isBusinessUnlocked(idx) {
    if (idx === 0 || upgrades[idx].owned > 0) return true;
    return upgrades[idx - 1].owned >= BUSINESS_UNLOCK_THRESHOLD;
}

export function getUpgradeMilestoneMult(idx) {
    const owned = upgrades[idx].owned;
    for (const [threshold, mult] of MILESTONE_TIERS) {
        if (owned >= threshold) return mult;
    }
    return 1;
}

export function getBusinessUpgradeMult(idx) {
    let mult = 1;
    for (const e of runEffects('bizMult')) {
        if (e.idx === idx) mult *= e.value;
    }
    return mult;
}

export function getUpgradeIncome(idx) {
    return upgrades[idx].baseIncome * getUpgradeMilestoneMult(idx) * getBusinessUpgradeMult(idx);
}

export function getRawDPS() {
    let dps = 0;
    for (let i = 0; i < upgrades.length; i++) dps += getUpgradeIncome(i) * upgrades[i].owned;
    return dps;
}

/** Clique vale uma fração da renda passiva, então nunca fica obsoleto. */
export function getClickValue() {
    return Math.max(1, getRawDPS() * getClickPercent());
}

export function getManagerCost(idx) {
    const discount = 1 - gameState.prestigeShopLevels.cheapManagers * 0.1;
    return upgrades[idx].baseCost * MANAGER_COST_FACTOR * Math.max(0.5, discount);
}

/** Negócio com maior renda por dólar investido agora — mostrado com ⭐. */
export function getBestBuyIndex() {
    let best = -1, bestRoi = 0;
    for (let i = 0; i < upgrades.length; i++) {
        if (!isBusinessUnlocked(i)) continue;
        const roi = getUpgradeIncome(i) / getUpgradeCost(i);
        if (Number.isFinite(roi) && roi > bestRoi) { bestRoi = roi; best = i; }
    }
    return best;
}

// ============ PONTOS DE PRESTÍGIO ============
// Decisão central do gênero: prestigiar agora ou empurrar mais fundo?
// Escala logarítmica de propósito — a economia de dinheiro é exponencial, então
// qualquer raiz faria os pontos explodirem junto e zerariam a loja numa run.
// Cada 1000× de progresso vale +24 pontos.
export function prestigePointsForTotal(totalEarned) {
    if (!Number.isFinite(totalEarned) || totalEarned < 1e6) return 0;
    const raw = 8 * Math.log10(totalEarned / 1e6);
    const boost = 1 + gameState.prestigeShopLevels.prestigeBoost * 0.05;
    return Math.max(0, Math.floor(raw * boost));
}

export function pendingPrestigePoints() {
    return Math.max(0, prestigePointsForTotal(gameState.totalEarned) - gameState.lifetimePrestigePoints);
}

// ============ GANHO DE DINHEIRO ============
export function addMoney(amount, isClick = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    const mult = getEffectiveMultiplier();
    // O combo é bônus de clique: aplicá-lo à renda passiva deixava um
    // auto-clicker multiplicar a economia inteira por até ×999.
    const total = amount * mult * (isClick ? gameState.combo : 1);
    if (!Number.isFinite(total) || total < 0) return;

    gameState.money = Math.min(gameState.money + total, MONEY_CAP);
    gameState.totalEarned += total;
    gameState.runEarned += total;

    if (isClick) registerClick(mult);
}

function registerClick(mult) {
    gameState.clickCount++;
    const now = Date.now();

    if (now - gameState.lastClickTime <= COMBO_TIMEOUT_MS) {
        gameState.combo = Math.min(gameState.combo + 1, 999);
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
    } else {
        gameState.combo = 1;
        gameState.lastComboMilestone = 0;
    }
    gameState.lastClickTime = now;

    for (const m of COMBO_MILESTONES) {
        if (gameState.combo !== m || gameState.lastComboMilestone >= m) continue;
        gameState.lastComboMilestone = m;
        const bonus = Math.max(10, getRawDPS() * mult * 5);
        gameState.money = Math.min(gameState.money + bonus, MONEY_CAP);
        gameState.totalEarned += bonus;
        gameState.runEarned += bonus;
        const fever = (m >= FEVER_COMBO_THRESHOLD && hasRunEffect('fever')) ? ' MODO FEBRE ATIVO!' : '';
        showNotification(`Combo ×${m}! Bônus de ${formatNumber(bonus)}!${fever}`, '🔥', 3000);
        spawnConfetti();
    }
}

/** Credita o tempo em que o jogo esteve fechado. Devolve o que foi ganho. */
export function applyOfflineProgress(lastSaveTime) {
    if (!lastSaveTime) return { earnings: 0, seconds: 0 };

    const seconds = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (Date.now() - lastSaveTime) / 1000));
    if (seconds <= 5) return { earnings: 0, seconds: 0 };

    const efficiency = Math.min(1, OFFLINE_BASE_EFFICIENCY + gameState.prestigeShopLevels.offlineEfficiency * 0.1);
    const earnings = getRawDPS() * getEffectiveMultiplier() * seconds * efficiency;
    if (earnings <= 0) return { earnings: 0, seconds };

    gameState.money = Math.min(gameState.money + earnings, MONEY_CAP);
    gameState.totalEarned += earnings;
    gameState.runEarned += earnings;
    return { earnings, seconds };
}

// ============ PRESTÍGIO ============
/** @param {() => void} onReset chamado para a UI reconstruir os cards. */
export function prestige(onReset) {
    gameState.validate();

    const cost = getPrestigeCostForLevel(gameState.prestigeLevel + 1);
    if (gameState.runEarned < cost) {
        showNotification(`Faltam ${formatNumber(cost - gameState.runEarned)}`, '🌙');
        return false;
    }

    const gained = pendingPrestigePoints();
    gameState.prestigeLevel++;
    gameState.prestigePoints += gained;
    gameState.lifetimePrestigePoints += gained;
    gameState.runEarned = 0;
    gameState.clickCount = 0;
    gameState.combo = 1;
    gameState.lastComboMilestone = 0;
    gameState.runUpgrades = [];          // upgrades de dinheiro são por run
    gameState.tempBoostExpiry = 0;
    upgrades.forEach(u => { u.owned = 0; u.manager = false; });

    // Recompensas da loja que aceleram a próxima run
    const shop = gameState.prestigeShopLevels;
    const startCash = PRESTIGE_SHOP.find(i => i.id === 'startingCash');
    gameState.money = startCash ? startCash.valueFor(shop.startingCash) : 0;
    for (let i = 0; i < shop.freeManagers && i < upgrades.length; i++) upgrades[i].manager = true;

    if (onReset) onReset();
    showNotification(
        `Prestígio #${gameState.prestigeLevel}! ×${getEffectiveMultiplier().toFixed(2)} | +${gained} ponto${gained === 1 ? '' : 's'}`,
        '⭐', 4000);
    spawnConfetti();
    playSound(2000, 200);
    return true;
}

// ============ CONQUISTAS ============
/** @param {(count: number) => void} onUnlock avisa a UI para atualizar o badge. */
export function checkAchievements(onUnlock) {
    let unlocked = false;
    for (const a of ACHIEVEMENTS) {
        if (gameState.unlockedAchievements.includes(a.id) || !a.check(gameState)) continue;
        gameState.unlockedAchievements.push(a.id);
        showNotification(`${a.name} desbloqueada!`, '🏆');
        unlocked = true;
    }
    if (unlocked) {
        if (onUnlock) onUnlock(gameState.unlockedAchievements.length);
        gameState.save();
    }
}

// ============ AUTOMAÇÃO ============
let automationEnabled = true;
export function setAutomationEnabled(value) { automationEnabled = !!value; }

export function runAI() {
    if (!automationEnabled) return;

    const attempts = 3 * getRunEffectValue('aiSpeed', 1);
    for (let i = 0; i < attempts; i++) {
        let bestIdx = -1, bestRoi = 0;
        for (let j = 0; j < upgrades.length; j++) {
            if (!upgrades[j].manager || !isBusinessUnlocked(j)) continue;
            const cost = getUpgradeCost(j);
            if (gameState.money < cost) continue;
            const roi = getUpgradeIncome(j) / cost;
            if (Number.isFinite(roi) && roi > bestRoi) { bestRoi = roi; bestIdx = j; }
        }
        if (bestIdx < 0) break;

        // Reserva 20% para o jogador comprar upgrades e gerentes manualmente
        const cost = getUpgradeCost(bestIdx);
        if (gameState.money - cost < gameState.money * 0.20) break;
        gameState.money -= cost;
        upgrades[bestIdx].owned++;
    }
}

// ============ EVENTOS DOURADOS ============
export function triggerGoldenReward() {
    if (Math.random() < 0.5) {
        const duration = getRunEffectValue('goldenDuration', 20000);
        gameState.tempBoostMult = 3;
        gameState.tempBoostExpiry = Date.now() + duration;
        showNotification(`Renda ×3 por ${Math.round(duration / 1000)}s!`, '⚡', 3000);
    } else {
        const bonus = Math.max(50, getRawDPS() * getEffectiveMultiplier() * 60);
        gameState.money = Math.min(gameState.money + bonus, MONEY_CAP);
        gameState.totalEarned += bonus;
        gameState.runEarned += bonus;
        showNotification(`Bônus de ${formatNumber(bonus)}!`, '💰', 3000);
    }
    spawnConfetti();
    playSound(2200, 200);
}

let goldenEventRenderer = null;
export function setGoldenEventRenderer(renderer) {
    goldenEventRenderer = renderer;
}

export function spawnGoldenEvent() {
    if (goldenEventRenderer) {
        goldenEventRenderer(triggerGoldenReward);
        return;
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (document.querySelector('.modal.active') || document.querySelector('.golden-event')) return;

    const node = document.createElement('div');
    node.className = 'golden-event';
    node.textContent = '💰';
    document.body.appendChild(node);

    // offsetWidth e não getBoundingClientRect: a animação de entrada começa em
    // scale(0), então o rect mediria zero e os limites sairiam errados.
    const size = node.offsetWidth || 54;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - size - margin);
    const minTop = 90;  // abaixo do cabeçalho
    const maxTop = Math.max(minTop, window.innerHeight - size - margin);
    node.style.left = (margin + Math.random() * (maxLeft - margin)) + 'px';
    node.style.top = (minTop + Math.random() * (maxTop - minTop)) + 'px';

    const timeout = setTimeout(() => { if (node.parentNode) node.remove(); }, 8000);
    node.addEventListener('click', () => {
        clearTimeout(timeout);
        if (node.parentNode) node.remove();
        triggerGoldenReward();
    });
}

