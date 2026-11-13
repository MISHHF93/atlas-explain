export const ALLOWED_PERMISSIONS: Record<string, string | null>;
export const ALLOWED_OPTIONAL_PERMISSIONS: Record<string, string>;
export const ALLOWED_HOSTS: string[];
export function checkManifest(manifest: Record<string, unknown>, source: string): string[];
export function extensionSource(root: string): string;
