import { AttackAudioType } from './ResourceConfig';

export type PlayerRoleType = 'role' | 'role1' | 'role2' | 'role3';

export interface PlayerRoleProfile {
    introAnimation?: string;
    /** 角色升级实例化时，scsj 节点播放一次的 Spine 特效动画。 */
    upgradeEffectAnimation?: string;
    /** 攻击普通怪物时的中心距离；不配置则使用怪物自身的 battleRadius。 */
    normalMonsterBattleDistance?: number;
    /** 攻击最终 Boss 时的中心距离；不配置则使用 Boss 自身的 battleRadius。 */
    bossMonsterBattleDistance?: number;
    attackAnimation: string;
    /** 最终 Boss 连击动画；未配置的攻击次数回退到 attackAnimation。 */
    bossAttackAnimations?: string[];
    attackSound: AttackAudioType;
    /** 攻击动画开始后多久播放攻击音效。 */
    attackSoundDelay: number;
    /** 攻击开始后多久判定命中；不必等待整段攻击动画结束。 */
    attackImpactDelay: number;
}

export const BaseRoleSpecialBattleConfig = {
    targetMonsterNames: ['monster10', 'monster11'],
    attackAnimation: 'phyattack3',
    /** 普通速度下，攻击开始后多久播放音效。 */
    attackSoundDelay: 0.8,
    /** 普通速度下，攻击开始后多久判定命中并让怪物死亡。 */
    attackImpactDelay: 0.9,
};

export const PlayerRoleProfiles: Record<PlayerRoleType, PlayerRoleProfile> = {
    role: {
        upgradeEffectAnimation: 'sj',
        normalMonsterBattleDistance: 60,
        bossMonsterBattleDistance: 100,
        attackAnimation: 'phyattack1',
        attackSound: 'attack1',
        attackSoundDelay: 0.2,
        attackImpactDelay: 0.6,
    },
    role1: {
        introAnimation: 'skill1',
        upgradeEffectAnimation: 'sj',
        normalMonsterBattleDistance: 70,
        bossMonsterBattleDistance: 90,
        attackAnimation: 'phyattack4',//phyattack3
        bossAttackAnimations: ['phyattack4', 'phyattack3'],
        attackSound: 'attack3',
        attackSoundDelay: 0.4,
        attackImpactDelay: 0.7,
    },
    role2: {
        introAnimation: 'skill1',
        upgradeEffectAnimation: 'sx',
        normalMonsterBattleDistance: 70,
        bossMonsterBattleDistance: 90,
        attackAnimation: 'phyattack2',
        bossAttackAnimations: ['phyattack2', 'phyattack3'],
        attackSound: 'attack2',
        attackSoundDelay: 0.4,//0.2s后角色播放攻击音效，
        attackImpactDelay: 0.6,//0.6s 后怪物播放死亡动画
    },
    role3: {
        introAnimation: 'skill1',
        upgradeEffectAnimation: 'sj',
        normalMonsterBattleDistance: 80,
        bossMonsterBattleDistance: 100,
        attackAnimation: 'phyattack1',
        bossAttackAnimations: ['phyattack4', 'phyattack3'],
        attackSound: 'attack1',
        attackSoundDelay: 0.2,
        attackImpactDelay: 0.6,
    },
};
