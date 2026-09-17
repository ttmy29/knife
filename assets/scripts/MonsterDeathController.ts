import { Animation, Camera, Component, Node, sp } from 'cc';
import { AutoSkillController } from './AutoSkillController';
import { CameraFollow } from './CameraFollow';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { RewardController } from './RewardController';
import { SkillSystemConfig } from './config/SkillConfig';
import { FinalBossBattleConfig } from './config/FinalBossBattleConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';

/** 统一处理怪物一次性击杀、动画、临时特效、经验与隐藏。 */
export class MonsterDeathController {
    private readonly defeatedMonsters = new Set<Monster>();
    private readonly activeEffects = new Set<Node>();

    constructor(
        private readonly host: Component,
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly getAutoSkills: () => AutoSkillController | null,
        private readonly getRewards: () => RewardController | null,
        private readonly getCamera: () => Camera | null,
        private readonly getFinalMonster: () => Monster | null,
        private readonly clearActiveBattleMonster: (monster: Monster) => void,
        private readonly showVictoryUI: () => void,
    ) {}

    isDefeated(monster: Monster): boolean {
        return this.defeatedMonsters.has(monster);
    }

    resolve(
        monster: Monster,
        hitAnimation?: string,
        deathAnimation?: string,
        impactEffect?: 'boom' | 'boom2' | 'light',
        impactEffectAnimation?: string,
        playDeadEffect = true,
    ): boolean {
        if (this.defeatedMonsters.has(monster)) return false;
        const player = this.getPlayer();
        if (!player || !player.node.isValid) return false;
        this.defeatedMonsters.add(monster);
        this.getAutoSkills()?.releaseTarget(monster);
        this.getGrid()?.removeMonster(monster);
        player.clearPendingMonster(monster);

        const rewardPower = monster.power;
        player.power += rewardPower;
        const isFinalMonster = monster === this.getFinalMonster();
        const resolvedImpactEffect = isFinalMonster && impactEffect === 'boom2'
            ? 'light'
            : impactEffect;
        const resolvedImpactAnimation = resolvedImpactEffect === 'light'
            ? 'animation'
            : impactEffectAnimation;
        if (isFinalMonster) AudioManager.playBossDie();
        else AudioManager.playMonsterDie();
        this.getCamera()?.getComponent(CameraFollow)?.shake();

        let monsterHidden = false;
        const hideMonster = () => {
            if (monsterHidden) return;
            monsterHidden = true;
            monster.setPresentationActive(false);
            if (monster.node?.isValid) monster.node.active = false;
            this.clearActiveBattleMonster(monster);
            if (isFinalMonster) this.showVictoryUI();
        };
        if (SkillSystemConfig.playMonsterDeathAnimation) {
            const usableHitAnimation = hitAnimation && monster.hasUsableAnimation(hitAnimation)
                ? hitAnimation
                : undefined;
            const requestedDeathIsMissing = !!deathAnimation
                && !monster.hasUsableAnimation(deathAnimation);

            // die 不存在或时长为 0 时，hitFly 直接作为死亡动画并同步播放死亡特效。
            if (usableHitAnimation && requestedDeathIsMissing) {
                if (resolvedImpactEffect) {
                    this.playImpactEffect(monster, resolvedImpactEffect, resolvedImpactAnimation);
                }
                if (playDeadEffect) this.playDeadEffect(monster);
                monster.playHitReaction(usableHitAnimation, hideMonster);
                this.host.scheduleOnce(hideMonster, SkillSystemConfig.monsterForceHideTimeout);
                this.dropExperience(monster, rewardPower);
                return true;
            }

            let deathStarted = false;
            const startDeath = () => {
                if (deathStarted || monsterHidden) return;
                deathStarted = true;
                if (resolvedImpactEffect) {
                    this.playImpactEffect(monster, resolvedImpactEffect, resolvedImpactAnimation);
                }
                if (playDeadEffect) this.playDeadEffect(monster);
                monster.playDie(hideMonster, deathAnimation);
                this.host.scheduleOnce(hideMonster, SkillSystemConfig.monsterForceHideTimeout);
            };
            if (usableHitAnimation) {
                monster.playHitReaction(usableHitAnimation, startDeath);
                this.host.scheduleOnce(startDeath, SkillSystemConfig.monsterForceHideTimeout);
            } else startDeath();
        } else hideMonster();
        this.dropExperience(monster, rewardPower);
        return true;
    }

