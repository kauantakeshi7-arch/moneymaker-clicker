// Bateria de regressão.
//
// Cobre as regras onde um erro é caro e silencioso: economia, persistência e
// formatação. Cada caso aqui nasceu de um bug real que passou despercebido.
// Rode abrindo tests/index.html no servidor local.

import {
    upgrades, MONEY_UPGRADES, COST_GROWTH, MILESTONE_TIERS,
    defaultPrestigeShopLevels, getPrestigeCostForLevel, getPrestigeMultiplierForLevel,
    COMBO_TIMEOUT_MS, totalOwned
} from '../js/config.js';
import { gameState } from '../js/state.js';
import { formatNumber, setNotationMode } from '../js/utils.js';
import {
    addMoney, getRawDPS, getClickValue, getUpgradeCost, getUpgradeIncome,
    getBulkCost, getMaxAffordable, getBestBuyIndex, isBusinessUnlocked,
    getEffectiveMultiplier, getSynergyMultiplier, isFeverActive,
    pendingPrestigePoints, prestige, applyOfflineProgress,
    getUpgradeMilestoneMult, getCritChance, getManagerCost, runAI
} from '../js/economy.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(cond, msg, detail) {
    if (!cond) throw new Error(msg + (detail !== undefined ? ` (${JSON.stringify(detail)})` : ''));
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/** Zera tudo: cada teste começa de um estado conhecido. */
function reset() {
    gameState.money = 0;
    gameState.totalEarned = 0;
    gameState.runEarned = 0;
    gameState.prestigeLevel = 0;
    gameState.prestigePoints = 0;
    gameState.lifetimePrestigePoints = 0;
    gameState.combo = 1;
    gameState.maxCombo = 1;
    gameState.clickCount = 0;
    gameState.lastComboMilestone = 0;
    gameState.runUpgrades = [];
    gameState.unlockedAchievements = [];
    gameState.prestigeShopLevels = defaultPrestigeShopLevels();
    gameState.tempBoostExpiry = 0;
    upgrades.forEach(u => { u.owned = 0; u.manager = false; });
}

// ===== RENDA =====

test('renda fracionária acumula em vez de ser arredondada para zero', () => {
    // Regressão: Math.floor por tick zerava tudo abaixo de 10/s, e o começo
    // do jogo não rendia absolutamente nada.
    reset();
    upgrades[0].owned = 1;
    for (let i = 0; i < 100; i++) addMoney(getRawDPS() * 0.1);
    assert(close(gameState.money, 2.5, 0.01), 'esperado 2.5 em 10s', gameState.money);
});

test('combo multiplica clique mas nunca a renda passiva', () => {
    // Regressão: um auto-clicker mantendo combo alto multiplicava a economia
    // inteira por até 999.
    reset();
    gameState.combo = 500;
    addMoney(100);
    assert(close(gameState.money, 100), 'passiva não deve levar combo', gameState.money);

    reset();
    gameState.combo = 10;
    addMoney(10, true);
    assert(gameState.money > 10, 'clique deve levar combo', gameState.money);
});

test('clique vale uma fração da renda passiva', () => {
    reset();
    assert(getClickValue() === 1, 'piso de 1 sem renda', getClickValue());
    upgrades[0].owned = 400;
    assert(getClickValue() > 1, 'deve escalar com o DPS', getClickValue());
});

// ===== CUSTOS =====

test('custo em lote é a soma das compras uma a uma', () => {
    reset();
    let manual = 0;
    for (let n = 0; n < 10; n++) manual += upgrades[0].baseCost * Math.pow(COST_GROWTH, n);
    assert(close(getBulkCost(0, 10), manual), 'série geométrica divergiu', [getBulkCost(0, 10), manual]);
    assert(getBulkCost(0, 0) === 0, 'lote zero custa zero');
});

test('MAX compra o máximo sem estourar o saldo', () => {
    reset();
    gameState.money = 1000;
    const q = getMaxAffordable(0);
    assert(getBulkCost(0, q) <= 1000, 'estourou o saldo', getBulkCost(0, q));
    assert(getBulkCost(0, q + 1) > 1000, 'poderia comprar mais', q);
});

