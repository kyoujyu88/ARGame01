import './style.css';
import { UIManager } from './ui/UIManager';
import { GameManager } from './game/GameManager';
import { XRManager } from './ar/XRManager';
import { GameSystem } from './game/GameSystem';
import { InteractionManager } from './game/InteractionManager';

class App {
    private uiManager: UIManager;
    private gameManager: GameManager;
    private xrManager: XRManager;
    private gameSystem: GameSystem;
    private interactionManager: InteractionManager;

    constructor() {
        this.uiManager = new UIManager();
        this.gameSystem = new GameSystem(this.uiManager);
        this.gameManager = new GameManager(this.uiManager);
        this.xrManager = new XRManager(this.gameManager);
        this.interactionManager = new InteractionManager(this.gameManager, this.xrManager, this.gameSystem);
        
        this.init();
    }

    private init() {
        console.log('AR Stress Relief Game initialized');
    }
}

new App();

new App();
