import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameManager } from './GameManager';
import { XRManager } from '../ar/XRManager';
import { GameSystem, GameState } from './GameSystem';

export class InteractionManager {
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;

    // 物理マテリアルの定義
    private physicsMaterial = new CANNON.Material("standard");

    constructor(gameManager: GameManager, xrManager: XRManager, gameSystem: GameSystem) {
        this.gameManager = gameManager;
        this.xrManager = xrManager;
        this.gameSystem = gameSystem;

        this.setupPhysicsContact();
        this.setupEventListeners();
    }

    private setupPhysicsContact() {
        // 地面用とオブジェクト用の接触設定 (反発係数など)
        const contactMaterial = new CANNON.ContactMaterial(
            this.physicsMaterial,
            this.physicsMaterial,
            { friction: 0.5, restitution: 0.3 }
        );
        this.gameManager.physicsManager.world.addContactMaterial(contactMaterial);

        // 見えない地面（AR用）
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0, material: this.physicsMaterial });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // X軸に90度回転
        // HitTestの基準面に合わせるため、Y=0に配置
        this.gameManager.physicsManager.world.addBody(groundBody);
    }

    private setupEventListeners() {
        const spawnBtn = document.getElementById('spawn-target-btn');
        const shootBtn = document.getElementById('shoot-btn');

        spawnBtn?.addEventListener('click', () => {
            this.spawnTarget();
            this.gameSystem.setState(GameState.SHOOTING);
        });

        shootBtn?.addEventListener('click', () => {
            this.shootWeapon();
        });
    }

    private spawnTarget() {
        const matrix = this.xrManager.getReticleMatrix();
        if (!matrix) {
            alert("平面が認識されていません。カメラを動かして緑のマークが出てからお試しください。");
            return;
        }

        const position = new THREE.Vector3();
        position.setFromMatrixPosition(matrix);

        let mesh: THREE.Mesh;
        let shape: CANNON.Shape;
        let mass = 1;

        if (this.gameSystem.currentTarget === 'barrel') {
            const radius = 0.15;
            const height = 0.4;
            const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
            const material = new THREE.MeshLambertMaterial({ color: 0xff3333 });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);
            mesh.position.y += height / 2;
            shape = new CANNON.Cylinder(radius, radius, height, 16);
            mass = 2; 
        } else {
            const size = 0.2;
            const geometry = new THREE.BoxGeometry(size, size, size);
            const material = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);
            mesh.position.y += size / 2;
            shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
        }

        const body = new CANNON.Body({
            mass: mass,
            material: this.physicsMaterial,
            position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z)
        });
        
        // cannon-esでのCylinderはデフォルトでZ軸方向を向くため、Y軸方向に立てるために回転させる
        if (this.gameSystem.currentTarget === 'barrel') {
            // ただし新しいcannon-esではQuaternionでShapeの向きを調整する必要はないかもしれない。
            // ひとまず回転を加えずにそのままaddShapeし、必要なら後で修正
            body.addShape(shape);
            // 倒れないように少し慣性モーメントを弄るか、そのままにする
        } else {
            body.addShape(shape);
        }

        // ポイント加算の多重発生を防ぐためのフラグ
        let scored = false;
        body.addEventListener("collide", (e: any) => {
            if (scored) return;
            const relativeVelocity = e.contact.getImpactVelocityAlongNormal();
            if(Math.abs(relativeVelocity) > 2) {
                const points = this.gameSystem.currentTarget === 'barrel' ? 30 : 10;
                this.gameSystem.addScore(points);
                scored = true; // 1つのターゲットにつきポイント加算は1回（あるいは時間制限）にする
                setTimeout(() => { scored = false; }, 1000); // 1秒後に再度加算可能に
            }
        });

        this.gameManager.addPhysicsObject(mesh, body);
    }

    private shootWeapon() {
        const camera = this.gameManager.camera;
        
        let radius = 0.05;
        let color = 0xff0000;
        let shootSpeed = 10;
        let mass = 0.5;

        if (this.gameSystem.currentWeapon === 'machineGun') {
            radius = 0.02;
            color = 0xffff00;
            shootSpeed = 25;
            mass = 0.1;
        }

        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const material = new THREE.MeshLambertMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(camera.position);
        
        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({
            mass: mass,
            material: this.physicsMaterial,
            position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z)
        });
        body.addShape(shape);

        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        
        body.velocity.set(
            direction.x * shootSpeed,
            direction.y * shootSpeed,
            direction.z * shootSpeed
        );

        this.gameManager.addPhysicsObject(mesh, body);
    }
}
