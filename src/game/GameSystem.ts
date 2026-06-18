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
}

export class GameSystem {
    private score: number = 0;
    public state: GameState = GameState.PLACING;
    private uiManager: UIManager;

    public currentWeapon: string = 'ball';
    public currentTarget: string = 'box';

    // 初期解放アイテム（コスト 0 のもの）
    public unlockedItems: Set<string> = new Set(['ball', 'box']);

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
        this.load();
        this.uiManager.buildShop(WEAPONS, TARGETS, {
            onBuy: (id, kind) => this.buy(id, kind),
            onEquip: (id, kind) => this.equip(id, kind),
        });
        this.updateUI();
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
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('セーブデータの保存に失敗しました', e);
        }
    }

    // === スコア／ポイント ===
    public addScore(points: number) {
        this.score += points;
        this.uiManager.updateScore(this.score);
        this.save();
        this.refreshShopUI();
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
        this.uiManager.refreshShop(
            this.score,
            this.unlockedItems,
            this.currentWeapon,
            this.currentTarget,
        );
    }
}
