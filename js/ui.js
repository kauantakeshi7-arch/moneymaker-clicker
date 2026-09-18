// Renderização do DOM: cards, modais e lojas.

// ============ UI ============
let bulkMode = 1; // 1 | 10 | 25 | 'max'
let chart = null, chartData = [0, 0, 0, 0, 0];

// Referências de DOM resolvidas uma vez. O loop roda 10×/s: buscar os mesmos
// ~60 elementos por frame era puro desperdício.
const el = {};
const CACHED_IDS = ['moneyDisplay','totalEarned','clickCount','comboDisplay','comboValue','multValue',
    'businessCount','prestigeDisplay','mpsDisplay','nextPrestigeCost','timeToPrestige','prestigeBtn',
    'prestigeProgressFill','prestigeProgressLabel','upgradeBadge','prestigePointBadge','chartContainer',
    'upgradesContainer','achBadge','aiToggle','soundToggle'];

function cacheDomRefs() {
    for (const id of CACHED_IDS) el[id] = document.getElementById(id);
}

// Escreve só quando o valor muda: atribuir textContent igual ainda custa recálculo de estilo.
function setText(node, value) {
    if (node && node._last !== value) { node.textContent = value; node._last = value; }
}

function setHtml(node, value) {
    if (node && node._last !== value) { node.innerHTML = value; node._last = value; }
}

function setBulkMode(mode) {
    bulkMode = mode;
    document.querySelectorAll('.bulk-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === String(mode));
    });
    updateDisplay();
}

// Referências dos filhos de cada card, guardadas na criação
let cardRefs = [];

