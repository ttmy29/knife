import { Camera, Component, director, Node, tween, UIOpacity } from 'cc';
import { CameraFollow } from './CameraFollow';
import { Monster } from './Monster';
import { Player } from './Player';
import { FinalBossBattleConfig } from './config/FinalBossBattleConfig';
import { MonsterProfiles } from './config/MonsterConfig';
import { PlayerRoleProfile } from './config/PlayerRoleConfig';
import { AudioManager } from './core/AudioManager';

export class FinalBossCinematicController {
    private slowStartTimer: ReturnType<typeof setTimeout> | null = null;
    private slowTimer: ReturnType<typeof setTimeout> | null = null;
    private hitStopTimer: ReturnType<typeof setTimeout> | null = null;
    private deathTimer: ReturnType<typeof setTimeout> | null = null;
    private finisherPlayer: Player | null = null;
    private finisherMonster: Monster | null = null;
    private cameraOrthoHeight: number | null = null;
    private cameraOffsetX: number | null = null;

    constructor(
        private readonly owner: Component,
        private readonly getCamera: () => Camera | null,
        private readonly getMaskNode: () => Node | null,
        private readonly getCurrentRoleProfile: () => PlayerRoleProfile | null,
    ) {}

    get currentFinisherMonster(): Monster | null {
        return this.finisherMonster;
    }

    playAttackSequence(
        player: Player,
        monster: Monster,
        originalPower: number,
        onFinalImpactResolved: () => void,
        onComplete: () => void,
    ): void {
        const attackCount = Math.max(1, Math.floor(FinalBossBattleConfig.attackCount));
        monster.playAttackLoop();

        const bossAttackSoundDelay = Math.max(0, MonsterProfiles.monster1.firstAttackSoundDelay || 0);
        if (bossAttackSoundDelay > 0) {
            this.owner.scheduleOnce(() => AudioManager.playBossAttack(), bossAttackSoundDelay);
        } else {
            AudioManager.playBossAttack();
        }

        let hitIndex = 0;
        let displayedPower = originalPower;
        if (this.deathTimer !== null) {
            clearTimeout(this.deathTimer);
            this.deathTimer = null;
        }

        const playNextAttack = () => {
            hitIndex++;
            let attackComplete = false;
            let powerDropComplete = false;
            let powerDropStarted = false;
            let deathDelayComplete = hitIndex < attackCount;
            let finalImpactResolved = hitIndex < attackCount;
            let attackAdvanced = false;

            const continueSequence = () => {
                if (attackAdvanced || !attackComplete || !powerDropComplete) return;
                if (hitIndex >= attackCount) {
                    if (!finalImpactResolved) return;
                    attackAdvanced = true;
                    onComplete();
                } else {
                    attackAdvanced = true;
                    this.fadeInMask(playNextAttack);
                }
            };
            const tryResolveFinalImpact = () => {
                if (finalImpactResolved || !deathDelayComplete || !powerDropComplete) return;
                finalImpactResolved = true;
                onFinalImpactResolved();
                continueSequence();
            };
            const onAttackSound = () => {
                if (powerDropStarted) return;
                powerDropStarted = true;
                if (hitIndex >= attackCount) this.playHitStop(player, monster);
                const remainingHits = attackCount - hitIndex;
                const targetPower = remainingHits <= 0
                    ? 0
                    : Math.ceil(originalPower * remainingHits / attackCount);
                this.animateMonsterPowerDrop(monster, displayedPower, targetPower, () => {
                    displayedPower = targetPower;
                    powerDropComplete = true;
                    if (hitIndex >= attackCount) tryResolveFinalImpact();
                    continueSequence();
                });
            };

            if (hitIndex >= attackCount) {
                this.scheduleSlowMotion(player, monster);
                const heHaDelay = Math.max(0, FinalBossBattleConfig.finisherHeHaDelay);
                if (heHaDelay > 0) this.owner.scheduleOnce(() => AudioManager.playHeHa(), heHaDelay);
                else AudioManager.playHeHa();
                const deathDelay = Math.max(0, FinalBossBattleConfig.finisherDeathDelay);
                if (deathDelay === 0) {
                    deathDelayComplete = true;
                } else {
                    this.deathTimer = setTimeout(() => {
                        this.deathTimer = null;
                        deathDelayComplete = true;
                        tryResolveFinalImpact();
                    }, deathDelay * 1000);
                }
            }

            const roleProfile = this.getCurrentRoleProfile();
            if (!roleProfile) return;
            const attackAnimation = roleProfile.bossAttackAnimations?.[hitIndex - 1]
                || roleProfile.attackAnimation;
            const soundDelay = hitIndex >= attackCount
                ? FinalBossBattleConfig.finisherAttackSoundDelay
                : roleProfile.attackSoundDelay;
            player.playAttackAnimation(attackAnimation, () => {
                attackComplete = true;
                continueSequence();
            }, undefined, onAttackSound, soundDelay);
        };

        playNextAttack();
    }

    restoreAll(): void {
        this.clearTimers();
        if (this.deathTimer !== null) {
            clearTimeout(this.deathTimer);
            this.deathTimer = null;
        }
        director.getScheduler().setTimeScale(1);
        this.restoreAnimationTimeScale();
    }

    resetForResult(): void {
        this.restoreCameraZoom();
        const maskOpacity = this.getMaskNode()?.getComponent(UIOpacity);
        if (maskOpacity) maskOpacity.opacity = 0;
    }

