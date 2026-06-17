import { UIManager } from '../ui/UIManager';

// erasableSyntaxOnly が有効なため enum ではなく const オブジェクト + union 型で表現する
export const GameState = {
    IDLE: 0,
    PLACING: 1,
    SHOOTING: 2,
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

export class GameSystem {
    private score: number = 0;
    public state: GameState = GameState.PLACING;
    private uiManager: UIManager;

    public currentWeapon: string = 'ball';
    public currentTarget: string = 'box';

    public unlockedItems: Set<string> = new Set(['ball', 'box']);

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
        this.updateUI();
        this.setupShopListeners();
    }

    public addScore(points: number) {
        this.score += points;
        this.uiManager.updateScore(this.score);
        this.checkUnlocks();
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
        
        if (spawnBtn && shootBtn) {
            spawnBtn.style.display = this.state === GameState.PLACING ? 'block' : 'none';
            shootBtn.style.display = this.state === GameState.SHOOTING ? 'block' : 'none';
        }
    }

    private setupShopListeners() {
        const mgBtn = document.querySelector('.buy-btn[data-id="weapon_mg"]') as HTMLButtonElement;
        const barrelBtn = document.querySelector('.buy-btn[data-id="target_barrel"]') as HTMLButtonElement;

        mgBtn?.addEventListener('click', () => {
            if (!this.unlockedItems.has('weapon_mg') && this.score >= 100) {
                this.score -= 100;
                this.unlockedItems.add('weapon_mg');
                this.currentWeapon = 'machineGun';
                mgBtn.innerText = 'Equipped';
                mgBtn.disabled = true;
                this.uiManager.updateScore(this.score);
                alert('Machine Gun unlocked and equipped!');
            }
        });

        barrelBtn?.addEventListener('click', () => {
            if (!this.unlockedItems.has('target_barrel') && this.score >= 50) {
                this.score -= 50;
                this.unlockedItems.add('target_barrel');
                this.currentTarget = 'barrel';
                barrelBtn.innerText = 'Equipped';
                barrelBtn.disabled = true;
                this.uiManager.updateScore(this.score);
                alert('Explosive Barrel unlocked and equipped!');
            }
        });
    }

    private checkUnlocks() {
        const mgBtn = document.querySelector('.buy-btn[data-id="weapon_mg"]') as HTMLButtonElement;
        const barrelBtn = document.querySelector('.buy-btn[data-id="target_barrel"]') as HTMLButtonElement;

        if (mgBtn && !this.unlockedItems.has('weapon_mg')) {
            mgBtn.disabled = this.score < 100;
        }

        if (barrelBtn && !this.unlockedItems.has('target_barrel')) {
            barrelBtn.disabled = this.score < 50;
        }
    }
}
