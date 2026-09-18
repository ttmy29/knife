import { Vec2, Vec3 } from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { AudioManager } from './core/AudioManager';

interface PursuitState {
    monster: Monster;
    phase: 'waiting-player' | 'counter-attacking';
    path: Vec3[];
    pathIndex: number;
    repathElapsed: number;
    attackCooldown: number;
    attacking: boolean;
}

/** 管理玩家点击后的怪物追击、攻击与角色扣血。 */
export class MonsterCombatController {
    private state: PursuitState | null = null;

    constructor(
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly isDefeated: (monster: Monster) => boolean,
        private readonly showDeathUI: () => void,
    ) {}

    engage(monster: Monster): void {
        if (!monster?.node?.isValid || this.isDefeated(monster)) return;
        if (this.state?.monster === monster) return;
        if (this.state?.monster.node?.isValid) this.state.monster.playIdle();
        monster.setViewportVisible(true);
        this.state = {
            monster,
            phase: 'waiting-player',
            path: [],
            pathIndex: 0,
            repathElapsed: 1,
            attackCooldown: 0,
            attacking: false,
        };
    }

    disengage(monster?: Monster): void {
        if (!this.state || (monster && this.state.monster !== monster)) return;
        if (this.state.monster.node?.isValid && !this.isDefeated(this.state.monster)) {
            this.state.monster.playIdle();
        }
        this.state = null;
    }

    getActiveMonster(): Monster | null {
        return this.state?.monster || null;
    }

    isInputLocked(): boolean {
        return !!this.state;
    }

    isCounterAttacking(): boolean {
        return this.state?.phase === 'counter-attacking';
    }

    /** 角色整轮技能结束且怪物未死时，才允许怪物开始反击。 */
    beginCounterAttack(monster: Monster): void {
        const state = this.state;
        if (!state || state.monster !== monster || this.isDefeated(monster)) return;
        state.phase = 'counter-attacking';
        state.path = [];
        state.pathIndex = 0;
        state.repathElapsed = 1;
        state.attackCooldown = 0;
        state.attacking = false;
    }

    update(dt: number): void {
        const state = this.state;
        const player = this.getPlayer();
        const grid = this.getGrid();
        if (!state || !player || !grid) return;
        const monster = state.monster;
        if (player.dead || !player.node?.isValid || !monster.node?.isValid || this.isDefeated(monster)) {
            this.disengage(monster);
            return;
        }
        if (state.phase === 'waiting-player') {
            monster.faceToWorldX(player.node.worldPosition.x);
            monster.playIdle();
            return;
        }

        const deltaTime = Math.max(0, dt);
        state.attackCooldown = Math.max(0, state.attackCooldown - deltaTime);
        const monsterWorld = monster.node.worldPosition;
        const playerWorld = player.node.worldPosition;
        const dx = playerWorld.x - monsterWorld.x;
        const dy = playerWorld.y - monsterWorld.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        monster.faceToWorldX(playerWorld.x);

        if (distance <= Math.max(0, monster.attackRange)) {
            if (!state.attacking && state.attackCooldown <= 0) this.startAttack(state, player);
            else if (!state.attacking) monster.playIdle();
            return;
        }
        if (state.attacking) return;

        state.repathElapsed += deltaTime;
        if (state.repathElapsed >= 0.2 || state.pathIndex >= state.path.length) {
            this.rebuildPath(state, grid, player);
            state.repathElapsed = 0;
        }
        this.moveAlongPath(state, deltaTime);
    }

    destroy(): void {
        this.disengage();
    }

    private startAttack(state: PursuitState, player: Player): void {
        const monster = state.monster;
        state.attacking = true;
        monster.playAttackThenIdle(
            () => {
                if (this.state !== state) return;
                state.attacking = false;
                state.attackCooldown = Math.max(0.01, monster.attackInterval);
            },
            () => {
                if (this.state !== state || player.dead || this.isDefeated(monster)) return;
                const monsterWorld = monster.node.worldPosition;
                const playerWorld = player.node.worldPosition;
                const dx = playerWorld.x - monsterWorld.x;
                const dy = playerWorld.y - monsterWorld.y;
                const range = Math.max(0, monster.attackRange) + 20;
                if (dx * dx + dy * dy > range * range) return;
                // 角色完成一轮技能后怪物仍未死，说明战力低于怪物；
                // 怪物冲到范围后的第一次有效命中直接击杀角色。
                player.power = 0;
                player.setDisplayedPower(0);
                AudioManager.playRoleDie();
                player.stop();
                player.playDie(() => this.showDeathUI());
            },
            monster.attackHitDelay,
        );
    }

    private rebuildPath(state: PursuitState, grid: Grid, player: Player): void {
        const start = grid.worldToGrid(state.monster.node.position)
            || new Vec2(state.monster.gridCol, state.monster.gridRow);
        const target = grid.worldToGrid(player.node.position)
            || new Vec2(player.gridCol, player.gridRow);
        const result = grid.findPath(start, target);
        if (!result) {
            state.path = [];
            state.pathIndex = 0;
            return;
        }
        state.path = grid.buildMovePath(start, result.path, state.monster.node.position.clone());
        state.pathIndex = state.path.length > 1 ? 1 : 0;
    }

    private moveAlongPath(state: PursuitState, dt: number): void {
        const monster = state.monster;
        if (state.pathIndex >= state.path.length) {
            monster.playIdle();
            return;
        }
        const current = monster.node.position;
        const target = state.path[state.pathIndex];
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(0, monster.moveSpeed) * dt;
        monster.playMove();
        if (distance <= step || distance <= 0.001) {
            monster.setCombatPosition(target);
            state.pathIndex++;
            return;
        }
        monster.setCombatPosition(new Vec3(
            current.x + dx / distance * step,
            current.y + dy / distance * step,
            current.z,
        ));
    }
}
