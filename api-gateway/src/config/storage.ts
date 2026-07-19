import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
export const STORAGE_BUCKET = process.env.S3_BUCKET_NAME || 'docmind-uploads';

let supabaseAdmin: SupabaseClient;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseAdmin;
};

export const initializeBucket = async () => {
  try {
    logger.info(`Checking Supabase Storage bucket "${STORAGE_BUCKET}"...`);
    const client = getSupabaseAdmin();
    const { data: buckets } = await client.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
    if (!exists) {
      const { error } = await client.storage.createBucket(STORAGE_BUCKET, { public: true });
      if (error) throw error;
      logger.info(`Supabase Storage bucket "${STORAGE_BUCKET}" created.`);
    } else {
      logger.info(`Supabase Storage bucket "${STORAGE_BUCKET}" already exists.`);
    }
  } catch (error: any) {
    logger.error(`Error initializing Supabase Storage: ${error.message}`);
    // Don't throw — allow app to start even if storage init fails
  }
};

/** Upload a file buffer to Supabase Storage */
export async function uploadToStorage(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(key, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return key;
}

/** Download a file from Supabase Storage as a Buffer */
export async function downloadFromStorage(key: string): Promise<Buffer> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage.from(STORAGE_BUCKET).download(key);
  if (error) throw new Error(`Supabase download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Get a public URL for a file */
export function getPublicUrl(key: string): string {
  const client = getSupabaseAdmin();
  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

/** Delete a file from Supabase Storage */
export async function deleteFromStorage(key: string): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(STORAGE_BUCKET).remove([key]);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}
