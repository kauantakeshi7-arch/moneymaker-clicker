// Sistema de Bolsa de Valores Cyberpunk (Day Trading de Cripto e Ações).
// Simulação de ativos voláteis com histórico de preços, gráficos sparkline e ordens de compra/venda.

import { gameState } from './state.js';
import { addMoney, getRawDPS, getEffectiveMultiplier } from './economy.js';
import { formatNumber, showNotification, playCashSound, playCritSound, playSound } from './utils.js';
import { spawnConfetti } from './vfx.js';

const MARKET_SAVE_KEY = 'mm_market_v1';

export const ASSETS = [
    {
        id: 'neo',
        name: 'Neon Coin',
        ticker: 'NEO',
        type: 'Cripto Quântico',
        icon: '🪙',
        basePrice: 25,
        minPrice: 3,
        maxPrice: 350,
        volatility: 0.14,
        color: '#00d4ff',
        history: [],
        owned: 0,
        avgBuyPrice: 0
    },
    {
        id: 'ttn',
        name: 'Titan Quantum',
        ticker: 'TTN',
        type: 'Tech & IA Global',
        icon: '💻',
        basePrice: 280,
        minPrice: 50,
        maxPrice: 3200,
        volatility: 0.07,
        color: '#ffd700',
        history: [],
        owned: 0,
        avgBuyPrice: 0
    },
    {
        id: 'cyb',
        name: 'Cyber 500 Index',
        ticker: 'CYB',
        type: 'Fundo de Índice ETF',
        icon: '🌐',
        basePrice: 1500,
        minPrice: 400,
        maxPrice: 15000,
        volatility: 0.035,
        color: '#00ff88',
        history: [],
        owned: 0,
        avgBuyPrice: 0
    }
];

let lastMarketTick = 0;
const MARKET_TICK_INTERVAL_MS = 2500;
const MAX_HISTORY = 24;

export function initMarket() {
    loadMarketState();
    // Inicializa histórico se vazio
    ASSETS.forEach(a => {
        if (!a.history || a.history.length === 0) {
            a.history = [a.basePrice];
            for (let i = 1; i < MAX_HISTORY; i++) {
                const prev = a.history[i - 1];
                const delta = (Math.random() - 0.48) * a.volatility * prev;
                const next = Math.max(a.minPrice, Math.min(a.maxPrice, prev + delta));
                a.history.push(+next.toFixed(2));
            }
        }
    });
}

export function getCurrentPrice(assetId) {
    const a = ASSETS.find(x => x.id === assetId);
    if (!a || a.history.length === 0) return 10;
    return a.history[a.history.length - 1];
}

export function getPriceChangePercent(assetId) {
    const a = ASSETS.find(x => x.id === assetId);
    if (!a || a.history.length < 2) return 0;
    const cur = a.history[a.history.length - 1];
    const prev = a.history[0];
    return ((cur - prev) / prev) * 100;
}

export function tickMarket(now) {
    if (now - lastMarketTick < MARKET_TICK_INTERVAL_MS) return;
    lastMarketTick = now;

    ASSETS.forEach(a => {
        const cur = a.history[a.history.length - 1];
        // Caminho estocástico com reversão à média
        const meanReversion = (a.basePrice - cur) * 0.015;
        const randomShock = (Math.random() - 0.49) * a.volatility * cur;
        let next = cur + meanReversion + randomShock;
        next = Math.max(a.minPrice, Math.min(a.maxPrice, next));

        a.history.push(+next.toFixed(2));
        if (a.history.length > MAX_HISTORY) a.history.shift();
    });

    saveMarketState();
    renderMarketUI();
}

/** Aplica impacto no preço quando uma notícia financeira relevante surge */
export function applyNewsMarketShock(ticker, percentDelta) {
    const a = ASSETS.find(x => x.ticker === ticker || x.id === ticker);
    if (!a || a.history.length === 0) return;
    const cur = a.history[a.history.length - 1];
    const next = Math.max(a.minPrice, Math.min(a.maxPrice, cur * (1 + percentDelta)));
    a.history[a.history.length - 1] = +next.toFixed(2);
    renderMarketUI();
}

