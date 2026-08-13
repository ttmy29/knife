import { _decorator, Component, Graphics, Color, UITransform, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

const STATE_HOP = 0; // 抛物线跳
const STATE_FLY = 1; // 飞向角色
const STATE_DONE = 2;

/**
 * 经验球：怪物死亡时由 GameManager 生成 2 个，执行"抛物线散落 -> 停留 -> 再跳 -> 停留 -> 飞向角色"。
 * 目前是代码画的占位球，以后有美术可换成预制体。
 */
@ccclass('ExpOrb')
export class ExpOrb extends Component {
    /** 该球包含的经验值（规则待定） */
    @property
    public exp = 0;

    private state = STATE_DONE;
    private t = 0;
    private dur = 0;
    private from = new Vec3();
    private to = new Vec3();
    private peak = 0;
    private flyTarget: Vec3 | null = null;
    private flyProvider: (() => Vec3) | null = null;
    private onArrive: (() => void) | null = null;

    init(exp: number): void {
        this.exp = exp;
        if (!this.getComponent(UITransform)) {
            this.addComponent(UITransform).setContentSize(24, 24);
        }
        const g = this.getComponent(Graphics) || this.addComponent(Graphics);
        g.clear();
        g.fillColor = new Color(255, 255, 255, 255);
        g.circle(0, 0, 11);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 255);
        g.lineWidth = 2;
        g.circle(0, 0, 11);
        g.stroke();
    }

    /** 抛物线跳：dur 秒内从当前位置移动 (offsetX, offsetY)，弧线最高点 peak */
    hop(offsetX: number, offsetY: number, dur: number, peak: number): void {
        const p = this.node.position;
        this.from.set(p.x, p.y, p.z);
        this.to.set(p.x + offsetX, p.y + offsetY, p.z);
        this.dur = Math.max(0.001, dur);
        this.peak = peak;
        this.t = 0;
        this.state = STATE_HOP;
    }

    /** 在 duration 秒内飞向目标，到达后触发 onArrive */
    flyTo(target: Vec3, duration: number, onArrive?: () => void): void {
        this.flyProvider = null;
        this.flyTarget = target.clone();
        this.startFly(duration, onArrive);
    }

    /** 飞向实时目标（每帧取角色当前位置，角色移动也能追上） */
    flyToLive(provider: () => Vec3, duration: number, onArrive?: () => void): void {
        this.flyProvider = provider;
        this.flyTarget = null;
        this.startFly(duration, onArrive);
    }

    private startFly(duration: number, onArrive?: () => void): void {
        this.onArrive = onArrive || null;
        this.dur = Math.max(0.001, duration);
        this.t = 0;
        const p = this.node.position;
        this.from.set(p.x, p.y, p.z);
        this.state = STATE_FLY;
    }

    get isDone(): boolean {
        return this.state === STATE_DONE;
    }

    update(dt: number): void {
        if (this.state === STATE_HOP) {
            this.t += dt;
            const k = Math.min(1, this.t / this.dur);
            // 抛物线：水平线性 + 垂直弧线（最高点在中间，起落回到同一高度）
            const arc = this.peak * 4 * k * (1 - k);
            const p = this.node.position;
            this.node.setPosition(
                this.from.x + (this.to.x - this.from.x) * k,
                this.from.y + (this.to.y - this.from.y) * k + arc,
                p.z,
            );
            if (k >= 1) this.state = STATE_DONE;
            return;
        }
        if (this.state === STATE_FLY) {
            const target = this.flyProvider ? this.flyProvider() : this.flyTarget;
            if (!target) return;
            this.t += dt;
            const k = Math.min(1, this.t / this.dur);
            const p = this.node.position;
            const dx = target.x - this.from.x;
            const dy = target.y - this.from.y;
            this.node.setPosition(this.from.x + dx * k, this.from.y + dy * k, p.z);
            if (k >= 1) {
                this.state = STATE_DONE;
                if (this.onArrive) this.onArrive();
            }
        }
    }
}
