import { adminStorage } from "../config/firebase.js";

function bucket() {
  return adminStorage.bucket();
}

export async function uploadAssetBuffer(
  storagePath: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const file = bucket().file(storagePath);
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      contentType: mimeType,
      cacheControl: "no-store",
    },
  });
}

export async function downloadAssetBuffer(storagePath: string): Promise<Buffer> {
  const file = bucket().file(storagePath);
  const [contents] = await file.download();
  return contents;
}

export async function deleteAssetFile(storagePath: string): Promise<void> {
  const file = bucket().file(storagePath);
  await file.delete({ ignoreNotFound: true });
}