test('custo cresce mais rápido que os multiplicadores de renda', () => {
    // A lei que evita a impressora de dinheiro: payback tem que subir.
    reset();
    const paybackInicial = getUpgradeCost(0) / getUpgradeIncome(0);
    upgrades[0].owned = 60;
    const paybackDepois = getUpgradeCost(0) / getUpgradeIncome(0);
    assert(paybackDepois > paybackInicial, 'payback deveria piorar com a escala',
        [paybackInicial, paybackDepois]);
    assert(paybackInicial > 1, 'payback base precisa ficar bem acima de 1s', paybackInicial);
});

// ===== MULTIPLICADORES =====

test('marcos de negócio respeitam os patamares da tabela', () => {
    reset();
    assert(getUpgradeMilestoneMult(0) === 1, 'sem marco no início');
    for (const [threshold, mult] of [...MILESTONE_TIERS].reverse()) {
        upgrades[0].owned = threshold;
        assert(getUpgradeMilestoneMult(0) === mult, `marco de ${threshold}`, getUpgradeMilestoneMult(0));
    }
});

test('sinergia é limitada pelo teto', () => {
    // Regressão: sem teto o bônus crescia com a contagem e retroalimentava.
    reset();
    gameState.runUpgrades = ['syn_b'];
    upgrades[2].owned = 100000;
    assert(close(getSynergyMultiplier(), 2.5), 'deveria parar no cap', getSynergyMultiplier());
});

test('modo febre exige o upgrade e o combo', () => {
    reset();
    gameState.combo = 99;
    assert(!isFeverActive(), 'não pode ativar sem o upgrade');
    gameState.runUpgrades = ['util_fever'];
    gameState.combo = 49;
    assert(!isFeverActive(), 'não pode ativar abaixo do limiar');
    gameState.combo = 50;
    assert(isFeverActive(), 'deveria ativar em 50');
});

test('nenhum cálculo central produz NaN ou Infinity', () => {
    reset();
    gameState.money = 1e250;
    gameState.totalEarned = 1e250;
    upgrades.forEach(u => u.owned = 500);
    const valores = {
        dps: getRawDPS(), clique: getClickValue(), mult: getEffectiveMultiplier(),
        custo: getUpgradeCost(6), lote: getBulkCost(6, 25), max: getMaxAffordable(0),
        pontos: pendingPrestigePoints(), crit: getCritChance(), gerente: getManagerCost(3)
    };
    for (const [k, v] of Object.entries(valores)) {
        assert(Number.isFinite(v), `${k} não é finito`, v);
    }
});

// ===== PROGRESSÃO =====

test('negócios desbloqueiam em cascata', () => {
    reset();
    assert(isBusinessUnlocked(0), 'o primeiro começa aberto');
    assert(!isBusinessUnlocked(1), 'o segundo começa fechado');
    upgrades[0].owned = 5;
    assert(isBusinessUnlocked(1), 'cinco do anterior deveria abrir');
    assert(!isBusinessUnlocked(2), 'não deve abrir dois de uma vez');
});

test('melhor compra ignora negócios bloqueados', () => {
    reset();
    upgrades.forEach(u => u.owned = 0);
    assert(getBestBuyIndex() === 0, 'só o primeiro está disponível', getBestBuyIndex());
});

test('pontos de prestígio crescem em escala logarítmica', () => {
    reset();
    const pontos = t => { gameState.totalEarned = t; return pendingPrestigePoints(); };
    assert(pontos(1e5) === 0, 'abaixo do mínimo não rende', pontos(1e5));
    assert(pontos(1e9) === 24, '1000× acima do mínimo = 24', pontos(1e9));
    assert(pontos(1e12) === 48, 'cada 1000× soma 24', pontos(1e12));
});

test('prestígio zera a run e credita as recompensas da loja', () => {
    reset();
    gameState.totalEarned = 5e9;
    gameState.runEarned = 5e9;
    gameState.money = 1e6;
    gameState.runUpgrades = ['biz0_a'];
    gameState.prestigeShopLevels.startingCash = 3;
    gameState.prestigeShopLevels.freeManagers = 2;
    upgrades.forEach(u => u.owned = 20);

    let callbackChamado = false;
    const ok = prestige(() => { callbackChamado = true; });

    assert(ok, 'deveria ter prestigiado');
    assert(callbackChamado, 'callback de UI não foi chamado');
    assert(gameState.prestigeLevel === 1, 'nível não subiu', gameState.prestigeLevel);
    assert(gameState.prestigePoints === 29, 'pontos errados', gameState.prestigePoints);
    assert(gameState.runEarned === 0, 'runEarned deveria zerar no prestígio');
    assert(upgrades.every(u => u.owned === 0), 'negócios deveriam zerar');
    assert(gameState.runUpgrades.length === 0, 'upgrades de run deveriam zerar');
    assert(gameState.money === 100000, 'capital inicial não aplicado', gameState.money);
    assert(upgrades[0].manager && upgrades[1].manager && !upgrades[2].manager,
        'gerentes grátis errados', upgrades.map(u => u.manager));
});

