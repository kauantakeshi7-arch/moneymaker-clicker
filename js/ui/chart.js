// Sparkline da renda, desenhado à mão em canvas.
 
import { formatNumber } from '../utils.js';
import { el } from './dom.js';

// ============ SPARKLINE ============
// Canvas próprio no lugar do Chart.js: 60 amostras cobrem exatamente 30 segundos
// de histórico de fluxo de renda (amostrado a cada 500ms).
const CHART_POINTS = 60;
const chartHistory = new Array(CHART_POINTS).fill(0);
let chartCanvas = null, chartCtx = null;
let chartDirty = true;

export function initChart() {
    chartCanvas = document.getElementById('progressChart');
    chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;
    chartDirty = true;
}

// Amostrado a cada 500ms pelo loop de simulação
export function recordChartSample(currentDps = 0) {
    const val = Number.isFinite(currentDps) ? Math.max(0, currentDps) : 0;
    chartHistory.push(val);
    chartHistory.shift();
    chartDirty = true;
}

export function drawChart() {
    if (!chartCtx || !el.chartContainer.classList.contains('active')) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = chartCanvas.clientWidth, h = chartCanvas.clientHeight;
    if (!w || !h) return;
    const resized = chartCanvas.width !== w * dpr || chartCanvas.height !== h * dpr;
    if (!chartDirty && !resized) return;
    chartDirty = false;

    if (resized) {
        chartCanvas.width = w * dpr;
        chartCanvas.height = h * dpr;
    }

    const ctx = chartCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    let max = 0, min = Infinity;
    for (const v of chartHistory) { if (v > max) max = v; if (v < min) min = v; }
    if (min === Infinity) min = 0;
    if (min === max) min = 0;

    const range = (max - min) || 1;
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
    ctx.fillText(formatNumber(max) + '/s', 4, 12);
    ctx.fillText('← 30s', 4, h - 4);
}

export function toggleChart() {
    el.chartContainer.classList.toggle('active');
    chartDirty = true;
    drawChart();
}
