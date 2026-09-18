import { Component, instantiate, Node, sp, Vec3 } from 'cc';
import { Monster } from './Monster';
import { Player } from './Player';
import { SkillConfig, SkillConfigs, SkillName } from './config/SkillConfig';
import { AudioManager } from './core/AudioManager';

interface ActiveProjectile {
    node: Node;
    target: Monster | null;
    targetPosition: Vec3;
    elapsed: number;
    config: SkillConfig;
    impact: () => void;
    finish: () => void;
}

type OrbitState = 'orbiting' | 'attacking' | 'returning';

interface OrbitBlade {
    node: Node;
    homeParent: Node;
    homeScale: Vec3;
    radius: number;
    angle: number;
    z: number;
    previousX: number;
    previousY: number;
    forwardAngle: number;
    state: OrbitState;
    target: Monster | null;
    elapsed: number;
    impact: (() => void) | null;
    finish: (() => void) | null;
    isTemplate: boolean;
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
    private readonly orbitBlades: OrbitBlade[] = [];
    private nextOrbitBladeIndex = 0;

    constructor(
        private readonly host: Component,
        private readonly worldNode: Node,
    ) {}

    bindPlayer(player: Player): void {
        this.clearOrbitBlades();
        this.player = player;
        const effects = player.node.getChildByName('Effects');
        if (!effects) {
            console.warn('[PlayerSkillController] role4/Effects is missing');
            return;
        }
        // Effects 作为隐藏模板容器保持启用，具体技能节点按解锁状态控制显隐。
        effects.active = true;
        for (const name of Object.keys(SkillConfigs) as SkillName[]) {
            const template = effects.getChildByName(name);
            if (template) template.active = false;
            else console.warn(`[PlayerSkillController] Effects/${name} is missing`);
        }
    }

    unlock(name: SkillName): void {
        this.unlockedSkills.add(name);
        this.currentSkill = name;
        const config = SkillConfigs[name];
        if (config.keepTemplateVisible) this.startTemplateOrbit(config);
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
        for (const blade of this.orbitBlades) {
            if (!blade.node.isValid || blade.state === 'orbiting') continue;
            const baseSpeed = this.animationBaseSpeeds.get(blade.node)
                ?? Math.max(0, SkillConfigs.needle.animationSpeed);
            for (const skeleton of blade.node.getComponentsInChildren(sp.Skeleton)) {
                skeleton.timeScale = baseSpeed * this.playbackTimeScale;
            }
        }
    }

