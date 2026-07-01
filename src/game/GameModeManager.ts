import * as THREE from 'three';
import { GameManager } from './GameManager';
import { XRManager } from '../ar/XRManager';
import { GameSystem } from './GameSystem';
import { InteractionManager } from './InteractionManager';
import { UIManager } from '../ui/UIManager';
import type { GameMode } from '../ui/UIManager';
import { NORMAL_TARGETS, getTarget } from './Items';
import { SoundManager } from '../audio/SoundManager';

// フリー / タイムアタック / ウェーブ の3モードを管理する。
// タイム・ウェーブでは検出した床の周辺に標的を自動で湧かせてスコアを競う。
export class GameModeManager {
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;
    private interaction: InteractionManager;
    private ui: UIManager;
    private sound: SoundManager;

    private mode: GameMode = 'free';
    private running = false;

    private origin = new THREE.Vector3();
    private runScore = 0;
    private aliveCount = 0;
    private wave = 1;
    private timeLeft = 0;

    private tickTimer: number | null = null;
    private spawnTimer: number | null = null;
    private waveTimeout: number | null = null;
    private spawning = false; // ウェーブの標的を出している最中か

    private static readonly TIME_LIMIT = 60; // タイムアタックの制限時間（秒）
    private static readonly MAX_ALIVE = 6; // タイムアタックで同時に存在する標的の上限
    private static readonly WAVE_TIME_LIMIT = 30000; // 1ウェーブの制限時間(ms)。残党がいても次へ
    private static readonly BEST_TIME_KEY = 'argame01_best_time';
    private static readonly BEST_WAVE_KEY = 'argame01_best_wave';

    constructor(
        gameManager: GameManager,
        xrManager: XRManager,
        gameSystem: GameSystem,
        interaction: InteractionManager,
        ui: UIManager,
        sound: SoundManager,
    ) {
        this.gameManager = gameManager;
        this.xrManager = xrManager;
        this.gameSystem = gameSystem;
        this.interaction = interaction;
        this.ui = ui;
        this.sound = sound;

        // モード選択をUIから受け取る
        this.ui.onSelectMode = (mode) => this.selectMode(mode);

        // 加点はランスコアにも積む
        this.gameSystem.onScored = (points) => {
            if (this.running) {
                this.runScore += points;
                this.updateStatus();
            }
        };

        // AR を抜けたら走行中のモードを止める
        this.gameManager.renderer.xr.addEventListener('sessionend', () => this.stopSilently());
    }

    private selectMode(mode: GameMode) {
        // 走行中なら一旦終了（リザルト表示）
        if (this.running) {
            this.endRun();
        }

        if (mode === 'free') {
            this.mode = 'free';
            this.ui.setActiveMode('free');
            this.ui.updateModeStatus(null);
            return;
        }

        // タイム/ウェーブは床の検出が必要
        const origin = this.xrManager.getReticlePosition();
        if (!origin) {
            alert('床（緑のマーク）を映してから開始してください。');
            this.mode = 'free';
            this.ui.setActiveMode('free');
            return;
        }

        this.mode = mode;
        this.origin.copy(origin);
        this.runScore = 0;
        this.aliveCount = 0;
        this.running = true;
        this.gameSystem.startRun(); // リザルト用のラン統計をリセット

        if (mode === 'time') {
            this.timeLeft = GameModeManager.TIME_LIMIT;
            this.ui.showBanner('⏱ GO!');
            this.sound.waveStart();
            this.startTimeAttack();
        } else {
            this.wave = 1;
            this.startWave();
        }
        this.updateStatus();
    }

    // === タイムアタック ===
    private startTimeAttack() {
        // カウントダウン
        this.tickTimer = window.setInterval(() => {
            this.timeLeft -= 0.25;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.endRun();
                return;
            }
            this.updateStatus();
        }, 250);

        // 標的を一定間隔で湧かせる
        this.spawnTimer = window.setInterval(() => {
            if (this.aliveCount < GameModeManager.MAX_ALIVE) {
                this.spawnOne();
            }
        }, 1100);

