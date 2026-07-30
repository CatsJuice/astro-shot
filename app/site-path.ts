const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const isXhsBuild =
  process.env.NEXT_PUBLIC_XHS_BUILD === "true";

export const defaultLocale =
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "zh-CN" ? "zh-CN" : "en";

type XhsRuntimeAssets = {
  paths: Record<string, string>;
  data: Record<string, unknown>;
};

declare global {
  var __ASTROSHOT_XHS_ASSETS__: XhsRuntimeAssets | undefined;
}

export function installXhsRuntimeAssets(assets: XhsRuntimeAssets) {
  globalThis.__ASTROSHOT_XHS_ASSETS__ = assets;
}

export function getBundledXhsData<T>(key: string): T | null {
  return (globalThis.__ASTROSHOT_XHS_ASSETS__?.data[key] as T | undefined) ?? null;
}

export function withBasePath(path: `/${string}`): string {
  const bundledPath = globalThis.__ASTROSHOT_XHS_ASSETS__?.paths[path];
  if (bundledPath) return bundledPath;
  return `${basePath}${path}`;
}
