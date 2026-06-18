import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { GameManager } from '../game/GameManager';

export class XRManager {
    private gameManager: GameManager;
    private reticle: THREE.Mesh | null = null;
    private hitTestSource: any = null;
    private hitTestSourceRequested = false;

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

            // 発射時の照準（中央の十字レティクル）はAR中のみ表示する
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.display = 'block';
        });

        this.gameManager.renderer.xr.addEventListener('sessionend', () => {
            const scanOverlay = document.getElementById('scan-overlay');
            if (scanOverlay) scanOverlay.style.display = 'none';

            // セッション終了時はゲーム用のUIボタンを隠す
            const spawnBtn = document.getElementById('spawn-target-btn');
            const shootBtn = document.getElementById('shoot-btn');
            if (spawnBtn) spawnBtn.style.display = 'none';
            if (shootBtn) shootBtn.style.display = 'none';

            // レティクル（平面マーカー・中央照準）も隠す
            if (this.reticle) this.reticle.visible = false;
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.display = 'none';

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
                        this.reticle.visible = true;
                        this.reticle.matrix.fromArray(pose.transform.matrix);
                        
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

    public getReticleMatrix(): THREE.Matrix4 | null {
        if (this.reticle && this.reticle.visible) {
            return this.reticle.matrix;
        }
        return null;
    }
}
