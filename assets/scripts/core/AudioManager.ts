import { AudioClip, AudioSource, Node, warn } from 'cc';
import { AttackAudioType, BundleConfig, ResourcePath } from '../config/ResourceConfig';
import { BundleManager } from './BundleManager';

export class AudioManager {
    private static source: AudioSource | null = null;
    private static bgmClip: AudioClip | null = null;
    private static readonly clipCache = new Map<string, AudioClip>();
    private static readonly bgmVolume = 0.8;
    private static readonly sfxVolume = 2;

    static init(owner: Node): void {
        this.source = owner.getComponent(AudioSource) || owner.addComponent(AudioSource);
    }

    static playBgm(): void {
        void this.playBgmByPath(ResourcePath.Audio.Bgm);
    }

    static stopBgm(): void {
        const source = this.source;
        if (!source || !source.isValid) return;
        if (source.playing) source.stop();
        source.clip = null;
        this.bgmClip = null;
    }

    static playAttack(type: AttackAudioType = 'attack1'): void {
        const paths: Record<AttackAudioType, string> = {
            attack1: ResourcePath.Audio.Attack,
            attack2: ResourcePath.Audio.Attack2,
            attack3: ResourcePath.Audio.Attack3,
        };
        void this.playSfxByPath(paths[type]);
    }

    static playMonsterDie(): void {
        void this.playSfxByPath(ResourcePath.Audio.MonsterDie);
    }

    static async preloadRoleDie(): Promise<void> {
        await this.loadMusicClip(ResourcePath.Audio.RoleDie);
    }

    static playRoleDie(): void {
        void this.playSfxByPath(ResourcePath.Audio.RoleDie);
    }

    static async preloadFinalBossSounds(): Promise<void> {
        await Promise.all([
            this.loadMusicClip(ResourcePath.Audio.HeHa),
            this.loadMusicClip(ResourcePath.Audio.bossAttack),
            this.loadMusicClip(ResourcePath.Audio.bossDie),
        ]);
    }

    static playHeHa(): void {
        void this.playSfxByPath(ResourcePath.Audio.HeHa);
    }

    static playBossAttack(): void {
        void this.playSfxByPath(ResourcePath.Audio.bossAttack);
    }

    static playBossDie(): void {
        void this.playSfxByPath(ResourcePath.Audio.bossDie);
    }

    static playExpCollect(): void {
        void this.playSfxByPath(ResourcePath.Audio.ExpCollect);
    }

    static playLevelUp(): void {
        void this.playSfxByPath(ResourcePath.Audio.LevelUp);
    }

    static playCheer(): void {
        void this.playSfxByPath(ResourcePath.Audio.Cheer);
    }

    static async preloadShout(): Promise<void> {
        await this.loadMusicClip(ResourcePath.Audio.Shout);
    }

    static playShout(): void {
        void this.playSfxByPath(ResourcePath.Audio.Shout);
    }

    static playFail(): void {
        void this.playSfxByPath(ResourcePath.Audio.Fail);
    }

    static playVictory(): void {
        void this.playSfxByPath(ResourcePath.Audio.Victory);
    }

    private static async playBgmByPath(path: string): Promise<void> {
        const source = this.source;
        if (!source) return;

        const clip = await this.loadMusicClip(path);
        if (!clip || !source.isValid) return;
        if (this.bgmClip === clip && source.playing) return;

        this.bgmClip = clip;
        source.clip = clip;
        source.loop = true;
        source.volume = this.bgmVolume;
        source.play();
    }

    private static async playSfxByPath(path: string): Promise<void> {
        const source = this.source;
        if (!source) return;

        const clip = await this.loadMusicClip(path);
        if (!clip || !source.isValid) return;
        source.playOneShot(clip, this.sfxVolume);
    }

    private static async loadMusicClip(path: string): Promise<AudioClip | null> {
        const bundleName = BundleConfig.Names.Music;
        const assetPath = this.toBundleAssetPath(bundleName, path);
        const cacheKey = `${bundleName}:${assetPath}`;
        const cached = this.clipCache.get(cacheKey);
        if (cached && cached.isValid) return cached;

        try {
            const clip = await BundleManager.loadAsset(bundleName, assetPath, AudioClip);
            this.clipCache.set(cacheKey, clip);
            return clip;
        } catch (err) {
            warn(`[AudioManager] load audio failed: ${path}`, err);
            return null;
        }
    }

    private static toBundleAssetPath(bundleName: string, path: string): string {
        const prefix = `${bundleName}/`;
        return path.startsWith(prefix) ? path.slice(prefix.length) : path;
    }
}
