// Regras do jogo: custos, renda, compras, prestígio, automação e eventos.

// ============ EVENTOS ALEATÓRIOS ============
let goldenEventTimer = 0;
let nextGoldenEventAt = 40000 + Math.random() * 40000;

function spawnGoldenEvent() {
    if (document.querySelector('.modal.active')) return;
    const el = document.createElement('div');
    el.className = 'golden-event';
    el.textContent = '💰';
    document.body.appendChild(el);
    // offsetWidth e não getBoundingClientRect: a animação de entrada começa em scale(0),
    // então o rect mediria 0 e o cálculo de limites usaria um tamanho errado.
    const size = el.offsetWidth || 54;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - size - margin);
    const minTop = 90; // abaixo do cabeçalho
    const maxTop = Math.max(minTop, window.innerHeight - size - margin);
    el.style.left = (margin + Math.random() * (maxLeft - margin)) + 'px';
    el.style.top = (minTop + Math.random() * (maxTop - minTop)) + 'px';
    const timeout = setTimeout(() => el.remove(), 8000);
    el.addEventListener('click', () => {
        clearTimeout(timeout);
        el.remove();
        const isBuff = Math.random() < 0.5;
        if (isBuff) {
            const duration = getRunEffectValue('goldenDuration', 20000);
            gameState.tempBoostMult = 3;
            gameState.tempBoostExpiry = Date.now() + duration;
            showNotification(`Renda ×3 por ${Math.round(duration / 1000)}s!`, '⚡', 3000);
        } else {
            const bonus = Math.max(50, getRawDPS() * gameState.getEffectiveMultiplier() * 60);
            gameState.money = Math.min(gameState.money + bonus, MONEY_CAP);
            gameState.totalEarned += bonus;
            showNotification(`Bônus de ${formatNumber(bonus)}!`, '💰', 3000);
        }
        spawnConfetti();
        playSound(2200, 200);
    });
}

// ============ LÓGICA DE JOGO (v17) ============
// Lei de balanceamento: o custo precisa crescer mais rápido que os multiplicadores de renda.
// Com 1.07 o payback caía para <1s com upgrades ativos (impressora de dinheiro → explosão).
// Com 1.15 (padrão do gênero) cada tier rende ~20 unidades baratas e então se auto-corrige.
const COST_GROWTH = 1.15;

function getUpgradeCost(idx) {
    // leve scaling por unidade (força diversificação entre tiers)
    const u = upgrades[idx];
    return u.baseCost * Math.pow(COST_GROWTH, u.owned);
}

// Custo total de comprar `qty` unidades de uma vez (série geométrica)
function getBulkCost(idx, qty) {
    if (qty <= 0) return 0;
    const u = upgrades[idx];
    const first = u.baseCost * Math.pow(COST_GROWTH, u.owned);
    return first * (Math.pow(COST_GROWTH, qty) - 1) / (COST_GROWTH - 1);
}

// Quantas unidades o dinheiro atual compra (inverso da série geométrica)
function getMaxAffordable(idx, budget = gameState.money) {
    const u = upgrades[idx];
    const first = u.baseCost * Math.pow(COST_GROWTH, u.owned);
    if (budget < first) return 0;
    const n = Math.log(1 + (budget * (COST_GROWTH - 1)) / first) / Math.log(COST_GROWTH);
    return Math.max(0, Math.floor(n + 1e-9));
}

// Quantidade efetiva para o modo de compra atual (bulkMode: 1, 10, 25 ou 'max')
function getBuyQuantity(idx) {
    if (bulkMode === 'max') return getMaxAffordable(idx);
    return bulkMode;
}

// Desbloqueio progressivo: cada negócio aparece após 5 unidades do anterior
function isBusinessUnlocked(idx) {
    if (idx === 0) return true;
    if (upgrades[idx].owned > 0) return true;
    return upgrades[idx - 1].owned >= 5;
}

