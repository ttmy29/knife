/** 战力不足时的战斗闪避表现。 */
export const DodgeConfig = {
    /** 期望的真实位移距离（世界坐标）；最终落点还会根据格子和障碍调整。 */
    distance: 50,
    /** 落点必须比当前战斗距离额外远出的安全距离。 */
    exitPadding: 20,
    /** 角色根节点移动到闪避落点所需时间。 */
    moveDuration: 0.3333,
    /** dodge Spine 的统一总时长。 */
    animationDuration: 0.9667,
    /** dodge 在角色当前朝向反方向产生的额外视觉后退距离（已按角色 0.7 缩放换算）。 */
    visualBackDistance: 70,
    /** dodge 最远帧还会有少量向下偏移。 */
    visualVerticalOffset: -14,
    /** 检查最远视觉位置时，为角色画面预留的墙体安全边距。 */
    visualWallClearance: 10,
} as const;
