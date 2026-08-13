import { _decorator, Component, Label, Vec2, Vec3, tween, sp } from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Chest } from './Chest';

const { ccclass, property } = _decorator;

export interface PlayerEvents {
    /** 移动结束；blockMonster 非空表示停在怪物面前要战斗 */
    onArrive: (blockMonster: Monster | null) => void;
    /** 兜底：直接与怪物开战 */
    onBattle: (monster: Monster) => void;
    /** 攻击动画播完后开宝箱 */
    onChest: (chest: Chest) => void;
}

/** 角色：沿 A* 路径逐格移动；进怪前停下并回调战斗 */
@ccclass('Player')
export class Player extends Component {
    @property
    public power = 4407;

    @property
    public moveSpeed = 280;

    public gridCol = 0;
    public gridRow = 0;
    public events: PlayerEvents | null = null;

    private grid: Grid | null = null;
    private waypoints: Vec3[] = [];
    private pathIndex = 0;
    private moving = false;
    private pendingMonster: Monster | null = null;
    private baseScaleX = 1;
    private baseScaleY = 1;
    private baseScaleZ = 1;
    private facing = 1; // 1 朝右，-1 朝左
    private powerLabel: Label | null = null;
    private skeletons: sp.Skeleton[] = [];
    private animName = 'idle';
    /** 经验球缩放脉冲乘数（不影响朝向） */
    private pulseScale = 1;
    /** 失败后禁止再移动 / 寻路 */
    public dead = false;

    /** 设置初始朝向（切换角色形态时保留原朝向；dir < 0 朝左） */
    setInitialFacing(dir: number): void {
        this.facing = dir < 0 ? -1 : 1;
        this.applyFacing();
    }

