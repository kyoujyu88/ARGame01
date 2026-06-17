import * as THREE from 'three';
import { PhysicsManager } from '../physics/PhysicsManager';
import { UIManager } from '../ui/UIManager';

export class GameManager {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public physicsManager: PhysicsManager;
    private uiManager: UIManager;
    private clock: THREE.Clock;

    // 同期用の配列 (Three.js Mesh と Cannon.js Body のペア)
    private physicsObjects: { mesh: THREE.Mesh, body: any }[] = [];

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
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

    private render() {
        const dt = this.clock.getDelta();

        // 物理演算の更新
        this.physicsManager.update(dt);

        // Three.jsオブジェクトと物理ボディの位置・回転を同期
        for (const obj of this.physicsObjects) {
            obj.mesh.position.copy(obj.body.position);
            obj.mesh.quaternion.copy(obj.body.quaternion);
        }

        this.renderer.render(this.scene, this.camera);
    }

    // 外部からオブジェクトを追加するインターフェース
    public addPhysicsObject(mesh: THREE.Mesh, body: any) {
        this.scene.add(mesh);
        this.physicsManager.addBody(body);
        this.physicsObjects.push({ mesh, body });
    }
}
