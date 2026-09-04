import { instantiate, Node, Prefab } from 'cc';
import { BundleConfig, ResourcePath } from '../config/ResourceConfig';
import type { MonsterPrefabType } from '../GameConfig';
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

const PREFAB_CONFIG: Record<PrefabKey, { bundle: string; path: string }> = {
    role: { bundle: BundleConfig.Names.Roles, path: ResourcePath.Prefab.Role },
    role1: { bundle: BundleConfig.Names.Roles, path: ResourcePath.Prefab.Role1 },
    role2: { bundle: BundleConfig.Names.Roles, path: ResourcePath.Prefab.Role2 },
    role3: { bundle: BundleConfig.Names.Roles, path: ResourcePath.Prefab.Role3 },
    fail: { bundle: BundleConfig.Names.Result, path: ResourcePath.Prefab.Fail },
    victory: { bundle: BundleConfig.Names.Result, path: ResourcePath.Prefab.Victory },
    box: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Box },
    powerSuit: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.PowerSuit },
    dao: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Dao },
    dachui: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Dachui },
    kuijia: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Kuijia },
    toukui: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Toukui },
    mount: { bundle: BundleConfig.Names.Baoxiang, path: ResourcePath.Prefab.Mount },
    monster1: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster1 },
    monster2: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster2 },
    monster3: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster3 },
    monster4: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster4 },
    monster5: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster5 },
    monster6: { bundle: BundleConfig.Names.Monsters, path: ResourcePath.Prefab.Monster6 },
};

export class PrefabManager {
    private static readonly prefabCache = new Map<PrefabKey, Prefab>();

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

        const config = PREFAB_CONFIG[key];
        const prefab = await BundleManager.loadAsset(config.bundle, config.path, Prefab);
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
