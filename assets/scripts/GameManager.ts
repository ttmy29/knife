import {
    _decorator, Component, Node, Graphics, UITransform,
    Label, Color, Vec2, Vec3, input, Input, EventTouch, director, Camera, sp,
    UIOpacity, tween, view,
} from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { PathLine } from './PathLine';
import { WallRegion } from './WallRegion';
import { CameraFollow } from './CameraFollow';
import { ExpOrb } from './ExpOrb';
import { Chest } from './Chest';
import { FailPanel } from './FailPanel';
import { VictoryPanel } from './VictoryPanel';
import { Level1 } from './GameConfig';
import { AudioManager } from './core/AudioManager';
import { PrefabManager } from './core/PrefabManager';
import { AttackAudioType } from './config/ResourceConfig';
import { PlayerRoleProfiles, PlayerRoleType } from './config/PlayerRoleConfig';
import { FinalBossBattleConfig } from './config/FinalBossBattleConfig';
import { OpeningSequenceConfig } from './config/OpeningSequenceConfig';
import {
    MonsterProfiles,
    MonsterSpawnConfig,
    MonsterViewportCullingConfig,
} from './config/MonsterConfig';
import { MonsterGuideConfig } from './config/MonsterGuideConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏入口（挂�?GameWorld 节点上）�? * - �?Graphics 生成地面/墙（不需要墙预制体）
 * - 角色由预制体实例化；怪物直接在场景里摆放（Monsters 节点下）
 * - 全局点击输入 -> 寻路 -> 绿线 -> 移动 -> 战斗
 */
@ccclass('GameManager')
export class GameManager extends Component {
    private static openingSequenceShownOnce = false;

    @property({ type: Node })
    public finalBossMaskNode: Node | null = null;

    private grid: Grid | null = null;
    private player: Player | null = null;
    private playerRoleType: PlayerRoleType = 'role';
    private pathLine: PathLine | null = null;
    private uiLayer: Node | null = null;
    private camera: Camera | null = null;
    private dropsNode: Node | null = null;
    private monsterColorLayer: Node | null = null;
    private monsterLabelLayer: Node | null = null;
    private onPowerTick: (() => void) | null = null;
    private pendingPowerGain = 0;
    private powerGainAnimating = false;
    private battling = false;
    private failPanel: Node | null = null;
    private victoryPanel: Node | null = null;
    private finalMonster: Monster | null = null;
    private monsters: Monster[] = [];
    private activeBattleMonster: Monster | null = null;
    private powerSuitChest: Chest | null = null;
    private glowHolder: Node | null = null;
    private glowingMonster: Monster | null = null;
    private hideGlowTask: (() => void) | null = null;
    private guideNode: Node | null = null;
    private monsterGuideActive = false;
    private monsterGuideDismissed = false;
    private openingSequenceActive = true;
    private openingIntroStarted = false;
    private openingAnimationComplete = false;
    private openingCameraMoving = false;
    private openingMonster: Monster | null = null;
    private pendingGuideMonster: Monster | null = null;
    private finisherSlowStartTimer: ReturnType<typeof setTimeout> | null = null;
    private finisherSlowTimer: ReturnType<typeof setTimeout> | null = null;
    private finisherHitStopTimer: ReturnType<typeof setTimeout> | null = null;
    private finisherDeathTimer: ReturnType<typeof setTimeout> | null = null;
    private finisherPlayer: Player | null = null;
    private finisherMonster: Monster | null = null;
    private finalBossCameraOrthoHeight: number | null = null;
    private finalBossCameraOffsetX: number | null = null;