// marcos fixos e limitados (evita crescimento duplamente exponencial)
const MILESTONE_TIERS = [[50, 4], [25, 2.5], [10, 2]];
function getUpgradeMilestoneMult(idx) {
    const owned = upgrades[idx].owned;
    for (const [threshold, mult] of MILESTONE_TIERS) {
        if (owned >= threshold) return mult;
    }
    return 1;
}

// Multiplicador daquele negócio: marcos automáticos × upgrades comprados
function getBusinessUpgradeMult(idx) {
    let mult = 1;
    for (const id of gameState.runUpgrades) {
        const up = MONEY_UPGRADES_BY_ID[id];
        if (up && up.effect.type === 'bizMult' && up.effect.idx === idx) mult *= up.effect.value;
    }
    return mult;
}

function getUpgradeIncome(idx) {
    return upgrades[idx].baseIncome * getUpgradeMilestoneMult(idx) * getBusinessUpgradeMult(idx);
}

function getRawDPS() {
    return upgrades.reduce((a, u, i) => a + getUpgradeIncome(i) * u.owned, 0);
}

// Valor bruto de um clique: % da renda passiva, então nunca fica obsoleto
function getClickValue() {
    return Math.max(1, getRawDPS() * gameState.clickPercent);
}

function getManagerCost(idx) {
    const discount = 1 - (gameState.prestigeShopLevels.cheapManagers * 0.1);
    return upgrades[idx].baseCost * 50 * Math.max(0.5, discount);
}

// Qual negócio dá mais renda por dólar investido agora (ajuda a decisão do jogador)
function getBestBuyIndex() {
    let best = -1, bestRoi = 0;
    for (let i = 0; i < upgrades.length; i++) {
        if (!isBusinessUnlocked(i)) continue;
        const roi = getUpgradeIncome(i) / getUpgradeCost(i);
        if (Number.isFinite(roi) && roi > bestRoi) { bestRoi = roi; best = i; }
    }
    return best;
}

const COMBO_MILESTONES = [10, 25, 50, 100];

function addMoney(amount, isClick = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    const mult = gameState.getEffectiveMultiplier();
    const comboBonus = isClick ? gameState.combo : 1;
    // sem Math.floor: arredondar aqui zerava toda renda fracionária do início de jogo
    const total = amount * mult * comboBonus;

    if (!Number.isFinite(total) || total < 0) return;

    gameState.money = Math.min(gameState.money + total, MONEY_CAP);
    gameState.totalEarned += total;

    if (isClick) {
        gameState.clickCount++;
        const now = Date.now();
        if (now - gameState.lastClickTime < 300) {
            gameState.combo = Math.min(gameState.combo + 1, 999);
            gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
        } else {
            gameState.combo = 1;
            gameState.lastComboMilestone = 0;
        }
        gameState.lastClickTime = now;

        COMBO_MILESTONES.forEach(m => {
            if (gameState.combo === m && gameState.lastComboMilestone < m) {
                gameState.lastComboMilestone = m;
                const bonus = Math.max(10, getRawDPS() * mult * 5);
                gameState.money = Math.min(gameState.money + bonus, MONEY_CAP);
                gameState.totalEarned += bonus;
                const feverMsg = (m >= FEVER_COMBO_THRESHOLD && hasRunEffect('fever')) ? ' MODO FEBRE ATIVO!' : '';
                showNotification(`Combo ×${m}! Bônus de ${formatNumber(bonus)}!${feverMsg}`, '🔥', 3000);
                spawnConfetti();
            }
        });
    }
}

