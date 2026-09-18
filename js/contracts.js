// Sistema de Contratos Corporativos (Missões/Bounties Dinâmicas).
// Metas de curto prazo balanceadas dinamicamente que aceleram o ritmo e premiam o jogador.

import { upgrades } from './config.js';
import { gameState } from './state.js';
import {
    formatNumber, playCashSound, playCritSound, playPrestigeSound,
    showNotification, showBanner
} from './utils.js';
import { spawnMoneyRain, spawnConfetti } from './vfx.js';
import {
    addMoney, getClickValue, getRawDPS, getEffectiveMultiplier, isBusinessUnlocked
} from './economy.js';
import { el, setText } from './ui/dom.js';

const TOTAL_ACTIVE_CONTRACTS = 3;

/** Gera um contrato aleatório coerente com o progresso do jogador */
export function generateContract(existingIds = []) {
    const dps = Math.max(1, getRawDPS() * getEffectiveMultiplier());
    const clickVal = Math.max(1, getClickValue());
    const unlockedBiz = [];
    upgrades.forEach((u, i) => {
        if (isBusinessUnlocked(i)) unlockedBiz.push(i);
    });

    const rand = Math.random();
    const id = 'ct_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // 15% de chance de Contrato Lendário de Fusão se tiver ao menos 1 prestígio ou $100k acumulados
    if (rand < 0.15 && (gameState.prestigeLevel >= 1 || gameState.totalEarned >= 100000)) {
        return {
            id,
            type: 'legendary',
            icon: '💎',
            title: 'Fusão Intergaláctica',
            desc: 'Realize 75 cliques e atinja combo ×15',
            target: 75,
            current: 0,
            comboTarget: 15,
            rewardType: 'prestige',
            rewardText: '+1 Ponto de Prestígio 💎',
            rewardValue: 1,
            completed: false
        };
    }

    // 25% de chance de Contrato de Expansão de Negócio
    if (rand < 0.40 && unlockedBiz.length > 0) {
        const bIdx = unlockedBiz[Math.floor(Math.random() * unlockedBiz.length)];
        const curOwned = upgrades[bIdx].owned;
        const target = Math.max(curOwned + 5, Math.ceil(curOwned * 1.25));
        const rewardCash = Math.max(1000, dps * 45 + clickVal * 50);
        return {
            id,
            type: 'own_biz',
            bizIndex: bIdx,
            icon: upgrades[bIdx].icon || '🏢',
            title: `Expansão: ${upgrades[bIdx].name}`,
            desc: `Alcance ${target} unidades de ${upgrades[bIdx].name}`,
            target,
            current: curOwned,
            rewardType: 'money',
            rewardText: `+${formatNumber(rewardCash)}`,
            rewardValue: rewardCash,
            completed: curOwned >= target
        };
    }

    // 25% de chance de Contrato de Combo
    if (rand < 0.65) {
        const target = Math.min(60, 10 + Math.floor(Math.random() * 4) * 5);
        const rewardCash = Math.max(500, dps * 35 + clickVal * 40);
        return {
            id,
            type: 'combo',
            icon: '🔥',
            title: 'Racha no Mercado',
            desc: `Mantenha o ritmo e alcance combo ×${target}`,
            target,
            current: gameState.combo,
            rewardType: 'money',
            rewardText: `+${formatNumber(rewardCash)}`,
            rewardValue: rewardCash,
            completed: gameState.combo >= target
        };
    }

    // 35% Contrato de Cliques Operacionais
    const clickTarget = 30 + Math.floor(Math.random() * 5) * 10;
    const isBoostReward = Math.random() < 0.35;
    const rewardCash = Math.max(400, dps * 30 + clickVal * 60);

    return {
        id,
        type: 'clicks',
        icon: '⚡',
        title: 'Auditoria Manual',
        desc: `Execute ${clickTarget} cliques rápidos no terminal da moeda`,
        target: clickTarget,
        current: 0,
        rewardType: isBoostReward ? 'boost' : 'money',
        rewardText: isBoostReward ? 'Aceleração ×3 por 20s' : `+${formatNumber(rewardCash)}`,
        rewardValue: isBoostReward ? 20000 : rewardCash,
        completed: false
    };
}

/** Garante que sempre existam 3 contratos ativos */
export function ensureActiveContracts() {
    if (!Array.isArray(gameState.activeContracts)) {
        gameState.activeContracts = [];
    }

    while (gameState.activeContracts.length < TOTAL_ACTIVE_CONTRACTS) {
        const existingIds = gameState.activeContracts.map(c => c.id);
        gameState.activeContracts.push(generateContract(existingIds));
    }
}

