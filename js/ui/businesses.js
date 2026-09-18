// Cards de negócio: criação, compra, gerentes e modo de compra em lote.

import { upgrades } from '../config.js';
import { gameState } from '../state.js';
import { formatNumber, playSound, playCashSound, playHoverSound, showBanner, shockwave, showNotification } from '../utils.js';
import { spawnConfetti } from '../vfx.js';
import {
    getUpgradeCost, getUpgradeIncome, getUpgradeMilestoneMult,
    getBulkCost, getMaxAffordable, getManagerCost, isBusinessUnlocked
} from '../economy.js';
import { recordContractProgress } from '../contracts.js';
import { el, setText, setHtml } from './dom.js';

// Modo de compra atual. Exportado como binding vivo: o hud lê o valor
// atualizado sem precisar de getter.
export let bulkMode = 1;

/** Quantidade efetiva para o modo de compra atual (bulkMode: 1, 10, 25 ou 'max'). */
export function getBuyQuantity(idx) {
    return bulkMode === 'max' ? getMaxAffordable(idx) : bulkMode;
}

export function setBulkMode(mode) {
    bulkMode = mode;
    document.querySelectorAll('.bulk-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === String(mode));
    });
}

// Referências dos filhos de cada card, guardadas na criação
export let cardRefs = [];

export function createUpgradeButtons() {
    const container = el.upgradesContainer || document.getElementById('upgradesContainer');
    container.innerHTML = '';
    cardRefs = [];

    upgrades.forEach((u, i) => {
        const card = document.createElement('div');
        card.id = `upgrade-${i}`;
        card.className = `upgrade-btn biz-tier-${i}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.innerHTML = `
            <div class="upgrade-qty"></div>
            <div class="biz-icon-badge"><svg class="upgrade-icon"><use href="#${u.glyph}"/></svg></div>
            <div class="upgrade-name">${u.name}</div>
            <div class="upgrade-cost">${formatNumber(getUpgradeCost(i))}</div>
            <div class="upgrade-income">+${formatNumber(getUpgradeIncome(i))}/s</div>
            <div class="biz-milestone-wrap">
                <div class="biz-milestone-bar"><div class="biz-milestone-fill"></div></div>
                <span class="biz-milestone-label">0/10</span>
            </div>
            <div class="upgrade-count" style="display:none;"></div>
            <button class="manager-btn" title="Gerente automatiza a compra deste negócio"></button>
            <div class="upgrade-lock-overlay">
                <svg class="icon icon-lg"><use href="#i-lock"/></svg>
                <div class="upgrade-lock"></div>
            </div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.manager-btn')) return;
            buyUpgrade(i, e);
        });
        card.addEventListener('mouseenter', () => playHoverSound());
        card.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                if (e.target.closest('.manager-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                buyUpgrade(i, e);
            }
        });
        container.appendChild(card);

        const refs = {
            card,
            qty: card.querySelector('.upgrade-qty'),
            cost: card.querySelector('.upgrade-cost'),
            income: card.querySelector('.upgrade-income'),
            count: card.querySelector('.upgrade-count'),
            lock: card.querySelector('.upgrade-lock'),
            manager: card.querySelector('.manager-btn'),
            milestoneFill: card.querySelector('.biz-milestone-fill'),
            milestoneLabel: card.querySelector('.biz-milestone-label')
        };
        cardRefs.push(refs);
        refs.manager.addEventListener('click', (e) => {
            e.stopPropagation();
            buyManager(i);
        });
    });
    updateManagerButtons();
}

export function buyUpgrade(idx, e) {
    if (!isBusinessUnlocked(idx)) return;
    const card = (e && e.target) ? (e.target.closest('.upgrade-btn') || e.currentTarget) : cardRefs[idx]?.card;

    const qty = Math.max(1, getBuyQuantity(idx));
    const cost = getBulkCost(idx, qty);
    if (gameState.money < cost) return;

    gameState.money -= cost;
    const prevMult = getUpgradeMilestoneMult(idx);
    upgrades[idx].owned += qty;
    recordContractProgress('buy', qty, { idx });
    const newMult = getUpgradeMilestoneMult(idx);

    if (card) {
        card.classList.add('just-bought');
        setTimeout(() => card.classList.remove('just-bought'), 400);
    }

    if (newMult > prevMult) {
        showBanner('Marco atingido', `${upgrades[idx].name} ×${newMult}`,
            `${upgrades[idx].owned} unidades — renda multiplicada`, true);
        shockwave('#ffd700');
        spawnConfetti();
        playSound(2400, 200);
    } else {
        // Compra rotineira não vira aviso: o card atualiza e o prédio sobe no
        // cenário. Empilhar um toast por clique só virava ruído.
        playCashSound();
    }
}

export function buyManager(idx) {
    if (upgrades[idx].manager) return;
    const cost = getManagerCost(idx);
    if (gameState.money >= cost) {
        gameState.money -= cost;
        upgrades[idx].manager = true;
        showNotification(`Gerente de ${upgrades[idx].name} contratado! Automação ativa.`, '🤖', 3000);
        playCashSound();
        updateManagerButtons();
    }
}

export function updateManagerButtons() {
    for (let i = 0; i < cardRefs.length; i++) {
        const btn = cardRefs[i].manager;
        if (!btn) continue;
        const robot = '<svg class="icon"><use href="#i-robot"/></svg>';
        if (upgrades[i].manager) {
            setHtml(btn, `${robot}<span>Ativo</span>`);
            btn.classList.add('owned');
            btn.disabled = true;
        } else {
            const cost = getManagerCost(i);
            setHtml(btn, `${robot}<span>${formatNumber(cost)}</span>`);
            btn.classList.remove('owned');
            btn.disabled = gameState.money < cost;
        }
    }
}

