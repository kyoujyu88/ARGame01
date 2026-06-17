// ゲームで使用する武器・破壊対象オブジェクトの定義。
// ここにエントリを追加するだけでショップ・スポーン・発射処理に反映される
// データ駆動の構成にしている。

export type ShapeKind = 'box' | 'cylinder' | 'sphere' | 'crystal';

export interface WeaponDef {
    id: string;
    name: string;
    /** 購入に必要なポイント（0 は初期解放） */
    cost: number;
    /** 弾の半径 (m) */
    radius: number;
    /** 基本色 */
    color: number;
    /** 発光色（SF武器の光らせ用。0 で無発光） */
    emissive: number;
    /** 発射速度 (m/s) */
    speed: number;
    /** 弾の質量 (kg) */
    mass: number;
    /** 1回の発射で出る弾数（マシンガン/散弾用） */
    burst: number;
    /** 拡散角 (rad)。散弾系で使用 */
    spread: number;
    /** 着弾時に爆発（周囲に衝撃を与える）するか */
    explosive: boolean;
    /** 爆発の影響半径 (m) */
    explosionRadius: number;
    /** 爆発の衝撃力 */
    explosionForce: number;
}

export interface TargetDef {
    id: string;
    name: string;
    cost: number;
    shape: ShapeKind;
    color: number;
    emissive: number;
    /** 主寸法（box=一辺, sphere/crystal=半径, cylinder=半径） */
    size: number;
    /** cylinder の高さ */
    height: number;
    mass: number;
    /** 破壊（強い衝撃）で得られるポイント */
    points: number;
    /** 破壊時に連鎖爆発するか（ドラム缶・リアクターなど） */
    explosive: boolean;
    explosionRadius: number;
    explosionForce: number;
}

export const WEAPONS: WeaponDef[] = [
    {
        id: 'ball', name: 'ベースボール', cost: 0,
        radius: 0.05, color: 0xff3030, emissive: 0x000000,
        speed: 12, mass: 0.5, burst: 1, spread: 0,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'machineGun', name: 'マシンガン', cost: 100,
        radius: 0.025, color: 0xffcc00, emissive: 0x553300,
        speed: 28, mass: 0.12, burst: 3, spread: 0.04,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'plasma', name: 'プラズマキャノン [SF]', cost: 250,
        radius: 0.12, color: 0x00ffff, emissive: 0x00aaff,
        speed: 18, mass: 1.2, burst: 1, spread: 0,
        explosive: true, explosionRadius: 1.2, explosionForce: 14,
    },
    {
        id: 'scatter', name: 'スキャッターブラスター [SF]', cost: 350,
        radius: 0.035, color: 0xff00ff, emissive: 0x660066,
        speed: 22, mass: 0.15, burst: 6, spread: 0.22,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'railgun', name: 'レールガン [SF]', cost: 500,
        radius: 0.03, color: 0xeaffff, emissive: 0x66ccff,
        speed: 60, mass: 2.5, burst: 1, spread: 0,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'rocket', name: 'ロケットランチャー [SF]', cost: 750,
        radius: 0.08, color: 0xff8800, emissive: 0xff4400,
        speed: 20, mass: 1.0, burst: 1, spread: 0,
        explosive: true, explosionRadius: 2.0, explosionForce: 28,
    },
];

export const TARGETS: TargetDef[] = [
    {
        id: 'box', name: '木箱', cost: 0,
        shape: 'box', color: 0x8b5a2b, emissive: 0x000000,
        size: 0.2, height: 0.2, mass: 1, points: 10,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'barrel', name: '爆発ドラム缶', cost: 50,
        shape: 'cylinder', color: 0xff3333, emissive: 0x330000,
        size: 0.15, height: 0.4, mass: 2, points: 30,
        explosive: true, explosionRadius: 1.5, explosionForce: 18,
    },
    {
        id: 'can', name: 'スチール缶', cost: 80,
        shape: 'cylinder', color: 0xb0b8c0, emissive: 0x000000,
        size: 0.08, height: 0.18, mass: 0.4, points: 20,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'bowling', name: 'ボウリング球', cost: 120,
        shape: 'sphere', color: 0x202028, emissive: 0x000000,
        size: 0.12, height: 0, mass: 4, points: 25,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'crystal', name: 'エネルギークリスタル [SF]', cost: 200,
        shape: 'crystal', color: 0x00ffaa, emissive: 0x00ff88,
        size: 0.15, height: 0, mass: 0.8, points: 50,
        explosive: false, explosionRadius: 0, explosionForce: 0,
    },
    {
        id: 'drone', name: 'ホバードローン [SF]', cost: 350,
        shape: 'box', color: 0x3366ff, emissive: 0x2244aa,
        size: 0.18, height: 0.18, mass: 0.5, points: 70,
        explosive: true, explosionRadius: 1.0, explosionForce: 10,
    },
    {
        id: 'reactor', name: '核融合リアクター [SF]', cost: 500,
        shape: 'cylinder', color: 0xffee44, emissive: 0xffaa00,
        size: 0.2, height: 0.45, mass: 3, points: 100,
        explosive: true, explosionRadius: 2.5, explosionForce: 35,
    },
];

export function getWeapon(id: string): WeaponDef {
    return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function getTarget(id: string): TargetDef {
    return TARGETS.find((t) => t.id === id) ?? TARGETS[0];
}
