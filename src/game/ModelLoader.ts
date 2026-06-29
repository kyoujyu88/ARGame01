import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 外部3Dモデル(GLTF/GLB)を読み込んでキャッシュするローダー。
// 標的/武器の定義に modelUrl を指定すると、プリミティブの代わりに
// このモデルが使われる（public/models/ に .glb を置く運用を想定）。
// モデルが無い/失敗した場合は呼び出し側でプリミティブにフォールバックする。
export class ModelLoader {
    private loader = new GLTFLoader();
    private cache = new Map<string, THREE.Group>();

    load(url: string): Promise<THREE.Group> {
        const cached = this.cache.get(url);
        if (cached) return Promise.resolve(this.cloneModel(cached));

        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (gltf) => {
                    this.cache.set(url, gltf.scene);
                    resolve(this.cloneModel(gltf.scene));
                },
                undefined,
                (err) => reject(err),
            );
        });
    }

    // Three.js の clone() はジオメトリ・マテリアルを共有するため、
    // 破壊時に一体分のマテリアルを dispose すると他の同型モデルまで壊れて見える。
    // 各配置インスタンスで安全に破棄できるよう、マテリアルだけは必ず複製する。
    private cloneModel(source: THREE.Group): THREE.Group {
        const clone = source.clone(true);
        clone.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || !mesh.material) return;
            mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((mat) => mat.clone())
                : mesh.material.clone();
        });
        return clone;
    }
}
