import { Node, sp } from 'cc';
import { Monster } from './Monster';
import { MonsterGlowController } from './MonsterGlowController';
import { MonsterGuideConfig } from './config/MonsterGuideConfig';

export class MonsterGuideController {
    private guideNode: Node | null = null;
    private active = false;
    private dismissed = false;
    private pendingMonster: Monster | null = null;

    constructor(private readonly glow: MonsterGlowController) {}

    init(uiLayer: Node | null): void {
        this.active = false;
        this.dismissed = false;
        this.guideNode = uiLayer ? uiLayer.getChildByName('yindao') : null;
        this.hideNode();
    }

    isTarget(monsterName: string): boolean {
        return monsterName === MonsterGuideConfig.targetMonsterName;
    }

    requestStart(monster: Monster, openingActive: boolean): void {
        if (openingActive) {
            this.pendingMonster = monster;
            return;
        }
        this.start(monster);
    }

    flushPending(): void {
        const monster = this.pendingMonster;
        this.pendingMonster = null;
        if (monster && monster.node && monster.node.isValid) {
            this.start(monster);
        }
    }

    dismiss(): boolean {
        if (this.dismissed && !this.active) return false;
        const wasActive = this.active;
        this.dismissed = true;
        this.active = false;
        this.hideNode();
        if (wasActive) this.glow.hide();
        return wasActive;
    }

    destroy(): void {
        this.pendingMonster = null;
        this.hideNode();
    }

    private start(monster: Monster): void {
        if (this.dismissed || this.active) return;
        this.active = true;
        const guideNode = this.guideNode;
        if (guideNode && guideNode.isValid) {
            guideNode.active = true;
            const skeleton = guideNode.getComponent(sp.Skeleton)
                || guideNode.getComponentInChildren(sp.Skeleton);
            if (skeleton) skeleton.setAnimation(0, MonsterGuideConfig.animationName, true);
        }
        this.glow.show(monster);
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