/** Notifica progresso em contratos ativos */
export function recordContractProgress(type, amount = 1, meta = null) {
    if (!Array.isArray(gameState.activeContracts)) return;
    let anyCompletedNow = false;

    for (const c of gameState.activeContracts) {
        if (c.completed) continue;

        if (c.type === 'clicks' && type === 'clicks') {
            c.current += amount;
        } else if (c.type === 'combo' && type === 'combo') {
            c.current = Math.max(c.current, amount);
        } else if (c.type === 'own_biz' && type === 'buy') {
            if (meta !== null && meta.idx === c.bizIndex) {
                c.current = upgrades[c.bizIndex].owned;
            }
        } else if (c.type === 'legendary') {
            if (type === 'clicks') c.current += amount;
            if (type === 'combo' && amount >= (c.comboTarget || 15)) c.comboMet = true;
        }

        const isReady = c.type === 'legendary'
            ? (c.current >= c.target && !!c.comboMet)
            : (c.current >= c.target);

        if (isReady && !c.completed) {
            c.completed = true;
            anyCompletedNow = true;
            showNotification(`Contrato concluído: ${c.title}!`, '📄');
        }
    }

    if (anyCompletedNow) {
        updateContractBadge();
    }
}

/** Coleta recompensa e gera um novo contrato para ocupar a vaga */
export function claimContract(contractId) {
    if (!Array.isArray(gameState.activeContracts)) return false;
    const idx = gameState.activeContracts.findIndex(c => c.id === contractId);
    if (idx === -1) return false;

    const contract = gameState.activeContracts[idx];
    if (!contract.completed) return false;

    // Concede recompensa
    if (contract.rewardType === 'money') {
        addMoney(contract.rewardValue, true);
        playCashSound();
    } else if (contract.rewardType === 'boost') {
        gameState.tempBoostMult = 3;
        gameState.tempBoostExpiry = Math.max(Date.now(), gameState.tempBoostExpiry) + contract.rewardValue;
        playCritSound();
        showBanner('ACELERAÇÃO DOURADA!', '×3 por 20 segundos', 'Recompensa de Contrato Corporativo', true);
    } else if (contract.rewardType === 'prestige') {
        gameState.prestigePoints = (gameState.prestigePoints || 0) + contract.rewardValue;
        gameState.lifetimePrestigePoints = (gameState.lifetimePrestigePoints || 0) + contract.rewardValue;
        playPrestigeSound();
        showBanner('PONTO DE PRESTÍGIO!', '+1 Ponto 💎 Concedido', 'Contrato Lendário de Fusão', true);
    }

    gameState.completedContractsCount = (gameState.completedContractsCount || 0) + 1;
    spawnConfetti();
    spawnMoneyRain(22);
    showNotification(`Contrato assinado! Recompensa recebida.`, '✅');

    // Substitui pelo novo contrato
    const existingIds = gameState.activeContracts.map(c => c.id);
    gameState.activeContracts[idx] = generateContract(existingIds);

    gameState.save();
    updateContractsUI();
    updateContractBadge();
    return true;
}

export function hasClaimableContracts() {
    if (!Array.isArray(gameState.activeContracts)) return false;
    return gameState.activeContracts.some(c => c.completed);
}

export function updateContractBadge() {
    if (typeof document === 'undefined') return;
    const badge = el.contractBadge || document.getElementById('contractBadge');
    if (!badge) return;
    const ready = hasClaimableContracts();
    badge.style.display = ready ? 'flex' : 'none';
    if (ready) {
        badge.textContent = '!';
        badge.classList.add('badge-pop');
    }
}

/** Renderiza a lista de contratos dentro da modal */
export function updateContractsUI() {
    ensureActiveContracts();
    if (typeof document === 'undefined') return;
    const container = el.contractsContainer || document.getElementById('contractsContainer');
    const countDisplay = el.contractsCountDisplay || document.getElementById('contractsCountDisplay');

    if (countDisplay) {
        setText(countDisplay, String(gameState.completedContractsCount || 0));
    }

    if (!container) return;

    container.innerHTML = gameState.activeContracts.map(c => {
        const pct = Math.min(100, Math.max(0, (c.current / c.target) * 100));
        const readyClass = c.completed ? 'contract-ready' : '';
        const btnClass = c.completed ? 'btn-claim active' : 'btn-claim disabled';
        const btnText = c.completed ? '✍️ ASSINAR & COLETAR' : 'EM ANDAMENTO';

        return `
            <div class="contract-card ${readyClass}" id="card-${c.id}">
                <div class="contract-header">
                    <div class="contract-icon-box">${c.icon}</div>
                    <div class="contract-info">
                        <div class="contract-title">${c.title}</div>
                        <div class="contract-desc">${c.desc}</div>
                    </div>
                </div>
                <div class="contract-progress-wrap">
                    <div class="contract-progress-bar">
                        <div class="contract-progress-fill" style="width: ${pct.toFixed(1)}%;"></div>
                    </div>
                    <div class="contract-progress-label">${Math.min(c.current, c.target)} / ${c.target} (${pct.toFixed(0)}%)</div>
                </div>
                <div class="contract-footer">
                    <div class="contract-reward">
                        <span class="reward-tag">RECOMPENSA:</span>
                        <span class="reward-val">${c.rewardText}</span>
                    </div>
                    <button class="contract-claim-btn ${btnClass}" data-contract-id="${c.id}" ${c.completed ? '' : 'disabled'}>
                        ${btnText}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.contract-claim-btn.active').forEach(btn => {
        btn.addEventListener('click', () => {
            claimContract(btn.dataset.contractId);
        });
    });
}
