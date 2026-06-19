import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameManager } from './GameManager';
import { XRManager } from '../ar/XRManager';
import { GameSystem, GameState } from './GameSystem';
import { getWeapon, getTarget } from './Items';
import type { WeaponDef, TargetDef } from './Items';
import { SoundManager } from '../audio/SoundManager';
import { UIManager } from '../ui/UIManager';
import { ModelLoader } from './ModelLoader';

export class InteractionManager {
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;
    private sound: SoundManager;
    private uiManager: UIManager;
    private modelLoader = new ModelLoader();

    // 物理マテリアルの定義
    private physicsMaterial = new CANNON.Material('standard');

    // AR用の見えない地面。検出した平面の高さ(Y)に合わせて毎回移動させる
    private groundBody: CANNON.Body;
    // 影を受けるための見えない床（影だけ描画する ShadowMaterial）
    private shadowGround: THREE.Mesh;

    // 武器の弾薬・連射・リロード状態
    private ammoWeaponId = '';
    private ammoLeft = 0;
    private reloading = false;
    private lastShotAt = 0;

    constructor(
        gameManager: GameManager,
        xrManager: XRManager,
        gameSystem: GameSystem,
        sound: SoundManager,
        uiManager: UIManager,
    ) {
        this.gameManager = gameManager;
        this.xrManager = xrManager;
        this.gameSystem = gameSystem;
        this.sound = sound;
        this.uiManager = uiManager;

        this.groundBody = this.setupPhysicsContact();
        this.shadowGround = this.setupShadowGround();
        this.setupEventListeners();
    }

