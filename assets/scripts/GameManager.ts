import {
    _decorator, Component, Node, Graphics,
    Animation, Color, Vec3, Camera, director, sp, Tween,
} from 'cc';
import type { ISchedulable } from 'cc';
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
import { MonsterCombatController } from './MonsterCombatController';
import { MonsterGlowController } from './MonsterGlowController';
import { MonsterGuideController } from './MonsterGuideController';
import { MonsterDeathController } from './MonsterDeathController';
import { OpeningSequenceController } from './OpeningSequenceController';
import { PlayerInputController } from './PlayerInputController';
import { PlayerRoleController } from './PlayerRoleController';
import { PlayerSkillController } from './PlayerSkillController';
import { SkillPanelController } from './SkillPanelController';
import { SkillConfirmEffectController } from './SkillConfirmEffectController';
import { RewardController } from './RewardController';
import { ResultPanelController } from './ResultPanelController';
import { Level1 } from './GameConfig';
import { AudioManager } from './core/AudioManager';
import { AutoSkillController } from './AutoSkillController';
import { BattleController } from './BattleController';
import { DamageNumberController } from './DamageNumberController';
import { PrefabManager } from './core/PrefabManager';
import { AttackAudioType } from './config/ResourceConfig';
import { GameAssets } from './GameAssets';
import { isDamageSkill, SkillConfig } from './config/SkillConfig';
import { KillUpgradeConfigs, KillUpgradePanelEnabled } from './config/KillUpgradeConfig';

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
    private skillPanel: SkillPanelController | null = null;
    private skillConfirmEffect: SkillConfirmEffectController | null = null;
    private damageNumbers: DamageNumberController | null = null;
    private autoSkills: AutoSkillController | null = null;
    private playerInput: PlayerInputController | null = null;
    private monsterController: MonsterController | null = null;
    private monsterCombat: MonsterCombatController | null = null;
    private monsterDeaths: MonsterDeathController | null = null;
    private finalBossCinematic: FinalBossCinematicController | null = null;
    private monsterGlow: MonsterGlowController | null = null;
    private monsterGuide: MonsterGuideController | null = null;
    private openingSequence: OpeningSequenceController | null = null;
    private backgroundAssetsReady = false;
    private openingFinished = false;
    private defeatedMonsterCount = 0;
    private nextKillUpgradeIndex = 0;
    private gameplayPaused = false;
    private readonly pausedSkeletonScales = new Map<sp.Skeleton, number>();
    private readonly pausedAnimations = new Set<Animation>();
    private readonly pausedComponents: Component[] = [];
    private readonly pausedTweenNodes: Node[] = [];

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
            () => this.monsterCombat?.getActiveMonster()
                || this.battle?.getActiveMonster()
                || null,
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
        this.damageNumbers = new DamageNumberController(skillLayer || this.node);
        this.playerSkills = new PlayerSkillController(
            this,
            skillLayer || this.node,
            () => this.pathLine?.clear(),
        );
        this.autoSkills = new AutoSkillController(
            () => this.player,
            () => this.playerSkills,
            () => (this.openingSequence?.active || false)
                || !this.backgroundAssetsReady
                || (this.battle?.isBattling() || false)
                || (this.skillPanel?.isVisible() || false)
                || (this.monsterCombat?.isCounterAttacking() || false),
            (monster) => this.monsterDeaths?.isDefeated(monster) || false,
            () => this.monsterController?.getFinalMonster() || null,
            () => this.finalBossCinematic,
            () => {
                this.openingSequence?.stopHelpSounds();
                this.finalBossCinematic?.startBattleCamera();
            },
            (monster, config, damage) => this.applySkillHit(monster, config, damage),
            (monster, config) => {
                if (isDamageSkill(config)) this.monsterCombat?.beginCounterAttack(monster);
            },
            () => this.pathLine?.clear(),
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
            (monster) => this.monsterDeaths?.isDefeated(monster) || false,
            () => this.monsterController?.getFinalMonster() || null,
            () => this.finalBossCinematic,
            () => this.playerRoles?.getCurrentPrefabRoleType() === 'role',
            () => this.monsterGlow?.hide(),
            () => this.pathLine?.clear(),
            () => this.openingSequence?.stopHelpSounds(),
            (monster, hitAnimation, deathAnimation, impactEffect, impactEffectAnimation) => {
                this.monsterDeaths?.resolve(
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
        this.monsterDeaths = new MonsterDeathController(
            this,
            this.node,
            () => this.grid,
            () => this.player,
            () => this.autoSkills,
            () => this.rewards,
            () => this.camera,
            () => this.monsterController?.getFinalMonster() || null,
            (monster) => {
                this.battle?.clearActiveMonster(monster);
                this.monsterCombat?.disengage(monster);
            },
            () => this.recordMonsterDefeat(),
            () => this.showVictoryUI(),
        );
        this.monsterCombat = new MonsterCombatController(
            () => this.grid,
            () => this.player,
            (monster) => this.monsterDeaths?.isDefeated(monster) || false,
            () => this.showDeathUI(),
        );
        this.chests = new ChestController(
            this.node,
            () => this.grid,
            () => this.player,
            () => this.pathLine?.clear(),
            (gain) => this.rewards?.applyImmediateDisplayedPowerGain(gain),
            (roleType) => this.playerRoles?.switchPlayerRole(this.player, roleType),
            (player, roleType, playIntro) => this.playerRoles?.applyPlayerRoleProfile(player, roleType, playIntro),
            (node, openingActive) => this.monsterGuide?.requestStartForNode(node, openingActive),
            () => { this.monsterGuide?.dismiss(); },
            () => (this.openingSequence?.active || false) || !this.backgroundAssetsReady,
            (name) => this.playerSkills?.unlock(name),
            () => { void this.skillPanel?.show(); },
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
            () => (this.battle?.isBattling() || false)
                || (this.skillPanel?.isVisible() || false)
                || (this.skillConfirmEffect?.isPlaying() || false)
                || (this.playerSkills?.isPreparingCast() || false)
                || (this.monsterCombat?.isInputLocked() || false),
            this.monsterGlow,
            () => this.monsterGuide?.dismiss() || false,
            (monster) => {
                if (monster) {
                    const config = this.playerSkills?.getCurrentConfig();
                    if (isDamageSkill(config)) {
                        this.monsterCombat?.engage(monster);
                    } else {
                        this.monsterCombat?.disengage();
                    }
                    return this.autoSkills?.selectTarget(monster) || false;
                }
                this.autoSkills?.clearSelectedTarget();
                this.monsterCombat?.disengage();
                return false;
            },
        );
        this.playerInput.init();
        this.monsterController.startViewportCulling();
        void this.loadOpeningScene();
    }


    onDestroy(): void {
        this.setGameplayPaused(false);
        this.finalBossCinematic?.restoreAll();
        this.openingSequence?.destroy();
        this.monsterGuide?.destroy();
        this.monsterGlow?.hide();
        this.rewards?.destroy();
        this.monsterDeaths?.destroy();
        this.monsterController?.destroy();
        this.monsterCombat?.destroy();
        this.playerInput?.destroy();
        this.battle?.clear();
        this.autoSkills?.destroy();
        this.playerSkills?.destroy();
        this.skillPanel?.destroy();
        this.skillConfirmEffect?.destroy();
        this.damageNumbers?.destroy();
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
            'roleAttack', 'dianji', 'fire', 'skill1', 'skill2', 'skill3',
            'monsterDie', 'roleDie', 'expCollect', 'levelUp', 'cheer',
            'shout', 'heHa', 'bossAttack', 'bossDie', 'fail', 'victory',
        ] as const;
        const tasks: Promise<unknown>[] = [
            PrefabManager.loadMonster('monster3'),
            PrefabManager.loadMonster('monster4'),
            AudioManager.preload(audioKeys),
            PrefabManager.loadFail(),
            PrefabManager.loadVictory(),
            PrefabManager.loadBoom(),
            PrefabManager.loadBoom2(),
            PrefabManager.loadLight(),
            PrefabManager.loadConfirm(),
            PrefabManager.loadHp(),
            this.playerSkills?.preloadCastPreparationAssets() || Promise.resolve(),
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
            this.chests ? this.chests.spawnInitialChest() : Promise.resolve(),
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
        if (this.gameplayPaused) return;
        this.playerInput?.update(dt);
        this.playerSkills?.update(dt);
        this.autoSkills?.update(dt);
        if (!this.skillPanel?.isVisible()) this.monsterCombat?.update(dt);
    }

    /** 有 damage 的技能逐次扣血；旧技能继续使用一次性击杀流程。 */
    private applySkillHit(monster: Monster, config: SkillConfig, impactDamage?: number): void {
        if (isDamageSkill(config)) {
            const damage = impactDamage ?? config.damage ?? 0;
            this.damageNumbers?.show(monster, damage);
            // 已经发射的后续投射物仍显示伤害数字，但不能重复扣血或触发死亡奖励。
            if (this.monsterDeaths?.isDefeated(monster)) return;
            if (!monster.takeDamage(damage)) return;
        } else if (this.monsterDeaths?.isDefeated(monster)) {
            return;
        }
        this.monsterDeaths?.resolve(
            monster,
            config.monsterHitAnimation,
            config.monsterDeathAnimation,
            config.monsterImpactEffect,
            config.monsterImpactEffectAnimation,
        );
    }

    private buildUI(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        this.uiLayer = canvas.getChildByName('UILayer');
        if (!this.uiLayer) return;
        this.monsterGuide?.init(this.uiLayer);
        this.resultPanels = new ResultPanelController(this.uiLayer, this.camera);
        this.skillConfirmEffect = new SkillConfirmEffectController(
            this.uiLayer,
            () => this.player?.node?.worldPosition || null,
        );
        this.skillPanel = new SkillPanelController(
            this.uiLayer,
            () => this.player?.node?.worldPosition || null,
            (skill) => {
                this.pathLine?.clear();
                this.player?.cancelMovement();
                this.autoSkills?.clearSelectedTarget();
                this.monsterCombat?.disengage();
                const unlock = () => {
                    this.playerSkills?.unlock(skill);
                    this.tryShowKillUpgrade();
                };
                if (this.skillConfirmEffect) this.skillConfirmEffect.play(skill, unlock);
                else unlock();
            },
            (_skill, powerGain) => this.applyKillUpgrade(powerGain),
            (visible, pauseGameplay) => {
                if (visible && pauseGameplay) this.cancelMovementForSkillPanel();
                if (pauseGameplay || !visible) this.setGameplayPaused(visible);
                if (!visible) this.tryShowKillUpgrade();
            },
        );
    }

    /** 升级面板出现时终止未完成的移动，关闭后不恢复旧路径与旧攻击目标。 */
    private cancelMovementForSkillPanel(): void {
        this.pathLine?.clear();
        this.monsterGlow?.hide();
        const player = this.player;
        if (!player?.isMoving()) return;
        player.cancelMovement();
        this.autoSkills?.clearSelectedTarget();
        this.monsterCombat?.disengage();
    }

    private recordMonsterDefeat(): void {
        this.defeatedMonsterCount++;
        this.tryShowKillUpgrade();
    }

    private tryShowKillUpgrade(): void {
        const upgrade = KillUpgradeConfigs[this.nextKillUpgradeIndex];
        if (!upgrade || this.defeatedMonsterCount < upgrade.killCount) return;
        const skill = this.playerSkills?.getCurrentConfig()?.id;
        if (skill !== 'fireDao' && skill !== 'needle') return;
        if (KillUpgradePanelEnabled && (!this.skillPanel || this.skillPanel.isVisible())) return;
        this.nextKillUpgradeIndex++;
        if (KillUpgradePanelEnabled) void this.skillPanel?.showUpgrade(skill, upgrade.powerGain);
        else this.applyKillUpgrade(upgrade.powerGain);
    }

    private applyKillUpgrade(powerGain: number): void {
        const player = this.player;
        if (!player || !this.playerSkills?.upgradeCurrentSkillQuantity()) return;
        const gain = Math.max(0, Math.round(powerGain));
        player.power += gain;
        this.rewards?.enqueuePlayerPowerGain(gain);
        AudioManager.playLevelUp();
        player.playUpgradeEffect(this.playerRoles?.getCurrentProfile().upgradeEffectAnimation);
    }

    /** 只暂停 GameManager 负责的游戏调度和 GameWorld 内 Spine，UI 仍可正常交互。 */
    private setGameplayPaused(paused: boolean): void {
        if (this.gameplayPaused === paused) return;
        this.gameplayPaused = paused;
        const scheduler = director.getScheduler();
        if (paused) {
            this.pausedSkeletonScales.clear();
            for (const skeleton of this.node.getComponentsInChildren(sp.Skeleton)) {
                if (!skeleton?.isValid) continue;
                this.pausedSkeletonScales.set(skeleton, skeleton.timeScale);
                skeleton.timeScale = 0;
            }
            this.pausedAnimations.clear();
            for (const animation of this.node.getComponentsInChildren(Animation)) {
                if (!animation?.isValid) continue;
                const isPlaying = animation.clips.some(clip => {
                    return !!clip && animation.getState(clip.name)?.isPlaying;
                });
                if (!isPlaying) continue;
                animation.pause();
                this.pausedAnimations.add(animation);
            }
            this.pausedComponents.length = 0;
            for (const component of this.node.getComponentsInChildren(Component)) {
                if (!component?.isValid) continue;
                scheduler.pauseTarget(component as unknown as ISchedulable);
                Tween.pauseAllByTarget(component);
                this.pausedComponents.push(component);
            }
            this.pausedTweenNodes.length = 0;
            this.visitNodeTree(this.node, node => {
                Tween.pauseAllByTarget(node);
                this.pausedTweenNodes.push(node);
            });
            return;
        }

        for (const component of this.pausedComponents) {
            if (!component?.isValid) continue;
            scheduler.resumeTarget(component as unknown as ISchedulable);
            Tween.resumeAllByTarget(component);
        }
        this.pausedComponents.length = 0;
        for (const node of this.pausedTweenNodes) {
            if (node?.isValid) Tween.resumeAllByTarget(node);
        }
        this.pausedTweenNodes.length = 0;
        for (const [skeleton, timeScale] of this.pausedSkeletonScales) {
            if (skeleton?.isValid) skeleton.timeScale = timeScale;
        }
        this.pausedSkeletonScales.clear();
        for (const animation of this.pausedAnimations) {
            if (animation?.isValid) animation.resume();
        }
        this.pausedAnimations.clear();
    }

    private visitNodeTree(node: Node, visitor: (node: Node) => void): void {
        visitor(node);
        for (const child of node.children) this.visitNodeTree(child, visitor);
    }

    // ---------------- 战斗（需�?4/12/13/14�?----------------

    /** 角色死亡：显示失败面板。 */
    private showDeathUI(): void {
        this.lockResultState();
        this.resultPanels?.showFail(this.defeatedMonsterCount);
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
        this.skillPanel?.hide();
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
