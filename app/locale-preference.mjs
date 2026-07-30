export function resolveInitialLocale(storedLocale, defaultLocale) {
  if (storedLocale === "zh-CN" || storedLocale === "en") {
    return storedLocale;
  }
  return defaultLocale === "zh-CN" ? "zh-CN" : "en";
}