function prestige() {
    gameState.validate();

    const cost = getPrestigeCostForLevel(gameState.prestigeLevel + 1);

    if (gameState.totalEarned < cost) {
        showNotification(`Faltam ${formatNumber(cost - gameState.totalEarned)}`, '🌙');
        return;
    }

    const gained = pendingPrestigePoints();

    gameState.prestigeLevel++;
    gameState.prestigePoints += gained;
    gameState.lifetimePrestigePoints += gained;
    gameState.clickCount = 0;
    gameState.combo = 1;
    gameState.lastComboMilestone = 0;
    gameState.runUpgrades = [];   // upgrades de dinheiro são por run
    gameState.tempBoostExpiry = 0;
    upgrades.forEach(u => { u.owned = 0; u.manager = false; });

    // Capital inicial e equipe fixa: recompensas da loja que aceleram a próxima run
    const shop = gameState.prestigeShopLevels;
    const startCashItem = PRESTIGE_SHOP.find(i => i.id === 'startingCash');
    gameState.money = startCashItem ? startCashItem.valueFor(shop.startingCash) : 0;
    for (let i = 0; i < shop.freeManagers && i < upgrades.length; i++) upgrades[i].manager = true;

    createUpgradeButtons();
    showNotification(`Prestígio #${gameState.prestigeLevel}! ×${gameState.getEffectiveMultiplier().toFixed(2)} | +${gained} ponto${gained === 1 ? '' : 's'}`, '⭐', 4000);
    spawnConfetti();
    playSound(2000, 200);
}

function runAI() {
    if (!document.getElementById('aiToggle').checked) return;

    const attempts = 3 * getRunEffectValue('aiSpeed', 1);

    for (let attempt = 0; attempt < attempts; attempt++) {
        let bestIdx = -1, bestRoi = 0;

        for (let i = 0; i < upgrades.length; i++) {
            if (!upgrades[i].manager) continue;
            const cost = getUpgradeCost(i);
            const income = getUpgradeIncome(i);
            if (gameState.money >= cost) {
                const roi = income / cost;
                if (Number.isFinite(roi) && roi > bestRoi) {
                    bestRoi = roi;
                    bestIdx = i;
                }
            }
        }

        if (bestIdx < 0) break;

        // mantém 20% de reserva para o jogador poder comprar upgrades/gerentes manualmente
        const cost = getUpgradeCost(bestIdx);
        if (gameState.money - cost < gameState.money * 0.20) break;

        gameState.money -= cost;
        upgrades[bestIdx].owned++;
    }
}

