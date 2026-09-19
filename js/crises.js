// Sistema de Crises Corporativas e Dilemas Estratégicos em Tempo Real.
// Eventos táticos com escolhas executivas de alto risco e alto retorno.

import { gameState } from './state.js';
import { getRawDPS, getEffectiveMultiplier, addMoney } from './economy.js';
import { formatNumber, showNotification, playSound, playCashSound, playCritSound, shockwave } from './utils.js';
import { spawnConfetti } from './vfx.js';

let nextCrisisTimer = 180000 + Math.random() * 90000; // a cada ~3-4 minutos
let activeCrisis = null;
let crisisTimeoutId = null;

export const CRISES = [
    {
        id: 'ransomware',
        title: '🚨 ATAQUE DE RANSOMWARE NOS SERVIDORES!',
        desc: 'Netrunners hostis invadiram a rede interna e estão criptografando bancos de dados vitais.',
        icon: '💻',
        color: '#ff4466',
        optionA: {
            title: 'Pagar Firewall & Especialistas',
            desc: 'Paga 15s de faturamento para repelir 100% da ameaça com segurança.',
            action: () => {
                const dps = getRawDPS() * getEffectiveMultiplier();
                const cost = Math.max(100, dps * 15);
                gameState.money = Math.max(0, gameState.money - cost);
                playCashSound();
                showNotification(`Firewall restaurado com sucesso! Custo: -${formatNumber(cost)}`, '🛡️', 3500);
            }
        },
        optionB: {
            title: 'Contra-Ataque Neural (Risco)',
            desc: '70% de chance de reverter o ataque e roubar fundos dos invasores (+45s de renda). 30% de falha.',
            action: () => {
                const dps = getRawDPS() * getEffectiveMultiplier();
                if (Math.random() < 0.70) {
                    const reward = Math.max(250, dps * 45);
                    addMoney(reward, true);
                    playCritSound();
                    shockwave('#00ff88');
                    spawnConfetti();
                    showNotification(`VITÓRIA HACKER: Servidores inimigos drenados! +${formatNumber(reward)}!`, '💎', 4000);
                } else {
                    const penalty = Math.max(100, dps * 20);
                    gameState.money = Math.max(0, gameState.money - penalty);
                    playSound(400, 300);
                    showNotification(`Contra-ataque falhou! Prejuízo de -${formatNumber(penalty)}`, '⚠️', 3500);
                }
            }
        }
    },
    {
        id: 'hostile_takeover',
        title: '💼 PROPOSTA DE AQUISIÇÃO HOSTIL!',
        desc: 'Um megaconglomerado rival quer comprar sua patente de redes neurais com oferta agressiva.',
        icon: '🤝',
        color: '#ffd700',
        optionA: {
            title: 'Aceitar Injeção de Capital',
            desc: 'Cede licença parcial em troca de uma injeção de 60 segundos de renda líquida imediata.',
            action: () => {
                const dps = getRawDPS() * getEffectiveMultiplier();
                const reward = Math.max(500, dps * 60);
                addMoney(reward, true);
                playCashSound();
                spawnConfetti();
                showNotification(`Acordo assinado! Injeção de caixa imediata: +${formatNumber(reward)}!`, '💰', 4000);
            }
        },
        optionB: {
            title: 'Rejeitar e Declarar Guerra Comercial',
            desc: 'Mantém independência total e motiva a corporação (+25% DPS pelos próximos 45s).',
            action: () => {
                gameState.tempBoostMult = 1.25;
                gameState.tempBoostExpiry = Date.now() + 45000;
                playCritSound();
                shockwave('#ffd700');
                showNotification('GUERRA COMERCIAL: Equipe em frenesi! +25% de Renda por 45s!', '🔥', 4000);
            }
        }
    },
    {
        id: 'data_leak',
        title: '⚠️ VAZAMENTO DE DADOS NA DARKNET!',
        desc: 'Planilhas estratégicas de custos e lucros corporativos caíram em fóruns cibernéticos clandestinos.',
        icon: '🌐',
        color: '#b366ff',
        optionA: {
            title: 'Contratar Assessoria de Crise',
            desc: 'Investe 12s de faturamento para abafar a história e reverter em publicidade positiva.',
            action: () => {
                const dps = getRawDPS() * getEffectiveMultiplier();
                const cost = Math.max(80, dps * 12);
                gameState.money = Math.max(0, gameState.money - cost);
                playCashSound();
                showNotification(`Imprensa pacificada. Confiabilidade mantida! (-${formatNumber(cost)})`, '📰', 3500);
            }
        },
        optionB: {
            title: 'Abraçar o Hype Viral',
            desc: '60% de chance de o escândalo atrair milhões de novos clientes (+30s de Modo Febre).',
            action: () => {
                if (Math.random() < 0.60) {
                    gameState.tempBoostMult = 2.0;
                    gameState.tempBoostExpiry = Date.now() + 30000;
                    playCritSound();
                    shockwave('#ffaa00');
                    showNotification('VIRALIZOU! Tráfego massivo e receitas dobradas por 30s!', '🚀', 4000);
                } else {
                    playSound(350, 250);
                    showNotification('O público reprovou a atitude. Nenhuma consequência financeira.', '📉', 3000);
                }
            }
        }
    }
];

