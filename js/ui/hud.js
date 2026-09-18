// Render de um frame: cabeçalho, progresso e estado dos cards.

import { upgrades, MONEY_UPGRADES, getPrestigeCostForLevel, MILESTONE_TIERS } from '../config.js';
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
    const runEarned = gameState.runEarned !== undefined ? gameState.runEarned : gameState.totalEarned;
    const pct = Math.min(100, (runEarned / nextCost) * 100);
    const pctStr = pct.toFixed(1) + '%';
    if (el.prestigeProgressFill._last !== pctStr) {
        el.prestigeProgressFill.style.width = pctStr;
        el.prestigeProgressFill._last = pctStr;
    }
    setHtml(el.prestigeProgressLabel,
        `${formatNumber(runEarned)} / ${formatNumber(nextCost)} (${pctStr})` +
        ` — prestigiar agora rende <span style="color: var(--gold); font-weight: bold;">${pendingPrestigePoints()} 💎</span>`);

    if (runEarned >= nextCost) {
        setText(el.timeToPrestige, 'PRONTO!');
    } else if (dps > 0) {
        const seconds = Math.max(0, nextCost - runEarned) / dps;
        let timeStr;
        if (seconds < 60) timeStr = Math.ceil(seconds) + 's';
        else if (seconds < 3600) timeStr = Math.ceil(seconds / 60) + 'm';
        else if (seconds < 86400) timeStr = Math.ceil(seconds / 3600) + 'h';
        else timeStr = Math.ceil(seconds / 86400) + 'd';
        setText(el.timeToPrestige, timeStr);
    } else {
        setText(el.timeToPrestige, '--');
    }

    const canPrestige = runEarned >= nextCost;
    // Só o estado muda: o ícone e o rótulo do botão são fixos no HTML.
    el.prestigeBtn.disabled = !canPrestige;
    el.prestigeBtn.classList.toggle('ready', canPrestige);

    // Barra de Bônus Temporário Dourado
    if (el.boostBanner) {
        const remainingMs = gameState.tempBoostExpiry - Date.now();
        if (remainingMs > 0) {
            el.boostBanner.style.display = 'block';
            const totalDuration = 20000;
            const pct = Math.min(100, Math.max(0, (remainingMs / totalDuration) * 100));
            if (el.boostFill) el.boostFill.style.width = `${pct.toFixed(1)}%`;
            const s = Math.ceil(remainingMs / 1000);
            setText(el.boostTimer, `${s}s`);
            setText(el.boostText, `ACELERAÇÃO DOURADA: ×${gameState.tempBoostMult}`);
        } else if (el.boostBanner.style.display !== 'none') {
            el.boostBanner.style.display = 'none';
        }
    }

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

        // Barra de progresso para o próximo marco multiplicador
        if (refs.milestoneFill && refs.milestoneLabel) {
            const thresholds = MILESTONE_TIERS.map(t => t[0]).sort((a, b) => a - b);
            const nextMilestone = thresholds.find(t => t > owned);
            if (!nextMilestone) {
                refs.milestoneFill.style.width = '100%';
                setText(refs.milestoneLabel, `${owned} (MAX)`);
            } else {
                const prevIdx = thresholds.indexOf(nextMilestone) - 1;
                const prevMilestone = prevIdx >= 0 ? thresholds[prevIdx] : 0;
                const mPct = Math.min(100, Math.max(0, ((owned - prevMilestone) / (nextMilestone - prevMilestone)) * 100));
                refs.milestoneFill.style.width = `${mPct.toFixed(1)}%`;
                setText(refs.milestoneLabel, `${owned}/${nextMilestone}`);
            }
        }
    }
    updateManagerButtons();

    // Os badges percorrem os 29 upgrades chamando closures de requisito: a cada
    // 500ms é o bastante (30 frames a 60fps), não precisa ser a cada frame.
    if (--badgeThrottle <= 0) {
        badgeThrottle = 30;
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

