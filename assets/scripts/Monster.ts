import { _decorator, Component, Label, Node, Vec2, UITransform, sp } from 'cc';
import { Grid } from './Grid';

const { ccclass, property } = _decorator;

/** 怪物：占格 + 数值；由 GameManager 对场景里摆放好的怪物节点 init */
@ccclass('Monster')
export class Monster extends Component {
    @property
    public power = 0;

    /** 战斗触发范围 = 怪物视觉大小 x 该系数（1=整个盒子，0.6=更贴近身体） */
    @property
    public footprintScale = 0.8;

    public gridCol = 0;
    public gridRow = 0;
    /** 怪物按实际视觉大小占据的所有格子（战斗触发范围） */
    public cells: Vec2[] = [];

    private grid: Grid | null = null;
    private powerLabel: Label | null = null;
    private skeletons: sp.Skeleton[] = [];
    private animName = 'idle';

    /** 位置取节点实际坐标（吸附到最近格子），数值取子 Label 文本 */
    init(grid: Grid): void {
        this.grid = grid;
        const cell = grid.worldToGrid(this.node.position);
        if (cell) {
            this.gridCol = cell.x;
            this.gridRow = cell.y;
            this.node.setPosition(grid.gridToWorld(cell.x, cell.y));
        }
        this.computeCells();
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            this.powerLabel = label;
            const parsed = parseInt(label.string, 10);
            if (!isNaN(parsed)) {
                this.power = parsed;
                label.string = String(this.power);
            } else if (this.power > 0) {
                label.string = String(this.power);
            }
        }
        // 怪物骨架（可能在根节点，也可能在子节点）全部拿下来，初始播 idle
        this.skeletons = this.node.getComponentsInChildren(sp.Skeleton);
        this.playIdle();
        grid.addMonster(this);
    }

    /** 按怪物实际视觉大小（节点 UITransform x 缩放）计算占据的格子 */
    private computeCells(): void {
        this.cells = [];
        if (!this.grid) return;
        const ut = this.node.getComponent(UITransform);
        const w = (ut ? ut.width * Math.abs(this.node.scale.x) : this.grid.tileSize) * this.footprintScale;
        const h = (ut ? ut.height * Math.abs(this.node.scale.y) : this.grid.tileSize) * this.footprintScale;
        const pos = this.node.position;
        const halfW = w / 2;
        const halfH = h / 2;
        const colMin = Math.floor((pos.x - halfW) / this.grid.tileSize + this.grid.cols / 2);
        const colMax = Math.floor((pos.x + halfW) / this.grid.tileSize + this.grid.cols / 2);
        const rowMin = Math.floor((pos.y - halfH) / this.grid.tileSize + this.grid.rows / 2);
        const rowMax = Math.floor((pos.y + halfH) / this.grid.tileSize + this.grid.rows / 2);
        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                if (!this.grid.inBounds(c, r)) continue;
                const center = this.grid.gridToWorld(c, r);
                if (Math.abs(center.x - pos.x) <= halfW && Math.abs(center.y - pos.y) <= halfH) {
                    this.cells.push(new Vec2(c, r));
                }
            }
        }
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

    /** 更新头顶数字（战斗中分段跳动用） */
    setLabelText(text: string): void {
        if (this.powerLabel) this.powerLabel.string = text;
    }

    getPowerLabelGlowRoot(): Node | null {
        if (!this.powerLabel || !this.powerLabel.node || !this.powerLabel.node.isValid) return null;
        const parent = this.powerLabel.node.parent;
        if (parent && parent !== this.node) return parent;
        return this.powerLabel.node;
    }

    /** 攻击动画播完回调 */
    playAttack(onComplete?: () => void): void {
        this.playAnim('block', false);
        this.onceAnimComplete(onComplete);
    }

    /** 死亡动画播完回调（播一次停在最后一帧） */
    playDie(onComplete?: () => void): void {
        this.playAnim('die', false);
        this.onceAnimComplete(onComplete);
    }

    private onceAnimComplete(cb?: () => void): void {
        if (!cb) return;
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

    onDestroy(): void {
        if (this.grid) this.grid.removeMonster(this);
    }
}
