import type { WeaponDef, TargetDef } from '../game/Items';
import { SoundManager } from '../audio/SoundManager';
import { APP_VERSION } from '../version';

interface ShopCallbacks {
    onBuy: (id: string, kind: 'weapon' | 'target') => void;
    onEquip: (id: string, kind: 'weapon' | 'target') => void;
    onUpgrade: (id: string) => void;
}

export interface UpgradeInfo {
    level: number;
    cost: number;
    max: number;
}

export type GameMode = 'free' | 'time' | 'wave';

export class UIManager {
    private scoreElement: HTMLElement | null = null;
    private shopMenu: HTMLElement | null = null;
    private sound: SoundManager;

    // モード選択時に呼ばれる（GameModeManager が設定する）
    public onSelectMode?: (mode: GameMode) => void;

    // 初期化ボタンが押されたときに呼ばれる（GameSystem が設定する）
    public onReset?: () => void;

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
                        <button id="help-btn" class="hud-button icon-btn">?</button>
                        <button id="achv-btn" class="hud-button icon-btn">🏆</button>
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

                <div id="start-hint">
                    <p class="hint-title">遊び方</p>
                    <p class="hint-step"><span>①</span> 下の「START AR」でカメラを起動</p>
                    <p class="hint-step"><span>②</span> 床や机を映す（緑の輪が出ればOK）</p>
                    <p class="hint-step"><span>③</span>「配置」で的を置く</p>
                    <p class="hint-step"><span>④</span> 画面タップ／「発射」で撃つ！</p>
                    <p class="hint-foot">右上の「?」でいつでも遊び方を確認できます</p>
                </div>

                <div id="combo-display"></div>

                <!-- 一時通知（実績解除・ボーナス獲得など） -->
                <div id="toast-container"></div>

                <!-- 画面中央の大きな告知（WAVE開始など） -->
                <div id="center-banner"></div>

                <div id="scan-overlay">
                    <div class="scan-icon"></div>
                    <p id="scan-text">机や床などの平面を探しています...</p>
                </div>

                <div id="crosshair"></div>

                <p id="shoot-hint">画面をタップで発射 🔫</p>

                <div id="help-overlay">
                    <div id="help-panel">
                        <h2 style="margin-top:0;">遊び方 / ヘルプ</h2>
                        <h3>はじめかた</h3>
                        <ol>
                            <li>下の「START AR」でカメラを起動します。</li>
                            <li>床や机を映すと、平面に<b>緑の輪</b>が表示されます。</li>
                            <li>「🎯 配置」で的を置きます。</li>
                            <li><b>画面をタップ</b>、または「🔫 発射」で弾を撃ちます。</li>
                            <li>的を壊すと<b>ポイント</b>を獲得（硬い的ほど高得点）。</li>
                        </ol>
                        <h3>モード</h3>
                        <ul>
                            <li><b>フリー</b>：自由に配置して撃つ練習モード。</li>
                            <li><b>タイムアタック</b>：60秒で自動出現する的を壊してスコアを競う。</li>
                            <li><b>ウェーブ</b>：倒すと次の波へ。5の倍数でボス出現。</li>
                            <li>※タイム/ウェーブは床を映してから選んでください。</li>
                        </ul>
                        <h3>ショップ（右上 Shop）</h3>
                        <ul>
                            <li>ポイントで<b>武器・的を購入</b>、武器は<b>強化</b>も可能。</li>
                            <li>最下部の「初期化」で進行データをリセット（確認あり）。</li>
                        </ul>
                        <h3>実績・ボーナス</h3>
                        <ul>
                            <li>右上の<b>🏆</b>で実績を確認。達成でポイント獲得。</li>
                            <li>毎日遊ぶと<b>デイリーボーナス</b>（連続日数で増額）。</li>
                        </ul>
                        <h3>コツ</h3>
                        <ul>
                            <li>連続で壊すと<b>コンボ</b>でスコア倍率アップ。</li>
                            <li>爆発する的（ドラム缶等）は周囲を巻き込みます。</li>
                            <li>音は右上の🔊でON/OFF。</li>
                        </ul>
                        <button id="help-close" class="hud-button" style="margin-top:14px;width:100%;">閉じる</button>
                    </div>
                </div>

                <div id="achv-overlay">
                    <div id="achv-panel">
                        <h2 style="margin-top:0;">🏆 実績</h2>
                        <div id="achv-stats"></div>
                        <div id="achv-list"></div>
                        <button id="achv-close" class="hud-button" style="margin-top:14px;width:100%;">閉じる</button>
                    </div>
                </div>

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
                        <button id="spawn-target-btn" class="hud-button action-btn">🎯 配置</button>
                        <button id="shoot-btn" class="hud-button action-btn">🔫 発射</button>
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
                    <button id="reset-btn">初期化</button>

