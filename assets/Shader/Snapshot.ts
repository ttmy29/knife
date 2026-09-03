/*******************************************************************************
 * 创建: 2025年11月04日
 * 作者: 水煮肉片饭(27185709@qq.com)
 * 描述: 快照
 * 将所有子节点的内容，合成一张图传递给父节点的Sprite
 * 对父节点的Sprite使用Shader，就可以影响所有子节点
 * 如果子节点是动态的，需打开Snapshot的动态刷新
*******************************************************************************/
import { _decorator, clamp, Component, Color, Node, UITransform, NodeEventType, Sprite, isValid, CCObject, CameraComponent, RenderTexture, SpriteFrame } from 'cc';
const { ccclass, property, executeInEditMode, requireComponent, menu } = _decorator;
@ccclass
@executeInEditMode
@requireComponent(Sprite)
@menu('Gi/Shader/Snapshot')
class Snapshot extends Component {
    @property({ type: Node, tooltip: 'Optional sibling/other node to snapshot. Empty means snapshot this node children.' })
    target: Node | null = null;
    @property
    _priority: number = 0;
    @property({ displayName: '渲染优先级' })
    get priority() { return this._priority; }
    set priority(val) {
        this._priority = val = clamp(val | 0, 0, 65535);
        this.camera && (this.camera.priority = val);
    }
    @property
    _isRefresh: boolean = false;
    @property({ displayName: '动态刷新' })
    get isRefresh() { return this._isRefresh; }
    set isRefresh(val) {
        this._isRefresh = val;
        this.camera && (this.camera.clearFlags = val ? CameraComponent.ClearFlag.SOLID_COLOR : CameraComponent.ClearFlag.DEPTH_ONLY);
    }
    @property({ tooltip: 'Keep target visible to its original camera while also rendering it to the snapshot camera.' })
    preserveTargetLayer: boolean = false;
    static layer: number = 26;
    @property
    _snapshotLayer: number = Snapshot.layer;
    @property({ displayName: '快照层' })
    get snapshotLayer() { return this._snapshotLayer; }
    set snapshotLayer(val) {
        this._snapshotLayer = clamp(val | 0, 0, 31);
        this.applySnapshotLayer();
    }
    layer: number = 0;
    camera: CameraComponent = null;
    sprite: Sprite = null;
    private layerRecords: { node: Node, layer: number }[] = [];
    private renderTexture: RenderTexture | null = null;
    private renderTextureWidth = 0;
    private renderTextureHeight = 0;
    protected onLoad(): void {
        this.sprite = this.node.getComponent(Sprite);
        this.sprite.material.setProperty('sampleFromRt', 1);
        let ut = this.node.getComponent(UITransform);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.resizeRenderTexture(ut.width, ut.height);
        let cameraNode = this.node.getChildByName('Camera');
        if (!isValid(cameraNode)) {
            cameraNode = new Node('Camera');
            cameraNode.setParent(this.node);
            cameraNode.addComponent(CameraComponent);
            cameraNode._objFlags |= CCObject.Flags.HideInHierarchy;
        }
        this.layer = 1 << this._snapshotLayer;
        let camera = this.camera = cameraNode.getComponent(CameraComponent);
        camera.visibility = this.layer;
        camera.priority = this.priority;
        camera.clearFlags = this._isRefresh ? CameraComponent.ClearFlag.SOLID_COLOR : CameraComponent.ClearFlag.DEPTH_ONLY;
        camera.clearColor = new Color(0, 0, 0, 0);
        camera.near = 0;
        camera.projection = CameraComponent.ProjectionType.ORTHO;
        camera.targetTexture = this.renderTexture;
        this.updateSize();
        this.node.on(NodeEventType.SIZE_CHANGED, this.updateSize, this);
        this.node.on(NodeEventType.CHILD_ADDED, this.onChildAdded, this);
        this.node.on(NodeEventType.CHILD_REMOVED, this.onChildRemoved, this);
    }
    protected onDestroy(): void {
        if (this.camera) this.camera.targetTexture = null;
        this.node.off(NodeEventType.SIZE_CHANGED, this.updateSize, this);
        this.node.off(NodeEventType.CHILD_ADDED, this.onChildAdded, this);
        this.node.off(NodeEventType.CHILD_REMOVED, this.onChildRemoved, this);
    }
    protected onEnable(): void {
        this.captureTargets();
    }
    protected onDisable(): void {
        this.restoreLayers();
    }
    onChildAdded(child: Node): void {
        if (this.target) return;
        this.setLayerRecursiveWithRecord(child, this.layer);
    }
    onChildRemoved(child: Node): void {
        if (this.target) return;
        this.setLayerRecursive(child, this.node.layer);
    }
    updateSize(): void {
        let ut = this.node.getComponent(UITransform);
        if (!this.camera || !this.camera.node || !ut) return;
        this.resizeRenderTexture(ut.width, ut.height);
        let cw = ut.width * Math.abs(this.node.scale.x), ch = ut.height * Math.abs(this.node.scale.y);
        this.camera.node.setPosition(cw * (0.5 - ut.anchorX), ch * (0.5 - ut.anchorY));
        this.camera.orthoHeight = ch * 0.5;
        this.camera.far = ch;
    }
    private resizeRenderTexture(width: number, height: number): void {
        const nextWidth = Math.max(1, Math.ceil(width));
        const nextHeight = Math.max(1, Math.ceil(height));
        if (this.renderTexture
            && this.renderTextureWidth === nextWidth
            && this.renderTextureHeight === nextHeight) {
            return;
        }
        const renderTexture = new RenderTexture();
        renderTexture.initialize({ width: nextWidth, height: nextHeight });
        this.renderTexture = renderTexture;
        this.renderTextureWidth = nextWidth;
        this.renderTextureHeight = nextHeight;
        if (this.sprite) {
            (this.sprite.spriteFrame ||= new SpriteFrame()).texture = renderTexture;
        }
        if (this.camera) {
            this.camera.targetTexture = renderTexture;
        }
    }
    private setLayerRecursive(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursive(child, layer);
    }
    private captureTargets(): void {
        this.restoreLayers();
        const targets = this.target ? [this.target] : this.node.children.filter(child => child !== this.camera?.node);
        for (const target of targets) this.setLayerRecursiveWithRecord(target, this.layer);
    }
    private applySnapshotLayer(): void {
        this.restoreLayers();
        this.layer = 1 << this._snapshotLayer;
        if (this.camera) this.camera.visibility = this.layer;
        if (this.enabledInHierarchy) this.captureTargets();
    }
    private setLayerRecursiveWithRecord(node: Node, layer: number): void {
        this.layerRecords.push({ node, layer: node.layer });
        node.layer = this.preserveTargetLayer ? (node.layer | layer) : layer;
        for (const child of node.children) this.setLayerRecursiveWithRecord(child, layer);
    }
    private restoreLayers(): void {
        for (const record of this.layerRecords) {
            if (record.node && record.node.isValid) record.node.layer = record.layer;
        }
        this.layerRecords.length = 0;
    }
}
declare global {
    module gi {
        class Snapshot extends Component {
            priority: number;
            isRefresh: boolean;
            snapshotLayer: number;
        }
    }
}
((globalThis as any).gi ||= {}).Snapshot ||= Snapshot;
