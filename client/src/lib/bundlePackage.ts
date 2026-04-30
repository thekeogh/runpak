import { postJson } from './api';

export type BundleResponse = {
  code: string;
  resolved: {
    entryPath: string;
    packageName: string;
  };
};

export function bundlePackage(packagePath: string, code: string): Promise<BundleResponse> {
  return postJson<BundleResponse>('/api/bundle', { packagePath, code });
}
