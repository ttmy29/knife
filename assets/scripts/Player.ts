import { _decorator, Component, Label, Node, UITransform, Vec2, Vec3, tween, Tween, sp } from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Chest } from './Chest';
import { AttackAudioType } from './config/ResourceConfig';

const { ccclass, property } = _decorator;

/** 所有角色 dodge 中 st 骨骼的 translate 关键帧。 */
const DODGE_FOLLOW_TRACK = [
    { time: 0.0667, x: -7.62, y: -0.6 },
    { time: 0.1333, x: 10.37, y: 20.47 },
    { time: 0.2333, x: 8.57, y: 39.45 },
    { time: 0.2667, x: -10.66, y: 66.81 },
    { time: 0.3, x: -15.68, y: 75.96 },
    { time: 0.3333, x: -18.05, y: 99.1 },
    { time: 0.4333, x: -5.42, y: 94.55 },
    { time: 0.5667, x: 33.46, y: 49.12 },
    { time: 0.7, x: -13.58, y: -0.63 },
    { time: 0.8, x: 0, y: 0 },
] as const;

interface DodgeFollowNode {
    node: Node;
    basePosition: Vec3;
}

export interface PlayerEvents {
    /** 移动结束；blockMonster 非空表示停在怪物面前要战斗 */
    onArrive: (blockMonster: Monster | null) => void;
    /** 兜底：直接与怪物开战 */
    onBattle: (monster: Monster) => void;
    /** 触发宝箱逻辑：所有宝箱和装备均在接触时直接触发 */
    onChest: (chest: Chest) => void;
    /** 角色攻击动画开始时播放音效 */
    onAttack?: (sound: AttackAudioType) => void;
    /** 当前攻击特效时间轴触发 event_hit。 */
    onAttackEffectHit?: (effectName: string) => void;
}

/** 角色：沿 A* 路径逐格移动；进怪前停下并回调战斗 */
@ccclass('Player')
export class Player extends Component {
    @property
    public power = 4407;

    private displayedPower = 4407;

    @property
    public moveSpeed = 350;//280

    @property
    public attackStopPadding = 0;//之前20

    public gridCol = 0;
    public gridRow = 0;
    public events: PlayerEvents | null = null;

    private grid: Grid | null = null;
    private waypoints: Vec3[] = [];
    private pathIndex = 0;
    private moving = false;
    private interacting = false;
    private pendingMonster: Monster | null = null;
    private baseScaleX = 1;
    private baseScaleY = 1;
    private baseScaleZ = 1;
    private facing = 1; // 1 朝右，-1 朝左
    private powerLabel: Label | null = null;
    private skeletons: sp.Skeleton[] = [];
    private currentAnimSkeletons: sp.Skeleton[] = [];
    private mountSkeletons: sp.Skeleton[] = [];
    private mountActive = false;
    private readonly mountSpineChildNames = ['31201', '31201_mount'];
    private readonly attackEffects = new Map<number, sp.Skeleton>();
    private activeAttackEffect: sp.Skeleton | null = null;
    private animationTimeScale = 1;
    private animName = 'idle';
    private attackAnimation = 'phyattack1';
    private attackSound: AttackAudioType = 'attack1';
    private attackSoundDelay = 0.2;
    private attackImpactDelay = 0.6;
    /** 经验球缩放脉冲乘数（不影响朝向） */
    private pulseScale = 1;
    private spineNode: Node | null = null;
    private dodgeFollowNodes: DodgeFollowNode[] = [];
    private expWhiteGlow: Node | null = null;
    private hideExpWhiteGlowTask: (() => void) | null = null;
    private readonly expWhiteGlowPadding = 80;
    /** 失败后禁止再移动 / 寻路 */
    public dead = false;

    /** 设置初始朝向（切换角色形态时保留原朝向；dir < 0 朝左） */
    setInitialFacing(dir: number): void {
        this.facing = dir < 0 ? -1 : 1;
        this.applyFacing();
    }

    getFacing(): number {
        return this.node.scale.x < 0 ? -1 : 1;
    }

    faceToWorldX(worldX: number): void {
        const selfWorldX = this.node.worldPosition.x;
        if (worldX < selfWorldX) this.setFacing(-1);
        else if (worldX > selfWorldX) this.setFacing(1);
    }

