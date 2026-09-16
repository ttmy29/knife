import { Node, sp } from 'cc';
import { Chest } from './Chest';
import { Grid } from './Grid';
import { Player } from './Player';
import { ChestPositionConfig, EquipmentName } from './config/ChestPositionConfig';
import { MonsterGuideConfig } from './config/MonsterGuideConfig';
import { PlayerRoleProfiles, PlayerRoleType } from './config/PlayerRoleConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';

type RewardRoleType = 'role1' | 'role2' | 'role3';

interface EquipmentSpawnConfig {
    name: EquipmentName;
    create: () => Promise<Node>;
}

export class ChestController {
    private powerSuitChest: Chest | null = null;
    private colorLayer: Node | null = null;
    private labelLayer: Node | null = null;

    constructor(
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly clearPathLine: () => void,
        private readonly applyImmediateDisplayedPowerGain: (gain: number) => void,
        private readonly switchPlayerRole: (roleType: RewardRoleType) => void,
        private readonly applyPlayerRoleProfile: (player: Player, roleType: PlayerRoleType, playIntro?: boolean) => void,
        private readonly requestGuideStartForNode: (node: Node, openingActive: boolean) => void,
        private readonly isOpeningSequenceActive: () => boolean,
    ) {}

    setupRenderLayers(): void {
        const boxLayer = this.worldNode.getChildByName('boxLayer');
        this.colorLayer = this.worldNode.getChildByName('BoxColor');
        this.labelLayer = this.worldNode.getChildByName('BoxLabel');
        if (!boxLayer || !this.colorLayer || !this.labelLayer) {
            console.warn('[ChestController] boxLayer, BoxColor or BoxLabel layer is missing');
            return;
        }

        // 本体先画，所有底图连续绘制，最后连续绘制数字。
        this.colorLayer.setSiblingIndex(boxLayer.getSiblingIndex() + 1);
        this.labelLayer.setSiblingIndex(this.colorLayer.getSiblingIndex() + 1);
    }

    /** 启动时从 baoxiang bundle 加载初始宝箱。 */
    async spawnInitialChest(): Promise<void> {
        const boxLayer = this.worldNode.getChildByName('boxLayer');
        const grid = this.getGrid();
        if (!boxLayer || !grid) return;

        // 场景中旧的预制体实例仅用于保留编辑器结构，运行时由 bundle 版本替换。
        for (const child of boxLayer.children) {
            child.active = false;
        }

        try {
            const box = await PrefabManager.createBox();
            box.name = 'box';
            const position = ChestPositionConfig.box;
            box.setPosition(position.x, position.y, position.z);
            boxLayer.addChild(box);

            const chest = box.getComponent(Chest) || box.addComponent(Chest);
            chest.init(grid);
            this.movePresentationToLayers(chest);
        } catch (err) {
            console.error('[ChestController] load box prefab failed', err);
        }
    }

    async spawnEquipmentItems(names: readonly EquipmentName[] = ['dachui', 'dao', 'kuijia', 'toukui', 'mount']): Promise<void> {
        const boxLayer = this.worldNode.getChildByName('boxLayer');
        const grid = this.getGrid();
        if (!boxLayer || !grid) return;

        const items: EquipmentSpawnConfig[] = [
            { name: 'dachui', create: () => PrefabManager.createDachui() },
            { name: 'dao', create: () => PrefabManager.createDao() },
            { name: 'kuijia', create: () => PrefabManager.createKuijia() },
            { name: 'toukui', create: () => PrefabManager.createToukui() },
            { name: 'mount', create: () => PrefabManager.createMount() },
        ];

        const requestedNames = new Set<EquipmentName>(names);
        await Promise.all(items.filter(item => requestedNames.has(item.name)).map(async (item) => {
            try {
                const node = await item.create();
                node.name = item.name;
                const position = ChestPositionConfig.equipment[item.name];
                node.setPosition(position.x, position.y, position.z);
                boxLayer.addChild(node);
                this.playEquipmentIdle(node);
                if (item.name === MonsterGuideConfig.targetNodeName) {
                    this.requestGuideStartForNode(node, this.isOpeningSequenceActive());
                }

                const chest = node.getComponent(Chest) || node.getComponentInChildren(Chest) || node.addComponent(Chest);
                if (chest) {
                    chest.init(grid);
                    this.movePresentationToLayers(chest);
                }
            } catch (err) {
                console.error(`[ChestController] load equipment prefab failed: ${item.name}`, err);
            }
        }));
    }

