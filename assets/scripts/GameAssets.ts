import { _decorator, AudioClip, Prefab } from 'cc';
import type { MonsterPrefabType } from './GameConfig';

const { ccclass, property } = _decorator;

export type GamePrefabKey =
    | 'role'
    | 'role1'
    | 'role2'
    | 'role3'
    | 'boom'
    | 'boom2'
    | 'light'
    | 'fail'
    | 'victory'
    | 'confirm'
    | 'hp'
    | 'box'
    | 'powerSuit'
    | 'dao'
    | 'dachui'
    | 'kuijia'
    | 'toukui'
    | 'mount'
    | 'fireDao'
    | 'trop'
    | 'wheel'
    | 'needle'
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
    | 'bigAttack'
    | 'roleAttack'
    | 'dianji'
    | 'fire'
    | 'skill1'
    | 'skill2'
    | 'skill3';

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
    @property(Prefab) boom: Prefab | null = null;
    @property(Prefab) boom2: Prefab | null = null;
    @property(Prefab) light: Prefab | null = null;

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
    @property(Prefab) fireDao: Prefab | null = null;
    @property(Prefab) trop: Prefab | null = null;
    @property(Prefab) wheel: Prefab | null = null;
    @property(Prefab) needle: Prefab | null = null;

    @property(Prefab) fail: Prefab | null = null;
    @property(Prefab) victory: Prefab | null = null;
    @property(Prefab) confirm: Prefab | null = null;
    @property(Prefab) hp: Prefab | null = null;

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
    @property(AudioClip) roleAttack: AudioClip | null = null;
    @property(AudioClip) dianji: AudioClip | null = null;
    @property(AudioClip) fire: AudioClip | null = null;
    @property(AudioClip) skill1: AudioClip | null = null;
    @property(AudioClip) skill2: AudioClip | null = null;
    @property(AudioClip) skill3: AudioClip | null = null;

    getPrefab(key: GamePrefabKey): Prefab | null {
        return this[key] as Prefab | null;
    }

    getAudio(key: GameAudioKey): AudioClip | null {
        if (key === 'fail') return this.failAudio;
        if (key === 'victory') return this.victoryAudio;
        return this[key] as AudioClip | null;
    }
}