    private fadeInMask(onComplete: () => void): void {
        const opacity = this.getMaskNode()?.getComponent(UIOpacity);
        if (!opacity) {
            onComplete();
            return;
        }
        this.startCameraZoom();
        opacity.opacity = 0;
        const duration = Math.max(0, FinalBossBattleConfig.maskFadeInDuration);
        if (duration === 0) {
            opacity.opacity = 255;
            onComplete();
            return;
        }
        tween(opacity)
            .to(duration, { opacity: 255 })
            .call(onComplete)
            .start();
    }

    private startCameraZoom(): void {
        const camera = this.getCamera();
        if (!camera) return;
        if (this.cameraOrthoHeight === null) {
            this.cameraOrthoHeight = camera.orthoHeight;
        }
        const targetHeight = this.cameraOrthoHeight
            * Math.max(0.01, FinalBossBattleConfig.maskCameraZoomScale);
        const duration = Math.max(0, FinalBossBattleConfig.maskCameraZoomDuration);
        const follow = camera.getComponent(CameraFollow);
        if (follow && this.cameraOffsetX === null) {
            this.cameraOffsetX = follow.targetOffsetX;
        }
        const targetOffsetX = (this.cameraOffsetX || 0)
            + FinalBossBattleConfig.maskCameraOffsetX;
        if (duration === 0) {
            camera.orthoHeight = targetHeight;
            if (follow) follow.setTargetOffsetX(targetOffsetX, true);
            return;
        }
        tween(camera)
            .to(duration, { orthoHeight: targetHeight }, { easing: 'quadOut' })
            .start();
        if (follow) {
            tween(follow)
                .to(duration, { targetOffsetX }, { easing: 'quadOut' })
                .start();
        }
    }

    private restoreCameraZoom(): void {
        const camera = this.getCamera();
        if (!camera) return;
        if (this.cameraOrthoHeight !== null) {
            camera.orthoHeight = this.cameraOrthoHeight;
            this.cameraOrthoHeight = null;
        }
        const follow = camera.getComponent(CameraFollow);
        if (follow && this.cameraOffsetX !== null) {
            follow.setTargetOffsetX(this.cameraOffsetX, true);
            this.cameraOffsetX = null;
        }
    }

    private scheduleSlowMotion(player: Player, monster: Monster): void {
        this.clearTimers();
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const delay = Math.max(0, FinalBossBattleConfig.finisherSlowStartDelay);
        if (delay === 0) {
            this.startSlowMotion(player, monster);
            return;
        }
        this.slowStartTimer = setTimeout(() => {
            this.slowStartTimer = null;
            this.startSlowMotion(player, monster);
        }, delay * 1000);
    }

    private startSlowMotion(player: Player, monster: Monster): void {
        this.clearTimers();
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const scheduler = director.getScheduler();
        const scale = Math.max(0.01, FinalBossBattleConfig.finisherSlowScale);
        scheduler.setTimeScale(scale);
        player.setAnimationTimeScale(scale);
        monster.setAnimationTimeScale(scale);
        this.slowTimer = setTimeout(() => {
            this.slowTimer = null;
            scheduler.setTimeScale(1);
            this.restoreAnimationTimeScale();
        }, Math.max(0, FinalBossBattleConfig.finisherSlowDuration) * 1000);
    }

    private playHitStop(player: Player, monster: Monster): void {
        if (this.slowTimer !== null) {
            clearTimeout(this.slowTimer);
            this.slowTimer = null;
        }
        if (this.hitStopTimer !== null) {
            clearTimeout(this.hitStopTimer);
            this.hitStopTimer = null;
        }
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const scheduler = director.getScheduler();
        scheduler.setTimeScale(0);
        player.setAnimationTimeScale(0);
        monster.setAnimationTimeScale(0);
        this.hitStopTimer = setTimeout(() => {
            this.hitStopTimer = null;
            scheduler.setTimeScale(1);
            this.restoreAnimationTimeScale();
        }, Math.max(0, FinalBossBattleConfig.finisherHitStopDuration) * 1000);
    }

    private clearTimers(): void {
        if (this.slowStartTimer !== null) {
            clearTimeout(this.slowStartTimer);
            this.slowStartTimer = null;
        }
        if (this.slowTimer !== null) {
            clearTimeout(this.slowTimer);
            this.slowTimer = null;
        }
        if (this.hitStopTimer !== null) {
            clearTimeout(this.hitStopTimer);
            this.hitStopTimer = null;
        }
    }

    private restoreAnimationTimeScale(): void {
        if (this.finisherPlayer && this.finisherPlayer.node && this.finisherPlayer.node.isValid) {
            this.finisherPlayer.setAnimationTimeScale(1);
        }
        if (this.finisherMonster && this.finisherMonster.node && this.finisherMonster.node.isValid) {
            this.finisherMonster.setAnimationTimeScale(1);
        }
    }

    private animateMonsterPowerDrop(
        monster: Monster,
        startPower: number,
        targetPower: number,
        onComplete: () => void,
    ): void {
        const steps = Math.max(1, Math.floor(FinalBossBattleConfig.powerDropSteps));
        const interval = Math.max(0, FinalBossBattleConfig.powerDropStepInterval);
        if (steps === 1 || interval === 0) {
            monster.setLabelText(String(targetPower));
            onComplete();
            return;
        }

        let step = 0;
        const tick = () => {
            step++;
            const power = step >= steps
                ? targetPower
                : Math.round(startPower + (targetPower - startPower) * step / steps);
            monster.setLabelText(String(power));
            if (step >= steps) onComplete();
        };
        this.owner.schedule(tick, interval, steps - 1);
    }
}
