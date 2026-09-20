export interface KillUpgradeConfig {
    killCount: number;
    powerGain: number;
}

/** 累计击杀达到对应数量后弹出一次当前技能升级。 */
export const KillUpgradeConfigs: readonly KillUpgradeConfig[] = [
    { killCount: 4, powerGain: 200 },
    { killCount: 10, powerGain: 1000 },
];
