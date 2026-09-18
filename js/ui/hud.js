// Render de um frame: cabeçalho, progresso e estado dos cards.

import { upgrades, MONEY_UPGRADES, getPrestigeCostForLevel } from '../config.js';
import { gameState } from '../state.js';
import { formatNumber, playSound, showBanner, shockwave } from '../utils.js';
import { spawnConfetti } from '../vfx.js';
import {
    getEffectiveMultiplier, getRawDPS, getUpgradeIncome, getUpgradeMilestoneMult,
    getBusinessUpgradeMult, getBulkCost, getBestBuyIndex, isBusinessUnlocked,
    pendingPrestigePoints
} from '../economy.js';
import { el, setText, setHtml } from './dom.js';
import { cardRefs, getBuyQuantity, bulkMode, updateManagerButtons } from './businesses.js';
import { drawChart } from './chart.js';

// ============ RENDER DO FRAME ============
let badgeThrottle = 0;
// undefined = primeiro render (não comemora o que já estava liberado no save)
let wasUnlocked = [];

function announceUnlock(idx, card) {
    const u = upgrades[idx];
    card.classList.add('revealing');
    setTimeout(() => card.classList.remove('revealing'), 700);
    showBanner('Novo negócio', u.name, `+${formatNumber(u.baseIncome)}/s por unidade`);
    shockwave();
    spawnConfetti();
    playSound(1500, 220);
}

export function resetUnlockTracking() {
    wasUnlocked = [];
}

export function updateDisplay() {
    gameState.validate();

    if (gameState.combo > 1 && Date.now() - gameState.lastClickTime > 1000) {
        gameState.combo = 1;
    }

    const mult = getEffectiveMultiplier();
    const rawDps = getRawDPS();
    const dps = rawDps * mult;

    setText(el.moneyDisplay, formatNumber(gameState.money));
    setText(el.totalEarned, formatNumber(gameState.totalEarned));
    setText(el.clickCount, gameState.clickCount);
    setText(el.comboDisplay, gameState.combo);
    setText(el.comboValue, `×${Math.floor(gameState.combo)}`);
    setText(el.multValue, mult.toFixed(2) + 'x');
    setText(el.mpsDisplay, '+' + formatNumber(dps) + '/s');
    setText(el.prestigeDisplay, `${gameState.prestigeLevel}`);

    let owned = 0;
    for (const u of upgrades) owned += u.owned;
    setText(el.businessCount, owned);
    setText(el.skylineCount, owned === 1 ? '1 construção' : `${owned} construções`);

    const comboClass = gameState.combo >= 15 ? 'combo-hot' : gameState.combo >= 5 ? 'combo-mid' : '';
    for (const node of [el.comboDisplay, el.comboValue]) {
        if (node._comboClass === comboClass) continue;
        node.classList.remove('combo-mid', 'combo-hot');
        if (comboClass) node.classList.add(comboClass);
        node._comboClass = comboClass;
    }

    const nextCost = getPrestigeCostForLevel(gameState.prestigeLevel + 1);
    setText(el.nextPrestigeCost, formatNumber(nextCost));
    const pct = Math.min(100, (gameState.totalEarned / nextCost) * 100);
    const pctStr = pct.toFixed(1) + '%';
    if (el.prestigeProgressFill._last !== pctStr) {
        el.prestigeProgressFill.style.width = pctStr;
        el.prestigeProgressFill._last = pctStr;
    }
    setHtml(el.prestigeProgressLabel,
        `${formatNumber(gameState.totalEarned)} / ${formatNumber(nextCost)} (${pctStr})` +
        ` — prestigiar agora rende <span style="color: var(--gold); font-weight: bold;">${pendingPrestigePoints()} 💎</span>`);

    if (dps > 0) {
        const seconds = Math.max(0, nextCost - gameState.totalEarned) / dps;
        let timeStr;
        if (seconds < 3600) timeStr = Math.ceil(seconds / 60) + 'm';
        else if (seconds < 86400) timeStr = Math.ceil(seconds / 3600) + 'h';
        else timeStr = Math.ceil(seconds / 86400) + 'd';
        setText(el.timeToPrestige, timeStr);
    }

    const canPrestige = gameState.totalEarned >= nextCost;
    // Só o estado muda: o ícone e o rótulo do botão são fixos no HTML.
    el.prestigeBtn.disabled = !canPrestige;
    el.prestigeBtn.classList.toggle('ready', canPrestige);

    const bestIdx = getBestBuyIndex();
    for (let i = 0; i < cardRefs.length; i++) {
        const refs = cardRefs[i];
        const unlocked = isBusinessUnlocked(i);
        refs.card.classList.toggle('locked-biz', !unlocked);

        if (!unlocked) {
            refs.card.classList.add('disabled');
            setText(refs.lock, `Compre 5 × ${upgrades[i - 1].name}`);
            wasUnlocked[i] = false;
            continue;
        }
        // Liberar um negócio novo é um acontecimento, não uma mudança silenciosa
        if (wasUnlocked[i] === false) announceUnlock(i, refs.card);
        wasUnlocked[i] = true;

        const qty = Math.max(1, getBuyQuantity(i));
        const cost = getBulkCost(i, qty);
        refs.card.classList.toggle('disabled', gameState.money < cost);
        refs.card.classList.toggle('best-buy', i === bestIdx);

        setText(refs.qty, bulkMode === 'max' ? `×${qty}` : `×${bulkMode}`);
        setText(refs.cost, formatNumber(cost));

        const totalMult = getUpgradeMilestoneMult(i) * getBusinessUpgradeMult(i);
        setText(refs.income,
            `+${formatNumber(getUpgradeIncome(i))}/s${totalMult > 1 ? ' (×' + (+totalMult.toFixed(1)) + ')' : ''}`);

        const owned = upgrades[i].owned;
        if (owned > 0) {
            refs.count.style.display = '';
            setText(refs.count, owned);
        } else if (refs.count.style.display !== 'none') {
            refs.count.style.display = 'none';
        }
    }
    updateManagerButtons();

    // Os badges percorrem os 29 upgrades chamando closures de requisito: a cada
    // 500ms é o bastante, não precisa ser a cada frame.
    if (--badgeThrottle <= 0) {
        badgeThrottle = 5;
        let affordable = 0;
        for (const up of MONEY_UPGRADES) {
            if (!gameState.hasUpgrade(up.id) && gameState.money >= up.cost && up.req(gameState)) affordable++;
        }
        el.upgradeBadge.style.display = affordable > 0 ? 'flex' : 'none';
        setText(el.upgradeBadge, affordable);

        el.prestigePointBadge.style.display = gameState.prestigePoints > 0 ? 'flex' : 'none';
        setText(el.prestigePointBadge, gameState.prestigePoints);
    }

    drawChart();
}

