import { Node } from 'cc';
import { Chest } from './Chest';
import { Grid } from './Grid';
import { Player } from './Player';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';

type RewardRoleType = 'role1' | 'role2';

export class ChestController {
    private powerSuitChest: Chest | null = null;

    constructor(
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly clearPathLine: () => void,
        private readonly switchPlayerRole: (roleType: RewardRoleType) => void,
    ) {}

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
            box.setPosition(-620, 130, 0);
            boxLayer.addChild(box);

            const chest = box.getComponent(Chest) || box.addComponent(Chest);
            chest.init(grid);
        } catch (err) {
            console.error('[ChestController] load box prefab failed', err);
        }
    }

    /** 在旧宝箱位置放力量套道具，拾取触发方式复用宝箱占格逻辑。 */
    async spawnPowerSuit(): Promise<void> {
        const boxLayer = this.worldNode.getChildByName('boxLayer');
        const grid = this.getGrid();
        if (!boxLayer || !grid) return;

        try {
            const node = await PrefabManager.createPowerSuit();
            node.setPosition(685, -70, 0);
            node.setScale(0.3, 0.3, 1);
            boxLayer.addChild(node);

            const chest = node.getComponent(Chest) || node.getComponentInChildren(Chest);
            if (!chest) {
                console.error('[ChestController] power suit prefab missing Chest component');
                return;
            }
            chest.init(grid);
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
        player.setDisplayedPower(player.getDisplayedPower() + chest.power);

        const grid = this.getGrid();
        if (grid) grid.removeChest(chest);
        if (chest.node) chest.node.active = false;

        AudioManager.playLevelUp();
        if (chest === this.powerSuitChest || chest.node.name === 'PowerSuit') {
            this.powerSuitChest = null;
            this.switchPlayerRole('role2');
        } else {
            this.switchPlayerRole('role1');
        }
    }
}