    init(power: number, col: number, row: number, grid: Grid): void {
        // Label 是数值入口：预制体里 Label 文本就是初始战力，颜色/字号直接在编辑器改
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            this.powerLabel = label;
            const parsed = parseInt(label.string, 10);
            if (!isNaN(parsed) && parsed > 0) power = parsed;
        }
        this.power = power;
        this.gridCol = col;
        this.gridRow = row;
        this.grid = grid;
        // 记录预制体自身的缩放，翻转时只改 X 方向
        this.baseScaleX = Math.abs(this.node.scale.x);
        this.baseScaleY = this.node.scale.y;
        this.baseScaleZ = this.node.scale.z;
        this.facing = 1;
        // spine 下的每个子节点各挂了一个 Skeleton，全部拿下来一起播
        this.skeletons = this.node.getComponentsInChildren(sp.Skeleton);
        this.dead = false;
        this.applyFacing();
        this.node.setPosition(grid.gridToWorld(col, row));
        this.refreshLabel();
        this.playIdle();
    }

    /** 战斗后战力变化时同步头顶 Label */
    refreshLabel(): void {
        if (this.powerLabel) this.powerLabel.string = String(this.power);
    }

    moveTo(waypoints: Vec3[], blockMonster: Monster | null): void {
        this.waypoints = waypoints;
        this.pathIndex = 0;
        this.pendingMonster = blockMonster;
        this.moving = waypoints.length > 0;
        if (this.moving) this.playRun();
        else {
            this.playIdle();
            this.dispatchArrive();
        }
    }

    isMoving(): boolean {
        return this.moving;
    }

    /** 停止当前移动 */
    stop(): void {
        this.moving = false;
    }

    getPathIndex(): number {
        return this.pathIndex;
    }

    // ---------------- Spine 动画 ----------------

    private playAnim(name: string, loop: boolean): void {
        const skeletons = this.skeletons || [];
        if (skeletons.length === 0) return;
        if (this.animName === name) return;
        this.animName = name;
        for (const sk of skeletons) {
            if (sk && sk.isValid) sk.setAnimation(0, name, loop);
        }
    }

    playIdle(): void {
        this.playAnim('idle', true);
    }

    playRun(): void {
        this.playAnim('run', true);
    }

    /** 攻击动画播完回调（自动回到 idle 后触发） */
    playAttack(onComplete?: () => void): void {
        this.playAnim('phyattack1', false);
        this.onceAnimComplete(() => {
            this.playIdle();
            if (onComplete) onComplete();
        });
    }

    playDie(): void {
        this.dead = true;
        this.playAnim('die', false);
    }

    /** 收到经验球反馈：0.1s 缩放变 1.2，再 0.1s 恢复（白光后续再加） */
    playExpPulse(): void {
        this.pulseScale = 1;
        tween(this)
            .to(0.1, { pulseScale: 1.2 }, { easing: 'quadOut', onUpdate: () => this.applyFacing() })
            .to(0.1, { pulseScale: 1 }, { easing: 'quadIn', onUpdate: () => this.applyFacing() })
            .start();
    }

    private onceAnimComplete(cb: () => void): void {
        const valid: sp.Skeleton[] = [];
        const skeletons = this.skeletons || [];
        for (const sk of skeletons) {
            if (sk && sk.isValid) valid.push(sk);
        }
        if (valid.length === 0) {
            cb();
            return;
        }
        let done = false;
        const onComplete = () => {
            if (done) return;
            done = true;
            for (const sk of skeletons) {
                if (sk && sk.isValid) sk.setCompleteListener(() => {});
            }
            cb();
        };
        for (const sk of valid) sk.setCompleteListener(onComplete);
    }

    update(dt: number): void {
        if (this.dead || !this.moving || !this.grid) return;
        if (this.pathIndex >= this.waypoints.length) {
            this.moving = false;
            this.playIdle();
            this.dispatchArrive();
            return;
        }
        const target = this.waypoints[this.pathIndex];
        const pos = this.node.position;

        // 当前线段上第一个进入的怪物 / 宝箱占格：走到边缘停下处理
        const occ = this.grid.firstOccupantOnSegment(pos, target);
        if (occ) {
            const entry = this.monsterEntryPoint(occ.cell, target);
            const ex = entry.x - pos.x;
            const ey = entry.y - pos.y;
            const edist = Math.sqrt(ex * ex + ey * ey);
            const estep = this.moveSpeed * dt;
            if (edist <= estep) {
                this.node.setPosition(entry);
                this.moving = false;
                const occNode = occ.monster ? occ.monster.node : (occ.chest ? occ.chest.node : null);
                if (occNode) {
                    if (occNode.position.x < this.node.position.x) this.setFacing(-1);
                    else if (occNode.position.x > this.node.position.x) this.setFacing(1);
                }
                if (occ.monster) {
                    this.playAttack();
                    if (this.events && this.events.onBattle) this.events.onBattle(occ.monster);
                } else if (occ.chest) {
                    // 宝箱：攻击动画播完才开箱
                    this.playAttack(() => {
                        if (this.events && this.events.onChest && occ.chest) this.events.onChest(occ.chest);
                    });
                }
            } else {
                if (ex > 0) this.setFacing(1);
                else if (ex < 0) this.setFacing(-1);
                this.node.setPosition(pos.x + (ex / edist) * estep, pos.y + (ey / edist) * estep, pos.z);
            }
            return;
        }

        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = this.moveSpeed * dt;

        if (dist <= step) {
            this.node.setPosition(target);
            const c = this.grid.worldToGrid(target);
            if (c) {
                this.gridCol = c.x;
                this.gridRow = c.y;
            }
            this.pathIndex++;
            if (this.pathIndex >= this.waypoints.length) {
                this.moving = false;
                this.playIdle();
                this.dispatchArrive();
            }
        } else {
            if (dx > 0) this.setFacing(1);
            else if (dx < 0) this.setFacing(-1);
            this.node.setPosition(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step, pos.z);
        }
    }

    /**
     * 当前线段（pos -> toward）进入怪物格的交点：停在怪物格边缘，不进入怪物格。
     * toward 是当前目标点（可能在怪物身后），用真实行进方向算交点。
     */
    private monsterEntryPoint(cell: Vec2, toward: Vec3): Vec3 {
        const pos = this.node.position;
        const c = this.grid!.gridToWorld(cell.x, cell.y);
        const half = this.grid!.tileSize / 2;
        const dx = toward.x - pos.x;
        const dy = toward.y - pos.y;
        let tx = Infinity;
        let ty = Infinity;
        if (dx > 0) tx = (c.x - half - pos.x) / dx;
        else if (dx < 0) tx = (c.x + half - pos.x) / dx;
        if (dy > 0) ty = (c.y - half - pos.y) / dy;
        else if (dy < 0) ty = (c.y + half - pos.y) / dy;
        const t = Math.max(0, Math.min(tx, ty));
        return new Vec3(pos.x + dx * t, pos.y + dy * t, pos.z);
    }

    private setFacing(dir: number): void {
        if (this.facing === dir) return;
        this.facing = dir;
        this.applyFacing();
    }

    private applyFacing(): void {
        this.node.setScale(
            this.baseScaleX * this.facing * this.pulseScale,
            this.baseScaleY * this.pulseScale,
            this.baseScaleZ,
        );
        // 头顶 Label 反向补偿缩放：角色镜像时文字保持正向、大小不变
        if (this.powerLabel) {
            this.powerLabel.node.setScale(
                1 / (this.baseScaleX * this.facing),
                1 / this.baseScaleY,
                1 / this.baseScaleZ,
            );
        }
    }

    private dispatchArrive(): void {
        const m = this.pendingMonster;
        this.pendingMonster = null;
        if (this.events && this.events.onArrive) this.events.onArrive(m);
    }
}
