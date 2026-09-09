import { Color, Graphics, Label, Node, sp, UITransform, Vec2, Vec3 } from 'cc';
import { Grid } from './Grid';
import { Player } from './Player';
import { Level1 } from './GameConfig';
import {
    PlayerRoleProfile,
    PlayerRoleProfiles,
    PlayerRoleType,
} from './config/PlayerRoleConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';

export type SwitchableRoleType = 'role1' | 'role2' | 'role3';

export class PlayerRoleController {
    /** 当前使用的攻击、音效和距离配置。 */
    private roleType: PlayerRoleType = 'role';
    /** 当前实际实例化的角色预制体，不随拾取武器切换攻击配置而改变。 */
    private prefabRoleType: PlayerRoleType = 'role';

    constructor(
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly bindPlayerEvents: (player: Player) => void,
        private readonly setPlayer: (player: Player) => void,
        private readonly getPlayerSpawnLocalPosition: () => Vec3,
        private readonly assignCameraTarget: () => void,
    ) {}

    getCurrentProfile(): PlayerRoleProfile {
        return PlayerRoleProfiles[this.roleType];
    }

    getCurrentPrefabRoleType(): PlayerRoleType {
        return this.prefabRoleType;
    }

    spawnInitialPlayer(): void {
        const container = this.worldNode.getChildByName('Player');
        const grid = this.getGrid();
        if (!container || !grid) return;

        let node: Node;
        try {
            node = PrefabManager.createRole();
            node.name = 'PlayerInstance';
            this.applyConfiguredPlayerScale(node, 'role');
        } catch (err) {
            console.error('[PlayerRoleController] create role prefab failed', err);
            node = this.createPlaceholder(Level1.tileSize * 0.6, new Color(90, 200, 255, 255));
            node.name = 'PlayerPlaceholder';
        }
        // 初始配置完成前不进入渲染，避免预制体 Label 短暂显示一帧旧数值。
        const initiallyActive = node.active;
        node.active = false;
        container.addChild(node);

        const player = node.addComponent(Player);
        player.init(Level1.playerPower, Level1.playerSpawn.col, Level1.playerSpawn.row, grid);
        const spawnWorld = this.getPlayerSpawnLocalPosition();
        player.node.setPosition(spawnWorld.x, spawnWorld.y, spawnWorld.z || 0);
        const spawnCell = grid.worldToGrid(player.node.position);
        if (spawnCell) {
            player.gridCol = spawnCell.x;
            player.gridRow = spawnCell.y;
        }

        this.bindPlayerEvents(player);
        this.prefabRoleType = 'role';
        this.applyPlayerRoleProfile(player, 'role', false);
        this.setPlayer(player);
        node.active = initiallyActive;
        this.assignCameraTarget();
    }

    /** 把当前角色替换成指定形态：位置、战力、朝向保留。 */
    switchPlayerRole(currentPlayer: Player | null, roleType: SwitchableRoleType): void {
        const grid = this.getGrid();
        if (!currentPlayer || !grid) return;
        const container = this.worldNode.getChildByName('Player');
        if (!container) return;

        const old = currentPlayer;
        const pos = old.node.position.clone();
        const power = old.power;
        const displayedPower = old.getDisplayedPower();
        const facingDir = old.getFacing();
        const cell = grid.worldToGrid(pos) || new Vec2(old.gridCol, old.gridRow);
        old.node.destroy();

        let node: Node;
        try {
            if (roleType === 'role3') node = PrefabManager.createRole3();
            else node = roleType === 'role2' ? PrefabManager.createRole2() : PrefabManager.createRole1();
        } catch (err) {
            console.error(`[PlayerRoleController] create ${roleType} prefab failed`, err);
            return;
        }
        node.name = 'PlayerInstance';
        this.applyConfiguredPlayerScale(node, roleType);
        const label = node.getComponentInChildren(Label);
        if (label) label.string = String(displayedPower);
        container.addChild(node);
        this.playRoleUpgradeEffect(node, PlayerRoleProfiles[roleType].upgradeEffectAnimation);

        const player = node.addComponent(Player);
        player.init(power, cell.x, cell.y, grid, displayedPower);
        player.setInitialFacing(facingDir);
        this.bindPlayerEvents(player);
        this.prefabRoleType = roleType;
        this.applyPlayerRoleProfile(player, roleType);
        this.setPlayer(player);
        this.assignCameraTarget();
        AudioManager.playCheer();
    }

    applyPlayerRoleProfile(player: Player, roleType: PlayerRoleType, playIntro = true): void {
        const profile = PlayerRoleProfiles[roleType];
        this.roleType = roleType;
        player.setAttackProfile(
            profile.attackAnimation,
            profile.attackSound,
            profile.attackSoundDelay,
            profile.attackImpactDelay,
        );
        if (playIntro && profile.introAnimation) player.playSkillOnce(profile.introAnimation);
    }

    private applyConfiguredPlayerScale(node: Node, roleType: PlayerRoleType): void {
        const roleScale = Level1.playerRoleScales?.[roleType];
        const scale = roleScale || (roleType === 'role' ? Level1.playerScale : undefined);
        if (!scale) return;
        node.setScale(
            scale.x !== undefined ? scale.x : node.scale.x,
            scale.y !== undefined ? scale.y : node.scale.y,
            scale.z !== undefined ? scale.z : node.scale.z,
        );
    }

    private playRoleUpgradeEffect(roleNode: Node, animationName?: string): void {
        if (!animationName) return;
        const effectNode = roleNode.getChildByName('sxsj');
        if (!effectNode) return;
        const skeleton = effectNode.getComponent(sp.Skeleton)
            || effectNode.getComponentInChildren(sp.Skeleton);
        if (!skeleton) {
            effectNode.active = false;
            return;
        }

        effectNode.active = true;
        skeleton.setCompleteListener(() => {
            skeleton.setCompleteListener(() => {});
            if (effectNode.isValid) effectNode.active = false;
        });
        skeleton.setAnimation(0, animationName, false);
    }

    private createPlaceholder(size: number, color: Color): Node {
        const node = new Node('Placeholder');
        node.addComponent(UITransform).setContentSize(size, size);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.circle(0, 0, size / 2);
        graphics.fill();
        return node;
    }
}
