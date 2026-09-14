import { Asset, assetManager, error } from 'cc';

export class BundleManager {
    private static readonly bundles = new Map<string, any>();
    private static readonly bundleLoadTasks = new Map<string, Promise<any>>();
    private static readonly assetCache = new Map<string, Asset>();

    static loadBundle(bundleName: string): Promise<any> {
        const cached = this.bundles.get(bundleName) || assetManager.getBundle(bundleName);
        if (cached) {
            this.bundles.set(bundleName, cached);
            return Promise.resolve(cached);
        }

        const pending = this.bundleLoadTasks.get(bundleName);
        if (pending) return pending;

        const task = new Promise<any>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                this.bundleLoadTasks.delete(bundleName);
                if (err || !bundle) {
                    error(`[BundleManager] load bundle failed: ${bundleName}`, err);
                    reject(err);
                    return;
                }

                this.bundles.set(bundleName, bundle);
                resolve(bundle);
            });
        });
        this.bundleLoadTasks.set(bundleName, task);
        return task;
    }

    static getBundle(bundleName: string): any | null {
        return this.bundles.get(bundleName) || assetManager.getBundle(bundleName) || null;
    }

    static async loadAsset<T extends Asset>(
        bundleName: string,
        path: string,
        type: new (...args: any[]) => T,
    ): Promise<T> {
        const assetPath = this.toBundleAssetPath(bundleName, path);
        const cacheKey = `${bundleName}:${assetPath}`;
        const cached = this.assetCache.get(cacheKey) as T | undefined;
        if (cached && cached.isValid) {
            return cached;
        }

        const bundle = await this.loadBundle(bundleName);
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, type, (err: Error | null, asset: T) => {
                if (err || !asset) {
                    error(`[BundleManager] load asset failed: ${cacheKey}`, err);
                    reject(err);
                    return;
                }

                this.assetCache.set(cacheKey, asset);
                resolve(asset);
            });
        });
    }

    static clearCache(): void {
        this.assetCache.clear();
    }

    private static toBundleAssetPath(bundleName: string, path: string): string {
        const prefix = `${bundleName}/`;
        return path.startsWith(prefix) ? path.slice(prefix.length) : path;
    }
}
