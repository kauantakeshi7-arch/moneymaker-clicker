// Dados e tabelas de balanceamento. Ajustes de economia começam aqui.
//
// Este módulo é intencionalmente puro: não importa nada e não lê estado global.
// Predicados como `req` e `check` recebem o estado por parâmetro, o que mantém
// as dependências entre módulos em uma direção só.

export const SAVE_KEY = 'mm_save_v15';
export const MONEY_CAP = 1e300;  // sanidade contra Infinity; dinheiro é float, nunca arredondado

// ============ NEGÓCIOS ============
// Payback base ~80s por unidade: tempo suficiente para a renda não financiar
// a própria expansão instantaneamente (com 25s o DPS dobrava a cada poucos segundos).
// `glyph` é o id do símbolo SVG usado no card (que fica sempre na tela);
// `icon` é o emoji usado em listas de modal e avisos passageiros.
export const upgrades = [
    { name: 'Freelancer',         glyph: 'b-person', icon: '👤', baseIncome: 0.25,   baseCost: 20,       owned: 0, manager: false },
    { name: 'Startup',            glyph: 'b-shop',   icon: '🏢', baseIncome: 2,      baseCost: 200,      owned: 0, manager: false },
    { name: 'Corporação',         glyph: 'b-bank',   icon: '🏛️', baseIncome: 20,     baseCost: 2000,     owned: 0, manager: false },
    { name: 'Multinacional',      glyph: 'b-globe',  icon: '🌍', baseIncome: 200,    baseCost: 20000,    owned: 0, manager: false },
    { name: 'Gigante TI',         glyph: 'b-server', icon: '💻', baseIncome: 2000,   baseCost: 200000,   owned: 0, manager: false },
    { name: 'Império Financeiro', glyph: 'b-vault',  icon: '💰', baseIncome: 20000,  baseCost: 2000000,  owned: 0, manager: false },
    { name: 'Império Global',     glyph: 'b-crown',  icon: '👑', baseIncome: 200000, baseCost: 20000000, owned: 0, manager: false }
];

// O custo precisa crescer mais rápido que os multiplicadores de renda somados.
// Com 1.07 o payback caía para <1s com upgrades ativos: impressora de dinheiro.
export const COST_GROWTH = 1.15;

// Marcos automáticos por negócio: [unidades, multiplicador]. Limitados de
// propósito — quando eram 2^(owned/10) o crescimento virava duplamente exponencial.
export const MILESTONE_TIERS = [[50, 4], [25, 2.5], [10, 2]];

export const BUSINESS_UNLOCK_THRESHOLD = 5;  // unidades do anterior para liberar o próximo
export const FEVER_COMBO_THRESHOLD = 50;
export const COMBO_MILESTONES = [10, 25, 50, 100];
export const COMBO_TIMEOUT_MS = 1000;         // tolerância de tempo para sustentar o combo
export const BASE_CRIT_CHANCE = 0.05;
export const BASE_CRIT_MULTIPLIER = 15;
export const BASE_CLICK_PERCENT = 0.05;      // clique vale % da renda passiva
export const MANAGER_COST_FACTOR = 50;       // × o custo base do negócio
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const OFFLINE_BASE_EFFICIENCY = 0.5;

// ============ PRESTÍGIO (infinito além do nível 10) ============
const PRESTIGE_MULTIPLIERS = [1, 1.2, 1.44, 1.73, 2.07, 2.49, 2.99, 3.59, 4.31, 5.17, 6.20];
const PRESTIGE_COSTS = [0, 1e6, 5e6, 2e7, 8e7, 3.2e8, 1.28e9, 5.12e9, 2.048e10, 8.192e10, 3.2768e11];

export function getPrestigeMultiplierForLevel(level) {
    if (level <= 10) return PRESTIGE_MULTIPLIERS[level];
    return PRESTIGE_MULTIPLIERS[10] * Math.pow(1.15, Math.min(4000, level - 10));
}