    onLoad(): void {
        this.monsterGuideActive = false;
        this.monsterGuideDismissed = false;
        this.openingSequenceActive = !GameManager.openingSequenceShownOnce;
        AudioManager.init(this.node);
        AudioManager.playBgm();

        const canvas = this.node.parent;
        this.camera = canvas ? canvas.getComponentInChildren(Camera) : null;
        this.glowHolder = this.node.getChildByName('GlowHolder') || (canvas ? canvas.getChildByName('GlowHolder') : null);
        if (this.glowHolder) {
            if (canvas && this.glowHolder.parent !== canvas) {
                const worldIndex = this.node.getSiblingIndex();
                this.glowHolder.setParent(canvas);
                this.glowHolder.setScale(1, 1, 1);
                this.glowHolder.setSiblingIndex(worldIndex + 1);
            }
            const snapshot = this.glowHolder.getComponent('Snapshot') as any;
            if (snapshot) {
                snapshot.snapshotLayer = 27;
                snapshot.target = null;
            }
            for (const child of this.glowHolder.children) {
                if (child.name !== 'Camera') child.active = false;
            }
            this.glowHolder.active = false;
        }

        this.grid = this.getComponent(Grid) || this.addComponent(Grid);
        this.grid.init(Level1);
        this.alignCameraToOpeningTarget();
        this.bakeWallRegions();

        this.buildGround();
        this.buildDropsLayer();
        this.buildPathLine();
        this.setupMonsterRenderLayers();
        this.buildUI();
        this.startMonsterViewportCulling();
        void this.loadOpeningScene();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    onDestroy(): void {
        this.restoreGameTimeScale();
        this.hideGuideNode();
        this.hideMonsterGlow();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        if (this.onPowerTick) this.unschedule(this.onPowerTick);
        this.unschedule(this.updateMonsterViewportVisibility);
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

    /** 掉落物（经验球等）的专门层级：运行时动态生成，不挂在怪物身上 */
    private buildDropsLayer(): void {
        // 已有则复用，避免重复创建
        let node = this.node.getChildByName('Drops');
        if (!node) {
            node = new Node('Drops');
            node.addComponent(UITransform);
            this.node.addChild(node);
        }
        this.dropsNode = node;
    }

    /** 在指定世界位置生成一个经验球 */
    private spawnExpOrb(worldPos: Vec3, exp: number): ExpOrb {
        if (!this.dropsNode) {
            this.buildDropsLayer();
        }
        const node = new Node('ExpOrb');
        node.setPosition(worldPos);
        node.addComponent(UITransform).setContentSize(24, 24);
        const orb = node.addComponent(ExpOrb);
        orb.init(exp);
        this.dropsNode!.addChild(node);
        return orb;
    }

    /**
     * 怪物死亡经验球掉落规则：
     * 1) 角色攻击完成后，在怪物位置生成 2 个经验球。
     * 2) 逻辑战力在怪物被击败时立即增加；经验球到达后只更新显示数字。
     * 3) 怪物死亡动画独立播放，动画完成即可隐藏，不等待经验球。
     */
    private startExpOrbDrop(monster: Monster, onComplete: () => void): void {
        if (!this.player) {
            onComplete();
            return;
        }
        const monsterPos = monster.node ? monster.node.position.clone() : new Vec3();
        // 方位：怪物在角色右 / �?-> 方向取正
        const dx = monsterPos.x - this.player.node.position.x;
        const dy = monsterPos.y - this.player.node.position.y;
        const dirX = dx >= 0 ? 1 : -1;
        const dirY = dy >= 0 ? 1 : -1;

        const orb1 = this.spawnExpOrb(monsterPos, 0);
        const orb2 = this.spawnExpOrb(monsterPos, 0);
        let arrived = 0;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            onComplete();
        };
        const onArrive = () => {
            arrived++;
            if (arrived === 1) AudioManager.playExpCollect();
            if (arrived >= 2) {
                if (orb1.node && orb1.node.isValid) orb1.node.destroy();
                if (orb2.node && orb2.node.isValid) orb2.node.destroy();
                // 收到经验球：角色缩放脉冲
                if (this.player) this.player.playExpPulse();
                finish();
            }
        };

        const vy = 20;
        const peak1 = 40;
        const peak2 = 20;

        // 第一跳：0.5s，一�?X �?60、一�?X �?90，抛物线
        orb1.hop(dirX * 60, dirY * vy, 0.5, peak1);
        orb2.hop(dirX * 90, dirY * vy, 0.5, peak1);
        // 第一跳结束（0.5s）立刻第二跳�?.3s 再向右移�?30，抛物线
        this.scheduleOnce(() => {
            orb1.hop(dirX * 30, 0, 0.3, peak2);
            orb2.hop(dirX * 30, 0, 0.3, peak2);
        }, 0.5);
        // 第二跳结束（0.8s）立刻飞向角色：0.2s 到达
        this.scheduleOnce(() => {
            if (this.player) {
                // 实时追踪角色位置（角色移动后经验球也能追上）
                orb1.flyToLive(() => this.player!.node.position, 0.2, onArrive);
                orb2.flyToLive(() => this.player!.node.position, 0.2, onArrive);
            } else {
                orb1.flyTo(new Vec3(), 0.2, onArrive);
                orb2.flyTo(new Vec3(), 0.2, onArrive);
            }
        }, 0.8);
        this.scheduleOnce(() => {
            if (completed) return;
            if (orb1.node && orb1.node.isValid) orb1.node.destroy();
            if (orb2.node && orb2.node.isValid) orb2.node.destroy();
            if (this.player && arrived < 2) this.player.playExpPulse();
            finish();
        }, 3);
    }

    private spawnPlayer(): void {
        const container = this.node.getChildByName('Player');
        if (!container || !this.grid) return;
        let node: Node;
        try {
            node = PrefabManager.createRole();
            node.name = 'PlayerInstance';
            this.applyConfiguredPlayerScale(node, 'role');
        } catch (err) {
            console.error('[GameManager] create role prefab failed', err);
            node = this.createPlaceholder(Level1.tileSize * 0.6, new Color(90, 200, 255, 255));
            node.name = 'PlayerPlaceholder';
        }
        container.addChild(node);
        const player = node.addComponent(Player);
        player.init(Level1.playerPower, Level1.playerSpawn.col, Level1.playerSpawn.row, this.grid);
        const spawnWorld = this.getPlayerSpawnLocalPosition();
        player.node.setPosition(spawnWorld);
        const spawnCell = this.grid.worldToGrid(spawnWorld);
        if (spawnCell) {
            player.gridCol = spawnCell.x;
            player.gridRow = spawnCell.y;
        }
        this.bindPlayerEvents(player);
        this.applyPlayerRoleProfile(player, 'role');
        this.player = player;
        this.assignCameraTarget();
        this.tryMoveOpeningCameraToPlayer();
    }

    private async loadStartupPrefabs(): Promise<void> {
        try {
            await PrefabManager.loadRole();
            this.spawnPlayer();
        } catch (err) {
            console.error('[GameManager] load role prefabs failed', err);
            this.spawnPlayer();
        }

        try {
            await Promise.all([
                PrefabManager.loadRole1(),
                PrefabManager.loadRole2(),
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
                this.spawnMonsters(),
                this.spawnInitialChest(),
                this.spawnPowerSuit(),
                AudioManager.preloadFinalBossSounds(),
                AudioManager.preloadRoleDie(),
                this.openingSequenceActive ? AudioManager.preloadShout() : Promise.resolve(),
            ]);
        } catch (err) {
            console.error('[GameManager] opening scene load failed', err);
        }

        if (!this.openingSequenceActive) return;
        const monster = this.openingMonster || this.finalMonster;
        if (monster && monster.node && monster.node.isValid) {
            monster.playSpawnFade(MonsterSpawnConfig.fadeDuration, () => {
                monster.activateOnGrid();
                this.startOpeningSequence(monster);
            });
            return;
        }
        this.openingSequenceActive = false;
        this.assignCameraTarget();
    }

    /** 绑定角色事件（初�?/ 切换 role1 后复用） */
    private bindPlayerEvents(player: Player): void {
        player.events = {
            onArrive: (m: Monster | null) => {
                if (this.pathLine) this.pathLine.hideTarget();
                if (m) this.doBattle(m);
            },
            onBattle: (m: Monster) => this.doBattle(m),
            onChest: (chest: Chest) => this.openChest(chest),
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
        follow.target = !this.openingSequenceActive && this.player ? this.player.node : null;
    }

    /** 资源加载前直接把镜头放到开场怪物位置，避免先显示角色出生区域。 */
    private alignCameraToOpeningTarget(): void {
        if (!this.camera || !this.grid) return;
        const worldTransform = this.node.getComponent(UITransform);
        if (!worldTransform) return;

        const follow = this.camera.getComponent(CameraFollow) || this.camera.addComponent(CameraFollow);
        follow.target = null;
        if (!this.openingSequenceActive) {
            const playerLocal = this.getPlayerSpawnLocalPosition();
            follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(playerLocal));
            return;
        }
        const data = Level1.monsters.find(item => item.name === OpeningSequenceConfig.targetMonsterName);
        if (!data) {
            this.openingSequenceActive = false;
            const playerLocal = this.getPlayerSpawnLocalPosition();
            follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(playerLocal));
            return;
        }
        const cell = this.grid.worldToGrid(new Vec3(data.x, data.y, data.z || 0));
        const monsterLocal = cell ? this.grid.gridToWorld(cell.x, cell.y) : new Vec3(data.x, data.y, data.z || 0);
        follow.snapToWorldPosition(worldTransform.convertToWorldSpaceAR(monsterLocal));
    }

