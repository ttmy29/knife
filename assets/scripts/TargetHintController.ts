import { Camera, Node, Vec3, view } from 'cc';

type ScreenEdge = 'left' | 'right' | 'top' | 'bottom';

export class TargetHintController {
    private readonly angleOffset = -90;
    private readonly edgeMargin = 60;
    private readonly edgeSwitchHysteresis = 0.12;
    private readonly moveSmoothSpeed = 8;
    private readonly rotationSmoothSpeed = 10;
    private readonly positionSnapDistance = 1.5;
    private readonly rotationSnapDegrees = 1;
    private hintNode: Node | null = null;
    private targetNode: Node | null = null;
    private currentEdge: ScreenEdge | null = null;
    private lastHintScreenPosition: Vec3 | null = null;
    private lastRotationDegrees: number | null = null;
    private fixedScreenY: number | null = null;
    private enabled = false;

    constructor(
        private readonly worldNode: Node,
        private readonly getCamera: () => Camera | null,
        private readonly getHintCamera: () => Camera | null,
        private readonly getRoleNode: () => Node | null,
    ) {}

    init(uiLayer: Node | null): void {
        this.hintNode = uiLayer ? uiLayer.getChildByName('ts') : null;
        this.targetNode = this.worldNode.getChildByName('Ground')?.getChildByName('Node') || null;
        this.enabled = false;
        this.hideVisual();
    }

    show(): void {
        if (!this.hintNode || !this.hintNode.isValid || !this.targetNode || !this.targetNode.isValid) return;
        this.enabled = true;
        this.hintNode.active = true;
        this.update();
    }

    hide(): void {
        this.enabled = false;
        this.currentEdge = null;
        this.lastHintScreenPosition = null;
        this.lastRotationDegrees = null;
        this.hideVisual();
    }

    update(dt = 1 / 60): void {
        if (!this.enabled) return;
        const camera = this.getCamera();
        const hintNode = this.hintNode;
        const targetNode = this.targetNode;
        if (!camera || !hintNode || !hintNode.isValid || !targetNode || !targetNode.isValid) {
            this.hide();
            return;
        }

        const screenPosition = camera.worldToScreen(targetNode.worldPosition);
        if (this.isOnScreen(screenPosition)) {
            this.hideVisual();
            this.currentEdge = null;
            this.lastHintScreenPosition = null;
            return;
        }

        hintNode.active = true;
        this.moveHintToScreenEdge(hintNode, screenPosition, dt);
        this.pointHintToScreenPosition(hintNode, screenPosition, dt);
    }

    private hideVisual(): void {
        if (this.hintNode && this.hintNode.isValid) {
            this.hintNode.active = false;
        }
    }

    private isOnScreen(screenPosition: Vec3): boolean {
        const visibleSize = view.getVisibleSizeInPixel();
        return screenPosition.x >= 0
            && screenPosition.x <= visibleSize.width
            && screenPosition.y >= 0
            && screenPosition.y <= visibleSize.height;
    }

    private pointHintToScreenPosition(hintNode: Node, targetScreenPosition: Vec3, dt: number): void {
        const hintCamera = this.getHintCamera() || this.getCamera();
        if (!hintCamera) return;

        const hintScreenPosition = hintCamera.worldToScreen(hintNode.worldPosition);
        const angle = Math.atan2(targetScreenPosition.y - hintScreenPosition.y, targetScreenPosition.x - hintScreenPosition.x);
        const targetRotation = angle * 180 / Math.PI + this.angleOffset;
        const rotation = this.smoothRotation(targetRotation, dt);
        hintNode.setRotationFromEuler(0, 0, rotation);
    }

    private moveHintToScreenEdge(hintNode: Node, targetScreenPosition: Vec3, dt: number): void {
        const hintCamera = this.getHintCamera() || this.getCamera();
        const mainCamera = this.getCamera();
        const parent = hintNode.parent;
        if (!hintCamera || !parent) return;
        if (this.fixedScreenY === null) {
            this.fixedScreenY = hintCamera.worldToScreen(hintNode.worldPosition).y;
        }

        const visibleSize = view.getVisibleSizeInPixel();
        const roleNode = this.getRoleNode();
        const roleScreenPosition = roleNode && roleNode.isValid && mainCamera
            ? mainCamera.worldToScreen(roleNode.worldPosition)
            : new Vec3(visibleSize.width / 2, visibleSize.height / 2, 0);
        const origin = this.isOnScreen(roleScreenPosition)
            ? this.clampToSafeScreen(roleScreenPosition)
            : new Vec3(visibleSize.width / 2, visibleSize.height / 2, 0);
        const edgePosition = this.getScreenEdgePoint(origin, targetScreenPosition);
        edgePosition.y = this.fixedScreenY;
        const smoothedPosition = this.smoothScreenPosition(edgePosition, dt);
        const hintWorldPosition = hintCamera.screenToWorld(new Vec3(smoothedPosition.x, smoothedPosition.y, 0));
        const hintLocalPosition = new Vec3();
        parent.inverseTransformPoint(hintLocalPosition, hintWorldPosition);
        hintNode.setPosition(hintLocalPosition);
    }