    init(power: number, col: number, row: number, grid: Grid, displayedPower?: number): void {
        // Label 是数值入口：预制体里 Label 文本就是初始战力，颜色/字号直接在编辑器改
        const label = this.node.getComponentInChildren(Label);
        if (label) {
            this.powerLabel = label;
            if (displayedPower === undefined) {
                const parsed = parseInt(label.string, 10);
                if (!isNaN(parsed) && parsed > 0) power = parsed;
            }
        }
        this.power = power;
        this.displayedPower = displayedPower === undefined ? power : displayedPower;
        this.gridCol = col;
        this.gridRow = row;
        this.grid = grid;
        // 记录预制体自身的缩放，翻转时只改 X 方向
        this.baseScaleX = Math.abs(this.node.scale.x);
        this.baseScaleY = this.node.scale.y;
        this.baseScaleZ = this.node.scale.z;
        this.facing = this.node.scale.x < 0 ? -1 : 1;
        // 角色组合骨骼只从 spine 收集；Effects 有独立动画，不能跟着播放 idle/run。
        this.spineNode = this.node.getChildByName('spine');
        this.setupDodgeFollowNodes();
        this.skeletons = this.collectPlayerSkeletons();
        this.setupAttackEffects();
        this.setupExpWhiteGlow();
        this.dead = false;
        this.applyFacing();
        this.node.setPosition(grid.gridToWorld(col, row));
        this.refreshLabel();
        this.playIdle();
    }

    refreshSpineSkeletons(): void {
        this.skeletons = this.collectPlayerSkeletons();
        this.mountSkeletons = this.collectMountSkeletons();
        this.setAnimationTimeScale(this.animationTimeScale);
        this.animName = '';
        if (this.moving) this.playRun();
        else this.playIdle();
    }

    activateMount(): void {
        if (!this.spineNode) return;

        this.mountActive = true;
        for (const childName of this.mountSpineChildNames) {
            const child = this.spineNode.getChildByName(childName);
            if (child) child.active = true;
        }
        this.mountSkeletons = this.collectMountSkeletons();
        this.syncMountAnimation(this.moving ? 'run' : 'idle');
    }

    /** 战斗后战力变化时同步头顶 Label */
    refreshLabel(): void {
        if (this.powerLabel) this.powerLabel.string = String(this.displayedPower);
    }

    getDisplayedPower(): number {
        return this.displayedPower;
    }

    setDisplayedPower(power: number): void {
        this.displayedPower = Math.max(0, Math.round(power));
        this.refreshLabel();
    }

    setAttackProfile(animation: string, sound: AttackAudioType, soundDelay: number, impactDelay: number): void {
        this.attackAnimation = animation;
        this.attackSound = sound;
        this.attackSoundDelay = Math.max(0, soundDelay);
        this.attackImpactDelay = Math.max(0, impactDelay);
    }

    setAttackEffectsGroup(groupName: string): void {
        this.setupAttackEffects(groupName);
    }

    playUpgradeEffect(animationName?: string): void {
        if (!animationName) return;
        const effectNode = this.node.getChildByName('sxsj');
        if (!effectNode) return;
        effectNode.active = true;
        const skeleton = effectNode.getComponent(sp.Skeleton)
            || effectNode.getComponentInChildren(sp.Skeleton);
        if (!skeleton) {
            effectNode.active = false;
            return;
        }

        skeleton.setCompleteListener(() => {
            skeleton.setCompleteListener(() => {});
            if (effectNode.isValid) effectNode.active = false;
        });
        skeleton.setAnimation(0, animationName, false);
    }

    setAnimationTimeScale(scale: number): void {
        this.animationTimeScale = Math.max(0, scale);
        for (const skeleton of this.skeletons) {
            if (skeleton && skeleton.isValid) skeleton.timeScale = this.animationTimeScale;
        }
        for (const skeleton of this.mountSkeletons) {
            if (skeleton && skeleton.isValid) skeleton.timeScale = this.animationTimeScale;
        }
        for (const effect of this.attackEffects.values()) {
            if (effect && effect.isValid) effect.timeScale = this.animationTimeScale;
        }
    }

