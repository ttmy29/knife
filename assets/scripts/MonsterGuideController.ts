import { instantiate, Node, sp } from 'cc';
import { MonsterGuideConfig } from './config/MonsterGuideConfig';

export class MonsterGuideController {
    private readonly guideNodes = new Map<string, Node>();
    private readonly activeTargets = new Set<string>();
    private dismissed = false;
    private readonly pendingTargets = new Map<string, Node>();

    constructor() {}

    init(uiLayer: Node | null): void {
        this.activeTargets.clear();
        this.pendingTargets.clear();
        this.guideNodes.clear();
        this.dismissed = false;
        const primary = uiLayer ? uiLayer.getChildByName('yindao') : null;
        if (!primary || !uiLayer) return;

        const [firstTarget, ...otherTargets] = MonsterGuideConfig.targetNodeNames;
        if (firstTarget) this.guideNodes.set(firstTarget, primary);
        for (const targetName of otherTargets) {
            let guide = uiLayer.getChildByName(`yindao_${targetName}`);
            if (!guide) {
                guide = instantiate(primary);
                guide.name = `yindao_${targetName}`;
                uiLayer.addChild(guide);
            }
            this.guideNodes.set(targetName, guide);
        }
        this.hideAllNodes();
    }

    requestStartForNode(node: Node, openingActive: boolean): void {
        if (openingActive) {
            this.pendingTargets.set(node.name, node);
            return;
        }
        this.start(node);
    }

    flushPending(): void {
        const targets = Array.from(this.pendingTargets.values());
        this.pendingTargets.clear();
        for (const target of targets) {
            if (target && target.isValid) this.start(target);
        }
    }

    dismiss(): boolean {
        if (this.dismissed && this.activeTargets.size === 0) return false;
        const wasActive = this.activeTargets.size > 0;
        this.dismissed = true;
        this.activeTargets.clear();
        this.hideAllNodes();
        return wasActive;
    }

    destroy(): void {
        this.pendingTargets.clear();
        this.activeTargets.clear();
        this.hideAllNodes();
        this.guideNodes.clear();
    }

    private start(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.dismissed || this.activeTargets.has(node.name)) return;
        const guideNode = this.guideNodes.get(node.name);
        if (guideNode && guideNode.isValid) {
            this.activeTargets.add(node.name);
            guideNode.setWorldPosition(node.worldPosition);
            guideNode.active = true;
            const skeleton = guideNode.getComponent(sp.Skeleton)
                || guideNode.getComponentInChildren(sp.Skeleton);
            if (skeleton) skeleton.setAnimation(0, MonsterGuideConfig.animationName, true);
        }
    }

    private hideNode(guideNode: Node): void {
        if (!guideNode || !guideNode.isValid) return;
        const skeleton = guideNode.getComponent(sp.Skeleton)
            || guideNode.getComponentInChildren(sp.Skeleton);
        if (skeleton) skeleton.clearTracks();
        guideNode.active = false;
    }

    private hideAllNodes(): void {
        for (const guideNode of this.guideNodes.values()) this.hideNode(guideNode);
    }
}
