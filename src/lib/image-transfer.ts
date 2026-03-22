import { get, set, del } from 'idb-keyval';

const TRANSFER_KEY = 'tinyimg-transfer';

export interface TransferImage {
  blob: Blob;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  from: 'compress' | 'edit' | 'remove-bg';
}

export async function setImage(data: TransferImage): Promise<void> {
  await set(TRANSFER_KEY, data);
}

export async function getImage(): Promise<TransferImage | null> {
  const data = await get<TransferImage>(TRANSFER_KEY);
  return data ?? null;
}

export async function clearImage(): Promise<void> {
  await del(TRANSFER_KEY);
}
