import { instantiate, Node, Prefab } from 'cc';
import type { MonsterPrefabType } from '../GameConfig';
import { GameAssets, GamePrefabKey } from '../GameAssets';

type PrefabKey =
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

export class PrefabManager {
    private static assets: GameAssets | null = null;
    private static readonly prefabCache = new Map<PrefabKey, Prefab>();

    static init(assets: GameAssets): void {
        this.assets = assets;
        this.prefabCache.clear();
    }

    static loadRole(): Promise<Prefab> {
        return this.loadPrefab('role');
    }

    static loadRole1(): Promise<Prefab> {
        return this.loadPrefab('role1');
    }

    static loadRole2(): Promise<Prefab> {
        return this.loadPrefab('role2');
    }

    static loadRole3(): Promise<Prefab> {
        return this.loadPrefab('role3');
    }

    static loadFail(): Promise<Prefab> {
        return this.loadPrefab('fail');
    }

    static loadVictory(): Promise<Prefab> {
        return this.loadPrefab('victory');
    }

    static loadBox(): Promise<Prefab> {
        return this.loadPrefab('box');
    }

    static loadPowerSuit(): Promise<Prefab> {
        return this.loadPrefab('powerSuit');
    }

    static loadEquipmentPrefabs(): Promise<Prefab[]> {
        return Promise.all([
            this.loadPrefab('dao'),
            this.loadPrefab('dachui'),
            this.loadPrefab('kuijia'),
            this.loadPrefab('toukui'),
            this.loadPrefab('mount'),
        ]);
    }

    static loadMonster(type: MonsterPrefabType): Promise<Prefab> {
        return this.loadPrefab(type);
    }

    static createRole(): Node {
        return this.createLoadedPrefab('role');
    }

    static createRole1(): Node {
        return this.createLoadedPrefab('role1');
    }

    static createRole2(): Node {
        return this.createLoadedPrefab('role2');
    }

    static createRole3(): Node {
        return this.createLoadedPrefab('role3');
    }

    static createFail(): Node {
        return this.createLoadedPrefab('fail');
    }

    static createVictory(): Node {
        return this.createLoadedPrefab('victory');
    }

    static async createBox(): Promise<Node> {
        return instantiate(await this.loadBox());
    }

    static async createPowerSuit(): Promise<Node> {
        return instantiate(await this.loadPowerSuit());
    }

    static async createDao(): Promise<Node> {
        return instantiate(await this.loadPrefab('dao'));
    }

    static async createDachui(): Promise<Node> {
        return instantiate(await this.loadPrefab('dachui'));
    }

    static async createKuijia(): Promise<Node> {
        return instantiate(await this.loadPrefab('kuijia'));
    }

    static async createToukui(): Promise<Node> {
        return instantiate(await this.loadPrefab('toukui'));
    }

    static async createMount(): Promise<Node> {
        return instantiate(await this.loadPrefab('mount'));
    }

    static async createMonster(type: MonsterPrefabType): Promise<Node> {
        return instantiate(await this.loadMonster(type));
    }

    private static async loadPrefab(key: PrefabKey): Promise<Prefab> {
        const cached = this.prefabCache.get(key);
        if (cached && cached.isValid) return cached;

        const prefab = this.assets?.getPrefab(key as GamePrefabKey);
        if (!prefab || !prefab.isValid) {
            throw new Error(`[PrefabManager] prefab is not bound in GameAssets: ${key}`);
        }
        this.prefabCache.set(key, prefab);
        return prefab;
    }

    private static createLoadedPrefab(key: PrefabKey): Node {
        const prefab = this.prefabCache.get(key);
        if (!prefab || !prefab.isValid) {
            throw new Error(`[PrefabManager] prefab has not been loaded: ${key}`);
        }
        return instantiate(prefab);
    }
}
