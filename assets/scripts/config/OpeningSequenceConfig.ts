export interface OpeningSequenceProfile {
    /** 进入游戏后保持黑屏并用于预加载资源的时间（秒）。 */
    loadingMaskDuration: number;
    /** 开场执行攻击动作的怪物名称。 */
    targetMonsterName: string;
    /** 开场怪物开始攻击后，延迟播放角色受击音效的时间（秒）。 */
    playerHitSoundDelay: number;
    /** 角色落地后第一次播放 Help1 的延迟（秒）。 */
    firstHelpSoundDelay: number;
    /** 第一次播放后，Help1、Help2 交替播放的固定间隔（秒）。 */
    helpSoundInterval: number;
    /** 资源加载期间的相机正交高度倍率。 */
    initialCameraOrthoScale: number;
    /** 资源加载期间，相机初始位置向上的偏移量。 */
    initialCameraOffsetY: number;
    /** 所有资源实例化后，镜头移动到角色所需时间（秒）。 */
    cameraMoveDuration: number;
    /** 开局保持镜头位置和扩大视野完全不动的时间（秒）。 */
    cameraStartDelay: number;
    /** 镜头到位后，从扩大视野恢复到正常视野所需时间（秒）。 */
    cameraZoomDuration: number;
    /** 恢复正常视野时，相对角色的水平偏移；负数向左。 */
    cameraTargetOffsetX: number;
    /** 角色开场翻滚的起点（GameWorld 本地坐标）。 */
    playerRollStart: { x: number; y: number };
    /** 角色位于开场临时点时显示的战力文本，仅影响 Label。 */
    temporaryPlayerLabelText: string;
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
    loadingMaskDuration: 1,
    targetMonsterName: 'monster1',
    playerHitSoundDelay: 1,
    firstHelpSoundDelay: 5,
    helpSoundInterval: 6,
    initialCameraOrthoScale: 1.3,
    initialCameraOffsetY: 100,
    cameraMoveDuration: 1,//0.5
    cameraStartDelay: 0.5,
    cameraZoomDuration: 1,//0.3
    cameraTargetOffsetX: -100,
    playerRollStart: { x: -120, y: 510 },
    temporaryPlayerLabelText: '1888',
    playerRollControl: { x: 650, y: 510 },
    playerRollDuration: 1,
    playerRollTurns: 15,
    playerRollOpacity: 180,
    playerLandingTransitionAnimation: 'xx2',
    playerLandingTransitionDuration: 0.1,
    playerLandingAnimation: 'xx3',
};