    private dropExperience(monster: Monster, rewardPower: number): void {
        const rewards = this.getRewards();
        rewards?.startExpOrbDrop(
            monster,
            () => rewards.enqueuePlayerPowerGain(rewardPower),
        );
    }

    /** 怪物开始 die 时，在 TempLayer 播放一次帧动画死亡特效。 */
    private playDeadEffect(monster: Monster): void {
        const tempLayer = this.worldNode.getChildByName('TempLayer');
        if (!tempLayer || !monster.node || !monster.node.isValid) return;

        let effect: Node;
        try {
            effect = PrefabManager.createDeadEffect();
        } catch (err) {
            console.error('[MonsterDeathController] create deadEffect failed', err);
            return;
        }

        const worldPosition = monster.node.worldPosition.clone();
        worldPosition.y += SkillSystemConfig.deathEffectOffsetY;
        effect.active = false;
        tempLayer.addChild(effect);
        effect.setWorldPosition(worldPosition);
        effect.active = true;
        this.activeEffects.add(effect);

        const cleanup = this.createEffectCleanup(effect);
        const animation = effect.getComponent(Animation) || effect.getComponentInChildren(Animation);
        if (!animation) {
            console.warn('[MonsterDeathController] deadEffect Animation component is missing');
            this.host.scheduleOnce(cleanup, 3);
            return;
        }
        animation.once(Animation.EventType.FINISHED, cleanup);
        animation.play('animation');
        this.host.scheduleOnce(cleanup, 3);
    }

    /** 技能命中死亡时，在 TempLayer 播放对应的 Spine 特效。 */
    private playImpactEffect(
        monster: Monster,
        effectType: 'boom' | 'boom2' | 'light',
        configuredAnimation?: string,
    ): void {
        const tempLayer = this.worldNode.getChildByName('TempLayer');
        if (!tempLayer || !monster.node || !monster.node.isValid) return;

        let effect: Node;
        try {
            effect = effectType === 'light'
                ? PrefabManager.createLight()
                : effectType === 'boom2'
                    ? PrefabManager.createBoom2()
                    : PrefabManager.createBoom();
        } catch (err) {
            console.error(`[MonsterDeathController] create ${effectType} failed`, err);
            return;
        }

        effect.active = false;
        tempLayer.addChild(effect);
        effect.setWorldPosition(monster.node.worldPosition);
        effect.active = true;
        this.activeEffects.add(effect);

        const cleanup = this.createEffectCleanup(effect);
        const skeleton = effect.getComponent(sp.Skeleton) || effect.getComponentInChildren(sp.Skeleton);
        if (!skeleton) {
            console.warn(`[MonsterDeathController] ${effectType} Skeleton component is missing`);
            this.host.scheduleOnce(cleanup, 3);
            return;
        }
        skeleton.setCompleteListener(() => {
            skeleton.setCompleteListener(() => {});
            cleanup();
        });
        const animationName = configuredAnimation
            || (effectType === 'light'
                ? 'animation'
                : effectType === 'boom2' ? 'skill1_hit' : 'molotovAttackhits');
        skeleton.setAnimation(0, animationName, false);
        const cleanupDelay = effectType === 'light'
            ? Math.max(0, FinalBossBattleConfig.lightDuration)
            : 3;
        this.host.scheduleOnce(cleanup, cleanupDelay);
    }

    private createEffectCleanup(effect: Node): () => void {
        let cleaned = false;
        return () => {
            if (cleaned) return;
            cleaned = true;
            this.activeEffects.delete(effect);
            if (effect.isValid) effect.destroy();
        };
    }

    destroy(): void {
        for (const effect of this.activeEffects) {
            if (effect?.isValid) effect.destroy();
        }
        this.activeEffects.clear();
        this.defeatedMonsters.clear();
    }
}
