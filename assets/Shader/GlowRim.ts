/*******************************************************************************
 * 创建: 2025年11月04日
 * 作者: 水煮肉片饭(27185709@qq.com)
 * 描述: 发光Shader
 * 支持外发光、内发光并存
 * 支持多种样式：纯色描边, 透明衰减, 明暗衰减
*******************************************************************************/
import { _decorator, UIRenderer, Component, Enum, js, Color, Material, UITransform, Vec2, NodeEventType, Sprite } from 'cc';
enum Style { 纯色描边, 透明衰减, 明暗衰减 }
const { ccclass, property, disallowMultiple, executeInEditMode, requireComponent, menu } = _decorator;
@ccclass
@disallowMultiple
@executeInEditMode
@requireComponent(UIRenderer)
@menu('Gi/Shader/GlowRim')
class GlowRim extends Component {
    @property({ displayName: '材质', readonly: true })
    materialName: string = '';
    @property
    _outerActive: boolean = true;
    @property({ displayName: '外发光' })
    get outerActive() { return this._outerActive; }
    set outerActive(val) { this._outerActive = val; this.material?.setProperty('outerActive', val ? 1 : 0); }
    @property
    _outerStyle: Style = Style.透明衰减;
    @property({ displayName: '······样式', type: Enum(Style), visible() { return this._outerActive } })
    get outerStyle() { return this._outerStyle; }
    set outerStyle(val) { this._outerStyle = val; this.material?.setProperty('outerStyle', val); }
    @property
    _outerColor: Color = new Color(255, 255, 0, 255);
    @property({ displayName: '······颜色', visible() { return this._outerActive } })
    get outerColor() { return this._outerColor; }
    set outerColor(val) { this._outerColor = val; this.material?.setProperty('outerColor', val); }
    @property
    _outerWidth: number = 50;
    @property({ displayName: '······宽度', visible() { return this._outerActive } })
    get outerWidth() { return this._outerWidth; }
    set outerWidth(val) {
        this._outerWidth = val = Math.max(val, 0);
        this.material?.setProperty('outerWidth', val);
        this.material && this.updateContentSize();
    }
    @property
    _innerActive: boolean = true;
    @property({ displayName: '内发光' })
    get innerActive() { return this._innerActive; }
    set innerActive(val) { this._innerActive = val; this.material?.setProperty('innerActive', val ? 1 : 0); }
    @property
    _innerStyle: Style = Style.透明衰减;
    @property({ displayName: '······样式', type: Enum(Style), visible() { return this._innerActive } })
    get innerStyle() { return this._innerStyle; }
    set innerStyle(val) { this._innerStyle = val; this.material?.setProperty('innerStyle', val); }
    @property
    _innerColor: Color = new Color(255, 255, 255, 255);
    @property({ displayName: '······颜色', visible() { return this._innerActive } })
    get innerColor() { return this._innerColor; }
    set innerColor(val) { this._innerColor = val; this.material?.setProperty('innerColor', val); }
    @property
    _innerWidth: number = 50;
    @property({ displayName: '······宽度', visible() { return this._innerActive } })
    get innerWidth() { return this._innerWidth; }
    set innerWidth(val) { this._innerWidth = val = Math.max(val, 0); this.material?.setProperty('innerWidth', val); }
@property
    _brightness: number = 1;
    @property({ displayName: '明暗度', range: [0, 5, 0.1], slide: true })
    get brightness() { return this._brightness; }
    set brightness(val) { this._brightness = val; this.material?.setProperty('brightness', val); }
    centerScale: number = 1;
    material: Material = null;
    private baseScaleX = 1;
    private baseScaleY = 1;
    private baseScaleZ = 1;
    protected onEnable(): void {
        this.recordBaseScale();
        if (!this.checkMaterial()) return;
        this.material.setProperty('enable', 1);
        this.material.setProperty('outerActive', this._outerActive ? 1 : 0);
        this.material.setProperty('outerStyle', this._outerStyle);
        this.material.setProperty('outerColor', this._outerColor);
        this.material.setProperty('outerWidth', this._outerWidth);
        this.material.setProperty('innerActive', this._innerActive ? 1 : 0);
        this.material.setProperty('innerStyle', this._innerStyle);
        this.material.setProperty('innerColor', this._innerColor);
        this.material.setProperty('innerWidth', this._innerWidth);
        this.material.setProperty('brightness', this._brightness);
        this.updateContentSize();
        this.node.on(NodeEventType.SIZE_CHANGED, this.updateContentSize, this);
    }
    protected onDisable(): void {
        if (this.material['_passes'].length !== 0) {
            this.material.setProperty('enable', 0);
            this.material.setProperty('centerScale', 1);
        }
        if (!this.node.getComponent('Snapshot')) this.node.setScale(this.baseScaleX, this.baseScaleY, this.baseScaleZ);
        this.node.off(NodeEventType.SIZE_CHANGED, this.updateContentSize, this);
    }
    private recordBaseScale(): void {
        const snapshot = this.node.getComponent('Snapshot');
        const scale = this.node.scale;
        if (snapshot || this.centerScale === 1) {
            this.baseScaleX = scale.x;
            this.baseScaleY = scale.y;
            this.baseScaleZ = scale.z;
            return;
        }
        this.baseScaleX = scale.x * this.centerScale;
        this.baseScaleY = scale.y * this.centerScale;
        this.baseScaleZ = scale.z;
    }
    //检测渲染组件的材质，是否与本脚本匹配
    checkMaterial(): boolean {
        let ur = this.node.getComponent(UIRenderer);
        ur['updateMaterial']();
        this.material = ur.getMaterialInstance(0);
        let className = js.getClassName(this);
        this.materialName = ur.customMaterial.name;
        if (this.materialName !== className) {
            console.warn(`节点"${this.node.name}"的组件"${className}.ts"与材质"${this.materialName}.mtl"不匹配！请设置材质为"${className}.mtl"并重新编译！`);
            return false;
        }
        ur instanceof Sprite && ur.spriteFrame && (ur.spriteFrame.packable = false);
        return true;
    }
    updateContentSize(): void {
        let ut = this.node.getComponent(UITransform);
        this.material.setProperty('texSize', new Vec2(ut.width, ut.height));
        if (!this.node.getComponent('Snapshot')) {
            let shortSide = Math.min(ut.width, ut.height) * 0.5;
            this.centerScale = shortSide / (shortSide + this._outerWidth);
            this.node.setScale(this.baseScaleX / this.centerScale, this.baseScaleY / this.centerScale, this.baseScaleZ);
            this.material.setProperty('centerScale', this.centerScale);
        } else {
            this.centerScale = 1;
            this.material.setProperty('centerScale', 1);
        }
    }
}
declare global {
    module gi {
        class GlowRim extends Component {
            static Style: typeof Style;
            outerActive: boolean;    //外发光可见性
            outerStyle: Style;       //外发光样式
            outerColor: Color;       //外发光颜色
            outerWidth: number;      //外发光宽度
            innerActive: boolean;    //内发光可见性
            innerStyle: Style;       //内发光样式
            innerColor: Color;       //内发光颜色
            innerWidth: number;      //内发光宽度
            brightness: number;      //明暗度
        }
    }
}
((globalThis as any).gi ||= {}).GlowRim ||= Object.assign(GlowRim, { Style: Style });
