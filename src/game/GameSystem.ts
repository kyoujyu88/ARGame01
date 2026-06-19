import { UIManager } from '../ui/UIManager';
import { WEAPONS, TARGETS, getWeapon, getTarget } from './Items';
import type { WeaponDef, TargetDef } from './Items';

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

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
        this.load();
        this.uiManager.buildShop(WEAPONS, TARGETS, {
            onBuy: (id, kind) => this.buy(id, kind),
            onEquip: (id, kind) => this.equip(id, kind),
            onUpgrade: (id) => this.upgradeWeapon(id),
        });
        this.updateUI();
        this.refreshShopUI();
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
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('セーブデータの保存に失敗しました', e);
        }
    }

    // 加点時に呼ばれるフック（ゲームモードのランスコア集計用）
    public onScored?: (points: number) => void;

    // コンボ（連続撃破でスコア倍率アップ）
    private combo = 0;
    private comboTimer: number | null = null;
    private static readonly COMBO_WINDOW = 3000; // この時間内に撃破すると継続(ms)

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
        const multiplier = Math.min(5, 1 + Math.floor((this.combo - 1) / 3));
        const awarded = basePoints * multiplier;
        this.addScore(awarded);

        this.uiManager.updateCombo(this.combo >= 2 ? `COMBO x${this.combo}　(${multiplier}倍)` : null);

        // コンボ継続タイマーをリセット
        if (this.comboTimer !== null) clearTimeout(this.comboTimer);
        this.comboTimer = window.setTimeout(() => this.resetCombo(), GameSystem.COMBO_WINDOW);

        return { awarded, multiplier, combo: this.combo };
    }

    public resetCombo() {
        this.combo = 0;
        if (this.comboTimer !== null) { clearTimeout(this.comboTimer); this.comboTimer = null; }
        this.uiManager.updateCombo(null);
    }

    public getScore() {
        return this.score;
    }

    public setState(newState: GameState) {
        this.state = newState;
        this.updateUI();
    }

    private updateUI() {
        const spawnBtn = document.getElementById('spawn-target-btn');
        const shootBtn = document.getElementById('shoot-btn');

        // AR中（IDLE以外）は配置・発射ボタンを常に両方表示する。
        // 以前は状態で片方ずつ切り替えていたが、操作しづらいため常時表示に変更。
        const inGame = this.state !== GameState.IDLE;
        if (spawnBtn) spawnBtn.style.display = inGame ? 'inline-block' : 'none';
        if (shootBtn) shootBtn.style.display = inGame ? 'inline-block' : 'none';
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
