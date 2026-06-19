import type { WeaponDef, TargetDef } from '../game/Items';
import { SoundManager } from '../audio/SoundManager';
import { APP_VERSION } from '../version';

interface ShopCallbacks {
    onBuy: (id: string, kind: 'weapon' | 'target') => void;
    onEquip: (id: string, kind: 'weapon' | 'target') => void;
}

export type GameMode = 'free' | 'time' | 'wave';

export class UIManager {
    private scoreElement: HTMLElement | null = null;
    private shopMenu: HTMLElement | null = null;
    private sound: SoundManager;

    // モード選択時に呼ばれる（GameModeManager が設定する）
    public onSelectMode?: (mode: GameMode) => void;

    constructor(sound: SoundManager) {
        this.sound = sound;
        this.initUI();
    }

    private initUI() {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div id="ui-container">
                <div id="top-panel">
                    <div id="score-display">Points: 0</div>
                    <div class="top-right">
                        <button id="sound-btn" class="hud-button icon-btn">🔊</button>
                        <button id="shop-btn" class="hud-button">Shop</button>
                    </div>
                </div>

                <div id="mode-bar">
                    <button class="mode-btn active" data-mode="free">フリー</button>
                    <button class="mode-btn" data-mode="time">タイムアタック</button>
                    <button class="mode-btn" data-mode="wave">ウェーブ</button>
                </div>

                <div id="mode-status"></div>

                <div id="combo-display"></div>

                <div id="scan-overlay">
                    <div class="scan-icon"></div>
                    <p id="scan-text">机や床などの平面を探しています...</p>
                </div>

                <div id="crosshair"></div>

                <p id="shoot-hint">画面をタップで発射 🔫</p>

                <div id="result-overlay">
                    <div id="result-panel">
                        <div id="result-text"></div>
                        <button id="result-close" class="hud-button" style="margin-top:14px;width:100%;">OK</button>
                    </div>
                </div>

                <div id="version-label">${APP_VERSION}</div>

                <div id="bottom-panel">
                    <div id="ammo-display"></div>
                    <!-- WebXRのボタンはThree.jsのARButtonを利用するかカスタムで作成 -->
                    <div id="ar-button-container"></div>
                    <div id="action-buttons">
                        <button id="spawn-target-btn" class="hud-button action-btn" style="display:none;">🎯 配置</button>
                        <button id="shoot-btn" class="hud-button action-btn" style="display:none;">🔫 発射</button>
                    </div>
                </div>

                <!-- ショップは AR の dom-overlay でも表示されるよう ui-container の内側に置く -->
                <div id="shop-backdrop"></div>
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
        const backdrop = document.getElementById('shop-backdrop');

        // AR(dom-overlay)中、UI要素のタップで XR の select（タップ発射）が
        // 同時に発火してしまうのを防ぐ。UI操作時は beforexrselect を抑制する。
        // （何もない所のタップでは発火しないので、発射は通常どおり機能する）
        const uiContainer = document.getElementById('ui-container');
        uiContainer?.addEventListener('beforexrselect', (ev) => ev.preventDefault());

        const openShop = () => {
            this.shopMenu?.classList.add('active');
            backdrop?.classList.add('active');
        };
        const closeShop = () => {
            this.shopMenu?.classList.remove('active');
            backdrop?.classList.remove('active');
        };

        document.getElementById('shop-btn')?.addEventListener('click', openShop);
        document.getElementById('close-shop-btn')?.addEventListener('click', closeShop);
        // 背景（バックドロップ）タップでも閉じる。裏のボタンへのタップ貫通も防ぐ
        backdrop?.addEventListener('click', closeShop);

        // 効果音 ON/OFF トグル
        const soundBtn = document.getElementById('sound-btn');
        const renderSoundIcon = () => {
            if (soundBtn) soundBtn.innerText = this.sound.isMuted() ? '🔇' : '🔊';
        };
        renderSoundIcon();
        soundBtn?.addEventListener('click', () => {
            this.sound.toggleMuted();
            renderSoundIcon();
        });

        // ゲームモード選択
        document.querySelectorAll<HTMLElement>('.mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode as GameMode;
                this.setActiveMode(mode);
                this.onSelectMode?.(mode);
            });
        });

        // リザルトを閉じる
        document.getElementById('result-close')?.addEventListener('click', () => {
            document.getElementById('result-overlay')?.classList.remove('active');
        });
    }

    // モードボタンのハイライトを更新
    public setActiveMode(mode: GameMode) {
        document.querySelectorAll<HTMLElement>('.mode-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }

    // ゲームモード中のステータス（残り時間・Wave 等）。null で非表示。
    public updateModeStatus(text: string | null) {
        const el = document.getElementById('mode-status');
        if (!el) return;
        if (text) {
            el.innerText = text;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    // リザルト表示
    public showResult(text: string) {
        const overlay = document.getElementById('result-overlay');
        const textEl = document.getElementById('result-text');
        if (textEl) textEl.innerHTML = text;
        overlay?.classList.add('active');
    }

    // 弾薬表示
    public updateAmmo(text: string) {
        const el = document.getElementById('ammo-display');
        if (el) el.innerText = text;
    }

    // コンボ表示（null で非表示）
    public updateCombo(text: string | null) {
        const el = document.getElementById('combo-display');
        if (!el) return;
        if (text) {
            el.innerText = text;
            el.style.display = 'block';
            // 出るたびに小さくポップさせる
            el.classList.remove('pop');
            void el.offsetWidth; // reflow でアニメ再生
            el.classList.add('pop');
        } else {
            el.style.display = 'none';
        }
    }

    // 命中マーカー（中央レティクルを一瞬強調）
    public hitMarker() {
        const el = document.getElementById('crosshair');
        if (!el) return;
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
        window.setTimeout(() => el.classList.remove('hit'), 140);
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
