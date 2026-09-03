import { Camera, Component, Node, UITransform, Vec3 } from 'cc';
import { CameraFollow } from './CameraFollow';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { Level1 } from './GameConfig';
import { OpeningSequenceConfig } from './config/OpeningSequenceConfig';
import { AudioManager } from './core/AudioManager';

export class OpeningSequenceController {
    private static shownOnce = false;

    private introStarted = false;
    private animationComplete = false;
    private cameraMoving = false;
    private activeState = true;

    constructor(
        private readonly owner: Component,
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getCamera: () => Camera | null,
        private readonly getPlayer: () => Player | null,
        private readonly getPlayerSpawnLocalPosition: () => Vec3,
        private readonly assignCameraTarget: () => void,
        private readonly flushMonsterGuide: () => void,
    ) {}

    init(): void {
        this.activeState = !OpeningSequenceController.shownOnce;
        this.introStarted = false;
        this.animationComplete = false;
        this.cameraMoving = false;
    }

    get active(): boolean {
        return this.activeState;
    }

    deactivate(): void {
        this.activeState = false;
    }

    /** 资源加载前直接把镜头放到开场怪物位置，避免先显示角色出生区域。 */
    alignCameraToOpeningTarget(): void {
        const camera = this.getCamera();
        const grid = this.getGrid();
        if (!camera || !grid) return;
        const worldTransform = this.worldNode.getComponent(UITransform);
        if (!worldTransform) return;

        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = null;
        if (!this.activeState) {
            const playerLocal = this.getPlayerSpawnLocalPosition();
            follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(playerLocal));
            return;
        }
        const data = Level1.monsters.find(item => item.name === OpeningSequenceConfig.targetMonsterName);
        if (!data) {
            this.activeState = false;
            const playerLocal = this.getPlayerSpawnLocalPosition();
            follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(playerLocal));
            return;
        }
        const cell = grid.worldToGrid(new Vec3(data.x, data.y, data.z || 0));
        const monsterLocal = cell ? grid.gridToWorld(cell.x, cell.y) : new Vec3(data.x, data.y, data.z || 0);
        follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(monsterLocal));
    }

    start(monster: Monster): void {
        if (!this.activeState || this.introStarted) return;
        this.introStarted = true;
        OpeningSequenceController.shownOnce = true;

        const camera = this.getCamera();
        if (camera) {
            const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
            follow.target = null;
            follow.snapToWorldPosition(monster.node.worldPosition);
        }

        AudioManager.playShout();
        monster.playOnceThenIdle(OpeningSequenceConfig.monsterIntroAnimation, () => {
            this.owner.scheduleOnce(() => {
                this.animationComplete = true;
                this.tryMoveCameraToPlayer();
            }, Math.max(0, OpeningSequenceConfig.cameraMoveDelay));
        });
    }

    tryMoveCameraToPlayer(): void {
        if (!this.activeState || !this.animationComplete || this.cameraMoving) return;
        const camera = this.getCamera();
        const player = this.getPlayer();
        if (!camera || !player || !player.node.isValid) return;

        this.cameraMoving = true;
        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = null;
        follow.moveToWorldPosition(
            player.node.worldPosition,
            OpeningSequenceConfig.cameraMoveDuration,
            () => {
                const currentPlayer = this.getPlayer();
                if (!currentPlayer || !currentPlayer.node.isValid) return;
                this.activeState = false;
                this.cameraMoving = false;
                follow.target = currentPlayer.node;
                this.flushMonsterGuide();
            },
        );
    }
}
