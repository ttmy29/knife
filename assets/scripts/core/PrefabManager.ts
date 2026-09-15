import { instantiate, Node, Prefab } from 'cc';
import type { MonsterPrefabType } from '../GameConfig';
import { GameAssets, GamePrefabKey } from '../GameAssets';
import { ResourcePath } from '../config/ResourceConfig';
import { BundleManager } from './BundleManager';

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

export type EquipmentPrefabType = 'dachui' | 'kuijia' | 'toukui' | 'mount';

const PREFAB_LOAD_CONFIG: Record<PrefabKey, { bundle: string; path: string }> = {
    role: { bundle: ResourcePath.Bundle.Roles, path: ResourcePath.Prefab.Role },
    role1: { bundle: ResourcePath.Bundle.Roles, path: ResourcePath.Prefab.Role1 },
    role2: { bundle: ResourcePath.Bundle.Roles, path: ResourcePath.Prefab.Role2 },
    role3: { bundle: ResourcePath.Bundle.Roles, path: ResourcePath.Prefab.Role3 },
    fail: { bundle: ResourcePath.Bundle.Result, path: ResourcePath.Prefab.Fail },
    victory: { bundle: ResourcePath.Bundle.Result, path: ResourcePath.Prefab.Victory },
    box: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Box },
    powerSuit: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.PowerSuit },
    dao: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Dao },
    dachui: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Dachui },
    kuijia: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Kuijia },
    toukui: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Toukui },
    mount: { bundle: ResourcePath.Bundle.Baoxiang, path: ResourcePath.Prefab.Mount },
    monster1: { bundle: ResourcePath.Bundle.Monsters, path: ResourcePath.Prefab.Monster1 },
    monster2: { bundle: ResourcePath.Bundle.Monsters, path: ResourcePath.Prefab.Monster2 },
    monster3: { bundle: ResourcePath.Bundle.Monsters, path: ResourcePath.Prefab.Monster3 },
    monster4: { bundle: ResourcePath.Bundle.Monsters, path: ResourcePath.Prefab.Monster4 },
};

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

    static loadEquipment(type: EquipmentPrefabType): Promise<Prefab> {
        return this.loadPrefab(type);
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
        if (prefab && prefab.isValid) {
            this.prefabCache.set(key, prefab);
            return prefab;
        }

        const config = PREFAB_LOAD_CONFIG[key];
        const loaded = await BundleManager.loadAsset(config.bundle, config.path, Prefab);
        this.prefabCache.set(key, loaded);
        return loaded;
    }

    private static createLoadedPrefab(key: PrefabKey): Node {
        const prefab = this.prefabCache.get(key);
        if (!prefab || !prefab.isValid) {
            throw new Error(`[PrefabManager] prefab has not been loaded: ${key}`);
        }
        return instantiate(prefab);
    }
}
