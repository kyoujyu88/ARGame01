import type { WeaponDef, TargetDef } from '../game/Items';

interface ShopCallbacks {
    onBuy: (id: string, kind: 'weapon' | 'target') => void;
    onEquip: (id: string, kind: 'weapon' | 'target') => void;
}

export class UIManager {
    private scoreElement: HTMLElement | null = null;
    private shopMenu: HTMLElement | null = null;

    constructor() {
        this.initUI();
    }

    private initUI() {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div id="ui-container">
                <div id="top-panel">
                    <div id="score-display">Points: 0</div>
                    <button id="shop-btn" class="hud-button">Shop</button>
                </div>

                <div id="scan-overlay">
                    <div class="scan-icon"></div>
                    <p id="scan-text">机や床などの平面を探しています...</p>
                </div>

                <div id="crosshair"></div>

                <p id="shoot-hint">画面をタップで発射 🔫</p>

                <div id="bottom-panel">
                    <!-- WebXRのボタンはThree.jsのARButtonを利用するかカスタムで作成 -->
                    <div id="ar-button-container"></div>
                    <div id="action-buttons">
                        <button id="spawn-target-btn" class="hud-button action-btn" style="display:none;">🎯 配置</button>
                        <button id="shoot-btn" class="hud-button action-btn" style="display:none;">🔫 発射</button>
                    </div>
                </div>

                <!-- ショップは AR の dom-overlay でも表示されるよう ui-container の内側に置く -->
                <div id="shop-menu">
                    <h3 style="margin-top:0;">SHOP <span id="shop-points">0 pt</span></h3>
                    <div class="shop-section-title">武器 (Weapons)</div>
                    <div id="shop-weapons"></div>
                    <div class="shop-section-title">破壊対象 (Targets)</div>
                    <div id="shop-targets"></div>
                    <button id="close-shop-btn" class="hud-button" style="margin-top:12px; width:100%;">Close</button>
                </div>
            </div>
        `;

        this.scoreElement = document.getElementById('score-display');
        this.shopMenu = document.getElementById('shop-menu');

        document.getElementById('shop-btn')?.addEventListener('click', () => {
            if (this.shopMenu) this.shopMenu.classList.add('active');
        });

        document.getElementById('close-shop-btn')?.addEventListener('click', () => {
            if (this.shopMenu) this.shopMenu.classList.remove('active');
        });
    }

    public updateScore(score: number) {
        if (this.scoreElement) {
            this.scoreElement.innerText = `Points: ${score}`;
        }
        const shopPoints = document.getElementById('shop-points');
        if (shopPoints) shopPoints.innerText = `${score} pt`;
    }

    // 武器・標的の定義からショップDOMを動的に生成する
    public buildShop(weapons: WeaponDef[], targets: TargetDef[], cb: ShopCallbacks) {
        const weaponsRoot = document.getElementById('shop-weapons');
        const targetsRoot = document.getElementById('shop-targets');
        if (!weaponsRoot || !targetsRoot) return;

        const render = (
            root: HTMLElement,
            items: { id: string; name: string; cost: number }[],
            kind: 'weapon' | 'target',
        ) => {
            root.innerHTML = '';
            for (const item of items) {
                const row = document.createElement('div');
                row.className = 'shop-item';
                row.dataset.id = item.id;
                row.dataset.kind = kind;

                const label = document.createElement('span');
                label.className = 'shop-label';
                label.innerText = item.cost > 0 ? `${item.name} (${item.cost}pt)` : `${item.name} (無料)`;

                const btn = document.createElement('button');
                btn.className = 'buy-btn';
                btn.dataset.cost = String(item.cost);
                btn.innerText = item.cost > 0 ? 'Buy' : 'Equip';
                btn.addEventListener('click', () => {
                    // 解放済みなら装備、未解放なら購入
                    if (btn.dataset.owned === 'true') {
                        cb.onEquip(item.id, kind);
                    } else {
                        cb.onBuy(item.id, kind);
                    }
                });

                row.appendChild(label);
                row.appendChild(btn);
                root.appendChild(row);
            }
        };

        render(weaponsRoot, weapons, 'weapon');
        render(targetsRoot, targets, 'target');
    }

    // 所持ポイント・解放状況・装備状況に応じてショップの各ボタン表示を更新する
    public refreshShop(
        points: number,
        unlocked: Set<string>,
        equippedWeapon: string,
        equippedTarget: string,
    ) {
        this.updateScore(points);

        const rows = document.querySelectorAll<HTMLElement>('.shop-item');
        rows.forEach((row) => {
            const id = row.dataset.id!;
            const kind = row.dataset.kind as 'weapon' | 'target';
            const btn = row.querySelector<HTMLButtonElement>('.buy-btn');
            const label = row.querySelector<HTMLElement>('.shop-label');
            if (!btn || !label) return;

            const owned = unlocked.has(id);
            const equipped = kind === 'weapon' ? equippedWeapon === id : equippedTarget === id;
            btn.dataset.owned = owned ? 'true' : 'false';

            // コストの抽出（labelテキストの "(xxxpt)" から取得せず data 属性で管理しない簡易判定）
            if (equipped) {
                btn.innerText = '装備中';
                btn.disabled = true;
                btn.classList.add('equipped');
                row.classList.add('equipped-row');
            } else if (owned) {
                btn.innerText = 'Equip';
                btn.disabled = false;
                btn.classList.remove('equipped');
                row.classList.remove('equipped-row');
            } else {
                btn.innerText = 'Buy';
                btn.classList.remove('equipped');
                row.classList.remove('equipped-row');
                // 所持ポイントが足りない場合は購入ボタンを無効化する
                const cost = Number(btn.dataset.cost ?? '0');
                btn.disabled = points < cost;
            }
        });
    }
}
