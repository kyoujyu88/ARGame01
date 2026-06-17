import * as CANNON from 'cannon-es';

export class PhysicsManager {
    public world: CANNON.World;

    constructor() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0), // 地球の重力
        });

        // 接触材質の設定などは後ほど追加
    }

    public update(dt: number) {
        this.world.step(1 / 60, dt, 3);
    }

    public addBody(body: CANNON.Body) {
        this.world.addBody(body);
    }

    public removeBody(body: CANNON.Body) {
        this.world.removeBody(body);
    }
}