    private getPlayerSpawnLocalPosition(): Vec3 {
        const world = Level1.playerSpawnWorld;
        if (world) return new Vec3(world.x, world.y, world.z || 0);
        return this.grid
            ? this.grid.gridToWorld(Level1.playerSpawn.col, Level1.playerSpawn.row)
            : new Vec3();
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

    update(dt: number): void {
        // PathLine 内部限频重画，绿线仍持续擦除角色走过的部分。
        if (this.player && this.player.isMoving() && this.pathLine) {
            this.pathLine.updateRemaining(this.player.node.position, dt);
        }
    }

    private async spawnMonsters(): Promise<void> {
        const container = this.node.getChildByName('Monsters');
        if (!container || !this.grid) return;
        for (const child of container.children) {
            child.active = false;
        }

        let highestMonster: Monster | null = null;
        const spawnFadeTasks: Promise<void>[] = [];
        this.finalMonster = null;

        for (const data of Level1.monsters) {
            let child: Node;
            try {
                child = await PrefabManager.createMonster(data.prefab);
            } catch (err) {
                console.error(`[GameManager] create monster prefab failed: ${data.prefab}`, err);
                continue;
            }

            child.name = data.name;
            child.setPosition(data.x, data.y, data.z || 0);
            if (data.scaleX !== undefined || data.scaleY !== undefined || data.scaleZ !== undefined) {
                child.setScale(
                    data.scaleX !== undefined ? data.scaleX : child.scale.x,
                    data.scaleY !== undefined ? data.scaleY : child.scale.y,
                    data.scaleZ !== undefined ? data.scaleZ : child.scale.z,
                );
            }
            const monster = child.getComponent(Monster) || child.addComponent(Monster);
            monster.prepareSpawnFade();
            const label = child.getComponentInChildren(Label);
            if (label) label.string = String(data.power);
            container.addChild(child);

            if (data.battleRadius !== undefined) monster.battleRadius = data.battleRadius;
            monster.setAttackAnimation(MonsterProfiles[data.prefab].attackAnimation);
            monster.init(this.grid, false);
            this.moveMonsterPresentationToLayers(monster);
            const isOpeningMonster = data.name === OpeningSequenceConfig.targetMonsterName;
            if (isOpeningMonster) {
                this.openingMonster = monster;
                if (this.openingSequenceActive) {
                    monster.node.active = false;
                    monster.setPresentationActive(false);
                }
            }
            this.monsters.push(monster);
            this.updateMonsterViewportVisibilityFor(monster);
            if (!isOpeningMonster || !this.openingSequenceActive) {
                spawnFadeTasks.push(new Promise(resolve => {
                    monster.playSpawnFade(MonsterSpawnConfig.fadeDuration, () => {
                        monster.activateOnGrid();
                        resolve();
                    });
                }));
            }
            if (!highestMonster || monster.power > highestMonster.power) highestMonster = monster;
            if (data.name === 'monster1') this.finalMonster = monster;
            if (data.name === MonsterGuideConfig.targetMonsterName) this.startMonsterGuide(monster);
        }
        if (!this.finalMonster) this.finalMonster = highestMonster;
        if (!this.openingMonster) this.openingMonster = highestMonster;
        await Promise.all(spawnFadeTasks);
    }

    private startMonsterViewportCulling(): void {
        if (!MonsterViewportCullingConfig.enabled) return;
        this.updateMonsterViewportVisibility();
        this.schedule(
            this.updateMonsterViewportVisibility,
            Math.max(0.05, MonsterViewportCullingConfig.checkInterval),
        );
    }

    private updateMonsterViewportVisibility = (): void => {
        for (const monster of this.monsters) {
            this.updateMonsterViewportVisibilityFor(monster);
        }
    };

    private updateMonsterViewportVisibilityFor(monster: Monster): void {
        if (!this.camera || !monster || !monster.node || !monster.node.isValid) return;
        const forceVisible = monster === this.activeBattleMonster
            || monster === this.glowingMonster
            || monster === this.finisherMonster
            || (this.openingSequenceActive && monster === this.openingMonster);
        if (forceVisible) {
            monster.setViewportVisible(true);
            return;
        }

        const screenPosition = this.camera.worldToScreen(monster.node.worldPosition);
        const visibleSize = view.getVisibleSizeInPixel();
        const padding = monster.isViewportVisible()
            ? MonsterViewportCullingConfig.exitPadding
            : MonsterViewportCullingConfig.enterPadding;
        const visible = screenPosition.x >= -padding
            && screenPosition.x <= visibleSize.width + padding
            && screenPosition.y >= -padding
            && screenPosition.y <= visibleSize.height + padding;
        monster.setViewportVisible(visible);
    }

    private startOpeningSequence(monster: Monster): void {
        if (!this.openingSequenceActive || this.openingIntroStarted) return;
        this.openingIntroStarted = true;
        GameManager.openingSequenceShownOnce = true;
        if (this.camera) {
            const follow = this.camera.getComponent(CameraFollow) || this.camera.addComponent(CameraFollow);
            follow.target = null;
            follow.snapToWorldPosition(monster.node.worldPosition);
        }
        AudioManager.playShout();
        monster.playOnceThenIdle(OpeningSequenceConfig.monsterIntroAnimation, () => {
            this.scheduleOnce(() => {
                this.openingAnimationComplete = true;
                this.tryMoveOpeningCameraToPlayer();
            }, Math.max(0, OpeningSequenceConfig.cameraMoveDelay));
        });
    }

    private tryMoveOpeningCameraToPlayer(): void {
        if (!this.openingSequenceActive || !this.openingAnimationComplete || this.openingCameraMoving) return;
        if (!this.camera || !this.player || !this.player.node.isValid) return;

        this.openingCameraMoving = true;
        const follow = this.camera.getComponent(CameraFollow) || this.camera.addComponent(CameraFollow);
        follow.target = null;
        follow.moveToWorldPosition(
            this.player.node.worldPosition,
            OpeningSequenceConfig.cameraMoveDuration,
            () => {
                if (!this.player || !this.player.node.isValid) return;
                this.openingSequenceActive = false;
                this.openingCameraMoving = false;
                follow.target = this.player.node;
                const guideMonster = this.pendingGuideMonster;
                this.pendingGuideMonster = null;
                if (guideMonster && guideMonster.node && guideMonster.node.isValid) {
                    this.startMonsterGuide(guideMonster);
                }
            },
        );
    }

    private setupMonsterRenderLayers(): void {
        this.monsterColorLayer = this.node.getChildByName('MonstersColor');
        this.monsterLabelLayer = this.node.getChildByName('MonstersLabel');
        if (!this.monsterColorLayer || !this.monsterLabelLayer) {
            console.warn('[GameManager] MonstersColor or MonstersLabel layer is missing');
            return;
        }

        // 身体先画，所有底图连续绘制，最后连续绘制数字。
        this.monsterColorLayer.setSiblingIndex(this.node.children.length - 1);
        this.monsterLabelLayer.setSiblingIndex(this.node.children.length - 1);
    }

    private moveMonsterPresentationToLayers(monster: Monster): void {
        if (!this.monsterColorLayer || !this.monsterLabelLayer) return;
        if (!monster.movePresentationToLayers(this.monsterColorLayer, this.monsterLabelLayer)) {
            console.warn(`[GameManager] split monster presentation failed: ${monster.node.name}`);
        }
    }

    /** 启动时从 baoxiang bundle 加载初始宝箱。 */
    private async spawnInitialChest(): Promise<void> {
        const boxLayer = this.node.getChildByName('boxLayer');
        const grid = this.grid;
        if (!boxLayer || !grid) return;

        // 场景中旧的预制体实例仅用于保留编辑器结构，运行时由 bundle 版本替换。
        for (const child of boxLayer.children) {
            child.active = false;
        }

        try {
            const box = await PrefabManager.createBox();
            box.name = 'box';
            //box.setPosition(-507, -20, 0);
            box.setPosition(-285, 85, 0);
            boxLayer.addChild(box);

            const chest = box.getComponent(Chest) || box.addComponent(Chest);
            chest.init(grid);
        } catch (err) {
            console.error('[GameManager] load box prefab failed', err);
        }
    }

    /** 在旧宝箱位置放力量套道具，拾取触发方式复用宝箱占格逻辑。 */
    private async spawnPowerSuit(): Promise<void> {
        const boxLayer = this.node.getChildByName('boxLayer');
        const grid = this.grid;
        if (!boxLayer || !grid) return;

        try {
            const node = await PrefabManager.createPowerSuit();
            node.setPosition(-507, -40, 0);
            node.setScale(0.3, 0.3, 1);
            boxLayer.addChild(node);

            const chest = node.getComponent(Chest) || node.getComponentInChildren(Chest);
            if (!chest) {
                console.error('[GameManager] power suit prefab missing Chest component');
                return;
            }
            chest.init(grid);
            this.powerSuitChest = chest;
        } catch (err) {
            console.error('[GameManager] load power suit prefab failed', err);
        }
    }

    /** 拾取宝箱 / 力量套：共用宝箱占格触发，奖励逻辑按节点区分。 */
    private openChest(chest: Chest): void {
        if (!this.player) return;
        // 和打怪一样：开箱后绿线消失
        if (this.pathLine) this.pathLine.clear();
        // 不限战力，直接加
        this.player.power += chest.power;
        this.player.setDisplayedPower(this.player.getDisplayedPower() + chest.power);
        // 宝箱消失
        if (this.grid) this.grid.removeChest(chest);
        if (chest.node) chest.node.active = false;
        AudioManager.playLevelUp();
        if (chest === this.powerSuitChest || chest.node.name === 'PowerSuit') {
            this.powerSuitChest = null;
            this.switchPlayerRole('role2');
        } else {
            this.switchPlayerRole('role1');
        }
    }

    /** 把当前角色替换成指定形态：位置、战力、朝向保留。 */
    private switchPlayerRole(roleType: 'role1' | 'role2'): void {
        if (!this.player || !this.grid) return;
        const container = this.node.getChildByName('Player');
        if (!container) return;
        const old = this.player;
        const pos = old.node.position.clone();
        const power = old.power;
        const displayedPower = old.getDisplayedPower();
        const facingDir = old.getFacing();
        const cell = this.grid.worldToGrid(pos) || new Vec2(old.gridCol, old.gridRow);
        old.node.destroy();

        let node: Node;
        try {
            node = roleType === 'role2' ? PrefabManager.createRole2() : PrefabManager.createRole1();
        } catch (err) {
            console.error(`[GameManager] create ${roleType} prefab failed`, err);
            return;
        }
        node.name = 'PlayerInstance';
        this.applyConfiguredPlayerScale(node, roleType);
        const label = node.getComponentInChildren(Label);
        if (label) label.string = String(displayedPower);
        container.addChild(node);
        this.playRoleUpgradeEffect(node, PlayerRoleProfiles[roleType].upgradeEffectAnimation);

        const player = node.addComponent(Player);
        player.init(power, cell.x, cell.y, this.grid, displayedPower);
        player.setInitialFacing(facingDir);
        this.bindPlayerEvents(player);
        this.applyPlayerRoleProfile(player, roleType);
        this.player = player;
        this.assignCameraTarget();
        this.tryMoveOpeningCameraToPlayer();
        AudioManager.playCheer();
    }

    private applyPlayerRoleProfile(player: Player, roleType: PlayerRoleType): void {
        const profile = PlayerRoleProfiles[roleType];
        this.playerRoleType = roleType;
        player.setAttackProfile(
            profile.attackAnimation,
            profile.attackSound,
            profile.attackSoundDelay,
            profile.attackImpactDelay,
        );
        if (profile.introAnimation) player.playSkillOnce(profile.introAnimation);
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

    private buildUI(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        this.uiLayer = canvas.getChildByName('UILayer');
        if (!this.uiLayer) return;
        this.guideNode = this.uiLayer.getChildByName('yindao');
        this.hideGuideNode();
    }

    // ---------------- 输入 ----------------

    private onTouchStart(event: EventTouch): void {
        if (this.openingSequenceActive) return;
        if (this.stopMonsterGuide()) return;
        if (!this.grid || !this.player || this.player.dead || this.battling || this.player.isInteracting()) return;
        if (this.isTouchOnUI(event)) return;

        const cell = this.getTouchCell(event);
        if (!cell) {
            this.hideMonsterGlow();
            return;
        }

        const clickedMonster = this.grid.getMonsterAt(cell.x, cell.y);
        if (clickedMonster) this.showMonsterGlow(clickedMonster);
        else this.hideMonsterGlow();
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.openingSequenceActive) return;
        if (!this.grid || !this.player || this.player.dead || this.battling || this.player.isInteracting()) {
            this.hideMonsterGlowLater();
            return;
        }
        if (this.isTouchOnUI(event)) {
            this.hideMonsterGlowLater();
            return;
        }

        const cell = this.getTouchCell(event);
        this.hideMonsterGlowLater();
        if (!cell) return;

        this.handleMoveTouch(cell);
    }

    private onTouchCancel(): void {
        this.hideMonsterGlow();
    }

    private isTouchOnUI(event: EventTouch): boolean {
        const target = event.target;
        return !!(target && target instanceof Node && this.uiLayer && target.isChildOf(this.uiLayer));
    }

    private getTouchCell(event: EventTouch): Vec2 | null {
        if (!this.grid) return null;
        const screenPos = event.getLocation();
        const worldPos = this.camera
            ? this.camera.screenToWorld(new Vec3(screenPos.x, screenPos.y, 0))
            : new Vec3(screenPos.x, screenPos.y, 0);
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos);
        return this.grid.worldToGrid(local);
    }

