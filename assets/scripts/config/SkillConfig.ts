export type SkillName = 'trop' | 'fireDao' | 'wheel' | 'needle';
export type SkillCastType = 'target-area' | 'projectile' | 'orbit-projectile';

export interface SkillConfig {
    id: SkillName;
    effectNodeName: SkillName;
    castType: SkillCastType;
    animationName: string;
    animationSpeed: number;
    animationLoop: boolean;
    /** 保留的旧随机权重；当前 latest-unlocked 模式下不参与选择。 */
    randomWeight: number;
    /** 角色中心到怪物中心的自动施法范围（世界坐标）。 */
    attackRange: number;
    /** 自动施法间隔（秒）。 */
    attackInterval: number;
    /** 是否按角色当前左右朝向翻转技能。 */
    flipWithPlayerFacing?: boolean;
    /** 仅地刺使用：技能出现后多久命中。 */
    hitDelay?: number;
    /** 仅地刺使用：一次施法连续生成的段数。 */
    segmentCount?: number;
    /** 仅地刺使用：相邻两段出现的时间间隔（秒）。 */
    segmentInterval?: number;
    /** 仅地刺使用：每一段沿目标方向推进的固定世界距离。 */
    segmentDistance?: number;
    /** 仅飞行道具使用。 */
    projectileSpeed?: number;
    /** 一次施法连续发射的飞行道具数量，可用于 1/2/3 级数量升级。 */
    projectileCount?: number;
    /** 连续飞行道具之间的发射间隔（秒）。 */
    projectileInterval?: number;
    /** 仅飞行道具使用。 */
    hitRadius?: number;
    /** 仅飞行道具使用。 */
    maxTravelTime?: number;
    /** 仅飞行道具使用：是否朝向释放瞬间锁定的目标位置。 */
    rotateToTarget?: boolean;
    /** 飞行道具资源初始朝向相对“朝右”的角度修正。 */
    projectileAngleOffset?: number;
    /** 解锁后是否持续显示角色 Effects 下的技能模板。 */
    keepTemplateVisible?: boolean;
    /** 初始环绕飞剑数量。 */
    orbitBladeCount?: number;
    /** 持续显示模板围绕角色旋转的角速度（度/秒）。 */
    orbitAngularSpeed?: number;
    /** 持续显示模板的中心绕角色旋转的半径。 */
    orbitRadius?: number;
    /** 环绕飞行时朝向实际运动方向的平滑速度；越大转向越快。 */
    orbitTurnSmoothing?: number;
    /** 环绕飞剑命中后返回轨道的速度。 */
    orbitReturnSpeed?: number;
    /** 飞剑与当前轨道点小于此距离时重新接轨。 */
    orbitRejoinRadius?: number;
    /** 返回阶段的超时时间，超时后强制接轨。 */
    orbitReturnTimeout?: number;
    /** 技能命中后、死亡前播放的怪物受击动画。 */
    monsterHitAnimation?: string;
    /** 技能最终触发的怪物死亡动画。 */
    monsterDeathAnimation?: string;
    /** 技能命中并击杀怪物时生成的额外特效。 */
    monsterImpactEffect?: 'boom' | 'boom2' | 'light';
    /** 额外命中特效播放的 Spine 动画。 */
    monsterImpactEffectAnimation?: string;
    /** 击杀怪物时是否播放通用 deadEffect。 */
    playDeadEffect: boolean;
    forceHideTimeout: number;
}

export const SkillSystemConfig = {
    castEvent: 'range-auto' as const,
    selectionMode: 'latest-unlocked' as const,
    permanentUnlock: true,
    allowRepeatLastSkill: true,
    lockPlayerWhileCasting: false,
    waitForSkillFinish: true,
    playMonsterDeathAnimation: true,
    monsterForceHideTimeout: 3,
    /** 怪物死亡帧动画相对怪物世界坐标的 Y 偏移。 */
    deathEffectOffsetY: 50,
};

/** role4 技能：场景同名道具负责解锁，Effects 下同名节点作为施法模板。 */
export const SkillConfigs: Record<SkillName, SkillConfig> = {
    trop: {
        id: 'trop',
        effectNodeName: 'trop',
        castType: 'target-area',
        animationName: 'action',
        animationSpeed: 1,
        animationLoop: false,
        randomWeight: 1,
        attackRange: 280,
        attackInterval: 1,
        hitDelay: 0.2,
        segmentCount: 3,
        segmentInterval: 0.12,
        segmentDistance: 100,
        monsterHitAnimation: 'hitFly',
        monsterDeathAnimation: 'die',
        playDeadEffect: true,
        forceHideTimeout: 3,
    },
    fireDao: {
        id: 'fireDao',
        effectNodeName: 'fireDao',
        castType: 'projectile',
        animationName: 'action1',
        animationSpeed: 1,
        animationLoop: true,
        randomWeight: 1,
        attackRange: 280,
        attackInterval: 1,
        rotateToTarget: true,
        projectileAngleOffset: 0,
        monsterImpactEffect: 'boom',
        monsterImpactEffectAnimation: 'molotovAttackhits',
        projectileSpeed: 400,
        projectileCount: 3,
        projectileInterval: 0.2,
        hitRadius: 40,
        maxTravelTime: 3,
        playDeadEffect: false,
        forceHideTimeout: 3,
    },
    needle: {
        id: 'needle',
        effectNodeName: 'needle',
        castType: 'orbit-projectile',
        animationName: 'action1',
        animationSpeed: 1,
        animationLoop: true,
        randomWeight: 1,
        attackRange: 480,
        attackInterval: 1,
        rotateToTarget: true,
        projectileAngleOffset: 0,
        keepTemplateVisible: true,
        orbitBladeCount: 3,
        orbitAngularSpeed: 180,
        orbitRadius: 128,
        orbitTurnSmoothing: 18,
        orbitReturnSpeed: 520,
        orbitRejoinRadius: 24,
        orbitReturnTimeout: 3,
        monsterImpactEffect: 'boom',
        monsterImpactEffectAnimation: 'molotovAttackhits',
        projectileSpeed: 600,
        hitRadius: 40,
        maxTravelTime: 3,
        playDeadEffect: false,
        forceHideTimeout: 3,
    },
    wheel: {
        id: 'wheel',
        effectNodeName: 'wheel',
        castType: 'projectile',
        animationName: 'animation',//animation1
        animationSpeed: 1,
        animationLoop: true,
        randomWeight: 1,
        attackRange: 280,
        attackInterval: 1,
        projectileSpeed: 400,
        hitRadius: 40,
        maxTravelTime: 3,
        monsterImpactEffect: 'boom2',
        monsterImpactEffectAnimation: 'skill1_hit',
        playDeadEffect: false,
        forceHideTimeout: 3,
    },
};

export function isSkillName(value: string): value is SkillName {
    return Object.prototype.hasOwnProperty.call(SkillConfigs, value);
}
