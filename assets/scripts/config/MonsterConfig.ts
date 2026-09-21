export type MonsterType = 'monster1' | 'monster2' | 'monster3' | 'monster4';

export interface MonsterProfile {
    /** 追击角色时播放的 Spine 动画。 */
    moveAnimation: string;
    /** 普通战斗时播放的 Spine 攻击动画。 */
    attackAnimation: string;
    /** 被击杀时播放的 Spine 动画。 */
    deathAnimation: string;
    /** 第一次攻击动画开始后多久播放 Boss 攻击音效。 */
    firstAttackSoundDelay?: number;
}

export const MonsterSpawnConfig = {
    /** 怪物实例化完成后的淡入时间（秒）。 */
    fadeDuration: 0.2,
};

export const MonsterViewportCullingConfig = {
    enabled: true,
    /** 摄像机移动时无需每帧检测，秒。 */
    checkInterval: 0.15,
    /** 隐藏怪物进入该屏幕外扩范围时提前恢复，像素。 */
    enterPadding: 160,
    /** 显示怪物离开更远范围后才关闭，避免边缘反复切换，像素。 */
    exitPadding: 240,
};

export const MonsterProfiles: Record<MonsterType, MonsterProfile> = {
    monster1: {
        moveAnimation: 'move',
        attackAnimation: 'attack',
        deathAnimation: 'die',
        firstAttackSoundDelay: 0.4,
    },
    monster2: {
        moveAnimation: 'move',
        attackAnimation: 'attack',
        deathAnimation: 'die',
    },
    monster3: {
        moveAnimation: 'move',
        attackAnimation: 'attack',
        deathAnimation: 'die',
    },
    monster4: {
        moveAnimation: 'move',
        attackAnimation: 'attack',
        deathAnimation: 'die',
    },
};