    moveTo(waypoints: Vec3[], blockMonster: Monster | null): void {
        if (this.interacting) return;
        this.waypoints = waypoints;
        this.pathIndex = 0;
        this.pendingMonster = blockMonster;
        this.moving = waypoints.length > 0;
        if (this.moving) this.playRun();
        else {
            this.playIdle();
            this.dispatchArrive();
        }
    }

    isMoving(): boolean {
        return this.moving;
    }

    isInteracting(): boolean {
        return this.interacting;
    }

    /** 停止当前移动 */
    stop(): void {
        this.moving = false;
    }

    /**
     * 播放闪避并把角色根节点真实移动到新位置；闪避结束后停在落点，不返回原位。
     */
    playDodgeTo(
        target: Vec3,
        moveDuration: number,
        animationDuration: number,
        onComplete?: () => void,
    ): void {
        this.moving = false;
        this.waypoints = [];
        this.pathIndex = 0;
        this.pendingMonster = null;
        this.interruptAttackPresentation();
        this.animName = '';
        this.playAnim('dodge', false);
        this.playDodgeFollowNodes();

        const safeMoveDuration = Math.max(0, moveDuration);
        const safeAnimationDuration = Math.max(safeMoveDuration, animationDuration);
        tween(this.node)
            .to(safeMoveDuration, { position: target.clone() }, { easing: 'quadOut' })
            .call(() => {
                if (!this.grid) return;
                const cell = this.grid.worldToGrid(this.node.position);
                if (!cell) return;
                this.gridCol = cell.x;
                this.gridRow = cell.y;
            })
            .delay(safeAnimationDuration - safeMoveDuration)
            .call(() => {
                if (!this.node || !this.node.isValid || this.dead) return;
                this.animName = '';
                this.playIdle();
                if (onComplete) onComplete();
            })
            .start();
    }

    /** dodge 时跟随角色画面位移的根节点子节点，不改变它们的缩放和翻转。 */
    private setupDodgeFollowNodes(): void {
        this.dodgeFollowNodes = [];
        for (const nodeName of ['dong', 'bule', 'Label']) {
            const node = this.node.getChildByName(nodeName);
            if (!node) continue;
            this.dodgeFollowNodes.push({ node, basePosition: node.position.clone() });
        }
    }

    private playDodgeFollowNodes(): void {
        for (const follower of this.dodgeFollowNodes) {
            const { node, basePosition } = follower;
            if (!node || !node.isValid) continue;

            Tween.stopAllByTarget(node);
            node.setPosition(basePosition);

            // dodge 的位移来自 Spine 内部 st 骨骼，按相同关键帧驱动兄弟节点。
            // Spine 的 y 是画面后退方向，映射到节点局部 -x；不单独处理翻转。
            let previousTime = 0;
            const followTween = tween(node);
            for (const frame of DODGE_FOLLOW_TRACK) {
                const framePosition = new Vec3(
                    basePosition.x - frame.y,
                    basePosition.y + frame.x,
                    basePosition.z,
                );
                followTween.to(frame.time - previousTime, { position: framePosition });
                previousTime = frame.time;
            }
            followTween.start();
        }
    }

    private resetDodgeFollowNodes(): void {
        for (const follower of this.dodgeFollowNodes) {
            const { node, basePosition } = follower;
            if (!node || !node.isValid) continue;
            Tween.stopAllByTarget(node);
            node.setPosition(basePosition);
        }
    }

    /** 怪物命中时中断角色攻击，避免旧完成回调或攻击特效延续到 dodge。 */
    private interruptAttackPresentation(): void {
        for (const skeleton of this.currentAnimSkeletons) {
            if (skeleton && skeleton.isValid) skeleton.setCompleteListener(() => {});
        }
        this.hideAttackEffectsGroups();
    }

    getPathIndex(): number {
        return this.pathIndex;
    }

    // ---------------- Spine 动画 ----------------

    private playAnim(name: string, loop: boolean): void {
        const skeletons = this.skeletons || [];
        if (skeletons.length === 0) return;
        if (this.animName === name) return;
        if (name !== 'dodge') this.resetDodgeFollowNodes();
        this.animName = name;
        this.currentAnimSkeletons = [];
        for (const sk of skeletons) {
            if (!sk || !sk.isValid || !this.hasSkeletonAnimation(sk, name)) continue;
            sk.setAnimation(0, name, loop);
            this.currentAnimSkeletons.push(sk);
        }
        if (name === 'idle' || name === 'run') {
            this.syncMountAnimation(name);
        }
    }

