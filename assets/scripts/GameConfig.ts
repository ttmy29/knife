/**
 * 单关配置（需求 16/17）。
 * 目前只设计 1 关：地图尺寸、角色出生点 / 战力集中在这里。
 * 怪物不再写在这里：直接在场景 Monsters 节点下摆放，战力填怪物下面的 Label。
 * 墙体不再写在这里：在场景 Walls 节点下用 WallRegion 组件定义（见 codex.md）。
 * 数值为占位，后续由用户提供真实数值（截图参考：角色 4407，怪物 134 / 560 等）。
 *
 * 地图换算：背景图节点 bg 尺寸 2048x1984（1 世界单位 = 1 图片像素）。
 * tileSize = 每格像素数；cols = 2048 / tileSize，rows = 1984 / tileSize。
 * 格子加密到 20px（103x100），墙轮廓更精细，路径贴墙走更平滑；
 * 角色显示大小与格子解耦，优先使用 playerScale / playerRoleScales 配置，不受 tileSize 影响。
 */

export interface LevelData {
    name: string;
    cols: number;
    rows: number;
    tileSize: number;
    playerSpawn: { col: number; row: number };
    playerSpawnWorld?: { x: number; y: number; z?: number };
    playerScale?: { x?: number; y?: number; z?: number };
    playerRoleScales?: Partial<Record<PlayerRolePrefabType, { x?: number; y?: number; z?: number }>>;
    playerPower: number;
    monsters: MonsterSpawnData[];
}

export type MonsterPrefabType = 'monster1' | 'monster2' | 'monster3' | 'monster4' | 'monster5' | 'monster6';
export type PlayerRolePrefabType = 'role' | 'role1' | 'role2' | 'role3';

export interface MonsterSpawnData {
    name: string;
    prefab: MonsterPrefabType;
    x: number;
    y: number;
    power: number;
    battleRadius?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    z?: number;
}

export const Level1: LevelData = {
    name: '第 1 关（占位）',
    cols: 103,
    rows: 100,
    tileSize: 20,
    playerSpawn: { col: 87, row: 20 },
    playerSpawnWorld: { x: 710, y: -600, z: 0 },
    playerScale: { x: -0.7, y: 0.7, z: 1 },
    playerRoleScales: {
        role1: { x: 0.7, y: 0.7, z: 1 },
        role2: { x: 0.7, y: 0.7, z: 1 },
        role3: { x: 0.7, y: 0.7, z: 1 },
    },
    playerPower: 4407,
    monsters: [
        { name: 'monster1', prefab: 'monster1', x: -280, y:510, power: 2700, battleRadius: 90, scaleX: -1,scaleY:1 },//3300
        { name: 'monster4', prefab: 'monster4', x: -107.554, y: 380, power: 450, scaleX: -0.5 },
        { name: 'monster2', prefab: 'monster5', x: 126.462, y: 230.379, power: 1000, scaleX: -0.5 },//400
        { name: 'monster3', prefab: 'monster3', x: -42.007, y: -21.781, power: 250, scaleX: -0.5 },
        { name: 'monster5', prefab: 'monster5', x: -321.68, y: -94.633, power: 200, scaleX: -0.5 },
        { name: 'monster6', prefab: 'monster4', x: 132.602, y: -196.078, power: 50, scaleX: -0.5 },
        { name: 'monster7', prefab: 'monster2', x: -24.497, y: -272.32, power: 50, scaleX: -0.5 },
        { name: 'monster8', prefab: 'monster3', x: 87.701, y: -476.367, power: 25, scaleX: -0.5 },
        { name: 'monster9', prefab: 'monster2', x: 481.93, y: -442.716, power: 9, scaleX: -0.5 },
        { name: 'monster10', prefab: 'monster6', x: 581.161, y: -157.51, power: 60, scaleX: 0.5 },
        { name: 'monster11', prefab: 'monster6', x: -700, y: 62.503, power: 300, scaleX: -0.5 },
    ],
};
