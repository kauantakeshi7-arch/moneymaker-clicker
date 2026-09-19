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

export const BIZ_LORE = [
    { title: 'Neural Freelancer', tag: 'Netrunner de Garagem', color: '#00ff88' },
    { title: 'Synthetix AI', tag: 'Venture Capital & Bots', color: '#00d4ff' },
    { title: 'RoboForge Corp', tag: 'Linha Robótica Autônoma', color: '#ffaa00' },
    { title: 'Aegis Wall Street', tag: 'Alta Finança & Hedge Funds', color: '#ffd700' },
    { title: 'OmniStream Media', tag: 'Holonet & Transmissão', color: '#b366ff' },
    { title: 'Aether Orbital Vault', tag: 'Custódia Quântica Espacial', color: '#38bdf8' },
    { title: 'Apex Syndicate', tag: 'Monopólio Interplanetário', color: '#ff3366' }
];

// Referências dos filhos de cada card, guardadas na criação
export let cardRefs = [];

export function createUpgradeButtons() {
    const container = el.upgradesContainer || document.getElementById('upgradesContainer');
    container.innerHTML = '';
    cardRefs = [];

    upgrades.forEach((u, i) => {
        const lore = BIZ_LORE[i] || { title: u.name, tag: 'Empreendimento', color: '#00d4ff' };
        const card = document.createElement('div');
        card.id = `upgrade-${i}`;
        card.className = `upgrade-btn biz-card biz-tier-${i}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.innerHTML = `
            <div class="biz-card-left">
                <div class="biz-icon-badge">
                    <svg class="upgrade-icon"><use href="#${u.glyph}"/></svg>
                </div>
                <div class="biz-level-pill">LVL <span class="biz-level-num">0</span></div>
            </div>
            <div class="biz-card-center">
                <div class="biz-meta-row">
                    <div class="biz-name-box">
                        <span class="upgrade-name">${lore.title}</span>
                        <span class="biz-tag">${lore.tag}</span>
                    </div>
                    <div class="biz-tier-badge">NÍVEL 0</div>
                </div>
                <div class="biz-income-row">
                    <span class="upgrade-income">+${formatNumber(getUpgradeIncome(i))}/s</span>
                </div>
                <div class="biz-cycle-wrap">
                    <div class="biz-cycle-bar"><div class="biz-cycle-fill"></div></div>
                </div>
                <div class="biz-milestone-wrap">
                    <div class="biz-milestone-bar"><div class="biz-milestone-fill"></div></div>
                    <span class="biz-milestone-label">0/10 (Faltam 10 p/ ×2)</span>
                </div>
            </div>
            <div class="biz-card-right">
                <div class="biz-buy-action" role="button" tabindex="-1">
                    <span class="upgrade-qty">COMPRAR ×1</span>
                    <span class="upgrade-cost">$${formatNumber(getUpgradeCost(i))}</span>
                </div>
                <button class="manager-btn" title="Gerente automatiza a compra deste negócio"></button>
            </div>
            <div class="upgrade-count" style="display:none;"></div>
            <div class="upgrade-lock-overlay">
                <div class="lock-shield"><svg class="icon icon-lg"><use href="#i-lock"/></svg></div>
                <div class="lock-content">
                    <div class="lock-title">PROJETO CONFIDENCIAL</div>
                    <div class="upgrade-lock">Compre 5 × ${upgrades[i - 1]?.name || ''}</div>
                    <div class="lock-progress-bar"><div class="lock-progress-fill"></div></div>
                </div>
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
            levelNum: card.querySelector('.biz-level-num'),
            lock: card.querySelector('.upgrade-lock'),
            lockFill: card.querySelector('.lock-progress-fill'),
            manager: card.querySelector('.manager-btn'),
            milestoneFill: card.querySelector('.biz-milestone-fill'),
            milestoneLabel: card.querySelector('.biz-milestone-label'),
            cycleFill: card.querySelector('.biz-cycle-fill'),
            masteryBadge: card.querySelector('.biz-tier-badge'),
            buyBtn: card.querySelector('.biz-buy-action')
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

