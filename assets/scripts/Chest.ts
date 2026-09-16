import { _decorator, Component, Label, Node, Vec2, Vec3, UITransform } from 'cc';
import { Grid } from './Grid';
import { isSkillName } from './config/SkillConfig';

const { ccclass, property } = _decorator;

/**
 * 宝箱：放在 GameWorld/BoxLayer 下。
 * 角色碰到（走进拾取范围）后直接开箱：+战力、宝箱消失，并执行对应换装或角色切换。
 * 拾取范围优先按 icon 图片节点的 UITransform x 缩放计算；战力读子节点 Label 文本（不限战力都能拾取）。
 */
@ccclass('Chest')
export class Chest extends Component {
    private static readonly equipmentNames = new Set(['dao', 'dachui', 'kuijia', 'toukui', 'mount']);

    /** 拾取范围 = 节点大小 x 该系数 */
    @property
    public footprintScale = 0.8;

    /** 开箱获得的战力（从子 Label 读取） */
    public power = 0;

    /** 占据的格子（拾取触发范围） */
    public cells: Vec2[] = [];

    private grid: Grid | null = null;
    private powerLabel: Label | null = null;
    private externalColorNode: Node | null = null;
    private externalLabelNode: Node | null = null;

    init(grid: Grid): void {
        this.grid = grid;
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            this.powerLabel = label;
            const parsed = parseInt(label.string, 10);
            if (!isNaN(parsed) && parsed > 0) this.power = parsed;
        }
        this.computeCells();
        grid.addChest(this);
    }

    /** 将战力底图和数字移入连续渲染层，宝箱根节点只保留本体。 */
    movePresentationToLayers(colorLayer: Node, labelLayer: Node): boolean {
        const colorNode = this.node.getChildByName('bule');
        const labelNode = this.powerLabel ? this.powerLabel.node : null;
        if (!colorNode || !colorNode.isValid || !labelNode || !labelNode.isValid) return false;

        colorNode.name = `${this.node.name}Color`;
        labelNode.name = `${this.node.name}Label`;
        colorNode.setParent(colorLayer, true);
        labelNode.setParent(labelLayer, true);
        this.externalColorNode = colorNode;
        this.externalLabelNode = labelNode;
        return true;
    }

    setPresentationActive(active: boolean): void {
        if (this.externalColorNode && this.externalColorNode.isValid) {
            this.externalColorNode.active = active;
        }
        if (this.externalLabelNode && this.externalLabelNode.isValid) {
            this.externalLabelNode.active = active;
        }
    }

    isEquipment(): boolean {
        return Chest.equipmentNames.has(this.node.name);
    }

    isSkillUnlock(): boolean {
        return isSkillName(this.node.name);
    }

    private computeCells(): void {
        this.cells = [];
        if (!this.grid) return;
        const bounds = this.getCollisionBounds();
        const w = bounds.width * this.footprintScale;
        const h = bounds.height * this.footprintScale;
        const pos = bounds.center;
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

    private getCollisionBounds(): { center: Vec3; width: number; height: number } {
        const target = Chest.equipmentNames.has(this.node.name)
            ? this.node
            : this.node.getChildByName('icon') || this.node;
        const targetUI = target.getComponent(UITransform);
        const gridUI = this.grid ? this.grid.node.getComponent(UITransform) : null;
        if (!targetUI || !gridUI) {
            const rootUI = this.node.getComponent(UITransform);
            return {
                center: this.node.position,
                width: rootUI ? rootUI.width * Math.abs(this.node.scale.x) : this.grid!.tileSize,
                height: rootUI ? rootUI.height * Math.abs(this.node.scale.y) : this.grid!.tileSize,
            };
        }

        const left = -targetUI.anchorX * targetUI.width;
        const right = (1 - targetUI.anchorX) * targetUI.width;
        const bottom = -targetUI.anchorY * targetUI.height;
        const top = (1 - targetUI.anchorY) * targetUI.height;
        const corners = [
            new Vec3(left, bottom, 0),
            new Vec3(left, top, 0),
            new Vec3(right, bottom, 0),
            new Vec3(right, top, 0),
        ];

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const local = new Vec3();
        for (const corner of corners) {
            gridUI.convertToNodeSpaceAR(targetUI.convertToWorldSpaceAR(corner), local);
            minX = Math.min(minX, local.x);
            minY = Math.min(minY, local.y);
            maxX = Math.max(maxX, local.x);
            maxY = Math.max(maxY, local.y);
        }

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
            return {
                center: this.node.position,
                width: this.grid!.tileSize,
                height: this.grid!.tileSize,
            };
        }

        return {
            center: new Vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0),
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
        };
    }

    onDestroy(): void {
        if (this.grid) this.grid.removeChest(this);
        if (this.externalColorNode && this.externalColorNode.isValid) this.externalColorNode.destroy();
        if (this.externalLabelNode && this.externalLabelNode.isValid) this.externalLabelNode.destroy();
    }
}
