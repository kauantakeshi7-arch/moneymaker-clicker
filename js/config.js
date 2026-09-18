// Dados e tabelas de balanceamento. Ajustes de economia começam aqui.

// ============ UPGRADES v16 ============
// Payback base ~80s por unidade: tempo suficiente para a renda não financiar
// a própria expansão instantaneamente (com 25s o DPS dobrava a cada poucos segundos).
const upgrades = [
    { name: 'Freelancer', icon: '👤', baseIncome: 0.25, baseCost: 20, owned: 0, manager: false },
    { name: 'Startup', icon: '🏢', baseIncome: 2, baseCost: 200, owned: 0, manager: false },
    { name: 'Corporação', icon: '🏛️', baseIncome: 20, baseCost: 2000, owned: 0, manager: false },
    { name: 'Multinacional', icon: '🌍', baseIncome: 200, baseCost: 20000, owned: 0, manager: false },
    { name: 'Gigante TI', icon: '💻', baseIncome: 2000, baseCost: 200000, owned: 0, manager: false },
    { name: 'Império Financeiro', icon: '💰', baseIncome: 20000, baseCost: 2000000, owned: 0, manager: false },
    { name: 'Império Global', icon: '👑', baseIncome: 200000, baseCost: 20000000, owned: 0, manager: false }
];

// ============ PRESTÍGIO (infinito além do nível 10) ============
const PRESTIGE_MULTIPLIERS = [1, 1.2, 1.44, 1.73, 2.07, 2.49, 2.99, 3.59, 4.31, 5.17, 6.20];
const PRESTIGE_COSTS = [0, 1000000, 5000000, 20000000, 80000000, 320000000, 1280000000, 5120000000, 20480000000, 81920000000, 327680000000];

function getPrestigeMultiplierForLevel(level) {
    if (level <= 10) return PRESTIGE_MULTIPLIERS[level];
    return PRESTIGE_MULTIPLIERS[10] * Math.pow(1.15, level - 10);
}

function getPrestigeCostForLevel(level) {
    if (level <= 10) return PRESTIGE_COSTS[level];
    return PRESTIGE_COSTS[10] * Math.pow(4, level - 10);
}

// ============ PONTOS DE PRESTÍGIO (escalam com o progresso da run) ============
// Decisão central do gênero: prestigiar agora ou empurrar mais fundo por mais pontos?
// Escala logarítmica de propósito: a economia de dinheiro é exponencial, então qualquer
// raiz faria os pontos explodirem junto e a loja de prestígio seria zerada numa run.
// Aqui, cada 1000× de progresso vale +24 pontos — empurrar mais fundo compensa sempre,
// mas a loja continua sendo um objetivo de longo prazo.
function prestigePointsForTotal(totalEarned) {
    if (!Number.isFinite(totalEarned) || totalEarned < 1e6) return 0;
    const raw = 8 * Math.log10(totalEarned / 1e6);
    const boost = 1 + (gameState.prestigeShopLevels.prestigeBoost * 0.05);
    return Math.max(0, Math.floor(raw * boost));
}

function pendingPrestigePoints() {
    return Math.max(0, prestigePointsForTotal(gameState.totalEarned) - gameState.lifetimePrestigePoints);
}

