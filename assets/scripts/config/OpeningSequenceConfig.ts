export interface OpeningSequenceProfile {
    /** 开场执行攻击动作的怪物名称。 */
    targetMonsterName: string;
    /** 资源加载期间的相机正交高度倍率。 */
    initialCameraOrthoScale: number;
    /** 所有资源实例化后，镜头移动到角色所需时间（秒）。 */
    cameraMoveDuration: number;
    /** 镜头到位后，从扩大视野恢复到正常视野所需时间（秒）。 */
    cameraZoomDuration: number;
    /** 恢复正常视野时，相对角色的水平偏移；负数向左。 */
    cameraTargetOffsetX: number;
    /** 角色开场翻滚的起点（GameWorld 本地坐标）。 */
    playerRollStart: { x: number; y: number };
    /** 二次贝塞尔曲线控制点（GameWorld 本地坐标）。 */
    playerRollControl: { x: number; y: number };
    /** 角色翻滚到正式出生点所需时间（秒）。 */
    playerRollDuration: number;
    /** 翻滚过程中旋转的圈数。 */
    playerRollTurns: number;
    /** 角色旋转飞行期间 spine 的透明度。 */
    playerRollOpacity: number;
    /** 角色落地后首先播放的过渡动画。 */
    playerLandingTransitionAnimation: string;
    /** 落地过渡动画的目标播放时长（秒）。 */
    playerLandingTransitionDuration: number;
    /** 落地过渡结束后播放一次的起身动画。 */
    playerLandingAnimation: string;
}

export const OpeningSequenceConfig: OpeningSequenceProfile = {
    targetMonsterName: 'monster1',
    initialCameraOrthoScale: 1.3,
    cameraMoveDuration: 0.5,
    cameraZoomDuration: 0.3,
    cameraTargetOffsetX: -100,
    playerRollStart: { x: -120, y: 510 },
    playerRollControl: { x: 650, y: 510 },
    playerRollDuration: 1,
    playerRollTurns: 15,
    playerRollOpacity: 180,
    playerLandingTransitionAnimation: 'xx2',
    playerLandingTransitionDuration: 0.1,
    playerLandingAnimation: 'xx3',
};
