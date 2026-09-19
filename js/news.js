// Noticiário Financeiro em Tempo Real (Cyber News Ticker).
// Manchetes dinâmicas e bem-humoradas que reagem ao progresso do jogador e easter eggs interativos.

import { upgrades } from './config.js';
import { gameState } from './state.js';
import { formatNumber, playHoverSound, playCashSound, showNotification } from './utils.js';
import { addMoney, getClickValue, isFeverActive } from './economy.js';
import { spawnClickParticle } from './vfx.js';
import { applyNewsMarketShock } from './market.js';

let tickerTrack = null;
let tickerText = null;
let tickerContainer = null;
let tickerInterval = null;
let isGlitching = false;
let newsIndex = 0;

const MARKET_HEADLINES = [
    { text: "🪙 Cripto Neon (NEO) dispara +22% após validação de protocolo em redes neurais!", ticker: 'NEO', shock: 0.22 },
    { text: "💻 Titan Quantum (TTN) salta +16% após fechar megacontrato de servidores na nuvem!", ticker: 'TTN', shock: 0.16 },
    { text: "🌐 Fundo Cyber 500 (CYB) registra alta firme de +7% com entrada de fundos soberanos.", ticker: 'CYB', shock: 0.07 },
    { text: "📉 Correção pontual: Neon Coin (NEO) recua -12% em realização rápida de lucros.", ticker: 'NEO', shock: -0.12 },
    { text: "🚀 Rali tecnológico: Titan Quantum (TTN) ganha mais +18% em pregão internacional!", ticker: 'TTN', shock: 0.18 }
];

const GENERAL_HEADLINES = [
    "Mercado global abre em alta expressiva após onda de investimentos do novo conglomerado.",
    "Bolsa de Valores registra recorde histórico de volume negociado por minuto.",
    "Gatos de rua vistos usando gravatas-borboleta negociando títulos corporativos em Wall Street.",
    "Pesquisa revela: 99,8% dos economistas recomendam continuar clicando na moeda.",
    "Especialistas debatem se dinheiro traz felicidade: 'Sim, e traz com juros compostos'.",
    "Preço do café e da eletricidade dispara devido ao ritmo alucinante de trabalho nos escritórios.",
    "Novo índice da bolsa substitui o ouro pela cotação do seu império comercial.",
    "Tribunal da concorrência tenta abrir investigação, mas desiste após receber cestas de champanhe."
];

const BIZ_HEADLINES = [
    "Banca de Limonada local expande franquia e domina calçadas em todos os bairros.",
    "Cafeterias da rede relatam consumo de grãos triplicado após turno da madrugada.",
    "Food Trucks de hambúrguer artesanal ganham 5 estrelas do guia gastronômico internacional.",
    "Fábricas automatizadas ultrapassam 500 dias ininterruptos de produção sem falhas mecânicas.",
    "Empresa Tech anuncia lançamento de IA quântica para prever tendências do mercado futuro.",
    "Cofres-fortes do Banco Central reportam escassez de espaço para guardar os seus depósitos.",
    "Primeiro cruzeiro comercial para os anéis de Saturno tem passagens esgotadas em segundos."
];

export function getRelevantHeadline() {
    // 8% de chance de Furo de Reportagem Clicável (bônus)
    if (Math.random() < 0.08) {
        return {
            text: "⚡ FURO DE REPORTAGEM EXCLUSIVO: Toque aqui agora para coletar os dividendos da notícia!",
            isBonus: true
        };
    }

    // Se estiver em febre
    if (isFeverActive()) {
        const feverNews = [
            "🔥 ALERTA VERMELHO: Onda incontrolável de euforia financeira atinge a metrópole!",
            "🔥 FRENESI NOS MERCADOS: Lucros duplicados enquanto durar o Modo Febre!",
            "🔥 HISTÓRICO: Volumes de transação quebram a infraestrutura dos servidores da bolsa!"
        ];
        return { text: feverNews[Math.floor(Math.random() * feverNews.length)], isBonus: false };
    }

    // Se tiver combo alto
    if (gameState.combo >= 25) {
        return {
            text: `📈 RITMO EXPLOSIVO: Eficiência dos operadores atinge multiplicador ×${gameState.combo}!`,
            isBonus: false
        };
    }

    // Se tiver negócios de alto nível
    const ownedIndices = [];
    upgrades.forEach((u, i) => { if (u.owned > 0) ownedIndices.push(i); });

    if (ownedIndices.length > 0 && Math.random() < 0.5) {
        const randIdx = ownedIndices[Math.floor(Math.random() * ownedIndices.length)];
        return { text: BIZ_HEADLINES[randIdx], isBonus: false };
    }

    // Se já prestigiou
    if (gameState.prestigeLevel > 0 && Math.random() < 0.3) {
        return {
            text: `⭐ PRESTÍGIO NÍVEL ${gameState.prestigeLevel}: Conglomerado renasce com reputação lendária no setor.`,
            isBonus: false
        };
    }

    // 20% de chance de notícia de impacto na Bolsa de Valores
    if (Math.random() < 0.20) {
        const m = MARKET_HEADLINES[Math.floor(Math.random() * MARKET_HEADLINES.length)];
        applyNewsMarketShock(m.ticker, m.shock);
        return { text: m.text, isBonus: false };
    }

    const gen = GENERAL_HEADLINES[newsIndex % GENERAL_HEADLINES.length];
    newsIndex++;
    return { text: gen, isBonus: false };
}

export function initNewsTicker() {
    tickerContainer = document.getElementById('newsTicker');
    tickerText = document.getElementById('newsTickerText');
    if (!tickerContainer || !tickerText) return;

    cycleHeadline();
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(cycleHeadline, 8000);

    tickerContainer.addEventListener('click', (e) => {
        playHoverSound();
        const curData = tickerContainer._currentHeadline;
        if (curData && curData.isBonus) {
            const bonus = Math.max(50, getClickValue() * 25);
            addMoney(bonus, true);
            playCashSound();
            spawnClickParticle(bonus, e.clientX || window.innerWidth / 2, e.clientY || 80, true);
            showNotification(`Furo de Reportagem coletado: +${formatNumber(bonus)}!`, '📰');
            tickerContainer._currentHeadline = null;
        }
        cycleHeadline();
    });
}

export function cycleHeadline() {
    if (!tickerText || isGlitching) return;
    isGlitching = true;

    tickerText.style.opacity = '0';
    tickerText.style.transform = 'translateY(-6px)';

    setTimeout(() => {
        const headline = getRelevantHeadline();
        tickerContainer._currentHeadline = headline;
        tickerText.textContent = headline.text;
        tickerContainer.classList.toggle('news-bonus-alert', !!headline.isBonus);

        tickerText.style.opacity = '1';
        tickerText.style.transform = 'translateY(0)';
        isGlitching = false;
    }, 250);
}
