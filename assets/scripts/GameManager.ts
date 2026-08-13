import {
    _decorator, Component, Node, Prefab, instantiate, Graphics, UITransform,
    Label, Color, Vec2, Vec3, input, Input, EventTouch, director, Button, Camera,
} from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { PathLine } from './PathLine';
import { WallRegion } from './WallRegion';
import { CameraFollow } from './CameraFollow';
import { ExpOrb } from './ExpOrb';
import { Chest } from './Chest';
import { Level1 } from './GameConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏入口（挂在 GameWorld 节点上）：
 * - 用 Graphics 生成地面/墙（不需要墙预制体）
 * - 角色由预制体实例化；怪物直接在场景里摆放（Monsters 节点下）
 * - 全局点击输入 -> 寻路 -> 绿线 -> 移动 -> 战斗
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Prefab })
    playerPrefab: Prefab | null = null;

    /** 开箱后角色切换的形态（role1.prefab，动画名与 role 一致） */
    @property({ type: Prefab })
    role1Prefab: Prefab | null = null;

    private grid: Grid | null = null;
    private player: Player | null = null;
    private pathLine: PathLine | null = null;
    private battleResultNode: Node | null = null;
    private uiLayer: Node | null = null;
    private camera: Camera | null = null;
    private dropsNode: Node | null = null;
    private onPowerTick: (() => void) | null = null;
    private battling = false;
    private retryButton: Node | null = null;

    onLoad(): void {
        const canvas = this.node.parent;
        this.camera = canvas ? canvas.getComponentInChildren(Camera) : null;

        this.grid = this.getComponent(Grid) || this.addComponent(Grid);
        this.grid.init(Level1);
        this.bakeWallRegions();

        this.buildGround();
        this.buildDropsLayer();
        this.buildPathLine();
        this.spawnPlayer();
        this.spawnMonsters();
        this.spawnChests();
        this.buildUI();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        if (this.onPowerTick) this.unschedule(this.onPowerTick);
    }

    // ---------------- 场景搭建 ----------------

    private buildGround(): void {
        const ground = this.node.getChildByName('Ground');
        if (!ground) return;
        const g = ground.getComponent(Graphics) || ground.addComponent(Graphics);
        const w = Level1.cols * Level1.tileSize;
        const h = Level1.rows * Level1.tileSize;
        g.fillColor = new Color(46, 46, 58, 255);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.lineWidth = 1;
        g.strokeColor = new Color(70, 70, 88, 255);
        for (let c = 0; c <= Level1.cols; c++) {
            const x = -w / 2 + c * Level1.tileSize;
            g.moveTo(x, -h / 2);
            g.lineTo(x, h / 2);
            g.stroke();
        }
        for (let r = 0; r <= Level1.rows; r++) {
            const y = -h / 2 + r * Level1.tileSize;
            g.moveTo(-w / 2, y);
            g.lineTo(w / 2, y);
            g.stroke();
        }
    }

    /** 扫描场景里的 WallRegion 节点，把覆盖的格子烘焙成墙 */
    private bakeWallRegions(): void {
        if (!this.grid) return;
        const regions = this.node.getComponentsInChildren(WallRegion);
        if (regions.length === 0) return;
        let total = 0;
        for (const region of regions) {
            if (!region.node.activeInHierarchy) continue;
            total += region.bake(this.grid);
        }
        console.log(`[WallRegion] 烘焙 ${regions.length} 个区域，共 ${total} 格墙`);
    }

    private buildPathLine(): void {
        const node = this.node.getChildByName('PathLine');
        if (!node) return;
        this.pathLine = node.getComponent(PathLine) || node.addComponent(PathLine);
        this.pathLine.cornerRadius = 14;
    }

    /** 掉落物（经验球等）的专门层级：运行时动态生成，不挂在怪物身上 */
    private buildDropsLayer(): void {
        // 已有则复用，避免重复创建
        let node = this.node.getChildByName('Drops');
        if (!node) {
            node = new Node('Drops');
            node.addComponent(UITransform);
            this.node.addChild(node);
        }
        this.dropsNode = node;
    }

    /** 在指定世界位置生成一个经验球 */
    private spawnExpOrb(worldPos: Vec3, exp: number): ExpOrb {
        if (!this.dropsNode) {
            this.buildDropsLayer();
        }
        const node = new Node('ExpOrb');
        node.setPosition(worldPos);
        node.addComponent(UITransform).setContentSize(24, 24);
        const orb = node.addComponent(ExpOrb);
        orb.init(exp);
        this.dropsNode!.addChild(node);
        return orb;
    }

    /**
     * 怪物死亡经验球掉落规则：
     * 1) 角色战力 > 怪物：角色执行攻击动画时，立刻生成 2 个经验球（在怪物位置）
     * 2) 散落方向看怪物在角色的方位：左上 / 左下 / 右上 / 右下
     * 3) 2 个球 0.3s 抛物线散落（一个移动 60、一个 90），0.1s 后再抛物线移动 30
     * 4) 运动完成后 0.1s，经验球飞向角色
     * 5) 中途怪物头顶数字保持 0 不动；2 个球到达角色后，怪物与球一起消失
     */
    private startExpOrbDrop(monster: Monster, onComplete: () => void): void {
        if (!this.player) {
            onComplete();
            return;
        }
        const monsterPos = monster.node ? monster.node.position.clone() : new Vec3();
        // 方位：怪物在角色右 / 上 -> 方向取正
        const dx = monsterPos.x - this.player.node.position.x;
        const dy = monsterPos.y - this.player.node.position.y;
        const dirX = dx >= 0 ? 1 : -1;
        const dirY = dy >= 0 ? 1 : -1;

        const orb1 = this.spawnExpOrb(monsterPos, 0);
        const orb2 = this.spawnExpOrb(monsterPos, 0);
        let arrived = 0;
        const onArrive = () => {
            arrived++;
            if (arrived >= 2) {
                if (orb1.node && orb1.node.isValid) orb1.node.destroy();
                if (orb2.node && orb2.node.isValid) orb2.node.destroy();
                // 收到经验球：角色缩放脉冲
                if (this.player) this.player.playExpPulse();
                onComplete();
            }
        };

        // 两个球 Y 完全一致：垂直位移 vy 相同、弧线最高点相同；只有 X 不同（60 / 90）
        const vy = 20; // 垂直位移（跟随方位上/下，可调；0 = 纯水平散落）
        const peak1 = 40;
        const peak2 = 20;

        // 第一跳：0.5s，一个 X 移 60、一个 X 移 90，抛物线
        orb1.hop(dirX * 60, dirY * vy, 0.5, peak1);
        orb2.hop(dirX * 90, dirY * vy, 0.5, peak1);
        // 第一跳结束（0.5s）立刻第二跳：0.3s 再向右移动 30，抛物线
        this.scheduleOnce(() => {
            orb1.hop(dirX * 30, 0, 0.3, peak2);
            orb2.hop(dirX * 30, 0, 0.3, peak2);
        }, 0.5);
        // 第二跳结束（0.8s）立刻飞向角色：0.2s 到达
        this.scheduleOnce(() => {
            if (this.player) {
                // 实时追踪角色位置（角色移动后经验球也能追上）
                orb1.flyToLive(() => this.player!.node.position, 0.2, onArrive);
                orb2.flyToLive(() => this.player!.node.position, 0.2, onArrive);
            } else {
                orb1.flyTo(new Vec3(), 0.2, onArrive);
                orb2.flyTo(new Vec3(), 0.2, onArrive);
            }
        }, 0.8);
        // 经验球兜底：异常（球未归位）时也强制结束，并补一次缩放反馈
        this.scheduleOnce(() => {
            if (orb1.node && orb1.node.isValid) orb1.node.destroy();
            if (orb2.node && orb2.node.isValid) orb2.node.destroy();
            if (this.player && arrived < 2) this.player.playExpPulse();
            onComplete();
        }, 3);
    }

    private spawnPlayer(): void {
        const container = this.node.getChildByName('Player');
        if (!container || !this.grid) return;
        let node: Node;
        if (this.playerPrefab) {
            node = instantiate(this.playerPrefab);
            node.name = 'PlayerInstance';
            // 角色显示大小固定，与格子大小解耦
            this.fitToTile(node, 80);
        } else {
            node = this.createPlaceholder(Level1.tileSize * 0.6, new Color(90, 200, 255, 255));
            node.name = 'PlayerPlaceholder';
        }
        container.addChild(node);
        const player = node.addComponent(Player);
        player.init(Level1.playerPower, Level1.playerSpawn.col, Level1.playerSpawn.row, this.grid);
        this.bindPlayerEvents(player);
        this.player = player;
        this.assignCameraTarget();
    }

    /** 绑定角色事件（初始 / 切换 role1 后复用） */
    private bindPlayerEvents(player: Player): void {
        player.events = {
            onArrive: (m: Monster | null) => {
                if (this.pathLine) this.pathLine.hideTarget();
                if (m) this.doBattle(m);
            },
            onBattle: (m: Monster) => this.doBattle(m),
            onChest: (chest: Chest) => this.openChest(chest),
        };
    }

    /** 相机跟随角色：给 Camera 挂 CameraFollow 并指定目标 */
    private assignCameraTarget(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        const camera = canvas.getChildByName('Camera');
        if (!camera) return;
        const follow = camera.getComponent(CameraFollow) || camera.addComponent(CameraFollow);
        follow.target = this.player ? this.player.node : null;
    }

    update(dt: number): void {
        // 绿线跟随角色持续消失：每帧从角色当前位置重绘剩余路径
        if (this.player && this.player.isMoving() && this.pathLine) {
            this.pathLine.updateRemaining(this.player.node.position);
        }
    }

    private spawnMonsters(): void {
        const container = this.node.getChildByName('Monsters');
        if (!container || !this.grid) return;
        // 怪物直接在场景里摆放：Monsters 下的子节点就是怪物（预制体实例）
        // 位置取节点坐标（启动时吸附到最近格子），数值取子 Label 文本，缩放完全由编辑器控制
        for (const child of container.children) {
            child.active = true; // 初始化时恢复所有怪物显示（被杀怪用 active 隐藏，不销毁）
            if (!child.activeInHierarchy) continue;
            const monster = child.getComponent(Monster) || child.addComponent(Monster);
            monster.init(this.grid);
        }
    }

    /** 扫描场景里的宝箱并注册（战力读宝箱子 Label，不限角色战力） */
    private spawnChests(): void {
        if (!this.grid) return;
        const chests = this.node.getComponentsInChildren(Chest);
        for (const chest of chests) {
            if (!chest.node.activeInHierarchy) continue;
            chest.init(this.grid);
        }
    }

    /** 开箱：+战力、宝箱消失、角色切换 role1 */
    private openChest(chest: Chest): void {
        if (!this.player) return;
        // 和打怪一样：开箱后绿线消失
        if (this.pathLine) this.pathLine.clear();
        // 不限战力，直接加
        this.player.power += chest.power;
        this.player.refreshLabel();
        this.updatePowerUI();
        // 宝箱消失
        if (this.grid) this.grid.removeChest(chest);
        if (chest.node) chest.node.active = false;
        // 角色切换 role1（后续移动/打怪都用 role1）
        this.switchPlayerToRole1();
    }

    /** 把当前角色替换成 role1：位置/战力保留，动画名一致 */
    private switchPlayerToRole1(): void {
        if (!this.player || !this.role1Prefab || !this.grid) return;
        const container = this.node.getChildByName('Player');
        if (!container) return;
        const old = this.player;
        const pos = old.node.position.clone();
        const power = old.power;
        const facingDir = old.node.scale.x >= 0 ? 1 : -1;
        const cell = this.grid.worldToGrid(pos) || new Vec2(old.gridCol, old.gridRow);
        old.node.destroy();

        const node = instantiate(this.role1Prefab);
        node.name = 'PlayerInstance';
        this.fitToTile(node, 80);
        // role1 的 Label 写入当前战力（init 会读 Label）
        const label = node.getComponentInChildren(Label);
        if (label) label.string = String(power);
        container.addChild(node);

        const player = node.addComponent(Player);
        player.init(power, cell.x, cell.y, this.grid);
        player.setInitialFacing(facingDir);
        this.bindPlayerEvents(player);
        this.player = player;
        this.assignCameraTarget();
        this.updatePowerUI();
    }

    private buildUI(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        this.uiLayer = canvas.getChildByName('UILayer');
        if (!this.uiLayer) return;

        // 战斗结果提示
        const resultNode = this.uiLayer.getChildByName('BattleResult');
        if (resultNode) {
            this.battleResultNode = resultNode;
            this.createLabelNode(resultNode, '', new Color(255, 255, 255, 255), 64, 0);
            resultNode.active = false;
        }

        // 战力 HUD
        const hud = this.uiLayer.getChildByName('PowerHUD');
        if (hud) {
            this.createLabelNode(hud, '战力：' + Level1.playerPower, new Color(200, 220, 255, 255), 30, 0);
            hud.setPosition(-500, 290, 0);
        }

    }

    // ---------------- 输入 ----------------

    private onTouchStart(event: EventTouch): void {
        if (!this.grid || !this.player || this.player.dead || this.battling) return;
        // 点击 UI 区域（返回按钮等）不触发寻路
        const target = event.target;
        if (target && target instanceof Node && this.uiLayer && target.isChildOf(this.uiLayer)) return;

        // 屏幕坐标 -> 世界坐标（经过相机换算，相机跟随角色移动后点击仍准确）
        const screenPos = event.getLocation();
        const worldPos = this.camera
            ? this.camera.screenToWorld(new Vec3(screenPos.x, screenPos.y, 0))
            : new Vec3(screenPos.x, screenPos.y, 0);
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos);
        const cell = this.grid.worldToGrid(local);
        if (!cell) return; // 地图外：无反应

        // 起点用角色当前实际位置对应的格子（移动中也能准确重新寻路）
        const startCell = this.grid.worldToGrid(this.player.node.position) || new Vec2(this.player.gridCol, this.player.gridRow);
        const result = this.grid.findPath(startCell, cell);
        if (!result) return; // 墙 / 不可达 / 被围怪物：无反应

        // 路径拉直 + 拐点贴墙：得到世界坐标点列
        const movePath = this.grid.buildMovePath(startCell, result.path, this.player.node.position.clone());
        if (this.pathLine) this.pathLine.drawPath(movePath, movePath[movePath.length - 1]);
        this.player.moveTo(movePath, result.blockMonster);
    }

    // ---------------- 战斗（需求 4/12/13/14） ----------------

    private doBattle(monster: Monster): void {
        if (!this.player || this.battling) return;
        this.battling = true;
        if (this.pathLine) this.pathLine.clear();
        // 双方同时播攻击；判定提前到攻击播放时：数字立即分段跳动
        const win = this.player.power > monster.power;
        // 怪物不销毁：死亡动画播过 + 经验球归位后，用 active=false 隐藏（避免销毁后回调报错）
        let diePlayed = false;
        let orbsDone = false;
        const hideMonster = () => {
            if (!(diePlayed && orbsDone)) return;
            if (monster.node) {
                monster.node.active = false;
            }
            this.updatePowerUI();
        };
        this.player.playAttack(() => {
            // 角色攻击播完：怪物立刻停攻击，播放死亡动画（角色胜时）
            if (win) {
                // 战斗结束：角色可以继续移动；怪物从寻路表移除，不再参与战斗
                this.battling = false;
                if (this.grid) this.grid.removeMonster(monster);
                // 死亡动画播放完后，等经验球归位再一起隐藏
                monster.playDie(() => {
                    diePlayed = true;
                    hideMonster();
                });
                // 死亡动画兜底：异常（动画不播完/骨骼失效）时强制结束
                this.scheduleOnce(() => {
                    diePlayed = true;
                    hideMonster();
                }, 3);
                // 角色攻击动画播放后才产生经验球
                this.startExpOrbDrop(monster, () => {
                    orbsDone = true;
                    hideMonster();
                });
            }
        });
        monster.playAttack(() => {
            // 怪物攻击播完（角色败时）：角色倒地
            if (!win) {
                this.battling = false;
                this.showBattleResult('失败', new Color(255, 90, 90, 255));
                this.player!.playDie();
                this.showDeathUI();
            }
        });
        this.startPowerTick(monster, win);
    }

    /**
     * 头顶数字分段跳动：3 段、每段 0.3s。
     * 赢家按输家战力分 3 段加上去，输家分 3 段减到 0；输的一方在攻击播完后播放 die。
     * 例：角色 10 vs 怪物 9，角色胜 -> 角色 13/16/19，怪物 6/3/0。
     */
    private startPowerTick(monster: Monster, win: boolean): void {
        const player = this.player;
        if (!player) return;
        const loserPower = win ? monster.power : player.power;
        const startPlayerPower = player.power;
        const startMonsterPower = monster.power;
        let step = 0;

        this.onPowerTick = () => {
            step++;
            const gain = Math.round(loserPower * step / 3);
            if (win) {
                // 角色加上去、怪物减到 0
                player.power = startPlayerPower + gain;
                if (monster.node && monster.node.isValid) monster.setLabelText(String(Math.max(0, startMonsterPower - gain)));
            } else {
                // 角色减到 0、怪物加上去
                player.power = Math.max(0, startPlayerPower - gain);
                monster.power = startMonsterPower + gain;
                if (monster.node && monster.node.isValid) monster.setLabelText(String(monster.power));
            }
            player.refreshLabel();
            this.updatePowerUI();
            if (step >= 3) {
                this.unschedule(this.onPowerTick!);
                if (win) {
                    // 结束时补成精确值，避免分段取整误差
                    player.power = startPlayerPower + loserPower;
                    player.refreshLabel();
                    this.updatePowerUI();
                }
            }
        };
        this.schedule(this.onPowerTick, 0.1, 2);//就用0.1
    }

    /** 刷新角色头顶数字和左上角战力 HUD */
    private updatePowerUI(): void {
        if (!this.player) return;
        if (this.uiLayer) {
            const hud = this.uiLayer.getChildByName('PowerHUD');
            const label = hud && hud.getComponentInChildren(Label);
            if (label) label.string = '战力：' + this.player.power;
        }
    }

    private showBattleResult(text: string, color: Color): void {
        if (!this.battleResultNode) return;
        const label = this.battleResultNode.getComponentInChildren(Label);
        if (label) {
            label.string = text;
            label.color = color;
        }
        this.battleResultNode.active = true;
        this.unschedule(this.hideBattleResult);
        this.scheduleOnce(this.hideBattleResult, 1.2);
    }

    /** 角色死亡：显示"再来一次"按钮（复用原来的重载场景逻辑） */
    private showDeathUI(): void {
        if (!this.uiLayer || this.retryButton) return;
        const btn = new Node('RetryButton');
        btn.addComponent(UITransform).setContentSize(240, 68);
        const g = btn.addComponent(Graphics);
        g.fillColor = new Color(70, 140, 255, 255);
        g.rect(-120, -34, 240, 68);
        g.fill();
        // 相机始终对准角色：直接把按钮放在相机位置（即角色所在屏幕位置）往下偏移
        const camNode = this.camera ? this.camera.node : null;
        btn.setPosition(camNode ? camNode.position.x : 0, (camNode ? camNode.position.y : 0) - 260, 0);
        this.uiLayer.addChild(btn);
        this.createLabelNode(btn, '再来一次', new Color(255, 255, 255, 255), 34, 0);
        const b = btn.addComponent(Button);
        b.transition = Button.Transition.NONE;
        b.target = btn;
        btn.on(Button.EventType.CLICK, () => director.loadScene('game'));
        this.retryButton = btn;
    }

    private hideBattleResult(): void {
        if (this.battleResultNode) this.battleResultNode.active = false;
    }

    // ---------------- 工具 ----------------

    private fitToTile(node: Node, targetSize: number): void {
        const ut = node.getComponent(UITransform);
        if (!ut) return;
        const w = ut.width;
        const h = ut.height;
        if (w <= 0 || h <= 0) return;
        const scale = targetSize / Math.max(w, h);
        node.setScale(scale, scale, 1);
    }

    private createPlaceholder(size: number, color: Color): Node {
        const n = new Node('Placeholder');
        n.addComponent(UITransform).setContentSize(size, size);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.circle(0, 0, size / 2);
        g.fill();
        return n;
    }

    private createLabelNode(parent: Node, text: string, color: Color, fontSize: number, yOffset: number): Label {
        const n = new Node('Label');
        n.name = 'PowerLabel';
        n.addComponent(UITransform).setContentSize(200, 60);
        const label = n.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.color = color;
        label.isBold = true;
        parent.addChild(n);
        n.setPosition(0, yOffset, 0);
        return label;
    }
}