function createUpgradeButtons() {
    const container = el.upgradesContainer || document.getElementById('upgradesContainer');
    container.innerHTML = '';
    cardRefs = [];

    upgrades.forEach((u, i) => {
        const card = document.createElement('div');
        card.id = `upgrade-${i}`;
        card.className = 'upgrade-btn';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.innerHTML = `
            <div class="upgrade-qty"></div>
            <div class="upgrade-icon">${u.icon}</div>
            <div class="upgrade-name">${u.name}</div>
            <div class="upgrade-cost">${formatNumber(getUpgradeCost(i))}</div>
            <div class="upgrade-income">+${formatNumber(getUpgradeIncome(i))}/s</div>
            <div class="upgrade-count" style="display:none;"></div>
            <button class="manager-btn" title="Gerente automatiza a compra deste negócio"></button>
            <div class="upgrade-lock-overlay"><div>🔒</div><div class="upgrade-lock"></div></div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.manager-btn')) return;
            buyUpgrade(i, e);
        });
        container.appendChild(card);

        const refs = {
            card,
            qty: card.querySelector('.upgrade-qty'),
            cost: card.querySelector('.upgrade-cost'),
            income: card.querySelector('.upgrade-income'),
            count: card.querySelector('.upgrade-count'),
            lock: card.querySelector('.upgrade-lock'),
            manager: card.querySelector('.manager-btn')
        };
        cardRefs.push(refs);
        refs.manager.addEventListener('click', (e) => {
            e.stopPropagation();
            buyManager(i);
        });
    });
    updateManagerButtons();
}

function buyUpgrade(idx, e) {
    if (!isBusinessUnlocked(idx)) return;
    const card = e.target.closest('.upgrade-btn');

    const qty = Math.max(1, getBuyQuantity(idx));
    const cost = getBulkCost(idx, qty);
    if (gameState.money < cost) return;

    gameState.money -= cost;
    const prevMult = getUpgradeMilestoneMult(idx);
    upgrades[idx].owned += qty;
    const newMult = getUpgradeMilestoneMult(idx);

    card.classList.add('just-bought');
    setTimeout(() => card.classList.remove('just-bought'), 400);

    if (newMult > prevMult) {
        showNotification(`Marco atingido! ${upgrades[idx].name} rende ×${newMult}!`, '🔥', 3500);
        spawnConfetti();
        playSound(2400, 200);
    } else {
        showNotification(`${qty}× ${upgrades[idx].name} comprado!`, upgrades[idx].icon);
        playSound(1200, 100);
    }
    updateDisplay();
}

function buyManager(idx) {
    if (upgrades[idx].manager) return;
    const cost = getManagerCost(idx);
    if (gameState.money >= cost) {
        gameState.money -= cost;
        upgrades[idx].manager = true;
        showNotification(`Gerente de ${upgrades[idx].name} contratado! Automação ativa.`, '🤖', 3000);
        playSound(1600, 150);
        updateManagerButtons();
    }
}

function updateManagerButtons() {
    for (let i = 0; i < cardRefs.length; i++) {
        const btn = cardRefs[i].manager;
        if (!btn) continue;
        if (upgrades[i].manager) {
            setText(btn, '🤖 Ativo');
            btn.classList.add('owned');
            btn.disabled = true;
        } else {
            const cost = getManagerCost(i);
            setText(btn, `🤖 ${formatNumber(cost)}`);
            btn.classList.remove('owned');
            btn.disabled = gameState.money < cost;
        }
    }
}

function updateEconomy() {
    const container = document.getElementById('economyContainer');
    container.innerHTML = upgrades.map((u, i) => {
        const cost = getUpgradeCost(i);
        const income = getUpgradeIncome(i);
        const payback = Math.ceil(cost / income);
        const roi = (income / cost).toFixed(5);
        
        let paybackStr = payback + 's';
        if (payback >= 60) paybackStr = (payback / 60).toFixed(1) + 'm';
        if (payback >= 3600) paybackStr = (payback / 3600).toFixed(1) + 'h';
        
        const mult = gameState.getEffectiveMultiplier();
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

function updateStats() {
    const container = document.getElementById('statsContainer');
    const timePlayed = Math.floor((Date.now() - gameState.sessionStart) / 60000);
    const mult = gameState.getEffectiveMultiplier();
    const dps = getRawDPS() * mult;

    const stats = [
        { label: 'Ganho Total', value: formatNumber(gameState.totalEarned) },
        { label: 'Renda/s', value: formatNumber(dps) + '/s' },
        { label: 'Valor do Clique', value: formatNumber(getClickValue() * mult) },
        { label: 'Multiplicador', value: '×' + mult.toFixed(2) },
        { label: 'Cliques', value: gameState.clickCount },
        { label: 'Combo Máx', value: '×' + gameState.maxCombo },
        { label: 'Chance Crítico', value: (gameState.critChance * 100).toFixed(0) + '%' },
        { label: 'Prestígio', value: gameState.prestigeLevel },
        { label: 'Pontos 💎', value: gameState.prestigePoints },
        { label: 'Upgrades da Run', value: gameState.runUpgrades.length + '/' + MONEY_UPGRADES.length },
        { label: 'Negócios', value: upgrades.reduce((a, b) => a + b.owned, 0) },
        { label: 'Tempo', value: timePlayed + 'm' }
    ];

    const breakdown = gameState.getMultiplierBreakdown();
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
        <div class="stat-box" style="grid-column: 1 / -1;">
            <div class="stat-label">Composição do multiplicador</div>
            <div style="font-size: 10px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">${breakdownRows}</div>
        </div>` : '');
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'economyModal') updateEconomy();
    if (id === 'statsModal') updateStats();
    if (id === 'achievementsModal') updateAchievements();
    if (id === 'prestigeShopModal') updatePrestigeShop();
    if (id === 'upgradeShopModal') updateUpgradeShop();
}

