import { _decorator, Component, Graphics, Color, Vec3 } from 'cc';

const { ccclass } = _decorator;

interface DashSeg {
    a: Vec3;
    b: Vec3;
    start: number;
    end: number;
}

/**
 * 绿色路径线：点击时一次性把整条路线画好（虚线锚定在地面上，不随角色移动而抖动），
 * 角色走过一段就擦掉一段，目标点画圆圈。
 */
@ccclass('PathLine')
export class PathLine extends Component {
    /** 拐角圆角半径（世界单位），由 GameManager 设置 */
    public cornerRadius = 14;

    private graphics: Graphics | null = null;
    private points: Vec3[] = [];
    private target: Vec3 | null = null;
    /** 点击时算好的完整折线（含贝塞尔圆角采样点），后续不再变化 */
    private cachedPts: Vec3[] = [];
    /** 虚线分段（锚定在路径几何上） */
    private dashSegs: DashSeg[] = [];

    onLoad(): void {
        this.graphics = this.node.getComponent(Graphics) || this.node.addComponent(Graphics);
    }

    /** 点击时调用：一次性绘制最终路线 */
    drawPath(worldPoints: Vec3[], target: Vec3): void {
        this.points = worldPoints;
        this.target = target;
        this.cachedPts = this.buildPolyline(worldPoints);
        this.buildDashes();
        if (this.graphics) {
            this.graphics.clear();
            this.drawTargetCircle(this.graphics);
        }
        this.redrawCached(0);
    }

    /**
     * 每帧调用：绿线固定在地面上，只擦掉角色身后的部分。
     * 把角色位置投影到已缓存的折线上，画出剩余里程的虚线段。
     */
    updateRemaining(origin: Vec3): void {
        if (!this.graphics) return;
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
        this.dashSegs = [];
        if (this.graphics) this.graphics.clear();
    }

    /** 从里程 d 开始画剩余虚线（与角色相交的虚线段只画后半段） */
    private redrawCached(fromDist: number): void {
        if (!this.graphics) return;
        const g = this.graphics;
        g.lineWidth = 6;
        g.strokeColor = new Color(74, 255, 106, 255);
        for (const seg of this.dashSegs) {
            if (seg.end <= fromDist) continue;
            const a = seg.start < fromDist ? this.pointAtDist(fromDist) : seg.a;
            const len = Vec3.distance(a, seg.b);
            if (len < 0.5) continue;
            g.moveTo(a.x, a.y);
            g.lineTo(seg.b.x, seg.b.y);
            g.stroke();
        }
    }

    /** 预计算虚线分段：里程锚定在路径起点，角色移动不会改变虚线位置 */
    private buildDashes(): void {
        this.dashSegs = [];
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
        const dash = 14;
        const gap = 9;
        let pos = 0;
        while (pos < total) {
            const end = Math.min(pos + dash, total);
            this.dashSegs.push({
                a: this.pointAt(segs, pos),
                b: this.pointAt(segs, end),
                start: pos,
                end,
            });
            pos += dash + gap;
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
        g.fillColor = new Color(74, 255, 106, 90);
        g.circle(this.target.x, this.target.y, 16);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = new Color(74, 255, 106, 255);
        g.circle(this.target.x, this.target.y, 16);
        g.stroke();
    }
}