    private handleMoveTouch(cell: Vec2): void {
        if (!this.grid || !this.player) return;
        const startCell = this.grid.worldToGrid(this.player.node.position) || new Vec2(this.player.gridCol, this.player.gridRow);
        const result = this.grid.findPath(startCell, cell);
        if (!result) return;

        const movePath = this.grid.buildMovePath(startCell, result.path, this.player.node.position.clone());
        const monsterHit = this.grid.firstMonsterOnPath(movePath);
        if (monsterHit) {
            const roleProfile = PlayerRoleProfiles[this.playerRoleType];
            const distanceOverride = monsterHit.monster === this.finalMonster
                ? undefined
                : roleProfile.normalMonsterBattleDistance;
            const battlePath = this.grid.buildBattleApproachPath(
                this.player.node.position,
                monsterHit,
                distanceOverride,
            );
            if (battlePath) {
                if (this.pathLine) this.pathLine.drawPath(movePath, movePath[movePath.length - 1]);
                this.player.moveTo(battlePath, monsterHit.monster);
                return;
            }
        }
        if (this.pathLine) this.pathLine.drawPath(movePath, movePath[movePath.length - 1]);
        this.player.moveTo(movePath, result.blockMonster);
    }

    private startMonsterGuide(monster: Monster): void {
        if (this.openingSequenceActive) {
            this.pendingGuideMonster = monster;
            return;
        }
        if (this.monsterGuideDismissed || this.monsterGuideActive) return;
        this.monsterGuideActive = true;
        const guideNode = this.getGuideNode();
        if (guideNode) {
            guideNode.active = true;
            const skeleton = guideNode.getComponent(sp.Skeleton)
                || guideNode.getComponentInChildren(sp.Skeleton);
            if (skeleton) skeleton.setAnimation(0, MonsterGuideConfig.animationName, true);
        }
        this.showMonsterGlow(monster);
    }

