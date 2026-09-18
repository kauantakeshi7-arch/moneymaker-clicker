// Modais: economia, estatísticas, conquistas e as duas lojas.

import {
    upgrades, MONEY_UPGRADES, MONEY_UPGRADES_BY_ID, PRESTIGE_SHOP, ACHIEVEMENTS,
    totalOwned, SAVE_KEY
} from '../config.js';
import { gameState } from '../state.js';
import { formatNumber, showNotification, playSound } from '../utils.js';
import { spawnConfetti } from '../vfx.js';
import {
    getEffectiveMultiplier, getMultiplierBreakdown, getCritChance,
    getClickValue, getRawDPS, getUpgradeCost, getUpgradeIncome
} from '../economy.js';
import { createUpgradeButtons } from './businesses.js';
import { resetUnlockTracking } from './hud.js';
import { syncSkyline } from '../skyline.js';
import { updateContractsUI } from '../contracts.js';

export function updateEconomy() {
    const container = document.getElementById('economyContainer');
    container.innerHTML = upgrades.map((u, i) => {
        const cost = getUpgradeCost(i);
        const income = getUpgradeIncome(i);
        const payback = Math.ceil(cost / income);
        
        let paybackStr = payback + 's';
        if (payback >= 60) paybackStr = (payback / 60).toFixed(1) + 'm';
        if (payback >= 3600) paybackStr = (payback / 3600).toFixed(1) + 'h';
        
        const mult = getEffectiveMultiplier();
        const effRoi = ((income * mult) / cost).toFixed(5);
        return `
            <div style="background: rgba(0,212,255,0.05); border: 1px solid var(--primary); border-radius: 4px; padding: 8px; margin-bottom: 6px;">
                <div style="font-weight: bold; margin-bottom: 3px;">${u.icon} ${u.name} <span style="color: var(--text-muted);">(×${u.owned})</span></div>
                <div style="font-size: 9px; color: var(--text-secondary);">
                    💰 ${formatNumber(cost)} próx. | 📈 ${formatNumber(income)}/s cada<br>
                    ⏱️ Payback: ${paybackStr} | 💹 ROI efetivo (c/ prestígio): ${effRoi}
                </div>
            </div>
        `;
    }).join('');
}

export function updateStats() {
    const container = document.getElementById('statsContainer');
    const timePlayed = Math.floor((Date.now() - gameState.sessionStart) / 60000);
    const mult = getEffectiveMultiplier();
    const dps = getRawDPS() * mult;

    const stats = [
        { label: 'Ganho Total', value: formatNumber(gameState.totalEarned) },
        { label: 'Renda/s', value: formatNumber(dps) + '/s' },
        { label: 'Valor do Clique', value: formatNumber(getClickValue() * mult) },
        { label: 'Multiplicador', value: '×' + mult.toFixed(2) },
        { label: 'Cliques', value: gameState.clickCount },
        { label: 'Combo Máx', value: '×' + gameState.maxCombo },
        { label: 'Chance Crítico', value: (getCritChance() * 100).toFixed(0) + '%' },
        { label: 'Prestígio', value: gameState.prestigeLevel },
        { label: 'Pontos 💎', value: gameState.prestigePoints },
        { label: 'Upgrades da Run', value: gameState.runUpgrades.length + '/' + MONEY_UPGRADES.length },
        { label: 'Negócios', value: totalOwned() },
        { label: 'Contratos Cumpridos', value: gameState.completedContractsCount || 0 },
        { label: 'Tempo', value: timePlayed + 'm' }
    ];

    const breakdown = getMultiplierBreakdown();
    const breakdownRows = Object.entries(breakdown)
        .filter(([, v]) => v !== 1)
        .map(([k, v]) => `<div style="display:flex; justify-content:space-between;"><span>${k}</span><span style="color: var(--secondary);">×${v.toFixed(2)}</span></div>`)
        .join('');

    container.innerHTML = stats.map(s => `
        <div class="stat-box">
            <div class="stat-label">${s.label}</div>
            <div class="stat-value">${s.value}</div>
        </div>
    `).join('') + (breakdownRows ? `
        <div style="margin-top: 10px; padding: 10px; background: rgba(0,212,255,0.05); border: 1px solid var(--primary); border-radius: 6px; font-size: 10px;">
            <div style="font-weight: bold; margin-bottom: 6px; color: var(--text-primary);">Decomposição do Multiplicador:</div>
            ${breakdownRows}
        </div>
    ` : '');
}