test('prestígio é bloqueado abaixo do custo da run atual', () => {
    reset();
    gameState.totalEarned = 1e10; // ganho vitalício alto
    gameState.runEarned = 1000;   // mas a run atual começou agora
    assert(prestige(() => {}) === false, 'não deveria prestigiar sem cumprir o custo na run');
    assert(gameState.prestigeLevel === 0, 'nível mudou mesmo bloqueado');
});

test('custo de prestígio e multiplicador não estouram para Infinity no nível 600', () => {
    const cost = getPrestigeCostForLevel(600);
    const mult = getPrestigeMultiplierForLevel(600);
    assert(Number.isFinite(cost), 'custo deve ser finito', cost);
    assert(Number.isFinite(mult), 'mult deve ser finito', mult);
});

test('autobuyer da IA nunca compra negócio bloqueado', () => {
    reset();
    upgrades[1].manager = true; // gerente do negócio 1 ativo (ex: por prestige shop)
    upgrades[0].owned = 0;       // negócio 0 com 0 unidades (negócio 1 está BLOQUEADO)
    gameState.money = 1e6;       // dinheiro de sobra
    runAI();
    assert(upgrades[1].owned === 0, 'IA comprou negócio bloqueado', upgrades[1].owned);
});

test('custo de prestígio usa o próximo nível, não o atual', () => {
    // Regressão: o primeiro prestígio saía de graça por erro de índice.
    assert(getPrestigeCostForLevel(1) === 1e6, 'primeiro prestígio deveria custar 1M',
        getPrestigeCostForLevel(1));
    assert(getPrestigeCostForLevel(0) === 0, 'nível zero é a base');
});

// ===== UPGRADES DE RUN =====

test('requisitos de upgrade recebem o estado por parâmetro', () => {
    reset();
    const click = MONEY_UPGRADES.find(u => u.id === 'click_a');
    gameState.clickCount = 5;
    assert(click.req(gameState) === false, 'não deveria liberar com 5 cliques');
    gameState.clickCount = 30;
    assert(click.req(gameState) === true, 'deveria liberar com 30 cliques');
});

test('upgrade de negócio multiplica só o próprio tier', () => {
    reset();
    upgrades[0].owned = 10;
    upgrades[1].owned = 10;
    const antes0 = getUpgradeIncome(0), antes1 = getUpgradeIncome(1);
    gameState.runUpgrades = ['biz0_a'];
    assert(close(getUpgradeIncome(0), antes0 * 2), 'tier alvo deveria dobrar');
    assert(close(getUpgradeIncome(1), antes1), 'outro tier não pode mudar');
});

// ===== PERSISTÊNCIA =====

test('save e load preservam o estado, inclusive frações', () => {
    reset();
    gameState.money = 1234.56;
    gameState.prestigePoints = 9;
    gameState.maxCombo = 42;
    gameState.runUpgrades = ['click_a'];
    upgrades[1].owned = 7;
    upgrades[1].manager = true;
    gameState.save();

    reset();
    const ts = gameState.load();

    assert(close(gameState.money, 1234.56, 0.01), 'dinheiro perdeu precisão', gameState.money);
    assert(gameState.prestigePoints === 9, 'pontos não voltaram');
    assert(gameState.maxCombo === 42, 'maxCombo não voltou', gameState.maxCombo);
    assert(gameState.runUpgrades[0] === 'click_a', 'upgrades de run não voltaram');
    assert(upgrades[1].owned === 7 && upgrades[1].manager, 'negócios não voltaram');
    assert(typeof ts === 'number', 'load deveria devolver o instante do save', ts);
});

test('save em formato antigo (só quantidades) ainda carrega', () => {
    reset();
    localStorage.setItem('mm_save_v15', JSON.stringify({
        money: 500, totalEarned: 800, prestigeLevel: 1, upgrades: [5, 3, 0, 0, 0, 0, 0]
    }));
    gameState.load();
    assert(upgrades[0].owned === 5 && upgrades[1].owned === 3, 'formato legado quebrou',
        upgrades.map(u => u.owned));
});