export function buyShares(assetId, qty = 1) {
    const a = ASSETS.find(x => x.id === assetId);
    if (!a) return;

    const price = getCurrentPrice(assetId);
    let amountToBuy = qty;
    if (qty === 'max') {
        amountToBuy = Math.floor(gameState.money / price);
    }
    amountToBuy = Math.max(0, Math.floor(amountToBuy));
    if (amountToBuy <= 0) {
        showNotification('Saldo insuficiente para comprar ações!', '⚠️', 2000);
        return;
    }

    const totalCost = amountToBuy * price;
    if (gameState.money < totalCost) {
        showNotification('Saldo insuficiente!', '⚠️', 2000);
        return;
    }

    gameState.money -= totalCost;
    const prevTotal = a.owned * a.avgBuyPrice;
    a.owned += amountToBuy;
    a.avgBuyPrice = (prevTotal + totalCost) / a.owned;

    playCashSound();
    showNotification(`Compradas ${amountToBuy} × ${a.ticker} por ${formatNumber(totalCost)}`, '📈', 2500);
    saveMarketState();
    renderMarketUI();
}

export function sellShares(assetId, qty = 1) {
    const a = ASSETS.find(x => x.id === assetId);
    if (!a || a.owned <= 0) {
        showNotification('Você não possui ações deste ativo!', '⚠️', 2000);
        return;
    }

    const price = getCurrentPrice(assetId);
    let amountToSell = qty;
    if (qty === 'all' || qty >= a.owned) {
        amountToSell = a.owned;
    }
    amountToSell = Math.max(0, Math.floor(amountToSell));
    if (amountToSell <= 0) return;

    const totalRevenue = amountToSell * price;
    const costBasis = amountToSell * a.avgBuyPrice;
    const profit = totalRevenue - costBasis;

    gameState.money += totalRevenue;
    gameState.totalEarned += Math.max(0, profit);
    gameState.runEarned += Math.max(0, profit);
    a.owned -= amountToSell;
    if (a.owned <= 0) {
        a.owned = 0;
        a.avgBuyPrice = 0;
    }

    if (profit > 0) {
        playCritSound();
        spawnConfetti();
        const pPct = costBasis > 0 ? ((profit / costBasis) * 100).toFixed(1) : '0';
        showNotification(`LUCRO REALIZADO: +${formatNumber(profit)} (+${pPct}%) em ${a.ticker}!`, '💎', 3500);
    } else {
        playCashSound();
        showNotification(`Vendidas ${amountToSell} × ${a.ticker} por ${formatNumber(totalRevenue)}`, '📉', 2500);
    }

    saveMarketState();
    renderMarketUI();
}