export function getPrestigeCostForLevel(level) {
    if (level <= 10) return PRESTIGE_COSTS[level];
    const exp = Math.min(480, level - 10);
    const raw = PRESTIGE_COSTS[10] * Math.pow(4, exp);
    return Math.min(MONEY_CAP, raw);
}

export function defaultPrestigeShopLevels() {
    return {
        clickPower: 0, globalIncome: 0, cheapManagers: 0,
        startingCash: 0, offlineEfficiency: 0, critChance: 0,
        goldenLuck: 0, prestigeBoost: 0, freeManagers: 0
    };
}

// ============ LOJA DE PRESTÍGIO (permanente, paga com pontos 💎) ============
export const PRESTIGE_SHOP = [
    { id: 'clickPower',        name: 'Cliques Poderosos', icon: '👊', desc: '+5% de renda por clique',              maxLevel: 10, costFor: lvl => (lvl + 1) * 2 },
    { id: 'globalIncome',      name: 'Renda Global',      icon: '📈', desc: '+10% de multiplicador permanente',     maxLevel: 10, costFor: lvl => (lvl + 1) * 3 },
    { id: 'startingCash',      name: 'Capital Inicial',   icon: '🏦', desc: 'Começa cada prestígio com dinheiro',   maxLevel: 6,  costFor: lvl => (lvl + 1) * 5,
      valueFor: lvl => lvl <= 0 ? 0 : Math.pow(10, lvl + 2) },
    { id: 'freeManagers',      name: 'Equipe Fixa',       icon: '🧑‍💼', desc: 'Primeiros negócios já vêm com Gerente', maxLevel: 4, costFor: lvl => (lvl + 1) * 8 },
    { id: 'cheapManagers',     name: 'Gerentes Baratos',  icon: '🤖', desc: '-10% no custo de contratar gerentes',  maxLevel: 5,  costFor: lvl => (lvl + 1) * 3 },
    { id: 'critChance',        name: 'Precisão',          icon: '🎯', desc: '+2% de chance de clique crítico',      maxLevel: 5,  costFor: lvl => (lvl + 1) * 4 },
    { id: 'goldenLuck',        name: 'Sorte Dourada',     icon: '🍀', desc: 'Eventos dourados 15% mais frequentes', maxLevel: 4,  costFor: lvl => (lvl + 1) * 4 },
    { id: 'offlineEfficiency', name: 'Piloto Automático', icon: '🌙', desc: '+10% de eficiência offline (base 50%)', maxLevel: 5, costFor: lvl => (lvl + 1) * 4 },
    { id: 'prestigeBoost',     name: 'Legado',            icon: '💎', desc: '+5% de pontos de prestígio ganhos',    maxLevel: 5,  costFor: lvl => (lvl + 1) * 6 }
];

