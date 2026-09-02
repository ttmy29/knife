export interface OpeningSequenceProfile {
    /** 开场镜头对准的怪物名称。 */
    targetMonsterName: string;
    /** 目标怪物实例化后播放一次的 Spine 动画。 */
    monsterIntroAnimation: string;
    /** 登场动画结束后，等待多久才开始移动镜头（秒）。 */
    cameraMoveDelay: number;
    /** 怪物登场动画结束后，镜头移动到角色所需时间（秒）。 */
    cameraMoveDuration: number;
}

export const OpeningSequenceConfig: OpeningSequenceProfile = {
    targetMonsterName: 'monster1',
    monsterIntroAnimation: 'skill1',
    cameraMoveDelay: 0.5,
    cameraMoveDuration: 1.2,
};