function updateDisplay() {
    gameState.validate();

    if (gameState.combo > 1 && Date.now() - gameState.lastClickTime > 1000) {
        gameState.combo = 1;
    }

    const mult = gameState.getEffectiveMultiplier();
    
    document.getElementById('moneyDisplay').textContent = formatNumber(gameState.money);
    document.getElementById('totalEarned').textContent = formatNumber(gameState.totalEarned);
    document.getElementById('clickCount').textContent = gameState.clickCount;
    document.getElementById('comboDisplay').textContent = gameState.combo;
    document.getElementById('comboValue').textContent = `×${Math.floor(gameState.combo)}`;
    const comboClass = gameState.combo >= 15 ? 'combo-hot' : gameState.combo >= 5 ? 'combo-mid' : '';
    ['comboDisplay', 'comboValue'].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove('combo-mid', 'combo-hot');
        if (comboClass) el.classList.add(comboClass);
    });
    document.getElementById('multValue').textContent = mult.toFixed(2) + 'x';
    document.getElementById('businessCount').textContent = upgrades.reduce((a, b) => a + b.owned, 0);
    document.getElementById('prestigeDisplay').textContent = `${gameState.prestigeLevel}`;

    const rawDps = getRawDPS();
    let dps = rawDps * mult;
    document.getElementById('mpsDisplay').textContent = '+' + formatNumber(dps) + '/s';

    const progressFill = document.getElementById('prestigeProgressFill');
    const progressLabel = document.getElementById('prestigeProgressLabel');
    const nextCost = getPrestigeCostForLevel(gameState.prestigeLevel + 1);
    document.getElementById('nextPrestigeCost').textContent = formatNumber(nextCost);
    const pct = Math.min(100, (gameState.totalEarned / nextCost) * 100);
    progressFill.style.width = pct.toFixed(1) + '%';
    const pending = pendingPrestigePoints();
    progressLabel.innerHTML = `${formatNumber(gameState.totalEarned)} / ${formatNumber(nextCost)} (${pct.toFixed(1)}%)` +
        ` — prestigiar agora rende <span style="color: var(--gold); font-weight: bold;">${pending} 💎</span>`;

    if (dps > 0) {
        const remaining = Math.max(0, nextCost - gameState.totalEarned);
        const seconds = remaining / dps;
        let timeStr = '∞';
        if (seconds < 3600) timeStr = Math.ceil(seconds / 60) + 'm';
        else if (seconds < 86400) timeStr = Math.ceil(seconds / 3600) + 'h';
        else timeStr = Math.ceil(seconds / 86400) + 'd';
        document.getElementById('timeToPrestige').textContent = timeStr;
    }

    const btn = document.getElementById('prestigeBtn');
    const canPrestige = gameState.totalEarned >= nextCost;
    btn.textContent = canPrestige ? '⭐' : '🌙';
    btn.disabled = !canPrestige;
    btn.classList.toggle('ready', canPrestige);

    const bestIdx = getBestBuyIndex();
    upgrades.forEach((u, i) => {
        const card = document.getElementById(`upgrade-${i}`);
        if (!card) return;

        const unlocked = isBusinessUnlocked(i);
        card.classList.toggle('locked-biz', !unlocked);
        if (!unlocked) {
            card.classList.add('disabled');
            const lockEl = card.querySelector('.upgrade-lock');
            if (lockEl) lockEl.textContent = `Compre 5 × ${upgrades[i - 1].name}`;
            return;
        }

        const qty = Math.max(1, getBuyQuantity(i));
        const cost = getBulkCost(i, qty);
        card.classList.toggle('disabled', gameState.money < cost);
        card.classList.toggle('best-buy', i === bestIdx);

        const qtyEl = card.querySelector('.upgrade-qty');
        if (qtyEl) qtyEl.textContent = bulkMode === 'max' ? `×${qty}` : `×${bulkMode}`;

        const costEl = card.querySelector('.upgrade-cost');
        if (costEl) costEl.textContent = formatNumber(cost);

        const incomeEl = card.querySelector('.upgrade-income');
        const totalMult = getUpgradeMilestoneMult(i) * getBusinessUpgradeMult(i);
        if (incomeEl) incomeEl.textContent = `+${formatNumber(getUpgradeIncome(i))}/s${totalMult > 1 ? ' (×' + (+totalMult.toFixed(1)) + ')' : ''}`;

        let count = card.querySelector('.upgrade-count');
        if (u.owned > 0) {
            if (!count) {
                count = document.createElement('div');
                count.className = 'upgrade-count';
                card.appendChild(count);
            }
            count.textContent = u.owned;
        }
    });
    updateManagerButtons();

    // Badge da loja de upgrades: quantos estão comprávéis agora
    const affordableUpgrades = MONEY_UPGRADES.filter(up =>
        !gameState.hasUpgrade(up.id) && up.req() && gameState.money >= up.cost).length;
    const upBadge = document.getElementById('upgradeBadge');
    if (upBadge) {
        upBadge.style.display = affordableUpgrades > 0 ? 'flex' : 'none';
        upBadge.textContent = affordableUpgrades;
    }

    // Badge da loja de prestígio: pontos disponíveis para gastar
    const ppBadge = document.getElementById('prestigePointBadge');
    if (ppBadge) {
        ppBadge.style.display = gameState.prestigePoints > 0 ? 'flex' : 'none';
        ppBadge.textContent = gameState.prestigePoints;
    }

    updateChart();
}

function updateChart() {
    const val = Math.max(0, Math.floor(gameState.money));
    chartData.push(Number.isFinite(val) ? val : 0);
    chartData.shift();
    
    if (chart) {
        chart.data.datasets[0].data = chartData;
        chart.update('none');
    }
}

function initChart() {
    try {
        const ctx = document.getElementById('progressChart');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['-2s', '-1.5s', '-1s', '-0.5s', 'Agora'],
                datasets: [{
                    label: 'Dinheiro',
                    data: chartData,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { labels: { color: '#ffffff' } } },
                scales: {
                    y: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(0,212,255,0.1)' } },
                    x: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(0,212,255,0.1)' } }
                }
            }
        });
    } catch (e) {}
}

function toggleChart() {
    document.getElementById('chartContainer').classList.toggle('active');
}