// ============ LOJA DE PRESTÍGIO (permanente, paga com pontos) ============
const PRESTIGE_SHOP = [
    { id: 'clickPower', name: 'Cliques Poderosos', icon: '👊', desc: '+5% de renda por clique', maxLevel: 10, costFor: (lvl) => (lvl + 1) * 2 },
    { id: 'globalIncome', name: 'Renda Global', icon: '📈', desc: '+10% de multiplicador permanente', maxLevel: 10, costFor: (lvl) => (lvl + 1) * 3 },
    { id: 'startingCash', name: 'Capital Inicial', icon: '🏦', desc: 'Começa cada prestígio com dinheiro', maxLevel: 6, costFor: (lvl) => (lvl + 1) * 5,
      valueFor: (lvl) => lvl <= 0 ? 0 : Math.pow(10, lvl + 2) },
    { id: 'freeManagers', name: 'Equipe Fixa', icon: '🧑‍💼', desc: 'Primeiros negócios já vêm com Gerente', maxLevel: 4, costFor: (lvl) => (lvl + 1) * 8 },
    { id: 'cheapManagers', name: 'Gerentes Baratos', icon: '🤖', desc: '-10% no custo de contratar gerentes', maxLevel: 5, costFor: (lvl) => (lvl + 1) * 3 },
    { id: 'critChance', name: 'Precisão', icon: '🎯', desc: '+2% de chance de clique crítico', maxLevel: 5, costFor: (lvl) => (lvl + 1) * 4 },
    { id: 'goldenLuck', name: 'Sorte Dourada', icon: '🍀', desc: 'Eventos dourados 15% mais frequentes', maxLevel: 4, costFor: (lvl) => (lvl + 1) * 4 },
    { id: 'offlineEfficiency', name: 'Piloto Automático', icon: '🌙', desc: '+10% de eficiência offline (base 50%)', maxLevel: 5, costFor: (lvl) => (lvl + 1) * 4 },
    { id: 'prestigeBoost', name: 'Legado', icon: '💎', desc: '+5% de pontos de prestígio ganhos', maxLevel: 5, costFor: (lvl) => (lvl + 1) * 6 }
];