test('import rejeita save malformado', () => {
    assert(!gameState.isValidSaveShape({ money: 'muito' }), 'aceitou string em campo numérico');
    assert(!gameState.isValidSaveShape({ upgrades: 'x' }), 'aceitou upgrades não-array');
    assert(!gameState.isValidSaveShape(null), 'aceitou nulo');
    assert(gameState.isValidSaveShape({ money: 1, upgrades: [] }), 'rejeitou save válido');
});

test('progresso offline respeita o teto e a eficiência', () => {
    reset();
    upgrades[0].owned = 100;
    const semTempo = applyOfflineProgress(null);
    assert(semTempo.earnings === 0, 'sem timestamp não credita');

    reset();
    upgrades[0].owned = 100;
    const umaHora = applyOfflineProgress(Date.now() - 3600 * 1000);
    const esperado = getRawDPS() * getEffectiveMultiplier() * 3600 * 0.5;
    assert(close(umaHora.earnings, esperado, esperado * 0.02), 'eficiência base deveria ser 50%',
        [umaHora.earnings, esperado]);

    reset();
    upgrades[0].owned = 100;
    const muitoTempo = applyOfflineProgress(Date.now() - 48 * 3600 * 1000);
    assert(muitoTempo.seconds <= 8 * 3600 + 1, 'deveria limitar em 8h', muitoTempo.seconds);
});

// ===== FORMATAÇÃO =====

test('formatação mostra decimais em valores pequenos', () => {
    // Regressão: 0,25/s aparecia como "$0" e o início parecia quebrado.
    assert(formatNumber(0.25) === '$0.25', 'fração virou zero', formatNumber(0.25));
    assert(formatNumber(12.5) === '$12.5', formatNumber(12.5));
    assert(formatNumber(0) === '$0', formatNumber(0));
});

test('formatação sobe de casa no arredondamento', () => {
    // Regressão: 999.999.999 virava "$1000.00M" em vez de "$1.00B".
    assert(formatNumber(999999999) === '$1.00B', formatNumber(999999999));
    assert(formatNumber(999999) === '$1.00M', formatNumber(999999));
    assert(formatNumber(1e18) === '$1.00Qi', formatNumber(1e18));
});

test('formatação aguenta valores absurdos e inválidos', () => {
    assert(formatNumber(NaN) === '$0', 'NaN deveria virar $0');
    assert(formatNumber(-5) === '$0', 'negativo deveria virar $0');
    assert(formatNumber(1e60).startsWith('$'), 'não pode quebrar em valores enormes');
});

test('contagem total de negócios bate com a soma', () => {
    reset();
    upgrades[0].owned = 3;
    upgrades[3].owned = 4;
    assert(totalOwned() === 7, 'soma errada', totalOwned());
});

test('modo de notação científica altera a exibição de grandes valores', () => {
    setNotationMode('scientific');
    assert(formatNumber(1500000) === '$1.50e+6', 'notação científica falhou: ' + formatNumber(1500000));
    setNotationMode('standard');
    assert(formatNumber(1500000) === '$1.50M', 'retorno ao padrão falhou: ' + formatNumber(1500000));
});

test('modo febre só ativa se o upgrade estiver comprado e combo >= 50', () => {
    reset();
    gameState.combo = 50;
    assert(!isFeverActive(), 'modo febre não pode ativar sem o upgrade');
    gameState.runUpgrades.push('util_fever');
    assert(isFeverActive(), 'modo febre deve ativar com upgrade e combo 50');
    gameState.combo = 49;
    assert(!isFeverActive(), 'modo febre deve desativar abaixo de 50');
});

/** Roda tudo e devolve o relatório. */
export function runSuite() {
    const results = [];
    const saved = localStorage.getItem('mm_save_v15');

    for (const { name, fn } of tests) {
        try {
            fn();
            results.push({ name, ok: true });
        } catch (e) {
            results.push({ name, ok: false, error: e.message });
        }
    }

    reset();
    if (saved) {
        localStorage.setItem('mm_save_v15', saved);
        gameState.load();
    } else {
        localStorage.removeItem('mm_save_v15');
    }

    return { total: results.length, failed: results.filter(r => !r.ok).length, results };
}