// ============ UPGRADES DE RUN (pagos com dinheiro, resetam no prestígio) ============
// A camada de escolha do jogo: cada run constrói um "build" diferente.
// `req(state)` recebe o estado — nada aqui depende de variável global.
export const MONEY_UPGRADES = [
    // Impulso por negócio: ×2 na renda daquele negócio
    ...upgrades.map((u, i) => ({
        id: `biz${i}_a`, name: `${u.name} Turbinado`, icon: u.icon, cat: 'Negócios',
        desc: `×2 na renda de ${u.name}`, cost: u.baseCost * 400,
        req: () => upgrades[i].owned >= 10, reqText: `Tenha 10 × ${u.name}`,
        effect: { type: 'bizMult', idx: i, value: 2 }
    })),
    ...upgrades.map((u, i) => ({
        id: `biz${i}_b`, name: `${u.name} Industrial`, icon: u.icon, cat: 'Negócios',
        desc: `×2 adicional na renda de ${u.name}`, cost: u.baseCost * 4000,
        req: () => upgrades[i].owned >= 25, reqText: `Tenha 25 × ${u.name}`,
        effect: { type: 'bizMult', idx: i, value: 2 }
    })),

    // Cliques
    { id: 'click_a', name: 'Mouse Ergonômico', icon: '🖱️', cat: 'Cliques', desc: '×2 no valor do clique',
      cost: 2000, req: s => s.clickCount >= 25, reqText: 'Dê 25 cliques', effect: { type: 'clickMult', value: 2 } },
    { id: 'click_b', name: 'Dedos de Aço', icon: '✊', cat: 'Cliques', desc: '×2.5 adicional no clique',
      cost: 150000, req: s => s.clickCount >= 200, reqText: 'Dê 200 cliques', effect: { type: 'clickMult', value: 2.5 } },
    { id: 'click_c', name: 'Interface Neural', icon: '🧠', cat: 'Cliques', desc: '×3 adicional no clique',
      cost: 8000000, req: s => s.clickCount >= 600, reqText: 'Dê 600 cliques', effect: { type: 'clickMult', value: 3 } },
    { id: 'crit_a', name: 'Sorte do Iniciante', icon: '🍀', cat: 'Cliques', desc: '+8% de chance de crítico',
      cost: 60000, req: s => s.clickCount >= 100, reqText: 'Dê 100 cliques', effect: { type: 'critChanceAdd', value: 0.08 } },
    { id: 'crit_b', name: 'Golpe Certeiro', icon: '💥', cat: 'Cliques', desc: '×2 no dano do crítico (×15 → ×30)',
      cost: 1200000, req: s => s.maxCombo >= 25, reqText: 'Alcance combo ×25', effect: { type: 'critMult', value: 2 } },

    // Sinergias — recompensam composições específicas. O `cap` é obrigatório:
    // sem teto o bônus cresce junto com a contagem de negócios e retroalimenta.
    { id: 'syn_a', name: 'Incubadora', icon: '🧪', cat: 'Sinergias', desc: 'Cada 10 Freelancers: +2% de renda global (máx +100%)',
      cost: 250000, req: () => upgrades[0].owned >= 30, reqText: 'Tenha 30 × Freelancer',
      effect: { type: 'synergy', source: 0, per: 10, value: 0.02, cap: 1.0 } },
    { id: 'syn_b', name: 'Sinergia Corporativa', icon: '🔗', cat: 'Sinergias', desc: 'Cada Corporação: +2% de renda global (máx +150%)',
      cost: 3000000, req: () => upgrades[2].owned >= 15, reqText: 'Tenha 15 × Corporação',
      effect: { type: 'synergy', source: 2, per: 1, value: 0.02, cap: 1.5 } },
    { id: 'syn_c', name: 'Ecossistema Global', icon: '🌐', cat: 'Sinergias', desc: 'Cada Império Global: +5% de renda global (máx +250%)',
      cost: 400000000, req: () => upgrades[6].owned >= 5, reqText: 'Tenha 5 × Império Global',
      effect: { type: 'synergy', source: 6, per: 1, value: 0.05, cap: 2.5 } },

    // Globais
    { id: 'glob_a', name: 'Consultoria Estratégica', icon: '📊', cat: 'Global', desc: '×1.5 na renda global',
      cost: 1000000, req: s => s.totalEarned >= 500000, reqText: 'Ganhe $500k na run', effect: { type: 'globalMult', value: 1.5 } },
    { id: 'glob_b', name: 'Monopólio', icon: '🎩', cat: 'Global', desc: '×2 na renda global',
      cost: 80000000, req: s => s.totalEarned >= 40000000, reqText: 'Ganhe $40M na run', effect: { type: 'globalMult', value: 2 } },
    { id: 'glob_c', name: 'Cartel Interplanetário', icon: '🪐', cat: 'Global', desc: '×3 na renda global',
      cost: 5000000000, req: s => s.totalEarned >= 2000000000, reqText: 'Ganhe $2B na run', effect: { type: 'globalMult', value: 3 } },

    // Utilidades — mudam como você joga
    { id: 'util_golden', name: 'Olho de Ouro', icon: '👁️', cat: 'Utilidades', desc: 'Eventos dourados 40% mais frequentes',
      cost: 400000, req: s => s.totalEarned >= 200000, reqText: 'Ganhe $200k na run', effect: { type: 'goldenRate', value: 0.6 } },
    { id: 'util_euphoria', name: 'Euforia', icon: '🎉', cat: 'Utilidades', desc: 'Buff dourado dura 40s (em vez de 20s)',
      cost: 4000000, req: s => s.totalEarned >= 2000000, reqText: 'Ganhe $2M na run', effect: { type: 'goldenDuration', value: 40000 } },
    { id: 'util_fever', name: 'Modo Febre', icon: '🔥', cat: 'Utilidades', desc: 'Combo ≥50 dobra TODA a renda enquanto sustentado',
      cost: 12000000, req: s => s.maxCombo >= 50, reqText: 'Alcance combo ×50', effect: { type: 'fever' } },
    { id: 'util_agile', name: 'Gerentes Ágeis', icon: '⚙️', cat: 'Utilidades', desc: 'Automação compra 4× mais rápido',
      cost: 2500000, req: () => upgrades.filter(u => u.manager).length >= 3, reqText: 'Contrate 3 Gerentes', effect: { type: 'aiSpeed', value: 4 } }
];

