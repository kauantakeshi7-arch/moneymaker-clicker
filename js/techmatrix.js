// Matriz de Pesquisa Tecnológica (Tech Matrix R&D).
// Sistema de árvore de talentos com 3 vertentes estratégicas:
// 1. Cibernética & Hardware (Cliques, Críticos e Reator)
// 2. Inteligência Neural & Automação (Negócios, Gerentes e Produção Offline)
// 3. Alta Finança & Especulação (Bolsa de Valores, Dividendos e Prestígio)

import { gameState } from './state.js';
import { formatNumber, showNotification, playCashSound, playCritSound, playSound, shockwave } from './utils.js';
import { spawnConfetti } from './vfx.js';

const TECH_SAVE_KEY = 'mm_tech_v1';

export const TECH_BRANCHES = {
    cyber: {
        name: 'Cibernética & Reator',
        icon: '🦾',
        color: '#00d4ff',
        desc: 'Otimização de cliques, acertos críticos e potência do reator.'
    },
    neural: {
        name: 'Inteligência Neural & IA',
        icon: '🤖',
        color: '#00ff88',
        desc: 'Automação industrial, gerentes e produtividade passiva.'
    },
    finance: {
        name: 'Alta Finança & Derivativos',
        icon: '🌐',
        color: '#ffd700',
        desc: 'Operações na bolsa, dividendos corporativos e prestígio cósmico.'
    }
};

export const TECH_NODES = [
    // Ramo 1: Cibernética & Reator
    {
        id: 'c1',
        branch: 'cyber',
        tier: 1,
        name: 'Injeção Neural de Alta Tensão',
        desc: 'Otimiza a interface cérebro-máquina. O clique manual vale +25% de dinheiro adicional.',
        cost: 1000,
        req: null,
        unlocked: false
    },
    {
        id: 'c2',
        branch: 'cyber',
        tier: 2,
        name: 'Overclock de Plasma do Reator',
        desc: 'Atingir o modo de Sobrecarga de RPM de cliques concede +100% de valor por clique.',
        cost: 65000,
        req: 'c1',
        unlocked: false
    },
    {
        id: 'c3',
        branch: 'cyber',
        tier: 3,
        name: 'Condensador Quântico Crítico',
        desc: 'Sobrecargas elétricas elevam o dano dos acertos críticos em +50% e a chance em +5%.',
        cost: 3500000,
        req: 'c2',
        unlocked: false
    },

    // Ramo 2: Inteligência Neural & IA
    {
        id: 'a1',
        branch: 'neural',
        tier: 1,
        name: 'Algoritmos Preditivos de Expansão',
        desc: 'Modelagem analítica reduz o custo de aquisição de todos os negócios em 8%.',
        cost: 5000,
        req: null,
        unlocked: false
    },
    {
        id: 'a2',
        branch: 'neural',
        tier: 2,
        name: 'Rede Neural DeepSync',
        desc: 'Sincronia autônoma: todos os negócios com gerente contratado produzem +25% DPS.',
        cost: 300000,
        req: 'a1',
        unlocked: false
    },
    {
        id: 'a3',
        branch: 'neural',
        tier: 3,
        name: 'Datacenter Quântico Orbital',
        desc: 'Sistemas autônomos elevam a eficiência da renda offline de 50% para 80%.',
        cost: 15000000,
        req: 'a2',
        unlocked: false
    },

    // Ramo 3: Alta Finança & Derivativos
    {
        id: 'f1',
        branch: 'finance',
        tier: 1,
        name: 'Algoritmo de HFT (Alta Frequência)',
        desc: 'Ordens instantâneas: todas as vendas com lucro na Bolsa de Valores rendem +15% de bônus.',
        cost: 25000,
        req: null,
        unlocked: false
    },
    {
        id: 'f2',
        branch: 'finance',
        tier: 2,
        name: 'Fundo Hedge Corporativo',
        desc: 'A habilidade tática de Dividendos passa a conceder 60s de caixa em vez de 45s.',
        cost: 1200000,
        req: 'f1',
        unlocked: false
    },
    {
        id: 'f3',
        branch: 'finance',
        tier: 3,
        name: 'Arbitragem Intergaláctica',
        desc: 'Reputação estelar: prestigiar rende +25% de Pontos de Prestígio 💎 adicionais.',
        cost: 60000000,
        req: 'f2',
        unlocked: false
    }
];

