export function hashAssetIds(assetIds: string[]): string {
  return [...assetIds].sort().join(",");
}