export const MONEY_UPGRADES_BY_ID = Object.fromEntries(MONEY_UPGRADES.map(u => [u.id, u]));

// ============ CONQUISTAS ============
export const ACHIEVEMENTS = [
    { id: 'first_click',  icon: '🖱️', name: 'Primeiro Clique',    desc: 'Clique uma vez',                     check: s => s.clickCount >= 1 },
    { id: 'click_100',    icon: '👆', name: 'Dedo Rápido',        desc: '100 cliques',                        check: s => s.clickCount >= 100 },
    { id: 'click_1000',   icon: '⚡', name: 'Clicador Veterano',  desc: '1.000 cliques',                      check: s => s.clickCount >= 1000 },
    { id: 'combo_10',     icon: '🔥', name: 'Combo Quente',       desc: 'Combo ×10',                          check: s => s.maxCombo >= 10 },
    { id: 'earn_1k',      icon: '💵', name: 'Primeiro Milhar',    desc: 'Ganhe $1.000 no total',              check: s => s.totalEarned >= 1000 },
    { id: 'earn_1m',      icon: '💰', name: 'Milionário',         desc: 'Ganhe $1M no total',                 check: s => s.totalEarned >= 1e6 },
    { id: 'earn_1b',      icon: '🏦', name: 'Bilionário',         desc: 'Ganhe $1B no total',                 check: s => s.totalEarned >= 1e9 },
    { id: 'business_10',  icon: '🏢', name: 'Pequeno Império',    desc: '10 negócios comprados',              check: () => totalOwned() >= 10 },
    { id: 'business_50',  icon: '🌆', name: 'Grande Império',     desc: '50 negócios comprados',              check: () => totalOwned() >= 50 },
    { id: 'all_types',    icon: '🧩', name: 'Diversificado',      desc: 'Possua ao menos 1 de cada negócio',  check: () => upgrades.every(u => u.owned >= 1) },
    { id: 'prestige_1',   icon: '⭐', name: 'Renascido',          desc: 'Alcance o Prestígio 1',              check: s => s.prestigeLevel >= 1 },
    { id: 'prestige_5',   icon: '🌟', name: 'Meio Caminho',       desc: 'Alcance o Prestígio 5',              check: s => s.prestigeLevel >= 5 },
    { id: 'prestige_max', icon: '👑', name: 'Lenda',              desc: 'Alcance o Prestígio 10',             check: s => s.prestigeLevel >= 10 }
];

export function totalOwned() {
    let total = 0;
    for (const u of upgrades) total += u.owned;
    return total;
}