                    <!-- 初期化の確認ダイアログ -->
                    <div id="reset-confirm">
                        <div id="reset-confirm-panel">
                            <div>本当に初期化しますか？<br><span style="font-size:13px;color:#ffb3b3;">ポイント・購入・強化・ベスト記録がすべて消えます。</span></div>
                            <div class="reset-confirm-buttons">
                                <button id="reset-cancel" class="hud-button">キャンセル</button>
                                <button id="reset-yes" class="hud-button">リセットする</button>
                            </div>
                        </div>
                    </div>
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

        // 初期化（アプリ内の確認ダイアログ経由。キャンセル可）
        const resetConfirm = document.getElementById('reset-confirm');
        document.getElementById('reset-btn')?.addEventListener('click', () => {
            resetConfirm?.classList.add('active');
        });
        document.getElementById('reset-cancel')?.addEventListener('click', () => {
            resetConfirm?.classList.remove('active');
        });
        document.getElementById('reset-yes')?.addEventListener('click', () => {
            resetConfirm?.classList.remove('active');
            this.onReset?.();
        });
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

        // ヘルプ（遊び方）。初回は自動表示、以降は「?」ボタンで開く
        const helpOverlay = document.getElementById('help-overlay');
        document.getElementById('help-btn')?.addEventListener('click', () => {
            helpOverlay?.classList.add('active');
        });
        document.getElementById('help-close')?.addEventListener('click', () => {
            helpOverlay?.classList.remove('active');
        });
        try {
            if (!localStorage.getItem('argame01_help_seen')) {
                helpOverlay?.classList.add('active');
                localStorage.setItem('argame01_help_seen', '1');
            }
        } catch { /* noop */ }

        // 実績パネルの開閉
        const achvOverlay = document.getElementById('achv-overlay');
        document.getElementById('achv-btn')?.addEventListener('click', () => {
            achvOverlay?.classList.add('active');
        });
        document.getElementById('achv-close')?.addEventListener('click', () => {
            achvOverlay?.classList.remove('active');
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

    // 画面上部に一時通知（実績解除・ボーナス獲得など）を表示する。複数は縦に積まれる
    public showToast(text: string) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = text;
        container.appendChild(toast);
        this.sound.coin();
        window.setTimeout(() => {
            toast.classList.add('out');
            window.setTimeout(() => toast.remove(), 400);
        }, 2600);
    }

    // 画面中央の大きな告知（WAVE開始など）。アニメーションで自動的に消える
    public showBanner(text: string) {
        const el = document.getElementById('center-banner');
        if (!el) return;
        el.innerText = text;
        el.classList.remove('show');
        void el.offsetWidth; // reflow でアニメ再生
        el.classList.add('show');
    }

    // 実績パネルの内容（累計統計＋実績一覧）を描き直す
    public renderAchievements(
        stats: { shots: number; hits: number; destroyed: number; maxCombo: number },
        items: { icon: string; name: string; desc: string; reward: number; unlocked: boolean }[],
    ) {
        const statsEl = document.getElementById('achv-stats');
        if (statsEl) {
            const acc = stats.shots > 0 ? Math.min(100, Math.round((stats.hits / stats.shots) * 100)) : 0;
            statsEl.innerHTML = `累計撃破 <b>${stats.destroyed}</b>体 ｜ 最大コンボ <b>x${stats.maxCombo}</b> ｜ 命中率 <b>${acc}%</b>`;
        }
        const list = document.getElementById('achv-list');
        if (!list) return;
        list.innerHTML = '';
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'achv-item' + (item.unlocked ? ' unlocked' : '');

            const icon = document.createElement('span');
            icon.className = 'achv-icon';
            icon.innerText = item.unlocked ? item.icon : '🔒';

            const body = document.createElement('span');
            body.className = 'achv-body';
            body.innerHTML = `<b>${item.name}</b><br><small>${item.desc}</small>`;

            const reward = document.createElement('span');
            reward.className = 'achv-reward';
            reward.innerText = item.unlocked ? '✅ 達成' : `+${item.reward}pt`;

            row.append(icon, body, reward);
            list.appendChild(row);
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

                // 武器には強化ボタンも付ける
                if (kind === 'weapon') {
                    const upBtn = document.createElement('button');
                    upBtn.className = 'upgrade-btn';
                    upBtn.innerText = '強化';
                    upBtn.addEventListener('click', () => cb.onUpgrade(item.id));
                    row.appendChild(upBtn);
                }

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
        upgrades?: Record<string, UpgradeInfo>,
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

            // 強化ボタンの状態更新（武器のみ）
            const upBtn = row.querySelector<HTMLButtonElement>('.upgrade-btn');
            if (upBtn && upgrades && upgrades[id]) {
                const info = upgrades[id];
                if (!owned) {
                    upBtn.style.display = 'none';
                } else if (info.level >= info.max) {
                    upBtn.style.display = '';
                    upBtn.innerText = `MAX(Lv${info.level})`;
                    upBtn.disabled = true;
                } else {
                    upBtn.style.display = '';
                    upBtn.innerText = `強化 Lv${info.level}→${info.level + 1} (${info.cost})`;
                    upBtn.disabled = points < info.cost;
                }
            } else if (upBtn) {
                upBtn.style.display = 'none';
            }

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
