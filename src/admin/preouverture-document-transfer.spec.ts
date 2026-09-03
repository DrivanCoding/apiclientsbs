import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyCoreDocumentPaths,
  deleteSourcePreouvertureDocuments,
  missingTransferredDocuments,
  sourcePreouvertureDocuments,
  transferredSourceDocuments,
} from './preouverture-document-transfer';

describe('transfert des documents de preouverture', () => {
  it('exige une copie core banking pour chaque type source', () => {
    const source = sourcePreouvertureDocuments({
      photo_profil: '/uploads/preouverture/profil.jpg',
      signature: '/uploads/preouverture/signature.png',
    });

    expect(
      missingTransferredDocuments(source, {
        photo_client: 'uploads/clients/42/photo_client/profil.jpg',
      }),
    ).toEqual(['signature']);
  });

  it('refuse un chemin core qui ne correspond pas au type de document', () => {
    const source = sourcePreouvertureDocuments({
      signature: '/uploads/preouverture/signature.png',
    });

    expect(
      missingTransferredDocuments(source, {
        signature: 'uploads/clients/42/photo_client/signature.png',
      }),
    ).toEqual(['signature']);
  });

  it('ne nettoie que les fichiers effectivement transferes', () => {
    const source = sourcePreouvertureDocuments({
      photo_profil: '/uploads/preouverture/profil.jpg',
      signature: '/uploads/preouverture/signature.png',
    });

    expect(
      transferredSourceDocuments(source, {
        photo_client: 'uploads/clients/42/photo_client/profil.jpg',
      }),
    ).toEqual({
      photo_client: ['/uploads/preouverture/profil.jpg'],
    });
  });

  it('supprime la source puis remplace les chemins par ceux du core', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sbs-preouverture-'));
    const sourceFile = join(root, 'profil.jpg');
    await writeFile(sourceFile, 'image-test');
    const demande = {
      photo_profil: '/uploads/preouverture/profil.jpg',
    };
    const source = sourcePreouvertureDocuments(demande);
    const corePaths = {
      photo_client: 'uploads/clients/42/photo_client/profil.jpg',
    };

    await deleteSourcePreouvertureDocuments(source, root);
    applyCoreDocumentPaths(demande, corePaths);

    await expect(readFile(sourceFile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(demande.photo_profil).toBe(corePaths.photo_client);
  });
});
