import './style.css';
import { UIManager } from './ui/UIManager';
import { GameManager } from './game/GameManager';
import { XRManager } from './ar/XRManager';
import { GameSystem } from './game/GameSystem';
import { InteractionManager } from './game/InteractionManager';
import { GameModeManager } from './game/GameModeManager';
import { SoundManager } from './audio/SoundManager';

class App {
    private uiManager: UIManager;
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;
    private interactionManager: InteractionManager;
    private sound: SoundManager;

    constructor() {
        this.sound = new SoundManager();
        this.uiManager = new UIManager(this.sound);
        this.gameSystem = new GameSystem(this.uiManager);
        this.gameManager = new GameManager();
        this.xrManager = new XRManager(this.gameManager);
        // InteractionManager wires up the gameplay event listeners on construction.
        this.interactionManager = new InteractionManager(
            this.gameManager,
            this.xrManager,
            this.gameSystem,
            this.sound,
        );
        // ゲームモード（フリー/タイムアタック/ウェーブ）を管理する
        new GameModeManager(
            this.gameManager,
            this.xrManager,
            this.gameSystem,
            this.interactionManager,
            this.uiManager,
        );

        this.init();
    }

    private init() {
        console.log('AR Stress Relief Game initialized');
    }
}

new App();
