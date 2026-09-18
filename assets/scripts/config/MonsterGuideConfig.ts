export interface MonsterGuideProfile {
    /** 初始引导分别指向的节点名。 */
    targetNodeNames: readonly string[];
    /** 引导 Spine 循环播放的动画名。 */
    animationName: string;
}

export const MonsterGuideConfig: MonsterGuideProfile = {
    targetNodeNames: ['trop', 'needle'],
    animationName: 'yindao_dianji',
};