function updateAchievements() {
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

function updatePrestigeShop() {
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
            <div class="achievement-item ${maxed || affordable ? '' : 'locked'}" style="justify-content: space-between; cursor: ${maxed ? 'default' : 'pointer'};" ${maxed ? '' : `onclick="buyPrestigeShopItem('${item.id}')"`}>
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
function updateUpgradeShop() {
    document.getElementById('upgradeShopMoney').textContent = formatNumber(gameState.money);
    const container = document.getElementById('upgradeShopContainer');
    const cats = [...new Set(MONEY_UPGRADES.map(u => u.cat))];

    let html = '';
    for (const cat of cats) {
        const items = MONEY_UPGRADES.filter(u => u.cat === cat);
        // esconde categorias ainda totalmente indisponíveis, evita parede de itens travados
        const visible = items.filter(u => gameState.hasUpgrade(u.id) || u.req() || u.cost <= gameState.money * 50);
        if (visible.length === 0) continue;

        html += `<div class="section-header" style="margin-top: 10px;">${cat}</div>`;
        html += visible.map(up => {
            const owned = gameState.hasUpgrade(up.id);
            const met = up.req();
            const affordable = met && gameState.money >= up.cost;
            const cls = owned ? 'owned-upgrade' : (affordable ? '' : 'locked');
            const clickAttr = (!owned && affordable) ? `onclick="buyMoneyUpgrade('${up.id}')"` : '';
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

function buyMoneyUpgrade(id) {
    const up = MONEY_UPGRADES_BY_ID[id];
    if (!up || gameState.hasUpgrade(id) || !up.req()) return;
    if (gameState.money < up.cost) return;

    gameState.money -= up.cost;
    gameState.runUpgrades.push(id);
    showNotification(`${up.name}: ${up.desc}`, up.icon, 3500);
    playSound(1900, 180);
    spawnConfetti();
    updateUpgradeShop();
    updateDisplay();
    gameState.save();
}

function buyPrestigeShopItem(id) {
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

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function exportSave() {
    try {
        const data = localStorage.getItem('mm_save_v15');
        if (!data) { alert('Sem save!'); return; }
        const link = document.createElement('a');
        link.href = 'data:text/plain,' + encodeURIComponent(data);
        link.download = 'moneymaker_' + Date.now() + '.txt';
        link.click();
    } catch (e) { alert('Erro!'); }
}

// ============ RENDER DO FRAME ============
let badgeThrottle = 0;

function updateDisplay() {
    gameState.validate();

    if (gameState.combo > 1 && Date.now() - gameState.lastClickTime > 1000) {
        gameState.combo = 1;
    }

    const mult = gameState.getEffectiveMultiplier();
    const rawDps = getRawDPS();
    const dps = rawDps * mult;

    setText(el.moneyDisplay, formatNumber(gameState.money));
    setText(el.totalEarned, formatNumber(gameState.totalEarned));
    setText(el.clickCount, gameState.clickCount);
    setText(el.comboDisplay, gameState.combo);
    setText(el.comboValue, `×${Math.floor(gameState.combo)}`);
    setText(el.multValue, mult.toFixed(2) + 'x');
    setText(el.mpsDisplay, '+' + formatNumber(dps) + '/s');
    setText(el.prestigeDisplay, `${gameState.prestigeLevel}`);

    let totalOwned = 0;
    for (const u of upgrades) totalOwned += u.owned;
    setText(el.businessCount, totalOwned);

    const comboClass = gameState.combo >= 15 ? 'combo-hot' : gameState.combo >= 5 ? 'combo-mid' : '';
    for (const node of [el.comboDisplay, el.comboValue]) {
        if (node._comboClass === comboClass) continue;
        node.classList.remove('combo-mid', 'combo-hot');
        if (comboClass) node.classList.add(comboClass);
        node._comboClass = comboClass;
    }

    const nextCost = getPrestigeCostForLevel(gameState.prestigeLevel + 1);
    setText(el.nextPrestigeCost, formatNumber(nextCost));
    const pct = Math.min(100, (gameState.totalEarned / nextCost) * 100);
    const pctStr = pct.toFixed(1) + '%';
    if (el.prestigeProgressFill._last !== pctStr) {
        el.prestigeProgressFill.style.width = pctStr;
        el.prestigeProgressFill._last = pctStr;
    }
    setHtml(el.prestigeProgressLabel,
        `${formatNumber(gameState.totalEarned)} / ${formatNumber(nextCost)} (${pctStr})` +
        ` — prestigiar agora rende <span style="color: var(--gold); font-weight: bold;">${pendingPrestigePoints()} 💎</span>`);

    if (dps > 0) {
        const seconds = Math.max(0, nextCost - gameState.totalEarned) / dps;
        let timeStr;
        if (seconds < 3600) timeStr = Math.ceil(seconds / 60) + 'm';
        else if (seconds < 86400) timeStr = Math.ceil(seconds / 3600) + 'h';
        else timeStr = Math.ceil(seconds / 86400) + 'd';
        setText(el.timeToPrestige, timeStr);
    }

    const canPrestige = gameState.totalEarned >= nextCost;
    setText(el.prestigeBtn, canPrestige ? '⭐' : '🌙');
    el.prestigeBtn.disabled = !canPrestige;
    el.prestigeBtn.classList.toggle('ready', canPrestige);

    const bestIdx = getBestBuyIndex();
    for (let i = 0; i < cardRefs.length; i++) {
        const refs = cardRefs[i];
        const unlocked = isBusinessUnlocked(i);
        refs.card.classList.toggle('locked-biz', !unlocked);

        if (!unlocked) {
            refs.card.classList.add('disabled');
            setText(refs.lock, `Compre 5 × ${upgrades[i - 1].name}`);
            continue;
        }

        const qty = Math.max(1, getBuyQuantity(i));
        const cost = getBulkCost(i, qty);
        refs.card.classList.toggle('disabled', gameState.money < cost);
        refs.card.classList.toggle('best-buy', i === bestIdx);

        setText(refs.qty, bulkMode === 'max' ? `×${qty}` : `×${bulkMode}`);
        setText(refs.cost, formatNumber(cost));

        const totalMult = getUpgradeMilestoneMult(i) * getBusinessUpgradeMult(i);
        setText(refs.income,
            `+${formatNumber(getUpgradeIncome(i))}/s${totalMult > 1 ? ' (×' + (+totalMult.toFixed(1)) + ')' : ''}`);

        const owned = upgrades[i].owned;
        if (owned > 0) {
            refs.count.style.display = '';
            setText(refs.count, owned);
        } else if (refs.count.style.display !== 'none') {
            refs.count.style.display = 'none';
        }
    }
    updateManagerButtons();

    // Os badges percorrem os 29 upgrades chamando closures de requisito: a cada
    // 500ms é o bastante, não precisa ser a cada frame.
    if (--badgeThrottle <= 0) {
        badgeThrottle = 5;
        let affordable = 0;
        for (const up of MONEY_UPGRADES) {
            if (!gameState.hasUpgrade(up.id) && gameState.money >= up.cost && up.req()) affordable++;
        }
        el.upgradeBadge.style.display = affordable > 0 ? 'flex' : 'none';
        setText(el.upgradeBadge, affordable);

        el.prestigePointBadge.style.display = gameState.prestigePoints > 0 ? 'flex' : 'none';
        setText(el.prestigePointBadge, gameState.prestigePoints);
    }

    updateChart();
}

// ============ GRÁFICO ============
function updateChart() {
    // Sem isto o Chart.js redesenhava 10×/s mesmo com o painel fechado:
    // era o item mais caro do frame inteiro.
    if (!chart || !el.chartContainer.classList.contains('active')) return;

    const val = Math.max(0, Math.floor(gameState.money));
    chartData.push(Number.isFinite(val) ? val : 0);
    chartData.shift();
    chart.data.datasets[0].data = chartData;
    chart.update('none');
}

function initChart() {
    try {
        chart = new Chart(document.getElementById('progressChart'), {
            type: 'line',
            data: {
                labels: ['-2s', '-1.5s', '-1s', '-0.5s', 'Agora'],
                datasets: [{
                    label: 'Dinheiro', data: chartData,
                    borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)',
                    tension: 0.4, fill: true, pointRadius: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
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
    el.chartContainer.classList.toggle('active');
}

function resetGame() {
    if (!confirm('Reiniciar a run atual? Você mantém prestígio, pontos 💎 e conquistas.')) return;
    gameState.money = 0;
    gameState.clickCount = 0;
    gameState.combo = 1;
    gameState.lastComboMilestone = 0;
    gameState.runUpgrades = [];
    upgrades.forEach(u => { u.owned = 0; u.manager = false; });
    createUpgradeButtons();
    updateDisplay();
    showNotification('Run reiniciada!', '🔄');
}
