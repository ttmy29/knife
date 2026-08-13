import { _decorator, Component, Vec2, Vec3 } from 'cc';
import { Monster } from './Monster';
import { Chest } from './Chest';
import { LevelData } from './GameConfig';

const { ccclass } = _decorator;

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
        if (!this.inBounds(to.x, to.y) || this.isWall(to.x, to.y)) return false;
        // 同层寻路（如地面到地面）时，台阶视为墙，不能借台阶穿过平台
        if (stairsBlocked && (this.isStair(from.x, from.y) || this.isStair(to.x, to.y))) return false;
        const diff = Math.abs(this.getHeight(to.x, to.y) - this.getHeight(from.x, from.y));
        if (diff === 0) return true;
        if (diff === 1 && (this.isStair(from.x, from.y) || this.isStair(to.x, to.y))) return true;
        return false;
    }

    private key(col: number, row: number): string {
        return col + ',' + row;
    }

    addMonster(m: Monster): void {
        for (const cell of m.cells) {
            this.monsterMap.set(this.key(cell.x, cell.y), m);
        }
    }

    removeMonster(m: Monster): void {
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
    firstOccupantOnSegment(a: Vec3, b: Vec3): { cell: Vec2; monster: Monster | null; chest: Chest | null } | null {
        const ca = this.worldToGrid(a);
        const cb = this.worldToGrid(b);
        if (!ca || !cb) return null;
        let x = ca.x;
        let y = ca.y;
        // 角色当前站着的怪物/宝箱不算：必须"移动进入"才触发，
        // 避免打完上一只后站在别的占格里被秒开战/秒开箱
        const standMonster = this.getMonsterAt(x, y);
        const standChest = this.getChestAt(x, y);
        const check = (cx: number, cy: number): { cell: Vec2; monster: Monster | null; chest: Chest | null } | null => {
            const m = this.getMonsterAt(cx, cy);
            const c = this.getChestAt(cx, cy);
            if (m && m !== standMonster && this.segmentIntersectsCell(a, b, cx, cy)) {
                return { cell: new Vec2(cx, cy), monster: m, chest: null };
            }
            if (c && c !== standChest && this.segmentIntersectsCell(a, b, cx, cy)) {
                return { cell: new Vec2(cx, cy), monster: null, chest: c };
            }
            return null;
        };
        if (x === cb.x && y === cb.y) return null;
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
                const hit = check(x, y);
                if (hit) return hit;
                continue;
            }
            const hit = check(x, y);
            if (hit) return hit;
        }
        return null;
    }

    /** 真实线段 (a -> b) 是否进入格子 (col,row) 的矩形范围（Liang-Barsky 精确判定） */
    private segmentIntersectsCell(a: Vec3, b: Vec3, col: number, row: number): boolean {
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
                if (q[i] < 0) return false; // 平行且在外侧
            } else {
                const r = q[i] / p[i];
                if (p[i] < 0) {
                    if (r > t1) return false;
                    if (r > t0) t0 = r;
                } else {
                    if (r < t0) return false;
                    if (r < t1) t1 = r;
                }
            }
        }
        return true;
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
            while (j > i + 1 && !this.hasLineOfSight(pts[i], pts[j], stairsBlocked, true)) j--;
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
    private hasLineOfSight(a: Vec2, b: Vec2, stairsBlocked: boolean, blockOccupants = false): boolean {
        if (a.x === b.x && a.y === b.y) return true;
        let x = a.x;
        let y = a.y;
        if (this.blockedCell(x, y, blockOccupants)) return false;

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
                if (this.blockedCell(x + stepX, y, blockOccupants)
                    || this.blockedCell(x, y + stepY, blockOccupants)
                    || this.blockedCell(x + stepX, y + stepY, blockOccupants)) {
                    return false;
                }
                x += stepX;
                y += stepY;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
                if (!this.canMove(new Vec2(prevX, prevY), new Vec2(x, y), stairsBlocked)) return false;
                continue;
            }
            if (this.blockedCell(x, y, blockOccupants)) return false;
            if (!this.canMove(new Vec2(prevX, prevY), new Vec2(x, y), stairsBlocked)) return false;
        }
        return true;
    }
    private blockedCell(col: number, row: number, blockOccupants = true): boolean {
        if (!this.inBounds(col, row) || this.isWall(col, row)) return true;
        if (blockOccupants && (this.isMonsterAt(col, row) || this.isChestAt(col, row))) return true;
        return false;
    }

    /** A*（四方向）；怪物格视为可通行，用于搜索，最终路径会在怪前截断 */
    private aStar(start: Vec2, goal: Vec2): Vec2[] | null {
        const key = (c: number, r: number) => c + ',' + r;
        const open: Array<{ c: number; r: number; g: number; f: number }> = [];
        const cameFrom = new Map<string, string>();
        const gScore = new Map<string, number>();
        const sKey = key(start.x, start.y);
        open.push({ c: start.x, r: start.y, g: 0, f: this.heuristic(start, goal) });
        gScore.set(sKey, 0);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        // 起点与终点同层（如地面到地面）且都不在台阶上时，台阶视为墙；
        // 目标是台阶 / 起点在台阶上时，台阶必须可走（上台阶、下台阶）
        const stairsBlocked = this.getHeight(start.x, start.y) === this.getHeight(goal.x, goal.y)
            && !this.isStair(start.x, start.y)
            && !this.isStair(goal.x, goal.y);

        while (open.length > 0) {
            open.sort((a, b) => a.f - b.f);
            const cur = open.shift()!;
            if (cur.c === goal.x && cur.r === goal.y) {
                const cells: Vec2[] = [];
                let k = key(cur.c, cur.r);
                while (true) {
                    const parts = k.split(',');
                    cells.push(new Vec2(parseInt(parts[0]), parseInt(parts[1])));
                    if (!cameFrom.has(k)) break;
                    k = cameFrom.get(k)!;
                }
                cells.reverse();
                cells.shift(); // 去掉起点格
                return cells;
            }
            for (const d of dirs) {
                const nc = cur.c + d[0];
                const nr = cur.r + d[1];
                if (!this.canMove(new Vec2(cur.c, cur.r), new Vec2(nc, nr), stairsBlocked)) continue;
                const nk = key(nc, nr);
                const tentative = cur.g + 1;
                if (!gScore.has(nk) || tentative < gScore.get(nk)!) {
                    gScore.set(nk, tentative);
                    cameFrom.set(nk, key(cur.c, cur.r));
                    open.push({
                        c: nc, r: nr, g: tentative,
                        f: tentative + this.heuristic(new Vec2(nc, nr), goal),
                    });
                }
            }
        }
        return null;
    }

    private heuristic(a: Vec2, b: Vec2): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
}
