// Estado do jogo e persistência (save/load/validação).

// ============ ESTADO (v17) ============
const MONEY_CAP = 1e300; // apenas sanidade contra Infinity; dinheiro é float (nunca arredondado)

function defaultPrestigeShopLevels() {
    return {
        clickPower: 0, globalIncome: 0, cheapManagers: 0,
        startingCash: 0, offlineEfficiency: 0, critChance: 0,
        goldenLuck: 0, prestigeBoost: 0, freeManagers: 0
    };
}

class RadicalGameState {
    constructor() {
        this.money = 0;
        this.totalEarned = 0;
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
        this._offlineEarnings = 0;
        this._offlineSeconds = 0;
    }

    validate() {
        // dinheiro é float: arredondar por tick destruía toda renda fracionária
        if (!Number.isFinite(this.money)) this.money = 0;
        if (!Number.isFinite(this.totalEarned)) this.totalEarned = 0;
        this.money = Math.min(Math.max(0, this.money), MONEY_CAP);
        this.totalEarned = Math.min(Math.max(0, this.totalEarned), MONEY_CAP);
        this.clickCount = Math.max(0, Math.floor(this.clickCount));
        this.prestigeLevel = Math.max(0, Math.floor(this.prestigeLevel || 0));
        this.combo = Math.max(1, Math.min(this.combo || 1, 999));
        this.prestigePoints = Math.max(0, Math.floor(this.prestigePoints || 0));
        this.lifetimePrestigePoints = Math.max(0, Math.floor(this.lifetimePrestigePoints || 0));
        if (!this.prestigeShopLevels) this.prestigeShopLevels = defaultPrestigeShopLevels();
        if (!Array.isArray(this.runUpgrades)) this.runUpgrades = [];
    }

    hasUpgrade(id) { return this.runUpgrades.includes(id); }

    get clickPercent() {
        const base = 0.05 + (this.prestigeShopLevels.clickPower * 0.05);
        return base * getRunUpgradeProduct('clickMult');
    }

    get critChance() {
        const base = 0.05 + (this.prestigeShopLevels.critChance * 0.02);
        return Math.min(0.75, base + getRunUpgradeSum('critChanceAdd'));
    }

    get critMultiplier() {
        return 15 * getRunUpgradeProduct('critMult');
    }

    // Multiplicador global, decomposto em fatores nomeados (fonte única da verdade)
    getMultiplierBreakdown() {
        return {
            prestígio: getPrestigeMultiplierForLevel(this.prestigeLevel),
            conquistas: 1 + (this.unlockedAchievements.length * 0.01),
            lojaPrestígio: 1 + (this.prestigeShopLevels.globalIncome * 0.1),
            upgrades: getRunUpgradeProduct('globalMult'),
            sinergias: getSynergyMultiplier(),
            eventoDourado: Date.now() < this.tempBoostExpiry ? this.tempBoostMult : 1,
            febre: isFeverActive() ? 2 : 1
        };
    }

    getEffectiveMultiplier() {
        const b = this.getMultiplierBreakdown();
        return b.prestígio * b.conquistas * b.lojaPrestígio * b.upgrades * b.sinergias * b.eventoDourado * b.febre;
    }

    save() {
        try {
            this.validate();
            const data = {
                money: this.money,
                totalEarned: this.totalEarned,
                clickCount: Math.floor(this.clickCount),
                prestigeLevel: Math.floor(this.prestigeLevel),
                combo: Math.max(1, Math.min(Math.floor(this.combo), 999)),
                upgrades: upgrades.map(u => ({ owned: Math.max(0, Math.floor(u.owned)), manager: !!u.manager })),
                unlockedAchievements: Array.isArray(this.unlockedAchievements) ? this.unlockedAchievements.slice() : [],
                prestigePoints: Math.floor(this.prestigePoints || 0),
                lifetimePrestigePoints: Math.floor(this.lifetimePrestigePoints || 0),
                prestigeShopLevels: this.prestigeShopLevels,
                runUpgrades: this.runUpgrades.slice(),
                lastSaveTime: Date.now()
            };
            localStorage.setItem('mm_save_v15', JSON.stringify(data));
        } catch (e) { console.error('Save error:', e); }
    }

    load() {
        try {
            const saved = localStorage.getItem('mm_save_v15');
            if (saved) {
                const data = JSON.parse(saved);
                this.money = data.money || 0;
                this.totalEarned = data.totalEarned || 0;
                this.clickCount = data.clickCount || 0;
                this.prestigeLevel = data.prestigeLevel || 0;
                this.combo = data.combo || 1;
                this.prestigePoints = data.prestigePoints || 0;
                this.lifetimePrestigePoints = data.lifetimePrestigePoints || 0;
                if (data.prestigeShopLevels && typeof data.prestigeShopLevels === 'object') {
                    const loaded = defaultPrestigeShopLevels();
                    for (const key of Object.keys(loaded)) {
                        loaded[key] = Math.max(0, Math.floor(data.prestigeShopLevels[key] || 0));
                    }
                    this.prestigeShopLevels = loaded;
                }
                if (Array.isArray(data.runUpgrades)) {
                    this.runUpgrades = data.runUpgrades.filter(id => typeof id === 'string');
                }

                if (data.upgrades && Array.isArray(data.upgrades)) {
                    data.upgrades.forEach((entry, i) => {
                        if (!upgrades[i]) return;
                        if (typeof entry === 'number') {
                            upgrades[i].owned = Math.max(0, Math.floor(entry));
                        } else if (entry && typeof entry === 'object') {
                            upgrades[i].owned = Math.max(0, Math.floor(entry.owned || 0));
                            upgrades[i].manager = !!entry.manager;
                        }
                    });
                }
                if (Array.isArray(data.unlockedAchievements)) {
                    this.unlockedAchievements = data.unlockedAchievements.filter(id => typeof id === 'string');
                }
                this.validate();

                if (data.lastSaveTime) {
                    const elapsedSec = Math.min(8 * 3600, Math.max(0, (Date.now() - data.lastSaveTime) / 1000));
                    if (elapsedSec > 5) {
                        const efficiency = Math.min(1, 0.5 + this.prestigeShopLevels.offlineEfficiency * 0.1);
                        const rawDps = upgrades.reduce((a, u, i) => a + getUpgradeIncome(i) * u.owned, 0);
                        const earnings = rawDps * this.getEffectiveMultiplier() * elapsedSec * efficiency;
                        if (earnings > 0) {
                            this.money = Math.min(this.money + earnings, MONEY_CAP);
                            this.totalEarned += earnings;
                            this._offlineEarnings = earnings;
                            this._offlineSeconds = elapsedSec;
                        }
                    }
                }
            }
        } catch (e) { console.error('Load error:', e); }
    }

    isValidSaveShape(data) {
        if (!data || typeof data !== 'object') return false;
        const numFields = ['money', 'totalEarned', 'clickCount', 'prestigeLevel', 'combo'];
        for (const f of numFields) {
            if (data[f] !== undefined && typeof data[f] !== 'number') return false;
        }
        if (data.upgrades !== undefined && !Array.isArray(data.upgrades)) return false;
        if (data.unlockedAchievements !== undefined && !Array.isArray(data.unlockedAchievements)) return false;
        return true;
    }
}

const gameState = new RadicalGameState();
