import { _decorator, Component, Node, tween, Tween, Vec3 } from 'cc';

const { ccclass } = _decorator;

@ccclass('GuideHand')
export class GuideHand extends Component {
    private basePosition = new Vec3();
    private baseScale = new Vec3(1, 1, 1);
    private baseEuler = new Vec3();

    onLoad(): void {
        this.recordBaseTransform();
    }

    play(position?: Vec3): void {
        this.stop(false);
        if (position) this.node.setPosition(position);
        this.recordBaseTransform();
        this.node.active = true;

        const p = this.basePosition;
        const s = this.baseScale;
        const e = this.baseEuler;
        tween(this.node)
            .repeatForever(
                tween<Node>()
                    .to(0.46, {
                        position: new Vec3(p.x + 8, p.y - 8, p.z),
                        scale: new Vec3(s.x * 0.94, s.y * 0.94, s.z),
                        eulerAngles: new Vec3(e.x, e.y, e.z - 8),
                    }, { easing: 'quadOut' })
                    .to(0.46, {
                        position: new Vec3(p.x, p.y, p.z),
                        scale: new Vec3(s.x, s.y, s.z),
                        eulerAngles: new Vec3(e.x, e.y, e.z),
                    }, { easing: 'quadIn' }),
            )
            .start();
    }

    stopAndHide(): void {
        this.stop(true);
    }

    private stop(hide: boolean): void {
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.basePosition);
        this.node.setScale(this.baseScale);
        this.node.setRotationFromEuler(this.baseEuler.x, this.baseEuler.y, this.baseEuler.z);
        if (hide) this.node.active = false;
    }

    private recordBaseTransform(): void {
        this.basePosition = this.node.position.clone();
        this.baseScale = this.node.scale.clone();
        this.baseEuler = this.node.eulerAngles.clone();
    }
}
