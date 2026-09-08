import { _decorator, Component, Graphics, Color, Vec3 } from 'cc';

const { ccclass } = _decorator;

interface PathDot {
    point: Vec3;
    dist: number;
}

/**
 * 点状路径提示：点击时一次性把整条路线采样成路径点，
 * 角色走过一段就擦掉一段，目标点画淡色空心圆。
 */
@ccclass('PathLine')
export class PathLine extends Component {
    /** 拐角圆角半径（世界单位），由 GameManager 设置 */
    public cornerRadius = 14;
    /** 移动过程中重画剩余路径的最小间隔（秒）。 */
    public redrawInterval = 0.06;

    private graphics: Graphics | null = null;
    private points: Vec3[] = [];
    private target: Vec3 | null = null;
    /** 点击时算好的完整折线（含贝塞尔圆角采样点），后续不再变化 */
    private cachedPts: Vec3[] = [];
    /** 路径点（锚定在路径几何上） */
    private pathDots: PathDot[] = [];
    private redrawElapsed = 0;
    /** 路径小圆点半径。 */
    private readonly dotRadius = 4;
    /** 路径小圆点之间的距离。 */
    private readonly dotSpacing = 36;
    /** 第一个路径点距离起点的距离，避免贴住角色脚下。 */
    private readonly firstDotOffset = 24;
    /** 终点空心圆半径。 */
    private readonly targetRadius = 8;
    /** 最后一个路径点到终点空心圆外边缘的距离。 */
    private readonly targetDotGap = 15;

    onLoad(): void {
        this.graphics = this.node.getComponent(Graphics) || this.node.addComponent(Graphics);
    }

    /** 点击时调用：一次性绘制最终路线 */
    drawPath(worldPoints: Vec3[], target: Vec3): void {
        this.points = worldPoints;
        this.target = target;
        this.cachedPts = this.buildPolyline(worldPoints);
        this.buildPathDots();
        this.redrawElapsed = 0;
        if (this.graphics) {
            this.graphics.clear();
            this.drawTargetCircle(this.graphics);
        }
        this.redrawCached(0);
    }

    /**
     * 移动时调用：按 redrawInterval 限频，只擦掉角色身后的部分。
     * 把角色位置投影到已缓存的折线上，画出剩余里程的虚线段。
     */
    updateRemaining(origin: Vec3, dt: number): void {
        if (!this.graphics) return;
        const interval = Math.max(0, this.redrawInterval);
        this.redrawElapsed += Math.max(0, dt);
        if (interval > 0 && this.redrawElapsed < interval) return;
        this.redrawElapsed = interval > 0 ? this.redrawElapsed % interval : 0;
        const g = this.graphics;
        g.clear();
        if (this.target) this.drawTargetCircle(g);
        const d = this.distanceAlong(origin);
        this.redrawCached(d);
    }

    /** 走完一段 / 到达终点后隐藏目标圆圈 */
    hideTarget(): void {
        this.target = null;
        if (this.graphics) this.graphics.clear();
    }

    clear(): void {
        this.points = [];
        this.target = null;
        this.cachedPts = [];
        this.pathDots = [];
        this.redrawElapsed = 0;
        if (this.graphics) this.graphics.clear();
    }

    /** 从里程 d 开始画剩余路径点 */
    private redrawCached(fromDist: number): void {
        if (!this.graphics) return;
        const g = this.graphics;
        g.fillColor = new Color(74, 255, 106, 255);//
        for (const dot of this.pathDots) {
            if (dot.dist <= fromDist) continue;
            g.circle(dot.point.x, dot.point.y, this.dotRadius);
            g.fill();
        }
    }

    /** 预计算路径点：里程锚定在路径起点，角色移动不会改变点的位置 */
    private buildPathDots(): void {
        this.pathDots = [];
        if (this.cachedPts.length < 2) return;
        const segs: Array<{ a: Vec3; b: Vec3; len: number }> = [];
        let total = 0;
        for (let i = 0; i < this.cachedPts.length - 1; i++) {
            const a = this.cachedPts[i];
            const b = this.cachedPts[i + 1];
            const len = Vec3.distance(a, b);
            if (len > 0) {
                segs.push({ a, b, len });
                total += len;
            }
        }
        if (total <= 0) return;

        const targetGap = this.targetRadius + this.dotRadius + this.targetDotGap;
        const lastDotDist = Math.max(0, total - targetGap);
        let pos = Math.min(this.firstDotOffset, lastDotDist);
        while (pos < total) {
            if (pos > lastDotDist) break;
            this.pathDots.push({
                point: this.pointAt(segs, pos),
                dist: pos,
            });
            pos += this.dotSpacing;
        }
    }

