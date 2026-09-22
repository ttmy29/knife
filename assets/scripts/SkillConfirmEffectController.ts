import { Node, tween, Tween, Vec3 } from 'cc';
import { SkillName } from './config/SkillConfig';
import { PrefabManager } from './core/PrefabManager';

interface ConfirmTweenProgress {
    value: number;
}

/** 技能选择后，让对应图标从角色上方飞入角色并缩小消失。 */
export class SkillConfirmEffectController {
    private readonly activeTweens = new Map<Node, Tween<ConfirmTweenProgress>>();

    constructor(
        private readonly uiLayer: Node,
        private readonly getPlayerWorldPosition: () => Readonly<Vec3> | null,
    ) {}

    isPlaying(): boolean {
        return this.activeTweens.size > 0;
    }

    play(skill: SkillName, onComplete?: () => void): void {
        if (skill !== 'fireDao' && skill !== 'needle') {
            onComplete?.();
            return;
        }
        const target = this.getPlayerWorldPosition();
        if (!target) {
            onComplete?.();
            return;
        }

        let node: Node;
        try {
            node = PrefabManager.createConfirm();
        } catch (err) {
            console.error('[SkillConfirmEffectController] create confiem failed', err);
            onComplete?.();
            return;
        }
        this.uiLayer.addChild(node);
        const fireDao = node.getChildByName('fireDao');
        const needle = node.getChildByName('needle');
        if (fireDao) fireDao.active = skill === 'fireDao';
        if (needle) needle.active = skill === 'needle';
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setScale(1, 1, 1);

        const start = new Vec3(target.x, target.y + 250, target.z);
        node.setWorldPosition(start);
        const progress: ConfirmTweenProgress = { value: 0 };
        const effectTween = tween(progress)
            .to(0.75, { value: 1 }, {
                easing: 'quadIn',
                onUpdate: () => {
                    if (!node.isValid) return;
                    const currentTarget = this.getPlayerWorldPosition() || target;
                    const value = Math.max(0, Math.min(1, progress.value));
                    node.setWorldPosition(
                        start.x + (currentTarget.x - start.x) * value,
                        start.y + (currentTarget.y - start.y) * value,
                        start.z + (currentTarget.z - start.z) * value,
                    );
                    const scale = 1 - value;
                    node.setScale(scale, scale, scale);
                },
            })
            .call(() => {
                this.activeTweens.delete(node);
                if (node.isValid) node.destroy();
                onComplete?.();
            });
        this.activeTweens.set(node, effectTween);
        effectTween.start();
    }

    destroy(): void {
        for (const [node, effectTween] of this.activeTweens) {
            effectTween.stop();
            if (node.isValid) node.destroy();
        }
        this.activeTweens.clear();
    }
}
