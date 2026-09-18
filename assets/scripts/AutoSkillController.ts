import { FinalBossCinematicController } from './FinalBossCinematicController';
import { Monster } from './Monster';
import { Player } from './Player';
import { PlayerSkillController } from './PlayerSkillController';
import { SkillConfig } from './config/SkillConfig';

/** 负责已点击目标的技能范围检查、冷却与自动施法。 */
export class AutoSkillController {
    private elapsed = 0;
    private readonly activeTargets = new Set<Monster>();
    private selectedTarget: Monster | null = null;

    constructor(
        private readonly getPlayer: () => Player | null,
        private readonly getSkills: () => PlayerSkillController | null,
        private readonly isBlocked: () => boolean,
        private readonly isDefeated: (monster: Monster) => boolean,
        private readonly getFinalMonster: () => Monster | null,
        private readonly getFinalBossCinematic: () => FinalBossCinematicController | null,
        private readonly onFinalMonsterTargeted: () => void,
        private readonly onDefeat: (monster: Monster, config: SkillConfig) => void,
        private readonly onStopForAttack: () => void,
    ) {}

    update(dt: number): void {
        this.elapsed = Math.min(60, this.elapsed + Math.max(0, dt));
        const player = this.getPlayer();
        const skills = this.getSkills();
        const config = skills?.getCurrentConfig() || null;
        if (!player || !player.node.isValid || player.dead || !config || this.isBlocked()) return;

        const playerWorld = player.node.worldPosition;
        const range = Math.max(0, config.attackRange);
        const rangeSq = range * range;

        const target = this.selectedTarget;
        if (!target?.node?.isValid
            || !target.node.activeInHierarchy
            || this.isDefeated(target)) {
            this.selectedTarget = null;
            return;
        }
        const monsterWorld = target.node.worldPosition;
        const dx = monsterWorld.x - playerWorld.x;
        const dy = monsterWorld.y - playerWorld.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > rangeSq || player.power <= target.power) return;
        this.stopPlayerForAttack(player, target);
        if (this.activeTargets.has(target)) return;
        if (this.getRemainingCooldown(config.attackInterval) > 0 || skills?.isCasting()) return;
        const targetIsFinalMonster = target === this.getFinalMonster();
        const targetBossCinematic = targetIsFinalMonster ? this.getFinalBossCinematic() : null;
        if (targetBossCinematic && !targetBossCinematic.isSkillAttackMaskComplete()) {
            targetBossCinematic.prepareSkillAttackMask();
            return;
        }

        const skillTarget = target;
        this.activeTargets.add(skillTarget);
        skillTarget.setViewportVisible(true);
        player.faceToWorldX(skillTarget.node.worldPosition.x);
        skillTarget.faceToWorldX(player.node.worldPosition.x);
        const isFinalMonster = skillTarget === this.getFinalMonster();
        if (isFinalMonster) this.onFinalMonsterTargeted();

        const bossCinematic = isFinalMonster ? this.getFinalBossCinematic() : null;
        const casted = skills?.castCurrentSkill(
            player,
            skillTarget,
            () => {
                bossCinematic?.finishSkillSlowMotion();
                this.onDefeat(skillTarget, config);
                this.activeTargets.delete(skillTarget);
            },
            () => {
                bossCinematic?.finishSkillSlowMotion();
                this.activeTargets.delete(skillTarget);
            },
            isFinalMonster,
        ) || false;
        if (!casted) {
            this.activeTargets.delete(skillTarget);
            return;
        }
        if (skills) bossCinematic?.startSkillSlowMotion(player, skillTarget, skills);
        this.resetCooldown();
    }

    isTargeted(monster: Monster): boolean {
        return this.activeTargets.has(monster);
    }

    /** 返回 true 表示目标已在攻击范围内，输入层不应再启动寻路。 */
    selectTarget(monster: Monster): boolean {
        if (this.isDefeated(monster) || !monster.node?.isValid) return false;
        this.selectedTarget = monster;
        const player = this.getPlayer();
        const config = this.getSkills()?.getCurrentConfig() || null;
        if (!player || !player.node.isValid || !config || player.power <= monster.power) return false;

        const playerWorld = player.node.worldPosition;
        const monsterWorld = monster.node.worldPosition;
        const dx = monsterWorld.x - playerWorld.x;
        const dy = monsterWorld.y - playerWorld.y;
        const range = Math.max(0, config.attackRange);
        if (dx * dx + dy * dy > range * range) return false;

        this.stopPlayerForAttack(player, monster);
        return true;
    }

    clearSelectedTarget(): void {
        this.selectedTarget = null;
    }

    isSelectedTarget(monster: Monster): boolean {
        return this.selectedTarget === monster;
    }

    releaseTarget(monster: Monster): void {
        this.activeTargets.delete(monster);
        if (this.selectedTarget === monster) this.selectedTarget = null;
    }

    getRemainingCooldown(interval: number): number {
        return Math.max(0, Math.max(0.01, interval) - this.elapsed);
    }

    resetCooldown(): void {
        this.elapsed = 0;
    }

    private stopPlayerForAttack(player: Player, monster: Monster): void {
        if (player.isMoving()) player.stop();
        player.playIdle();
        player.faceToWorldX(monster.node.worldPosition.x);
        monster.faceToWorldX(player.node.worldPosition.x);
        this.onStopForAttack();
    }

    destroy(): void {
        this.activeTargets.clear();
        this.selectedTarget = null;
        this.elapsed = 0;
    }
}
