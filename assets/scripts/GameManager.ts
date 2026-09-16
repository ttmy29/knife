import {
    _decorator, Animation, Component, Node, Graphics, sp,
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
import { PlayerSkillController } from './PlayerSkillController';
import { RewardController } from './RewardController';
import { ResultPanelController } from './ResultPanelController';
import { Level1 } from './GameConfig';
import { AudioManager } from './core/AudioManager';
import { AutoSkillController } from './AutoSkillController';
import { BattleController } from './BattleController';
import { PrefabManager } from './core/PrefabManager';
import { AttackAudioType } from './config/ResourceConfig';
import { GameAssets } from './GameAssets';
import { SkillSystemConfig } from './config/SkillConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏入口（挂�?GameWorld 节点上）�? * - �?Graphics 生成地面/墙（不需要墙预制体）
 * - 角色由预制体实例化；怪物直接在场景里摆放（Monsters 节点下）
 * - 全局点击输入 -> 寻路 -> 绿线 -> 移动 -> 战斗
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property(GameAssets)
    public gameAssets = new GameAssets();

    @property({ type: Node })
    public finalBossMaskNode: Node | null = null;

    @property({ tooltip: 'Canvas/Camera 的基础正交高度；数值越大，主画面显示范围越大。' })
    public baseCameraOrthoHeight = 1200;

    private grid: Grid | null = null;
    private player: Player | null = null;
    private pathLine: PathLine | null = null;
    private uiLayer: Node | null = null;
    private camera: Camera | null = null;
    private battle: BattleController | null = null;
    private resultPanels: ResultPanelController | null = null;
    private rewards: RewardController | null = null;
    private chests: ChestController | null = null;
    private playerRoles: PlayerRoleController | null = null;
    private playerSkills: PlayerSkillController | null = null;
    private autoSkills: AutoSkillController | null = null;
    private playerInput: PlayerInputController | null = null;
    private monsterController: MonsterController | null = null;
    private finalBossCinematic: FinalBossCinematicController | null = null;
    private monsterGlow: MonsterGlowController | null = null;
    private monsterGuide: MonsterGuideController | null = null;
    private openingSequence: OpeningSequenceController | null = null;
    private backgroundAssetsReady = false;
    private openingFinished = false;
    private readonly defeatedMonsters = new Set<Monster>();

    onLoad(): void {
        PrefabManager.init(this.gameAssets);
        AudioManager.init(this.node, this.gameAssets);
        AudioManager.playBgm();
        const canvas = this.node.parent;
        this.camera = canvas ? canvas.getComponentInChildren(Camera) : null;
        if (this.camera) this.camera.orthoHeight = this.baseCameraOrthoHeight;
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
            () => this.battle?.getActiveMonster() || null,
            () => this.finalBossCinematic?.currentFinisherMonster || null,
        );

        this.grid = this.getComponent(Grid) || this.addComponent(Grid);
        this.grid.init(Level1);
        this.openingSequence = new OpeningSequenceController(
            this.node,
            () => this.grid,
            () => this.camera,
            () => this.player,
            () => this.getPlayerSpawnLocalPosition(),
            () => this.assignCameraTarget(),
            () => {
                this.openingFinished = true;
                this.tryUnlockGameplay();
            },
        );
        this.openingSequence.init();
        this.openingSequence.prepareCameraForOpening();
        this.bakeWallRegions();

        this.buildGround();
        const skillLayer = this.node.getChildByName('TempLayer');
        if (!skillLayer) console.warn('[GameManager] GameWorld/TempLayer is missing');
        this.playerSkills = new PlayerSkillController(this, skillLayer || this.node);
        this.autoSkills = new AutoSkillController(
            () => this.grid,
            () => this.player,
            () => this.playerSkills,
            () => (this.openingSequence?.active || false)
                || !this.backgroundAssetsReady
                || (this.battle?.isBattling() || false),
            (monster) => this.defeatedMonsters.has(monster),
            () => this.monsterController?.getFinalMonster() || null,
            () => this.openingSequence?.stopHelpSounds(),
            (monster, config) => this.resolveMonsterDefeat(
                monster,
                config.monsterHitAnimation,
                config.monsterDeathAnimation,
                config.monsterImpactEffect,
                config.monsterImpactEffectAnimation,
            ),
        );
        this.playerRoles = new PlayerRoleController(
            this.node,
            () => this.grid,
            (player) => this.bindPlayerEvents(player),
            (player) => {
                this.player = player;
                this.playerSkills?.bindPlayer(player);
                this.openingSequence?.preparePlayerForOpening(player);
            },
            () => this.openingSequence?.getPlayerInitialLocalPosition() || this.getPlayerSpawnLocalPosition(),
            () => this.assignCameraTarget(),
        );
        this.battle = new BattleController(
            this,
            () => this.player,
            () => this.playerSkills,
            () => this.autoSkills,
            (monster) => this.defeatedMonsters.has(monster),
            () => this.monsterController?.getFinalMonster() || null,
            () => this.finalBossCinematic,
            () => this.playerRoles?.getCurrentPrefabRoleType() === 'role',
            () => this.monsterGlow?.hide(),
            () => this.pathLine?.clear(),
            () => this.openingSequence?.stopHelpSounds(),
            (monster, hitAnimation, deathAnimation, impactEffect, impactEffectAnimation) => {
                this.resolveMonsterDefeat(
                    monster,
                    hitAnimation,
                    deathAnimation,
                    impactEffect,
                    impactEffectAnimation,
                );
            },
            () => this.showDeathUI(),
        );
        this.rewards = new RewardController(this, this.node, () => this.player);
        this.rewards.init();
        this.chests = new ChestController(
            this.node,
            () => this.grid,
            () => this.player,
            () => this.pathLine?.clear(),
            (gain) => this.rewards?.applyImmediateDisplayedPowerGain(gain),
            (roleType) => this.playerRoles?.switchPlayerRole(this.player, roleType),
            (player, roleType, playIntro) => this.playerRoles?.applyPlayerRoleProfile(player, roleType, playIntro),
            (node, openingActive) => this.monsterGuide?.requestStartForNode(node, openingActive),
            () => (this.openingSequence?.active || false) || !this.backgroundAssetsReady,
            (name) => this.playerSkills?.unlock(name),
        );
        this.buildPathLine();
        this.monsterController.setupRenderLayers();
        this.chests.setupRenderLayers();
        this.buildUI();
        this.playerInput = new PlayerInputController(
            this.node,
            () => this.grid,
            () => this.player,
            () => this.pathLine,
            () => this.camera,
            () => this.uiLayer,
            () => this.openingSequence?.active || false,
            () => this.battle?.isBattling() || false,
            this.monsterGlow,
            () => this.monsterGuide?.dismiss() || false,
        );
        this.playerInput.init();
        this.monsterController.startViewportCulling();
        void this.loadOpeningScene();
    }


    onDestroy(): void {
        this.finalBossCinematic?.restoreAll();
        this.openingSequence?.destroy();
        this.monsterGuide?.destroy();
        this.monsterGlow?.hide();
        this.rewards?.destroy();
        this.monsterController?.destroy();
        this.playerInput?.destroy();
        this.battle?.clear();
        this.autoSkills?.destroy();
        this.playerSkills?.destroy();
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
    }

    /** 进入场景后并行预载第二批资源。 */
    private async preloadBackgroundAssets(): Promise<void> {
        const audioKeys = [
            'attack1', 'attack2', 'attack3',
            'smallAttack', 'bigAttack',
            'monsterDie', 'expCollect', 'levelUp', 'cheer',
            'heHa', 'bossAttack', 'bossDie', 'fail', 'victory',
        ] as const;
        const tasks: Promise<unknown>[] = [
            PrefabManager.loadMonster('monster3'),
            PrefabManager.loadMonster('monster4'),
            AudioManager.preload(audioKeys),
            PrefabManager.loadFail(),
            PrefabManager.loadVictory(),
            PrefabManager.loadDeadEffect(),
            PrefabManager.loadBoom(),
        ];

        await Promise.all(tasks.map(async task => {
            try {
                await task;
            } catch (err) {
                console.error('[GameManager] preload background asset failed', err);
            }
        }));
    }

    private async finishBackgroundLoading(preloadTask: Promise<void>): Promise<void> {
        await preloadTask;
        try {
            await (this.monsterController
                ? this.monsterController.spawnMonsters(['monster3', 'monster4'], false)
                : Promise.resolve());
        } catch (err) {
            console.error('[GameManager] create background scene objects failed', err);
        }
        this.backgroundAssetsReady = true;
        this.tryUnlockGameplay();
    }

    private tryUnlockGameplay(): void {
        if (!this.backgroundAssetsReady || !this.openingFinished) return;
        this.monsterGuide?.flushPending();
    }

    /** 先创建直绑场景资源并优先加载 role，再并行加载其余资源，全部完成后开始开场演出。 */
    private async loadOpeningScene(): Promise<void> {
        const loadingMaskDelay = this.openingSequence?.waitForLoadingMask() || Promise.resolve();
        const directSceneTask = Promise.all([
            this.monsterController
                ? this.monsterController.spawnMonsters(['monster1', 'monster2'])
                : Promise.resolve(),
            this.chests ? this.chests.spawnDisplayItems() : Promise.resolve(),
        ]).catch(err => {
            console.error('[GameManager] direct opening scene load failed', err);
        });
        const roleLoadingTask = this.loadStartupPrefabs();
        const backgroundLoadingTask = roleLoadingTask.then(() => {
            return this.finishBackgroundLoading(this.preloadBackgroundAssets());
        });

        await loadingMaskDelay;
        await Promise.all([directSceneTask, roleLoadingTask, backgroundLoadingTask]);
        AudioManager.playRoar();

        if (!this.openingSequence?.active) {
            this.openingFinished = true;
            this.tryUnlockGameplay();
            return;
        }
        const monster = this.monsterController?.getOpeningMonster()
            || this.monsterController?.getFinalMonster();
        if (monster && monster.node && monster.node.isValid) {
            this.openingSequence.start(monster);
            return;
        }
        this.openingSequence?.deactivate();
        this.assignCameraTarget();
        this.openingFinished = true;
        this.tryUnlockGameplay();
    }

    /** 绑定角色事件（初�?/ 切换 role1 后复用） */
    private bindPlayerEvents(player: Player): void {
        player.events = {
            onArrive: (m: Monster | null) => {
                if (this.pathLine) this.pathLine.hideTarget();
                if (m) this.battle?.start(m);
            },
            onBattle: (m: Monster) => this.battle?.start(m),
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
        this.playerSkills?.update(dt);
        this.autoSkills?.update(dt);
    }

    /** 所有攻击共用一次性击杀结算，避免同一怪物重复掉落多批经验。 */
    private resolveMonsterDefeat(
        monster: Monster,
        hitAnimation?: string,
        deathAnimation?: string,
        impactEffect?: 'boom',
        impactEffectAnimation?: string,
    ): boolean {
        if (this.defeatedMonsters.has(monster)) return false;
        const player = this.player;
        if (!player || !player.node.isValid) return false;
        this.defeatedMonsters.add(monster);
        this.autoSkills?.releaseTarget(monster);
        this.grid?.removeMonster(monster);
        player.clearPendingMonster(monster);

        const rewardPower = monster.power;
        player.power += rewardPower;
        const isFinalMonster = monster === this.monsterController?.getFinalMonster();
        if (isFinalMonster) AudioManager.playBossDie();
        else AudioManager.playMonsterDie();
        this.camera?.getComponent(CameraFollow)?.shake();

        let monsterHidden = false;
        const hideMonster = () => {
            if (monsterHidden) return;
            monsterHidden = true;
            monster.setPresentationActive(false);
            if (monster.node?.isValid) monster.node.active = false;
            this.battle?.clearActiveMonster(monster);
            if (isFinalMonster) this.showVictoryUI();
        };
        if (SkillSystemConfig.playMonsterDeathAnimation) {
            const usableHitAnimation = hitAnimation && monster.hasUsableAnimation(hitAnimation)
                ? hitAnimation
                : undefined;
            const requestedDeathIsMissing = !!deathAnimation
                && !monster.hasUsableAnimation(deathAnimation);

            // 部分怪物的 die 虽有名称但时长为 0；此时把 hitFly 直接作为死亡动画，
            // deadEffect 与 hitFly 同时开始，避免 hitFly 播放两遍或瞬间隐藏。
            if (usableHitAnimation && requestedDeathIsMissing) {
                if (impactEffect === 'boom') {
                    this.playMonsterBoomEffect(monster, impactEffectAnimation || 'molotovAttackhits');
                }
                this.playMonsterDeathEffect(monster);
                monster.playHitReaction(usableHitAnimation, hideMonster);
                this.scheduleOnce(hideMonster, SkillSystemConfig.monsterForceHideTimeout);
                this.rewards?.startExpOrbDrop(
                    monster,
                    () => this.rewards?.enqueuePlayerPowerGain(rewardPower),
                );
                return true;
            }

            let deathStarted = false;
            const startDeath = () => {
                if (deathStarted || monsterHidden) return;
                deathStarted = true;
                if (impactEffect === 'boom') {
                    this.playMonsterBoomEffect(monster, impactEffectAnimation || 'molotovAttackhits');
                }
                this.playMonsterDeathEffect(monster);
                monster.playDie(hideMonster, deathAnimation);
                this.scheduleOnce(hideMonster, SkillSystemConfig.monsterForceHideTimeout);
            };
            if (usableHitAnimation) {
                monster.playHitReaction(usableHitAnimation, startDeath);
                // 受击动画资源异常时仍继续死亡流程，避免怪物永久停留。
                this.scheduleOnce(startDeath, SkillSystemConfig.monsterForceHideTimeout);
            } else startDeath();
        } else hideMonster();
        this.rewards?.startExpOrbDrop(
            monster,
            () => this.rewards?.enqueuePlayerPowerGain(rewardPower),
        );
        return true;
    }

    /** 怪物开始 die 时，在 TempLayer 播放一次帧动画死亡特效。 */
    private playMonsterDeathEffect(monster: Monster): void {
        const tempLayer = this.node.getChildByName('TempLayer');
        if (!tempLayer || !monster.node || !monster.node.isValid) return;

        let effect: Node;
        try {
            effect = PrefabManager.createDeadEffect();
        } catch (err) {
            console.error('[GameManager] create deadEffect failed', err);
            return;
        }

        const worldPosition = monster.node.worldPosition.clone();
        worldPosition.y += SkillSystemConfig.deathEffectOffsetY;
        effect.active = false;
        tempLayer.addChild(effect);
        effect.setWorldPosition(worldPosition);
        effect.active = true;

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (effect.isValid) effect.destroy();
        };
        const animation = effect.getComponent(Animation) || effect.getComponentInChildren(Animation);
        if (!animation) {
            console.warn('[GameManager] deadEffect Animation component is missing');
            this.scheduleOnce(cleanup, 3);
            return;
        }
        animation.once(Animation.EventType.FINISHED, cleanup);
        animation.play('animation');
        this.scheduleOnce(cleanup, 3);
    }

    /** fireDao 命中死亡时，在 TempLayer 播放一次爆炸 Spine。 */
    private playMonsterBoomEffect(monster: Monster, animationName: string): void {
        const tempLayer = this.node.getChildByName('TempLayer');
        if (!tempLayer || !monster.node || !monster.node.isValid) return;

        let effect: Node;
        try {
            effect = PrefabManager.createBoom();
        } catch (err) {
            console.error('[GameManager] create boom failed', err);
            return;
        }

        const worldPosition = monster.node.worldPosition.clone();
        effect.active = false;
        tempLayer.addChild(effect);
        effect.setWorldPosition(worldPosition);
        effect.active = true;

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (effect.isValid) effect.destroy();
        };
        const skeleton = effect.getComponent(sp.Skeleton) || effect.getComponentInChildren(sp.Skeleton);
        if (!skeleton) {
            console.warn('[GameManager] boom Skeleton component is missing');
            this.scheduleOnce(cleanup, 3);
            return;
        }
        skeleton.setCompleteListener(() => {
            skeleton.setCompleteListener(() => {});
            cleanup();
        });
        skeleton.setAnimation(0, animationName, false);
        this.scheduleOnce(cleanup, 3);
    }

    private buildUI(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        this.uiLayer = canvas.getChildByName('UILayer');
        if (!this.uiLayer) return;
        this.monsterGuide?.init(this.uiLayer);
        this.resultPanels = new ResultPanelController(this.uiLayer, this.camera);
    }

    // ---------------- 战斗（需�?4/12/13/14�?----------------

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
        this.battle?.clear();
        this.finalBossCinematic?.resetForResult();
        this.monsterGuide?.dismiss();
        this.monsterGlow?.hide();
        if (this.pathLine) this.pathLine.clear();
        if (this.player) {
            this.player.stop();
            this.player.dead = true;
        }
        const follow = this.camera ? this.camera.getComponent(CameraFollow) : null;
        if (follow) follow.enabled = false;
    }

}
