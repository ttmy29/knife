import { Component, instantiate, Node, sp, Vec3 } from 'cc';
import { Monster } from './Monster';
import { Player } from './Player';
import { SkillConfig, SkillConfigs, SkillName } from './config/SkillConfig';
import { AudioManager } from './core/AudioManager';

interface ActiveProjectile {
    node: Node;
    targetPosition: Vec3;
    elapsed: number;
    config: SkillConfig;
    impact: () => void;
    finish: () => void;
}

/** 管理 role4 的技能解锁、当前技能选择和技能实例生命周期。 */
export class PlayerSkillController {
    private readonly unlockedSkills = new Set<SkillName>();
    private currentSkill: SkillName | null = null;
    private readonly projectiles: ActiveProjectile[] = [];
    private readonly activeInstances = new Set<Node>();
    private readonly animationBaseSpeeds = new Map<Node, number>();
    private player: Player | null = null;
    private casting = false;
    private playbackTimeScale = 1;

    constructor(
        private readonly host: Component,
        private readonly worldNode: Node,
    ) {}

    bindPlayer(player: Player): void {
        this.player = player;
        const effects = player.node.getChildByName('Effects');
        if (!effects) {
            console.warn('[PlayerSkillController] role4/Effects is missing');
            return;
        }
        effects.active = false;
        for (const name of Object.keys(SkillConfigs) as SkillName[]) {
            const template = effects.getChildByName(name);
            if (template) template.active = false;
            else console.warn(`[PlayerSkillController] Effects/${name} is missing`);
        }
    }

    unlock(name: SkillName): void {
        this.unlockedSkills.add(name);
        this.currentSkill = name;
    }

    hasUnlockedSkill(): boolean {
        return this.unlockedSkills.size > 0;
    }

    getCurrentConfig(): SkillConfig | null {
        if (!this.currentSkill || !this.unlockedSkills.has(this.currentSkill)) return null;
        return SkillConfigs[this.currentSkill];
    }

    isCasting(): boolean {
        return this.casting;
    }

    /** 同步控制技能 Spine 与飞行过程的播放速度。 */
    setPlaybackTimeScale(scale: number): void {
        this.playbackTimeScale = Math.max(0.01, scale);
        for (const instance of this.activeInstances) {
            if (!instance?.isValid) continue;
            const baseSpeed = this.animationBaseSpeeds.get(instance) ?? 1;
            for (const skeleton of instance.getComponentsInChildren(sp.Skeleton)) {
                skeleton.timeScale = baseSpeed * this.playbackTimeScale;
            }
        }
    }

    /** 始终使用最后捡到的技能；返回 false 表示尚未解锁或对应模板不可用。 */
    castCurrentSkill(
        player: Player,
        monster: Monster,
        onImpact: () => void,
        onComplete: () => void,
        isFinalBoss = false,
    ): boolean {
        if (this.isCasting()) return false;
        const config = this.getCurrentConfig();
        if (!config) return false;
        if (!this.findTemplate(player, config.effectNodeName)) return false;
        if (config.castType === 'target-area' && Math.max(1, config.segmentCount || 1) > 1) {
            return this.castSegmentedTargetArea(
                player,
                monster,
                config,
                onImpact,
                onComplete,
                isFinalBoss,
            );
        }
        const instance = this.createEffectInstance(player, config);
        if (!instance) return false;
        this.casting = true;
        if (isFinalBoss) AudioManager.playHeHa();
        AudioManager.playRoleSkill(config.id, !isFinalBoss);

        let impacted = false;
        let finished = false;
        const impact = () => {
            if (impacted) return;
            impacted = true;
            onImpact();
        };
        const finish = () => {
            if (finished) return;
            finished = true;
            this.activeInstances.delete(instance);
            this.animationBaseSpeeds.delete(instance);
            if (instance.isValid) instance.destroy();
            this.casting = false;
            onComplete();
        };

        if (config.castType === 'target-area') {
            instance.setWorldPosition(monster.node.worldPosition);
            this.playEffectAnimation(instance, config, finish);
            this.host.scheduleOnce(impact, Math.max(0, config.hitDelay || 0));
            this.host.scheduleOnce(finish, Math.max(0.01, config.forceHideTimeout));
        } else {
            const targetPosition = monster.node.worldPosition.clone();
            if (config.rotateToTarget) {
                this.rotateProjectileToTarget(instance, targetPosition, config.projectileAngleOffset || 0);
            }
            this.playEffectAnimation(instance, config);
            this.projectiles.push({
                node: instance,
                targetPosition,
                elapsed: 0,
                config,
                impact,
                finish,
            });
        }
        return true;
    }

    /** 资源默认朝右（0°），按释放点到锁定目标的向量计算完整角度。 */
    private rotateProjectileToTarget(instance: Node, targetPosition: Vec3, angleOffset: number): void {
        const start = instance.worldPosition;
        const dx = targetPosition.x - start.x;
        const dy = targetPosition.y - start.y;
        if (Math.abs(dx) <= 0.001 && Math.abs(dy) <= 0.001) return;
        instance.angle = Math.atan2(dy, dx) * 180 / Math.PI + angleOffset;
    }

