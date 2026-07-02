import { UIManager } from '../ui/UIManager';
import { WEAPONS, TARGETS, getWeapon, getTarget } from './Items';
import type { WeaponDef, TargetDef } from './Items';
import { ACHIEVEMENTS } from './Achievements';
import type { LifetimeStats } from './Achievements';

// erasableSyntaxOnly が有効なため enum ではなく const オブジェクト + union 型で表現する
export const GameState = {
    IDLE: 0,
    PLACING: 1,
    SHOOTING: 2,
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

// localStorage 保存キー（プレイをまたいでポイント・購入アイテムを保持する）
const STORAGE_KEY = 'argame01_save_v1';

interface SaveData {
    points: number;
    unlocked: string[];
    equippedWeapon: string;
    equippedTarget: string;
    upgrades?: Record<string, number>;
    /** 累計統計（実績判定・実績パネル表示用） */
    stats?: Partial<LifetimeStats>;
    /** 解除済みの実績ID */
    achievements?: string[];
    /** デイリーボーナスの受取状況（last=最終受取日, streak=連続日数） */
    daily?: { last: string; streak: number };
}

export class GameSystem {
    private score: number = 0;
    public state: GameState = GameState.PLACING;
    private uiManager: UIManager;

    public currentWeapon: string = 'ball';
    public currentTarget: string = 'box';

    // 初期解放アイテム（コスト 0 のもの）
    public unlockedItems: Set<string> = new Set(['ball', 'box']);

    // 武器の強化レベル（id -> level, 0..MAX）
    private upgrades: Record<string, number> = {};
    public static readonly MAX_UPGRADE = 3;

    // 累計統計（実績判定用。プレイをまたいで保存する）
    private lifetime: LifetimeStats = { shots: 0, hits: 0, destroyed: 0, maxCombo: 0, bestWave: 0, bestTimeScore: 0 };
    // 解除済みの実績ID
    private achievements: Set<string> = new Set();
    // デイリーボーナスの受取状況
    private daily: { last: string; streak: number } = { last: '', streak: 0 };
    // 1プレイ（タイムアタック/ウェーブの1ラン）分の統計。リザルト表示用
    private runStats = { shots: 0, hits: 0, destroyed: 0, maxCombo: 0 };

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
        this.load();
        this.uiManager.buildShop(WEAPONS, TARGETS, {
            onBuy: (id, kind) => this.buy(id, kind),
            onEquip: (id, kind) => this.equip(id, kind),
            onUpgrade: (id) => this.upgradeWeapon(id),
        });
        this.uiManager.onReset = () => this.resetProgress();
        this.refreshShopUI();
        this.refreshAchievementsUI();
        this.grantDailyBonus();
    }

    // すべての進行データ（ポイント・購入・強化・装備・ベスト記録）を初期化する
    public resetProgress() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('argame01_best_time');
            localStorage.removeItem('argame01_best_wave');
        } catch (e) {
            console.warn('リセットに失敗しました', e);
        }
        // 確実に初期状態へ戻すためリロードする
        location.reload();
    }

    // === 武器強化 ===
    public getWeaponLevel(id: string): number {
        return this.upgrades[id] ?? 0;
    }

    // 弾1発あたりのダメージ（基本1 + 強化レベル）
    public getWeaponDamage(id: string): number {
        return 1 + this.getWeaponLevel(id);
    }

    public getUpgradeCost(id: string): number {
        const level = this.getWeaponLevel(id);
        if (level >= GameSystem.MAX_UPGRADE) return Infinity;
        return 150 * (level + 1);
    }

    public upgradeWeapon(id: string) {
        const level = this.getWeaponLevel(id);
        if (level >= GameSystem.MAX_UPGRADE) return;
        const cost = this.getUpgradeCost(id);
        if (this.score < cost) return;
        this.score -= cost;
        this.upgrades[id] = level + 1;
        this.uiManager.updateScore(this.score);
        this.save();
        this.refreshShopUI();
    }

    // === 永続化 ===
    private load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw) as SaveData;
            this.score = data.points ?? 0;
            this.unlockedItems = new Set(data.unlocked ?? ['ball', 'box']);
            // 念のため初期アイテムは常に解放扱いにする
            this.unlockedItems.add('ball');
            this.unlockedItems.add('box');
            this.currentWeapon = data.equippedWeapon ?? 'ball';
            this.currentTarget = data.equippedTarget ?? 'box';
            this.upgrades = data.upgrades ?? {};
            this.lifetime = { ...this.lifetime, ...(data.stats ?? {}) };
            this.achievements = new Set(data.achievements ?? []);
            this.daily = data.daily ?? { last: '', streak: 0 };
        } catch (e) {
            console.warn('セーブデータの読み込みに失敗しました', e);
        }
    }

    private save() {
        const data: SaveData = {
            points: this.score,
            unlocked: Array.from(this.unlockedItems),
            equippedWeapon: this.currentWeapon,
            equippedTarget: this.currentTarget,
            upgrades: this.upgrades,
            stats: this.lifetime,
            achievements: Array.from(this.achievements),
            daily: this.daily,
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('セーブデータの保存に失敗しました', e);
        }
    }

    // 加点時に呼ばれるフック（ゲームモードのランスコア集計用）
    public onScored?: (points: number) => void;

    // === 統計（実績・リザルト用） ===
    // タイム/ウェーブの1プレイ開始時に呼び、ラン統計をリセットする
    public startRun() {
        this.runStats = { shots: 0, hits: 0, destroyed: 0, maxCombo: 0 };
    }

    public getRunStats() {
        return { ...this.runStats };
    }

    // 発射（トリガー1回）を記録する。累計は次のセーブ機会にまとめて保存される
    public registerShot() {
        this.runStats.shots += 1;
        this.lifetime.shots += 1;
        this.checkAchievements();
    }

    // 弾の命中を記録する（命中率の計算用）
    public registerHit() {
        this.runStats.hits += 1;
        this.lifetime.hits += 1;
    }

    // ウェーブ到達を記録する（実績判定用）
    public reportWave(wave: number) {
        if (wave <= this.lifetime.bestWave) return;
        this.lifetime.bestWave = wave;
        this.checkAchievements();
        this.save();
    }

    // タイムアタックのスコアを記録する（実績判定用）
    public reportTimeScore(score: number) {
        if (score <= this.lifetime.bestTimeScore) return;
        this.lifetime.bestTimeScore = score;
        this.checkAchievements();
        this.save();
    }

    // === 実績 ===
    // 条件を満たした未解除の実績を解除し、報酬を進呈して通知する
    private checkAchievements() {
        let unlockedAny = false;
        for (const def of ACHIEVEMENTS) {
            if (this.achievements.has(def.id) || !def.test(this.lifetime)) continue;
            this.achievements.add(def.id);
            this.grant(def.reward);
            this.uiManager.showToast(`🏆 実績解除「${def.name}」 +${def.reward}pt`);
            unlockedAny = true;
        }
        if (unlockedAny) {
            this.refreshAchievementsUI();
            this.save();
        }
    }

    // コンボ倍率を通さずにポイントを直接進呈する（実績報酬・デイリーボーナス用）
    private grant(points: number) {
        this.score += points;
        this.uiManager.updateScore(this.score);
        this.refreshShopUI();
    }

    private refreshAchievementsUI() {
        this.uiManager.renderAchievements(
            this.lifetime,
            ACHIEVEMENTS.map((a) => ({
                icon: a.icon,
                name: a.name,
                desc: a.desc,
                reward: a.reward,
                unlocked: this.achievements.has(a.id),
            })),
        );
    }

    // === デイリーボーナス ===
    // その日最初の起動でポイントを進呈する。連続日数が続くほど増える（上限あり）
    private grantDailyBonus() {
        const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        const today = dateKey(new Date());
        if (this.daily.last === today) return;
        const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
        this.daily.streak = this.daily.last === yesterday ? this.daily.streak + 1 : 1;
        this.daily.last = today;
        const bonus = Math.min(50 + (this.daily.streak - 1) * 25, 200);
        this.grant(bonus);
        this.save();
        // 起動直後はUI構築中の場合があるため、少し待ってから通知する
        window.setTimeout(() => {
            this.uiManager.showToast(`🎁 デイリーボーナス +${bonus}pt（連続${this.daily.streak}日目）`);
        }, 800);
    }

    // コンボ（連続撃破でスコア倍率アップ）
    private combo = 0;
    private comboTimer: number | null = null;
    private static readonly COMBO_WINDOW = 3000; // この時間内に撃破すると継続(ms)

    // フィーバー（コンボ5到達で発動。スコア2倍＆連射速度アップ）
    private feverUntil = 0;
    // 同じコンボチェーン中に何度も再発動しないためのフラグ（コンボが切れるとリセット）
    private feverTriggeredThisCombo = false;
    private static readonly FEVER_DURATION = 8000; // ms
    private static readonly FEVER_COMBO = 5;

    public isFever(): boolean {
        return performance.now() < this.feverUntil;
    }

    private startFever() {
        this.feverUntil = performance.now() + GameSystem.FEVER_DURATION;
        this.feverTriggeredThisCombo = true;
        this.uiManager.showFever(true);
        window.setTimeout(() => {
            if (!this.isFever()) this.uiManager.showFever(false);
        }, GameSystem.FEVER_DURATION + 100);
    }

    // === スコア／ポイント ===
    public addScore(points: number) {
        this.score += points;
        this.uiManager.updateScore(this.score);
        this.save();
        this.refreshShopUI();
        if (this.onScored) this.onScored(points);
    }

    // 標的撃破：コンボを進めて倍率付きで加点する。戻り値は演出用。
    public registerKill(basePoints: number): { awarded: number; multiplier: number; combo: number } {
        this.combo += 1;
        const fever = this.isFever();
        let multiplier = Math.min(5, 1 + Math.floor((this.combo - 1) / 3));
        if (fever) multiplier *= 2; // フィーバー中はさらに2倍
        const awarded = basePoints * multiplier;

        // 統計を更新して実績を判定する（保存は addScore がまとめて行う）
        this.runStats.destroyed += 1;
        this.lifetime.destroyed += 1;
        this.runStats.maxCombo = Math.max(this.runStats.maxCombo, this.combo);
        this.lifetime.maxCombo = Math.max(this.lifetime.maxCombo, this.combo);
        this.checkAchievements();

        this.addScore(awarded);

        this.uiManager.updateCombo(this.combo >= 2 ? `COMBO x${this.combo}　(${multiplier}倍)` : null);

        // コンボ5到達でフィーバー発動（同じコンボチェーンでは1回だけ）
        if (!fever && !this.feverTriggeredThisCombo && this.combo >= GameSystem.FEVER_COMBO) {
            this.startFever();
        }

        // コンボ継続タイマーをリセット
        if (this.comboTimer !== null) clearTimeout(this.comboTimer);
        this.comboTimer = window.setTimeout(() => this.resetCombo(), GameSystem.COMBO_WINDOW);

        return { awarded, multiplier, combo: this.combo };
    }

    public resetCombo() {
        this.combo = 0;
        this.feverTriggeredThisCombo = false;
        if (this.comboTimer !== null) { clearTimeout(this.comboTimer); this.comboTimer = null; }
        this.uiManager.updateCombo(null);
    }

    public getScore() {
        return this.score;
    }

    public setState(newState: GameState) {
        this.state = newState;
    }

    // === 購入・装備 ===
    private getDef(id: string, kind: 'weapon' | 'target'): WeaponDef | TargetDef {
        return kind === 'weapon' ? getWeapon(id) : getTarget(id);
    }

    public buy(id: string, kind: 'weapon' | 'target') {
        if (this.unlockedItems.has(id)) return;
        const def = this.getDef(id, kind);
        if (this.score < def.cost) return;

        this.score -= def.cost;
        this.unlockedItems.add(id);
        this.uiManager.updateScore(this.score);
        // 購入したらそのまま装備する
        this.equip(id, kind);
        this.save();
    }

    public equip(id: string, kind: 'weapon' | 'target') {
        if (!this.unlockedItems.has(id)) return;
        if (kind === 'weapon') {
            this.currentWeapon = id;
        } else {
            this.currentTarget = id;
        }
        this.save();
        this.refreshShopUI();
    }

    private refreshShopUI() {
        // 武器ごとの強化情報（レベル・次コスト）
        const upgradeInfo: Record<string, { level: number; cost: number; max: number }> = {};
        for (const w of WEAPONS) {
            upgradeInfo[w.id] = {
                level: this.getWeaponLevel(w.id),
                cost: this.getUpgradeCost(w.id),
                max: GameSystem.MAX_UPGRADE,
            };
        }
        this.uiManager.refreshShop(
            this.score,
            this.unlockedItems,
            this.currentWeapon,
            this.currentTarget,
            upgradeInfo,
        );
    }
}