    private playEquipmentIdle(node: Node): void {
        const spineNode = node.name === 'spine' ? node : node.getChildByName('spine');
        if (!spineNode) return;

        const skeletons = spineNode.getComponentsInChildren(sp.Skeleton);
        for (const skeleton of skeletons) {
            if (!skeleton || !skeleton.isValid || !this.hasSkeletonAnimation(skeleton, 'idle')) continue;
            try {
                skeleton.setAnimation(0, 'idle', true);
            } catch (err) {
                console.warn(`[ChestController] equipment idle animation failed: ${node.name}`, err);
            }
        }
    }

    private hasSkeletonAnimation(skeleton: sp.Skeleton, name: string): boolean {
        const sk = skeleton as unknown as {
            findAnimation?: (animationName: string) => unknown;
            skeletonData?: unknown;
        };
        if (typeof sk.findAnimation === 'function') {
            return !!sk.findAnimation(name);
        }

        const skeletonData = sk.skeletonData as {
            getRuntimeData?: () => { animations?: Array<{ name?: string }> };
            skeletonJson?: { animations?: Record<string, unknown> };
            _skeletonJson?: { animations?: Record<string, unknown> };
        } | null | undefined;
        const runtimeAnimations = skeletonData?.getRuntimeData?.().animations;
        if (runtimeAnimations) {
            return runtimeAnimations.some(animation => animation.name === name);
        }
        const jsonAnimations = skeletonData?.skeletonJson?.animations || skeletonData?._skeletonJson?.animations;
        if (jsonAnimations) {
            return Object.prototype.hasOwnProperty.call(jsonAnimations, name);
        }
        return true;
    }

    /** 在旧宝箱位置放力量套道具，拾取触发方式复用宝箱占格逻辑。 */
    async spawnPowerSuit(): Promise<void> {
        const boxLayer = this.worldNode.getChildByName('boxLayer');
        const grid = this.getGrid();
        if (!boxLayer || !grid) return;

        try {
            const node = await PrefabManager.createPowerSuit();
            const position = ChestPositionConfig.powerSuit;
            node.setPosition(position.x, position.y, position.z);
            node.setScale(0.3, 0.3, 1);
            boxLayer.addChild(node);

            const chest = node.getComponent(Chest) || node.getComponentInChildren(Chest);
            if (!chest) {
                console.error('[ChestController] power suit prefab missing Chest component');
                return;
            }
            chest.init(grid);
            this.movePresentationToLayers(chest);
            this.powerSuitChest = chest;
        } catch (err) {
            console.error('[ChestController] load power suit prefab failed', err);
        }
    }

    /** 拾取宝箱 / 力量套：共用宝箱占格触发，奖励逻辑按节点区分。 */
    openChest(chest: Chest): void {
        const player = this.getPlayer();
        if (!player) return;

        this.clearPathLine();
        player.power += chest.power;
        this.applyImmediateDisplayedPowerGain(chest.power);

        const grid = this.getGrid();
        if (grid) grid.removeChest(chest);
        chest.setPresentationActive(false);
        if (chest.node) chest.node.active = false;

        AudioManager.playLevelUp();
        if (chest.isEquipment()) {
            this.applyEquipmentToPlayer(player, chest.node.name as EquipmentName);
            return;
        }

        if (chest === this.powerSuitChest || chest.node.name === 'PowerSuit') {
            this.powerSuitChest = null;
            this.switchPlayerRole('role2');
        } else {
            this.switchPlayerRole('role3');
        }
    }

