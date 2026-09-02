import { _decorator, Component, Label, Node, Vec2, UITransform, UIOpacity, sp, tween } from 'cc';
import { Grid } from './Grid';

const { ccclass, property } = _decorator;

/** 怪物：占格 + 数值；由 GameManager 对场景里摆放好的怪物节点 init */
@ccclass('Monster')
export class Monster extends Component {
    @property
    public power = 0;

    /** 战斗触发范围 = 怪物视觉大小 x 该系数（1=整个盒子，0.6=更贴近身体） */
    @property
    public footprintScale = 1.2;

    /** 角色中心进入该脚下半径时开始战斗，可按怪物体型在预制体中单独调整。 */
    @property
    public battleRadius = 60;

    /** 战斗点相对水平线允许的最大夹角；30 更平，45 更宽松。 */
    @property({ min: 0, max: 89, step: 1 })
    public battleAngleLimit = 15;

    public gridCol = 0;
    public gridRow = 0;
    /** 怪物按实际视觉大小占据的所有格子（战斗触发范围） */
    public cells: Vec2[] = [];

    private grid: Grid | null = null;
    private powerLabel: Label | null = null;
    private labelRoot: Node | null = null;
    private externalColorNode: Node | null = null;
    private externalLabelNode: Node | null = null;
    private baseScaleX = 1;
    private baseScaleY = 1;
    private baseScaleZ = 1;
    private labelRootBaseScaleX = 1;
    private labelRootBaseScaleY = 1;
    private labelRootBaseScaleZ = 1;
    private labelBaseScaleX = 1;
    private labelBaseScaleY = 1;
    private labelBaseScaleZ = 1;
    /** 怪物资源默认 scale.x > 0 时朝左，-1 时朝右。 */
    private facing = 1;
    private skeletons: sp.Skeleton[] = [];
    private animName = 'idle';
    private attackAnimation = 'phyattack';
    private registeredOnGrid = false;
    private presentationActive = true;
    private viewportVisible = true;

