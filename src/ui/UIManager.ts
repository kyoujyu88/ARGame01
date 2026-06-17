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
                    <div id="score-display">Score: 0</div>
                    <button id="shop-btn" class="hud-button">Shop</button>
                </div>
                
                <div id="scan-overlay">
                    <div class="scan-icon"></div>
                    <p id="scan-text">机や床などの平面を探しています...</p>
                </div>

                <div id="crosshair"></div>
                <div id="bottom-panel">
                    <!-- WebXRのボタンはThree.jsのARButtonを利用するかカスタムで作成 -->
                    <div id="ar-button-container"></div>
                    <button id="spawn-target-btn" class="hud-button" style="display:none;">Spawn Target</button>
                    <button id="shoot-btn" class="hud-button" style="display:none;">Shoot!</button>
                </div>
            </div>
            <div id="shop-menu">
                <h3 style="margin-top:0;">Weapon & Target Shop</h3>
                <div class="shop-item">
                    <span>Machine Gun (100pt)</span>
                    <button class="buy-btn" data-id="weapon_mg" disabled>Buy</button>
                </div>
                <div class="shop-item">
                    <span>Explosive Barrel (50pt)</span>
                    <button class="buy-btn" data-id="target_barrel" disabled>Buy</button>
                </div>
                <button id="close-shop-btn" class="hud-button" style="margin-top:10px; width:100%;">Close</button>
            </div>
        `;

        this.scoreElement = document.getElementById('score-display');
        this.shopMenu = document.getElementById('shop-menu');

        document.getElementById('shop-btn')?.addEventListener('click', () => {
            if(this.shopMenu) this.shopMenu.classList.add('active');
        });

        document.getElementById('close-shop-btn')?.addEventListener('click', () => {
            if(this.shopMenu) this.shopMenu.classList.remove('active');
        });
    }

    public updateScore(score: number) {
        if(this.scoreElement) {
            this.scoreElement.innerText = `Score: ${score}`;
        }
    }
}
