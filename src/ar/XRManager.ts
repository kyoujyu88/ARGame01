import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { GameManager } from '../game/GameManager';

export class XRManager {
    private gameManager: GameManager;
    private reticle: THREE.Mesh | null = null;
    private hitTestSource: any = null;
    private hitTestSourceRequested = false;

    // スキャン演出（小三角形）の発生間隔制御
    private lastScanFx = 0;
    // 一度でも平面認識に成功したか（成功後は演出を出さない）
    private hasRecognizedOnce = false;

    constructor(gameManager: GameManager) {
        this.gameManager = gameManager;
        this.initAR();
    }

    private initAR() {
        // UI全体をラップしているコンテナを取得
        const uiContainer = document.getElementById('ui-container');
        
        // ARButton を作成し、UIの指定コンテナに追加する。dom-overlay機能でARモード中もUIを表示させる
        // @ts-ignore : Types for sessionInit might be incomplete
        const arButton = ARButton.createButton(this.gameManager.renderer, {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: uiContainer ?? document.body }
        });
        
        // ARButton独自の絶対配置スタイルを上書きして自然に並べる
        arButton.style.position = 'relative';
        arButton.style.bottom = 'auto';
        arButton.style.left = 'auto';
        arButton.style.transform = 'none';
        // Three.js の ARButton は高い z-index を持ち、ショップ(モーダル)を突き抜けて
        // 前面に表示されてしまうため、低い z-index に上書きする
        arButton.style.zIndex = '1';
        
        const container = document.getElementById('ar-button-container');
        if (container) {
            container.appendChild(arButton);
        } else {
            document.body.appendChild(arButton);
        }

        this.setupReticle();

        // ARセッションの開始・終了イベントを監視
        this.gameManager.renderer.xr.addEventListener('sessionstart', () => {
            const scanOverlay = document.getElementById('scan-overlay');
            if (scanOverlay) scanOverlay.style.display = 'flex';

            // 発射時の照準（中央の十字レティクル）とタップ操作ヒントはAR中のみ表示する
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.display = 'block';
            const shootHint = document.getElementById('shoot-hint');
            if (shootHint) shootHint.style.display = 'block';

            // 配置・発射ボタンと弾薬表示はAR中のみ表示する
            const actionButtons = document.getElementById('action-buttons');
            if (actionButtons) actionButtons.style.display = 'flex';
            const ammo = document.getElementById('ammo-display');
            if (ammo) ammo.style.display = 'block';
            // 開始前の案内は隠す
            const startHint = document.getElementById('start-hint');
            if (startHint) startHint.style.display = 'none';

            // 新しいセッションではスキャン演出を再び出す
            this.hasRecognizedOnce = false;
        });

        this.gameManager.renderer.xr.addEventListener('sessionend', () => {
            const scanOverlay = document.getElementById('scan-overlay');
            if (scanOverlay) scanOverlay.style.display = 'none';

            // セッション終了時はゲーム用のUIを隠す
            const actionButtons = document.getElementById('action-buttons');
            if (actionButtons) actionButtons.style.display = 'none';
            const ammo = document.getElementById('ammo-display');
            if (ammo) ammo.style.display = 'none';
            const startHint = document.getElementById('start-hint');
            if (startHint) startHint.style.display = 'block';

            // レティクル（平面マーカー・中央照準）も隠す
            if (this.reticle) this.reticle.visible = false;
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.display = 'none';
            const shootHint = document.getElementById('shoot-hint');
            if (shootHint) shootHint.style.display = 'none';

            // 配置した標的や弾をすべて消去する（AR終了後に残り続ける問題の対策）
            this.gameManager.clearAllObjects();

            // dom-overlay のフルスクリーン解除後に UI コンテナが隠れたままになり、
            // ショップを閉じると黒画面で操作不能になる端末があるため、明示的に表示を復帰させる
            const uiContainer = document.getElementById('ui-container');
            if (uiContainer) {
                uiContainer.style.display = 'flex';
                uiContainer.style.visibility = 'visible';
                uiContainer.style.opacity = '1';
            }

            // 残存しているフルスクリーン状態があれば解除する
            if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => { /* noop */ });
            }

