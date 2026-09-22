import { Node, Vec2, Vec3 } from 'cc';
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
    sideApproachAttempted: boolean;
    attackAtPathEnd: boolean;
}

/** 管理玩家点击后的怪物追击、攻击与角色扣血。 */
export class MonsterCombatController {
    private static readonly RANGE_EPSILON = 0.5;
    private state: PursuitState | null = null;
    private attackMonsterNode: Node | null = null;
    private attackMonsterParent: Node | null = null;
    private attackMonsterSiblingIndex: number | null = null;
    private keepAttackMonsterInTempLayer = false;

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
            sideApproachAttempted: false,
            attackAtPathEnd: false,
        };
    }

    disengage(monster?: Monster): void {
        if (!this.state || (monster && this.state.monster !== monster)) return;
        if (this.state.monster.node?.isValid && !this.isDefeated(this.state.monster)) {
            this.state.monster.playIdle();
        }
        this.state = null;
        this.restoreMonsterLayer();
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
        state.sideApproachAttempted = false;
        state.attackAtPathEnd = false;
        this.moveMonsterToTempLayer(monster);
        const grid = this.getGrid();
        const player = this.getPlayer();
        if (grid && player) this.rebuildPath(state, grid, player);
    }

    update(dt: number): void {
        const state = this.state;
        const player = this.getPlayer();
        const grid = this.getGrid();
        if (!state || !player || !grid) return;
        const monster = state.monster;
        if (player.dead) {
            // 命中后角色已经进入死亡状态，但怪物攻击动画仍需保持在角色层下方，
            // 等攻击动画完成回调恢复层级后再清理本轮反击。
            if (!state.attacking) this.disengage(monster);
            return;
        }
        if (!player.node?.isValid || !monster.node?.isValid || this.isDefeated(monster)) {
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
        monster.faceToWorldX(playerWorld.x);

        // 左右侧路径以最终落点为准：到点立即停止并攻击，不再重复校验距离或角度。
        if (state.attackAtPathEnd) {
            if (state.pathIndex >= state.path.length) {
                if (!state.attacking && state.attackCooldown <= 0) this.startAttack(state, player);
                else if (!state.attacking) monster.playIdle();
                return;
            }
            if (!state.attacking) this.moveAlongPath(state, deltaTime);
            return;
        }

        const localDelta = this.getGridLocalDelta(monster.node, player.node);
        const dx = localDelta.x;
        const dy = localDelta.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const attackRange = Math.max(0, monster.attackRange);

        if (distance <= attackRange + MonsterCombatController.RANGE_EPSILON) {
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
        this.restoreMonsterLayer(true);
    }

    private startAttack(state: PursuitState, player: Player): void {
        const monster = state.monster;
        state.attacking = true;
        monster.playAttackThenIdle(
            () => {
                this.restoreMonsterLayer();
                if (this.state !== state) return;
                state.attacking = false;
                state.attackCooldown = Math.max(0.01, monster.attackInterval);
            },
            () => {
                if (this.state !== state || player.dead || this.isDefeated(monster)) return;
                const localDelta = this.getGridLocalDelta(monster.node, player.node);
                const dx = localDelta.x;
                const dy = localDelta.y;
                const range = Math.max(0, monster.attackRange);
                const allowedRange = range + MonsterCombatController.RANGE_EPSILON;
                if (dx * dx + dy * dy > allowedRange * allowedRange) return;
                // 角色完成一轮技能后怪物仍未死，说明战力低于怪物；
                // 怪物冲到范围后的第一次有效命中直接击杀角色。
                this.keepAttackMonsterInTempLayer = true;
                player.power = 0;
                player.setDisplayedPower(0);
                AudioManager.playRoleDie();
                player.stop();
                player.playDie(() => this.showDeathUI());
            },
            monster.attackHitDelay,
        );
    }

    /** 攻击范围配置使用 GameWorld 本地单位，不能直接和受 GameWorld 缩放影响的世界坐标比较。 */
    private getGridLocalDelta(monsterNode: Node, playerNode: Node): Vec2 {
        const grid = this.getGrid();
        if (!grid?.node?.isValid) {
            const monsterWorld = monsterNode.worldPosition;
            const playerWorld = playerNode.worldPosition;
            return new Vec2(playerWorld.x - monsterWorld.x, playerWorld.y - monsterWorld.y);
        }
        const monsterLocal = new Vec3();
        const playerLocal = new Vec3();
        grid.node.inverseTransformPoint(monsterLocal, monsterNode.worldPosition);
        grid.node.inverseTransformPoint(playerLocal, playerNode.worldPosition);
        return new Vec2(playerLocal.x - monsterLocal.x, playerLocal.y - monsterLocal.y);
    }

    /** 反击追击开始时把当前怪物临时放到 GameWorld/MonsterTempLayer。 */
    private moveMonsterToTempLayer(monster: Monster): void {
        if (this.attackMonsterNode) return;
        const node = monster.node;
        const originalParent = node.parent;
        const worldNode = originalParent?.parent;
        const tempLayer = worldNode?.getChildByName('MonsterTempLayer');
        if (!originalParent || !tempLayer || tempLayer === originalParent) return;

        this.attackMonsterNode = node;
        this.attackMonsterParent = originalParent;
        this.attackMonsterSiblingIndex = node.getSiblingIndex();
        this.keepAttackMonsterInTempLayer = false;
        node.setParent(tempLayer, true);
        node.setSiblingIndex(tempLayer.children.length - 1);
    }

    private restoreMonsterLayer(force = false): void {
        if (this.keepAttackMonsterInTempLayer && !force) return;
        const node = this.attackMonsterNode;
        const parent = this.attackMonsterParent;
        const index = this.attackMonsterSiblingIndex;
        this.attackMonsterNode = null;
        this.attackMonsterParent = null;
        this.attackMonsterSiblingIndex = null;
        this.keepAttackMonsterInTempLayer = false;
        if (!node?.isValid || !parent?.isValid) return;
        node.setParent(parent, true);
        if (index !== null) node.setSiblingIndex(Math.min(index, parent.children.length - 1));
    }

    private rebuildPath(state: PursuitState, grid: Grid, player: Player): void {
        const monsterPosition = state.monster.node.position.clone();
        const playerPosition = player.node.position.clone();
        if (!state.sideApproachAttempted) {
            state.sideApproachAttempted = true;
            const attackDistance = Math.max(0, state.monster.attackRange);
            const sideDx = monsterPosition.x - playerPosition.x;
            const sideDy = monsterPosition.y - playerPosition.y;
            const preferredSide = Math.abs(sideDx) > 0.5 ? Math.sign(sideDx) : -1;
            const desiredAngle = Math.atan2(sideDy, Math.max(0.001, Math.abs(sideDx))) * 180 / Math.PI;
            const sidePath = grid.buildSideApproachPath(
                monsterPosition,
                playerPosition,
                attackDistance,
                {
                    preferredSide,
                    desiredAngle,
                    angleLimit: state.monster.battleAngleLimit,
                    movingMonster: state.monster,
                },
            );
            if (sidePath) {
                state.attackAtPathEnd = true;
                state.path = sidePath;
                state.pathIndex = state.path.length > 1 ? 1 : 0;
                return;
            }
        }

        // 左右侧都没有合法落点时，保留原追击逻辑，避免怪物卡住不攻击。
        state.attackAtPathEnd = false;
        const start = grid.worldToGrid(monsterPosition)
            || new Vec2(state.monster.gridCol, state.monster.gridRow);
        const target = grid.worldToGrid(playerPosition)
            || new Vec2(player.gridCol, player.gridRow);
        const result = grid.findPath(start, target);
        if (!result) {
            state.path = [];
            state.pathIndex = 0;
            return;
        }
        state.path = grid.buildMovePath(start, result.path, monsterPosition);
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
            if (state.pathIndex >= state.path.length) monster.playIdle();
            return;
        }
        monster.setCombatPosition(new Vec3(
            current.x + dx / distance * step,
            current.y + dy / distance * step,
            current.z,
        ));
    }
}
