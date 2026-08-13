import { _decorator, Component, Vec2, Vec3, UITransform, Graphics, Color, Enum } from 'cc';
import { Grid } from './Grid';

const { ccclass, property } = _decorator;

/** Cocos 序列化要求枚举用 Enum() 创建，不能用 TS 原生 enum */
export const RegionType = Enum({
    Rect: 0,
    Polygon: 1,
});

/** 区域用途：墙（挡路）/ 平台（高度可走）/ 台阶（连接上下层） */
export const RegionMode = Enum({
    Wall: 0,
    Platform: 1,
    Stair: 2,
});

/**
 * 墙体区域：在场景里画一块区域（矩形或多边形），
 * 启动时把所有覆盖到的格子烘焙成墙（格子中心落在区域内 = 墙）。
 * - 矩形模式：直接用本节点 UITransform 的大小
 * - 多边形模式：顶点数组（相对本节点的本地坐标）
 * - 用途：Wall 挡路；Platform 标记 height 层可走区域；Stair 为连接上下层的台阶
 * - debugDraw：运行时画半透明形状，方便在编辑器里对位置
 */
@ccclass('WallRegion')
export class WallRegion extends Component {
    @property({ type: RegionType })
    regionType = RegionType.Polygon;

    @property([Vec2])
    polygon: Vec2[] = [];

    @property({ type: RegionMode })
    mode = RegionMode.Wall;

    /** 平台 / 台阶所在层：0 = 地面层，1 = 一层 */
    @property
    height = 0;

    /** 调试着色（代码控制，不显示在面板） */
    debugDraw =false;

    @property
    debugColor: Color = new Color(255, 90, 90, 110);

    /** 把本区域覆盖的所有格子烘焙成墙，返回烘焙的格子数 */
    bake(grid: Grid): number {
        const cells = this.collectCells(grid);
        if (this.mode === RegionMode.Wall) {
            for (const cell of cells) grid.setWall(cell.x, cell.y, true);
        } else if (this.mode === RegionMode.Platform) {
            // 平台：可走的 elevated 区域（不清理已有墙）
            for (const cell of cells) grid.setHeight(cell.x, cell.y, this.height);
        } else if (this.mode === RegionMode.Stair) {
            // 台阶：可通行，作为 0 层与 height 层之间的过渡
            for (const cell of cells) {
                grid.setStair(cell.x, cell.y, true);
                grid.setHeight(cell.x, cell.y, this.height);
            }
        }
        if (this.debugDraw) this.drawDebug();
        return cells.length;
    }

    /** 地图坐标的点是否落在区域内 */
    containsWorldPoint(x: number, y: number, grid: Grid): boolean {
        const gridUt = grid.node.getComponent(UITransform);
        const regionUt = this.getComponent(UITransform);
        if (!gridUt || !regionUt) return false;
        // 地图坐标 -> 世界坐标 -> 墙体区域本地坐标
        // （自动处理墙体节点的旋转 / 缩放，烘焙结果和编辑器里看到的一致）
        const world = gridUt.convertToWorldSpaceAR(new Vec3(x, y, 0));
        const local = regionUt.convertToNodeSpaceAR(world);
        if (this.regionType === RegionType.Rect) {
            const hw = regionUt.width / 2;
            const hh = regionUt.height / 2;
            return local.x >= -hw && local.x <= hw
                && local.y >= -hh && local.y <= hh;
        }
        if (this.polygon.length < 3) return false;
        return pointInPolygon(new Vec2(local.x, local.y), this.polygon);
    }

    private collectCells(grid: Grid): Vec2[] {
        const out: Vec2[] = [];
        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                const p = grid.gridToWorld(c, r);
                if (this.containsWorldPoint(p.x, p.y, grid)) {
                    out.push(new Vec2(c, r));
                }
            }
        }
        return out;
    }

    private drawDebug(): void {
        if (!this.getComponent(UITransform)) this.addComponent(UITransform);
        let g = this.getComponent(Graphics);
        if (!g) g = this.addComponent(Graphics);
        g.clear();
        const fill = this.mode === RegionMode.Platform
            ? new Color(90, 140, 255, 110)
            : (this.mode === RegionMode.Stair ? new Color(255, 210, 60, 110) : this.debugColor);
        g.fillColor = fill;
        g.strokeColor = new Color(fill.r, fill.g, fill.b, 255);
        g.lineWidth = 2;
        if (this.regionType === RegionType.Rect) {
            const ut = this.getComponent(UITransform);
            const w = ut ? ut.width : 100;
            const h = ut ? ut.height : 100;
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
            g.stroke();
        } else if (this.polygon.length >= 3) {
            g.moveTo(this.polygon[0].x, this.polygon[0].y);
            for (let i = 1; i < this.polygon.length; i++) {
                g.lineTo(this.polygon[i].x, this.polygon[i].y);
            }
            g.close();
            g.fill();
            g.stroke();
        }
    }
}

/** 射线法：点是否在多边形内 */
function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y))
            && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
