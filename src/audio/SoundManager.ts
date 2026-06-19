// WebAudio で効果音をその場で合成して鳴らす（音源ファイル不要）。
// AudioContext はユーザー操作（タップ）後にしか開始できないため、
// 最初の発音時に生成・resume する。

export class SoundManager {
    private ctx: AudioContext | null = null;
    private muted = false;

    private static readonly STORAGE_KEY = 'argame01_muted';

    constructor() {
        this.muted = localStorage.getItem(SoundManager.STORAGE_KEY) === '1';
    }

    public isMuted(): boolean {
        return this.muted;
    }

    public setMuted(muted: boolean) {
        this.muted = muted;
        try {
            localStorage.setItem(SoundManager.STORAGE_KEY, muted ? '1' : '0');
        } catch { /* noop */ }
    }

    public toggleMuted(): boolean {
        this.setMuted(!this.muted);
        return this.muted;
    }

    private ensureCtx(): AudioContext {
        if (!this.ctx) {
            const Ctor = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new Ctor();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { /* noop */ });
        }
        return this.ctx;
    }

    // 単純なトーン（周波数スライド対応）
    private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
        if (this.muted) return;
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
        }
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
    }

    // ホワイトノイズの破裂音（爆発・破壊用）
    private noiseBurst(dur: number, lowpass: number, gain: number) {
        if (this.muted) return;
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;

        src.connect(lp);
        lp.connect(g);
        g.connect(ctx.destination);
        src.start(t);
        src.stop(t + dur);
    }

    shoot() {
        this.tone(720, 0.09, 'square', 0.12, 220);
    }

    hit() {
        this.tone(320, 0.07, 'triangle', 0.18, 140);
    }

    break() {
        this.noiseBurst(0.25, 2200, 0.35);
    }

    explosion() {
        this.noiseBurst(0.5, 500, 0.5);
        this.tone(90, 0.5, 'sawtooth', 0.25, 40);
    }
}
