import { Component } from 'cc';
import { AutoSkillController } from './AutoSkillController';
import { FinalBossCinematicController } from './FinalBossCinematicController';
import { Monster } from './Monster';
import { Player } from './Player';
import { PlayerSkillController } from './PlayerSkillController';
import { BaseRoleSpecialBattleConfig } from './config/PlayerRoleConfig';
import { isDamageSkill } from './config/SkillConfig';
import { AudioManager } from './core/AudioManager';

type ResolveMonsterDefeat = (
    monster: Monster,
    hitAnimation?: string,
    deathAnimation?: string,
    impactEffect?: 'boom' | 'boom2' | 'light',
    impactEffectAnimation?: string,
    playDeadEffect?: boolean,
) => void;

/** 负责进入怪物范围后的停步、战力判断、技能等待和角色死亡流程。 */
export class BattleController {
    private battling = false;
    private activeMonster: Monster | null = null;

    constructor(
        private readonly host: Component,
        private readonly getPlayer: () => Player | null,
        private readonly getSkills: () => PlayerSkillController | null,
        private readonly getAutoSkills: () => AutoSkillController | null,
        private readonly isDefeated: (monster: Monster) => boolean,
        private readonly getFinalMonster: () => Monster | null,
        private readonly getFinalBossCinematic: () => FinalBossCinematicController | null,
        private readonly isBaseRole: () => boolean,
        private readonly hideMonsterGlow: () => void,
        private readonly clearPath: () => void,
        private readonly stopHelpSounds: () => void,
        private readonly resolveMonsterDefeat: ResolveMonsterDefeat,
        private readonly showDeathUI: () => void,
    ) {}

