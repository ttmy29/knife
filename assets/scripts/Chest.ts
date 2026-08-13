import { _decorator, Component, Label, Vec2, UITransform } from 'cc';
import { Grid } from './Grid';

const { ccclass, property } = _decorator;

/**
 * 宝箱：放在 GameWorld/BoxLayer 下。
 * 角色碰到（走进拾取范围）停下播攻击动画，攻击播完开箱：+战力、宝箱消失、角色切换 role1。
 * 拾取范围按节点 UITransform x 缩放计算；战力读子节点 Label 文本（不限战力都能拾取）。
 */
@ccclass('Chest')
export class Chest extends Component {
    /** 拾取范围 = 节点大小 x 该系数 */
    @property
    public footprintScale = 0.8;

    /** 开箱获得的战力（从子 Label 读取） */
    public power = 0;

    /** 占据的格子（拾取触发范围） */
    public cells: Vec2[] = [];

    private grid: Grid | null = null;

    init(grid: Grid): void {
        this.grid = grid;
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            const parsed = parseInt(label.string, 10);
            if (!isNaN(parsed) && parsed > 0) this.power = parsed;
        }
        this.computeCells();
        grid.addChest(this);
    }

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

    onDestroy(): void {
        if (this.grid) this.grid.removeChest(this);
    }
}
