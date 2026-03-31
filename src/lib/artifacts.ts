export type ArtifactDescriptor = {
  key: string;
  name: string;
  type: string;
  size?: number;
  createdAt?: string;
};

type ArtifactManifestReference = {
  storageKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArtifactDescriptor(value: unknown): value is ArtifactDescriptor {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    (value.size === undefined || typeof value.size === "number") &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

export function normalizeArtifactList(payload: unknown): ArtifactDescriptor[] {
  if (Array.isArray(payload)) {
    return payload.filter(isArtifactDescriptor);
  }

  if (isArtifactDescriptor(payload)) {
    return [payload];
  }

  if (isRecord(payload) && Array.isArray(payload.items)) {
    return payload.items.filter(isArtifactDescriptor);
  }

  return [];
}

export function getArtifactStorageKey(manifest: unknown) {
  if (!isRecord(manifest)) {
    return null;
  }

  return typeof manifest.storageKey === "string" ? manifest.storageKey : null;
}

export function isArtifactManifestReference(manifest: unknown): manifest is ArtifactManifestReference {
  return getArtifactStorageKey(manifest) !== null;
}