// ============ UPGRADES DE RUN (pagos com dinheiro, resetam no prestígio) ============
// A camada de escolha que faltava: cada run constrói um "build" diferente.
const MONEY_UPGRADES = [
    // --- Impulso por negócio: ×2 na renda daquele negócio (requer 10 unidades) ---
    ...upgrades.map((u, i) => ({
        id: `biz${i}_a`, name: `${u.name} Turbinado`, icon: u.icon, cat: 'Negócios',
        desc: `×2 na renda de ${u.name}`,
        cost: u.baseCost * 400, req: () => upgrades[i].owned >= 10,
        reqText: `Tenha 10 × ${u.name}`, effect: { type: 'bizMult', idx: i, value: 2 }
    })),
    // --- Segundo tier: ×2 adicional (requer 25 unidades) ---
    ...upgrades.map((u, i) => ({
        id: `biz${i}_b`, name: `${u.name} Industrial`, icon: u.icon, cat: 'Negócios',
        desc: `×2 adicional na renda de ${u.name}`,
        cost: u.baseCost * 4000, req: () => upgrades[i].owned >= 25,
        reqText: `Tenha 25 × ${u.name}`, effect: { type: 'bizMult', idx: i, value: 2 }
    })),
    // --- Cliques ---
    { id: 'click_a', name: 'Mouse Ergonômico', icon: '🖱️', cat: 'Cliques', desc: '×2 no valor do clique',
      cost: 2000, req: () => gameState.clickCount >= 25, reqText: 'Dê 25 cliques', effect: { type: 'clickMult', value: 2 } },
    { id: 'click_b', name: 'Dedos de Aço', icon: '✊', cat: 'Cliques', desc: '×2.5 adicional no clique',
      cost: 150000, req: () => gameState.clickCount >= 200, reqText: 'Dê 200 cliques', effect: { type: 'clickMult', value: 2.5 } },
    { id: 'click_c', name: 'Interface Neural', icon: '🧠', cat: 'Cliques', desc: '×3 adicional no clique',
      cost: 8000000, req: () => gameState.clickCount >= 600, reqText: 'Dê 600 cliques', effect: { type: 'clickMult', value: 3 } },
    { id: 'crit_a', name: 'Sorte do Iniciante', icon: '🍀', cat: 'Cliques', desc: '+8% de chance de crítico',
      cost: 60000, req: () => gameState.clickCount >= 100, reqText: 'Dê 100 cliques', effect: { type: 'critChanceAdd', value: 0.08 } },
    { id: 'crit_b', name: 'Golpe Certeiro', icon: '💥', cat: 'Cliques', desc: '×2 no dano do crítico (×15 → ×30)',
      cost: 1200000, req: () => gameState.maxCombo >= 25, reqText: 'Alcance combo ×25', effect: { type: 'critMult', value: 2 } },
    // --- Sinergias (recompensam composições específicas) ---
    { id: 'syn_a', name: 'Incubadora', icon: '🧪', cat: 'Sinergias', desc: 'Cada 10 Freelancers: +2% de renda global (máx +100%)',
      cost: 250000, req: () => upgrades[0].owned >= 30, reqText: 'Tenha 30 × Freelancer', effect: { type: 'synergy', source: 0, per: 10, value: 0.02, cap: 1.0 } },
    { id: 'syn_b', name: 'Sinergia Corporativa', icon: '🔗', cat: 'Sinergias', desc: 'Cada Corporação: +2% de renda global (máx +150%)',
      cost: 3000000, req: () => upgrades[2].owned >= 15, reqText: 'Tenha 15 × Corporação', effect: { type: 'synergy', source: 2, per: 1, value: 0.02, cap: 1.5 } },
    { id: 'syn_c', name: 'Ecossistema Global', icon: '🌐', cat: 'Sinergias', desc: 'Cada Império Global: +5% de renda global (máx +250%)',
      cost: 400000000, req: () => upgrades[6].owned >= 5, reqText: 'Tenha 5 × Império Global', effect: { type: 'synergy', source: 6, per: 1, value: 0.05, cap: 2.5 } },
    // --- Globais ---
    { id: 'glob_a', name: 'Consultoria Estratégica', icon: '📊', cat: 'Global', desc: '×1.5 na renda global',
      cost: 1000000, req: () => gameState.totalEarned >= 500000, reqText: 'Ganhe $500k na run', effect: { type: 'globalMult', value: 1.5 } },
    { id: 'glob_b', name: 'Monopólio', icon: '🎩', cat: 'Global', desc: '×2 na renda global',
      cost: 80000000, req: () => gameState.totalEarned >= 40000000, reqText: 'Ganhe $40M na run', effect: { type: 'globalMult', value: 2 } },
    { id: 'glob_c', name: 'Cartel Interplanetário', icon: '🪐', cat: 'Global', desc: '×3 na renda global',
      cost: 5000000000, req: () => gameState.totalEarned >= 2000000000, reqText: 'Ganhe $2B na run', effect: { type: 'globalMult', value: 3 } },
    // --- Utilidades (mudam como você joga) ---
    { id: 'util_golden', name: 'Olho de Ouro', icon: '👁️', cat: 'Utilidades', desc: 'Eventos dourados 40% mais frequentes',
      cost: 400000, req: () => gameState.totalEarned >= 200000, reqText: 'Ganhe $200k na run', effect: { type: 'goldenRate', value: 0.6 } },
    { id: 'util_euphoria', name: 'Euforia', icon: '🎉', cat: 'Utilidades', desc: 'Buff dourado dura 40s (em vez de 20s)',
      cost: 4000000, req: () => gameState.totalEarned >= 2000000, reqText: 'Ganhe $2M na run', effect: { type: 'goldenDuration', value: 40000 } },
    { id: 'util_fever', name: 'Modo Febre', icon: '🔥', cat: 'Utilidades', desc: 'Combo ≥50 dobra TODA a renda enquanto sustentado',
      cost: 12000000, req: () => gameState.maxCombo >= 50, reqText: 'Alcance combo ×50', effect: { type: 'fever' } },
    { id: 'util_agile', name: 'Gerentes Ágeis', icon: '⚙️', cat: 'Utilidades', desc: 'Automação compra 4× mais rápido',
      cost: 2500000, req: () => upgrades.filter(u => u.manager).length >= 3, reqText: 'Contrate 3 Gerentes', effect: { type: 'aiSpeed', value: 4 } }
];

