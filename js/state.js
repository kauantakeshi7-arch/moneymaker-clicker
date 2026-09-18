// Estado do jogo e persistência.
//
// Esta classe guarda dados e sabe salvar/carregar — nada mais. Todo valor
// derivado (multiplicadores, renda, custos) é calculado em economy.js a partir
// dela. Essa separação é o que permite as dependências entre módulos formarem
// um grafo sem ciclos.

import { upgrades, MONEY_CAP, SAVE_KEY, defaultPrestigeShopLevels } from './config.js';

export class GameState {
    constructor() {
        this.money = 0;
        this.totalEarned = 0;
        this.runEarned = 0;
        this.clickCount = 0;
        this.prestigeLevel = 0;
        this.combo = 1;
        this.maxCombo = 1;
        this.lastClickTime = 0;
        this.sessionStart = Date.now();
        this.unlockedAchievements = [];
        this.lastComboMilestone = 0;
        this.prestigePoints = 0;
        this.lifetimePrestigePoints = 0;
        this.prestigeShopLevels = defaultPrestigeShopLevels();
        this.runUpgrades = [];       // upgrades comprados com dinheiro (resetam no prestígio)
        this.tempBoostMult = 1;
        this.tempBoostExpiry = 0;
        this.activeContracts = [];
        this.completedContractsCount = 0;
    }

    validate() {
        // dinheiro é float: arredondar por tick destruía toda renda fracionária
        if (!Number.isFinite(this.money)) this.money = 0;
        if (!Number.isFinite(this.totalEarned)) this.totalEarned = 0;
        if (!Number.isFinite(this.runEarned)) this.runEarned = 0;
        this.money = Math.min(Math.max(0, this.money), MONEY_CAP);
        this.totalEarned = Math.min(Math.max(0, this.totalEarned), MONEY_CAP);
        this.runEarned = Math.min(Math.max(0, this.runEarned), MONEY_CAP);
        this.clickCount = Math.max(0, Math.floor(this.clickCount));
        this.prestigeLevel = Math.max(0, Math.floor(this.prestigeLevel || 0));
        this.combo = Math.max(1, Math.min(this.combo || 1, 999));
        this.maxCombo = Math.max(this.combo, Math.max(1, Math.min(this.maxCombo || 1, 999)));
        this.prestigePoints = Math.max(0, Math.floor(this.prestigePoints || 0));
        this.lifetimePrestigePoints = Math.max(0, Math.floor(this.lifetimePrestigePoints || 0));
        if (!this.prestigeShopLevels) this.prestigeShopLevels = defaultPrestigeShopLevels();
        if (!Array.isArray(this.runUpgrades)) this.runUpgrades = [];
        if (!Array.isArray(this.activeContracts)) this.activeContracts = [];
        this.completedContractsCount = Math.max(0, Math.floor(this.completedContractsCount || 0));
    }

    hasUpgrade(id) {
        return this.runUpgrades.includes(id);
    }

    save() {
        try {
            this.validate();
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                money: this.money,
                totalEarned: this.totalEarned,
                runEarned: this.runEarned,
                clickCount: Math.floor(this.clickCount),
                prestigeLevel: Math.floor(this.prestigeLevel),
                combo: Math.max(1, Math.min(Math.floor(this.combo), 999)),
                maxCombo: Math.max(1, Math.min(Math.floor(this.maxCombo || 1), 999)),
                lastClickTime: this.lastClickTime || 0,
                upgrades: upgrades.map(u => ({ owned: Math.max(0, Math.floor(u.owned)), manager: !!u.manager })),
                unlockedAchievements: this.unlockedAchievements.slice(),
                prestigePoints: Math.floor(this.prestigePoints),
                lifetimePrestigePoints: Math.floor(this.lifetimePrestigePoints),
                prestigeShopLevels: this.prestigeShopLevels,
                runUpgrades: this.runUpgrades.slice(),
                activeContracts: this.activeContracts.slice(),
                completedContractsCount: Math.floor(this.completedContractsCount || 0),
                lastSaveTime: Date.now()
            }));
        } catch (e) { console.error('Save error:', e); }
    }

    /** Restaura o save. Devolve o instante do último save (ou null) para que
     *  quem chamou decida o que fazer com o tempo offline. */
    load() {
        try {
            const saved = localStorage.getItem(SAVE_KEY);
            if (!saved) return null;
            const data = JSON.parse(saved);

            this.money = data.money || 0;
            this.totalEarned = data.totalEarned || 0;
            this.runEarned = data.runEarned !== undefined ? data.runEarned : (data.totalEarned || 0);
            this.clickCount = data.clickCount || 0;
            this.prestigeLevel = data.prestigeLevel || 0;
            this.combo = data.combo || 1;
            this.maxCombo = data.maxCombo || Math.max(data.combo || 1, this.maxCombo || 1);
            this.lastClickTime = data.lastClickTime || 0;
            this.prestigePoints = data.prestigePoints || 0;
            this.lifetimePrestigePoints = data.lifetimePrestigePoints || 0;

            if (data.prestigeShopLevels && typeof data.prestigeShopLevels === 'object') {
                const levels = defaultPrestigeShopLevels();
                for (const key of Object.keys(levels)) {
                    levels[key] = Math.max(0, Math.floor(data.prestigeShopLevels[key] || 0));
                }
                this.prestigeShopLevels = levels;
            }
            if (Array.isArray(data.runUpgrades)) {
                this.runUpgrades = data.runUpgrades.filter(id => typeof id === 'string');
            }
            if (Array.isArray(data.unlockedAchievements)) {
                this.unlockedAchievements = data.unlockedAchievements.filter(id => typeof id === 'string');
            }
            if (Array.isArray(data.activeContracts)) {
                this.activeContracts = data.activeContracts;
            }
            this.completedContractsCount = Math.max(0, Math.floor(data.completedContractsCount || 0));
            if (Array.isArray(data.upgrades)) {
                data.upgrades.forEach((entry, i) => {
                    if (!upgrades[i]) return;
                    if (typeof entry === 'number') {
                        // formato antigo: só a quantidade
                        upgrades[i].owned = Math.max(0, Math.floor(entry));
                    } else if (entry && typeof entry === 'object') {
                        upgrades[i].owned = Math.max(0, Math.floor(entry.owned || 0));
                        upgrades[i].manager = !!entry.manager;
                    }
                });
            }

            this.validate();
            return data.lastSaveTime || null;
        } catch (e) {
            console.error('Load error:', e);
            return null;
        }
    }

    isValidSaveShape(data) {
        if (!data || typeof data !== 'object') return false;
        for (const f of ['money', 'totalEarned', 'clickCount', 'prestigeLevel', 'combo', 'maxCombo', 'runEarned']) {
            if (data[f] !== undefined && (typeof data[f] !== 'number' || !Number.isFinite(data[f]))) return false;
        }
        if (data.upgrades !== undefined && !Array.isArray(data.upgrades)) return false;
        if (data.unlockedAchievements !== undefined && !Array.isArray(data.unlockedAchievements)) return false;
        return true;
    }
}

export const gameState = new GameState();