export function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'economyModal') updateEconomy();
    if (id === 'statsModal') updateStats();
    if (id === 'achievementsModal') updateAchievements();
    if (id === 'prestigeShopModal') updatePrestigeShop();
    if (id === 'upgradeShopModal') updateUpgradeShop();
    if (id === 'contractsModal') updateContractsUI();
}

export function updateAchievements() {
    document.getElementById('achCount').textContent = gameState.unlockedAchievements.length;
    document.getElementById('achTotal').textContent = ACHIEVEMENTS.length;
    document.getElementById('achievementsContainer').innerHTML = ACHIEVEMENTS.map(a => `
        <div class="achievement-item ${gameState.unlockedAchievements.includes(a.id) ? '' : 'locked'}">
            <div class="ach-icon">${a.icon}</div>
            <div>
                <div class="ach-name">${a.name}</div>
                <div class="ach-desc">${a.desc}</div>
            </div>
        </div>
    `).join('');
}

export function updatePrestigeShop() {
    document.getElementById('prestigePointsDisplay').textContent = gameState.prestigePoints;
    const container = document.getElementById('prestigeShopContainer');
    container.innerHTML = PRESTIGE_SHOP.map(item => {
        const lvl = gameState.prestigeShopLevels[item.id];
        const maxed = lvl >= item.maxLevel;
        const cost = maxed ? 0 : item.costFor(lvl);
        const affordable = !maxed && gameState.prestigePoints >= cost;
        let extra = '';
        if (item.id === 'startingCash') {
            const cur = item.valueFor(lvl);
            const next = item.valueFor(lvl + 1);
            extra = maxed ? ` (atual: ${formatNumber(cur)})` : ` (${formatNumber(cur)} → ${formatNumber(next)})`;
        }
        return `
            <div class="achievement-item ${maxed || affordable ? '' : 'locked'}" style="justify-content: space-between; cursor: ${maxed ? 'default' : 'pointer'};" ${maxed ? '' : `data-action="buyPrestige" data-target="${item.id}"`}>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="ach-icon">${item.icon}</div>
                    <div>
                        <div class="ach-name">${item.name} (Nv. ${lvl}/${item.maxLevel})</div>
                        <div class="ach-desc">${item.desc}${extra}</div>
                    </div>
                </div>
                <div style="font-size: 10px; color: var(--gold); font-weight: bold; white-space: nowrap;">
                    ${maxed ? '✓ MAX' : `💎 ${cost}`}
                </div>
            </div>
        `;
    }).join('');
}

