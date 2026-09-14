import { _decorator, Component, Vec2, Vec3 } from 'cc';
import { Monster } from './Monster';
import { Chest } from './Chest';
import { LevelData } from './GameConfig';

const { ccclass } = _decorator;

interface OccupantHit {
    cell: Vec2;
    monster: Monster | null;
    chest: Chest | null;
    entry?: Vec3;
}

export interface MonsterPathHit {
    monster: Monster;
    entry: Vec3;
    segmentIndex: number;
}

/**
 * 格子地图：墙体占用表 + 怪物占用表 + A* 寻路。
 * 挂在 GameWorld 上（GameManager 会自动添加）。
 */
@ccclass('Grid')
export class Grid extends Component {
    public cols = 0;
    public rows = 0;
    public tileSize = 100;

    private cells: number[][] = [];
    private heights: number[][] = [];
    private stairs: boolean[][] = [];
    private monsterMap: Map<string, Monster> = new Map();
    private monsters: Set<Monster> = new Set();
    private chestMap: Map<string, Chest> = new Map();

    init(data: LevelData): void {
        this.cols = data.cols;
        this.rows = data.rows;
        this.tileSize = data.tileSize;
        this.cells = [];
        this.heights = [];
        this.stairs = [];
        for (let r = 0; r < this.rows; r++) {
            const rowArr: number[] = [];
            const heightArr: number[] = [];
            const stairArr: boolean[] = [];
            for (let c = 0; c < this.cols; c++) rowArr.push(0);
            for (let c = 0; c < this.cols; c++) heightArr.push(0);
            for (let c = 0; c < this.cols; c++) stairArr.push(false);
            this.cells.push(rowArr);
            this.heights.push(heightArr);
            this.stairs.push(stairArr);
        }
    }

