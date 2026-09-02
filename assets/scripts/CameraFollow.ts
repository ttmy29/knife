import { _decorator, Camera, clamp, Component, Node, Rect, tween, Tween, UITransform, Vec3, view } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 相机跟随：
 * - 开局第一帧直接对准角色（身体中心）；
 * - 之后每帧直接跟随角色目标点；
 * - 相机中心限制在地图边界内（用背景节点的世界包围盒计算，自动包含 GameWorld 的缩放和位移）。
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property(Node)
    target: Node | null = null;

    /** 垂直对准偏移：相机中心对准角色上方该距离（世界单位），角色显示在屏幕中心偏下 */
    @property
    targetOffsetY = 200;

    /** 水平对准偏移：正数让镜头中心向右移动。 */
    @property
    targetOffsetX = 0;

    /** 边界参考节点：留空则自动找场景里的 bg 节点（取它的世界包围盒） */
    @property(Node)
    boundsNode: Node | null = null;

    /** 是否已做过初始对准 */
    private aligned = false;

    /** 地图边界（世界坐标） */
    private bounds: Rect | null = null;
    private transitioning = false;

    start(): void {
        this.bounds = this.getBounds();
        // 开局直接对准角色（瞬间，不缓慢移动）
        this.snapToTarget();
    }

    /** 角色还没生成时，也可以按它将要出现的世界坐标直接对准。 */
    snapToWorldPosition(worldPos: Vec3): void {
        Tween.stopAllByTarget(this.node);
        this.transitioning = false;
        this.bounds = this.getBounds();
        const aimWorld = new Vec3(worldPos.x + this.targetOffsetX, worldPos.y + this.targetOffsetY, worldPos.z);
        this.snapToAimWorld(aimWorld);
    }

    /** 从当前位置缓慢移动到目标，移动期间暂停普通跟随。 */
    moveToWorldPosition(worldPos: Vec3, duration: number, onComplete?: () => void): void {
        const parent = this.node.parent;
        const ut = parent ? parent.getComponent(UITransform) : null;
        if (!ut) {
            if (onComplete) onComplete();
            return;
        }

        this.bounds = this.getBounds();
        const aimWorld = new Vec3(worldPos.x + this.targetOffsetX, worldPos.y + this.targetOffsetY, worldPos.z);
        this.clampAim(aimWorld);
        const local = ut.convertToNodeSpaceAR(aimWorld);
        const destination = new Vec3(local.x, local.y, this.node.position.z);

        Tween.stopAllByTarget(this.node);
        this.transitioning = true;
        tween(this.node)
            .to(Math.max(0, duration), { position: destination }, { easing: 'sineInOut' })
            .call(() => {
                this.transitioning = false;
                this.aligned = true;
                if (onComplete) onComplete();
            })
            .start();
    }

    lateUpdate(): void {
        if (this.transitioning) return;
        if (!this.target || !this.target.isValid) return;
        const parent = this.node.parent;
        if (!parent) return;
        const ut = parent.getComponent(UITransform);
        if (!ut) return;

        // 对准点 = 角色脚底向上偏移到身体中心，再叠加 targetOffsetY
        const worldPos = this.target.worldPosition;
        const aimWorld = new Vec3(worldPos.x + this.targetOffsetX, worldPos.y + this.targetOffsetY, worldPos.z);
        const local = ut.convertToNodeSpaceAR(aimWorld);

        // 初始对准角色：第一帧直接放到角色位置
        if (!this.aligned) {
            this.snapToTarget();
            return;
        }

        const cam = this.node.position;
        const desired = this.clampCameraLocal(new Vec3(local.x, local.y, cam.z), ut);
        this.node.setPosition(desired.x, desired.y, cam.z);
    }

    /** 直接把相机对准角色（身体中心） */
    private snapToTarget(): void {
        if (!this.target || !this.target.isValid) return;
        const worldPos = this.target.worldPosition;
        const aimWorld = new Vec3(worldPos.x + this.targetOffsetX, worldPos.y + this.targetOffsetY, worldPos.z);
        this.snapToAimWorld(aimWorld);
    }

    setTargetOffsetX(offset: number, snap = false): void {
        this.targetOffsetX = offset;
        if (snap) this.snapToTarget();
    }

    private snapToAimWorld(aimWorld: Vec3): void {
        const parent = this.node.parent;
        if (!parent) return;
        const ut = parent.getComponent(UITransform);
        if (!ut) return;
        this.clampAim(aimWorld);
        const local = ut.convertToNodeSpaceAR(aimWorld);
        const cam = this.node.position;
        this.node.setPosition(local.x, local.y, cam.z);
        this.aligned = true;
    }

    private clampCameraLocal(local: Vec3, parentTransform: UITransform): Vec3 {
        const world = parentTransform.convertToWorldSpaceAR(local);
        this.clampAim(world);
        const clamped = parentTransform.convertToNodeSpaceAR(world);
        clamped.z = local.z;
        return clamped;
    }

    /**
     * 把目标点夹紧到地图边界内（世界坐标）。
     * 半高取相机 orthoHeight，半宽 = 半高 x 屏幕宽高比；
     * 若某个方向可视范围比地图还大，则直接居中，避免露出地图外。
     */
    private clampAim(aim: Vec3): void {
        if (!this.bounds) return;
        const camComp = this.node.getComponent(Camera);
        const halfH = camComp ? camComp.orthoHeight : 0;
        if (halfH <= 0) return;
        const visible = view.getVisibleSize();
        const aspect = visible.height > 0 ? visible.width / visible.height : 1;
        const halfW = halfH * aspect;

        const minX = this.bounds.x + halfW;
        const maxX = this.bounds.x + this.bounds.width - halfW;
        const minY = this.bounds.y + halfH;
        const maxY = this.bounds.y + this.bounds.height - halfH;

        aim.x = minX >= maxX
            ? this.bounds.x + this.bounds.width / 2
            : clamp(aim.x, minX, maxX);
        aim.y = minY >= maxY
            ? this.bounds.y + this.bounds.height / 2
            : clamp(aim.y, minY, maxY);
    }

    /** 取边界节点（留空自动找 bg）的世界包围盒 */
    private getBounds(): Rect | null {
        let node = this.boundsNode;
        if (!node) {
            node = this.findNodeByName(this.node.parent, 'bg');
        }
        if (!node) return null;
        const ut = node.getComponent(UITransform);
        if (!ut) return null;
        return ut.getBoundingBoxToWorld();
    }

    private findNodeByName(root: Node | null, name: string): Node | null {
        if (!root) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const hit = this.findNodeByName(child, name);
            if (hit) return hit;
        }
        return null;
    }

    onDestroy(): void {
        Tween.stopAllByTarget(this.node);
    }
}
