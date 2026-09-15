import { _decorator, AudioClip, Prefab, sp } from 'cc';
import type { MonsterPrefabType } from './GameConfig';

const { ccclass, property } = _decorator;

export type GamePrefabKey =
    | 'role'
    | 'role1'
    | 'role2'
    | 'role3'
    | 'fail'
    | 'victory'
    | 'box'
    | 'powerSuit'
    | 'dao'
    | 'dachui'
    | 'kuijia'
    | 'toukui'
    | 'mount'
    | MonsterPrefabType;

export type GameAudioKey =
    | 'bgm'
    | 'attack1'
    | 'attack2'
    | 'attack3'
    | 'cheer'
    | 'shout'
    | 'heHa'
    | 'bossAttack'
    | 'bossDie'
    | 'monsterDie'
    | 'roleDie'
    | 'expCollect'
    | 'levelUp'
    | 'fail'
    | 'victory'
    | 'roleBehit'
    | 'help1'
    | 'help2'
    | 'roar'
    | 'smallAttack'
    | 'bigAttack';

/**
 * 游戏直接资源引用。
 * 在 GameManager 的 Inspector 中展开 gameAssets，并把对应资源拖入字段即可。
 */
@ccclass('GameAssets')
export class GameAssets {
    @property(Prefab) role: Prefab | null = null;
    @property(Prefab) role1: Prefab | null = null;
    @property(Prefab) role2: Prefab | null = null;
    @property(Prefab) role3: Prefab | null = null;

    @property(Prefab) monster1: Prefab | null = null;
    @property(Prefab) monster2: Prefab | null = null;
    @property(Prefab) monster3: Prefab | null = null;
    @property(Prefab) monster4: Prefab | null = null;

    @property(Prefab) box: Prefab | null = null;
    @property(Prefab) powerSuit: Prefab | null = null;
    @property(Prefab) dao: Prefab | null = null;
    @property(Prefab) dachui: Prefab | null = null;
    @property(Prefab) kuijia: Prefab | null = null;
    @property(Prefab) toukui: Prefab | null = null;
    @property(Prefab) mount: Prefab | null = null;

    @property(Prefab) fail: Prefab | null = null;
    @property(Prefab) victory: Prefab | null = null;

    @property(sp.SkeletonData) hit100001Attack2: sp.SkeletonData | null = null;
    @property(sp.SkeletonData) hit100001Attack4: sp.SkeletonData | null = null;
    @property(sp.SkeletonData) hit10009Attack4: sp.SkeletonData | null = null;

    @property(AudioClip) bgm: AudioClip | null = null;
    @property(AudioClip) attack1: AudioClip | null = null;
    @property(AudioClip) attack2: AudioClip | null = null;
    @property(AudioClip) attack3: AudioClip | null = null;
    @property(AudioClip) cheer: AudioClip | null = null;
    @property(AudioClip) shout: AudioClip | null = null;
    @property(AudioClip) heHa: AudioClip | null = null;
    @property(AudioClip) bossAttack: AudioClip | null = null;
    @property(AudioClip) bossDie: AudioClip | null = null;
    @property(AudioClip) monsterDie: AudioClip | null = null;
    @property(AudioClip) roleDie: AudioClip | null = null;
    @property(AudioClip) expCollect: AudioClip | null = null;
    @property(AudioClip) levelUp: AudioClip | null = null;
    @property(AudioClip) failAudio: AudioClip | null = null;
    @property(AudioClip) victoryAudio: AudioClip | null = null;
    @property(AudioClip) roleBehit: AudioClip | null = null;
    @property(AudioClip) help1: AudioClip | null = null;
    @property(AudioClip) help2: AudioClip | null = null;
    @property(AudioClip) roar: AudioClip | null = null;
    @property(AudioClip) smallAttack: AudioClip | null = null;
    @property(AudioClip) bigAttack: AudioClip | null = null;

    getPrefab(key: GamePrefabKey): Prefab | null {
        return this[key] as Prefab | null;
    }

    getAudio(key: GameAudioKey): AudioClip | null {
        if (key === 'fail') return this.failAudio;
        if (key === 'victory') return this.victoryAudio;
        return this[key] as AudioClip | null;
    }
}