    /** 始终使用最后捡到的技能；返回 false 表示尚未解锁或对应模板不可用。 */
    castCurrentSkill(
        player: Player,
        monster: Monster,
        onImpact: (damage?: number) => void,
        onComplete: () => void,
        isFinalBoss = false,
    ): boolean {
        const config = this.getCurrentConfig();
        if (!config) return false;
        if (config.castType === 'orbit-projectile') {
            return this.castOrbitProjectile(player, monster, config, onImpact, onComplete, isFinalBoss);
        }
        if (!this.findTemplate(player, config.effectNodeName)) return false;
        if (this.isCasting()) return false;
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
        if (config.castType === 'projectile' && Math.max(1, config.projectileCount || 1) > 1) {
            return this.castProjectileVolley(
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
        const castDamage = this.getCastTotalDamage(player, config);
        const impact = () => {
            if (impacted) return;
            impacted = true;
            onImpact(castDamage);
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
                target: monster,
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
        this.updateTemplateOrbit(dt);
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
            if (projectile.target?.node?.isValid && projectile.target.node.activeInHierarchy) {
                projectile.targetPosition.set(projectile.target.node.worldPosition);
                if (projectile.config.rotateToTarget) {
                    this.rotateProjectileToTarget(
                        node,
                        projectile.targetPosition,
                        projectile.config.projectileAngleOffset || 0,
                    );
                }
            }
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
        this.clearOrbitBlades();
    }

    /** 地刺从角色朝怪物方向按固定段长依次出现，最后一段不强制落在怪物位置。 */
    private castSegmentedTargetArea(
        player: Player,
        monster: Monster,
        config: SkillConfig,
        onImpact: (damage?: number) => void,
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

    /** 一次施法按配置间隔连续发射多个飞行道具，每个投射物独立命中。 */
    private castProjectileVolley(
        player: Player,
        monster: Monster,
        config: SkillConfig,
        onImpact: (damage?: number) => void,
        onComplete: () => void,
        isFinalBoss: boolean,
    ): boolean {
        const count = Math.max(1, Math.round(config.projectileCount || 1));
        const interval = Math.max(0, config.projectileInterval || 0);
        const lockedTargetPosition = monster.node.worldPosition.clone();
        const totalDamage = this.getCastTotalDamage(player, config);
        const baseDamage = totalDamage === undefined ? undefined : Math.floor(totalDamage / count);
        const damageRemainder = totalDamage === undefined ? 0 : totalDamage % count;
        let remaining = count;
        let completed = false;
        this.casting = true;
        if (isFinalBoss) AudioManager.playHeHa();
        AudioManager.playRoleSkill(config.id, !isFinalBoss);

        const finishOne = (instance: Node | null) => {
            if (instance) {
                this.activeInstances.delete(instance);
                this.animationBaseSpeeds.delete(instance);
                if (instance.isValid) instance.destroy();
            }
            remaining--;
            if (remaining > 0 || completed) return;
            completed = true;
            this.casting = false;
            onComplete();
        };

        for (let index = 0; index < count; index++) {
            this.host.scheduleOnce(() => {
                const instance = this.createEffectInstance(player, config);
                if (!instance) {
                    finishOne(null);
                    return;
                }
                if (config.rotateToTarget) {
                    this.rotateProjectileToTarget(
                        instance,
                        lockedTargetPosition,
                        config.projectileAngleOffset || 0,
                    );
                }
                this.playEffectAnimation(instance, config);
                let projectileFinished = false;
                const projectileDamage = baseDamage === undefined
                    ? undefined
                    : baseDamage + (index < damageRemainder ? 1 : 0);
                this.projectiles.push({
                    node: instance,
                    target: monster,
                    targetPosition: lockedTargetPosition.clone(),
                    elapsed: 0,
                    config,
                    impact: () => onImpact(projectileDamage),
                    finish: () => {
                        if (projectileFinished) return;
                        projectileFinished = true;
                        finishOne(instance);
                    },
                });
            }, index * interval);
        }
        return true;
    }

    private findTemplate(player: Player, name: SkillName): Node | null {
        return player.node.getChildByName('Effects')?.getChildByName(name) || null;
    }

    private startTemplateOrbit(config: SkillConfig): void {
        const player = this.player;
        if (!player || !player.node.isValid) return;
        const template = this.findTemplate(player, config.effectNodeName);
        if (!template) {
            console.warn(`[PlayerSkillController] Effects/${config.effectNodeName} is missing`);
            return;
        }
        const position = template.position;
        const directionNode = template.getChildByName('dot');
        if (!directionNode) {
            console.warn(`[PlayerSkillController] Effects/${config.effectNodeName}/dot is missing`);
        }
        const homeParent = template.parent;
        if (!homeParent) return;
        this.clearOrbitBlades();
        const radius = Math.max(0, config.orbitRadius
            ?? Math.sqrt(position.x * position.x + position.y * position.y));
        const baseAngle = Math.atan2(position.y, position.x);
        const forwardAngle = directionNode
            ? Math.atan2(
                directionNode.position.y * template.scale.y,
                directionNode.position.x * template.scale.x,
            ) * 180 / Math.PI
            : 0;
        const count = Math.max(1, Math.round(config.orbitBladeCount || 1));
        for (let index = 0; index < count; index++) {
            const node = index === 0 ? template : instantiate(template);
            if (index > 0) {
                node.name = `${config.effectNodeName}Orbit${index + 1}`;
                homeParent.addChild(node);
            }
            const angle = baseAngle + Math.PI * 2 * index / count;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            node.setScale(template.scale);
            node.setPosition(x, y, position.z);
            node.angle = angle * 180 / Math.PI + 90 - forwardAngle;
            node.active = true;
            this.orbitBlades.push({
                node,
                homeParent,
                homeScale: template.scale.clone(),
                radius,
                angle,
                z: position.z,
                previousX: x,
                previousY: y,
                forwardAngle,
                state: 'orbiting',
                target: null,
                elapsed: 0,
                impact: null,
                finish: null,
                isTemplate: index === 0,
            });
        }
        this.nextOrbitBladeIndex = 0;
    }

    private updateTemplateOrbit(dt: number): void {
        const config = SkillConfigs.needle;
        const angularSpeed = Math.max(0, config.orbitAngularSpeed || 0) * Math.PI / 180;
        const scaledDt = Math.max(0, dt) * this.playbackTimeScale;
        for (const blade of this.orbitBlades) {
            const node = blade.node;
            if (!node.isValid || !node.active) continue;
            blade.angle += angularSpeed * scaledDt;
            if (blade.state !== 'orbiting') {
                this.updateOrbitSortie(blade, config, scaledDt);
                continue;
            }

            // 飞剑根节点中心沿标准圆移动；dot 只用于定义资源的剑头方向。
            const nextX = Math.cos(blade.angle) * blade.radius;
            const nextY = Math.sin(blade.angle) * blade.radius;
            const moveX = nextX - blade.previousX;
            const moveY = nextY - blade.previousY;
            if (Math.abs(moveX) > 0.0001 || Math.abs(moveY) > 0.0001) {
                const targetAngle = Math.atan2(moveY, moveX) * 180 / Math.PI
                    - blade.forwardAngle;
                const angleDelta = Math.atan2(
                    Math.sin((targetAngle - node.angle) * Math.PI / 180),
                    Math.cos((targetAngle - node.angle) * Math.PI / 180),
                ) * 180 / Math.PI;
                const smoothing = Math.max(0, config.orbitTurnSmoothing || 0);
                const turnFactor = smoothing > 0 ? 1 - Math.exp(-smoothing * scaledDt) : 1;
                node.angle += angleDelta * turnFactor;
            }
            node.setPosition(nextX, nextY, blade.z);
            blade.previousX = nextX;
            blade.previousY = nextY;
        }
    }

    /** needle 使用当前环绕的同一把飞剑出击，不再复制新投射物。 */
    private castOrbitProjectile(
        player: Player,
        monster: Monster,
        config: SkillConfig,
        onImpact: (damage?: number) => void,
        onComplete: () => void,
        isFinalBoss: boolean,
    ): boolean {
        if (this.orbitBlades.length === 0) this.startTemplateOrbit(config);
        const blade = this.findAvailableOrbitBlade();
        if (!blade) return false;
        const node = blade.node;

        const worldPosition = node.worldPosition.clone();
        const worldRotation = node.worldRotation.clone();
        const worldScale = node.worldScale.clone();
        this.worldNode.addChild(node);
        node.setWorldPosition(worldPosition);
        node.setWorldRotation(worldRotation);
        node.setWorldScale(worldScale);

        blade.state = 'attacking';
        blade.target = monster;
        blade.elapsed = 0;
        const castDamage = this.getCastTotalDamage(player, config);
        blade.impact = () => onImpact(castDamage);
        blade.finish = onComplete;
        this.animationBaseSpeeds.set(node, Math.max(0, config.animationSpeed));
        this.playEffectAnimation(node, config);
        if (isFinalBoss) AudioManager.playHeHa();
        AudioManager.playRoleSkill(config.id, !isFinalBoss);
        this.rotateProjectileToTarget(node, monster.node.worldPosition, config.projectileAngleOffset || 0);
        return true;
    }

    private findAvailableOrbitBlade(): OrbitBlade | null {
        const count = this.orbitBlades.length;
        for (let offset = 0; offset < count; offset++) {
            const index = (this.nextOrbitBladeIndex + offset) % count;
            const blade = this.orbitBlades[index];
            if (blade.node.isValid && blade.node.active && blade.state === 'orbiting') {
                this.nextOrbitBladeIndex = (index + 1) % count;
                return blade;
            }
        }
        return null;
    }

    private updateOrbitSortie(blade: OrbitBlade, config: SkillConfig, dt: number): void {
        const node = blade.node;
        blade.elapsed += dt;
        if (blade.state === 'attacking') {
            const target = blade.target;
            if (!target?.node?.isValid || !target.node.activeInHierarchy) {
                this.beginOrbitReturn(blade, true);
                return;
            }
            const targetPosition = target.node.worldPosition;
            const arrived = this.moveOrbitNodeTowards(
                node,
                targetPosition,
                Math.max(0, config.projectileSpeed || 0),
                Math.max(0, config.hitRadius || 0),
                dt,
                blade.forwardAngle,
                config.projectileAngleOffset || 0,
            );
            if (arrived) {
                const impact = blade.impact;
                blade.impact = null;
                this.beginOrbitReturn(blade, false);
                impact?.();
                this.finishOrbitCast(blade);
                return;
            }
            const timeout = Math.max(0.01, config.maxTravelTime || config.forceHideTimeout);
            if (blade.elapsed >= timeout) this.beginOrbitReturn(blade, true);
            return;
        }

        const returnPosition = this.getOrbitWorldPosition(blade);
        if (!returnPosition) {
            this.completeOrbitReturn(blade);
            return;
        }
        const arrived = this.moveOrbitNodeTowards(
            node,
            returnPosition,
            Math.max(0, config.orbitReturnSpeed || config.projectileSpeed || 0),
            Math.max(0, config.orbitRejoinRadius || 0),
            dt,
            blade.forwardAngle,
            config.projectileAngleOffset || 0,
        );
        const timeout = Math.max(0.01, config.orbitReturnTimeout || config.forceHideTimeout);
        if (arrived || blade.elapsed >= timeout) this.completeOrbitReturn(blade);
    }

    private moveOrbitNodeTowards(
        node: Node,
        target: Readonly<Vec3>,
        speed: number,
        arriveRadius: number,
        dt: number,
        forwardAngle: number,
        angleOffset: number,
    ): boolean {
        const current = node.worldPosition;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const step = speed * dt;
        if (distance <= arriveRadius || distance <= step) {
            node.setWorldPosition(target.x, target.y, current.z);
            return true;
        }
        if (distance > 0.001 && step > 0) {
            node.angle = Math.atan2(dy, dx) * 180 / Math.PI
                - forwardAngle + angleOffset;
            node.setWorldPosition(
                current.x + dx / distance * step,
                current.y + dy / distance * step,
                current.z,
            );
        }
        return false;
    }

    private beginOrbitReturn(blade: OrbitBlade, finishCast: boolean): void {
        blade.state = 'returning';
        blade.target = null;
        blade.elapsed = 0;
        if (finishCast) this.finishOrbitCast(blade);
    }

    /** 返回点是此刻的动态圆周点，角色移动时也会实时跟随。 */
    private getOrbitWorldPosition(blade: OrbitBlade): Vec3 | null {
        const parent = blade.homeParent;
        if (!parent?.isValid) return null;
        const localPosition = new Vec3(
            Math.cos(blade.angle) * blade.radius,
            Math.sin(blade.angle) * blade.radius,
            blade.z,
        );
        return Vec3.transformMat4(new Vec3(), localPosition, parent.worldMatrix);
    }

    private completeOrbitReturn(blade: OrbitBlade): void {
        const node = blade.node;
        const parent = blade.homeParent;
        if (node.isValid && parent.isValid) {
            parent.addChild(node);
            node.setScale(blade.homeScale);
            const x = Math.cos(blade.angle) * blade.radius;
            const y = Math.sin(blade.angle) * blade.radius;
            node.setPosition(x, y, blade.z);
            node.angle = blade.angle * 180 / Math.PI + 90 - blade.forwardAngle;
            blade.previousX = x;
            blade.previousY = y;
        }
        this.animationBaseSpeeds.delete(node);
        this.finishOrbitCast(blade);
        blade.state = 'orbiting';
        blade.target = null;
        blade.elapsed = 0;
        blade.impact = null;
    }

    private finishOrbitCast(blade: OrbitBlade): void {
        const finish = blade.finish;
        blade.finish = null;
        finish?.();
    }

    /** 重新开始/切换角色时回收所有飞剑，不触发旧战斗回调。 */
    private clearOrbitBlades(): void {
        for (const blade of this.orbitBlades) {
            const node = blade.node;
            this.animationBaseSpeeds.delete(node);
            if (!node.isValid) continue;
            if (blade.isTemplate) {
                if (blade.homeParent.isValid && node.parent !== blade.homeParent) {
                    blade.homeParent.addChild(node);
                }
                node.setScale(blade.homeScale);
                node.active = false;
            } else {
                node.destroy();
            }
        }
        this.orbitBlades.length = 0;
        this.nextOrbitBladeIndex = 0;
    }

    private getCastTotalDamage(player: Player, config: SkillConfig): number | undefined {
        if (config.damageMode === 'player-power') {
            return Math.max(0, Math.round(player.getDisplayedPower()));
        }
        if (config.damage !== undefined) return Math.max(0, Math.round(config.damage));
        return undefined;
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