    private collectPlayerSkeletons(): sp.Skeleton[] {
        if (!this.spineNode) return [];
        return this.spineNode
            .getComponentsInChildren(sp.Skeleton)
            .filter(skeleton => !this.isMountSkeleton(skeleton.node));
    }

    private collectMountSkeletons(): sp.Skeleton[] {
        if (!this.spineNode) return [];
        const skeletons: sp.Skeleton[] = [];
        for (const childName of this.mountSpineChildNames) {
            const child = this.spineNode.getChildByName(childName);
            if (!child || !child.activeInHierarchy) continue;
            const childSkeletons = child.getComponentsInChildren(sp.Skeleton)
                .filter(skeleton => this.isMountSkeleton(skeleton.node));
            skeletons.push(...childSkeletons);
        }
        return skeletons;
    }

    private isMountSkeleton(node: Node): boolean {
        let current: Node | null = node;
        while (current && current !== this.spineNode) {
            if (current.name === 'rider') return false;
            if (current.name === '31201') return true;
            if (current.name === '31201_mount') return true;
            current = current.parent;
        }
        return false;
    }

    private syncMountAnimation(name: 'idle' | 'run'): void {
        if (!this.mountActive) return;
        for (const skeleton of this.mountSkeletons) {
            if (!skeleton || !skeleton.isValid || !this.hasSkeletonAnimation(skeleton, name)) continue;
            skeleton.timeScale = this.animationTimeScale;
            skeleton.setAnimation(0, name, true);
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

    playIdle(): void {
        this.playAnim('idle', true);
    }

    /** 形态切换入场动画：播放一次后回到 idle。 */
    playSkillOnce(name = 'skill1', onComplete?: () => void): void {
        this.animName = '';
        this.playAnim(name, false);
        this.onceAnimComplete(() => {
            if (this.dead) return;
            if (this.moving) this.playRun();
            else this.playIdle();
            if (onComplete) onComplete();
        });
    }

    playRun(): void {
        this.playAnim('run', true);
    }

    /** 把指定动画缩放到目标时长播放，结束后恢复动画速度并继续后续演出。 */
    playAnimationOverDuration(name: string, duration: number, onComplete?: () => void): void {
        this.animName = '';
        this.playAnim(name, false);
        const targetDuration = Math.max(0, duration);
        const restoreTimeScale = this.animationTimeScale;
        if (targetDuration > 0) {
            for (const skeleton of this.currentAnimSkeletons) {
                const nativeDuration = this.getSkeletonAnimationDuration(skeleton, name);
                if (nativeDuration > 0) skeleton.timeScale = nativeDuration / targetDuration;
            }
        }
        this.scheduleOnce(() => {
            if (this.dead) return;
            this.setAnimationTimeScale(restoreTimeScale);
            if (onComplete) onComplete();
        }, targetDuration);
    }

    private getSkeletonAnimationDuration(skeleton: sp.Skeleton, name: string): number {
        const runtimeSkeleton = skeleton as unknown as {
            findAnimation?: (animationName: string) => { duration?: number } | null;
            skeletonData?: {
                getRuntimeData?: () => {
                    animations?: Array<{ name?: string; duration?: number }>;
                };
            } | null;
        };
        const directDuration = runtimeSkeleton.findAnimation?.(name)?.duration;
        const runtimeAnimation = runtimeSkeleton.skeletonData
            ?.getRuntimeData?.()
            .animations
            ?.find(animation => animation.name === name);
        const duration = directDuration ?? runtimeAnimation?.duration;
        return typeof duration === 'number' && isFinite(duration) ? Math.max(0, duration) : 0;
    }

    /** 音效、命中与动画结束分别回调，供不同战斗表现选择对应时机。 */
    playAttack(
        onComplete?: () => void,
        onImpact?: () => void,
        onSound?: () => void,
        playSound = true,
    ): void {
        this.playAttackAnimation(this.attackAnimation, onComplete, onImpact, onSound, undefined, undefined, playSound);
    }

    /** 单次覆盖攻击动画，不改变普通攻击配置。 */
    playAttackAnimation(
        animation: string,
        onComplete?: () => void,
        onImpact?: () => void,
        onSound?: () => void,
        soundDelay: number = this.attackSoundDelay,
        impactDelay: number = this.attackImpactDelay,
        playSound = true,
    ): void {
        this.playAnim(animation, false);
        this.playAttackEffect(animation);
        const playAttackSound = () => {
            if (this.events && this.events.onAttack) this.events.onAttack(this.attackSound);
            if (onSound) onSound();
        };
        if (playSound) {
            if (soundDelay > 0) this.scheduleOnce(playAttackSound, soundDelay);
            else playAttackSound();
        }
        let impacted = false;
        const triggerImpact = () => {
            if (impacted) return;
            impacted = true;
            if (onImpact) onImpact();
        };
        if (onImpact) this.scheduleOnce(triggerImpact, Math.max(0, impactDelay));
        this.onceAnimComplete(() => {
            if (onImpact) {
                this.unschedule(triggerImpact);
                triggerImpact();
            }
            if (!this.dead) this.playIdle();
            if (onComplete) onComplete();
        });
    }

    private setupAttackEffects(effectsNodeName = 'Effects'): void {
        this.attackEffects.clear();
        const effectsNode = this.node.getChildByName(effectsNodeName);
        this.hideAttackEffectsGroups();
        if (!effectsNode) return;

        for (const child of effectsNode.children) {
            const match = child.name.match(/_attack_(\d+)$/);
            const skeleton = child.getComponent(sp.Skeleton);
            if (!match || !skeleton) continue;
            this.attackEffects.set(Number(match[1]), skeleton);
            child.active = false;
        }
    }

    private hideAttackEffectsGroups(): void {
        if (this.activeAttackEffect && this.activeAttackEffect.node && this.activeAttackEffect.node.isValid) {
            this.activeAttackEffect.setEventListener(() => {});
            this.activeAttackEffect.setCompleteListener(() => {});
            this.activeAttackEffect.node.active = false;
            this.activeAttackEffect = null;
        }
        for (const child of this.node.children) {
            if (!/^Effects\d*$/.test(child.name)) continue;
            child.active = false;
        }
    }

    /** 特效与角色攻击同时启动，资源内部时间轴负责在挥刀帧显示刀光。 */
    private playAttackEffect(animation = this.attackAnimation): void {
        const match = animation.match(/phyattack(\d+)$/);
        if (!match) return;
        const effect = this.attackEffects.get(Number(match[1]));
        if (!effect || !effect.isValid || !effect.node.isValid) return;

        if (this.activeAttackEffect && this.activeAttackEffect !== effect && this.activeAttackEffect.node.isValid) {
            this.activeAttackEffect.node.active = false;
        }
        this.activeAttackEffect = effect;
        if (effect.node.parent) effect.node.parent.active = true;
        effect.timeScale = this.animationTimeScale;
        effect.node.active = true;
        let hitTriggered = false;
        effect.setEventListener((_entry, event) => {
            if (hitTriggered || typeof event === 'number' || event.data?.name !== 'event_hit') return;
            hitTriggered = true;
            if (this.events?.onAttackEffectHit) this.events.onAttackEffectHit(effect.node.name);
        });
        effect.setCompleteListener(() => {
            effect.setEventListener(() => {});
            effect.setCompleteListener(() => {});
            if (effect.node && effect.node.isValid) effect.node.active = false;
            if (effect.node.parent && effect.node.parent.isValid) effect.node.parent.active = false;
            if (this.activeAttackEffect === effect) this.activeAttackEffect = null;
        });
        effect.setAnimation(0, 'animation', false);
    }

    playDie(onComplete?: () => void): void {
        this.dead = true;
        this.playAnim('die', false);
        if (onComplete) this.onceAnimComplete(onComplete);
    }

    /** 收到经验球反馈：白光短闪 + 0.1s 缩放变 1.2，再 0.1s 恢复 */
    playExpPulse(): void {
        this.playExpWhiteGlow();
        this.pulseScale = 1;
        tween(this)
            .to(0.1, { pulseScale: 1.2 }, { easing: 'quadOut', onUpdate: () => this.applyFacing() })
            .to(0.1, { pulseScale: 1 }, { easing: 'quadIn', onUpdate: () => this.applyFacing() })
            .start();
    }

    private setupExpWhiteGlow(): void {
        this.expWhiteGlow = this.node.getChildByName('ExpWhiteGlow');
        if (!this.expWhiteGlow) return;
        this.syncExpWhiteGlowBounds();
        this.assignExpWhiteGlowTarget();
        this.expWhiteGlow.active = false;
    }

    private assignExpWhiteGlowTarget(): void {
        if (!this.expWhiteGlow || !this.spineNode) return;
        const snapshot = this.expWhiteGlow.getComponent('Snapshot') as any;
        if (snapshot) {
            snapshot.snapshotLayer = 26;
            snapshot.target = this.spineNode;
        }
    }

    private playExpWhiteGlow(): void {
        if (!this.expWhiteGlow) this.setupExpWhiteGlow();
        if (!this.expWhiteGlow || !this.spineNode) return;

        this.syncExpWhiteGlowBounds();
        this.assignExpWhiteGlowTarget();
        if (this.hideExpWhiteGlowTask) {
            this.unschedule(this.hideExpWhiteGlowTask);
            this.hideExpWhiteGlowTask = null;
        }

        this.expWhiteGlow.active = true;
        this.hideExpWhiteGlowTask = () => {
            if (this.expWhiteGlow && this.expWhiteGlow.isValid) this.expWhiteGlow.active = false;
            this.hideExpWhiteGlowTask = null;
        };
        this.scheduleOnce(this.hideExpWhiteGlowTask, 0.2);
    }

    private syncExpWhiteGlowBounds(): void {
        if (!this.expWhiteGlow || !this.spineNode) return;

        const roleUI = this.node.getComponent(UITransform);
        const glowUI = this.expWhiteGlow.getComponent(UITransform);
        if (!roleUI || !glowUI) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const temp = new Vec3();

        const collect = (node: Node) => {
            const ui = node.getComponent(UITransform);
            if (ui && node !== this.expWhiteGlow) {
                const width = ui.width;
                const height = ui.height;
                const left = -ui.anchorX * width;
                const right = (1 - ui.anchorX) * width;
                const bottom = -ui.anchorY * height;
                const top = (1 - ui.anchorY) * height;
                const corners = [
                    new Vec3(left, bottom, 0),
                    new Vec3(left, top, 0),
                    new Vec3(right, bottom, 0),
                    new Vec3(right, top, 0),
                ];
                for (const corner of corners) {
                    const world = ui.convertToWorldSpaceAR(corner);
                    roleUI.convertToNodeSpaceAR(world, temp);
                    minX = Math.min(minX, temp.x);
                    minY = Math.min(minY, temp.y);
                    maxX = Math.max(maxX, temp.x);
                    maxY = Math.max(maxY, temp.y);
                }
            }
            for (const child of node.children) collect(child);
        };
        collect(this.spineNode);

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

        const width = Math.max(1, maxX - minX + this.expWhiteGlowPadding);
        const height = Math.max(1, maxY - minY + this.expWhiteGlowPadding);
        this.expWhiteGlow.setPosition((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
        this.expWhiteGlow.setScale(this.facing < 0 ? -1 : 1, 1, 1);
        glowUI.setAnchorPoint(0.5, 0.5);
        glowUI.setContentSize(width, height);

        const snapshot = this.expWhiteGlow.getComponent('Snapshot') as any;
        if (snapshot && snapshot.updateSize) snapshot.updateSize();
    }

    private onceAnimComplete(cb: () => void): void {
        const valid: sp.Skeleton[] = [];
        const skeletons = this.currentAnimSkeletons || [];
        for (const sk of skeletons) {
            if (sk && sk.isValid) valid.push(sk);
        }
        if (valid.length === 0) {
            cb();
            return;
        }
        let done = false;
        const onComplete = () => {
            if (done) return;
            done = true;
            for (const sk of skeletons) {
                if (sk && sk.isValid) sk.setCompleteListener(() => {});
            }
            cb();
        };
        for (const sk of valid) sk.setCompleteListener(onComplete);
    }

    update(dt: number): void {
        if (this.dead || !this.moving || !this.grid) return;
        if (this.pathIndex >= this.waypoints.length) {
            this.moving = false;
            this.playIdle();
            this.dispatchArrive();
            return;
        }
        const target = this.waypoints[this.pathIndex];
        const pos = this.node.position;

        // 怪物使用脚下战斗圆的进入点；宝箱仍使用占格边缘。
        const occ = this.grid.firstOccupantOnSegment(pos, target, this.pendingMonster);
        if (occ) {
            const entry = occ.entry || this.monsterEntryPoint(occ.cell, target);
            const ex = entry.x - pos.x;
            const ey = entry.y - pos.y;
            const edist = Math.sqrt(ex * ex + ey * ey);
            const estep = this.moveSpeed * dt;
            if (edist <= estep) {
                this.node.setPosition(entry);
                this.moving = false;
                const occNode = occ.monster ? occ.monster.node : (occ.chest ? occ.chest.node : null);
                if (occNode) {
                    if (occNode.position.x < this.node.position.x) this.setFacing(-1);
                    else if (occNode.position.x > this.node.position.x) this.setFacing(1);
                }
                if (occ.monster) {
                    if (this.events && this.events.onBattle) this.events.onBattle(occ.monster);
                } else if (occ.chest) {
                    this.playIdle();
                    if (this.events && this.events.onChest) this.events.onChest(occ.chest);
                    return;
                }
            } else {
                if (ex > 0) this.setFacing(1);
                else if (ex < 0) this.setFacing(-1);
                this.node.setPosition(pos.x + (ex / edist) * estep, pos.y + (ey / edist) * estep, pos.z);
            }
            return;
        }

        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = this.moveSpeed * dt;

        if (dist <= step) {
            this.node.setPosition(target);
            const c = this.grid.worldToGrid(target);
            if (c) {
                this.gridCol = c.x;
                this.gridRow = c.y;
            }
            this.pathIndex++;
            if (this.pathIndex >= this.waypoints.length) {
                this.moving = false;
                this.playIdle();
                this.dispatchArrive();
            }
        } else {
            if (dx > 0) this.setFacing(1);
            else if (dx < 0) this.setFacing(-1);
            this.node.setPosition(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step, pos.z);
        }
    }

    /**
     * 当前线段（pos -> toward）进入怪物格的交点：停在怪物格边缘，不进入怪物格。
     * toward 是当前目标点（可能在怪物身后），用真实行进方向算交点。
     */
    private monsterEntryPoint(cell: Vec2, toward: Vec3, padding = 0): Vec3 {
        const pos = this.node.position;
        const c = this.grid!.gridToWorld(cell.x, cell.y);
        const half = this.grid!.tileSize / 2 + padding;
        const dx = toward.x - pos.x;
        const dy = toward.y - pos.y;
        let tx = Infinity;
        let ty = Infinity;
        if (dx > 0) tx = (c.x - half - pos.x) / dx;
        else if (dx < 0) tx = (c.x + half - pos.x) / dx;
        if (dy > 0) ty = (c.y - half - pos.y) / dy;
        else if (dy < 0) ty = (c.y + half - pos.y) / dy;
        const t = Math.max(0, Math.min(tx, ty));
        return new Vec3(pos.x + dx * t, pos.y + dy * t, pos.z);
    }

    private setFacing(dir: number): void {
        if (this.facing === dir) return;
        this.facing = dir;
        this.applyFacing();
    }

    private applyFacing(): void {
        this.node.setScale(
            this.baseScaleX * this.facing * this.pulseScale,
            this.baseScaleY * this.pulseScale,
            this.baseScaleZ,
        );
        // 头顶 Label 反向补偿缩放：角色镜像时文字保持正向、大小不变
        if (this.powerLabel) {
            this.powerLabel.node.setScale(
                1 / (this.baseScaleX * this.facing),
                1 / this.baseScaleY,
                1 / this.baseScaleZ,
            );
        }
    }

    private dispatchArrive(): void {
        const m = this.pendingMonster;
        this.pendingMonster = null;
        if (this.events && this.events.onArrive) this.events.onArrive(m);
    }
}
