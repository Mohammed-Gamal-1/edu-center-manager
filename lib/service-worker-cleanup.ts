export const LEGACY_OFFLINE_CACHE = "eltafawoq-local-shell-v1";

type RegistrationLike = {
  unregister(): Promise<boolean>;
};

type CacheStorageLike = {
  delete(name: string): Promise<boolean>;
};

export async function removeLegacyOfflineShell(
  registrations: readonly RegistrationLike[],
  cacheStorage: CacheStorageLike,
) {
  for (const registration of registrations) {
    await registration.unregister();
  }

  await cacheStorage.delete(LEGACY_OFFLINE_CACHE);
}
