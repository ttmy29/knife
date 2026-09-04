import {
    _decorator, Component, Node, Graphics,
    Color, Vec3, Camera,
} from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { PathLine } from './PathLine';
import { WallRegion } from './WallRegion';
import { CameraFollow } from './CameraFollow';
import { Chest } from './Chest';
import { ChestController } from './ChestController';
import { FinalBossCinematicController } from './FinalBossCinematicController';
import { MonsterController } from './MonsterController';
import { MonsterGlowController } from './MonsterGlowController';
import { MonsterGuideController } from './MonsterGuideController';
import { OpeningSequenceController } from './OpeningSequenceController';
import { PlayerInputController } from './PlayerInputController';
import { PlayerRoleController } from './PlayerRoleController';
import { RewardController } from './RewardController';
import { ResultPanelController } from './ResultPanelController';
import { TargetHintController } from './TargetHintController';
import { Level1 } from './GameConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';
import { AttackAudioType } from './config/ResourceConfig';
import { MonsterSpawnConfig } from './config/MonsterConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏入口（挂�?GameWorld 节点上）�? * - �?Graphics 生成地面/墙（不需要墙预制体）
 * - 角色由预制体实例化；怪物直接在场景里摆放（Monsters 节点下）
 * - 全局点击输入 -> 寻路 -> 绿线 -> 移动 -> 战斗
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Node })
    public finalBossMaskNode: Node | null = null;

    private grid: Grid | null = null;
    private player: Player | null = null;
    private pathLine: PathLine | null = null;
    private uiLayer: Node | null = null;
    private camera: Camera | null = null;
    private hintCamera: Camera | null = null;
    private battling = false;
    private resultPanels: ResultPanelController | null = null;
    private rewards: RewardController | null = null;
    private chests: ChestController | null = null;
    private playerRoles: PlayerRoleController | null = null;
    private playerInput: PlayerInputController | null = null;
    private monsterController: MonsterController | null = null;
    private finalBossCinematic: FinalBossCinematicController | null = null;
    private activeBattleMonster: Monster | null = null;
    private monsterGlow: MonsterGlowController | null = null;
    private monsterGuide: MonsterGuideController | null = null;
    private openingSequence: OpeningSequenceController | null = null;
    private targetHint: TargetHintController | null = null;

    onLoad(): void {
        AudioManager.init(this.node);
        AudioManager.playBgm();

        const canvas = this.node.parent;
        this.camera = canvas ? canvas.getComponentInChildren(Camera) : null;
        this.hintCamera = canvas ? canvas.getChildByName('Camera-001')?.getComponent(Camera) || null : null;
        this.monsterGlow = new MonsterGlowController(this, this.node);
        this.monsterGlow.init();
        this.monsterGuide = new MonsterGuideController();
        this.finalBossCinematic = new FinalBossCinematicController(
            this,
            () => this.camera,
            () => this.finalBossMaskNode,
            () => this.playerRoles?.getCurrentProfile() || null,
        );
        this.monsterController = new MonsterController(
            this,
            this.node,
            () => this.grid,
            () => this.camera,
            this.monsterGlow,
            () => this.openingSequence?.active || false,
            () => this.activeBattleMonster,
            () => this.finalBossCinematic?.currentFinisherMonster || null,
        );

        this.grid = this.getComponent(Grid) || this.addComponent(Grid);
        this.grid.init(Level1);
        this.openingSequence = new OpeningSequenceController(
            this,
            this.node,
            () => this.grid,
            () => this.camera,
            () => this.player,
            () => this.getPlayerSpawnLocalPosition(),
            () => this.assignCameraTarget(),
            () => {
                this.monsterGuide?.flushPending();
                this.targetHint?.show();
            },
        );
        this.openingSequence.init();
        this.openingSequence.alignCameraToOpeningTarget();
        this.bakeWallRegions();

        this.buildGround();
        this.playerRoles = new PlayerRoleController(
            this.node,
            () => this.grid,
            (player) => this.bindPlayerEvents(player),
            (player) => { this.player = player; },
            () => this.getPlayerSpawnLocalPosition(),
            () => this.assignCameraTarget(),
            () => this.openingSequence?.tryMoveCameraToPlayer(),
        );
        this.rewards = new RewardController(this, this.node, () => this.player);
        this.rewards.init();
        this.chests = new ChestController(
            this.node,
            () => this.grid,
            () => this.player,
            () => this.pathLine?.clear(),
            (roleType) => this.playerRoles?.switchPlayerRole(this.player, roleType),
            (player, roleType, playIntro) => this.playerRoles?.applyPlayerRoleProfile(player, roleType, playIntro),
            (node, openingActive) => this.monsterGuide?.requestStartForNode(node, openingActive),
            () => this.openingSequence?.active || false,
        );
        this.buildPathLine();
        this.monsterController.setupRenderLayers();
        this.buildUI();
        this.playerInput = new PlayerInputController(
            this.node,
            () => this.grid,
            () => this.player,
            () => this.pathLine,
            () => this.camera,
            () => this.uiLayer,
            () => this.openingSequence?.active || false,
            () => this.battling,
            () => this.monsterController?.getFinalMonster() || null,
            () => this.playerRoles?.getCurrentProfile().normalMonsterBattleDistance,
            () => this.playerRoles?.getCurrentProfile().bossMonsterBattleDistance,
            this.monsterGlow,
            () => this.monsterGuide?.dismiss() || false,
        );
        this.playerInput.init();
        this.monsterController.startViewportCulling();
        void this.loadOpeningScene();
    }

    onDestroy(): void {
        this.finalBossCinematic?.restoreAll();
        this.monsterGuide?.destroy();
        this.monsterGlow?.hide();
        this.targetHint?.hide();
        this.rewards?.destroy();
        this.monsterController?.destroy();
        this.playerInput?.destroy();
    }

    // ---------------- 场景搭建 ----------------

    private buildGround(): void {
        const ground = this.node.getChildByName('Ground');
        if (!ground) return;
        const g = ground.getComponent(Graphics) || ground.addComponent(Graphics);
        const w = Level1.cols * Level1.tileSize;
        const h = Level1.rows * Level1.tileSize;
        g.fillColor = new Color(46, 46, 58, 255);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.lineWidth = 1;
        g.strokeColor = new Color(70, 70, 88, 255);
        for (let c = 0; c <= Level1.cols; c++) {
            const x = -w / 2 + c * Level1.tileSize;
            g.moveTo(x, -h / 2);
            g.lineTo(x, h / 2);
            g.stroke();
        }
        for (let r = 0; r <= Level1.rows; r++) {
            const y = -h / 2 + r * Level1.tileSize;
            g.moveTo(-w / 2, y);
            g.lineTo(w / 2, y);
            g.stroke();
        }
    }

    /** 扫描场景里的 WallRegion 节点，把覆盖的格子烘焙成�?*/
    private bakeWallRegions(): void {
        if (!this.grid) return;
        const regions = this.node.getComponentsInChildren(WallRegion);
        if (regions.length === 0) return;
        let total = 0;
        for (const region of regions) {
            if (!region.node.activeInHierarchy) continue;
            total += region.bake(this.grid);
        }
       // console.log(`[WallRegion] 烘焙 ${regions.length} 个区域，�?${total} 格墙`);
    }

    private buildPathLine(): void {
        const node = this.node.getChildByName('PathLine');
        if (!node) return;
        this.pathLine = node.getComponent(PathLine) || node.addComponent(PathLine);
        this.pathLine.cornerRadius = 14;
    }

    private async loadStartupPrefabs(): Promise<void> {
        try {
            await PrefabManager.loadRole();
            this.playerRoles?.spawnInitialPlayer();
        } catch (err) {
            console.error('[GameManager] load role prefabs failed', err);
            this.playerRoles?.spawnInitialPlayer();
        }

        try {
            await Promise.all([
                PrefabManager.loadRole1(),
                PrefabManager.loadRole2(),
                PrefabManager.loadRole3(),
                PrefabManager.loadFail(),
                PrefabManager.loadVictory(),
            ]);
        } catch (err) {
            console.error('[GameManager] load result prefabs failed', err);
        }
    }

    /** 并行完成所有开场资源实例化，再开始 Boss 演出，避免加载与镜头移动争抢帧时间。 */
    private async loadOpeningScene(): Promise<void> {
        try {
            await Promise.all([
                this.loadStartupPrefabs(),
                this.monsterController ? this.monsterController.spawnMonsters() : Promise.resolve(),
                this.chests ? this.chests.spawnInitialChest() : Promise.resolve(),
                this.chests ? this.chests.spawnEquipmentItems() : Promise.resolve(),
                AudioManager.preloadFinalBossSounds(),
                AudioManager.preloadRoleDie(),
                this.openingSequence?.active ? AudioManager.preloadShout() : Promise.resolve(),
            ]);
        } catch (err) {
            console.error('[GameManager] opening scene load failed', err);
        }

        if (!this.openingSequence?.active) {
            this.targetHint?.show();
            return;
        }
        const monster = this.monsterController?.getOpeningMonster()
            || this.monsterController?.getFinalMonster();
        if (monster && monster.node && monster.node.isValid) {
            monster.playSpawnFade(MonsterSpawnConfig.fadeDuration, () => {
                monster.activateOnGrid();
                this.openingSequence?.start(monster);
            });
            return;
        }
        this.openingSequence?.deactivate();
        this.assignCameraTarget();
        this.targetHint?.show();
    }

    /** 绑定角色事件（初�?/ 切换 role1 后复用） */
    private bindPlayerEvents(player: Player): void {
        player.events = {
            onArrive: (m: Monster | null) => {
                if (this.pathLine) this.pathLine.hideTarget();
                if (m) this.doBattle(m);
            },
            onBattle: (m: Monster) => this.doBattle(m),
            onChest: (chest: Chest) => this.chests?.openChest(chest),
            onAttack: (sound: AttackAudioType) => AudioManager.playAttack(sound),
        };
    }

    /** 相机跟随角色：给 Camera �?CameraFollow 并指定目�?*/
    private assignCameraTarget(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        const camera = canvas.getChildByName('Camera');
        if (!camera) return;
        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = !this.openingSequence?.active && this.player ? this.player.node : null;
    }

    private getPlayerSpawnLocalPosition(): Vec3 {
        const world = Level1.playerSpawnWorld;
        if (world) return new Vec3(world.x, world.y, world.z || 0);
        return this.grid
            ? this.grid.gridToWorld(Level1.playerSpawn.col, Level1.playerSpawn.row)
            : new Vec3();
    }

    update(dt: number): void {
        this.playerInput?.update(dt);
        this.targetHint?.update(dt);
    }

    private buildUI(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        this.uiLayer = canvas.getChildByName('UILayer');
        if (!this.uiLayer) return;
        this.monsterGuide?.init(this.uiLayer);
        this.resultPanels = new ResultPanelController(this.uiLayer, this.camera);
        this.targetHint = new TargetHintController(
            this.node,
            () => this.camera,
            () => this.hintCamera,
            () => this.player ? this.player.node : null,
        );
        this.targetHint.init(this.uiLayer);
    }

    // ---------------- 战斗（需�?4/12/13/14�?----------------

    private doBattle(monster: Monster): void {
        if (!this.player || this.battling) return;
        this.monsterGlow?.hide();
        this.battling = true;
        this.activeBattleMonster = monster;
        monster.setViewportVisible(true);
        if (this.pathLine) this.pathLine.clear();
        this.player.faceToWorldX(monster.node.worldPosition.x);
        monster.faceToWorldX(this.player.node.worldPosition.x);
        const win = this.player.power > monster.power;
        const rewardPower = monster.power;
        const finalMonster = this.monsterController?.getFinalMonster();
        if (monster === finalMonster) this.targetHint?.hide();
        let monsterHidden = false;
        const hideMonster = () => {
            if (monsterHidden) return;
            monsterHidden = true;
            monster.setPresentationActive(false);
            if (monster.node) {
                monster.node.active = false;
            }
            if (this.activeBattleMonster === monster) this.activeBattleMonster = null;
            if (monster === finalMonster) this.showVictoryUI();
        };
        if (win) {
            const isFinalMonster = monster === finalMonster;
            let battleResolved = false;
            const finishWin = () => {
                if (battleResolved) return;
                battleResolved = true;
                // 攻击命中：怪物立刻停攻击并播放死亡动画。
                if (this.grid) this.grid.removeMonster(monster);
                if (this.player) this.player.power += rewardPower;
                if (isFinalMonster) AudioManager.playBossDie();
                else AudioManager.playMonsterDie();
                monster.playDie(hideMonster);
                // 死亡动画兜底：异常（动画不播�?骨骼失效）时强制结束
                this.scheduleOnce(hideMonster, 3);
                this.rewards?.startExpOrbDrop(monster, () => this.rewards?.enqueuePlayerPowerGain(rewardPower));
            };
            if (isFinalMonster) {
                this.finalBossCinematic?.playAttackSequence(
                    this.player,
                    monster,
                    rewardPower,
                    finishWin,
                    () => {},
                );
            } else {
                this.player.playAttack(() => {
                    finishWin();
                    this.battling = false;
                }, finishWin);
                monster.playAttack();
            }
        } else {
            this.rewards?.startPlayerPowerLossTick();
            this.player.playAttack();
            monster.playAttack();
            this.scheduleOnce(() => {
                if (!this.player) return;
                AudioManager.playRoleDie();
                this.player.playDie(() => {
                    this.battling = false;
                    if (this.activeBattleMonster === monster) this.activeBattleMonster = null;
                    this.showDeathUI();
                });
            }, 0.5);//多久开始播放角色死亡动画
        }
    }

    /** 角色死亡：显示失败面板。 */
    private showDeathUI(): void {
        this.lockResultState();
        this.resultPanels?.showFail();
    }

    /** 打败最终怪物：显示胜利面板。 */
    private showVictoryUI(): void {
        this.lockResultState();
        this.resultPanels?.showVictory();
    }

    /** 结果界面出现后统一冻结操作；胜利流程不播放角色死亡动画。 */
    private lockResultState(): void {
        this.activeBattleMonster = null;
        this.finalBossCinematic?.resetForResult();
        this.monsterGuide?.dismiss();
        this.monsterGlow?.hide();
        this.targetHint?.hide();
        if (this.pathLine) this.pathLine.clear();
        if (this.player) {
            this.player.stop();
            this.player.dead = true;
        }
        const follow = this.camera ? this.camera.getComponent(CameraFollow) : null;
        if (follow) follow.enabled = false;
    }

}
