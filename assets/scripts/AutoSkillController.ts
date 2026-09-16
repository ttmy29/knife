import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { PlayerSkillController } from './PlayerSkillController';
import { SkillConfig } from './config/SkillConfig';

/** 负责技能范围扫描、冷却、目标选择与自动施法。 */
export class AutoSkillController {
    private elapsed = 0;
    private readonly activeTargets = new Set<Monster>();

    constructor(
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly getSkills: () => PlayerSkillController | null,
        private readonly isBlocked: () => boolean,
        private readonly isDefeated: (monster: Monster) => boolean,
        private readonly getFinalMonster: () => Monster | null,
        private readonly onFinalMonsterTargeted: () => void,
        private readonly onDefeat: (monster: Monster, config: SkillConfig) => void,
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
        let chestBlocksSkill = false;
        for (const chest of this.getGrid()?.getChests() || []) {
            if (!chest.node || !chest.node.isValid || !chest.node.activeInHierarchy) continue;
            const chestWorld = chest.node.worldPosition;
            const dx = chestWorld.x - playerWorld.x;
            const dy = chestWorld.y - playerWorld.y;
            if (dx * dx + dy * dy <= rangeSq) {
                chestBlocksSkill = true;
                break;
            }
        }

        let target: Monster | null = null;
        let nearestDistanceSq = Infinity;
        for (const monster of this.getGrid()?.getMonsters() || []) {
            if (!monster.node || !monster.node.isValid || !monster.node.activeInHierarchy) continue;
            if (this.isDefeated(monster) || this.activeTargets.has(monster)) continue;
            const monsterWorld = monster.node.worldPosition;
            const dx = monsterWorld.x - playerWorld.x;
            const dy = monsterWorld.y - playerWorld.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq > rangeSq) continue;
            if (target && (monster.power > target.power
                || (monster.power === target.power && distanceSq >= nearestDistanceSq))) continue;
            target = monster;
            nearestDistanceSq = distanceSq;
        }
        if (!target || player.power <= target.power || chestBlocksSkill) return;
        if (this.getRemainingCooldown(config.attackInterval) > 0 || skills?.isCasting()) return;

        const skillTarget = target;
        this.activeTargets.add(skillTarget);
        skillTarget.setViewportVisible(true);
        player.faceToWorldX(skillTarget.node.worldPosition.x);
        skillTarget.faceToWorldX(player.node.worldPosition.x);
        if (skillTarget === this.getFinalMonster()) this.onFinalMonsterTargeted();

        const casted = skills?.castCurrentSkill(
            player,
            skillTarget,
            () => {
                this.onDefeat(skillTarget, config);
                this.activeTargets.delete(skillTarget);
            },
            () => this.activeTargets.delete(skillTarget),
        ) || false;
        if (!casted) {
            this.activeTargets.delete(skillTarget);
            return;
        }
        this.resetCooldown();
    }

    isTargeted(monster: Monster): boolean {
        return this.activeTargets.has(monster);
    }

    releaseTarget(monster: Monster): void {
        this.activeTargets.delete(monster);
    }

    getRemainingCooldown(interval: number): number {
        return Math.max(0, Math.max(0.01, interval) - this.elapsed);
    }

    resetCooldown(): void {
        this.elapsed = 0;
    }

    destroy(): void {
        this.activeTargets.clear();
        this.elapsed = 0;
    }
}
