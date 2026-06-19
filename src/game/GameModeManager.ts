import * as THREE from 'three';
import { GameManager } from './GameManager';
import { XRManager } from '../ar/XRManager';
import { GameSystem } from './GameSystem';
import { InteractionManager } from './InteractionManager';
import { UIManager } from '../ui/UIManager';
import type { GameMode } from '../ui/UIManager';
import { NORMAL_TARGETS, getTarget } from './Items';

// フリー / タイムアタック / ウェーブ の3モードを管理する。
// タイム・ウェーブでは検出した床の周辺に標的を自動で湧かせてスコアを競う。
export class GameModeManager {
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;
    private interaction: InteractionManager;
    private ui: UIManager;

    private mode: GameMode = 'free';
    private running = false;

    private origin = new THREE.Vector3();
    private runScore = 0;
    private aliveCount = 0;
    private wave = 1;
    private timeLeft = 0;

    private tickTimer: number | null = null;
    private spawnTimer: number | null = null;

    private static readonly TIME_LIMIT = 60; // タイムアタックの制限時間（秒）
    private static readonly MAX_ALIVE = 6; // タイムアタックで同時に存在する標的の上限
    private static readonly BEST_TIME_KEY = 'argame01_best_time';
    private static readonly BEST_WAVE_KEY = 'argame01_best_wave';

    constructor(
        gameManager: GameManager,
        xrManager: XRManager,
        gameSystem: GameSystem,
        interaction: InteractionManager,
        ui: UIManager,
    ) {
        this.gameManager = gameManager;
        this.xrManager = xrManager;
        this.gameSystem = gameSystem;
        this.interaction = interaction;
        this.ui = ui;

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

        if (mode === 'time') {
            this.timeLeft = GameModeManager.TIME_LIMIT;
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
        // 5の倍数のウェーブはボス戦
        if (this.wave % 5 === 0) {
            this.spawnBoss();
            return;
        }
        const count = 2 + this.wave; // ウェーブが進むほど増える
        for (let i = 0; i < count; i++) {
            // 少しずつ時間差で出す
            window.setTimeout(() => {
                if (this.running && this.mode === 'wave') this.spawnOne();
            }, i * 250);
        }
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
        if (this.aliveCount <= 0) {
            // 次のウェーブへ
            this.wave += 1;
            this.updateStatus();
            window.setTimeout(() => {
                if (this.running && this.mode === 'wave') this.spawnWaveTargets();
            }, 800);
        }
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

        let text = '';
        if (endedMode === 'time') {
            const best = this.saveBest(GameModeManager.BEST_TIME_KEY, score);
            text = `⏱ タイムアップ！<br>スコア: <b>${score}</b><br>ベスト: ${best}`;
        } else if (endedMode === 'wave') {
            const best = this.saveBest(GameModeManager.BEST_WAVE_KEY, wave);
            text = `🌊 ゲーム終了<br>到達 Wave: <b>${wave}</b><br>スコア: ${score}<br>ベスト Wave: ${best}`;
        }

        this.mode = 'free';
        this.ui.setActiveMode('free');
        this.ui.updateModeStatus(null);
        if (text) this.ui.showResult(text);
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

    private saveBest(key: string, value: number): number {
        const prev = Number(localStorage.getItem(key) ?? '0');
        const best = Math.max(prev, value);
        try { localStorage.setItem(key, String(best)); } catch { /* noop */ }
        return best;
    }
}
