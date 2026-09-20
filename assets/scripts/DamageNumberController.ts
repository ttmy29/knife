import { Label, Node, tween, Tween, Vec3 } from 'cc';
import { Monster } from './Monster';
import { PrefabManager } from './core/PrefabManager';

/** 在怪物受击点显示伤害数字，并让每次伤害随机向四周飘动。 */
export class DamageNumberController {
    private readonly activeNodes = new Set<Node>();
    private readonly duration = 0.6;
    private readonly minDistance = 55;
    private readonly maxDistance = 90;

    constructor(private readonly tempLayer: Node) {}

    show(monster: Monster, damage: number): void {
        if (!monster.node?.isValid || !this.tempLayer?.isValid) return;
        const value = Math.max(0, Math.round(damage));
        if (value <= 0) return;

        let node: Node;
        try {
            node = PrefabManager.createHp();
        } catch (err) {
            console.error('[DamageNumberController] create Hp failed', err);
            return;
        }

        const label = node.getComponent(Label) || node.getComponentInChildren(Label);
        if (label) label.string = `-${value}`;

        const dot = monster.node.getChildByName('dot');
        const worldPosition = (dot?.isValid ? dot.worldPosition : monster.node.worldPosition).clone();
        node.active = false;
        this.tempLayer.addChild(node);
        node.setWorldPosition(worldPosition);
        node.active = true;
        node.setSiblingIndex(this.tempLayer.children.length - 1);
        this.activeNodes.add(node);

        const angle = Math.random() * Math.PI * 2;
        const distance = this.minDistance + Math.random() * (this.maxDistance - this.minDistance);
        const offset = new Vec3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0);
        const cleanup = () => this.removeNode(node);

        tween(node)
            .by(this.duration, { position: offset }, { easing: 'quadOut' })
            .call(cleanup)
            .start();
    }

    destroy(): void {
        for (const node of [...this.activeNodes]) {
            this.removeNode(node);
        }
    }

    private removeNode(node: Node): void {
        this.activeNodes.delete(node);
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.destroy();
    }

}
