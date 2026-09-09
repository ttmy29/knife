import { Camera, Node, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { CameraFollow } from './CameraFollow';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { OpeningSequenceConfig } from './config/OpeningSequenceConfig';
import { MonsterSpawnConfig } from './config/MonsterConfig';
import { AudioManager } from './core/AudioManager';

interface RollProgress {
    value: number;
}

export class OpeningSequenceController {
    private static shownOnce = false;

    private introStarted = false;
    private activeState = true;
    private originalCameraOrthoHeight: number | null = null;
    private originalCameraOffsetX: number | null = null;
    private rollProgress: RollProgress | null = null;
    private monsterLayerInitialSiblingIndex: number | null = null;

    constructor(
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
        this.originalCameraOrthoHeight = null;
        this.originalCameraOffsetX = null;
        this.stopRollTween();
    }

    get active(): boolean {
        return this.activeState;
    }

    /** 开场启用时从临时位置实例化，正式出生点仍由 Level1 配置提供。 */
    getPlayerInitialLocalPosition(): Vec3 {
        if (!this.activeState) return this.getPlayerSpawnLocalPosition();
        const start = OpeningSequenceConfig.playerRollStart;
        return new Vec3(start.x, start.y, 0);
    }

    deactivate(): void {
        this.activeState = false;
        this.restoreCameraOrthoHeight();
        this.restoreCameraOffset();
        const player = this.getPlayer();
        if (!player || !player.node.isValid) return;
        const target = this.getPlayerSpawnLocalPosition();
        player.node.setPosition(target);
        this.syncPlayerGridPosition(player, target);
    }

    /** 加载期间只扩大视野，不再把镜头提前定位到 monster1。 */
    prepareCameraForOpening(): void {
        const camera = this.getCamera();
        if (!camera) return;

        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = null;
        if (!this.activeState) {
            const worldTransform = this.worldNode.getComponent(UITransform);
            if (!worldTransform) return;
            const playerLocal = this.getPlayerSpawnLocalPosition();
            follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(playerLocal));
            return;
        }

        this.originalCameraOrthoHeight = camera.orthoHeight;
        camera.orthoHeight = this.originalCameraOrthoHeight
            * Math.max(0.01, OpeningSequenceConfig.initialCameraOrthoScale);
    }

    /** 所有资源完成实例化后，对准临时位置的角色并开始整段开场演出。 */
    start(monster: Monster): void {
        if (!this.activeState || this.introStarted) return;
        const player = this.getPlayer();
        if (!player || !player.node.isValid) {
            this.deactivate();
            return;
        }

        this.introStarted = true;
        OpeningSequenceController.shownOnce = true;
        const camera = this.getCamera();
        let monsterReady = false;
        let cameraReady = !camera;
        let attackStarted = false;
        const tryStartMonsterAttack = (): void => {
            if (attackStarted || !monsterReady || !cameraReady) return;
            attackStarted = true;
            AudioManager.playShout();
            this.moveMonsterLayerAbovePlayer();
            monster.playAttackThenIdle(() => {
                this.restoreMonsterLayer();
                this.rollPlayerToSpawn();
            });
        };
        monster.playSpawnFade(MonsterSpawnConfig.fadeDuration, () => {
            monster.activateOnGrid();
            monsterReady = true;
            tryStartMonsterAttack();
        });

        if (!camera) {
            this.restoreCameraOrthoHeight();
            tryStartMonsterAttack();
            return;
        }

        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = null;
        if (this.originalCameraOffsetX === null) {
            this.originalCameraOffsetX = follow.targetOffsetX;
        }
        follow.targetOffsetX = OpeningSequenceConfig.cameraTargetOffsetX;
        let movementReady = false;
        let zoomReady = false;
        const tryFinishCamera = (): void => {
            if (!movementReady || !zoomReady) return;
            if (player.node.isValid) follow.target = player.node;
            cameraReady = true;
            tryStartMonsterAttack();
        };
        follow.moveToWorldPosition(
            player.node.worldPosition,
            OpeningSequenceConfig.cameraMoveDuration,
            () => {
                movementReady = true;
                tryFinishCamera();
            },
            this.originalCameraOrthoHeight === null
                ? camera.orthoHeight
                : this.originalCameraOrthoHeight,
        );
        this.zoomCameraToOriginal(() => {
            zoomReady = true;
            tryFinishCamera();
        });
    }

    destroy(): void {
        this.stopRollTween();
        this.restoreCameraOrthoHeight();
        this.restoreCameraOffset();
        this.restoreMonsterLayer();
    }

    private rollPlayerToSpawn(): void {
        const player = this.getPlayer();
        if (!this.activeState || !player || !player.node.isValid) return;

        const playerNode = player.node;
        const spineNode = playerNode.getChildByName('spine');
        const spineOpacity = spineNode?.getComponent(UIOpacity) || null;
        const originalSpineOpacity = spineOpacity?.opacity ?? 255;
        const blueNode = playerNode.getChildByName('bule');
        const labelNode = playerNode.getChildByName('Label');
        const blueWasActive = blueNode?.active || false;
        const labelWasActive = labelNode?.active || false;
        if (blueNode) blueNode.active = false;
        if (labelNode) labelNode.active = false;
        if (spineOpacity) spineOpacity.opacity = OpeningSequenceConfig.playerRollOpacity;

        const start = playerNode.position.clone();
        const target = this.getPlayerSpawnLocalPosition();
        const controlConfig = OpeningSequenceConfig.playerRollControl;
        const control = new Vec3(controlConfig.x, controlConfig.y, start.z);
        const baseAngle = spineNode ? spineNode.angle : 0;
        const rotation = 360 * OpeningSequenceConfig.playerRollTurns;
        const progress: RollProgress = { value: 0 };
        this.rollProgress = progress;
        player.stop();
        player.setAnimationTimeScale(0);
        this.restoreCameraOffset(OpeningSequenceConfig.playerRollDuration);

        tween(progress)
            .to(Math.max(0, OpeningSequenceConfig.playerRollDuration), { value: 1 }, {
                easing: 'sineInOut',
                onUpdate: (state: RollProgress) => {
                    if (!playerNode.isValid) return;
                    const t = state.value;
                    const inv = 1 - t;
                    playerNode.setPosition(
                        inv * inv * start.x + 2 * inv * t * control.x + t * t * target.x,
                        inv * inv * start.y + 2 * inv * t * control.y + t * t * target.y,
                        start.z,
                    );
                    if (spineNode && spineNode.isValid) spineNode.angle = baseAngle + rotation * t;
                },
            })
            .call(() => {
                this.rollProgress = null;
                if (!playerNode.isValid) return;
                playerNode.setPosition(target);
                if (spineNode && spineNode.isValid) spineNode.angle = baseAngle;
                if (spineOpacity && spineOpacity.isValid) spineOpacity.opacity = originalSpineOpacity;
                if (blueNode && blueNode.isValid) blueNode.active = blueWasActive;
                if (labelNode && labelNode.isValid) labelNode.active = labelWasActive;
                player.setAnimationTimeScale(1);
                this.syncPlayerGridPosition(player, target);
                player.playAnimationOverDuration(
                    OpeningSequenceConfig.playerLandingTransitionAnimation,
                    OpeningSequenceConfig.playerLandingTransitionDuration,
                    () => {
                        if (!this.activeState || !player.node.isValid) return;
                        player.playSkillOnce(
                            OpeningSequenceConfig.playerLandingAnimation,
                            () => this.finishOpening(),
                        );
                    },
                );
            })
            .start();
    }

    private syncPlayerGridPosition(player: Player, position: Vec3): void {
        const cell = this.getGrid()?.worldToGrid(position);
        if (!cell) return;
        player.gridCol = cell.x;
        player.gridRow = cell.y;
    }

    private finishOpening(): void {
        const player = this.getPlayer();
        if (!player || !player.node.isValid) return;
        this.restoreCameraOffset();
        this.activeState = false;
        this.assignCameraTarget();
        this.flushMonsterGuide();
    }

    /** 攻击期间让怪物身体层排在角色层后面，使怪物能够盖住角色。 */
    private moveMonsterLayerAbovePlayer(): void {
        const monsterLayer = this.worldNode.getChildByName('Monsters');
        const playerLayer = this.worldNode.getChildByName('Player');
        if (!monsterLayer || !playerLayer) return;

        this.monsterLayerInitialSiblingIndex = monsterLayer.getSiblingIndex();
        const playerIndex = playerLayer.getSiblingIndex();
        if (this.monsterLayerInitialSiblingIndex < playerIndex) {
            monsterLayer.setSiblingIndex(playerIndex);
        }
    }

    private restoreMonsterLayer(): void {
        if (this.monsterLayerInitialSiblingIndex === null) return;
        const monsterLayer = this.worldNode.getChildByName('Monsters');
        if (monsterLayer && monsterLayer.isValid) {
            monsterLayer.setSiblingIndex(this.monsterLayerInitialSiblingIndex);
        }
        this.monsterLayerInitialSiblingIndex = null;
    }

    private restoreCameraOrthoHeight(): void {
        const camera = this.getCamera();
        if (camera && this.originalCameraOrthoHeight !== null) {
            Tween.stopAllByTarget(camera);
            camera.orthoHeight = this.originalCameraOrthoHeight;
        }
        this.originalCameraOrthoHeight = null;
    }

    private restoreCameraOffset(duration = 0): void {
        if (this.originalCameraOffsetX === null) return;
        const camera = this.getCamera();
        const follow = camera?.getComponent(CameraFollow) || null;
        if (!follow) {
            this.originalCameraOffsetX = null;
            return;
        }

        Tween.stopAllByTarget(follow);
        const targetOffsetX = this.originalCameraOffsetX;
        if (duration <= 0) {
            follow.targetOffsetX = targetOffsetX;
            this.originalCameraOffsetX = null;
            return;
        }

        tween(follow)
            .to(duration, { targetOffsetX }, { easing: 'sineInOut' })
            .call(() => {
                this.originalCameraOffsetX = null;
            })
            .start();
    }

    private zoomCameraToOriginal(onComplete: () => void): void {
        const camera = this.getCamera();
        if (!camera || this.originalCameraOrthoHeight === null) {
            onComplete();
            return;
        }

        const targetHeight = this.originalCameraOrthoHeight;
        const duration = Math.max(0, OpeningSequenceConfig.cameraZoomDuration);
        Tween.stopAllByTarget(camera);
        if (duration === 0) {
            camera.orthoHeight = targetHeight;
            this.originalCameraOrthoHeight = null;
            onComplete();
            return;
        }

        tween(camera)
            .to(duration, { orthoHeight: targetHeight }, { easing: 'quadOut' })
            .call(() => {
                this.originalCameraOrthoHeight = null;
                onComplete();
            })
            .start();
    }

    private stopRollTween(): void {
        if (!this.rollProgress) return;
        Tween.stopAllByTarget(this.rollProgress);
        this.rollProgress = null;
    }
}
