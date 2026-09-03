import { Camera, Node } from 'cc';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';
import { FailPanel } from './FailPanel';
import { VictoryPanel } from './VictoryPanel';

export class ResultPanelController {
    private failPanel: Node | null = null;
    private victoryPanel: Node | null = null;

    constructor(
        private readonly uiLayer: Node | null,
        private readonly camera: Camera | null,
    ) {}

    showFail(): void {
        if (!this.uiLayer || this.failPanel) return;
        AudioManager.stopBgm();
        AudioManager.playFail();
        let panel: Node;
        try {
            panel = PrefabManager.createFail();
        } catch (err) {
            console.error('[ResultPanelController] create fail prefab failed', err);
            return;
        }

        panel.name = 'FailPanel';
        this.uiLayer.addChild(panel);
        const failPanel = panel.addComponent(FailPanel);
        failPanel.play(this.camera ? this.camera.node : null);
        this.failPanel = panel;
    }

    showVictory(): void {
        if (!this.uiLayer || this.victoryPanel) return;
        AudioManager.stopBgm();
        AudioManager.playVictory();
        let panel: Node;
        try {
            panel = PrefabManager.createVictory();
        } catch (err) {
            console.error('[ResultPanelController] create victory prefab failed', err);
            return;
        }

        panel.name = 'VictoryPanel';
        this.uiLayer.addChild(panel);
        const victoryPanel = panel.addComponent(VictoryPanel);
        victoryPanel.play(this.camera ? this.camera.node : null);
        this.victoryPanel = panel;
    }
}