    update(dt: number): void {
        for (let index = this.projectiles.length - 1; index >= 0; index--) {
            const projectile = this.projectiles[index];
            const node = projectile.node;
            if (!node || !node.isValid) {
                this.projectiles.splice(index, 1);
                projectile.finish();
                continue;
            }

            const scaledDt = Math.max(0, dt) * this.playbackTimeScale;
            projectile.elapsed += scaledDt;
            const current = node.worldPosition;
            const dx = projectile.targetPosition.x - current.x;
            const dy = projectile.targetPosition.y - current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const hitRadius = Math.max(0, projectile.config.hitRadius || 0);
            const speed = Math.max(0, projectile.config.projectileSpeed || 0);
            const step = speed * scaledDt;
            if (distance <= hitRadius || distance <= step) {
                node.setWorldPosition(projectile.targetPosition);
                this.projectiles.splice(index, 1);
                projectile.impact();
                projectile.finish();
                continue;
            }

            const maxTravelTime = Math.max(0.01, projectile.config.maxTravelTime || projectile.config.forceHideTimeout);
            if (projectile.elapsed >= maxTravelTime) {
                this.projectiles.splice(index, 1);
                projectile.finish();
                continue;
            }

            if (distance > 0.001 && step > 0) {
                node.setWorldPosition(
                    current.x + dx / distance * step,
                    current.y + dy / distance * step,
                    current.z,
                );
            }
        }
    }

    destroy(): void {
        for (const instance of this.activeInstances) {
            if (instance?.isValid) instance.destroy();
        }
        this.activeInstances.clear();
        this.animationBaseSpeeds.clear();
        this.projectiles.length = 0;
        this.player = null;
        this.currentSkill = null;
        this.casting = false;
        this.playbackTimeScale = 1;
    }

    /** 地刺从角色朝怪物方向按固定段长依次出现，最后一段不强制落在怪物位置。 */
    private castSegmentedTargetArea(
        player: Player,
        monster: Monster,
        config: SkillConfig,
        onImpact: () => void,
        onComplete: () => void,
        isFinalBoss: boolean,
    ): boolean {
        const segmentCount = Math.max(1, Math.round(config.segmentCount || 1));
        const segmentInterval = Math.max(0, config.segmentInterval || 0);
        const segmentDistance = Math.max(0, config.segmentDistance || 0);
        const start = player.node.worldPosition.clone();
        const target = monster.node.worldPosition.clone();
        const dx = target.x - start.x;
        const dy = target.y - start.y;
        const directionLength = Math.sqrt(dx * dx + dy * dy);
        const directionX = directionLength > 0.001 ? dx / directionLength : player.getFacing();
        const directionY = directionLength > 0.001 ? dy / directionLength : 0;
        let remaining = segmentCount;
        let castFinished = false;
        let impacted = false;
        this.casting = true;
        if (isFinalBoss) AudioManager.playHeHa();
        AudioManager.playRoleSkill(config.id, !isFinalBoss);

        const tryFinishCast = () => {
            if (castFinished) return;
            if (remaining > 0 || !impacted) return;
            castFinished = true;
            this.casting = false;
            onComplete();
        };

        for (let index = 0; index < segmentCount; index++) {
            const distance = (index + 1) * segmentDistance;
            this.host.scheduleOnce(() => {
                const instance = this.createEffectInstance(player, config);
                if (!instance) {
                    remaining--;
                    tryFinishCast();
                    return;
                }
                instance.setWorldPosition(
                    start.x + directionX * distance,
                    start.y + directionY * distance,
                    start.z,
                );
                let segmentFinished = false;
                const finishSegment = () => {
                    if (segmentFinished) return;
                    segmentFinished = true;
                    this.activeInstances.delete(instance);
                    this.animationBaseSpeeds.delete(instance);
                    if (instance.isValid) instance.destroy();
                    remaining--;
                    tryFinishCast();
                };
                this.playEffectAnimation(instance, config, finishSegment);
                this.host.scheduleOnce(finishSegment, Math.max(0.01, config.forceHideTimeout));
            }, index * segmentInterval);
        }

        const impactDelay = (segmentCount - 1) * segmentInterval + Math.max(0, config.hitDelay || 0);
        this.host.scheduleOnce(() => {
            if (impacted) return;
            impacted = true;
            onImpact();
            tryFinishCast();
        }, impactDelay);
        return true;
    }

    private findTemplate(player: Player, name: SkillName): Node | null {
        return player.node.getChildByName('Effects')?.getChildByName(name) || null;
    }

    private createEffectInstance(player: Player, config: SkillConfig): Node | null {
        const template = this.findTemplate(player, config.effectNodeName);
        if (!template) return null;

        const worldPosition = template.worldPosition.clone();
        const worldRotation = template.worldRotation.clone();
        const worldScale = template.worldScale.clone();
        const instance = instantiate(template);
        instance.name = `${config.id}Skill`;
        instance.active = false;
        this.worldNode.addChild(instance);
        instance.setWorldPosition(worldPosition);
        instance.setWorldRotation(worldRotation);
        instance.setWorldScale(Math.abs(worldScale.x), worldScale.y, worldScale.z);
        if (config.flipWithPlayerFacing) {
            const localScale = instance.scale;
            instance.setScale(
                Math.abs(localScale.x) * player.getFacing(),
                localScale.y,
                localScale.z,
            );
        }
        instance.active = true;
        this.activeInstances.add(instance);
        return instance;
    }

    private playEffectAnimation(instance: Node, config: SkillConfig, onComplete?: () => void): void {
        const skeletons = instance.getComponentsInChildren(sp.Skeleton);
        if (skeletons.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        let remaining = skeletons.length;
        let completed = false;
        const complete = () => {
            if (!onComplete || completed) return;
            remaining--;
            if (remaining > 0) return;
            completed = true;
            onComplete();
        };
        this.animationBaseSpeeds.set(instance, Math.max(0, config.animationSpeed));
        for (const skeleton of skeletons) {
            skeleton.timeScale = Math.max(0, config.animationSpeed) * this.playbackTimeScale;
            if (onComplete && !config.animationLoop) skeleton.setCompleteListener(complete);
            skeleton.setAnimation(0, config.animationName, config.animationLoop);
        }
    }

}
