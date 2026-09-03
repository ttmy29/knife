import { Component, Node, UITransform, Vec3 } from 'cc';
import { Monster } from './Monster';

export class MonsterGlowController {
    private glowHolder: Node | null = null;
    private glowingMonster: Monster | null = null;
    private hideGlowTask: (() => void) | null = null;

    constructor(
        private readonly owner: Component,
        private readonly gameWorld: Node,
    ) {}

    init(): void {
        const canvas = this.gameWorld.parent;
        this.glowHolder = this.gameWorld.getChildByName('GlowHolder')
            || (canvas ? canvas.getChildByName('GlowHolder') : null);
        if (!this.glowHolder) return;

        if (canvas && this.glowHolder.parent !== canvas) {
            const worldIndex = this.gameWorld.getSiblingIndex();
            this.glowHolder.setParent(canvas);
            this.glowHolder.setScale(1, 1, 1);
            this.glowHolder.setSiblingIndex(worldIndex + 1);
        }

        const snapshot = this.glowHolder.getComponent('Snapshot') as any;
        if (snapshot) {
            snapshot.snapshotLayer = 27;
            snapshot.target = null;
        }
        for (const child of this.glowHolder.children) {
            if (child.name !== 'Camera') child.active = false;
        }
        this.glowHolder.active = false;
    }

    get currentMonster(): Monster | null {
        return this.glowingMonster;
    }

    show(monster: Monster): void {
        if (!this.glowHolder || !monster.node || !monster.node.isValid) return;
        this.hide();
        const spineNode = monster.getSpineNode();
        if (!spineNode) return;
        const snapshot = this.glowHolder.getComponent('Snapshot') as any;
        if (!snapshot || !this.syncBounds(spineNode, snapshot)) return;

        this.glowingMonster = monster;
        snapshot.target = spineNode;
        this.glowHolder.active = true;
    }

    hide(): void {
        if (this.hideGlowTask) {
            this.owner.unschedule(this.hideGlowTask);
            this.hideGlowTask = null;
        }
        if (this.glowHolder) this.glowHolder.active = false;
        const snapshot = this.glowHolder ? this.glowHolder.getComponent('Snapshot') as any : null;
        if (snapshot) snapshot.target = null;
        this.glowingMonster = null;
    }

    hideLater(delay = 0.3): void {
        if (!this.glowingMonster || !this.glowingMonster.node || !this.glowingMonster.node.isValid) return;
        if (this.hideGlowTask) this.owner.unschedule(this.hideGlowTask);
        this.hideGlowTask = () => this.hide();
        this.owner.scheduleOnce(this.hideGlowTask, delay);
    }

    destroy(): void {
        this.hide();
    }

    /** 共用一张紧贴目标 Spine 的正方形 RenderTexture，避免固定大画布。 */
    private syncBounds(spineNode: Node, snapshot: any): boolean {
        if (!this.glowHolder || !this.glowHolder.parent) return false;
        const overlayTransform = this.glowHolder.parent.getComponent(UITransform);
        const glowTransform = this.glowHolder.getComponent(UITransform);
        if (!overlayTransform || !glowTransform) return false;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const localPoint = new Vec3();

        const collect = (node: Node) => {
            const ui = node.getComponent(UITransform);
            if (ui) {
                const left = -ui.anchorX * ui.width;
                const right = (1 - ui.anchorX) * ui.width;
                const bottom = -ui.anchorY * ui.height;
                const top = (1 - ui.anchorY) * ui.height;
                const corners = [
                    new Vec3(left, bottom),
                    new Vec3(left, top),
                    new Vec3(right, bottom),
                    new Vec3(right, top),
                ];
                for (const corner of corners) {
                    overlayTransform.convertToNodeSpaceAR(ui.convertToWorldSpaceAR(corner), localPoint);
                    minX = Math.min(minX, localPoint.x);
                    minY = Math.min(minY, localPoint.y);
                    maxX = Math.max(maxX, localPoint.x);
                    maxY = Math.max(maxY, localPoint.y);
                }
            }
            for (const child of node.children) collect(child);
        };
        collect(spineNode);

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return false;
        const glowRim = this.glowHolder.getComponent('GlowRim') as any;
        const outerWidth = glowRim ? Math.max(0, Number(glowRim.outerWidth ?? glowRim._outerWidth) || 0) : 0;
        const padding = Math.max(100, outerWidth * 4);
        const side = Math.max(1, maxX - minX, maxY - minY) + padding;
        this.glowHolder.setPosition((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
        glowTransform.setAnchorPoint(0.5, 0.5);
        glowTransform.setContentSize(side, side);
        if (snapshot.updateSize) snapshot.updateSize();
        return true;
    }
}
