import { AttackAudioType } from './ResourceConfig';

export type PlayerRoleType = 'role' | 'role1' | 'role2';

export interface PlayerRoleProfile {
    introAnimation?: string;
    /** 角色升级实例化时，scsj 节点播放一次的 Spine 特效动画。 */
    upgradeEffectAnimation?: string;
    /** 攻击普通怪物时的中心距离；不配置则使用怪物自身的 battleRadius。 */
    normalMonsterBattleDistance?: number;
    attackAnimation: string;
    /** 最终 Boss 连击动画；未配置的攻击次数回退到 attackAnimation。 */
    bossAttackAnimations?: string[];
    attackSound: AttackAudioType;
    /** 攻击动画开始后多久播放攻击音效。 */
    attackSoundDelay: number;
    /** 攻击开始后多久判定命中；不必等待整段攻击动画结束。 */
    attackImpactDelay: number;
}

export const PlayerRoleProfiles: Record<PlayerRoleType, PlayerRoleProfile> = {
    role: {
        normalMonsterBattleDistance: 50,
        attackAnimation: 'phyattack1',
        attackSound: 'attack1',
        attackSoundDelay: 0.2,
        attackImpactDelay: 0.6,
    },
    role1: {
        introAnimation: 'skill1',
        upgradeEffectAnimation: 'sj',
        attackAnimation: 'phyattack4',//phyattack3
        bossAttackAnimations: ['phyattack4', 'phyattack3'],
        attackSound: 'attack3',
        attackSoundDelay: 0.4,
        attackImpactDelay: 0.7,
    },
    role2: {
        introAnimation: 'skill1',
        upgradeEffectAnimation: 'sx',
        attackAnimation: 'phyattack2',
        bossAttackAnimations: ['phyattack2', 'phyattack3'],
        attackSound: 'attack2',
        attackSoundDelay: 0.4,//0.2s后角色播放攻击音效，
        attackImpactDelay: 0.6,//0.6s 后怪物播放死亡动画
    },
};
