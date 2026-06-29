import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsManager } from '../physics/PhysicsManager';

type ObjectKind = 'projectile' | 'target' | 'fragment';

interface PhysicsEntry {
    mesh: THREE.Object3D;
    body: CANNON.Body;
    kind: ObjectKind;
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

    // 一時的な視覚エフェクト（爆発フラッシュ・ヒットスパークなど）
    private effects: {
        object: THREE.Object3D;
        age: number;
        ttl: number;
        onUpdate: (t: number, object: THREE.Object3D) => void;
    }[] = [];

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
        // 影を有効化（オブジェクトが床に影を落としてリッチに見える）
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.setupLights();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        // レンダープールの開始
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    private setupLights() {
        // 空と地面で色を変える環境光でメリハリを出す
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.7);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(3, 6, 4);
        directionalLight.castShadow = true;
        // AR スケール（数メートル）に合わせて影カメラと解像度を設定
        directionalLight.shadow.mapSize.set(1024, 1024);
        const cam = directionalLight.shadow.camera;
        cam.near = 0.1;
        cam.far = 30;
        cam.left = -3;
        cam.right = 3;
        cam.top = 3;
        cam.bottom = -3;
        directionalLight.shadow.bias = -0.002;
        this.scene.add(directionalLight);
        this.scene.add(directionalLight.target);
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

        // 動く標的（キネマティック）の位置をスクリプトで更新する
        for (const obj of this.physicsObjects) {
            const mover = (obj.body as any).__mover;
            if (!mover) continue;
            mover.t += dt * mover.speed;
            if (mover.type === 'hover') {
                obj.body.position.y = mover.oy + Math.sin(mover.t) * mover.range;
            } else if (mover.type === 'strafe') {
                obj.body.position.x = mover.ox + Math.sin(mover.t) * mover.range;
            } else if (mover.type === 'spin') {
                obj.body.position.x = mover.ox + Math.cos(mover.t) * mover.range;
                obj.body.position.z = mover.oz + Math.sin(mover.t) * mover.range;
                obj.body.position.y = mover.oy + Math.sin(mover.t * 2) * 0.03;
            }
        }

        // Three.jsオブジェクトと物理ボディの位置・回転を同期
        for (const obj of this.physicsObjects) {
            obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
            obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
        }

        // 一時エフェクトの更新（寿命が来たら破棄）
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i];
            fx.age += dt;
            const t = Math.min(1, fx.age / fx.ttl);
            fx.onUpdate(t, fx.object);
            if (fx.age >= fx.ttl) {
                this.scene.remove(fx.object);
                this.disposeObject(fx.object);
                this.effects.splice(i, 1);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    // 一時的な視覚エフェクトを登録する。onUpdate は進捗 t(0→1) で毎フレーム呼ばれる
    public addEffect(object: THREE.Object3D, ttl: number, onUpdate: (t: number, object: THREE.Object3D) => void) {
        this.scene.add(object);
        this.effects.push({ object, age: 0, ttl, onUpdate });
    }

    private disposeObject(object: THREE.Object3D) {
        object.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            const mat = m.material;
            if (Array.isArray(mat)) {
                mat.forEach((mm) => mm.dispose());
            } else if (mat) {
                mat.dispose();
            }
        });
    }

    // 外部からオブジェクトを追加するインターフェース
    public addPhysicsObject(mesh: THREE.Object3D, body: CANNON.Body, kind: ObjectKind = 'target') {
        // 衝突判定で「弾が当たったか」を区別できるよう、ボディに種別を付与する
        (body as any).__kind = kind;
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

    // 配置したオブジェクトと弾をすべて消去する（AR終了時などに使用）
    public clearAllObjects() {
        // removeEntry が配列を変更するため、コピーに対して回す
        for (const entry of [...this.physicsObjects]) {
            this.removeEntry(entry);
        }
    }

    private removeEntry(entry: PhysicsEntry) {
        this.scene.remove(entry.mesh);
        this.physicsManager.removeBody(entry.body);
        // 子要素を含めてジオメトリ・マテリアルを破棄する（複合メッシュ対応）
        entry.mesh.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            const mat = m.material;
            if (Array.isArray(mat)) {
                mat.forEach((mm) => mm.dispose());
            } else if (mat) {
                mat.dispose();
            }
        });
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

    // 指定範囲内の物理ボディを取得する（爆風ダメージなどのゲームロジック用）
    public getBodiesInRadius(center: CANNON.Vec3, radius: number, kind?: ObjectKind): CANNON.Body[] {
        return this.physicsObjects
            .filter((obj) => !kind || obj.kind === kind)
            .filter((obj) => obj.body.position.distanceTo(center) <= radius)
            .map((obj) => obj.body);
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
