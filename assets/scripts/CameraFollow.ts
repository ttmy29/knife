import { _decorator, Camera, clamp, Component, Node, Rect, UITransform, Vec3, view } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 相机跟随：
 * - 开局第一帧直接对准角色（身体中心）；
 * - 角色在死区内（画布尺寸 x deadZoneRatio）移动时相机不动，超出后以固定速度匀速追，追上即停；
 * - 相机中心限制在地图边界内（用背景节点的世界包围盒计算，自动包含 GameWorld 的缩放和位移）。
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property(Node)
    target: Node | null = null;

    /** 跟随速度（比角色移速慢，产生追尾感）*/
    @property
    followSpeed = 220;

    /** 死区比例：0 = 一直跟随；>0 时角色偏移超过画布尺寸 x 该比例才开始跟随 */
    @property
    deadZoneRatio = 0;

    /** 垂直对准偏移：相机中心对准角色上方该距离（世界单位），角色显示在屏幕中心偏下 */
    @property
    targetOffsetY = 200;

    /** 边界参考节点：留空则自动找场景里的 bg 节点（取它的世界包围盒） */
    @property(Node)
    boundsNode: Node | null = null;

    /** 是否已做过初始对准 */
    private aligned = false;

    /** 地图边界（世界坐标） */
    private bounds: Rect | null = null;

    start(): void {
        this.bounds = this.getBounds();
        // 开局直接对准角色（瞬间，不缓慢移动）
        this.snapToTarget();
    }

    lateUpdate(dt: number): void {
        if (!this.target || !this.target.isValid) return;
        const parent = this.node.parent;
        if (!parent) return;
        const ut = parent.getComponent(UITransform);
        if (!ut) return;

        // 对准点 = 角色脚底向上偏移到身体中心，再叠加 targetOffsetY
        const worldPos = this.target.worldPosition;
        const aimWorld = new Vec3(worldPos.x, worldPos.y + this.targetOffsetY, worldPos.z);
        // 先做边界夹紧，再转成父节点局部坐标
        this.clampAim(aimWorld);
        const local = ut.convertToNodeSpaceAR(aimWorld);
        const cam = this.node.position;

        // 初始对准角色：第一帧直接放到角色位置，之后才按死区规则走
        if (!this.aligned) {
            this.snapToTarget();
            return;
        }

        const halfW = ut.width * this.deadZoneRatio;
        const halfH = ut.height * this.deadZoneRatio;

        const offX = local.x - cam.x;
        const offY = local.y - cam.y;
        // 微小偏移直接吸附，避免开局/停下时缓慢微调
        if (Math.abs(offX) < 4 && Math.abs(offY) < 4) {
            this.node.setPosition(local.x, local.y, cam.z);
            return;
        }
        const outX = Math.abs(offX) > halfW;
        const outY = Math.abs(offY) > halfH;
        if (!outX && !outY) return; // 死区内：不跟随
        // 朝角色方向匀速移动（对角方向归一化，速度恒定）
        let dirX = 0;
        let dirY = 0;
        if (outX) dirX = offX > 0 ? 1 : -1;
        if (outY) dirY = offY > 0 ? 1 : -1;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const step = this.followSpeed * dt;
        let nx = cam.x + (dirX / len) * step;
        let ny = cam.y + (dirY / len) * step;
        // 防止越过角色
        if (dirX > 0 && nx > local.x) nx = local.x;
        if (dirX < 0 && nx < local.x) nx = local.x;
        if (dirY > 0 && ny > local.y) ny = local.y;
        if (dirY < 0 && ny < local.y) ny = local.y;
        this.node.setPosition(nx, ny, cam.z);
    }

    /** 直接把相机对准角色（身体中心） */
    private snapToTarget(): void {
        if (!this.target || !this.target.isValid) return;
        const parent = this.node.parent;
        if (!parent) return;
        const ut = parent.getComponent(UITransform);
        if (!ut) return;
        const worldPos = this.target.worldPosition;
        const aimWorld = new Vec3(worldPos.x, worldPos.y + this.targetOffsetY, worldPos.z);
        this.clampAim(aimWorld);
        const local = ut.convertToNodeSpaceAR(aimWorld);
        const cam = this.node.position;
        this.node.setPosition(local.x, local.y, cam.z);
        this.aligned = true;
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
}
