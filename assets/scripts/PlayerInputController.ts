import { Camera, EventTouch, input, Input, Node, UITransform, Vec2, Vec3 } from 'cc';
import { Grid } from './Grid';
import { Monster } from './Monster';
import { MonsterGlowController } from './MonsterGlowController';
import { PathLine } from './PathLine';
import { Player } from './Player';

export class PlayerInputController {
    constructor(
        private readonly worldNode: Node,
        private readonly getGrid: () => Grid | null,
        private readonly getPlayer: () => Player | null,
        private readonly getPathLine: () => PathLine | null,
        private readonly getCamera: () => Camera | null,
        private readonly getUiLayer: () => Node | null,
        private readonly getOpeningActive: () => boolean,
        private readonly getBattling: () => boolean,
        private readonly glow: MonsterGlowController | null,
        private readonly dismissMonsterGuide: () => boolean,
    ) {}

    init(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel);
    }

    destroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel);
    }

    update(dt: number): void {
        const player = this.getPlayer();
        const pathLine = this.getPathLine();
        if (player && player.isMoving() && pathLine) {
            pathLine.updateRemaining(player.node.position, dt);
        }
    }

    private onTouchStart = (event: EventTouch): void => {
        if (this.getOpeningActive()) return;
        this.dismissMonsterGuide();

        const grid = this.getGrid();
        const player = this.getPlayer();
        if (!grid || !player || player.dead || this.getBattling() || player.isInteracting()) return;
        if (this.isTouchOnUI(event)) return;

        const cell = this.getTouchCell(event);
        if (!cell) {
            this.glow?.hide();
            return;
        }

        const clickedMonster = grid.getMonsterAt(cell.x, cell.y);
        if (clickedMonster) this.glow?.show(clickedMonster);
        else this.glow?.hide();
    };

    private onTouchEnd = (event: EventTouch): void => {
        if (this.getOpeningActive()) return;

        const grid = this.getGrid();
        const player = this.getPlayer();
        if (!grid || !player || player.dead || this.getBattling() || player.isInteracting()) {
            this.glow?.hideLater();
            return;
        }
        if (this.isTouchOnUI(event)) {
            this.glow?.hideLater();
            return;
        }

        const highlightedMonster = this.glow?.currentMonster || null;
        const releasedOnHighlightedMonster = !!highlightedMonster
            && !!this.glow?.containsScreenPoint(event.getLocation());
        this.glow?.hideLater();
        if (releasedOnHighlightedMonster && highlightedMonster?.node?.isValid) {
            this.handleMoveTouch(
                new Vec2(highlightedMonster.gridCol, highlightedMonster.gridRow),
                highlightedMonster,
            );
            return;
        }

        const cell = this.getTouchCell(event);
        if (!cell) return;

        this.handleMoveTouch(cell);
    };

    private onTouchCancel = (): void => {
        this.glow?.hide();
    };

    private isTouchOnUI(event: EventTouch): boolean {
        const target = event.target;
        const uiLayer = this.getUiLayer();
        return !!(target && target instanceof Node && uiLayer && target.isChildOf(uiLayer));
    }

    private getTouchCell(event: EventTouch): Vec2 | null {
        const grid = this.getGrid();
        if (!grid) return null;

        const screenPos = event.getLocation();
        const camera = this.getCamera();
        const worldPos = camera
            ? camera.screenToWorld(new Vec3(screenPos.x, screenPos.y, 0))
            : new Vec3(screenPos.x, screenPos.y, 0);
        const worldTransform = this.worldNode.getComponent(UITransform);
        if (!worldTransform) return null;

        const local = worldTransform.convertToNodeSpaceAR(worldPos);
        return grid.worldToGrid(local);
    }

    private handleMoveTouch(cell: Vec2, selectedMonster: Monster | null = null): void {
        const grid = this.getGrid();
        const player = this.getPlayer();
        if (!grid || !player) return;

        const startCell = grid.worldToGrid(player.node.position) || new Vec2(player.gridCol, player.gridRow);
        const result = grid.findPath(startCell, cell);
        if (!result) return;

        const movePath = grid.buildMovePath(startCell, result.path, player.node.position.clone());
        const monsterHit = grid.firstMonsterOnPath(movePath);
        if (monsterHit) {
            const battlePath = grid.buildBattleApproachPath(
                player.node.position,
                monsterHit,
                monsterHit.monster.battleRadius,
            );
            if (battlePath) {
                const displayPath = selectedMonster === monsterHit.monster ? battlePath : movePath;
                this.getPathLine()?.drawPath(displayPath, displayPath[displayPath.length - 1]);
                player.moveTo(battlePath, monsterHit.monster);
                return;
            }
        }
        this.getPathLine()?.drawPath(movePath, movePath[movePath.length - 1]);
        player.moveTo(movePath, result.blockMonster);
    }
}
