/**
 * 单关配置（需求 16/17）。
 * 目前只设计 1 关：地图尺寸、角色出生点 / 战力集中在这里。
 * 怪物不再写在这里：直接在场景 Monsters 节点下摆放，战力填怪物下面的 Label。
 * 墙体不再写在这里：在场景 Walls 节点下用 WallRegion 组件定义（见 codex.md）。
 * 数值为占位，后续由用户提供真实数值（截图参考：角色 4407，怪物 134 / 560 等）。
 *
 * 地图换算：背景图节点 bg 尺寸 2336x1792（1 世界单位 = 1 图片像素）。
 * tileSize = 每格像素数；cols = ceil(2336 / tileSize)，rows = ceil(1792 / tileSize)。
 * 格子加密到 20px（117x90），墙轮廓更精细，路径贴墙走更平滑；
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

export type MonsterPrefabType = 'monster1' | 'monster2' | 'monster3' | 'monster4';
export type PlayerRolePrefabType = 'role' | 'role1' | 'role2' | 'role3';

export interface MonsterSpawnData {
    name: string;
    prefab: MonsterPrefabType;
    x: number;
    y: number;
    power: number;
    damage: number;
    moveSpeed?: number;
    attackRange?: number;
    attackInterval?: number;
    attackHitDelay?: number;
    battleRadius?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    z?: number;
}

export const Level1: LevelData = {
    name: '第 1 关（占位）',
    cols: 117,
    rows: 90,
    tileSize: 20,
    playerSpawn: { col: 87, row: 20 },
    playerSpawnWorld: { x: -500, y: -470, z: 0 },
    playerScale: { x: 0.6, y: 0.6, z: 1 },
    playerRoleScales: {
        role1: { x: 0.4, y: 0.4, z: 1 },
        role2: { x: 0.6, y: 0.6, z: 1 },
        role3: { x: 0.7, y: 0.7, z: 1 },
    },
    playerPower: 4407,
    monsters: [
        { name: 'monster1', prefab: 'monster1', x: 900, y: 280, power: 7188, damage: 400, battleRadius: 90, attackRange: 90, scaleX: -1,scaleY:1 },//3300
        { name: 'monster4', prefab: 'monster4', x: -365, y: -40, power: 184, damage: 25, scaleX: -0.5 },//-107
        { name: 'monster2', prefab: 'monster2', x: 200, y: -180, power: 664, damage: 60, scaleX: -0.5 },//400
        { name: 'monster3', prefab: 'monster4', x: -560, y: -170, power: 310, damage: 35, scaleX: 0.5 },//-60 -20
        { name: 'monster11', prefab: 'monster2', x: -60, y: 100, power: 512, damage: 50, scaleX: -0.5 },
        { name: 'monster6', prefab: 'monster4', x: 560, y: -320, power: 850, damage: 75, scaleX: -0.5 },
        { name: 'monster7', prefab: 'monster3', x: -280, y: -180, power: 50, damage: 10, scaleX: 0.5 },
        { name: 'monster8', prefab: 'monster2', x: -200, y: -280, power: 25, damage: 5, scaleX: -0.5 },
        { name: 'monster9', prefab: 'monster3', x: 740, y: 20, power: 1809, damage: 120, scaleX: 0.5 },
        { name: 'monster10', prefab: 'monster4', x: 30, y: -170, power: 360, damage: 40, scaleX: -0.5 },
       { name: 'monster5', prefab: 'monster3', x: -120, y: -30, power: 1182, damage: 90, scaleX: -0.5 },
    ],
};