export function initCrises() {
    activeCrisis = null;
}

export function tickCrises(deltaMs) {
    if (activeCrisis) return;
    nextCrisisTimer -= deltaMs;
    if (nextCrisisTimer <= 0) {
        nextCrisisTimer = 180000 + Math.random() * 90000;
        // Só dispara se o jogador já tiver pelo menos 1 negócio
        if (gameState.totalEarned > 100) {
            triggerRandomCrisis();
        }
    }
}

export function triggerRandomCrisis() {
    const crisis = CRISES[Math.floor(Math.random() * CRISES.length)];
    triggerCrisis(crisis);
}

export function triggerCrisis(crisis) {
    activeCrisis = crisis;
    playSound(700, 180);
    setTimeout(() => playSound(550, 220), 200);

    renderCrisisBanner();

    if (crisisTimeoutId) clearTimeout(crisisTimeoutId);
    // Tempo limite de 30 segundos para responder
    crisisTimeoutId = setTimeout(() => {
        if (activeCrisis) {
            dismissCrisis();
            showNotification('Tempo esgotado para responder à crise corporativa!', '⏱️', 3000);
        }
    }, 30000);
}

export function resolveCrisisChoice(choice) {
    if (!activeCrisis) return;
    if (choice === 'A' && activeCrisis.optionA) {
        activeCrisis.optionA.action();
    } else if (choice === 'B' && activeCrisis.optionB) {
        activeCrisis.optionB.action();
    }
    dismissCrisis();
}

export function dismissCrisis() {
    activeCrisis = null;
    if (crisisTimeoutId) clearTimeout(crisisTimeoutId);
    crisisTimeoutId = null;
    if (typeof document !== 'undefined') {
        const banner = document.getElementById('crisisBanner');
        if (banner) banner.style.display = 'none';
    }
}

export function getActiveCrisis() {
    return activeCrisis;
}

function renderCrisisBanner() {
    if (typeof document === 'undefined' || !activeCrisis) return;
    const banner = document.getElementById('crisisBanner');
    if (!banner) return;

    banner.style.display = 'block';
    banner.innerHTML = `
        <div class="crisis-card" style="border-color: ${activeCrisis.color};">
            <div class="crisis-header">
                <span class="crisis-icon">${activeCrisis.icon}</span>
                <div class="crisis-title-box">
                    <div class="crisis-title" style="color: ${activeCrisis.color};">${activeCrisis.title}</div>
                    <div class="crisis-desc">${activeCrisis.desc}</div>
                </div>
                <button class="crisis-close-btn" data-action="dismissCrisis">✕</button>
            </div>
            <div class="crisis-actions">
                <button class="btn crisis-btn-a" data-action="resolveCrisis" data-target="A">
                    <div class="crisis-opt-title">${activeCrisis.optionA.title}</div>
                    <div class="crisis-opt-desc">${activeCrisis.optionA.desc}</div>
                </button>
                <button class="btn crisis-btn-b" data-action="resolveCrisis" data-target="B">
                    <div class="crisis-opt-title">${activeCrisis.optionB.title}</div>
                    <div class="crisis-opt-desc">${activeCrisis.optionB.desc}</div>
                </button>
            </div>
        </div>
    `;
}
