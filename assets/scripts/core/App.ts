import { log } from 'cc';
import { BundleConfig } from '../config/ResourceConfig';
import { BundleManager } from './BundleManager';

export class App {
    private static initialized = false;
    private static loading: Promise<void> | null = null;

    static init(): Promise<void> {
        if (this.initialized) {
            return Promise.resolve();
        }
        if (this.loading) {
            return this.loading;
        }

        this.loading = Promise.all(BundleConfig.AutoLoadBundles.map((bundleName) => BundleManager.loadBundle(bundleName)))
            .then(() => {
                this.initialized = true;
                log(`[App] auto loaded bundles: ${BundleConfig.AutoLoadBundles.join(', ')}`);
            });

        return this.loading;
    }
}