    start(monster: Monster): void {
        const player = this.getPlayer();
        const autoSkills = this.getAutoSkills();
        if (!player || this.battling || this.isDefeated(monster)) return;

        // 逐次伤害技能由 AutoSkill + MonsterCombat 持续结算，
        // 不再进入旧的战力比较后直接生死流程。
        const damageSkill = this.getSkills()?.getCurrentConfig();
        if (isDamageSkill(damageSkill)) {
            this.hideMonsterGlow();
            this.clearPath();
            player.stop();
            player.playIdle();
            player.faceToWorldX(monster.node.worldPosition.x);
            monster.faceToWorldX(player.node.worldPosition.x);
            return;
        }
        if (autoSkills?.isTargeted(monster)) return;

        this.hideMonsterGlow();
        this.battling = true;
        this.activeMonster = monster;
        monster.setViewportVisible(true);
        this.clearPath();
        player.stop();
        player.playIdle();
        player.faceToWorldX(monster.node.worldPosition.x);
        monster.faceToWorldX(player.node.worldPosition.x);
        monster.playAttackThenIdle();

        const useSpecialAttack = this.isBaseRole()
            && BaseRoleSpecialBattleConfig.targetMonsterNames.some(name => name === monster.node.name);
        const playPlayerAttack = (
            onComplete?: () => void,
            onImpact?: () => void,
            playSound = true,
            playEffect = true,
        ): void => {
            const currentPlayer = this.getPlayer();
            if (!currentPlayer) return;
            if (useSpecialAttack) {
                currentPlayer.playAttackAnimation(
                    BaseRoleSpecialBattleConfig.attackAnimation,
                    onComplete,
                    onImpact,
                    undefined,
                    BaseRoleSpecialBattleConfig.attackSoundDelay,
                    BaseRoleSpecialBattleConfig.attackImpactDelay,
                    playSound,
                    playEffect,
                );
            } else currentPlayer.playAttack(onComplete, onImpact, undefined, playSound, playEffect);
        };

        const win = player.power > monster.power;
        const rewardPower = monster.power;
        const finalMonster = this.getFinalMonster();
        if (monster === finalMonster) {
            this.stopHelpSounds();
            this.getFinalBossCinematic()?.startBattleCamera();
        }
        if (!win) {
            playPlayerAttack(undefined, undefined, false);
            this.host.scheduleOnce(() => {
                const currentPlayer = this.getPlayer();
                if (!currentPlayer || !currentPlayer.node.isValid) return;
                currentPlayer.power = 0;
                currentPlayer.setDisplayedPower(0);
                AudioManager.playRoleDie();
                currentPlayer.playDie(() => {
                    this.battling = false;
                    this.clearActiveMonster(monster);
                    this.showDeathUI();
                });
            }, 0.5);
            return;
        }

        // 路径经过怪物时仍会进入其战斗范围并承受攻击，
        // 但只有玩家明确点击锁定的怪物才允许角色反击。
        if (!autoSkills?.isSelectedTarget(monster)) {
            this.battling = false;
            this.clearActiveMonster(monster);
            return;
        }

        const isFinalMonster = monster === finalMonster;
        let battleResolved = false;
        const finishWin = (
            hitAnimation?: string,
            deathAnimation?: string,
            impactEffect?: 'boom' | 'boom2' | 'light',
            impactEffectAnimation?: string,
            playDeadEffect?: boolean,
        ) => {
            if (battleResolved) return;
            battleResolved = true;
            this.resolveMonsterDefeat(
                monster,
                hitAnimation,
                deathAnimation,
                impactEffect,
                impactEffectAnimation,
                playDeadEffect,
            );
        };
        const finishSkill = () => {
            this.battling = false;
            if (!battleResolved) this.clearActiveMonster(monster);
        };
        const trySkillBattle = (): void => {
            const currentPlayer = this.getPlayer();
            const skills = this.getSkills();
            if (!currentPlayer || !currentPlayer.node.isValid
                || this.isDefeated(monster)
                || !monster.node || !monster.node.isValid
                || this.activeMonster !== monster) {
                this.battling = false;
                return;
            }

            const currentSkillConfig = skills?.getCurrentConfig() || null;
            if (currentSkillConfig) {
                const remainingCooldown = autoSkills?.getRemainingCooldown(
                    Math.max(0.01, currentSkillConfig.attackInterval),
                ) || 0;
                if (remainingCooldown > 0) {
                    this.host.scheduleOnce(
                        () => trySkillBattle(),
                        Math.max(0.01, Math.min(0.05, remainingCooldown)),
                    );
                    return;
                }
            }

            const bossCinematic = isFinalMonster ? this.getFinalBossCinematic() : null;
            if (bossCinematic && currentSkillConfig && !bossCinematic.isSkillAttackMaskComplete()) {
                bossCinematic.prepareSkillAttackMask(trySkillBattle);
                return;
            }
            const skillCasted = skills?.castCurrentSkill(
                currentPlayer,
                monster,
                () => {
                    bossCinematic?.finishSkillSlowMotion();
                    finishWin(
                        currentSkillConfig?.monsterHitAnimation,
                        currentSkillConfig?.monsterDeathAnimation,
                        currentSkillConfig?.monsterImpactEffect,
                        currentSkillConfig?.monsterImpactEffectAnimation,
                        currentSkillConfig?.playDeadEffect,
                    );
                },
                () => {
                    bossCinematic?.finishSkillSlowMotion();
                    finishSkill();
                },
                isFinalMonster,
            ) || false;
            if (skillCasted) {
                if (skills) bossCinematic?.startSkillSlowMotion(currentPlayer, monster, skills);
                autoSkills?.resetCooldown();
                return;
            }

            if (skills?.hasUnlockedSkill()) {
                if (skills.isCasting()) {
                    this.host.scheduleOnce(() => trySkillBattle(), 0.05);
                    return;
                }
                console.warn('[BattleController] current skill template is unavailable; battle cancelled');
                this.battling = false;
                this.clearActiveMonster(monster);
                return;
            }

            if (isFinalMonster) {
                this.getFinalBossCinematic()?.playAttackSequence(
                    currentPlayer,
                    monster,
                    rewardPower,
                    finishWin,
                    () => {},
                );
            } else {
                playPlayerAttack(() => {
                    finishWin();
                    this.battling = false;
                }, finishWin);
            }
        };
        trySkillBattle();
    }

    isBattling(): boolean {
        return this.battling;
    }

    getActiveMonster(): Monster | null {
        return this.activeMonster;
    }

    clearActiveMonster(monster: Monster): void {
        if (this.activeMonster === monster) this.activeMonster = null;
    }

    clear(): void {
        this.battling = false;
        this.activeMonster = null;
    }
}
