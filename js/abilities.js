// Sistema de Habilidades Estratégicas do Magnata (Active Tactical Skills).
// Permite ao jogador acionar poderes com cooldown e duração que mudam o ritmo de jogo.

import { gameState } from './state.js';
import { getRawDPS, getEffectiveMultiplier, addMoney } from './economy.js';
import { formatNumber, showNotification, playSound, shockwave } from './utils.js';
import { spawnConfetti, spawnMoneyRain } from './vfx.js';

export const ABILITIES = [
    {
        id: 'overclock',
        name: 'Sobrecarga',
        tag: 'PRODUÇÃO',
        icon: '⚡',
        key: '1',
        desc: '×2 de renda passiva por 15s',
        durationMs: 15000,
        cooldownMs: 45000,
        soundFreq: 880
    },
    {
        id: 'hyperclick',
        name: 'Hiper Foco',
        tag: 'CRÍTICOS',
        icon: '🎯',
        key: '2',
        desc: '100% de chance crítica por 12s',
        durationMs: 12000,
        cooldownMs: 60000,
        soundFreq: 1200
    },
    {
        id: 'dividend',
        name: 'Dividendos',
        tag: 'LIQUIDEZ',
        icon: '💰',
        key: '3',
        desc: 'Injeção imediata de 45s de renda',
        durationMs: 0,
        cooldownMs: 75000,
        soundFreq: 1600
    }
];

const state = {
    activeUntil: { overclock: 0, hyperclick: 0, dividend: 0 },
    cooldownUntil: { overclock: 0, hyperclick: 0, dividend: 0 }
};

export function isAbilityActive(id) {
    return Date.now() < (state.activeUntil[id] || 0);
}

export function getAbilityCooldownRemaining(id) {
    const rem = (state.cooldownUntil[id] || 0) - Date.now();
    return Math.max(0, rem);
}

export function getActiveAbilityMultiplier() {
    return isAbilityActive('overclock') ? 2 : 1;
}

export function isHyperClickActive() {
    return isAbilityActive('hyperclick');
}

export function triggerAbility(id) {
    const def = ABILITIES.find(a => a.id === id);
    if (!def) return false;

    const now = Date.now();
    if (now < (state.cooldownUntil[id] || 0)) {
        const secs = Math.ceil(((state.cooldownUntil[id] || 0) - now) / 1000);
        showNotification(`${def.name} em recarga: ${secs}s`, '⏳', 1800);
        return false;
    }

    state.cooldownUntil[id] = now + def.cooldownMs;
    if (def.durationMs > 0) {
        state.activeUntil[id] = now + def.durationMs;
    }

    if (id === 'overclock') {
        showNotification('⚡ SOBRECARGA ATIVA: Renda ×2 por 15s!', '⚡', 3500);
        shockwave('#00d4ff');
        playSound(880, 250);
    } else if (id === 'hyperclick') {
        showNotification('🎯 HIPER FOCO ATIVO: 100% de Críticos por 12s!', '🎯', 3500);
        shockwave('#ffd700');
        playSound(1200, 250);
    } else if (id === 'dividend') {
        const dps = getRawDPS() * getEffectiveMultiplier();
        const payout = Math.max(100, dps * 45);
        addMoney(payout);
        spawnMoneyRain(28);
        spawnConfetti();
        shockwave('#00ff88');
        playSound(1600, 350);
        showNotification(`💰 DIVIDENDOS PAGOS: +${formatNumber(payout)}!`, '💰', 4000);
    }

    updateAbilitiesUI();
    return true;
}

export function updateAbilitiesUI() {
    if (typeof document === 'undefined') return;
    const now = Date.now();

    for (const def of ABILITIES) {
        const btn = document.getElementById(`abilityBtn_${def.id}`);
        const cdBar = document.getElementById(`abilityCd_${def.id}`);
        const timerLabel = document.getElementById(`abilityTimer_${def.id}`);
        if (!btn) continue;

        const isActive = now < (state.activeUntil[def.id] || 0);
        const remCd = Math.max(0, (state.cooldownUntil[def.id] || 0) - now);
        const onCooldown = remCd > 0;

        btn.classList.toggle('active', isActive);
        btn.classList.toggle('on-cooldown', onCooldown && !isActive);

        if (isActive) {
            const activeRem = Math.ceil(((state.activeUntil[def.id] || 0) - now) / 1000);
            if (timerLabel) timerLabel.textContent = `${activeRem}s`;
            if (cdBar) cdBar.style.width = '100%';
        } else if (onCooldown) {
            const cdSecs = Math.ceil(remCd / 1000);
            if (timerLabel) timerLabel.textContent = `${cdSecs}s`;
            if (cdBar) {
                const pct = ((def.cooldownMs - remCd) / def.cooldownMs) * 100;
                cdBar.style.width = `${pct}%`;
            }
        } else {
            if (timerLabel) timerLabel.textContent = `[${def.key}]`;
            if (cdBar) cdBar.style.width = '100%';
        }
    }
}
