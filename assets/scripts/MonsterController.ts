import { Camera, Component, Label, Node, view } from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Level1 } from './GameConfig';
import { MonsterGlowController } from './MonsterGlowController';
import { OpeningSequenceConfig } from './config/OpeningSequenceConfig';
import {
    MonsterProfiles,
    MonsterSpawnConfig,
    MonsterViewportCullingConfig,
} from './config/MonsterConfig';
import { PrefabManager } from './core/PrefabManager';

export class MonsterController {
    private monsters: Monster[] = [];
    private finalMonster: Monster | null = null;
    private openingMonster: Monster | null = null;
    private colorLayer: Node | null = null;
    private labelLayer: Node | null = null;

    constructor(
        private readonly owner: Component,
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getCamera: () => Camera | null,
        private readonly glow: MonsterGlowController | null,
        private readonly isOpeningSequenceActive: () => boolean,
        private readonly getActiveBattleMonster: () => Monster | null,
        private readonly getFinisherMonster: () => Monster | null,
    ) {}

    getFinalMonster(): Monster | null {
        return this.finalMonster;
    }

    getOpeningMonster(): Monster | null {
        return this.openingMonster;
    }

    setupRenderLayers(): void {
        this.colorLayer = this.worldNode.getChildByName('MonstersColor');
        this.labelLayer = this.worldNode.getChildByName('MonstersLabel');
        if (!this.colorLayer || !this.labelLayer) {
            console.warn('[MonsterController] MonstersColor or MonstersLabel layer is missing');
            return;
        }

        // 身体先画，所有底图连续绘制，最后连续绘制数字。
        this.colorLayer.setSiblingIndex(this.worldNode.children.length - 1);
        this.labelLayer.setSiblingIndex(this.worldNode.children.length - 1);
    }

    async spawnMonsters(): Promise<void> {
        const container = this.worldNode.getChildByName('Monsters');
        const grid = this.getGrid();
        if (!container || !grid) return;
        for (const child of container.children) child.active = false;

        let highestMonster: Monster | null = null;
        const spawnFadeTasks: Promise<void>[] = [];
        this.finalMonster = null;
        this.openingMonster = null;
        this.monsters = [];

        for (const data of Level1.monsters) {
            let child: Node;
            try {
                child = await PrefabManager.createMonster(data.prefab);
            } catch (err) {
                console.error(`[MonsterController] create monster prefab failed: ${data.prefab}`, err);
                continue;
            }

            child.name = data.name;
            child.setPosition(data.x, data.y, data.z || 0);
            if (data.scaleX !== undefined || data.scaleY !== undefined || data.scaleZ !== undefined) {
                child.setScale(
                    data.scaleX !== undefined ? data.scaleX : child.scale.x,
                    data.scaleY !== undefined ? data.scaleY : child.scale.y,
                    data.scaleZ !== undefined ? data.scaleZ : child.scale.z,
                );
            }

            const monster = child.getComponent(Monster) || child.addComponent(Monster);
            monster.prepareSpawnFade();
            const label = child.getComponentInChildren(Label);
            if (label) label.string = String(data.power);
            container.addChild(child);

            if (data.battleRadius !== undefined) monster.battleRadius = data.battleRadius;
            monster.setAttackAnimation(MonsterProfiles[data.prefab].attackAnimation);
            monster.init(grid, false);
            this.movePresentationToLayers(monster);

            const isOpeningMonster = data.name === OpeningSequenceConfig.targetMonsterName;
            if (isOpeningMonster) {
                this.openingMonster = monster;
                if (this.isOpeningSequenceActive()) {
                    monster.node.active = false;
                    monster.setPresentationActive(false);
                }
            }

            this.monsters.push(monster);
            this.updateViewportVisibilityFor(monster);
            if (!isOpeningMonster || !this.isOpeningSequenceActive()) {
                spawnFadeTasks.push(new Promise(resolve => {
                    monster.playSpawnFade(MonsterSpawnConfig.fadeDuration, () => {
                        monster.activateOnGrid();
                        resolve();
                    });
                }));
            }
            if (!highestMonster || monster.power > highestMonster.power) highestMonster = monster;
            if (data.name === 'monster1') this.finalMonster = monster;
        }

        if (!this.finalMonster) this.finalMonster = highestMonster;
        if (!this.openingMonster) this.openingMonster = highestMonster;
        await Promise.all(spawnFadeTasks);
    }

    startViewportCulling(): void {
        if (!MonsterViewportCullingConfig.enabled) return;
        this.updateViewportVisibility();
        this.owner.schedule(
            this.updateViewportVisibility,
            Math.max(0.05, MonsterViewportCullingConfig.checkInterval),
        );
    }

    destroy(): void {
        this.owner.unschedule(this.updateViewportVisibility);
    }

    private updateViewportVisibility = (): void => {
        for (const monster of this.monsters) {
            this.updateViewportVisibilityFor(monster);
        }
    };

    private updateViewportVisibilityFor(monster: Monster): void {
        const camera = this.getCamera();
        if (!camera || !monster || !monster.node || !monster.node.isValid) return;
        const forceVisible = monster === this.getActiveBattleMonster()
            || monster === this.glow?.currentMonster
            || monster === this.getFinisherMonster()
            || (this.isOpeningSequenceActive() && monster === this.openingMonster);
        if (forceVisible) {
            monster.setViewportVisible(true);
            return;
        }

        const screenPosition = camera.worldToScreen(monster.node.worldPosition);
        const visibleSize = view.getVisibleSizeInPixel();
        const padding = monster.isViewportVisible()
            ? MonsterViewportCullingConfig.exitPadding
            : MonsterViewportCullingConfig.enterPadding;
        const visible = screenPosition.x >= -padding
            && screenPosition.x <= visibleSize.width + padding
            && screenPosition.y >= -padding
            && screenPosition.y <= visibleSize.height + padding;
        monster.setViewportVisible(visible);
    }

    private movePresentationToLayers(monster: Monster): void {
        if (!this.colorLayer || !this.labelLayer) return;
        if (!monster.movePresentationToLayers(this.colorLayer, this.labelLayer)) {
            console.warn(`[MonsterController] split monster presentation failed: ${monster.node.name}`);
        }
    }
}
