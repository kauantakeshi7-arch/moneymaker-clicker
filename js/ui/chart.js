// Sparkline da renda, desenhado à mão em canvas.

import { gameState } from '../state.js';
import { formatNumber } from '../utils.js';
import { el } from './dom.js';

// ============ SPARKLINE ============
// Canvas próprio no lugar do Chart.js: eram 57KB de dependência para desenhar
// 5 pontos. Aqui cabem 60 amostras (30s de histórico) em ~40 linhas.
const CHART_POINTS = 60;
const chartHistory = new Array(CHART_POINTS).fill(0);
let chartCanvas = null, chartCtx = null;

export function initChart() {
    chartCanvas = document.getElementById('progressChart');
    chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;
}

// Amostrar é barato (push/shift), então roda sempre: ao abrir o painel
// o histórico já está cheio em vez de começar vazio.
export function recordChartSample() {
    chartHistory.push(Number.isFinite(gameState.money) ? Math.max(0, gameState.money) : 0);
    chartHistory.shift();
}

export function drawChart() {
    if (!chartCtx || !el.chartContainer.classList.contains('active')) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = chartCanvas.clientWidth, h = chartCanvas.clientHeight;
    if (!w || !h) return;
    if (chartCanvas.width !== w * dpr || chartCanvas.height !== h * dpr) {
        chartCanvas.width = w * dpr;
        chartCanvas.height = h * dpr;
    }

    const ctx = chartCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    let max = 0, min = Infinity;
    for (const v of chartHistory) { if (v > max) max = v; if (v < min) min = v; }
    if (max <= 0) return;
    if (min === max) min = 0;

    const range = max - min || 1;
    const px = i => (i / (CHART_POINTS - 1)) * w;
    const py = v => h - 6 - ((v - min) / range) * (h - 24);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < CHART_POINTS; i++) ctx.lineTo(px(i), py(chartHistory[i]));
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,212,255,0.35)');
    grad.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < CHART_POINTS; i++) {
        const x = px(i), y = py(chartHistory[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(formatNumber(max), 4, 12);
    ctx.fillText('← 30s', 4, h - 4);
}

export function toggleChart() {
    el.chartContainer.classList.toggle('active');
    drawChart();
}

