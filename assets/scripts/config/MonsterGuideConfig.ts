export interface MonsterGuideProfile {
    /** 初始引导和黄色高亮指向的怪物节点名。 */
    targetMonsterName: string;
    /** 引导 Spine 循环播放的动画名。 */
    animationName: string;
}

export const MonsterGuideConfig: MonsterGuideProfile = {
    targetMonsterName: 'monster3-2',
    animationName: 'yindao_dianji',
};
