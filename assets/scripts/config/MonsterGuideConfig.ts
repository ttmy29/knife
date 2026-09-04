export interface MonsterGuideProfile {
    /** 初始引导指向的节点名。 */
    targetNodeName: string;
    /** 引导 Spine 循环播放的动画名。 */
    animationName: string;
}

export const MonsterGuideConfig: MonsterGuideProfile = {
    targetNodeName: 'dao',
    animationName: 'yindao_dianji',
};