const MONEY_UPGRADES_BY_ID = Object.fromEntries(MONEY_UPGRADES.map(u => [u.id, u]));

// Acumuladores de efeito dos upgrades de run (fonte única da verdade)
function getRunUpgradeProduct(effectType) {
    let product = 1;
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === effectType) product *= up.effect.value;
    }
    return product;
}

function getRunUpgradeSum(effectType) {
    let sum = 0;
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === effectType) sum += up.effect.value;
    }
    return sum;
}

function hasRunEffect(effectType) {
    return gameState.runUpgrades.some(id => {
        const up = MONEY_UPGRADES_BY_ID[id];
        return up && up.effect.type === effectType;
    });
}

function getRunEffectValue(effectType, fallback) {
    let value = fallback;
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === effectType) value = up.effect.value;
    }
    return value;
}

// Sinergias: bônus global derivado de quantos negócios de um tipo você acumulou.
// Cada sinergia tem teto — sem ele o bônus crescia junto com a contagem de negócios,
// criando retroalimentação (mais negócios → mais multiplicador → mais negócios).
function getSynergyMultiplier() {
    let bonus = 0;
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === 'synergy') {
            const count = upgrades[up.effect.source].owned;
            const raw = Math.floor(count / up.effect.per) * up.effect.value;
            bonus += Math.min(raw, up.effect.cap);
        }
    }
    return 1 + bonus;
}

const FEVER_COMBO_THRESHOLD = 50;
function isFeverActive() {
    return hasRunEffect('fever') && gameState.combo >= FEVER_COMBO_THRESHOLD;
}

// ============ CONQUISTAS ============
const ACHIEVEMENTS = [
    { id: 'first_click', icon: '🖱️', name: 'Primeiro Clique', desc: 'Clique uma vez', check: (s) => s.clickCount >= 1 },
    { id: 'click_100', icon: '👆', name: 'Dedo Rápido', desc: '100 cliques', check: (s) => s.clickCount >= 100 },
    { id: 'click_1000', icon: '⚡', name: 'Clicador Veterano', desc: '1.000 cliques', check: (s) => s.clickCount >= 1000 },
    { id: 'combo_10', icon: '🔥', name: 'Combo Quente', desc: 'Combo ×10', check: (s) => s.maxCombo >= 10 },
    { id: 'earn_1k', icon: '💵', name: 'Primeiro Milhar', desc: 'Ganhe $1.000 no total', check: (s) => s.totalEarned >= 1000 },
    { id: 'earn_1m', icon: '💰', name: 'Milionário', desc: 'Ganhe $1M no total', check: (s) => s.totalEarned >= 1e6 },
    { id: 'earn_1b', icon: '🏦', name: 'Bilionário', desc: 'Ganhe $1B no total', check: (s) => s.totalEarned >= 1e9 },
    { id: 'business_10', icon: '🏢', name: 'Pequeno Império', desc: '10 negócios comprados', check: (s) => upgrades.reduce((a, b) => a + b.owned, 0) >= 10 },
    { id: 'business_50', icon: '🌆', name: 'Grande Império', desc: '50 negócios comprados', check: (s) => upgrades.reduce((a, b) => a + b.owned, 0) >= 50 },
    { id: 'all_types', icon: '🧩', name: 'Diversificado', desc: 'Possua ao menos 1 de cada negócio', check: (s) => upgrades.every(u => u.owned >= 1) },
    { id: 'prestige_1', icon: '⭐', name: 'Renascido', desc: 'Alcance o Prestígio 1', check: (s) => s.prestigeLevel >= 1 },
    { id: 'prestige_5', icon: '🌟', name: 'Meio Caminho', desc: 'Alcance o Prestígio 5', check: (s) => s.prestigeLevel >= 5 },
    { id: 'prestige_max', icon: '👑', name: 'Lenda', desc: 'Alcance o Prestígio 10', check: (s) => s.prestigeLevel >= 10 }
];

