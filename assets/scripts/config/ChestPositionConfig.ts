import type { SkillName } from './SkillConfig';

export type EquipmentName = 'dachui' | 'dao' | 'kuijia' | 'toukui' | 'mount';
export type DisplayItemName = SkillName;

export interface ChestPosition {
    x: number;
    y: number;
    z: number;
}

interface ChestPositionConfigShape {
    box: ChestPosition;
    equipment: Record<EquipmentName, ChestPosition>;
    displayItems: Record<DisplayItemName, ChestPosition>;
    powerSuit: ChestPosition;
}

/** 宝箱、装备、展示物件及力量套装在 GameWorld/boxLayer 下的本地坐标。 */
export const ChestPositionConfig: ChestPositionConfigShape = {
    box: { x: -480, y: -2000, z: 0 },
    equipment: {
        dachui: { x: 30, y: 200, z: 0 },
        dao: { x: -1520, y: -30, z: 0 },//zheg
        kuijia: { x: 80, y: -160, z: 0 },
        toukui: { x: -810, y: -240, z: 0 },
        mount: { x: 35, y: 385, z: 0 },
    },
    displayItems: {
        fireDao: { x: -500, y: -30, z: 0 },
        trop: { x: -350, y: -440, z: 0 },
        wheel: { x: -260, y: 70, z: 0 },
    },
    powerSuit: { x: 685, y: -70, z: 0 },
};
