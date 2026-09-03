import { promises as fs } from 'fs';
import { basename, dirname, join, resolve } from 'path';

export type CoreDocumentType =
  | 'photo_client'
  | 'signature'
  | 'cni_recto'
  | 'cni_verso';

type PreouvertureDocuments = {
  photo_profil?: string | null;
  signature?: string | null;
  photo_cni?: string | null;
  photo_piece_recto?: string | null;
  photo_piece_verso?: string | null;
};

export function sourcePreouvertureDocuments(
  demande: PreouvertureDocuments,
): Partial<Record<CoreDocumentType, string[]>> {
  const result: Partial<Record<CoreDocumentType, string[]>> = {};
  const selected: Array<[CoreDocumentType, string | null | undefined]> = [
    ['photo_client', demande.photo_profil],
    ['signature', demande.signature],
    ['cni_recto', demande.photo_piece_recto || demande.photo_cni],
    ['cni_verso', demande.photo_piece_verso],
  ];
  for (const [type, rawValue] of selected) {
    const value = String(rawValue ?? '').trim();
    if (isSourcePreouverturePath(value)) {
      result[type] = [value];
    }
  }
  return result;
}

export function missingTransferredDocuments(
  sourceDocuments: Partial<Record<CoreDocumentType, string[]>>,
  corePaths: Partial<Record<CoreDocumentType, string>>,
): CoreDocumentType[] {
  return (Object.keys(sourceDocuments) as CoreDocumentType[]).filter(
    (type) => !isCoreDocumentPath(corePaths[type], type),
  );
}

export async function deleteSourcePreouvertureDocuments(
  sourceDocuments: Partial<Record<CoreDocumentType, string[]>>,
  uploadRoot = join(process.cwd(), 'uploads', 'preouverture'),
): Promise<void> {
  const root = resolve(uploadRoot);
  const deleted = new Set<string>();
  for (const values of Object.values(sourceDocuments)) {
    for (const value of values ?? []) {
      const pathname = new URL(value, 'http://sbsclient.local').pathname;
      const target = resolve(root, basename(decodeURIComponent(pathname)));
      if (dirname(target) !== root || deleted.has(target)) {
        continue;
      }
      try {
        await fs.unlink(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      deleted.add(target);
    }
  }
}

export function applyCoreDocumentPaths(
  demande: PreouvertureDocuments,
  corePaths: Partial<Record<CoreDocumentType, string>>,
): void {
  if (
    demande.photo_profil &&
    isCoreDocumentPath(corePaths.photo_client, 'photo_client')
  ) {
    demande.photo_profil = corePaths.photo_client;
  }
  if (
    demande.signature &&
    isCoreDocumentPath(corePaths.signature, 'signature')
  ) {
    demande.signature = corePaths.signature;
  }
  if (isCoreDocumentPath(corePaths.cni_recto, 'cni_recto')) {
    const selectedRecto = demande.photo_piece_recto || demande.photo_cni;
    if (demande.photo_piece_recto === selectedRecto) {
      demande.photo_piece_recto = corePaths.cni_recto;
    }
    if (demande.photo_cni === selectedRecto) {
      demande.photo_cni = corePaths.cni_recto;
    }
  }
  if (
    demande.photo_piece_verso &&
    isCoreDocumentPath(corePaths.cni_verso, 'cni_verso')
  ) {
    demande.photo_piece_verso = corePaths.cni_verso;
  }
}

function isCoreDocumentPath(
  value: string | null | undefined,
  type: CoreDocumentType,
): value is string {
  const path = String(value ?? '').trim().replace(/\\/g, '/');
  return new RegExp(
    `^/?uploads/clients/[1-9][0-9]*/${type}/[^/?#]+$`,
  ).test(path);
}

function isSourcePreouverturePath(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value, 'http://sbsclient.local').pathname.startsWith(
      '/uploads/preouverture/',
    );
  } catch {
    return false;
  }
}
