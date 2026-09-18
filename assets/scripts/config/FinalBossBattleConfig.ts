export interface FinalBossBattleProfile {
    /** wheel 击杀怪物时 light 特效的播放时间（秒）。 */
    lightDuration: number;
    /** 击败最终 Boss 时角色连续攻击次数。 */
    attackCount: number;
    /** 每次攻击命中后，Boss 数字分几段下降。 */
    powerDropSteps: number;
    /** 每段数字变化的时间间隔。 */
    powerDropStepInterval: number;
    /** 第一击完成后，黑幕从透明到全黑的时间（秒）。 */
    maskFadeInDuration: number;
    /** 黑幕期间摄像机正交高度倍率；越小拉得越近。 */
    maskCameraZoomScale: number;
    /** 黑幕开始时镜头拉近所需时间（秒）。 */
    maskCameraZoomDuration: number;
    /** 黑幕期间镜头横向偏移的世界距离；负数向左，正数向右。 */
    maskCameraOffsetX: number;
    /** 第二次终结攻击使用的时间倍率。 */
    finisherSlowScale: number;
    /** 技能开始释放后，等待多久进入慢放（秒）。 */
    skillSlowStartDelay: number;
    /** 第二次攻击开始后，等待多久进入慢放（秒）。 */
    finisherSlowStartDelay: number;
    /** 第二次攻击开始后，动画时间到多少秒播放音效并触发扣数字；受慢放倍率影响。 */
    finisherAttackSoundDelay: number;
    /** 第二次攻击开始后多久播放角色喊声；使用动画时间，会跟随慢放。 */
    finisherHeHaDelay: number;
    /** 终结攻击慢放持续的真实时间（秒）。 */
    finisherSlowDuration: number;
    /** 最后一击开始后，Boss 最早何时播放死亡动画（真实时间，秒）。 */
    finisherDeathDelay: number;
    /** 最终命中时的停顿时间（秒）。 */
    finisherHitStopDuration: number;
}

export const FinalBossBattleConfig: FinalBossBattleProfile = {
    lightDuration: 1.5,
    attackCount: 2,
    powerDropSteps: 3,
    powerDropStepInterval: 0.06,
    maskFadeInDuration: 0.1,
    maskCameraZoomScale: 0.8,
    maskCameraZoomDuration: 0.3,
    maskCameraOffsetX: 100,
    finisherSlowScale: 0.2,//0.35 慢放倍数
    skillSlowStartDelay: 0.4,
    finisherSlowStartDelay: 0.6,
    finisherAttackSoundDelay: 0.8,//0.6+0.2*0.5=0.7,,,相当于1.1s才播放攻击音效;
    finisherHeHaDelay: 0.5,
    finisherSlowDuration: 3,//0.45 慢放时间，
    finisherDeathDelay: 1.8,
    finisherHitStopDuration: 0.06,
};
