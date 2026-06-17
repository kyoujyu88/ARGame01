import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsManager } from '../physics/PhysicsManager';

interface PhysicsEntry {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    kind: 'projectile' | 'target';
}

export class GameManager {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public physicsManager: PhysicsManager;
    private clock: THREE.Clock;

    // 同期用の配列 (Three.js Mesh と Cannon.js Body のペア)
    private physicsObjects: PhysicsEntry[] = [];

    // 弾が増え続けて重くなる／視界を覆うのを防ぐための上限
    private static readonly MAX_PROJECTILES = 25;

    // 毎フレーム呼ばれるコールバック（XRのhit-testなどが登録する）
    private frameCallbacks: ((time: number, frame: any) => void)[] = [];

    constructor() {
        this.physicsManager = new PhysicsManager();
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        const canvas = document.createElement('canvas');
        const appDiv = document.getElementById('app');
        if (appDiv) {
            appDiv.appendChild(canvas);
        }

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: canvas });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true; // WebXRの有効化
        this.renderer.xr.setReferenceSpaceType('local'); // 空間認識の基準座標系を明示的に設定

        this.setupLights();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        // レンダープールの開始
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    private setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // 毎フレーム実行したい処理を登録する（XRManagerのhit-testなど）
    public onFrame(callback: (time: number, frame: any) => void) {
        this.frameCallbacks.push(callback);
    }

    private render(time: number, frame: any) {
        // 登録されたフレームコールバック（hit-test等）を先に実行
        for (const cb of this.frameCallbacks) {
            cb(time, frame);
        }

        const dt = this.clock.getDelta();

        // 物理演算の更新
        this.physicsManager.update(dt);

        // Three.jsオブジェクトと物理ボディの位置・回転を同期
        for (const obj of this.physicsObjects) {
            obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
            obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
        }

        this.renderer.render(this.scene, this.camera);
    }

    // 外部からオブジェクトを追加するインターフェース
    public addPhysicsObject(mesh: THREE.Mesh, body: CANNON.Body, kind: 'projectile' | 'target' = 'target') {
        this.scene.add(mesh);
        this.physicsManager.addBody(body);
        this.physicsObjects.push({ mesh, body, kind });

        // 弾は古いものから自動的に消して、増えすぎを防ぐ
        if (kind === 'projectile') {
            const projectiles = this.physicsObjects.filter((o) => o.kind === 'projectile');
            if (projectiles.length > GameManager.MAX_PROJECTILES) {
                this.removeEntry(projectiles[0]);
            }
        }
    }

    private removeEntry(entry: PhysicsEntry) {
        this.scene.remove(entry.mesh);
        this.physicsManager.removeBody(entry.body);
        if (entry.mesh.geometry) entry.mesh.geometry.dispose();
        const mat = entry.mesh.material;
        if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
        } else if (mat) {
            mat.dispose();
        }
        const idx = this.physicsObjects.indexOf(entry);
        if (idx !== -1) this.physicsObjects.splice(idx, 1);
    }

    // 指定したボディを探して破棄する（標的の破壊などで使用）
    public removeBody(body: CANNON.Body) {
        const entry = this.physicsObjects.find((o) => o.body === body);
        if (entry) this.removeEntry(entry);
    }

    // 爆発：中心から半径内の全ボディに放射状の衝撃を与える
    public applyExplosion(center: CANNON.Vec3, radius: number, force: number) {
        for (const obj of this.physicsObjects) {
            const dir = new CANNON.Vec3(
                obj.body.position.x - center.x,
                obj.body.position.y - center.y,
                obj.body.position.z - center.z,
            );
            const dist = dir.length();
            if (dist > radius || dist < 1e-4) continue;
            // 近いほど強い衝撃（距離による減衰）
            const falloff = 1 - dist / radius;
            dir.normalize();
            const impulse = new CANNON.Vec3(
                dir.x * force * falloff,
                (dir.y * force * falloff) + force * 0.3 * falloff, // やや上向きに吹き飛ばす
                dir.z * force * falloff,
            );
            obj.body.applyImpulse(impulse, obj.body.position);
        }
    }

    // 現在のカメラのワールド姿勢を取得する。
    // WebXR中は描画に使われる XR カメラ（renderer.xr.getCamera()）を参照する。
    // アプリ用 this.camera は XR 中に更新されず原点のままになるため、
    // 弾の発射位置・向きには必ずこちらを使う。
    public getCameraPose(): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
        const cam = this.renderer.xr.isPresenting
            ? this.renderer.xr.getCamera()
            : this.camera;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        cam.getWorldPosition(position);
        cam.getWorldQuaternion(quaternion);
        return { position, quaternion };
    }
}