    private clampToSafeScreen(position: Vec3): Vec3 {
        const visibleSize = view.getVisibleSizeInPixel();
        return new Vec3(
            Math.max(this.edgeMargin, Math.min(visibleSize.width - this.edgeMargin, position.x)),
            Math.max(this.edgeMargin, Math.min(visibleSize.height - this.edgeMargin, position.y)),
            0,
        );
    }

    private getScreenEdgePoint(origin: Vec3, target: Vec3): Vec3 {
        const visibleSize = view.getVisibleSizeInPixel();
        const minX = this.edgeMargin;
        const maxX = visibleSize.width - this.edgeMargin;
        const minY = this.edgeMargin;
        const maxY = visibleSize.height - this.edgeMargin;
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        if (dx === 0 && dy === 0) return this.clampToSafeScreen(target);

        const halfWidth = Math.max(1, (maxX - minX) * 0.5);
        const halfHeight = Math.max(1, (maxY - minY) * 0.5);
        const horizontalStrength = Math.abs(dx) / halfWidth;
        const verticalStrength = Math.abs(dy) / halfHeight;
        let edge: ScreenEdge = horizontalStrength >= verticalStrength
            ? (dx >= 0 ? 'right' : 'left')
            : (dy >= 0 ? 'top' : 'bottom');

        if (this.currentEdge && this.currentEdge !== edge) {
            const currentStrength = this.isHorizontalEdge(this.currentEdge) ? horizontalStrength : verticalStrength;
            const nextStrength = this.isHorizontalEdge(edge) ? horizontalStrength : verticalStrength;
            if (nextStrength < currentStrength + this.edgeSwitchHysteresis) {
                edge = this.currentEdge;
            }
        }
        this.currentEdge = edge;

        if ((edge === 'left' || edge === 'right') && dx !== 0) {
            const x = edge === 'left' ? minX : maxX;
            const t = (x - origin.x) / dx;
            const y = origin.y + dy * t;
            return new Vec3(x, Math.max(minY, Math.min(maxY, y)), 0);
        }

        if (dy !== 0) {
            const y = edge === 'bottom' ? minY : maxY;
            const t = (y - origin.y) / dy;
            const x = origin.x + dx * t;
            return new Vec3(Math.max(minX, Math.min(maxX, x)), y, 0);
        }

        return this.clampToSafeScreen(target);
    }

    private isHorizontalEdge(edge: ScreenEdge): boolean {
        return edge === 'left' || edge === 'right';
    }

    private smoothScreenPosition(target: Vec3, dt: number): Vec3 {
        if (!this.lastHintScreenPosition) {
            this.lastHintScreenPosition = target.clone();
            return target;
        }

        const dx = target.x - this.lastHintScreenPosition.x;
        const dy = target.y - this.lastHintScreenPosition.y;
        if (dx * dx + dy * dy <= this.positionSnapDistance * this.positionSnapDistance) {
            return this.lastHintScreenPosition.clone();
        }

        const t = 1 - Math.exp(-Math.max(0, dt) * this.moveSmoothSpeed);
        this.lastHintScreenPosition.x += (target.x - this.lastHintScreenPosition.x) * t;
        this.lastHintScreenPosition.y += (target.y - this.lastHintScreenPosition.y) * t;
        return this.lastHintScreenPosition.clone();
    }

    private smoothRotation(targetRotation: number, dt: number): number {
        if (this.lastRotationDegrees === null) {
            this.lastRotationDegrees = targetRotation;
            return targetRotation;
        }

        const delta = this.shortestAngleDelta(this.lastRotationDegrees, targetRotation);
        if (Math.abs(delta) <= this.rotationSnapDegrees) return this.lastRotationDegrees;

        const t = 1 - Math.exp(-Math.max(0, dt) * this.rotationSmoothSpeed);
        this.lastRotationDegrees += delta * t;
        return this.lastRotationDegrees;
    }

    private shortestAngleDelta(from: number, to: number): number {
        return ((to - from + 540) % 360) - 180;
    }
}