// ============ LOJA DE UPGRADES (dinheiro, por run) ============
export function updateUpgradeShop() {
    document.getElementById('upgradeShopMoney').textContent = formatNumber(gameState.money);
    const container = document.getElementById('upgradeShopContainer');
    const cats = [...new Set(MONEY_UPGRADES.map(u => u.cat))];

    let html = '';
    for (const cat of cats) {
        const items = MONEY_UPGRADES.filter(u => u.cat === cat);
        // esconde categorias ainda totalmente indisponíveis, evita parede de itens travados
        const visible = items.filter(u => gameState.hasUpgrade(u.id) || u.req(gameState) || u.cost <= gameState.money * 50);
        if (visible.length === 0) continue;

        html += `<div class="section-header" style="margin-top: 10px;">${cat}</div>`;
        html += visible.map(up => {
            const owned = gameState.hasUpgrade(up.id);
            const met = up.req(gameState);
            const affordable = met && gameState.money >= up.cost;
            const cls = owned ? 'owned-upgrade' : (affordable ? '' : 'locked');
            const clickAttr = (!owned && affordable) ? `data-action="buyUpgrade" data-target="${up.id}"` : '';
            const right = owned ? '<span style="color: var(--secondary);">✓ ATIVO</span>'
                : (met ? formatNumber(up.cost) : `🔒 ${up.reqText}`);
            return `
                <div class="achievement-item ${cls}" style="justify-content: space-between; cursor: ${(!owned && affordable) ? 'pointer' : 'default'};" ${clickAttr}>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="ach-icon">${up.icon}</div>
                        <div>
                            <div class="ach-name">${up.name}</div>
                            <div class="ach-desc">${up.desc}</div>
                        </div>
                    </div>
                    <div style="font-size: 9px; color: var(--accent); font-weight: bold; white-space: nowrap; text-align: right;">
                        ${right}
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = html || '<div style="font-size: 10px; color: var(--text-muted);">Continue jogando para desbloquear upgrades.</div>';
}

export function buyMoneyUpgrade(id) {
    const up = MONEY_UPGRADES_BY_ID[id];
    if (!up || gameState.hasUpgrade(id) || !up.req(gameState)) return;
    if (gameState.money < up.cost) return;

    gameState.money -= up.cost;
    gameState.runUpgrades.push(id);
    showNotification(`${up.name}: ${up.desc}`, up.icon, 3500);
    playSound(1900, 180);
    spawnConfetti();
    updateUpgradeShop();
    gameState.save();
}

export function buyPrestigeShopItem(id) {
    const item = PRESTIGE_SHOP.find(i => i.id === id);
    if (!item) return;
    const lvl = gameState.prestigeShopLevels[id];
    if (lvl >= item.maxLevel) return;
    const cost = item.costFor(lvl);
    if (gameState.prestigePoints >= cost) {
        gameState.prestigePoints -= cost;
        gameState.prestigeShopLevels[id]++;
        showNotification(`${item.name} nível ${gameState.prestigeShopLevels[id]}!`, item.icon);
        playSound(1800, 150);
        updatePrestigeShop();
        gameState.save();
    }
}

export function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

export function exportSave() {
    try {
        const data = localStorage.getItem(SAVE_KEY);
        if (!data) { alert('Sem save!'); return; }
        const link = document.createElement('a');
        link.href = 'data:text/plain,' + encodeURIComponent(data);
        link.download = 'moneymaker_' + Date.now() + '.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (e) { alert('Erro!'); }
}

export function copySaveToClipboard() {
    try {
        const data = localStorage.getItem(SAVE_KEY);
        if (!data) { showNotification('Nenhum save encontrado!', '❌'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(data).then(() => {
                showNotification('Save copiado para a área de transferência!', '📋');
            }).catch(() => {
                prompt('Copie o código do seu save:', data);
            });
        } else {
            prompt('Copie o código do seu save:', data);
        }
    } catch (e) {
        showNotification('Erro ao copiar save', '❌');
    }
}

export function importSaveFromText() {
    const raw = prompt('Cole o código do seu save aqui:');
    if (!raw || raw.trim().length < 10) return;
    try {
        const parsed = JSON.parse(raw.trim());
        if (!gameState.isValidSaveShape(parsed)) throw new Error('Formato inválido');
        localStorage.setItem(SAVE_KEY, raw.trim());
        showNotification('Save restaurado com sucesso!', '✅');
        setTimeout(() => location.reload(), 400);
    } catch (e) {
        alert('Save inválido ou corrompido!');
    }
}

export function showOfflineModal(offline) {
    if (!offline || offline.earnings <= 0) return;
    const timeNode = document.getElementById('offlineTime');
    const earningsNode = document.getElementById('offlineEarnings');
    if (timeNode && earningsNode) {
        const t = offline.seconds < 3600
            ? Math.floor(offline.seconds / 60) + ' minuto(s)'
            : (offline.seconds / 3600).toFixed(1) + ' hora(s)';
        timeNode.textContent = t;
        earningsNode.textContent = '+' + formatNumber(offline.earnings);
        openModal('offlineModal');
        spawnConfetti();
    }
}

export function resetGame() {
    if (!confirm('Reiniciar a run atual? Você mantém prestígio, pontos 💎 e conquistas.')) return;
    gameState.clickCount = 0;
    gameState.combo = 1;
    gameState.lastComboMilestone = 0;
    gameState.runUpgrades = [];
    gameState.tempBoostExpiry = 0;
    upgrades.forEach(u => { u.owned = 0; u.manager = false; });

    // Honra os bônus permanentes da Loja de Prestígio
    const shop = gameState.prestigeShopLevels;
    const startCash = PRESTIGE_SHOP.find(i => i.id === 'startingCash');
    gameState.money = startCash ? startCash.valueFor(shop.startingCash) : 0;
    for (let i = 0; i < shop.freeManagers && i < upgrades.length; i++) {
        upgrades[i].manager = true;
    }

    createUpgradeButtons();
    resetUnlockTracking();
    syncSkyline();
    gameState.save();
    closeModal('settingsModal');
    showNotification('Run reiniciada!', '🔄');
}

