import { Camera, Color, Graphics, Label, Node, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { CameraFollow } from './CameraFollow';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { OpeningSequenceConfig } from './config/OpeningSequenceConfig';
import { AudioManager } from './core/AudioManager';

interface RollProgress {
    value: number;
}

interface SoundDelayProgress {
    elapsed: number;
}

export class OpeningSequenceController {
    private static shownOnce = false;

    private introStarted = false;
    private activeState = true;
    private originalCameraOrthoHeight: number | null = null;
    private originalCameraOffsetX: number | null = null;
    private rollProgress: RollProgress | null = null;
    private cameraStartDelay: SoundDelayProgress | null = null;
    private playerHitSoundDelay: SoundDelayProgress | null = null;
    private helpSoundDelay: SoundDelayProgress | null = null;
    private helpSoundIndex = 0;
    private helpSoundsStopped = false;
    private monsterLayerInitialSiblingIndex: number | null = null;
    private originalPlayerLabelText: string | null = null;

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
        this.originalPlayerLabelText = null;
        this.stopRollTween();
        this.stopCameraStartDelay();
        this.stopPlayerHitSoundDelay();
        this.stopHelpSoundDelay();
        this.helpSoundIndex = 0;
        this.helpSoundsStopped = false;
        this.showLoadingMask();
    }

    /** 黑屏期间外部资源照常加载；固定时间结束后关闭黑幕，再继续原开场流程。 */
    waitForLoadingMask(): Promise<void> {
        return new Promise(resolve => {
            const progress: SoundDelayProgress = { elapsed: 0 };
            tween(progress)
                .delay(Math.max(0, OpeningSequenceConfig.loadingMaskDuration))
                .call(() => {
                    this.hideLoadingMask();
                    resolve();
                })
                .start();
        });
    }

    get active(): boolean {
        return this.activeState;
    }

    /** 进入最终 Boss 战后永久停止本局的 Help 语音循环。 */
    stopHelpSounds(): void {
        this.helpSoundsStopped = true;
        this.stopHelpSoundDelay();
    }

    /** 角色开场直接使用真实战力文本，不再应用临时显示数字。 */
    preparePlayerForOpening(player: Player): void {
        if (!this.activeState || !player.node.isValid) return;
    }

    /** 角色开场直接实例化到正式出生点；旧翻滚起点配置保留但不再使用。 */
    getPlayerInitialLocalPosition(): Vec3 {
        return this.getPlayerSpawnLocalPosition();
    }

    deactivate(): void {
        this.activeState = false;
        this.restoreCameraOrthoHeight();
        this.restoreCameraOffset();
        this.restorePlayerLabel();
        this.stopCameraStartDelay();
        this.stopPlayerHitSoundDelay();
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
        const cameraPosition = camera.node.position;
        camera.node.setPosition(
            cameraPosition.x,
            cameraPosition.y + OpeningSequenceConfig.initialCameraOffsetY,
            cameraPosition.z,
        );
    }

    /** 所有资源完成实例化后：镜头缓慢对准 Boss，Boss 攻击结束后再缓慢移动到角色。 */
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
        monster.activateOnGrid();
        const playBossAttack = (beginCameraTransition: () => void): void => {
            if (!this.activeState || !monster.node.isValid) return;
            this.moveMonsterLayerAbovePlayer();
            monster.playAttackThenIdle(() => {
                this.restoreMonsterLayer();
                // 只在完整攻击动画结束后开始镜头移动；不再响应 hit 事件或播放角色受击音效。
                this.startCameraTransitionDelay(beginCameraTransition);
            });
        };

        if (!camera) {
            playBossAttack(() => {
                this.restoreCameraOrthoHeight();
                this.finishOpening();
            });
            return;
        }

        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = null;
        if (this.originalCameraOffsetX === null) {
            this.originalCameraOffsetX = follow.targetOffsetX;
        }
        follow.targetOffsetX = OpeningSequenceConfig.cameraTargetOffsetX;

        const beginCameraTransition = (): void => {
            if (!this.activeState || !player.node.isValid || !camera.node.isValid) return;
            let movementReady = false;
            let zoomReady = false;
            const tryFinishCamera = (): void => {
                if (!movementReady || !zoomReady) return;
                this.finishOpening();
            };
            this.restoreCameraOffset(OpeningSequenceConfig.cameraMoveDuration);
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
        };

        // Boss 资源就绪后从当前初始镜头平滑移动过去；到位后才开始攻击。
        follow.moveToWorldPosition(
            monster.node.worldPosition,
            OpeningSequenceConfig.cameraBossMoveDuration,
            () => playBossAttack(beginCameraTransition),
            camera.orthoHeight,
        );
    }

    destroy(): void {
        this.stopRollTween();
        this.stopCameraStartDelay();
        this.restoreCameraOrthoHeight();
        this.restoreCameraOffset();
        this.restoreMonsterLayer();
        this.restorePlayerLabel();
        this.stopPlayerHitSoundDelay();
        this.stopHelpSoundDelay();
    }

    private showLoadingMask(): void {
        const mask = this.worldNode.parent?.getChildByName('LoadingMask');
        if (!mask) return;

        mask.active = true;
        const opacity = mask.getComponent(UIOpacity) || mask.addComponent(UIOpacity);
        opacity.opacity = 255;

        const transform = mask.getComponent(UITransform);
        const graphics = mask.getComponent(Graphics);
        if (!transform || !graphics) return;

        const { width, height } = transform.contentSize;
        const { x, y } = transform.anchorPoint;
        graphics.clear();
        graphics.fillColor = new Color(0, 0, 0, 255);
        graphics.rect(-width * x, -height * y, width, height);
        graphics.fill();
    }

    private hideLoadingMask(): void {
        const mask = this.worldNode.parent?.getChildByName('LoadingMask');
        if (mask) mask.active = false;
    }

    private rollPlayerToSpawn(): void {
        const player = this.getPlayer();
        if (!this.activeState || !player || !player.node.isValid) return;

        const playerNode = player.node;
        const cameraFollow = this.getCamera()?.getComponent(CameraFollow) || null;
        if (cameraFollow) cameraFollow.target = playerNode;
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
                this.restorePlayerLabel();
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

    private showTemporaryPlayerLabel(player: Player): void {
        const label = player.node.getChildByName('Label')?.getComponent(Label) || null;
        if (!label) return;
        if (this.originalPlayerLabelText === null) {
            this.originalPlayerLabelText = label.string;
        }
        label.string = OpeningSequenceConfig.temporaryPlayerLabelText;
    }

    private restorePlayerLabel(): void {
        if (this.originalPlayerLabelText === null) return;
        const player = this.getPlayer();
        const label = player?.node.isValid
            ? player.node.getChildByName('Label')?.getComponent(Label) || null
            : null;
        if (label) label.string = this.originalPlayerLabelText;
        this.originalPlayerLabelText = null;
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

    private startCameraTransitionDelay(onComplete: () => void): void {
        this.stopCameraStartDelay();
        const delay = Math.max(0, OpeningSequenceConfig.cameraStartDelay);
        if (delay === 0) {
            onComplete();
            return;
        }

        const progress: SoundDelayProgress = { elapsed: 0 };
        this.cameraStartDelay = progress;
        tween(progress)
            .delay(delay)
            .call(() => {
                this.cameraStartDelay = null;
                if (this.activeState) onComplete();
            })
            .start();
    }

    private stopCameraStartDelay(): void {
        if (!this.cameraStartDelay) return;
        Tween.stopAllByTarget(this.cameraStartDelay);
        this.cameraStartDelay = null;
    }

    private stopRollTween(): void {
        if (!this.rollProgress) return;
        Tween.stopAllByTarget(this.rollProgress);
        this.rollProgress = null;
    }

    private startPlayerHitSoundDelay(): void {
        this.stopPlayerHitSoundDelay();
        const delay = Math.max(0, OpeningSequenceConfig.playerHitSoundDelay);
        if (delay === 0) {
            AudioManager.playRoleBehit();
            return;
        }

        const progress: SoundDelayProgress = { elapsed: 0 };
        this.playerHitSoundDelay = progress;
        tween(progress)
            .delay(delay)
            .call(() => {
                this.playerHitSoundDelay = null;
                if (this.activeState) AudioManager.playRoleBehit();
            })
            .start();
    }

    private stopPlayerHitSoundDelay(): void {
        if (!this.playerHitSoundDelay) return;
        Tween.stopAllByTarget(this.playerHitSoundDelay);
        this.playerHitSoundDelay = null;
    }

    private startHelpSoundLoop(): void {
        this.stopHelpSoundDelay();
        this.helpSoundIndex = 0;
        this.helpSoundsStopped = false;
        this.scheduleNextHelpSound(OpeningSequenceConfig.firstHelpSoundDelay);
    }

    private scheduleNextHelpSound(delay: number): void {
        if (this.helpSoundsStopped) return;
        const progress: SoundDelayProgress = { elapsed: 0 };
        this.helpSoundDelay = progress;
        tween(progress)
            .delay(Math.max(0.01, delay))
            .call(() => {
                if (this.helpSoundDelay === progress) this.helpSoundDelay = null;
                if (this.helpSoundsStopped) return;
                const playHelp1 = this.helpSoundIndex % 2 === 0;
                if (playHelp1) AudioManager.playHelp1();
                else AudioManager.playHelp2();
                this.helpSoundIndex++;
                this.scheduleNextHelpSound(OpeningSequenceConfig.helpSoundInterval);
            })
            .start();
    }

    private stopHelpSoundDelay(): void {
        if (!this.helpSoundDelay) return;
        Tween.stopAllByTarget(this.helpSoundDelay);
        this.helpSoundDelay = null;
    }
}
