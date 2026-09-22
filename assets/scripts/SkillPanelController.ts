import { Button, director, Director, Node, RichText, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { SkillName } from './config/SkillConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';

/** 加载并复用 result/SkillPanel，统一处理首次解锁和后续升级选择。 */
export class SkillPanelController {
    private panelNode: Node | null = null;
    private loading = false;
    private selecting = false;
    private opacity: UIOpacity | null = null;
    private opacityTween: Tween<UIOpacity> | null = null;
    private selectedSkill: SkillName | null = null;
    private upgradePowerGain: number | null = null;
    private pauseGameplayWhileVisible = false;
    private readonly fadeDuration = 0.2;

    constructor(
        private readonly uiLayer: Node | null,
        private readonly getTargetWorldPosition: () => Readonly<Vec3> | null,
        private readonly onSelect: (skill: SkillName) => void,
        private readonly onUpgrade: (skill: SkillName, powerGain: number) => void,
        private readonly onVisibilityChanged: (visible: boolean, pauseGameplay: boolean) => void,
    ) {}

    async show(): Promise<void> {
        if (!this.uiLayer || this.loading || this.panelNode?.active) return;
        this.loading = true;
        this.selecting = false;
        this.pauseGameplayWhileVisible = this.upgradePowerGain !== null;
        this.onVisibilityChanged(true, this.pauseGameplayWhileVisible);
        try {
            if (!this.panelNode?.isValid) {
                const panel = await PrefabManager.createSkillPanel();
                panel.name = 'SkillPanel';
                this.uiLayer.addChild(panel);
                this.bindButtons(panel);
                this.panelNode = panel;
            }
            this.applySelectionLayout();
            this.applyPanelText();
            this.opacityTween?.stop();
            this.opacity = this.panelNode.getComponent(UIOpacity)
                || this.panelNode.addComponent(UIOpacity);
            this.opacity.opacity = 0;
            this.panelNode.active = true;
            // 缓存面板再次打开时必须先激活根节点，再刷新到角色当前世界位置。
            const targetPosition = this.getTargetWorldPosition();
            if (targetPosition) this.panelNode.setWorldPosition(targetPosition);
            // cc.Mask 在缓存节点重新定位后可能沿用旧的模板区域。
            // 先关闭并等待一帧，让父子世界矩阵完成更新，再重新打开并直接显示。
            const mask = this.panelNode.getChildByName('mask');
            const refreshMask = !!mask?.active;
            if (refreshMask && mask) mask.active = false;
            this.panelNode.setSiblingIndex(this.uiLayer.children.length - 1);
            await this.waitForNextFrame();
            if (!this.panelNode?.isValid || !this.opacity?.isValid) return;
            // 经验吸收触发面板时角色可能仍在完成本帧移动；显示前用暂停后的最终位置校正一次。
            const finalTargetPosition = this.getTargetWorldPosition();
            if (finalTargetPosition) this.panelNode.setWorldPosition(finalTargetPosition);
            if (refreshMask && mask?.isValid) mask.active = true;
            this.opacity.opacity = 255;
        } catch (err) {
            console.error('[SkillPanelController] load SkillPanel prefab failed', err);
            this.onVisibilityChanged(false, this.pauseGameplayWhileVisible);
            this.pauseGameplayWhileVisible = false;
        } finally {
            this.loading = false;
        }
    }

    private waitForNextFrame(): Promise<void> {
        return new Promise(resolve => {
            director.once(Director.EVENT_AFTER_DRAW, () => resolve());
        });
    }

    async showUpgrade(skill: SkillName, powerGain: number): Promise<void> {
        this.selectedSkill = skill;
        this.upgradePowerGain = Math.max(0, Math.round(powerGain));
        await this.show();
    }

    hide(onHidden?: () => void): void {
        this.selecting = false;
        const panel = this.panelNode;
        if (!panel?.isValid || !panel.active) {
            this.onVisibilityChanged(false, this.pauseGameplayWhileVisible);
            this.pauseGameplayWhileVisible = false;
            onHidden?.();
            return;
        }
        this.opacityTween?.stop();
        this.opacity = panel.getComponent(UIOpacity) || panel.addComponent(UIOpacity);
        this.opacityTween = tween(this.opacity)
            .to(this.fadeDuration, { opacity: 0 })
            .call(() => {
                this.opacityTween = null;
                if (panel.isValid) panel.active = false;
                this.onVisibilityChanged(false, this.pauseGameplayWhileVisible);
                this.pauseGameplayWhileVisible = false;
                onHidden?.();
            })
            .start();
    }

    isVisible(): boolean {
        return this.loading || !!this.panelNode?.activeInHierarchy;
    }

    destroy(): void {
        this.opacityTween?.stop();
        this.opacityTween = null;
        this.opacity = null;
        if (this.panelNode?.isValid) this.panelNode.destroy();
        this.panelNode = null;
        this.loading = false;
        this.selecting = false;
        this.onVisibilityChanged(false, this.pauseGameplayWhileVisible);
        this.pauseGameplayWhileVisible = false;
    }

    private bindButtons(root: Node): void {
        const fireDaoButton = this.findNodeDeep(root, 'panel')?.getComponent(Button);
        const needleButton = this.findNodeDeep(root, 'panel2')?.getComponent(Button);
        if (!fireDaoButton) console.warn('[SkillPanelController] SkillPanel/panel Button is missing');
        else fireDaoButton.node.on(Button.EventType.CLICK, () => this.select('fireDao'));
        if (!needleButton) console.warn('[SkillPanelController] SkillPanel/panel2 Button is missing');
        else needleButton.node.on(Button.EventType.CLICK, () => this.select('needle'));
    }

    private select(skill: SkillName): void {
        if (this.selecting || !this.isVisible()) return;
        this.selecting = true;
        this.selectedSkill = skill;
        const powerGain = this.upgradePowerGain;
        this.upgradePowerGain = null;
        if (powerGain !== null) {
            this.hide(() => this.onUpgrade(skill, powerGain));
            return;
        }
        AudioManager.playSkillSelect();
        this.hideImmediately(() => this.onSelect(skill));
    }

    /** 首次技能选择直接隐藏，不播放 opacity 淡出。 */
    private hideImmediately(onHidden?: () => void): void {
        this.selecting = false;
        this.opacityTween?.stop();
        this.opacityTween = null;
        const panel = this.panelNode;
        if (panel?.isValid) panel.active = false;
        this.onVisibilityChanged(false, this.pauseGameplayWhileVisible);
        this.pauseGameplayWhileVisible = false;
        onHidden?.();
    }

    private applyPanelText(): void {
        const root = this.panelNode;
        if (!root?.isValid) return;
        const fireDaoText = this.findNodeDeep(this.findNodeDeep(root, 'panel'), 'RichText')
            ?.getComponent(RichText);
        const needleText = this.findNodeDeep(this.findNodeDeep(root, 'panel2'), 'RichText')
            ?.getComponent(RichText);
        if (this.upgradePowerGain !== null) {
            const text = `<color=#8B4513>数量+1，伤害增加${this.upgradePowerGain}</color>`;
            if (this.selectedSkill === 'fireDao' && fireDaoText) fireDaoText.string = text;
            if (this.selectedSkill === 'needle' && needleText) needleText.string = text;
            return;
        }
        if (fireDaoText) fireDaoText.string = '<color=#8B4513>将内力凝为刀气，远距他人</color>';
        if (needleText) needleText.string = '<color=#8B4513>将内力化作剑影，环身攻击</color>';
    }

    /** 首次显示两个选项；选定后的后续升级只显示已选技能并居中。 */
    private applySelectionLayout(): void {
        const root = this.panelNode;
        if (!root?.isValid) return;
        const fireDaoPanel = this.findNodeDeep(root, 'panel');
        const needlePanel = this.findNodeDeep(root, 'panel2');
        if (!this.selectedSkill) {
            if (fireDaoPanel) fireDaoPanel.active = true;
            if (needlePanel) needlePanel.active = true;
            return;
        }

        const showFireDao = this.selectedSkill === 'fireDao';
        if (fireDaoPanel) {
            fireDaoPanel.active = showFireDao;
            if (showFireDao) {
                fireDaoPanel.setPosition(0, fireDaoPanel.position.y, fireDaoPanel.position.z);
            }
        }
        if (needlePanel) {
            needlePanel.active = !showFireDao;
            if (!showFireDao) {
                needlePanel.setPosition(0, needlePanel.position.y, needlePanel.position.z);
            }
        }
    }

    private findNodeDeep(root: Node | null, name: string): Node | null {
        if (!root) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeDeep(child, name);
            if (found) return found;
        }
        return null;
    }
}