function saveMarketState() {
    try {
        const payload = ASSETS.map(a => ({
            id: a.id,
            owned: a.owned,
            avgBuyPrice: a.avgBuyPrice,
            history: a.history
        }));
        localStorage.setItem(MARKET_SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Falha ao salvar estado da bolsa:', e);
    }
}

function loadMarketState() {
    try {
        const saved = localStorage.getItem(MARKET_SAVE_KEY);
        if (!saved) return;
        const list = JSON.parse(saved);
        if (!Array.isArray(list)) return;
        list.forEach(savedItem => {
            const a = ASSETS.find(x => x.id === savedItem.id);
            if (a) {
                a.owned = Math.max(0, Number(savedItem.owned) || 0);
                a.avgBuyPrice = Math.max(0, Number(savedItem.avgBuyPrice) || 0);
                if (Array.isArray(savedItem.history) && savedItem.history.length > 0) {
                    a.history = savedItem.history.slice(-MAX_HISTORY);
                }
            }
        });
    } catch (e) {
        console.warn('Falha ao carregar estado da bolsa:', e);
    }
}

export function renderMarketUI() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('marketContainer');
    if (!container) return;

    // Se a modal não estiver aberta, evita renderização de canvas desnecessária
    const modal = document.getElementById('marketModal');
    if (modal && !modal.classList.contains('active')) return;

    let html = '';
    ASSETS.forEach(a => {
        const curPrice = getCurrentPrice(a.id);
        const changePct = getPriceChangePercent(a.id);
        const isUp = changePct >= 0;
        const changeClass = isUp ? 'price-up' : 'price-down';
        const changeSign = isUp ? '+' : '';

        const positionValue = a.owned * curPrice;
        const totalCost = a.owned * a.avgBuyPrice;
        const unRealizedProfit = positionValue - totalCost;
        const unRealizedPct = totalCost > 0 ? ((unRealizedProfit / totalCost) * 100).toFixed(1) : '0.0';

        html += `
            <div class="market-asset-card" id="assetCard_${a.id}">
                <div class="asset-card-header">
                    <div class="asset-identity">
                        <span class="asset-icon">${a.icon}</span>
                        <div>
                            <div class="asset-name">${a.name} <span class="asset-ticker">${a.ticker}</span></div>
                            <div class="asset-type">${a.type}</div>
                        </div>
                    </div>
                    <div class="asset-price-box">
                        <div class="asset-price ${changeClass}">$${formatNumber(curPrice)}</div>
                        <div class="asset-change ${changeClass}">${changeSign}${changePct.toFixed(1)}%</div>
                    </div>
                </div>

                <div class="asset-chart-wrap">
                    <canvas id="sparkline_${a.id}" class="sparkline-canvas" width="280" height="48"></canvas>
                </div>

                <div class="asset-position-bar">
                    <div>Carteira: <strong>${a.owned} cotas</strong> ($${formatNumber(positionValue)})</div>
                    <div>Lucro: <strong class="${unRealizedProfit >= 0 ? 'price-up' : 'price-down'}">${unRealizedProfit >= 0 ? '+' : ''}$${formatNumber(unRealizedProfit)} (${unRealizedPct}%)</strong></div>
                </div>

                <div class="asset-trade-actions">
                    <div class="trade-btn-group">
                        <button class="btn btn-sm" data-action="buyAsset" data-target="${a.id}:1">Comprar ×1</button>
                        <button class="btn btn-sm" data-action="buyAsset" data-target="${a.id}:10">×10</button>
                        <button class="btn btn-sm btn-gold" data-action="buyAsset" data-target="${a.id}:max">MAX</button>
                    </div>
                    <div class="trade-btn-group">
                        <button class="btn btn-sm ${a.owned <= 0 ? 'disabled' : ''}" data-action="sellAsset" data-target="${a.id}:1">Vender ×1</button>
                        <button class="btn btn-sm ${a.owned <= 0 ? 'disabled' : ''}" data-action="sellAsset" data-target="${a.id}:10">×10</button>
                        <button class="btn btn-sm btn-sell-all ${a.owned <= 0 ? 'disabled' : ''}" data-action="sellAsset" data-target="${a.id}:all">TUDO</button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Desenha os sparklines em cada canvas
    ASSETS.forEach(a => {
        drawSparkline(a);
    });
}

function drawSparkline(asset) {
    const canvas = document.getElementById(`sparkline_${asset.id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const data = asset.history;
    if (data.length < 2) return;

    const min = Math.min(...data) * 0.98;
    const max = Math.max(...data) * 1.02;
    const range = max - min || 1;

    const isUp = data[data.length - 1] >= data[0];
    const lineColor = isUp ? '#00ff88' : '#ff4466';

    // Área sob a curva
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, isUp ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 68, 102, 0.25)');
    g.addColorStop(1, 'transparent');

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((data[i] - min) / range) * (h - 8) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Linha do gráfico
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((data[i] - min) / range) * (h - 8) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ponto final com pulso
    const lastX = w;
    const lastY = h - ((data[data.length - 1] - min) / range) * (h - 8) - 4;
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
}
