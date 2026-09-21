export interface KillUpgradeConfig {
    killCount: number;
    powerGain: number;
}

/** false：达到击杀数后直接升级；true：恢复弹出 SkillPanel 选择。 */
export const KillUpgradePanelEnabled = false;

/** 累计击杀达到对应数量后触发一次当前技能升级。 */
export const KillUpgradeConfigs: readonly KillUpgradeConfig[] = [
    { killCount: 4, powerGain: 200 },
    { killCount: 10, powerGain: 1000 },
];
