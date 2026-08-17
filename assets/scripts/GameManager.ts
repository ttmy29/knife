import {
    _decorator, Component, Node, Prefab, instantiate, Graphics, UITransform,
    Label, Color, Vec2, Vec3, input, Input, EventTouch, director, Button, Camera, Animation,
} from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { Player } from './Player';
import { PathLine } from './PathLine';
import { WallRegion } from './WallRegion';
import { CameraFollow } from './CameraFollow';
import { ExpOrb } from './ExpOrb';
import { Chest } from './Chest';
import { FailPanel } from './FailPanel';
import { Level1 } from './GameConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏入口（挂�?GameWorld 节点上）�? * - �?Graphics 生成地面/墙（不需要墙预制体）
 * - 角色由预制体实例化；怪物直接在场景里摆放（Monsters 节点下）
 * - 全局点击输入 -> 寻路 -> 绿线 -> 移动 -> 战斗
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Prefab })
    playerPrefab: Prefab | null = null;

    /** 开箱后角色切换的形态（role1.prefab，动画名�?role 一致） */
    @property({ type: Prefab })
    role1Prefab: Prefab | null = null;

    @property({ type: Prefab })
    failPrefab: Prefab | null = null;

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
    private failPanel: Node | null = null;
    private finalMonster: Monster | null = null;
    private glowHolder: Node | null = null;
    private glowingMonster: Monster | null = null;
    private glowingMonsterParent: Node | null = null;
    private glowingMonsterSiblingIndex = -1;
    private glowingMonsterScale: Vec3 | null = null;
    private glowingLabelRoot: Node | null = null;
    private glowingLabelParent: Node | null = null;
    private glowingLabelSiblingIndex = -1;
    private glowingLabelPosition: Vec3 | null = null;
    private glowingLabelScale: Vec3 | null = null;
    private glowingLabelActive = true;
    private hideGlowTask: (() => void) | null = null;

    onLoad(): void {
        const canvas = this.node.parent;
        this.camera = canvas ? canvas.getComponentInChildren(Camera) : null;
        this.glowHolder = this.node.getChildByName('GlowHolder') || (canvas ? canvas.getChildByName('GlowHolder') : null);
        if (this.glowHolder) {
            for (const child of this.glowHolder.children) {
                if (child.name !== 'Camera') child.active = false;
            }
            this.glowHolder.active = false;
        }

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
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    onDestroy(): void {
        this.hideMonsterGlow();
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
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

    /** 扫描场景里的 WallRegion 节点，把覆盖的格子烘焙成�?*/
    private bakeWallRegions(): void {
        if (!this.grid) return;
        const regions = this.node.getComponentsInChildren(WallRegion);
        if (regions.length === 0) return;
        let total = 0;
        for (const region of regions) {
            if (!region.node.activeInHierarchy) continue;
            total += region.bake(this.grid);
        }
       // console.log(`[WallRegion] 烘焙 ${regions.length} 个区域，�?${total} 格墙`);
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
     * 1) 角色战力 > 怪物：角色执行攻击动画时，立刻生�?2 个经验球（在怪物位置�?     * 2) 散落方向看怪物在角色的方位：左�?/ 左下 / 右上 / 右下
     * 3) 2 个球 0.3s 抛物线散落（一个移�?60、一�?90），0.1s 后再抛物线移�?30
     * 4) 运动完成�?0.1s，经验球飞向角色
     * 5) 中途怪物头顶数字保持 0 不动�? 个球到达角色后，怪物与球一起消�?     */
    private startExpOrbDrop(monster: Monster, onComplete: () => void): void {
        if (!this.player) {
            onComplete();
            return;
        }
        const monsterPos = monster.node ? monster.node.position.clone() : new Vec3();
        // 方位：怪物在角色右 / �?-> 方向取正
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

        const vy = 20;
        const peak1 = 40;
        const peak2 = 20;

        // 第一跳：0.5s，一�?X �?60、一�?X �?90，抛物线
        orb1.hop(dirX * 60, dirY * vy, 0.5, peak1);
        orb2.hop(dirX * 90, dirY * vy, 0.5, peak1);
        // 第一跳结束（0.5s）立刻第二跳�?.3s 再向右移�?30，抛物线
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
            this.fitToTile(node, 50);
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

    /** 绑定角色事件（初�?/ 切换 role1 后复用） */
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

    /** 相机跟随角色：给 Camera �?CameraFollow 并指定目�?*/
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
        let highestMonster: Monster | null = null;
        for (const child of container.children) {
            child.active = true; // 初始化时恢复所有怪物显示（被杀怪用 active 隐藏，不销毁）
            if (!child.activeInHierarchy) continue;
            const monster = child.getComponent(Monster) || child.addComponent(Monster);
            monster.init(this.grid);
            if (!highestMonster || monster.power > highestMonster.power) highestMonster = monster;
            if (child.name === 'monster1') this.finalMonster = monster;
        }
        if (!this.finalMonster) this.finalMonster = highestMonster;
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

    /** 开箱：+战力、宝箱消失、角色切�?role1 */
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
        this.switchPlayerToRole1();
    }

    /** 把当前角色替换成 role1：位�?战力保留，动画名一�?*/
    private switchPlayerToRole1(): void {
        if (!this.player || !this.role1Prefab || !this.grid) return;
        const container = this.node.getChildByName('Player');
        if (!container) return;
        const old = this.player;
        const pos = old.node.position.clone();
        const power = old.power;
        const facingDir = old.getFacing();
        const cell = this.grid.worldToGrid(pos) || new Vec2(old.gridCol, old.gridRow);
        old.node.destroy();

        const node = instantiate(this.role1Prefab);
        node.name = 'PlayerInstance';
        this.fitToTile(node, 50);
        const label = node.getComponentInChildren(Label);
        if (label) label.string = String(power);
        container.addChild(node);
        this.playRole1NormalAnimation(node);

        const player = node.addComponent(Player);
        player.init(power, cell.x, cell.y, this.grid);
        player.setInitialFacing(facingDir);
        this.bindPlayerEvents(player);
        this.player = player;
        this.assignCameraTarget();
        this.updatePowerUI();
    }

    private playRole1NormalAnimation(role1Node: Node): void {
        const animNode = role1Node.getChildByName('Node');
        if (!animNode) return;
        animNode.active = true;
        const anim = animNode.getComponent(Animation);
        if (anim) anim.play();
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
        if (this.isTouchOnUI(event)) return;

        const cell = this.getTouchCell(event);
        if (!cell) {
            this.hideMonsterGlow();
            return;
        }

        const clickedMonster = this.grid.getMonsterAt(cell.x, cell.y);
        if (clickedMonster) this.showMonsterGlow(clickedMonster);
        else this.hideMonsterGlow();
    }

    private onTouchEnd(event: EventTouch): void {
        if (!this.grid || !this.player || this.player.dead || this.battling) {
            this.hideMonsterGlow();
            return;
        }
        if (this.isTouchOnUI(event)) {
            this.hideMonsterGlow();
            return;
        }

        const cell = this.getTouchCell(event);
        this.hideMonsterGlow();
        if (!cell) return;

        this.handleMoveTouch(cell);
    }

    private onTouchCancel(): void {
        this.hideMonsterGlow();
    }

    private isTouchOnUI(event: EventTouch): boolean {
        const target = event.target;
        return !!(target && target instanceof Node && this.uiLayer && target.isChildOf(this.uiLayer));
    }

    private getTouchCell(event: EventTouch): Vec2 | null {
        if (!this.grid) return null;
        const screenPos = event.getLocation();
        const worldPos = this.camera
            ? this.camera.screenToWorld(new Vec3(screenPos.x, screenPos.y, 0))
            : new Vec3(screenPos.x, screenPos.y, 0);
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos);
        return this.grid.worldToGrid(local);
    }

    private handleMoveTouch(cell: Vec2): void {
        if (!this.grid || !this.player) return;
        const startCell = this.grid.worldToGrid(this.player.node.position) || new Vec2(this.player.gridCol, this.player.gridRow);
        const result = this.grid.findPath(startCell, cell);
        if (!result) return;

        const movePath = this.grid.buildMovePath(startCell, result.path, this.player.node.position.clone());
        if (this.pathLine) this.pathLine.drawPath(movePath, movePath[movePath.length - 1]);
        this.player.moveTo(movePath, result.blockMonster);
    }

    // ---------------- 战斗（需�?4/12/13/14�?----------------

    private doBattle(monster: Monster): void {
        if (!this.player || this.battling) return;
        this.hideMonsterGlow();
        this.battling = true;
        if (this.pathLine) this.pathLine.clear();
        this.player.faceToWorldX(monster.node.position.x);
        const win = this.player.power > monster.power;
        let diePlayed = false;
        let orbsDone = false;
        const hideMonster = () => {
            if (!(diePlayed && orbsDone)) return;
            if (monster.node) {
                monster.node.active = false;
            }
            this.updatePowerUI();
        };
        if (win) {
            this.player.playAttack(() => {
                // 角色攻击播完：怪物立刻停攻击，播放死亡动画（角色胜时）
                this.battling = false;
                if (this.grid) this.grid.removeMonster(monster);
                monster.playDie(() => {
                    diePlayed = true;
                    hideMonster();
                });
                // 死亡动画兜底：异常（动画不播�?骨骼失效）时强制结束
                this.scheduleOnce(() => {
                    diePlayed = true;
                    hideMonster();
                }, 3);
                this.startExpOrbDrop(monster, () => {
                    orbsDone = true;
                    hideMonster();
                });
                if (monster === this.finalMonster) this.showVictoryUI();
            });
            monster.playAttack();
        } else {
            this.player.playAttack();
            monster.playAttack();
            this.scheduleOnce(() => {
                this.battling = false;
                this.showBattleResult('失败', new Color(255, 90, 90, 255));
                this.player!.playDie();
                this.showDeathUI();
            }, 0.5);
        }
        this.startPowerTick(monster, win);
    }

    private showMonsterGlow(monster: Monster): void {
        if (!this.glowHolder || !monster.node || !monster.node.isValid) return;
        this.hideMonsterGlow();
        const parent = monster.node.parent;
        if (!parent) return;

        const localPos = monster.node.position.clone();
        const scale = monster.node.scale.clone();
        this.glowingMonster = monster;
        this.glowingMonsterParent = parent;
        this.glowingMonsterSiblingIndex = parent.children.indexOf(monster.node);
        this.glowingMonsterScale = scale;
        this.detachMonsterLabelForGlow(monster, parent);

        this.glowHolder.setPosition(localPos);
        this.glowHolder.active = true;
        monster.node.setParent(this.glowHolder);
        monster.node.setPosition(0, 0, 0);
        const worldScale = this.node.scale;
        monster.node.setScale(
            worldScale.x !== 0 ? scale.x / worldScale.x : scale.x,
            worldScale.y !== 0 ? scale.y / worldScale.y : scale.y,
            scale.z,
        );

    }

    private hideMonsterGlow(): void {
        if (this.hideGlowTask) {
            this.unschedule(this.hideGlowTask);
            this.hideGlowTask = null;
        }
        const monster = this.glowingMonster;
        const parent = this.glowingMonsterParent;
        if (monster && monster.node && monster.node.isValid && parent && parent.isValid) {
            const glowLocalPos = this.glowHolder ? this.glowHolder.position.clone() : monster.node.position.clone();
            const scale = this.glowingMonsterScale;
            monster.node.setParent(parent);
            monster.node.setPosition(glowLocalPos);
            if (scale) monster.node.setScale(scale);
            if (this.glowingMonsterSiblingIndex >= 0) monster.node.setSiblingIndex(this.glowingMonsterSiblingIndex);
        }
        this.restoreMonsterLabelAfterGlow();
        if (this.glowHolder) this.glowHolder.active = false;
        this.glowingMonster = null;
        this.glowingMonsterParent = null;
        this.glowingMonsterSiblingIndex = -1;
        this.glowingMonsterScale = null;
    }

    private detachMonsterLabelForGlow(monster: Monster, fallbackParent: Node): void {
        const labelRoot = monster.getPowerLabelGlowRoot();
        if (!labelRoot || !labelRoot.isValid || labelRoot === monster.node) return;
        const labelParent = labelRoot.parent;
        if (!labelParent) return;

        this.glowingLabelRoot = labelRoot;
        this.glowingLabelParent = labelParent;
        this.glowingLabelSiblingIndex = labelParent.children.indexOf(labelRoot);
        this.glowingLabelPosition = labelRoot.position.clone();
        this.glowingLabelScale = labelRoot.scale.clone();
        this.glowingLabelActive = labelRoot.active;

        const overlayParent = this.glowHolder && this.glowHolder.parent ? this.glowHolder.parent : fallbackParent;
        labelRoot.setParent(overlayParent, true);
        labelRoot.active = this.glowingLabelActive;
        if (this.glowHolder && overlayParent === this.glowHolder.parent) {
            labelRoot.setSiblingIndex(this.glowHolder.getSiblingIndex() + 1);
        }
    }

    private restoreMonsterLabelAfterGlow(): void {
        const labelRoot = this.glowingLabelRoot;
        const labelParent = this.glowingLabelParent;
        if (labelRoot && labelRoot.isValid && labelParent && labelParent.isValid) {
            labelRoot.setParent(labelParent);
            if (this.glowingLabelPosition) labelRoot.setPosition(this.glowingLabelPosition);
            if (this.glowingLabelScale) labelRoot.setScale(this.glowingLabelScale);
            labelRoot.active = this.glowingLabelActive;
            if (this.glowingLabelSiblingIndex >= 0) labelRoot.setSiblingIndex(this.glowingLabelSiblingIndex);
        }
        this.glowingLabelRoot = null;
        this.glowingLabelParent = null;
        this.glowingLabelSiblingIndex = -1;
        this.glowingLabelPosition = null;
        this.glowingLabelScale = null;
        this.glowingLabelActive = true;
    }

    /**
     * 头顶数字分段跳动�? 段、每�?0.3s�?     * 赢家按输家战力分 3 段加上去，输家分 3 段减�?0；输的一方在攻击播完后播�?die�?     * 例：角色 10 vs 怪物 9，角色胜 -> 角色 13/16/19，怪物 6/3/0�?     */
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
        this.schedule(this.onPowerTick, 0.2, 2);//就用0.1
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

    /** 角色死亡：显�?再来一�?按钮（复用原来的重载场景逻辑�?*/
    private showDeathUI(): void {
        if (!this.uiLayer || this.failPanel) return;
        if (!this.failPrefab) {
            this.showRestartButton('再来一次', new Color(70, 140, 255, 255));
            return;
        }

        const panel = instantiate(this.failPrefab);
        panel.name = 'FailPanel';
        this.uiLayer.addChild(panel);
        const failPanel = panel.addComponent(FailPanel);
        failPanel.play(this.camera ? this.camera.node : null);
        this.failPanel = panel;
    }

    /** 打败最终怪物：显�?游戏胜利"按钮（暂时复用再来一次逻辑�?*/
    private showVictoryUI(): void {
        this.showRestartButton('游戏胜利', new Color(70, 180, 110, 255));
    }

    private showRestartButton(text: string, color: Color): void {
        if (!this.uiLayer || this.retryButton) return;
        const btn = new Node('RetryButton');
        btn.addComponent(UITransform).setContentSize(240, 68);
        const g = btn.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-120, -34, 240, 68);
        g.fill();
        const camNode = this.camera ? this.camera.node : null;
        btn.setPosition(camNode ? camNode.position.x : 0, (camNode ? camNode.position.y : 0) - 260, 0);
        this.uiLayer.addChild(btn);
        this.createLabelNode(btn, text, new Color(255, 255, 255, 255), 34, 0);
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
