import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameManager } from './GameManager';
import { XRManager } from '../ar/XRManager';
import { GameSystem, GameState } from './GameSystem';
import { getWeapon, getTarget } from './Items';
import type { WeaponDef, TargetDef } from './Items';

export class InteractionManager {
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;

    // 物理マテリアルの定義
    private physicsMaterial = new CANNON.Material('standard');

    // AR用の見えない地面。検出した平面の高さ(Y)に合わせて毎回移動させる
    private groundBody: CANNON.Body;

    constructor(gameManager: GameManager, xrManager: XRManager, gameSystem: GameSystem) {
        this.gameManager = gameManager;
        this.xrManager = xrManager;
        this.gameSystem = gameSystem;

        this.groundBody = this.setupPhysicsContact();
        this.setupEventListeners();
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
    }

    private setupEventListeners() {
        // AR を開始するたびにゲーム状態を初期化し、設置ボタンを再表示する。
        // （前回セッションで SHOOTING のまま終了するとボタンが隠れたままになるため）
        this.gameManager.renderer.xr.addEventListener('sessionstart', () => {
            this.gameSystem.setState(GameState.PLACING);
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

    private spawnTarget(): boolean {
        const matrix = this.xrManager.getReticleMatrix();
        if (!matrix) {
            alert('平面が認識されていません。カメラを動かして緑のマークが出てからお試しください。');
            return false;
        }

        const position = new THREE.Vector3();
        position.setFromMatrixPosition(matrix);

        // 検出した平面の高さに地面を合わせる（浮き防止）
        this.updateGroundHeight(position.y);

        const def = getTarget(this.gameSystem.currentTarget);
        const { mesh, shape, centerOffsetY } = this.createTargetVisual(def, position);

        const body = new CANNON.Body({
            mass: def.mass,
            material: this.physicsMaterial,
            position: new CANNON.Vec3(position.x, position.y + centerOffsetY, position.z),
        });
        body.addShape(shape);

        // ドローンは少し浮いた状態から始める（SF演出）
        if (def.id === 'drone') {
            body.position.y += 0.3;
            mesh.position.y += 0.3;
        }

        // ポイント加算の多重発生を防ぐためのフラグ
        let scored = false;
        body.addEventListener('collide', (e: any) => {
            if (scored) return;
            // 弾が当たったときだけ加点する（落下や地面との接触では入らない）
            const other = e.body;
            const hitByProjectile = other && other.__kind === 'projectile';
            const relativeVelocity = Math.abs(e.contact.getImpactVelocityAlongNormal());
            if (hitByProjectile && relativeVelocity > 1.5) {
                scored = true;
                this.gameSystem.addScore(def.points);

                // 爆発系の標的は連鎖爆発を起こす
                if (def.explosive) {
                    this.gameManager.applyExplosion(body.position, def.explosionRadius, def.explosionForce);
                }
            }
        });

        this.gameManager.addPhysicsObject(mesh, body, 'target');
        return true;
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
            case 'box':
            default: {
                geometry = new THREE.BoxGeometry(def.size, def.size, def.size);
                shape = new CANNON.Box(new CANNON.Vec3(def.size / 2, def.size / 2, def.size / 2));
                centerOffsetY = def.size / 2;
                break;
            }
        }

        const material = new THREE.MeshStandardMaterial({
            color: def.color,
            emissive: def.emissive,
            emissiveIntensity: def.emissive ? 0.8 : 0,
            metalness: 0.3,
            roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y + centerOffsetY, position.z);
        return { mesh, shape, centerOffsetY };
    }

    private shootWeapon() {
        const def = getWeapon(this.gameSystem.currentWeapon);

        // XRカメラの実際のワールド姿勢を使う（背景が消える＝弾が原点に湧く問題の対策）
        const { position: camPos, quaternion: camQuat } = this.gameManager.getCameraPose();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);

        // burst 発分の弾を生成（マシンガン/散弾対応）
        for (let i = 0; i < def.burst; i++) {
            this.spawnProjectile(def, camPos, forward);
        }
    }

    private spawnProjectile(
        def: WeaponDef,
        camPos: THREE.Vector3,
        forward: THREE.Vector3,
    ) {
        const geometry = new THREE.SphereGeometry(def.radius, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: def.color,
            emissive: def.emissive,
            emissiveIntensity: def.emissive ? 1.0 : 0,
            metalness: 0.4,
            roughness: 0.4,
        });
        const mesh = new THREE.Mesh(geometry, material);

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

        // 拡散を加味した発射方向
        const dir = forward.clone();
        if (def.spread > 0) {
            dir.x += (Math.random() - 0.5) * def.spread;
            dir.y += (Math.random() - 0.5) * def.spread;
            dir.z += (Math.random() - 0.5) * def.spread;
            dir.normalize();
        }
        // dir は既にワールド座標系の向きなので追加の回転は不要
        body.velocity.set(dir.x * def.speed, dir.y * def.speed, dir.z * def.speed);

        // 爆発系の武器は着弾時に周囲を吹き飛ばす
        if (def.explosive) {
            let exploded = false;
            body.addEventListener('collide', () => {
                if (exploded) return;
                exploded = true;
                this.gameManager.applyExplosion(body.position, def.explosionRadius, def.explosionForce);
            });
        }

        this.gameManager.addPhysicsObject(mesh, body, 'projectile');
    }
}
