import { Node, sp } from 'cc';
import { MonsterGuideConfig } from './config/MonsterGuideConfig';

export class MonsterGuideController {
    private guideNode: Node | null = null;
    private active = false;
    private dismissed = false;
    private pendingTarget: Node | null = null;

    constructor() {}

    init(uiLayer: Node | null): void {
        this.active = false;
        this.dismissed = false;
        this.guideNode = uiLayer ? uiLayer.getChildByName('yindao') : null;
        this.hideNode();
    }

    requestStartForNode(node: Node, openingActive: boolean): void {
        if (openingActive) {
            this.pendingTarget = node;
            return;
        }
        this.start(node);
    }

    flushPending(): void {
        const target = this.pendingTarget;
        this.pendingTarget = null;
        if (target && target.isValid) {
            this.start(target);
        }
    }

    dismiss(): boolean {
        if (this.dismissed && !this.active) return false;
        const wasActive = this.active;
        this.dismissed = true;
        this.active = false;
        this.hideNode();
        return wasActive;
    }

    destroy(): void {
        this.pendingTarget = null;
        this.hideNode();
    }

    private start(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.dismissed || this.active) return;
        this.active = true;
        const guideNode = this.guideNode;
        if (guideNode && guideNode.isValid) {
            guideNode.active = true;
            const skeleton = guideNode.getComponent(sp.Skeleton)
                || guideNode.getComponentInChildren(sp.Skeleton);
            if (skeleton) skeleton.setAnimation(0, MonsterGuideConfig.animationName, true);
        }
    }

    private hideNode(): void {
        const guideNode = this.guideNode;
        if (!guideNode || !guideNode.isValid) return;
        const skeleton = guideNode.getComponent(sp.Skeleton)
            || guideNode.getComponentInChildren(sp.Skeleton);
        if (skeleton) skeleton.clearTracks();
        guideNode.active = false;
    }
}
