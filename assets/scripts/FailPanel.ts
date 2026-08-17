import { _decorator, Button, Component, director, Node, tween, Vec3 } from 'cc';

const { ccclass } = _decorator;

@ccclass('FailPanel')
export class FailPanel extends Component {
    play(cameraNode: Node | null): void {
        this.positionAtCamera(cameraNode);
        this.playFailureTweens();

        const retryButton = this.node.getChildByName('Button');
        const button = retryButton ? retryButton.getComponent(Button) : null;
        if (button) {
            button.node.on(Button.EventType.CLICK, () => director.loadScene('game'));
        }
    }

    private positionAtCamera(cameraNode: Node | null): void {
        if (!cameraNode) {
            this.node.setPosition(0, 0, 0);
            return;
        }
        this.node.setWorldPosition(cameraNode.worldPosition.x, cameraNode.worldPosition.y, 0);
    }

    private playFailureTweens(): void {
        this.playScaleXPulse(this.getNode('v1'), 0, 1, 1.5, 1, 0.5);
        this.playMoveY(this.getNode('v4'), 0.5, 30, -30, 0.2);
        this.playScaleXTween(this.getNode('axe'), 1, 1, 0.1);
        this.playScaleXTween(this.getNode('axe2'), 1, -1, 0.1);
        this.scheduleOnce(() => {
            this.playRotationOnce(this.getNode('axe'), 0.2, 20);
            this.playRotationOnce(this.getNode('axe2'), 0.2, -20);
        }, 1.1);
        this.scheduleOnce(() => {
            this.playRotationLoop(this.getNode('axe'), 0.5, 10);
            this.playRotationLoop(this.getNode('axe2'), 0.5, -10);
        }, 1.3);
        this.playButtonPunch(this.node.getChildByName('Button'), 0);
        this.playButtonPunch(this.node.getChildByName('Button-001'), 0.08);
    }

    private getNode(name: string): Node | null {
        return this.node.getChildByName(name);
    }

    private playButtonPunch(button: Node | null, delay: number): void {
        if (!button) return;
        button.setScale(1, 1, 1);
        tween(button)
            .delay(delay)
            .to(0.18, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'quadOut' })
            .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .start();
    }

    private playScalePulse(node: Node | null, delay: number, from: number, mid: number, to: number, duration: number): void {
        if (!node) return;
        node.setScale(from, from, 1);
        tween(node)
            .delay(delay)
            .to(duration * 0.5, { scale: new Vec3(mid, mid, 1) }, { easing: 'quadOut' })
            .to(duration * 0.5, { scale: new Vec3(to, to, 1) }, { easing: 'quadIn' })
            .start();
    }

    private playScaleXPulse(node: Node | null, delay: number, from: number, mid: number, to: number, duration: number): void {
        if (!node) return;
        const scale = node.scale.clone();
        node.setScale(from, scale.y, scale.z);
        tween(node)
            .delay(delay)
            .to(duration * 0.5, { scale: new Vec3(mid, scale.y, scale.z) }, { easing: 'quadOut' })
            .to(duration * 0.5, { scale: new Vec3(to, scale.y, scale.z) }, { easing: 'quadIn' })
            .start();
    }

    private playMoveY(node: Node | null, delay: number, fromY: number, toY: number, duration: number): void {
        if (!node) return;
        const pos = node.position.clone();
        pos.y = fromY;
        node.setPosition(pos);
        tween(node)
            .delay(delay)
            .to(duration, { position: new Vec3(pos.x, toY, pos.z) }, { easing: 'quadOut' })
            .start();
    }

    private playScaleXTween(node: Node | null, delay: number, toX: number, duration: number): void {
        if (!node) return;
        const scale = node.scale.clone();
        scale.x = 0;
        node.setScale(scale);
        tween(node)
            .delay(delay)
            .to(duration, { scale: new Vec3(toX, scale.y || 1, scale.z || 1) }, { easing: 'quadOut' })
            .start();
    }

    private playRotationOnce(node: Node | null, duration: number, angle: number): void {
        if (!node) return;
        node.eulerAngles = new Vec3(0, 0, 0);
        tween(node)
            .to(duration * 0.5, { eulerAngles: new Vec3(0, 0, angle) }, { easing: 'quadOut' })
            .to(duration * 0.5, { eulerAngles: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
            .start();
    }

    private playRotationLoop(node: Node | null, duration: number, angle: number): void {
        if (!node) return;
        const euler = node.eulerAngles.clone();
        euler.z = 0;
        node.eulerAngles = euler;
        tween(node)
            .repeatForever(
                tween()
                    .to(duration * 0.5, { eulerAngles: new Vec3(0, 0, angle) }, { easing: 'quadOut' })
                    .to(duration * 0.5, { eulerAngles: new Vec3(0, 0, 0) }, { easing: 'quadIn' }),
            )
            .start();
    }
}
