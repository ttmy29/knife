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
    monsters: MonsterSpawnData[];
}

export type MonsterPrefabType = 'monster1' | 'monster2' | 'monster3' | 'monster4';

export interface MonsterSpawnData {
    name: string;
    prefab: MonsterPrefabType;
    x: number;
    y: number;
    power: number;
    battleRadius?: number;
    z?: number;
}

export const Level1: LevelData = {
    name: '第 1 关（占位）',
    cols: 117,
    rows: 90,
    tileSize: 20,
    playerSpawn: { col: 49, row: 32 }, // 世界坐标 (-180, -250)
    playerPower: 4407,
    monsters: [
        { name: 'monster1', prefab: 'monster1', x: 891, y: 239, power: 5615, battleRadius: 90 },
      //  { name: 'monster2', prefab: 'monster2', x: -310, y: -450, power: 9 },//x -317
        { name: 'monster3', prefab: 'monster3', x: -127, y: -22, power: 1482 },
        { name: 'monster4', prefab: 'monster4', x: -596, y: -212, power: 164 },
        //{ name: 'monster2-1', prefab: 'monster2', x: -485, y: -318, power: 120 },
       // { name: 'monster3-1', prefab: 'monster3', x: -200, y: -280, power: 16 },//-222 -294
        { name: 'monster3-2', prefab: 'monster3', x: -280, y: -170, power: 27 },
        { name: 'monster3-3', prefab: 'monster3', x: -381, y: -7, power: 310 },
       // { name: 'monster3-4', prefab: 'monster3', x: -507, y: -453, power: 43 },
        { name: 'monster3-5', prefab: 'monster3', x: -397, y: -104, power: 41 },
       // { name: 'monster3-6', prefab: 'monster3', x: -521, y: -167, power: 90 },
       // { name: 'monster3-7', prefab: 'monster3', x: -100, y: 114, power: 560 },
        { name: 'monster5', prefab: 'monster4', x:-150, y: 85, power: 512 },//63, 140
        { name: 'monster6', prefab: 'monster2', x: 11, y: -162, power: 231 },
       // { name: 'monster7', prefab: 'monster3', x: 38, y: -276, power: 124 },
       // { name: 'monster8', prefab: 'monster3', x: 211, y: 16, power: 610 },
       // { name: 'monster9', prefab: 'monster2', x: 86, y: -8, power: 280 },
       // { name: 'monster10', prefab: 'monster2', x: 57, y: -610, power: 50 },
      //  { name: 'monster11', prefab: 'monster2', x: -104, y: -426, power: 162 },
        //{ name: 'monster12', prefab: 'monster2', x: -436, y: -660, power: 134 },
        // { name: 'monster3-8', prefab: 'monster3', x: -926, y: -385, power: 38 },
        // { name: 'monster3-9', prefab: 'monster3', x: -926, y: -158, power: 1400 },
        // { name: 'monster3-10', prefab: 'monster3', x: -680, y: 97, power: 912 },
        // { name: 'monster3-11', prefab: 'monster3', x: -418, y: 220, power: 856 },
        { name: 'monster13', prefab: 'monster2', x: 191, y: -168, power: 164 },
      //  { name: 'monster14', prefab: 'monster3', x: 851, y: -316, power: 120 },
        { name: 'monster15', prefab: 'monster3', x: 550, y: -260, power: 820 },
        { name: 'monster16', prefab: 'monster4', x: 753, y: 3, power: 1802 },//733 ,3
       // { name: 'monster17', prefab: 'monster3', x: 417, y: 216, power: 720 },
    ],
};