    // 影だけを映す床を用意（オブジェクトの影が現実の床に落ちて見えるようにする）
    private setupShadowGround(): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(10, 10);
        const material = new THREE.ShadowMaterial({ opacity: 0.35 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        mesh.position.y = 0;
        this.gameManager.scene.add(mesh);
        return mesh;
    }

    private setupPhysicsContact(): CANNON.Body {
        // 地面用とオブジェクト用の接触設定 (反発係数など)
        const contactMaterial = new CANNON.ContactMaterial(
            this.physicsMaterial,
            this.physicsMaterial,
            { friction: 0.5, restitution: 0.3 },
        );
        this.gameManager.physicsManager.world.addContactMaterial(contactMaterial);

        // 見えない地面（AR用）
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0, material: this.physicsMaterial });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // X軸に90度回転して水平面にする
        // 初期位置は Y=0。実際の床の高さは hit-test 検出時に updateGroundHeight() で合わせる
        this.gameManager.physicsManager.world.addBody(groundBody);
        return groundBody;
    }

    // 検出した平面のYに地面を合わせる（オブジェクトが浮く／沈む問題の対策）
    private updateGroundHeight(surfaceY: number) {
        this.groundBody.position.set(0, surfaceY, 0);
        this.shadowGround.position.y = surfaceY;
    }

    private setupEventListeners() {
        // AR を開始するたびにゲーム状態を初期化し、設置ボタンを再表示する。
        // （前回セッションで SHOOTING のまま終了するとボタンが隠れたままになるため）
        this.gameManager.renderer.xr.addEventListener('sessionstart', () => {
            this.gameSystem.setState(GameState.PLACING);
            this.refreshAmmoDisplay();
        });

        // 画面（ARビューの何もない所）をタップすると弾を発射する。
        // DOMボタンをタップした場合はこの select は発火しないので競合しない。
        const controller = this.gameManager.renderer.xr.getController(0);
        controller.addEventListener('select', () => {
            this.shootWeapon();
        });
        this.gameManager.scene.add(controller);

        const spawnBtn = document.getElementById('spawn-target-btn');
        const shootBtn = document.getElementById('shoot-btn');

        spawnBtn?.addEventListener('click', () => {
            this.spawnTarget();
        });

        shootBtn?.addEventListener('click', () => {
            this.shootWeapon();
        });
    }

    // 手動配置（フリーモードの「配置」ボタン）
    private spawnTarget(): boolean {
        const position = this.xrManager.getReticlePosition();
        if (!position) {
            alert('平面が認識されていません。カメラを動かして緑のマークが出てからお試しください。');
            return false;
        }
        const def = getTarget(this.gameSystem.currentTarget);
        this.placeTarget(def, position);
        return true;
    }

    // 指定位置に標的を1体配置する。modes からも呼ばれる。
    // onDestroyed は破壊時に呼ばれる（ゲームモードの残数カウント用）。
    public placeTarget(def: TargetDef, position: THREE.Vector3, onDestroyed?: () => void) {
        // 検出した平面の高さに地面を合わせる（浮き防止）
        this.updateGroundHeight(position.y);

        const { mesh, shape, centerOffsetY } = this.createTargetVisual(def, position);

        const body = new CANNON.Body({
            mass: def.mass,
            material: this.physicsMaterial,
            position: new CANNON.Vec3(position.x, position.y + centerOffsetY, position.z),
        });
        body.addShape(shape);

        // 破壊時コールバックをボディに紐づける（breakTarget から呼ぶ）
        if (onDestroyed) (body as any).__onDestroyed = onDestroyed;

        // ドローン・UFO・ボスは少し浮いた状態から始める（SF演出）
        if (def.id === 'drone' || def.id === 'ufo' || def.id === 'boss') {
            body.position.y += 0.3;
            mesh.position.y += 0.3;
        }

        // 動く標的はキネマティック化して、毎フレーム位置をスクリプトで動かす
        if (def.motion !== 'none') {
            body.type = CANNON.Body.KINEMATIC;
            body.updateMassProperties();
            const range = def.motion === 'spin' ? 0.35 : (def.motion === 'strafe' ? 0.4 : 0.15);
            (body as any).__mover = {
                type: def.motion,
                ox: body.position.x,
                oy: body.position.y,
                oz: body.position.z,
                t: Math.random() * Math.PI * 2,
                speed: 1.2 + Math.random() * 0.6,
                range,
            };
        }

        // 外部3Dモデル(GLTF)が指定されていれば読み込んで差し替える（無ければプリミティブのまま）
        if (def.modelUrl) {
            this.modelLoader.load(def.modelUrl).then((model) => {
                model.scale.setScalar(def.size * 2);
                model.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
                mesh.add(model);
                (mesh.material as THREE.Material).visible = false; // 物理用の素体は隠す
            }).catch(() => { /* 失敗時はプリミティブのまま */ });
        }

        // HPバー（耐久2以上の標的に表示。被弾で減る緑バー）
        const hpBarWidth = 0.22;
        let hpBar: THREE.Sprite | null = null;
        if (def.health > 1) {
            hpBar = this.createHpBar(mesh, centerOffsetY, hpBarWidth);
        }

        // 弾を当てるたびに耐久を削り、0 になったら破片に砕く
        let health = def.health;
        let broken = false;
        body.addEventListener('collide', (e: any) => {
            if (broken) return;
            // 弾が当たったときだけダメージ（落下や地面との接触では削れない）
            const other = e.body;
            const hitByProjectile = other && other.__kind === 'projectile';
            const relativeVelocity = Math.abs(e.contact.getImpactVelocityAlongNormal());
            if (!hitByProjectile || relativeVelocity <= 1.5) return;

            // 弾の威力（武器強化レベルで増える）だけ耐久を削る
            const damage = (other.__damage as number) ?? 1;
            health -= damage;
            if (health <= 0) {
                broken = true;
                // 衝突コールバック中に world を変更すると不安定なので次のタスクで実行する
                setTimeout(() => this.breakTarget(def, body), 0);
                this.uiManager.hitMarker();
            } else {
                // まだ壊れていないヒット：効果音とスパーク、軽い点滅、命中マーカー、HPバー更新
                this.sound.hit();
                this.spawnHitSpark(body.position, def.color);
                this.flashMesh(mesh);
                this.uiManager.hitMarker();
                if (hpBar) hpBar.scale.x = Math.max(0, health / def.health) * hpBarWidth;
            }
        });

        this.gameManager.addPhysicsObject(mesh, body, 'target');
    }

    // 標的を破壊：本体を消し、破片を飛び散らせ、加点・爆発する
    private breakTarget(def: TargetDef, body: CANNON.Body) {
        const center = new CANNON.Vec3(body.position.x, body.position.y, body.position.z);
        const pos = new THREE.Vector3(center.x, center.y, center.z);

        // 爆発系は周囲を吹き飛ばす＋大きな爆発演出。ガラスは専用の割れ音
        if (def.explosive) {
            this.gameManager.applyExplosion(center, def.explosionRadius, def.explosionForce);
            this.spawnExplosionFlash(pos, def.explosionRadius, 0xffaa33);
            this.sound.explosion();
        } else if (def.glass) {
            this.spawnExplosionFlash(pos, def.size * 2, 0xcceeff);
            this.sound.glass();
        } else {
            this.spawnExplosionFlash(pos, def.size * 4, def.emissive || def.color);
            this.sound.break();
        }

        // 本体を消去して破片に置き換える
        this.gameManager.removeBody(body);
        this.spawnFragments(def, center);

        // コンボ倍率つきで加点し、獲得スコアをポップアップ表示
        const result = this.gameSystem.registerKill(def.points);
        this.spawnScorePopup(pos, result.awarded, result.multiplier);

        // ゲームモード用の破壊コールバック
        const onDestroyed = (body as any).__onDestroyed as (() => void) | undefined;
        if (onDestroyed) onDestroyed();
    }

    // 標的の頭上にHPバー（背景＋緑バー）を付ける。緑バーのSpriteを返す。
    private createHpBar(mesh: THREE.Mesh, centerOffsetY: number, width: number): THREE.Sprite {
        const y = centerOffsetY + 0.06;
        const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x330000, depthTest: false }));
        bg.position.set(0, y, 0);
        bg.center.set(0.5, 0.5);
        bg.scale.set(width, 0.03, 1);
        mesh.add(bg);

        const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x33ff66, depthTest: false }));
        // 左端を基準にして減るようにする
        fg.center.set(0, 0.5);
        fg.position.set(-width / 2, y, 0.001);
        fg.scale.set(width, 0.03, 1);
        mesh.add(fg);
        return fg;
    }

    // 撃破時に「+score」を3Dのフロートテキストで表示する
    private spawnScorePopup(position: THREE.Vector3, points: number, multiplier: number) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const label = multiplier > 1 ? `+${points} x${multiplier}` : `+${points}`;
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, 128, 64);
        ctx.fillStyle = multiplier > 1 ? '#ffd23f' : '#ffffff';
        ctx.fillText(label, 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.position.y += 0.15;
        sprite.scale.set(0.3, 0.15, 1);

        this.gameManager.addEffect(sprite, 0.9, (t, obj) => {
            obj.position.y += 0.004; // ふわっと上昇
            (((obj as THREE.Sprite).material) as THREE.SpriteMaterial).opacity = 1 - t;
        });
    }

    // ヒット時の小さなスパーク（短命の発光球）
    private spawnHitSpark(position: CANNON.Vec3, color: number) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat);
        mesh.position.set(position.x, position.y, position.z);
        this.gameManager.addEffect(mesh, 0.18, (t, obj) => {
            const s = 1 + t * 2;
            obj.scale.setScalar(s);
            (((obj as THREE.Mesh).material) as THREE.MeshBasicMaterial).opacity = 1 - t;
        });
    }

    // 破壊・爆発時の発光フラッシュ（膨らんで消える半透明球）
    private spawnExplosionFlash(position: THREE.Vector3, radius: number, color: number) {
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.1, radius * 0.5), 16, 16), mat);
        mesh.position.copy(position);
        this.gameManager.addEffect(mesh, 0.4, (t, obj) => {
            obj.scale.setScalar(0.3 + t * 1.4);
            (((obj as THREE.Mesh).material) as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
        });
    }

    // ヒット時に一瞬だけ発光させる
    private flashMesh(mesh: THREE.Mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat || !mat.emissive) return;
        const original = mat.emissive.getHex();
        const originalIntensity = mat.emissiveIntensity;
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 1.0;
        setTimeout(() => {
            mat.emissive.setHex(original);
            mat.emissiveIntensity = originalIntensity;
        }, 80);
    }

    // 破壊時の破片（小さな立方体）を飛び散らせる
    private spawnFragments(def: TargetDef, center: CANNON.Vec3) {
        // 破片は元オブジェクトと同じ素材を使い、見た目（色・テクスチャ・透明度）を保つ
        const baseMaterial = this.makeTargetMaterial(def);
        const count = def.glass ? 14 : 9;
        const fragSize = Math.max(0.025, def.size / (def.glass ? 4 : 3));

        for (let i = 0; i < count; i++) {
            const geometry = this.makeFragmentGeometry(def, fragSize);
            const material = baseMaterial.clone();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            // 破片ごとに向きをランダムにして“砕けた”印象に
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            const px = center.x + (Math.random() - 0.5) * fragSize * 2;
            const py = center.y + (Math.random() - 0.5) * fragSize * 2;
            const pz = center.z + (Math.random() - 0.5) * fragSize * 2;
            mesh.position.set(px, py, pz);

            const body = new CANNON.Body({
                mass: 0.1,
                material: this.physicsMaterial,
                position: new CANNON.Vec3(px, py, pz),
            });
            body.addShape(new CANNON.Sphere(fragSize * 0.5));
            body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            // 外側＋上方向にランダムに飛び散らせる
            body.velocity.set(
                (Math.random() - 0.5) * 4,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 4,
            );
            body.angularVelocity.set(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
            );

            this.gameManager.addPhysicsObject(mesh, body, 'fragment');

            // 破片は一定時間後に自動で片付ける
            setTimeout(() => this.gameManager.removeBody(body), 5000);
        }
    }

    // 破片の形状を元オブジェクトの種類に合わせて生成する（“らしく”壊す）
    private makeFragmentGeometry(def: TargetDef, s: number): THREE.BufferGeometry {
        if (def.glass || def.shape === 'panel') {
            // ガラス片：薄い三角のかけら
            return new THREE.CylinderGeometry(s * 0.9, s * 0.2, 0.012, 3);
        }
        if (def.shape === 'crystal') {
            // 結晶のかけら
            return new THREE.TetrahedronGeometry(s, 0);
        }
        if (def.shape === 'sphere') {
            // 球の破片（小さな粒）
            return new THREE.SphereGeometry(s * 0.6, 8, 8);
        }
        if (def.shape === 'cylinder') {
            // 金属片（曲がった板状のかけら）
            return new THREE.BoxGeometry(s * 1.2, s * 0.4, s * 0.8);
        }
        // 木箱など：木片
        return new THREE.BoxGeometry(s, s * (0.6 + Math.random() * 0.8), s * 0.7);
    }

    // 標的の見た目（Mesh）と物理形状（Shape）を定義から生成する
    private createTargetVisual(
        def: TargetDef,
        position: THREE.Vector3,
    ): { mesh: THREE.Mesh; shape: CANNON.Shape; centerOffsetY: number } {
        let geometry: THREE.BufferGeometry;
        let shape: CANNON.Shape;
        let centerOffsetY: number;

        switch (def.shape) {
            case 'cylinder': {
                geometry = new THREE.CylinderGeometry(def.size, def.size, def.height, 20);
                shape = new CANNON.Cylinder(def.size, def.size, def.height, 20);
                centerOffsetY = def.height / 2;
                break;
            }
            case 'sphere': {
                geometry = new THREE.SphereGeometry(def.size, 20, 20);
                shape = new CANNON.Sphere(def.size);
                centerOffsetY = def.size;
                break;
            }
            case 'crystal': {
                geometry = new THREE.IcosahedronGeometry(def.size, 0);
                // 物理は近似で球を使う
                shape = new CANNON.Sphere(def.size);
                centerOffsetY = def.size;
                break;
            }
            case 'panel': {
                // 薄い板（ガラス板など）
                const depth = 0.03;
                geometry = new THREE.BoxGeometry(def.size, def.height, depth);
                shape = new CANNON.Box(new CANNON.Vec3(def.size / 2, def.height / 2, depth / 2));
                centerOffsetY = def.height / 2;
                break;
            }
            case 'box':
            default: {
                geometry = new THREE.BoxGeometry(def.size, def.size, def.size);
                shape = new CANNON.Box(new CANNON.Vec3(def.size / 2, def.size / 2, def.size / 2));
                centerOffsetY = def.size / 2;
                break;
            }
        }

        const material = this.makeTargetMaterial(def);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y + centerOffsetY, position.z);

        // 種類ごとに装飾パーツを足して見た目に個性を出す
        this.decorateTarget(mesh, def);

        // 影を落とす（リッチな見た目）
        mesh.traverse((o) => { (o as THREE.Mesh).castShadow = true; });

        return { mesh, shape, centerOffsetY };
    }

    // 標的の素材を生成する（本体と破片で同じ見た目を使う）。
    private makeTargetMaterial(def: TargetDef): THREE.MeshStandardMaterial {
        if (def.glass) {
            return new THREE.MeshStandardMaterial({
                color: def.color,
                metalness: 0.1,
                roughness: 0.05,
                transparent: true,
                opacity: 0.45,
            });
        }
        return new THREE.MeshStandardMaterial({
            color: def.color,
            emissive: def.emissive,
            emissiveIntensity: def.emissive ? 0.8 : 0,
            metalness: def.id === 'can' || def.id === 'barrel' ? 0.7 : 0.3,
            roughness: 0.6,
            map: this.makeTexture(def),
        });
    }

    // 標的のテクスチャをコードで生成する（外部画像なしで質感を出す）。
    // 対応していない種類は null（無地）を返す。
    private makeTexture(def: TargetDef): THREE.CanvasTexture | null {
        const make = (draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture => {
            const s = 128;
            const canvas = document.createElement('canvas');
            canvas.width = s; canvas.height = s;
            const ctx = canvas.getContext('2d')!;
            draw(ctx, s);
            const tex = new THREE.CanvasTexture(canvas);
            return tex;
        };

        if (def.id === 'box') {
            // 木目＋板の継ぎ目
            return make((ctx, s) => {
                ctx.fillStyle = '#9b6a36'; ctx.fillRect(0, 0, s, s);
                ctx.strokeStyle = 'rgba(80,45,15,0.5)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 10; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i * s / 10 + (Math.random() * 4 - 2));
                    ctx.lineTo(s, i * s / 10 + (Math.random() * 4 - 2));
                    ctx.stroke();
                }
                ctx.strokeStyle = '#5a3410'; ctx.lineWidth = 6;
                ctx.strokeRect(3, 3, s - 6, s - 6);
            });
        }
        if (def.id === 'barrel') {
            // 危険物の黄黒ストライプ
            return make((ctx, s) => {
                ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, s, s);
                ctx.fillStyle = '#ffd23f';
                ctx.fillRect(0, s * 0.3, s, s * 0.16);
                ctx.fillRect(0, s * 0.6, s, s * 0.16);
                ctx.fillStyle = '#000';
                for (let x = -s; x < s; x += 16) {
                    ctx.save(); ctx.beginPath();
                    ctx.rect(0, s * 0.3, s, s * 0.16); ctx.clip();
                    ctx.fillRect(x, s * 0.3, 8, s * 0.16); ctx.restore();
                }
            });
        }
        if (def.id === 'can' || def.id === 'reactor') {
            // 金属のハイライト縞
            return make((ctx, s) => {
                const g = ctx.createLinearGradient(0, 0, s, 0);
                g.addColorStop(0, '#888'); g.addColorStop(0.5, '#e8eef2'); g.addColorStop(1, '#888');
                ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
            });
        }
        return null;
    }

    // 標的に装飾（子メッシュ）を追加して、色違いだけにならないようにする
    private decorateTarget(mesh: THREE.Mesh, def: TargetDef) {
        if (def.id === 'box') {
            // 木箱：枠線を足して箱らしく
            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(mesh.geometry),
                new THREE.LineBasicMaterial({ color: 0x3a2410 }),
            );
            mesh.add(edges);
        } else if (def.id === 'drone') {
            // ドローン：4つのローターと発光ライト
            const rotorGeo = new THREE.CylinderGeometry(def.size * 0.28, def.size * 0.28, def.size * 0.06, 16);
            const rotorMat = new THREE.MeshStandardMaterial({ color: 0x10141a, metalness: 0.6, roughness: 0.4 });
            const arm = def.size * 0.55;
            for (const [dx, dz] of [[-arm, -arm], [arm, -arm], [-arm, arm], [arm, arm]]) {
                const rotor = new THREE.Mesh(rotorGeo, rotorMat);
                rotor.position.set(dx, def.size * 0.5, dz);
                mesh.add(rotor);
            }
            const light = new THREE.Mesh(
                new THREE.SphereGeometry(def.size * 0.12, 12, 12),
                new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.2 }),
            );
            light.position.set(0, def.size * 0.62, 0);
            mesh.add(light);
        } else if (def.id === 'reactor') {
            // 核融合リアクター：発光するリングを3段まとう
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 1.2 });
            for (const y of [-def.height * 0.28, 0, def.height * 0.28]) {
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(def.size * 1.08, def.size * 0.08, 12, 24),
                    ringMat,
                );
                ring.rotation.x = Math.PI / 2;
                ring.position.y = y;
                mesh.add(ring);
            }
        } else if (def.id === 'ufo') {
            // UFO：上部ドーム＋底面の発光ライト
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(def.size * 0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x2266ff, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }),
            );
            dome.position.y = def.height * 0.4;
            mesh.add(dome);
            const lightMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.4 });
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const led = new THREE.Mesh(new THREE.SphereGeometry(def.size * 0.07, 8, 8), lightMat);
                led.position.set(Math.cos(a) * def.size * 0.85, -def.height * 0.2, Math.sin(a) * def.size * 0.85);
                mesh.add(led);
            }
        } else if (def.id === 'robot') {
            // ロボット：頭・目・腕を付ける
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7888, metalness: 0.6, roughness: 0.4 });
            const head = new THREE.Mesh(new THREE.BoxGeometry(def.size * 0.6, def.size * 0.5, def.size * 0.6), bodyMat);
            head.position.y = def.size * 0.75;
            mesh.add(head);
            const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 1.4 });
            for (const dx of [-0.15, 0.15]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(def.size * 0.06, 8, 8), eyeMat);
                eye.position.set(def.size * dx, def.size * 0.78, def.size * 0.3);
                mesh.add(eye);
            }
            const armGeo = new THREE.BoxGeometry(def.size * 0.18, def.size * 0.55, def.size * 0.18);
            for (const dx of [-0.6, 0.6]) {
                const arm = new THREE.Mesh(armGeo, bodyMat);
                arm.position.set(def.size * dx, def.size * 0.05, 0);
                mesh.add(arm);
            }
        }
    }

    private shootWeapon() {
        const def = getWeapon(this.gameSystem.currentWeapon);

        // 装備が変わったらマガジンを満タンにする
        if (def.id !== this.ammoWeaponId) {
            this.ammoWeaponId = def.id;
            this.ammoLeft = def.ammo;
            this.reloading = false;
            this.refreshAmmoDisplay();
        }

        // リロード中は撃てない
        if (this.reloading) return;

        // 連射レート制限
        const now = performance.now() / 1000;
        if (now - this.lastShotAt < def.fireCooldown) return;

        // 弾切れ → リロード開始
        if (this.ammoLeft <= 0) {
            this.startReload(def);
            return;
        }

        this.lastShotAt = now;
        if (Number.isFinite(def.ammo)) {
            this.ammoLeft -= 1;
        }
        this.refreshAmmoDisplay();

        // XRカメラの実際のワールド姿勢を使う（背景が消える＝弾が原点に湧く問題の対策）
        const { position: camPos, quaternion: camQuat } = this.gameManager.getCameraPose();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);

        this.sound.shoot();

        // burst 発分の弾を生成（マシンガン/散弾対応）
        for (let i = 0; i < def.burst; i++) {
            this.spawnProjectile(def, camPos, forward);
        }

        // 撃ち切ったら自動リロード
        if (Number.isFinite(def.ammo) && this.ammoLeft <= 0) {
            this.startReload(def);
        }
    }

    private startReload(def: WeaponDef) {
        if (this.reloading || !Number.isFinite(def.ammo)) return;
        this.reloading = true;
        this.uiManager.updateAmmo('リロード中…');
        window.setTimeout(() => {
            // リロード完了時にまだ同じ武器なら反映
            if (this.gameSystem.currentWeapon === def.id) {
                this.ammoLeft = def.ammo;
                this.reloading = false;
                this.refreshAmmoDisplay();
            }
        }, def.reloadTime * 1000);
    }

    // 弾薬表示を更新する（AR開始時や装備変更時にも呼ぶ）
    public refreshAmmoDisplay() {
        const def = getWeapon(this.gameSystem.currentWeapon);
        if (this.ammoWeaponId !== def.id) {
            this.ammoWeaponId = def.id;
            this.ammoLeft = def.ammo;
            this.reloading = false;
        }
        if (!Number.isFinite(def.ammo)) {
            this.uiManager.updateAmmo('🔫 ∞');
        } else {
            this.uiManager.updateAmmo(`🔫 ${this.ammoLeft} / ${def.ammo}`);
        }
    }

    // 武器ごとの弾の形状を生成する。elongated=true の弾は進行方向へ向ける。
    private createProjectileGeometry(def: WeaponDef): { geometry: THREE.BufferGeometry; elongated: boolean } {
        const r = def.radius;
        switch (def.projectileShape) {
            case 'box':
                // マシンガンの弾（小さく細長い弾頭）
                return { geometry: new THREE.BoxGeometry(r * 1.2, r * 3, r * 1.2), elongated: true };
            case 'cylinder':
                // レールガンのダート（細長い棒）
                return { geometry: new THREE.CylinderGeometry(r, r, r * 8, 12), elongated: true };
            case 'cone':
                // ロケット（ミサイル状）
                return { geometry: new THREE.ConeGeometry(r, r * 3.5, 16), elongated: true };
            case 'crystal':
                // プラズマ（エネルギーの塊）
                return { geometry: new THREE.IcosahedronGeometry(r, 0), elongated: false };
            case 'tetra':
                // 散弾の破片
                return { geometry: new THREE.TetrahedronGeometry(r, 0), elongated: false };
            case 'sphere':
            default:
                return { geometry: new THREE.SphereGeometry(r, 16, 16), elongated: false };
        }
    }

    private spawnProjectile(
        def: WeaponDef,
        camPos: THREE.Vector3,
        forward: THREE.Vector3,
    ) {
        const { geometry, elongated } = this.createProjectileGeometry(def);
        const material = new THREE.MeshStandardMaterial({
            color: def.color,
            emissive: def.emissive,
            emissiveIntensity: def.emissive ? 1.0 : 0,
            metalness: 0.4,
            roughness: 0.4,
        });
        const mesh = new THREE.Mesh(geometry, material);

        // 拡散を加味した発射方向
        const dir = forward.clone();
        if (def.spread > 0) {
            dir.x += (Math.random() - 0.5) * def.spread;
            dir.y += (Math.random() - 0.5) * def.spread;
            dir.z += (Math.random() - 0.5) * def.spread;
            dir.normalize();
        }

        // カメラの少し前方から発射する（視界を覆わないように）
        const startPos = camPos.clone().add(forward.clone().multiplyScalar(0.3));
        mesh.position.copy(startPos);

        const shape = new CANNON.Sphere(def.radius);
        const body = new CANNON.Body({
            mass: def.mass,
            material: this.physicsMaterial,
            position: new CANNON.Vec3(startPos.x, startPos.y, startPos.z),
        });
        body.addShape(shape);

        // 弾の威力（武器強化レベルで増える）をボディに持たせる
        (body as any).__damage = this.gameSystem.getWeaponDamage(def.id);

        // 細長い弾（ダート/ミサイル等）は進行方向へ向ける。
        // 物理は球なので回転しない＝body.quaternion を固定すれば見た目が安定する。
        if (elongated) {
            const q = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                dir.clone().normalize(),
            );
            body.quaternion.set(q.x, q.y, q.z, q.w);
        }

        // dir は既にワールド座標系の向きなので追加の回転は不要
        body.velocity.set(dir.x * def.speed, dir.y * def.speed, dir.z * def.speed);

        // 爆発系の武器は着弾時に周囲を吹き飛ばす＋爆発演出
        if (def.explosive) {
            let exploded = false;
            body.addEventListener('collide', () => {
                if (exploded) return;
                exploded = true;
                this.gameManager.applyExplosion(body.position, def.explosionRadius, def.explosionForce);
                this.spawnExplosionFlash(
                    new THREE.Vector3(body.position.x, body.position.y, body.position.z),
                    def.explosionRadius,
                    0xffaa33,
                );
                this.sound.explosion();
            });
        }

        this.gameManager.addPhysicsObject(mesh, body, 'projectile');
    }
}