    inBounds(col: number, row: number): boolean {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    isWall(col: number, row: number): boolean {
        return this.inBounds(col, row) && this.cells[row][col] === 1;
    }

    setWall(col: number, row: number, isWall: boolean): void {
        if (!this.inBounds(col, row)) return;
        this.cells[row][col] = isWall ? 1 : 0;
    }

    setHeight(col: number, row: number, h: number): void {
        if (!this.inBounds(col, row)) return;
        this.heights[row][col] = h;
    }

    getHeight(col: number, row: number): number {
        return this.inBounds(col, row) ? this.heights[row][col] : 0;
    }

    setStair(col: number, row: number, isStair: boolean): void {
        if (!this.inBounds(col, row)) return;
        this.stairs[row][col] = isStair;
    }

    isStair(col: number, row: number): boolean {
        return this.inBounds(col, row) && this.stairs[row][col];
    }

    /**
     * 相邻两格能否通行（高度系统）：
     * - 目标是墙 -> 不可通行
     * - 同高度 -> 可通行
     * - 高度差 1，且其中一格是台阶 -> 可通行（通过台阶上下）
     * - 高度差 1 但没有台阶 -> 不可通行（不能直接爬上去 / 跳下来）
     * - 高度差 > 1 -> 不可通行
     */
    canMove(from: Vec2, to: Vec2, stairsBlocked = false): boolean {
        return this.canMoveCells(from.x, from.y, to.x, to.y, stairsBlocked);
    }

    private canMoveCells(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
        stairsBlocked = false,
    ): boolean {
        if (!this.inBounds(toCol, toRow) || this.isWall(toCol, toRow)) return false;
        // 同层寻路（如地面到地面）时，台阶视为墙，不能借台阶穿过平台
        if (stairsBlocked && (this.isStair(fromCol, fromRow) || this.isStair(toCol, toRow))) return false;
        const diff = Math.abs(this.getHeight(toCol, toRow) - this.getHeight(fromCol, fromRow));
        if (diff === 0) return true;
        if (diff === 1 && (this.isStair(fromCol, fromRow) || this.isStair(toCol, toRow))) return true;
        return false;
    }

    private key(col: number, row: number): string {
        return col + ',' + row;
    }

    addMonster(m: Monster): void {
        this.monsters.add(m);
        for (const cell of m.cells) {
            this.monsterMap.set(this.key(cell.x, cell.y), m);
        }
    }

    removeMonster(m: Monster): void {
        this.monsters.delete(m);
        for (const cell of m.cells) {
            const k = this.key(cell.x, cell.y);
            if (this.monsterMap.get(k) === m) {
                this.monsterMap.delete(k);
            }
        }
    }

    isMonsterAt(col: number, row: number): boolean {
        return this.monsterMap.has(this.key(col, row));
    }

    getMonsterAt(col: number, row: number): Monster | null {
        return this.monsterMap.get(this.key(col, row)) || null;
    }

    addChest(c: Chest): void {
        for (const cell of c.cells) {
            this.chestMap.set(this.key(cell.x, cell.y), c);
        }
    }

    removeChest(c: Chest): void {
        for (const cell of c.cells) {
            const k = this.key(cell.x, cell.y);
            if (this.chestMap.get(k) === c) this.chestMap.delete(k);
        }
    }

    isChestAt(col: number, row: number): boolean {
        return this.chestMap.has(this.key(col, row));
    }

    getChestAt(col: number, row: number): Chest | null {
        return this.chestMap.get(this.key(col, row)) || null;
    }

    /**
     * 线段（世界坐标 a -> b）上第一个会被角色碰到的阻挡物（怪物 / 宝箱）。
     * 先用格子遍历快速找候选格，再用真实线段与格子矩形做精确相交校验，
     * 避免角色停在贴墙角点（偏离格心）时"格心连线"误判碰到怪物。
     */
    firstOccupantOnSegment(a: Vec3, b: Vec3, ignoredMonster: Monster | null = null): OccupantHit | null {
        const ca = this.worldToGrid(a);
        const cb = this.worldToGrid(b);
        if (!ca || !cb) return null;
        let x = ca.x;
        let y = ca.y;
        let bestHit: OccupantHit | null = null;
        let bestDistSq = Infinity;

        // 怪物格只用于登记；战斗使用脚下圆的真实进入点，避免整格提前触发。
        const center = new Vec3();
        for (const monster of this.monsters) {
            if (monster === ignoredMonster) continue;
            if (!monster.node || !monster.node.isValid) continue;
            // 黄光会临时改变怪物父节点，圆心始终换算回 GameWorld 本地坐标。
            this.node.inverseTransformPoint(center, monster.node.worldPosition);
            const entry = this.segmentCircleEntry(a, b, center, monster.battleRadius);
            if (!entry) continue;
            const distSq = (entry.x - a.x) ** 2 + (entry.y - a.y) ** 2;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestHit = {
                    cell: new Vec2(monster.gridCol, monster.gridRow),
                    monster,
                    chest: null,
                    entry,
                };
            }
        }

        // 角色当前站着的宝箱不算：必须移动进入才触发。
        const standChest = this.getChestAt(x, y);
        const check = (cx: number, cy: number): void => {
            const c = this.getChestAt(cx, cy);
            if (c && c !== standChest) {
                const entry = this.segmentCellEntry(a, b, cx, cy);
                if (!entry) return;
                const distSq = (entry.x - a.x) ** 2 + (entry.y - a.y) ** 2;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestHit = { cell: new Vec2(cx, cy), monster: null, chest: c };
                }
            }
        };
        if (x === cb.x && y === cb.y) return bestHit;
        const dx = cb.x - ca.x;
        const dy = cb.y - ca.y;
        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const tDeltaX = stepX !== 0 ? 1 / absDx : Infinity;
        const tDeltaY = stepY !== 0 ? 1 / absDy : Infinity;
        let tMaxX = stepX !== 0 ? 0.5 / absDx : Infinity;
        let tMaxY = stepY !== 0 ? 0.5 / absDy : Infinity;
        const EPS = 1e-9;
        while (x !== cb.x || y !== cb.y) {
            const d = tMaxX - tMaxY;
            if (d < -EPS) {
                x += stepX;
                tMaxX += tDeltaX;
            } else if (d > EPS) {
                y += stepY;
                tMaxY += tDeltaY;
            } else {
                x += stepX;
                y += stepY;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
                // 只算真正进入的格子；斜穿角时路径只是擦过旁边格，不算碰到
                check(x, y);
                continue;
            }
            check(x, y);
        }
        return bestHit;
    }

    /** 按路径先后顺序查找第一只怪物；宝箱先出现时由原有开箱逻辑处理。 */
    firstMonsterOnPath(waypoints: Vec3[]): MonsterPathHit | null {
        for (let i = 0; i < waypoints.length - 1; i++) {
            const hit = this.firstOccupantOnSegment(waypoints[i], waypoints[i + 1]);
            if (!hit) continue;
            if (!hit.monster) return null;
            return {
                monster: hit.monster,
                entry: (hit.entry || waypoints[i + 1]).clone(),
                segmentIndex: i,
            };
        }
        return null;
    }

    /** 线段进入怪物脚下圆的第一个点；已经在圆内时保持当前位置，不向后拉角色。 */
    private segmentCircleEntry(a: Vec3, b: Vec3, center: Vec3, radius: number): Vec3 | null {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const fx = a.x - center.x;
        const fy = a.y - center.y;
        const lengthSq = dx * dx + dy * dy;
        const radiusSq = radius * radius;
        if (fx * fx + fy * fy <= radiusSq) return a.clone();
        if (lengthSq <= 1e-8) return null;

        const projection = fx * dx + fy * dy;
        const discriminant = projection * projection - lengthSq * (fx * fx + fy * fy - radiusSq);
        if (discriminant < 0) return null;
        const t = (-projection - Math.sqrt(discriminant)) / lengthSq;
        if (t < 0 || t > 1) return null;
        return new Vec3(a.x + dx * t, a.y + dy * t, a.z);
    }

    /** 真实线段进入格子矩形的第一个点（Liang-Barsky 精确判定）。 */
    private segmentCellEntry(a: Vec3, b: Vec3, col: number, row: number): Vec3 | null {
        const c = this.gridToWorld(col, row);
        const half = this.tileSize / 2;
        const minX = c.x - half;
        const maxX = c.x + half;
        const minY = c.y - half;
        const maxY = c.y + half;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let t0 = 0;
        let t1 = 1;
        // 四个边界：左/右/下/上
        const p = [-dx, dx, -dy, dy];
        const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) {
                if (q[i] < 0) return null; // 平行且在外侧
            } else {
                const r = q[i] / p[i];
                if (p[i] < 0) {
                    if (r > t1) return null;
                    if (r > t0) t0 = r;
                } else {
                    if (r < t0) return null;
                    if (r < t1) t1 = r;
                }
            }
        }
        return new Vec3(a.x + dx * t0, a.y + dy * t0, a.z);
    }

    /** 格子中心 -> 世界坐标（地图以 GameWorld 原点为中心） */
    gridToWorld(col: number, row: number): Vec3 {
        const x = (col - this.cols / 2 + 0.5) * this.tileSize;
        const y = (row - this.rows / 2 + 0.5) * this.tileSize;
        return new Vec3(x, y, 0);
    }

    /** 世界坐标 -> 格子坐标，越界返回 null */
    worldToGrid(pos: Vec3): Vec2 | null {
        const col = Math.floor(pos.x / this.tileSize + this.cols / 2);
        const row = Math.floor(pos.y / this.tileSize + this.rows / 2);
        if (!this.inBounds(col, row)) return null;
        return new Vec2(col, row);
    }

    /**
     * 寻找远离指定怪物、并且位于战斗范围外的合法闪避落点。
     * 闪避是一次短距离位移，不跨墙、不跨层，也不会落到怪物或宝箱占用格。
     */
    findDodgeEscapePosition(
        startWorld: Vec3,
        monster: Monster,
        battleDistance: number,
        preferredMoveDistance: number,
        exitPadding: number,
        visualOffsetX: number,
        visualOffsetY: number,
        visualWallClearance: number,
    ): Vec3 | null {
        if (!monster.node || !monster.node.isValid) return null;
        const startCell = this.worldToGrid(startWorld);
        if (!startCell) return null;

        const monsterCenter = new Vec3();
        this.node.inverseTransformPoint(monsterCenter, monster.node.worldPosition);
        let awayX = startWorld.x - monsterCenter.x;
        let awayY = startWorld.y - monsterCenter.y;
        const awayLength = Math.sqrt(awayX * awayX + awayY * awayY);
        if (awayLength > 0.001) {
            awayX /= awayLength;
            awayY /= awayLength;
        } else {
            awayX = 1;
            awayY = 0;
        }

        const requiredMonsterDistance = Math.max(0, battleDistance) + Math.max(0, exitPadding);
        const preferredDistance = Math.max(this.tileSize, preferredMoveDistance);
        const searchRadius = Math.ceil((preferredDistance + this.tileSize * 4) / this.tileSize);
        const startHeight = this.getHeight(startCell.x, startCell.y);
        const blocked = (col: number, row: number): boolean => {
            if (!this.inBounds(col, row) || this.isWall(col, row) || this.isChestAt(col, row)) {
                return true;
            }
            // 角色可能站在当前战斗怪物的大占格范围内；允许从该占格向外闪避。
            const occupant = this.getMonsterAt(col, row);
            return !!occupant && occupant !== monster;
        };
        const visuallyBlocked = (col: number, row: number): boolean =>
            !this.inBounds(col, row)
            || this.isWall(col, row)
            || this.getHeight(col, row) !== startHeight;

        const hasVisualClearance = (candidate: Vec3, targetCell: Vec2): boolean => {
            const visualPeak = new Vec3(
                candidate.x + visualOffsetX,
                candidate.y + visualOffsetY,
                candidate.z,
            );
            const peakCell = this.worldToGrid(visualPeak);
            if (!peakCell || visuallyBlocked(peakCell.x, peakCell.y)) return false;

            // 根节点落点合法还不够：继续检查 Spine 自带后退所经过的整段路径。
            const peakStairsBlocked = !this.isStair(targetCell.x, targetCell.y)
                && !this.isStair(peakCell.x, peakCell.y);
            if (!this.hasLineOfSight(targetCell, peakCell, peakStairsBlocked, false, visuallyBlocked)) {
                return false;
            }
            const fullPathStairsBlocked = !this.isStair(startCell.x, startCell.y)
                && !this.isStair(peakCell.x, peakCell.y);
            if (!this.hasLineOfSight(startCell, peakCell, fullPathStairsBlocked, false, visuallyBlocked)) {
                return false;
            }

            const clearance = Math.max(0, visualWallClearance);
            if (clearance <= 0) return true;
            const checkPoints = [
                new Vec3(visualPeak.x + clearance, visualPeak.y, visualPeak.z),
                new Vec3(visualPeak.x - clearance, visualPeak.y, visualPeak.z),
                new Vec3(visualPeak.x, visualPeak.y + clearance, visualPeak.z),
                new Vec3(visualPeak.x, visualPeak.y - clearance, visualPeak.z),
            ];
            for (const point of checkPoints) {
                const cell = this.worldToGrid(point);
                if (!cell || visuallyBlocked(cell.x, cell.y)) return false;
            }
            return true;
        };

        const search = (requireAwayDirection: boolean): Vec3 | null => {
            let best: { position: Vec3; score: number } | null = null;
            for (let row = startCell.y - searchRadius; row <= startCell.y + searchRadius; row++) {
                for (let col = startCell.x - searchRadius; col <= startCell.x + searchRadius; col++) {
                    if (blocked(col, row) || this.getHeight(col, row) !== startHeight) continue;
                    const candidate = this.gridToWorld(col, row);
                    candidate.z = startWorld.z;
                    const fromMonsterX = candidate.x - monsterCenter.x;
                    const fromMonsterY = candidate.y - monsterCenter.y;
                    const monsterDistance = Math.sqrt(
                        fromMonsterX * fromMonsterX + fromMonsterY * fromMonsterY,
                    );
                    if (monsterDistance < requiredMonsterDistance) continue;

                    const moveX = candidate.x - startWorld.x;
                    const moveY = candidate.y - startWorld.y;
                    const moveDistance = Math.sqrt(moveX * moveX + moveY * moveY);
                    if (moveDistance < 0.001) continue;
                    const directionDot = (moveX * awayX + moveY * awayY) / moveDistance;
                    if (requireAwayDirection && directionDot < 0.25) continue;

                    const targetCell = new Vec2(col, row);
                    const stairsBlocked = !this.isStair(startCell.x, startCell.y)
                        && !this.isStair(col, row);
                    if (!this.hasLineOfSight(startCell, targetCell, stairsBlocked, false, blocked)) continue;
                    if (!hasVisualClearance(candidate, targetCell)) continue;

                    const directionPenalty = (1 - directionDot) * preferredDistance;
                    const distancePenalty = Math.abs(moveDistance - preferredDistance) * 2;
                    const score = directionPenalty + distancePenalty + moveDistance * 0.05;
                    if (!best || score < best.score) best = { position: candidate, score };
                }
            }
            return best ? best.position : null;
        };

        return search(true) || search(false);
    }

    /**
     * 寻路（需求 1/2/3/8/9/10）。
     * - 目标是墙 / 越界 -> null（无反应）
     * - 怪物格可通行：无论点击怪物还是怪物身后的地面，路径都完整画到目标（穿过怪物格，绿线到怪物脚下）；
     *   角色在移动中即将进入怪物格时由 Player 停下并触发战斗（此时剩余绿线整体消失）
     * 返回的 path 不含起点格。
     */
    findPath(start: Vec2, target: Vec2): { path: Vec2[]; blockMonster: Monster | null } | null {
        if (!this.inBounds(target.x, target.y) || this.isWall(target.x, target.y)) return null;
        if (start.x === target.x && start.y === target.y) return null;

        const raw = this.aStar(start, target);
        if (!raw || raw.length === 0) return null;
        return { path: raw, blockMonster: null };
    }

    /**
     * 从点击起点直接寻路到怪物左右扇区内的战斗点。
     * 候选点按可达路径长度选择，目标怪物中心区域在寻路时视为障碍。
     */
    buildBattleApproachPath(startWorld: Vec3, hit: MonsterPathHit, distanceOverride?: number): Vec3[] | null {
        const monster = hit.monster;
        if (!monster.node || !monster.node.isValid) return null;
        const startCell = this.worldToGrid(startWorld);
        if (!startCell) return null;

        const center = new Vec3();
        this.node.inverseTransformPoint(center, monster.node.worldPosition);
        const battleDistance = distanceOverride === undefined
            ? monster.battleRadius
            : Math.max(0, distanceOverride);
        const radius = Math.max(battleDistance, this.tileSize * 1.5);
        const limit = Math.max(0, Math.min(89, monster.battleAngleLimit));
        const entryDx = hit.entry.x - center.x;
        const entryDy = hit.entry.y - center.y;
        const entryAngle = Math.atan2(entryDy, Math.max(0.001, Math.abs(entryDx))) * 180 / Math.PI;
        const preferredSide = Math.abs(entryDx) > 0.5
            ? Math.sign(entryDx)
            : (Math.abs(startWorld.x - center.x) > 0.5 ? Math.sign(startWorld.x - center.x) : -1);
        const desiredAngle = Math.max(-limit, Math.min(limit, entryAngle));
        const angles: number[] = [];
        const addAngle = (angle: number): void => {
            const clamped = Math.max(-limit, Math.min(limit, angle));
            if (!angles.some((value) => Math.abs(value - clamped) < 0.01)) angles.push(clamped);
        };
        addAngle(desiredAngle);
        addAngle(0);
        for (let angle = 10; angle <= limit; angle += 10) {
            addAngle(desiredAngle - angle);
            addAngle(desiredAngle + angle);
        }
        addAngle(-limit);
        addAngle(limit);

        let best: { path: Vec3[]; score: number } | null = null;
        for (const side of [preferredSide, -preferredSide]) {
            for (const angle of angles) {
                const rad = angle * Math.PI / 180;
                const candidate = new Vec3(
                    center.x + side * Math.cos(rad) * radius,
                    center.y + Math.sin(rad) * radius,
                    startWorld.z,
                );
                const targetCell = this.worldToGrid(candidate);
                if (!targetCell || this.isWall(targetCell.x, targetCell.y) || this.isStair(targetCell.x, targetCell.y)) continue;
                if (this.isChestAt(targetCell.x, targetCell.y)) continue;
                const targetOccupant = this.getMonsterAt(targetCell.x, targetCell.y);
                if (targetOccupant && targetOccupant !== monster) continue;

                const isBlocked = (col: number, row: number): boolean => {
                    if (!this.inBounds(col, row) || this.isWall(col, row) || this.isChestAt(col, row)) return true;
                    if ((col === startCell.x && row === startCell.y)
                        || (col === targetCell.x && row === targetCell.y)) return false;
                    const occupant = this.getMonsterAt(col, row);
                    if (occupant && occupant !== monster) return true;
                    if (occupant === monster) {
                        const cellCenter = this.gridToWorld(col, row);
                        const dx = cellCenter.x - center.x;
                        const dy = cellCenter.y - center.y;
                        const innerRadius = Math.max(this.tileSize, radius * 0.65);
                        return dx * dx + dy * dy < innerRadius * innerRadius;
                    }
                    return false;
                };
                const stairsBlocked = this.getHeight(startCell.x, startCell.y) === this.getHeight(targetCell.x, targetCell.y)
                    && !this.isStair(startCell.x, startCell.y)
                    && !this.isStair(targetCell.x, targetCell.y);
                if (this.hasLineOfSight(startCell, targetCell, stairsBlocked, false, isBlocked)) {
                    const path = [startWorld.clone()];
                    if (Vec3.distance(startWorld, candidate) > 0.01) path.push(candidate);
                    const sidePenalty = side === preferredSide ? 0 : this.tileSize * 0.25;
                    const score = this.pathLength(path) + sidePenalty;
                    if (!best || score < best.score) best = { path, score };
                    continue;
                }
                const raw = this.aStar(startCell, targetCell, isBlocked);
                if (!raw) continue;
                const path = this.buildCustomMovePath(startCell, raw, startWorld, candidate, isBlocked);
                const sidePenalty = side === preferredSide ? 0 : this.tileSize * 0.25;
                const score = this.pathLength(path) + sidePenalty;
                if (!best || score < best.score) best = { path, score };
            }
        }
        return best ? best.path : null;
    }

    private buildCustomMovePath(
        startCell: Vec2,
        raw: Vec2[],
        startWorld: Vec3,
        exactTarget: Vec3,
        isBlocked: (col: number, row: number) => boolean,
    ): Vec3[] {
        const cells: Vec2[] = [startCell, ...raw];
        const pulled: Vec2[] = [startCell];
        const targetCell = cells[cells.length - 1];
        const stairsBlocked = this.getHeight(startCell.x, startCell.y) === this.getHeight(targetCell.x, targetCell.y)
            && !this.isStair(startCell.x, startCell.y)
            && !this.isStair(targetCell.x, targetCell.y);
        let index = 0;
        while (index < cells.length - 1) {
            let next = cells.length - 1;
            while (next > index + 1
                && !this.hasLineOfSight(cells[index], cells[next], stairsBlocked, false, isBlocked)) next--;
            pulled.push(cells[next]);
            index = next;
        }

        const path: Vec3[] = [startWorld.clone()];
        for (let i = 1; i < pulled.length - 1; i++) {
            path.push(this.wallHugCorner(pulled[i - 1], pulled[i], pulled[i + 1]));
        }
        if (Vec3.distance(path[path.length - 1], exactTarget) > 0.01) path.push(exactTarget);
        return path;
    }

    private pathLength(path: Vec3[]): number {
        let length = 0;
        for (let i = 0; i < path.length - 1; i++) length += Vec3.distance(path[i], path[i + 1]);
        return length;
    }

    /**
     * 生成实际移动路径：A* 路径字符串拉直 + 拐点贴墙偏移。
     * 返回世界坐标点列（首点为起点精确位置），路径沿墙体外侧 WALL_GAP 距离行走。
     */
    buildMovePath(startCell: Vec2, path: Vec2[], startWorld: Vec3): Vec3[] {
        if (path.length === 0) return [startWorld.clone()];
        const pts: Vec2[] = [startCell];
        for (const p of path) pts.push(p);
        // 起点与终点同层（如地面到地面）且都不在台阶上时，台阶视为墙；
        // 目标就是台阶 / 起点在台阶上时，台阶必须可走（上台阶、下台阶）
        const lastCell = path[path.length - 1];
        const stairsBlocked = this.getHeight(startCell.x, startCell.y) === this.getHeight(lastCell.x, lastCell.y)
            && !this.isStair(startCell.x, startCell.y)
            && !this.isStair(lastCell.x, lastCell.y);

        // 1) 字符串拉直：只保留必要的拐点（含起点、怪物格、终点）
        const pulled: Vec2[] = [pts[0]];
        let i = 0;
        while (i < pts.length - 1) {
            let j = pts.length - 1;
            while (j > i + 1 && !this.hasLineOfSight(pts[i], pts[j], stairsBlocked, false)) j--;
            pulled.push(pts[j]);
            i = j;
        }

        // 2) 拐点贴墙：转弯处把点外移到墙角外侧，使路径贴着墙走
        const waypoints: Vec3[] = [startWorld.clone()];
        for (let k = 1; k < pulled.length - 1; k++) {
            waypoints.push(this.wallHugCorner(pulled[k - 1], pulled[k], pulled[k + 1]));
        }
        waypoints.push(this.gridToWorld(pulled[pulled.length - 1].x, pulled[pulled.length - 1].y));
        return waypoints;
    }

    /** 贴墙间距（世界单位）：路径中心线离墙面的距离 */
    private static readonly WALL_GAP = 6;

    /** 拐角贴墙点：找到拐弯格斜对角被墙占用的格子，把点外移到该墙角外侧 WALL_GAP 处 */
    private wallHugCorner(prev: Vec2, cur: Vec2, next: Vec2): Vec3 {
        const dirInX = Math.sign(cur.x - prev.x);
        const dirInY = Math.sign(cur.y - prev.y);
        const dirOutX = Math.sign(next.x - cur.x);
        const dirOutY = Math.sign(next.y - cur.y);
        if (dirInX === dirOutX && dirInY === dirOutY) {
            return this.gridToWorld(cur.x, cur.y);
        }

        // 检查 4 个斜对角，取被墙占用的那个（路径转弯必然绕着一个墙角）
        const diagonals: Array<[number, number]> = [
            [1, 1], [1, -1], [-1, 1], [-1, -1],
        ];
        for (const [sx, sy] of diagonals) {
            const bx = cur.x + sx;
            const by = cur.y + sy;
            if (!this.inBounds(bx, by) || !this.isWall(bx, by)) continue;
            const center = this.gridToWorld(bx, by);
            const half = this.tileSize / 2;
            const gap = Grid.WALL_GAP;
            const wp = new Vec3(
                center.x - sx * (half + gap),
                center.y - sy * (half + gap),
                0,
            );
            // 窄通道里外移可能撞到另一侧墙，回退到格子中心
            const cell = this.worldToGrid(wp);
            if (!cell || this.isWall(cell.x, cell.y)) {
                return this.gridToWorld(cur.x, cur.y);
            }
            return wp;
        }
        return this.gridToWorld(cur.x, cur.y);
    }

    /**
     * 两点之间直线是否可通行：从 a 格中心到 b 格中心做网格精确遍历（超覆盖），
     * 逐格检测墙 / 怪物 / 越界。原来的“沿线撒点”会在斜切墙角时漏检导致穿墙。
     */
    private hasLineOfSight(
        a: Vec2,
        b: Vec2,
        stairsBlocked: boolean,
        blockOccupants = false,
        customBlocked?: (col: number, row: number) => boolean,
    ): boolean {
        if (a.x === b.x && a.y === b.y) return true;
        let x = a.x;
        let y = a.y;
        const blocked = customBlocked || ((col: number, row: number) => this.blockedCell(col, row, blockOccupants));
        if (blocked(x, y)) return false;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const tDeltaX = stepX !== 0 ? 1 / absDx : Infinity;
        const tDeltaY = stepY !== 0 ? 1 / absDy : Infinity;
        let tMaxX = stepX !== 0 ? 0.5 / absDx : Infinity;
        let tMaxY = stepY !== 0 ? 0.5 / absDy : Infinity;
        const EPS = 1e-9;

        while (x !== b.x || y !== b.y) {
            const d = tMaxX - tMaxY;
            const prevX = x;
            const prevY = y;
            if (d < -EPS) {
                x += stepX;
                tMaxX += tDeltaX;
            } else if (d > EPS) {
                y += stepY;
                tMaxY += tDeltaY;
            } else {
                if (blocked(x + stepX, y)
                    || blocked(x, y + stepY)
                    || blocked(x + stepX, y + stepY)) {
                    return false;
                }
                x += stepX;
                y += stepY;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
                if (!this.canMoveCells(prevX, prevY, x, y, stairsBlocked)) return false;
                continue;
            }
            if (blocked(x, y)) return false;
            if (!this.canMoveCells(prevX, prevY, x, y, stairsBlocked)) return false;
        }
        return true;
    }
    private blockedCell(col: number, row: number, blockOccupants = true): boolean {
        if (!this.inBounds(col, row) || this.isWall(col, row)) return true;
        if (blockOccupants && (this.isMonsterAt(col, row) || this.isChestAt(col, row))) return true;
        return false;
    }

    /** A*（四方向）；怪物格视为可通行，用于搜索，最终路径会在怪前截断 */
    private aStar(start: Vec2, goal: Vec2, customBlocked?: (col: number, row: number) => boolean): Vec2[] | null {
        interface OpenNode {
            index: number;
            g: number;
            f: number;
        }

        const total = this.cols * this.rows;
        const indexOf = (col: number, row: number): number => row * this.cols + col;
        const startIndex = indexOf(start.x, start.y);
        const goalIndex = indexOf(goal.x, goal.y);
        const cameFrom = new Int32Array(total);
        const gScore = new Float64Array(total);
        cameFrom.fill(-1);
        gScore.fill(Number.POSITIVE_INFINITY);
        gScore[startIndex] = 0;

        const open: OpenNode[] = [];
        const isBefore = (a: OpenNode, b: OpenNode): boolean =>
            a.f < b.f || (a.f === b.f && a.g > b.g);
        const pushOpen = (node: OpenNode): void => {
            let index = open.length;
            open.push(node);
            while (index > 0) {
                const parent = (index - 1) >> 1;
                if (!isBefore(open[index], open[parent])) break;
                const tmp = open[parent];
                open[parent] = open[index];
                open[index] = tmp;
                index = parent;
            }
        };
        const popOpen = (): OpenNode | null => {
            if (open.length === 0) return null;
            const first = open[0];
            const last = open.pop()!;
            if (open.length > 0) {
                open[0] = last;
                let index = 0;
                while (true) {
                    const left = index * 2 + 1;
                    if (left >= open.length) break;
                    const right = left + 1;
                    let next = left;
                    if (right < open.length && isBefore(open[right], open[left])) next = right;
                    if (!isBefore(open[next], open[index])) break;
                    const tmp = open[index];
                    open[index] = open[next];
                    open[next] = tmp;
                    index = next;
                }
            }
            return first;
        };
        pushOpen({
            index: startIndex,
            g: 0,
            f: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y),
        });

        const dirCols = [1, -1, 0, 0];
        const dirRows = [0, 0, 1, -1];
        // 起点与终点同层（如地面到地面）且都不在台阶上时，台阶视为墙；
        // 目标是台阶 / 起点在台阶上时，台阶必须可走（上台阶、下台阶）
        const stairsBlocked = this.getHeight(start.x, start.y) === this.getHeight(goal.x, goal.y)
            && !this.isStair(start.x, start.y)
            && !this.isStair(goal.x, goal.y);

        while (open.length > 0) {
            const cur = popOpen()!;
            if (cur.g !== gScore[cur.index]) continue;
            const curCol = cur.index % this.cols;
            const curRow = Math.floor(cur.index / this.cols);
            if (cur.index === goalIndex) {
                const cells: Vec2[] = [];
                let index = goalIndex;
                while (index !== startIndex) {
                    cells.push(new Vec2(index % this.cols, Math.floor(index / this.cols)));
                    index = cameFrom[index];
                    if (index < 0) return null;
                }
                cells.reverse();
                return cells;
            }
            for (let i = 0; i < 4; i++) {
                const nc = curCol + dirCols[i];
                const nr = curRow + dirRows[i];
                if (!this.canMoveCells(curCol, curRow, nc, nr, stairsBlocked)) continue;
                if (customBlocked && customBlocked(nc, nr)) continue;
                const nextIndex = indexOf(nc, nr);
                const tentative = cur.g + 1;
                if (tentative < gScore[nextIndex]) {
                    gScore[nextIndex] = tentative;
                    cameFrom[nextIndex] = cur.index;
                    pushOpen({
                        index: nextIndex,
                        g: tentative,
                        f: tentative + Math.abs(nc - goal.x) + Math.abs(nr - goal.y),
                    });
                }
            }
        }
        return null;
    }
}