            // 終了時はショップを閉じておく
            const shopMenu = document.getElementById('shop-menu');
            if (shopMenu) shopMenu.classList.remove('active');
            const shopBackdrop = document.getElementById('shop-backdrop');
            if (shopBackdrop) shopBackdrop.classList.remove('active');
        });

        // GameManager の単一レンダーループにhit-test処理を登録する
        // （独自にsetAnimationLoopを上書きすると既存ループを潰してしまうため）
        this.gameManager.onFrame((_time, frame) => {
            if (frame) {
                this.updateHitTest(this.gameManager.renderer, frame);
            }
        });
    }

    private setupReticle() {
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.reticle = new THREE.Mesh(geometry, material);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.gameManager.scene.add(this.reticle);
    }

    private updateHitTest(renderer: THREE.WebGLRenderer, frame: any) {
        if (!this.reticle) return;

        const session = renderer.xr.getSession();
        const referenceSpace = renderer.xr.getReferenceSpace();

        if (session && referenceSpace) {
            if (!this.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((viewerSpace) => {
                    // @ts-ignore
                    session.requestHitTestSource({ space: viewerSpace })?.then((source) => {
                        this.hitTestSource = source;
                    }).catch((err) => {
                        const scanText = document.getElementById('scan-text');
                        if (scanText) scanText.innerText = 'HitTestエラー: ' + err.message;
                    });
                }).catch((err) => {
                    const scanText = document.getElementById('scan-text');
                    if (scanText) scanText.innerText = 'ViewerSpaceエラー: ' + err.message;
                });
                
                session.addEventListener('end', () => {
                    this.hitTestSourceRequested = false;
                    this.hitTestSource = null;
                });
                this.hitTestSourceRequested = true;
            }

            if (this.hitTestSource) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(referenceSpace);
                    if (pose) {
                        // reticle.visible は「配置位置を追跡できているか」を表すフラグとして維持する
                        // （getReticleMatrix/getReticlePosition が参照する）。
                        // 見た目の緑の輪は認識完了後は非表示にし、床に貼りつく円で混乱しないようにする。
                        this.reticle.visible = true;
                        (this.reticle.material as THREE.MeshBasicMaterial).visible = !this.hasRecognizedOnce;
                        this.reticle.matrix.fromArray(pose.transform.matrix);

                        // 認識完了までは、その場所にワイヤーフレームの小三角形を散らす。
                        // 一度認識できたら以降は出さない（「ずっと表示され続ける」のを防ぐ）
                        if (!this.hasRecognizedOnce) {
                            this.spawnScanTriangles(new THREE.Vector3(
                                pose.transform.position.x,
                                pose.transform.position.y,
                                pose.transform.position.z,
                            ));
                        }
                        this.hasRecognizedOnce = true;

                        // 平面が認識されたらスキャンアニメーションを隠す
                        const scanOverlay = document.getElementById('scan-overlay');
                        if (scanOverlay) scanOverlay.style.display = 'none';
                    }
                } else {
                    this.reticle.visible = false;
                }
            }
        }
    }

    // 認識完了までの間、ワイヤーフレーム三角形をパラパラと散らすスキャン演出
    private spawnScanTriangles(center: THREE.Vector3) {
        const now = performance.now();
        if (now - this.lastScanFx < 130) return;
        this.lastScanFx = now;

        const count = 2;
        for (let i = 0; i < count; i++) {
            const size = 0.03 + Math.random() * 0.05;
            const base = Math.random() * Math.PI * 2;
            const verts: number[] = [];
            for (let k = 0; k < 3; k++) {
                const ang = base + k * 2.1 + Math.random() * 0.6;
                verts.push(Math.cos(ang) * size, 0, Math.sin(ang) * size);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            const material = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                wireframe: true,
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                center.x + (Math.random() - 0.5) * 0.7,
                center.y + 0.004,
                center.z + (Math.random() - 0.5) * 0.7,
            );
            this.gameManager.addEffect(mesh, 0.9, (t, obj) => {
                (((obj as THREE.Mesh).material) as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
                obj.scale.setScalar(1 + t * 0.6);
            });
        }
    }

    public getReticleMatrix(): THREE.Matrix4 | null {
        if (this.reticle && this.reticle.visible) {
            return this.reticle.matrix;
        }
        return null;
    }

    // レティクル（検出面マーカー）のワールド座標。未検出なら null。
    public getReticlePosition(): THREE.Vector3 | null {
        const matrix = this.getReticleMatrix();
        if (!matrix) return null;
        return new THREE.Vector3().setFromMatrixPosition(matrix);
    }
}