        // 開始直後に2体出しておく
        this.spawnOne();
        this.spawnOne();
    }

    // === ウェーブ ===
    private startWave() {
        this.spawnWaveTargets();
    }

    private spawnWaveTargets() {
        if (this.waveTimeout !== null) { clearTimeout(this.waveTimeout); this.waveTimeout = null; }

        // ウェーブ開始の告知（ボス戦は強調）
        this.ui.showBanner(this.wave % 5 === 0 ? `⚠️ BOSS WAVE ${this.wave}` : `🌊 WAVE ${this.wave}`);
        this.sound.waveStart();

        // 5の倍数のウェーブはボス戦
        if (this.wave % 5 === 0) {
            this.spawning = false;
            this.spawnBoss();
        } else {
            const count = 2 + this.wave; // ウェーブが進むほど増える
            this.spawning = true;
            let spawned = 0;
            for (let i = 0; i < count; i++) {
                window.setTimeout(() => {
                    if (this.running && this.mode === 'wave') {
                        this.spawnOne();
                        spawned += 1;
                        if (spawned >= count) this.spawning = false;
                    }
                }, i * 300);
            }
        }

        // 安全策: 制限時間を過ぎたら残党がいても次のウェーブへ
        this.waveTimeout = window.setTimeout(() => {
            if (this.running && this.mode === 'wave') this.nextWave();
        }, GameModeManager.WAVE_TIME_LIMIT);
    }

    private spawnBoss() {
        const boss = getTarget('boss');
        this.aliveCount += 1;
        this.interaction.placeTarget(boss, this.origin.clone(), () => {
            this.aliveCount -= 1;
            this.updateStatus();
            this.onWaveTargetCleared();
        });
        this.updateStatus();
    }

    private onWaveTargetCleared() {
        if (this.mode !== 'wave' || !this.running) return;
        // まだ湧かせ途中なら待つ。全滅したら次へ。
        if (!this.spawning && this.aliveCount <= 0) {
            this.nextWave();
        }
    }

    // 次のウェーブへ進む（残党と弾は掃除する）
    private nextWave() {
        if (this.mode !== 'wave' || !this.running) return;
        if (this.waveTimeout !== null) { clearTimeout(this.waveTimeout); this.waveTimeout = null; }
        this.wave += 1;
        this.gameSystem.reportWave(this.wave); // 到達ウェーブを実績判定に反映
        this.gameManager.clearAllObjects(); // 取り逃した的・破片を一掃
        this.aliveCount = 0;
        this.updateStatus();
        window.setTimeout(() => {
            if (this.running && this.mode === 'wave') this.spawnWaveTargets();
        }, 900);
    }

    // === 共通 ===
    private spawnOne() {
        const def = NORMAL_TARGETS[Math.floor(Math.random() * NORMAL_TARGETS.length)];
        const angle = Math.random() * Math.PI * 2;
        const r = 0.35 + Math.random() * 0.7;
        const pos = new THREE.Vector3(
            this.origin.x + Math.cos(angle) * r,
            this.origin.y,
            this.origin.z + Math.sin(angle) * r,
        );
        this.aliveCount += 1;
        this.interaction.placeTarget(def, pos, () => {
            this.aliveCount -= 1;
            this.updateStatus();
            this.onWaveTargetCleared();
        });
        this.updateStatus();
    }

    private updateStatus() {
        if (!this.running) {
            this.ui.updateModeStatus(null);
            return;
        }
        if (this.mode === 'time') {
            this.ui.updateModeStatus(`⏱ ${Math.ceil(this.timeLeft)}s ｜ スコア ${this.runScore}`);
        } else if (this.mode === 'wave') {
            this.ui.updateModeStatus(`🌊 Wave ${this.wave} ｜ 残り ${this.aliveCount} ｜ スコア ${this.runScore}`);
        }
    }

    private clearTimers() {
        if (this.tickTimer !== null) { clearInterval(this.tickTimer); this.tickTimer = null; }
        if (this.spawnTimer !== null) { clearInterval(this.spawnTimer); this.spawnTimer = null; }
        if (this.waveTimeout !== null) { clearTimeout(this.waveTimeout); this.waveTimeout = null; }
        this.spawning = false;
    }

    // 走行終了＋リザルト表示
    private endRun() {
        if (!this.running) return;
        const endedMode = this.mode;
        const score = this.runScore;
        const wave = this.wave;

        this.running = false;
        this.clearTimers();
        this.gameManager.clearAllObjects();
        this.aliveCount = 0;

        // ラン統計（撃破数・最大コンボ・命中率）をリザルトに添える
        const stats = this.gameSystem.getRunStats();
        const accuracy = stats.shots > 0 ? Math.min(100, Math.round((stats.hits / stats.shots) * 100)) : 0;
        const statsLine = `<div class="result-stats">撃破 ${stats.destroyed}体 ｜ 最大コンボ x${stats.maxCombo} ｜ 命中率 ${accuracy}%</div>`;

        let text = '';
        if (endedMode === 'time') {
            this.gameSystem.reportTimeScore(score); // 実績判定に反映
            const { best, isNew } = this.saveBest(GameModeManager.BEST_TIME_KEY, score);
            const rank = this.getRank(score, [2000, 1200, 600]);
            const record = isNew ? '<div class="new-record">🎉 NEW RECORD!</div>' : `ベスト: ${best}`;
            text = `⏱ タイムアップ！<div class="result-rank rank-${rank}">RANK ${rank}</div>スコア: <b>${score}</b><br>${record}${statsLine}`;
            if (isNew) this.sound.fanfare();
        } else if (endedMode === 'wave') {
            const { best, isNew } = this.saveBest(GameModeManager.BEST_WAVE_KEY, wave);
            const rank = this.getRank(wave, [10, 7, 4]);
            const record = isNew ? '<div class="new-record">🎉 NEW RECORD!</div>' : `ベスト Wave: ${best}`;
            text = `🌊 ゲーム終了<div class="result-rank rank-${rank}">RANK ${rank}</div>到達 Wave: <b>${wave}</b> ｜ スコア: ${score}<br>${record}${statsLine}`;
            if (isNew) this.sound.fanfare();
        }

        this.mode = 'free';
        this.ui.setActiveMode('free');
        this.ui.updateModeStatus(null);
        if (text) this.ui.showResult(text);
    }

    // 成績のランク付け。thresholds は [S, A, B] の下限値
    private getRank(value: number, thresholds: [number, number, number]): 'S' | 'A' | 'B' | 'C' {
        if (value >= thresholds[0]) return 'S';
        if (value >= thresholds[1]) return 'A';
        if (value >= thresholds[2]) return 'B';
        return 'C';
    }

    // リザルトを出さずに停止（AR終了時など）
    private stopSilently() {
        this.running = false;
        this.clearTimers();
        this.aliveCount = 0;
        this.mode = 'free';
        this.ui.setActiveMode('free');
        this.ui.updateModeStatus(null);
    }

    private saveBest(key: string, value: number): { best: number; isNew: boolean } {
        const prev = Number(localStorage.getItem(key) ?? '0');
        const isNew = value > prev;
        const best = Math.max(prev, value);
        try { localStorage.setItem(key, String(best)); } catch { /* noop */ }
        return { best, isNew };
    }
}