export function initTechMatrix() {
    loadTechState();
}

export function isTechUnlocked(id) {
    const node = TECH_NODES.find(n => n.id === id);
    return node ? !!node.unlocked : false;
}

export function canResearchTech(id) {
    const node = TECH_NODES.find(n => n.id === id);
    if (!node || node.unlocked) return false;
    if (node.req && !isTechUnlocked(node.req)) return false;
    return gameState.money >= node.cost;
}

export function researchTech(id) {
    const node = TECH_NODES.find(n => n.id === id);
    if (!node) return;
    if (node.unlocked) {
        showNotification('Tecnologia já pesquisada!', '💡', 2000);
        return;
    }
    if (node.req && !isTechUnlocked(node.req)) {
        const reqNode = TECH_NODES.find(n => n.id === node.req);
        showNotification(`Requer pesquisar primeiro: ${reqNode?.name || node.req}`, '⚠️', 3000);
        return;
    }
    if (gameState.money < node.cost) {
        showNotification('Fundos corporativos insuficientes!', '⚠️', 2000);
        return;
    }

    gameState.money -= node.cost;
    node.unlocked = true;
    saveTechState();

    playCritSound();
    shockwave(TECH_BRANCHES[node.branch].color);
    spawnConfetti();
    showNotification(`P&D CONCLUÍDO: ${node.name}!`, '💡', 3500);

    renderTechMatrixUI();
}

export function resetTechMatrix() {
    TECH_NODES.forEach(n => { n.unlocked = false; });
    saveTechState();
    renderTechMatrixUI();
}

function saveTechState() {
    try {
        const unlockedList = TECH_NODES.filter(n => n.unlocked).map(n => n.id);
        localStorage.setItem(TECH_SAVE_KEY, JSON.stringify(unlockedList));
    } catch (e) {
        console.warn('Falha ao salvar Tech Matrix:', e);
    }
}

function loadTechState() {
    try {
        const saved = localStorage.getItem(TECH_SAVE_KEY);
        if (!saved) return;
        const list = JSON.parse(saved);
        if (!Array.isArray(list)) return;
        TECH_NODES.forEach(n => {
            n.unlocked = list.includes(n.id);
        });
    } catch (e) {
        console.warn('Falha ao carregar Tech Matrix:', e);
    }
}

export function renderTechMatrixUI() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('techMatrixContainer');
    if (!container) return;

    let html = '<div class="tech-matrix-grid">';

    Object.keys(TECH_BRANCHES).forEach(branchKey => {
        const b = TECH_BRANCHES[branchKey];
        const branchNodes = TECH_NODES.filter(n => n.branch === branchKey);

        html += `
            <div class="tech-branch-col">
                <div class="tech-branch-header" style="border-color: ${b.color};">
                    <span class="tech-branch-icon">${b.icon}</span>
                    <div>
                        <div class="tech-branch-title" style="color: ${b.color};">${b.name}</div>
                        <div class="tech-branch-desc">${b.desc}</div>
                    </div>
                </div>
                <div class="tech-nodes-list">
        `;

        branchNodes.forEach(node => {
            const isUnlocked = node.unlocked;
            const canResearch = canResearchTech(node.id);
            const reqMet = !node.req || isTechUnlocked(node.req);
            const reqNode = node.req ? TECH_NODES.find(n => n.id === node.req) : null;

            let statusClass = 'locked';
            let statusBadge = `Requer: ${reqNode?.name || 'Anterior'}`;

            if (isUnlocked) {
                statusClass = 'researched';
                statusBadge = '✓ PESQUISADO';
            } else if (canResearch) {
                statusClass = 'available';
                statusBadge = 'DISPONÍVEL';
            } else if (reqMet) {
                statusClass = 'affordable-wait';
                statusBadge = `${formatNumber(node.cost)}`;
            }

            html += `
                <div class="tech-node-card ${statusClass}" data-action="researchTech" data-target="${node.id}">
                    <div class="tech-node-tier">TIER ${node.tier}</div>
                    <div class="tech-node-content">
                        <div class="tech-node-name">${node.name}</div>
                        <div class="tech-node-desc">${node.desc}</div>
                        <div class="tech-node-footer">
                            <span class="tech-node-badge ${statusClass}">${statusBadge}</span>
                            ${!isUnlocked ? `<span class="tech-node-cost">${formatNumber(node.cost)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}