    /** 角色位置在缓存折线上的投影里程 */
    private distanceAlong(origin: Vec3): number {
        if (this.cachedPts.length < 2) return 0;
        let acc = 0;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < this.cachedPts.length - 1; i++) {
            const a = this.cachedPts[i];
            const b = this.cachedPts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len2 = dx * dx + dy * dy;
            let t = 0;
            if (len2 > 0) {
                t = ((origin.x - a.x) * dx + (origin.y - a.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
            }
            const px = a.x + dx * t;
            const py = a.y + dy * t;
            const dist = (origin.x - px) * (origin.x - px) + (origin.y - py) * (origin.y - py);
            if (dist < bestDist) {
                bestDist = dist;
                best = acc + Math.sqrt(len2) * t;
            }
            acc += Math.sqrt(len2);
        }
        return best;
    }

    /** 折线上里程 d 处的点 */
    private pointAtDist(d: number): Vec3 {
        let acc = 0;
        for (let i = 0; i < this.cachedPts.length - 1; i++) {
            const a = this.cachedPts[i];
            const b = this.cachedPts[i + 1];
            const len = Vec3.distance(a, b);
            if (d <= acc + len) {
                const t = len === 0 ? 0 : (d - acc) / len;
                return new Vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0);
            }
            acc += len;
        }
        const last = this.cachedPts[this.cachedPts.length - 1];
        return last ? new Vec3(last.x, last.y, 0) : new Vec3(0, 0, 0);
    }

    /** 路径拉直后剩下的拐角用二次贝塞尔圆角处理，输出密集采样点（虚线绘制用） */
    private buildPolyline(waypoints: Vec3[]): Vec3[] {
        if (waypoints.length <= 2) return waypoints.slice();
        const out: Vec3[] = [waypoints[0]];
        const r = this.cornerRadius;
        for (let i = 1; i < waypoints.length - 1; i++) {
            const prev = waypoints[i - 1];
            const cur = waypoints[i];
            const next = waypoints[i + 1];
            const d1 = Vec3.distance(prev, cur);
            const d2 = Vec3.distance(cur, next);
            if (d1 <= 0 || d2 <= 0) continue;
            const rad = Math.min(r, d1 * 0.45, d2 * 0.45);
            const dirIn = new Vec3(cur.x - prev.x, cur.y - prev.y, 0).normalize();
            const dirOut = new Vec3(next.x - cur.x, next.y - cur.y, 0).normalize();
            const e = new Vec3(cur.x - dirIn.x * rad, cur.y - dirIn.y * rad, 0);
            const x = new Vec3(cur.x + dirOut.x * rad, cur.y + dirOut.y * rad, 0);
            out.push(e);
            const steps = Math.max(4, Math.ceil(rad / 8));
            for (let s = 1; s <= steps; s++) {
                const t = s / (steps + 1);
                const t1 = 1 - t;
                const px = t1 * t1 * e.x + 2 * t1 * t * cur.x + t * t * x.x;
                const py = t1 * t1 * e.y + 2 * t1 * t * cur.y + t * t * x.y;
                out.push(new Vec3(px, py, 0));
            }
            out.push(x);
        }
        out.push(waypoints[waypoints.length - 1]);
        return out;
    }

    private pointAt(segs: Array<{ a: Vec3; b: Vec3; len: number }>, d: number): Vec3 {
        let acc = 0;
        for (const s of segs) {
            if (d <= acc + s.len) {
                const t = s.len === 0 ? 0 : (d - acc) / s.len;
                return new Vec3(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t, 0);
            }
            acc += s.len;
        }
        const last = segs[segs.length - 1];
        return last ? new Vec3(last.b.x, last.b.y, 0) : new Vec3(0, 0, 0);
    }

    private drawTargetCircle(g: Graphics): void {
        if (!this.target) return;
        g.lineWidth = 4;
        g.strokeColor = new Color(74, 255, 106, 255);//255, 255, 255, 255
        g.circle(this.target.x, this.target.y, this.targetRadius);
        g.stroke();
    }
}
