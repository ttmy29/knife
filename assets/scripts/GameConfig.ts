/**
 * 单关配置（需求 16/17）。
 * 目前只设计 1 关：地图尺寸、角色出生点 / 战力集中在这里。
 * 怪物不再写在这里：直接在场景 Monsters 节点下摆放，战力填怪物下面的 Label。
 * 墙体不再写在这里：在场景 Walls 节点下用 WallRegion 组件定义（见 codex.md）。
 * 数值为占位，后续由用户提供真实数值（截图参考：角色 4407，怪物 134 / 560 等）。
 *
 * 地图换算：背景图节点 bg 尺寸 2336x1792（1 世界单位 = 1 图片像素）。
 * tileSize = 每格像素数；cols = 2336 / tileSize，rows = 1792 / tileSize。
 * 格子加密到 20px（117x90），墙轮廓更精细，路径贴墙走更平滑；
 * 角色显示大小与格子解耦（GameManager 用固定 80 缩放），不受 tileSize 影响。
 */

export interface LevelData {
    name: string;
    cols: number;
    rows: number;
    tileSize: number;
    playerSpawn: { col: number; row: number };
    playerPower: number;
}

export const Level1: LevelData = {
    name: '第 1 关（占位）',
    cols: 117,
    rows: 90,
    tileSize: 20,
    playerSpawn: { col: 37, row: 26 }, // 世界坐标 (-420, -370)
    playerPower: 4407,
};