    private applyEquipmentToPlayer(player: Player, equipment: EquipmentName): void {
        const spineNode = player.node.getChildByName('spine');
        if (!spineNode) return;
        const equipmentRoot = this.getEquipmentRoot(spineNode);

        if (equipment === 'dao') {
            this.setFirstSpineChildActive(equipmentRoot, '100001', false);
            this.setFirstSpineChildActive(equipmentRoot, '10004', true);
        } else if (equipment === 'kuijia') {
            this.setSpineChildrenRangeActive(equipmentRoot, '100101', 'hair_1', false);
            this.setSpineChildrenRangeActive(equipmentRoot, '10204', 'face_1', true, true);
        } else if (equipment === 'toukui') {
            this.setFirstSpineChildActive(equipmentRoot, '10104', true);
        } else if (equipment === 'dachui') {
            this.setFirstSpineChildActive(equipmentRoot, '10009', true);
        } else if (equipment === 'mount') {
            this.setFirstSpineChildActive(spineNode, '31201', true);
            this.setFirstSpineChildActive(spineNode, '31201_mount', true);
        }

        player.refreshSpineSkeletons();
        if (equipment === 'dao') {
            this.applyPlayerRoleProfile(player, 'role2', true);
            player.setAttackEffectsGroup('Effects1');
            player.playUpgradeEffect(PlayerRoleProfiles.role2.upgradeEffectAnimation);
        } else if (equipment === 'dachui') {
            this.applyPlayerRoleProfile(player, 'role1', true);
            player.setAttackEffectsGroup('Effects2');
            player.playUpgradeEffect(PlayerRoleProfiles.role1.upgradeEffectAnimation);
        } else {
            player.playSkillOnce('skill1');
            player.playUpgradeEffect(PlayerRoleProfiles.role.upgradeEffectAnimation);
        }
        if (equipment === 'mount') {
            player.activateMount();
        }
        AudioManager.playCheer();
    }

    private movePresentationToLayers(chest: Chest): void {
        if (!this.colorLayer || !this.labelLayer) return;
        if (!chest.movePresentationToLayers(this.colorLayer, this.labelLayer)) {
            console.warn(`[ChestController] split chest presentation failed: ${chest.node.name}`);
        }
    }

    private getEquipmentRoot(spineNode: Node): Node {
        return this.findFirstChildDeep(spineNode, 'rider') || spineNode;
    }

    private setFirstSpineChildActive(spineNode: Node, childName: string, active: boolean): void {
        const child = this.findFirstChildDeep(spineNode, childName);
        if (child) child.active = active;
    }

    private setSpineChildrenRangeActive(
        spineNode: Node,
        startName: string,
        endName: string,
        active: boolean,
        useLastEnd = false,
    ): void {
        const children = this.collectChildNodesDeep(spineNode);
        const startIndex = children.findIndex((node) => node.name === startName);
        const endIndex = useLastEnd
            ? this.findLastChildIndex(children, endName)
            : children.findIndex((node) => node.name === endName);
        if (startIndex < 0 || endIndex < startIndex) return;

        for (let index = startIndex; index <= endIndex; index++) {
            children[index].active = active;
        }
    }

    private findFirstChildDeep(root: Node, childName: string): Node | null {
        for (const child of root.children) {
            if (child.name === childName) return child;
            const found = this.findFirstChildDeep(child, childName);
            if (found) return found;
        }
        return null;
    }

    private collectChildNodesDeep(root: Node): Node[] {
        const nodes: Node[] = [];
        const collect = (node: Node) => {
            for (const child of node.children) {
                nodes.push(child);
                collect(child);
            }
        };
        collect(root);
        return nodes;
    }

    private findLastChildIndex(children: Node[], childName: string): number {
        for (let index = children.length - 1; index >= 0; index--) {
            if (children[index].name === childName) return index;
        }
        return -1;
    }
}
