import { Component, Node, UITransform, Vec3 } from 'cc';
import { ExpOrb } from './ExpOrb';
import { Monster } from './Monster';
import { Player } from './Player';
import { AudioManager } from './core/AudioManager';

export class RewardController {
    private dropsNode: Node | null = null;
    private onPowerTick: (() => void) | null = null;
    private pendingPowerGain = 0;
    private powerGainAnimating = false;
    private powerGainStart = 0;
    private powerGainTarget = 0;

    constructor(
        private readonly owner: Component,
        private readonly worldNode: Node,
        private readonly getPlayer: () => Player | null,
    ) {}

    init(): void {
        this.buildDropsLayer();
    }

    destroy(): void {
        if (this.onPowerTick) {
            this.owner.unschedule(this.onPowerTick);
            this.onPowerTick = null;
        }
    }

    /**
     * 怪物死亡经验球掉落规则：
     * 1) 角色攻击完成后，在怪物位置生成 2 个经验球。
     * 2) 逻辑战力在怪物被击败时立即增加；经验球到达后只更新显示数字。
     * 3) 怪物死亡动画独立播放，动画完成即可隐藏，不等待经验球。
     */
    startExpOrbDrop(monster: Monster, onComplete: () => void): void {
        const player = this.getPlayer();
        if (!player) {
            onComplete();
            return;
        }
        const monsterPos = monster.node ? monster.node.position.clone() : new Vec3();
        const dx = monsterPos.x - player.node.position.x;
        const dy = monsterPos.y - player.node.position.y;
        const dirX = dx >= 0 ? 1 : -1;
        const dirY = dy >= 0 ? 1 : -1;

        const orb1 = this.spawnExpOrb(monsterPos, 0);
        const orb2 = this.spawnExpOrb(monsterPos, 0);
        let arrived = 0;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            onComplete();
        };
        const onArrive = () => {
            arrived++;
            if (arrived === 1) AudioManager.playExpCollect();
            if (arrived >= 2) {
                if (orb1.node && orb1.node.isValid) orb1.node.destroy();
                if (orb2.node && orb2.node.isValid) orb2.node.destroy();
                const currentPlayer = this.getPlayer();
                if (currentPlayer && currentPlayer.node && currentPlayer.node.isValid) {
                    currentPlayer.playExpPulse();
                }
                finish();
            }
        };

        const vy = 20;
        const peak1 = 40;
        const peak2 = 20;

        orb1.hop(dirX * 60, dirY * vy, 0.5, peak1);
        orb2.hop(dirX * 90, dirY * vy, 0.5, peak1);
        this.owner.scheduleOnce(() => {
            orb1.hop(dirX * 30, 0, 0.3, peak2);
            orb2.hop(dirX * 30, 0, 0.3, peak2);
        }, 0.5);
        this.owner.scheduleOnce(() => {
            const currentPlayer = this.getPlayer();
            if (currentPlayer && currentPlayer.node && currentPlayer.node.isValid) {
                orb1.flyToLive(() => currentPlayer.node.position, 0.2, onArrive);
                orb2.flyToLive(() => currentPlayer.node.position, 0.2, onArrive);
            } else {
                orb1.flyTo(new Vec3(), 0.2, onArrive);
                orb2.flyTo(new Vec3(), 0.2, onArrive);
            }
        }, 0.8);
        this.owner.scheduleOnce(() => {
            if (completed) return;
            if (orb1.node && orb1.node.isValid) orb1.node.destroy();
            if (orb2.node && orb2.node.isValid) orb2.node.destroy();
            const currentPlayer = this.getPlayer();
            if (currentPlayer && currentPlayer.node && currentPlayer.node.isValid && arrived < 2) {
                currentPlayer.playExpPulse();
            }
            finish();
        }, 3);
    }

    /** 经验球全部吸收后，把已生效的逻辑战力滚动到显示数字。 */
    enqueuePlayerPowerGain(gain: number): void {
        if (gain <= 0) return;
        this.pendingPowerGain += gain;
        if (this.powerGainAnimating) return;
        this.playNextPowerGain();
    }

    /** 宝箱立即更新显示值；若怪物奖励正在滚动，同时修正动画区间，避免下一帧覆盖。 */
    applyImmediateDisplayedPowerGain(gain: number): void {
        if (gain <= 0) return;
        const player = this.getPlayer();
        if (!player) return;

        player.setDisplayedPower(player.getDisplayedPower() + gain);
        if (this.powerGainAnimating) {
            this.powerGainStart += gain;
            this.powerGainTarget += gain;
        }
    }

    /** 失败流程保留角色三段下降，但怪物数字始终保持原值。 */
    startPlayerPowerLossTick(): void {
        const player = this.getPlayer();
        if (!player) return;
        const startPlayerPower = player.power;
        let step = 0;

        this.onPowerTick = () => {
            step++;
            player.power = Math.max(0, startPlayerPower - Math.round(startPlayerPower * step / 3));
            player.setDisplayedPower(player.power);
            if (step >= 3) {
                this.owner.unschedule(this.onPowerTick!);
                this.onPowerTick = null;
            }
        };
        this.owner.schedule(this.onPowerTick, 0.2, 2);
    }

    private buildDropsLayer(): void {
        let node = this.worldNode.getChildByName('Drops');
        if (!node) {
            node = new Node('Drops');
            node.addComponent(UITransform);
            this.worldNode.addChild(node);
        }
        this.dropsNode = node;
    }

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

    private playNextPowerGain(): void {
        const player = this.getPlayer();
        if (!player || this.pendingPowerGain <= 0) {
            this.powerGainAnimating = false;
            return;
        }
        const gain = this.pendingPowerGain;
        this.pendingPowerGain = 0;
        this.powerGainAnimating = true;
        this.powerGainStart = player.getDisplayedPower();
        this.powerGainTarget = this.powerGainStart + gain;
        const steps = 10;
        let step = 0;

        this.onPowerTick = () => {
            step++;
            const currentPlayer = this.getPlayer();
            if (!currentPlayer) return;
            const displayedPower = step >= steps
                ? this.powerGainTarget
                : this.powerGainStart + Math.round(gain * step / steps);
            currentPlayer.setDisplayedPower(displayedPower);
            if (step >= steps) {
                this.owner.unschedule(this.onPowerTick!);
                this.onPowerTick = null;
                this.powerGainAnimating = false;
                this.playNextPowerGain();
            }
        };
        this.owner.schedule(this.onPowerTick, 0.03, steps - 1);
    }
}
