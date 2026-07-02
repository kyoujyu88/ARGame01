// 実績（アチーブメント）の定義。
// 解除条件は累計統計 LifetimeStats に対する判定関数で表す。
// ここにエントリを追加するだけで判定・実績パネル・報酬進呈に反映される。

export interface LifetimeStats {
    /** 累計発射回数（トリガーを引いた回数） */
    shots: number;
    /** 累計命中回数（弾が標的に当たった回数） */
    hits: number;
    /** 累計破壊数 */
    destroyed: number;
    /** これまでの最大コンボ */
    maxCombo: number;
    /** ウェーブモードの最高到達ウェーブ */
    bestWave: number;
    /** タイムアタックの最高スコア */
    bestTimeScore: number;
}

export interface AchievementDef {
    id: string;
    icon: string;
    name: string;
    desc: string;
    /** 解除時にもらえるポイント */
    reward: number;
    /** 解除条件（累計統計に対する判定） */
    test: (s: LifetimeStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
    { id: 'first_break', icon: '🎯', name: 'はじめの一撃', desc: '標的を1体破壊する', reward: 30, test: (s) => s.destroyed >= 1 },
    { id: 'break_50', icon: '💥', name: 'デモリッション', desc: '累計50体破壊する', reward: 100, test: (s) => s.destroyed >= 50 },
    { id: 'break_200', icon: '🏗️', name: '解体マイスター', desc: '累計200体破壊する', reward: 300, test: (s) => s.destroyed >= 200 },
    { id: 'break_500', icon: '👑', name: '破壊の王', desc: '累計500体破壊する', reward: 500, test: (s) => s.destroyed >= 500 },
    { id: 'combo_5', icon: '🔥', name: 'ノリノリ', desc: 'コンボ x5 を達成する', reward: 50, test: (s) => s.maxCombo >= 5 },
    { id: 'combo_10', icon: '⚡', name: 'コンボマスター', desc: 'コンボ x10 を達成する', reward: 150, test: (s) => s.maxCombo >= 10 },
    { id: 'shots_300', icon: '🔫', name: 'トリガーハッピー', desc: '累計300回発射する', reward: 80, test: (s) => s.shots >= 300 },
    { id: 'wave_5', icon: '🌊', name: 'ボスハンター', desc: 'ウェーブ5に到達する', reward: 100, test: (s) => s.bestWave >= 5 },
    { id: 'wave_10', icon: '🚀', name: 'ウェーブの覇者', desc: 'ウェーブ10に到達する', reward: 300, test: (s) => s.bestWave >= 10 },
    { id: 'time_1500', icon: '⏱️', name: 'スピードスター', desc: 'タイムアタックで1500点を獲得する', reward: 150, test: (s) => s.bestTimeScore >= 1500 },
];
