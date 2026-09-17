import { AudioClip, AudioSource, Node, warn } from 'cc';
import { AttackAudioType, ResourcePath } from '../config/ResourceConfig';
import { GameAssets, GameAudioKey } from '../GameAssets';
import type { SkillName } from '../config/SkillConfig';
import { BundleManager } from './BundleManager';

const AUDIO_PATHS: Record<GameAudioKey, string> = {
    bgm: ResourcePath.Audio.Bgm,
    attack1: ResourcePath.Audio.Attack,
    attack2: ResourcePath.Audio.Attack2,
    attack3: ResourcePath.Audio.Attack3,
    cheer: ResourcePath.Audio.Cheer,
    shout: ResourcePath.Audio.Shout,
    heHa: ResourcePath.Audio.HeHa,
    bossAttack: ResourcePath.Audio.bossAttack,
    bossDie: ResourcePath.Audio.bossDie,
    monsterDie: ResourcePath.Audio.MonsterDie,
    roleDie: ResourcePath.Audio.RoleDie,
    expCollect: ResourcePath.Audio.ExpCollect,
    levelUp: ResourcePath.Audio.LevelUp,
    fail: ResourcePath.Audio.Fail,
    victory: ResourcePath.Audio.Victory,
    roleBehit: ResourcePath.Audio.RoleBehit,
    help1: ResourcePath.Audio.Help1,
    help2: ResourcePath.Audio.Help2,
    roar: ResourcePath.Audio.Roar,
    smallAttack: ResourcePath.Audio.smallAttack,
    bigAttack: ResourcePath.Audio.bigAttack,
    roleAttack: ResourcePath.Audio.RoleAttack,
    skill1: ResourcePath.Audio.Skill1,
    skill2: ResourcePath.Audio.Skill2,
    skill3: ResourcePath.Audio.Skill3,
};

export class AudioManager {
    private static source: AudioSource | null = null;
    private static assets: GameAssets | null = null;
    private static bgmClip: AudioClip | null = null;
    private static readonly bgmVolume = 0.8;
    private static readonly sfxVolume = 2;
    private static readonly roleSkillVolume = 4;

    static init(owner: Node, assets: GameAssets): void {
        this.source = owner.getComponent(AudioSource) || owner.addComponent(AudioSource);
        this.assets = assets;
    }

    static playBgm(): void {
        void this.playBgmByKey('bgm');
    }

    static stopBgm(): void {
        const source = this.source;
        if (!source || !source.isValid) return;
        if (source.playing) source.stop();
        source.clip = null;
        this.bgmClip = null;
    }

    static playAttack(type: AttackAudioType = 'attack1'): void {
        const keys: Record<AttackAudioType, GameAudioKey> = {
            attack1: 'attack1',
            attack2: 'attack2',
            attack3: 'attack3',
        };
        void this.playSfxByKey(keys[type]);
    }

    static playMonsterAttack(useBigAttack: boolean): void {
        void this.playSfxByKey(useBigAttack ? 'bigAttack' : 'smallAttack');
    }

    /** 技能释放时先播放角色攻击声，再叠加对应技能声。 */
    static playRoleSkill(skill: SkillName, includeRoleAttack = true): void {
        const skillAudio: Record<SkillName, GameAudioKey> = {
            trop: 'skill1',
            fireDao: 'skill2',
            wheel: 'skill3',
        };
        void this.playRoleSkillSequence(skillAudio[skill], includeRoleAttack);
    }

    static async preload(keys: readonly GameAudioKey[]): Promise<void> {
        await Promise.all(keys.map(key => this.getClip(key)));
    }

    static playMonsterDie(): void {
        void this.playSfxByKey('monsterDie');
    }

    static async preloadRoleDie(): Promise<void> {
        await this.getClip('roleDie');
    }

    static playRoleDie(): void {
        void this.playSfxByKey('roleDie');
    }

    static async preloadRoleBehit(): Promise<void> {
        await this.getClip('roleBehit');
    }

    static playRoleBehit(): void {
        void this.playSfxByKey('roleBehit');
    }

    static async preloadHelpSounds(): Promise<void> {
        await Promise.all([
            this.getClip('help1'),
            this.getClip('help2'),
        ]);
    }

    static playRoar(): void {
        void this.playSfxByKey('roar');
    }

    static playHelp1(): void {
        void this.playSfxByKey('help1');
    }

    static playHelp2(): void {
        void this.playSfxByKey('help2');
    }

    static async preloadFinalBossSounds(): Promise<void> {
        await Promise.all([
            this.getClip('heHa'),
            this.getClip('bossAttack'),
            this.getClip('bossDie'),
        ]);
    }

    static playHeHa(): void {
        void this.playSfxByKey('heHa');
    }

    static playBossAttack(): void {
        void this.playSfxByKey('bossAttack');
    }

    static playBossDie(): void {
        void this.playSfxByKey('bossDie');
    }

    static playExpCollect(): void {
        void this.playSfxByKey('expCollect');
    }

    static playLevelUp(): void {
        void this.playSfxByKey('levelUp');
    }

    static playCheer(): void {
        void this.playSfxByKey('cheer');
    }

    static async preloadShout(): Promise<void> {
        await this.getClip('shout');
    }

    static playShout(): void {
        void this.playSfxByKey('shout');
    }

    static playFail(): void {
        void this.playSfxByKey('fail');
    }

    static playVictory(): void {
        void this.playSfxByKey('victory');
    }

    private static async playBgmByKey(key: GameAudioKey): Promise<void> {
        const source = this.source;
        if (!source) return;

        const clip = await this.getClip(key);
        if (!clip || !source.isValid) return;
        if (this.bgmClip === clip && source.playing) return;

        this.bgmClip = clip;
        source.clip = clip;
        source.loop = true;
        source.volume = this.bgmVolume;
        source.play();
    }

    private static async playSfxByKey(key: GameAudioKey): Promise<void> {
        const source = this.source;
        if (!source) return;

        const clip = await this.getClip(key);
        if (!clip || !source.isValid) return;
        source.playOneShot(clip, this.sfxVolume);
    }

    private static async playRoleSkillSequence(
        skillKey: GameAudioKey,
        includeRoleAttack: boolean,
    ): Promise<void> {
        const source = this.source;
        if (!source) return;
        const [roleAttack, skill] = await Promise.all([
            includeRoleAttack ? this.getClip('roleAttack') : Promise.resolve(null),
            this.getClip(skillKey),
        ]);
        if (!source.isValid) return;
        if (roleAttack) source.playOneShot(roleAttack, this.roleSkillVolume);
        if (skill) source.playOneShot(skill, this.roleSkillVolume);
    }

    private static async getClip(key: GameAudioKey): Promise<AudioClip | null> {
        const boundClip = this.assets?.getAudio(key) || null;
        if (boundClip && boundClip.isValid) return boundClip;

        try {
            return await BundleManager.loadAsset(
                ResourcePath.Bundle.Music,
                AUDIO_PATHS[key],
                AudioClip,
            );
        } catch (err) {
            warn(`[AudioManager] load audio failed: ${key}`, err);
            return null;
        }
    }
}