    /** 位置取节点实际坐标（吸附到最近格子），数值取子 Label 文本 */
    init(grid: Grid, registerOnGrid = true): void {
        this.grid = grid;
        const cell = grid.worldToGrid(this.node.position);
        if (cell) {
            this.gridCol = cell.x;
            this.gridRow = cell.y;
            this.node.setPosition(grid.gridToWorld(cell.x, cell.y));
        }
        this.computeCells();
        this.baseScaleX = Math.abs(this.node.scale.x);
        this.baseScaleY = this.node.scale.y;
        this.baseScaleZ = this.node.scale.z;
        this.facing = this.node.scale.x < 0 ? -1 : 1;
        this.labelRoot = this.node.getChildByName('Node');
        if (this.labelRoot) {
            this.labelRootBaseScaleX = Math.abs(this.labelRoot.scale.x);
            this.labelRootBaseScaleY = this.labelRoot.scale.y;
            this.labelRootBaseScaleZ = this.labelRoot.scale.z;
        }
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            this.powerLabel = label;
            this.labelBaseScaleX = Math.abs(label.node.scale.x);
            this.labelBaseScaleY = label.node.scale.y;
            this.labelBaseScaleZ = label.node.scale.z;
            const parsed = parseInt(label.string, 10);
            if (!isNaN(parsed)) {
                this.power = parsed;
                label.string = String(this.power);
            } else if (this.power > 0) {
                label.string = String(this.power);
            }
        }
        this.applyFacing();
        // 怪物骨架（可能在根节点，也可能在子节点）全部拿下来，初始播 idle
        this.skeletons = this.node.getComponentsInChildren(sp.Skeleton);
        this.playIdle();
        if (registerOnGrid) this.activateOnGrid();
    }

    /** 实例创建后立即隐藏根节点，避免初始化过程闪现。 */
    prepareSpawnFade(): void {
        const opacity = this.node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 0;
    }

    /** 身体、拆分后的颜色底图和数字同步淡入。 */
    playSpawnFade(duration: number, onComplete?: () => void): void {
        const opacityTargets: UIOpacity[] = [];
        const rootOpacity = this.node.getComponent(UIOpacity);
        if (rootOpacity) opacityTargets.push(rootOpacity);
        if (this.externalColorNode && this.externalColorNode.isValid) {
            opacityTargets.push(this.externalColorNode.getComponent(UIOpacity)
                || this.externalColorNode.addComponent(UIOpacity));
        }
        if (this.externalLabelNode && this.externalLabelNode.isValid) {
            opacityTargets.push(this.externalLabelNode.getComponent(UIOpacity)
                || this.externalLabelNode.addComponent(UIOpacity));
        }

        this.node.active = true;
        this.setPresentationActive(true);
        for (const opacity of opacityTargets) opacity.opacity = 0;

        const fadeDuration = Math.max(0, duration);
        if (opacityTargets.length === 0 || fadeDuration === 0) {
            for (const opacity of opacityTargets) opacity.opacity = 255;
            if (onComplete) onComplete();
            return;
        }

        let completed = 0;
        const completeOne = () => {
            completed++;
            if (completed === opacityTargets.length && onComplete) onComplete();
        };
        for (const opacity of opacityTargets) {
            tween(opacity).to(fadeDuration, { opacity: 255 }).call(completeOne).start();
        }
    }

    /** 淡入完成后才加入占格和战斗检测。 */
    activateOnGrid(): void {
        if (!this.grid || this.registeredOnGrid) return;
        this.registeredOnGrid = true;
        this.grid.addMonster(this);
    }

    /** 将头顶底图和数字移入全局连续渲染层，怪物根节点只保留 Spine。 */
    movePresentationToLayers(colorLayer: Node, labelLayer: Node): boolean {
        const colorNode = this.labelRoot;
        const labelNode = this.powerLabel ? this.powerLabel.node : null;
        if (!colorNode || !colorNode.isValid || !labelNode || !labelNode.isValid) return false;
        if (!labelNode.isChildOf(colorNode)) return false;

        const inheritedOpacity = this.getPresentationOpacity(labelNode);
        labelNode.name = `${this.node.name}Label`;
        colorNode.name = `${this.node.name}Color`;
        labelNode.setParent(labelLayer, true);
        const labelOpacity = labelNode.getComponent(UIOpacity) || labelNode.addComponent(UIOpacity);
        labelOpacity.opacity = inheritedOpacity;
        colorNode.setParent(colorLayer, true);

        this.externalColorNode = colorNode;
        this.externalLabelNode = labelNode;
        this.labelRoot = null;
        return true;
    }

    private getPresentationOpacity(node: Node): number {
        let opacity = 255;
        let current: Node | null = node;
        const stopParent = this.node.parent;
        while (current && current !== stopParent) {
            const uiOpacity = current.getComponent(UIOpacity);
            if (uiOpacity) opacity = opacity * uiOpacity.opacity / 255;
            current = current.parent;
        }
        return Math.round(opacity);
    }

    setPresentationActive(active: boolean): void {
        this.presentationActive = active;
        this.refreshPresentationActive();
    }

    /** 只关闭展示组件，怪物根节点和网格数据继续参与寻路与战斗。 */
    setViewportVisible(visible: boolean): void {
        if (this.viewportVisible === visible) return;
        this.viewportVisible = visible;
        for (const skeleton of this.skeletons) {
            if (skeleton && skeleton.isValid) skeleton.enabled = visible;
        }
        this.refreshPresentationActive();
    }

    isViewportVisible(): boolean {
        return this.viewportVisible;
    }

    private refreshPresentationActive(): void {
        const active = this.presentationActive && this.viewportVisible;
        if (this.externalColorNode && this.externalColorNode.isValid) this.externalColorNode.active = active;
        if (this.externalLabelNode && this.externalLabelNode.isValid) this.externalLabelNode.active = active;
    }

    /** 根据目标的世界 X 位置调整怪物画面朝向。 */
    faceToWorldX(worldX: number): void {
        const selfWorldX = this.node.worldPosition.x;
        if (worldX < selfWorldX) this.setFacing(1);
        else if (worldX > selfWorldX) this.setFacing(-1);
    }

    private setFacing(dir: number): void {
        const next = dir < 0 ? -1 : 1;
        this.facing = next;
        this.applyFacing();
    }

    private applyFacing(): void {
        this.node.setScale(
            this.baseScaleX * this.facing,
            this.baseScaleY,
            this.baseScaleZ,
        );
        // 怪物根节点翻转身体；头顶数字层反向补偿，文字保持正向。
        if (this.labelRoot && this.labelRoot.isValid) {
            this.labelRoot.setScale(
                this.labelRootBaseScaleX * this.facing,
                this.labelRootBaseScaleY,
                this.labelRootBaseScaleZ,
            );
        }
        if (!this.externalLabelNode && this.powerLabel && this.powerLabel.node.isValid) {
            this.powerLabel.node.setScale(
                this.labelBaseScaleX,
                this.labelBaseScaleY,
                this.labelBaseScaleZ,
            );
        }
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

    setAttackAnimation(name: string): void {
        this.attackAnimation = name || 'phyattack';
    }

    setAnimationTimeScale(scale: number): void {
        const value = Math.max(0, scale);
        for (const skeleton of this.skeletons) {
            if (skeleton && skeleton.isValid) skeleton.timeScale = value;
        }
    }

    /** 播放一次指定动画，完成后恢复 idle。 */
    playOnceThenIdle(name: string, onComplete?: () => void): void {
        this.animName = '';
        this.playAnim(name, false);
        this.onceAnimComplete(() => {
            this.playIdle();
            if (onComplete) onComplete();
        });
    }

    /** 更新头顶数字（战斗中分段跳动用） */
    setLabelText(text: string): void {
        if (this.powerLabel) this.powerLabel.string = text;
    }

    getPowerLabelGlowRoot(): Node | null {
        if (!this.powerLabel || !this.powerLabel.node || !this.powerLabel.node.isValid) return null;
        if (!this.powerLabel.node.isChildOf(this.node)) return null;
        const parent = this.powerLabel.node.parent;
        if (parent && parent !== this.node) return parent;
        return this.powerLabel.node;
    }

    /** 攻击动画播完回调 */
    playAttack(onComplete?: () => void): void {
        this.animName = '';
        this.playAnim(this.attackAnimation, false);
        this.onceAnimComplete(onComplete);
    }

    playAttackLoop(): void {
        this.animName = '';
        this.playAnim(this.attackAnimation, true);
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
        if (this.grid && this.registeredOnGrid) this.grid.removeMonster(this);
        if (this.externalColorNode && this.externalColorNode.isValid) this.externalColorNode.destroy();
        if (this.externalLabelNode && this.externalLabelNode.isValid) this.externalLabelNode.destroy();
    }
}
