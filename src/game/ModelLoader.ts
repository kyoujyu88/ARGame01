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
        if (cached) return Promise.resolve(cached.clone());

        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (gltf) => {
                    this.cache.set(url, gltf.scene);
                    resolve(gltf.scene.clone());
                },
                undefined,
                (err) => reject(err),
            );
        });
    }
}