    private stopMonsterGuide(): boolean {
        if (this.monsterGuideDismissed && !this.monsterGuideActive) return false;
        const wasActive = this.monsterGuideActive;
        this.monsterGuideDismissed = true;
        this.monsterGuideActive = false;
        this.hideGuideNode();
        if (wasActive) this.hideMonsterGlow();
        return wasActive;
    }

    private getGuideNode(): Node | null {
        if (this.guideNode && this.guideNode.isValid) return this.guideNode;
        if (!this.uiLayer) this.buildUI();
        this.guideNode = this.uiLayer ? this.uiLayer.getChildByName('yindao') : null;
        return this.guideNode;
    }

    private hideGuideNode(): void {
        const guideNode = this.guideNode;
        if (!guideNode || !guideNode.isValid) return;
        const skeleton = guideNode.getComponent(sp.Skeleton)
            || guideNode.getComponentInChildren(sp.Skeleton);
        if (skeleton) skeleton.clearTracks();
        guideNode.active = false;
    }

    // ---------------- 战斗（需�?4/12/13/14�?----------------

    private doBattle(monster: Monster): void {
        if (!this.player || this.battling) return;
        this.hideMonsterGlow();
        this.battling = true;
        this.activeBattleMonster = monster;
        monster.setViewportVisible(true);
        if (this.pathLine) this.pathLine.clear();
        this.player.faceToWorldX(monster.node.worldPosition.x);
        monster.faceToWorldX(this.player.node.worldPosition.x);
        const win = this.player.power > monster.power;
        const rewardPower = monster.power;
        let monsterHidden = false;
        const hideMonster = () => {
            if (monsterHidden) return;
            monsterHidden = true;
            monster.setPresentationActive(false);
            if (monster.node) {
                monster.node.active = false;
            }
            if (this.activeBattleMonster === monster) this.activeBattleMonster = null;
            if (monster === this.finalMonster) this.showVictoryUI();
        };
        if (win) {
            const isFinalMonster = monster === this.finalMonster;
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
                this.startExpOrbDrop(monster, () => this.enqueuePlayerPowerGain(rewardPower));
            };
            if (isFinalMonster) {
                this.playFinalMonsterAttackSequence(
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
            this.startPlayerPowerLossTick();
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

    /** 按配置连续攻击最终 Boss；每次命中都分段降低 Boss 显示数字。 */
    private playFinalMonsterAttackSequence(
        monster: Monster,
        originalPower: number,
        onFinalImpactResolved: () => void,
        onComplete: () => void,
    ): void {
        const player = this.player;
        const attackCount = Math.max(1, Math.floor(FinalBossBattleConfig.attackCount));
        if (!player) {
            monster.setLabelText('0');
            onFinalImpactResolved();
            onComplete();
            return;
        }

        monster.playAttackLoop();
        const bossAttackSoundDelay = Math.max(0, MonsterProfiles.monster1.firstAttackSoundDelay || 0);
        if (bossAttackSoundDelay > 0) {
            this.scheduleOnce(() => AudioManager.playBossAttack(), bossAttackSoundDelay);
        } else {
            AudioManager.playBossAttack();
        }
        let hitIndex = 0;
        let displayedPower = originalPower;
        if (this.finisherDeathTimer !== null) {
            clearTimeout(this.finisherDeathTimer);
            this.finisherDeathTimer = null;
        }

        const playNextAttack = () => {
            hitIndex++;
            let attackComplete = false;
            let powerDropComplete = false;
            let powerDropStarted = false;
            let deathDelayComplete = hitIndex < attackCount;
            let finalImpactResolved = hitIndex < attackCount;
            let attackAdvanced = false;

            const continueSequence = () => {
                if (attackAdvanced || !attackComplete || !powerDropComplete) return;
                if (hitIndex >= attackCount) {
                    if (!finalImpactResolved) return;
                    attackAdvanced = true;
                    onComplete();
                } else {
                    attackAdvanced = true;
                    this.fadeInFinalBossMask(playNextAttack);
                }
            };
            const tryResolveFinalImpact = () => {
                if (finalImpactResolved || !deathDelayComplete || !powerDropComplete) return;
                finalImpactResolved = true;
                onFinalImpactResolved();
                continueSequence();
            };
            const onAttackSound = () => {
                if (powerDropStarted) return;
                powerDropStarted = true;
                if (hitIndex >= attackCount) this.playFinalBossHitStop(player, monster);
                const remainingHits = attackCount - hitIndex;
                const targetPower = remainingHits <= 0
                    ? 0
                    : Math.ceil(originalPower * remainingHits / attackCount);
                this.animateMonsterPowerDrop(monster, displayedPower, targetPower, () => {
                    displayedPower = targetPower;
                    powerDropComplete = true;
                    if (hitIndex >= attackCount) tryResolveFinalImpact();
                    continueSequence();
                });
            };

            if (hitIndex >= attackCount) {
                this.scheduleFinalBossSlowMotion(player, monster);
                const heHaDelay = Math.max(0, FinalBossBattleConfig.finisherHeHaDelay);
                if (heHaDelay > 0) this.scheduleOnce(() => AudioManager.playHeHa(), heHaDelay);
                else AudioManager.playHeHa();
                const deathDelay = Math.max(0, FinalBossBattleConfig.finisherDeathDelay);
                if (deathDelay === 0) {
                    deathDelayComplete = true;
                } else {
                    this.finisherDeathTimer = setTimeout(() => {
                        this.finisherDeathTimer = null;
                        deathDelayComplete = true;
                        tryResolveFinalImpact();
                    }, deathDelay * 1000);
                }
            }
            const roleProfile = PlayerRoleProfiles[this.playerRoleType];
            const attackAnimation = roleProfile.bossAttackAnimations?.[hitIndex - 1]
                || roleProfile.attackAnimation;
            const soundDelay = hitIndex >= attackCount
                ? FinalBossBattleConfig.finisherAttackSoundDelay
                : roleProfile.attackSoundDelay;
            player.playAttackAnimation(attackAnimation, () => {
                attackComplete = true;
                continueSequence();
            }, undefined, onAttackSound, soundDelay);
        };

        playNextAttack();
    }

    private fadeInFinalBossMask(onComplete: () => void): void {
        const opacity = this.finalBossMaskNode?.getComponent(UIOpacity);
        if (!opacity) {
            onComplete();
            return;
        }
        this.startFinalBossCameraZoom();
        opacity.opacity = 0;
        const duration = Math.max(0, FinalBossBattleConfig.maskFadeInDuration);
        if (duration === 0) {
            opacity.opacity = 255;
            onComplete();
            return;
        }
        tween(opacity)
            .to(duration, { opacity: 255 })
            .call(onComplete)
            .start();
    }

    private startFinalBossCameraZoom(): void {
        if (!this.camera) return;
        if (this.finalBossCameraOrthoHeight === null) {
            this.finalBossCameraOrthoHeight = this.camera.orthoHeight;
        }
        const targetHeight = this.finalBossCameraOrthoHeight
            * Math.max(0.01, FinalBossBattleConfig.maskCameraZoomScale);
        const duration = Math.max(0, FinalBossBattleConfig.maskCameraZoomDuration);
        const follow = this.camera.getComponent(CameraFollow);
        if (follow && this.finalBossCameraOffsetX === null) {
            this.finalBossCameraOffsetX = follow.targetOffsetX;
        }
        const targetOffsetX = (this.finalBossCameraOffsetX || 0)
            + FinalBossBattleConfig.maskCameraOffsetX;
        if (duration === 0) {
            this.camera.orthoHeight = targetHeight;
            if (follow) follow.setTargetOffsetX(targetOffsetX, true);
            return;
        }
        tween(this.camera)
            .to(duration, { orthoHeight: targetHeight }, { easing: 'quadOut' })
            .start();
        if (follow) {
            tween(follow)
                .to(duration, { targetOffsetX }, { easing: 'quadOut' })
                .start();
        }
    }

    private restoreFinalBossCameraZoom(): void {
        if (!this.camera) return;
        if (this.finalBossCameraOrthoHeight !== null) {
            this.camera.orthoHeight = this.finalBossCameraOrthoHeight;
            this.finalBossCameraOrthoHeight = null;
        }
        const follow = this.camera.getComponent(CameraFollow);
        if (follow && this.finalBossCameraOffsetX !== null) {
            follow.setTargetOffsetX(this.finalBossCameraOffsetX, true);
            this.finalBossCameraOffsetX = null;
        }
    }

    private scheduleFinalBossSlowMotion(player: Player, monster: Monster): void {
        this.clearFinalBossCinematicTimers();
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const delay = Math.max(0, FinalBossBattleConfig.finisherSlowStartDelay);
        if (delay === 0) {
            this.startFinalBossSlowMotion(player, monster);
            return;
        }
        this.finisherSlowStartTimer = setTimeout(() => {
            this.finisherSlowStartTimer = null;
            this.startFinalBossSlowMotion(player, monster);
        }, delay * 1000);
    }

    private startFinalBossSlowMotion(player: Player, monster: Monster): void {
        this.clearFinalBossCinematicTimers();
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const scheduler = director.getScheduler();
        const scale = Math.max(0.01, FinalBossBattleConfig.finisherSlowScale);
        scheduler.setTimeScale(scale);
        player.setAnimationTimeScale(scale);
        monster.setAnimationTimeScale(scale);
        this.finisherSlowTimer = setTimeout(() => {
            this.finisherSlowTimer = null;
            scheduler.setTimeScale(1);
            this.restoreFinalBossAnimationTimeScale();
        }, Math.max(0, FinalBossBattleConfig.finisherSlowDuration) * 1000);
    }

    private playFinalBossHitStop(player: Player, monster: Monster): void {
        if (this.finisherSlowTimer !== null) {
            clearTimeout(this.finisherSlowTimer);
            this.finisherSlowTimer = null;
        }
        if (this.finisherHitStopTimer !== null) {
            clearTimeout(this.finisherHitStopTimer);
            this.finisherHitStopTimer = null;
        }
        this.finisherPlayer = player;
        this.finisherMonster = monster;
        const scheduler = director.getScheduler();
        scheduler.setTimeScale(0);
        player.setAnimationTimeScale(0);
        monster.setAnimationTimeScale(0);
        this.finisherHitStopTimer = setTimeout(() => {
            this.finisherHitStopTimer = null;
            scheduler.setTimeScale(1);
            this.restoreFinalBossAnimationTimeScale();
        }, Math.max(0, FinalBossBattleConfig.finisherHitStopDuration) * 1000);
    }

    private clearFinalBossCinematicTimers(): void {
        if (this.finisherSlowStartTimer !== null) {
            clearTimeout(this.finisherSlowStartTimer);
            this.finisherSlowStartTimer = null;
        }
        if (this.finisherSlowTimer !== null) {
            clearTimeout(this.finisherSlowTimer);
            this.finisherSlowTimer = null;
        }
        if (this.finisherHitStopTimer !== null) {
            clearTimeout(this.finisherHitStopTimer);
            this.finisherHitStopTimer = null;
        }
    }

    private restoreGameTimeScale(): void {
        this.clearFinalBossCinematicTimers();
        if (this.finisherDeathTimer !== null) {
            clearTimeout(this.finisherDeathTimer);
            this.finisherDeathTimer = null;
        }
        director.getScheduler().setTimeScale(1);
        this.restoreFinalBossAnimationTimeScale();
    }

    private restoreFinalBossAnimationTimeScale(): void {
        if (this.finisherPlayer && this.finisherPlayer.node && this.finisherPlayer.node.isValid) {
            this.finisherPlayer.setAnimationTimeScale(1);
        }
        if (this.finisherMonster && this.finisherMonster.node && this.finisherMonster.node.isValid) {
            this.finisherMonster.setAnimationTimeScale(1);
        }
    }

    private animateMonsterPowerDrop(
        monster: Monster,
        startPower: number,
        targetPower: number,
        onComplete: () => void,
    ): void {
        const steps = Math.max(1, Math.floor(FinalBossBattleConfig.powerDropSteps));
        const interval = Math.max(0, FinalBossBattleConfig.powerDropStepInterval);
        if (steps === 1 || interval === 0) {
            monster.setLabelText(String(targetPower));
            onComplete();
            return;
        }

        let step = 0;
        const tick = () => {
            step++;
            const power = step >= steps
                ? targetPower
                : Math.round(startPower + (targetPower - startPower) * step / steps);
            monster.setLabelText(String(power));
            if (step >= steps) onComplete();
        };
        this.schedule(tick, interval, steps - 1);
    }

    private showMonsterGlow(monster: Monster): void {
        if (!this.glowHolder || !monster.node || !monster.node.isValid) return;
        this.hideMonsterGlow();
        const spineNode = monster.getSpineNode();
        if (!spineNode) return;
        const snapshot = this.glowHolder.getComponent('Snapshot') as any;
        if (!snapshot || !this.syncMonsterGlowBounds(spineNode, snapshot)) return;

        this.glowingMonster = monster;
        snapshot.target = spineNode;
        this.glowHolder.active = true;
    }

    private hideMonsterGlow(): void {
        if (this.hideGlowTask) {
            this.unschedule(this.hideGlowTask);
            this.hideGlowTask = null;
        }
        if (this.glowHolder) this.glowHolder.active = false;
        const snapshot = this.glowHolder ? this.glowHolder.getComponent('Snapshot') as any : null;
        if (snapshot) snapshot.target = null;
        this.glowingMonster = null;
    }

    /** 共用一张紧贴目标 Spine 的正方形 RenderTexture，避免固定大画布。 */
    private syncMonsterGlowBounds(spineNode: Node, snapshot: any): boolean {
        if (!this.glowHolder || !this.glowHolder.parent) return false;
        const overlayTransform = this.glowHolder.parent.getComponent(UITransform);
        const glowTransform = this.glowHolder.getComponent(UITransform);
        if (!overlayTransform || !glowTransform) return false;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const localPoint = new Vec3();

        const collect = (node: Node) => {
            const ui = node.getComponent(UITransform);
            if (ui) {
                const left = -ui.anchorX * ui.width;
                const right = (1 - ui.anchorX) * ui.width;
                const bottom = -ui.anchorY * ui.height;
                const top = (1 - ui.anchorY) * ui.height;
                const corners = [
                    new Vec3(left, bottom),
                    new Vec3(left, top),
                    new Vec3(right, bottom),
                    new Vec3(right, top),
                ];
                for (const corner of corners) {
                    overlayTransform.convertToNodeSpaceAR(ui.convertToWorldSpaceAR(corner), localPoint);
                    minX = Math.min(minX, localPoint.x);
                    minY = Math.min(minY, localPoint.y);
                    maxX = Math.max(maxX, localPoint.x);
                    maxY = Math.max(maxY, localPoint.y);
                }
            }
            for (const child of node.children) collect(child);
        };
        collect(spineNode);

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return false;
        const glowRim = this.glowHolder.getComponent('GlowRim') as any;
        const outerWidth = glowRim ? Math.max(0, Number(glowRim.outerWidth ?? glowRim._outerWidth) || 0) : 0;
        const padding = Math.max(100, outerWidth * 4);
        const side = Math.max(1, maxX - minX, maxY - minY) + padding;
        this.glowHolder.setPosition((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
        glowTransform.setAnchorPoint(0.5, 0.5);
        glowTransform.setContentSize(side, side);
        if (snapshot.updateSize) snapshot.updateSize();
        return true;
    }

    private hideMonsterGlowLater(delay = 0.3): void {
        if (!this.glowingMonster || !this.glowingMonster.node || !this.glowingMonster.node.isValid) return;
        if (this.hideGlowTask) this.unschedule(this.hideGlowTask);
        this.hideGlowTask = () => this.hideMonsterGlow();
        this.scheduleOnce(this.hideGlowTask, delay);
    }

    /** 经验球全部吸收后，把已生效的逻辑战力滚动到显示数字。 */
    private enqueuePlayerPowerGain(gain: number): void {
        if (gain <= 0) return;
        this.pendingPowerGain += gain;
        if (this.powerGainAnimating) return;
        this.playNextPowerGain();
    }

    private playNextPowerGain(): void {
        const player = this.player;
        if (!player || this.pendingPowerGain <= 0) {
            this.powerGainAnimating = false;
            return;
        }
        const gain = this.pendingPowerGain;
        this.pendingPowerGain = 0;
        this.powerGainAnimating = true;
        const startPlayerPower = player.getDisplayedPower();
        const targetPower = startPlayerPower + gain;
        const steps = 10;
        let step = 0;

        this.onPowerTick = () => {
            step++;
            const currentPlayer = this.player;
            if (!currentPlayer) return;
            const displayedPower = step >= steps
                ? targetPower
                : startPlayerPower + Math.round(gain * step / steps);
            currentPlayer.setDisplayedPower(displayedPower);
            if (step >= steps) {
                this.unschedule(this.onPowerTick!);
                this.onPowerTick = null;
                this.powerGainAnimating = false;
                this.playNextPowerGain();
            }
        };
        this.schedule(this.onPowerTick, 0.03, steps - 1);
    }

    /** 失败流程保留角色三段下降，但怪物数字始终保持原值。 */
    private startPlayerPowerLossTick(): void {
        const player = this.player;
        if (!player) return;
        const startPlayerPower = player.power;
        let step = 0;

        this.onPowerTick = () => {
            step++;
            player.power = Math.max(0, startPlayerPower - Math.round(startPlayerPower * step / 3));
            player.setDisplayedPower(player.power);
            if (step >= 3) {
                this.unschedule(this.onPowerTick!);
                this.onPowerTick = null;
            }
        };
        this.schedule(this.onPowerTick, 0.2, 2);
    }

    /** 角色死亡：显示失败面板。 */
    private showDeathUI(): void {
        this.lockResultState();

        if (!this.uiLayer || this.failPanel) return;
        AudioManager.stopBgm();
        AudioManager.playFail();
        let panel: Node;
        try {
            panel = PrefabManager.createFail();
        } catch (err) {
            console.error('[GameManager] create fail prefab failed', err);
            return;
        }

        panel.name = 'FailPanel';
        this.uiLayer.addChild(panel);
        const failPanel = panel.addComponent(FailPanel);
        failPanel.play(this.camera ? this.camera.node : null);
        this.failPanel = panel;
    }

    /** 打败最终怪物：显示胜利面板。 */
    private showVictoryUI(): void {
        this.lockResultState();
        if (!this.uiLayer || this.victoryPanel) return;
        AudioManager.stopBgm();
        AudioManager.playVictory();
        let panel: Node;
        try {
            panel = PrefabManager.createVictory();
        } catch (err) {
            console.error('[GameManager] create victory prefab failed', err);
            return;
        }

        panel.name = 'VictoryPanel';
        this.uiLayer.addChild(panel);
        const victoryPanel = panel.addComponent(VictoryPanel);
        victoryPanel.play(this.camera ? this.camera.node : null);
        this.victoryPanel = panel;
    }

    /** 结果界面出现后统一冻结操作；胜利流程不播放角色死亡动画。 */
    private lockResultState(): void {
        this.activeBattleMonster = null;
        this.restoreFinalBossCameraZoom();
        const maskOpacity = this.finalBossMaskNode?.getComponent(UIOpacity);
        if (maskOpacity) maskOpacity.opacity = 0;
        this.stopMonsterGuide();
        this.hideMonsterGlow();
        if (this.pathLine) this.pathLine.clear();
        if (this.player) {
            this.player.stop();
            this.player.dead = true;
        }
        const follow = this.camera ? this.camera.getComponent(CameraFollow) : null;
        if (follow) follow.enabled = false;
    }

    // ---------------- 工具 ----------------

    private createPlaceholder(size: number, color: Color): Node {
        const n = new Node('Placeholder');
        n.addComponent(UITransform).setContentSize(size, size);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.circle(0, 0, size / 2);
        g.fill();
        return n;
    }

}
