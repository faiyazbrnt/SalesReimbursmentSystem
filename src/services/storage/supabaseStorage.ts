import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UserRole } from '../../lib/db/serverTypes';
import { state } from '../../server/state';
import { hydrateServerlessState, hydrateUsersForRequest } from '../../server/stateLoader';
import { findUploadAccessCheck } from '../../server/services/authorization';
import { serverEnv } from '../../config/env';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function getLocalStorageDir(): string {
  const uploadDir = serverEnv.uploadDir || path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(/*turbopackIgnore: true*/ uploadDir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
  }
  return uploadDir;
}

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function storageConfig(): { baseUrl: string; serviceKey: string; bucket: string } | null {
  const baseUrl = serverEnv.supabaseUrl;
  const serviceKey = serverEnv.supabaseServiceRoleKey;
  if (!baseUrl || !serviceKey) return null;
  return {
    baseUrl,
    serviceKey,
    bucket: serverEnv.supabaseStorageBucket,
  };
}

function storageHeaders(serviceKey: string, contentType?: string): HeadersInit {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

function objectUrl(config: NonNullable<ReturnType<typeof storageConfig>>, filename: string): string {
  return `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(filename)}`;
}

function authenticatedObjectUrl(
  config: NonNullable<ReturnType<typeof storageConfig>>,
  filename: string,
): string {
  return `${config.baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeURIComponent(filename)}`;
}

function extension(filename: string): string {
  const match = /(?:\.[A-Za-z0-9]{1,10})$/.exec(filename);
  return match?.[0].toLowerCase() || '';
}

async function authorizedUploader(request: Request): Promise<Response | null> {
  await hydrateUsersForRequest();
  const userId = request.headers.get('x-user-id');
  const user = state.users.find((candidate) =>
    candidate.id === userId
    || candidate.entra_object_id === userId
    || candidate.user_principal_name === userId);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  return null;
}

function validateUploadMetadata(metadata: {
  name?: unknown;
  size?: unknown;
  type?: unknown;
}): Response | null {
  if (typeof metadata.name !== 'string' || !metadata.name) {
    return json({ error: 'A file name is required.' }, 400);
  }
  if (typeof metadata.size !== 'number' || metadata.size < 0) {
    return json({ error: 'A valid file size is required.' }, 400);
  }
  if (metadata.size > MAX_UPLOAD_SIZE_BYTES) {
    return json({ error: 'File is too large. Maximum size is 10MB.' }, 400);
  }
  if (typeof metadata.type !== 'string' || !ALLOWED_UPLOAD_MIME_TYPES.has(metadata.type)) {
    return json({
      error: 'Unsupported file type. Please upload an image (JPG, PNG, GIF, WEBP), a PDF, or a Word document (DOC, DOCX).',
    }, 400);
  }
  return null;
}

export async function createSupabaseSignedUpload(request: Request): Promise<Response> {
  try {
    const denied = await authorizedUploader(request);
    if (denied) return denied;

    const metadata = await request.json() as { name?: unknown; size?: unknown; type?: unknown };
    const validationError = validateUploadMetadata(metadata);
    if (validationError) return validationError;

    const config = storageConfig();
    if (!config) return json({ error: 'Upload storage is not configured.' }, 503);
    const filename = `${randomUUID()}${extension(metadata.name as string)}`;
    const signingUrl = `${config.baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeURIComponent(filename)}`;
    const result = await fetch(signingUrl, {
      method: 'POST',
      headers: storageHeaders(config.serviceKey, 'application/json'),
      body: '{}',
      cache: 'no-store',
    });
    if (!result.ok) {
      console.error(`[storage] Could not sign upload with status ${result.status}`);
      return json({ error: 'Upload could not be authorized.' }, 502);
    }

    const payload = await result.json() as { url?: string };
    if (!payload.url) return json({ error: 'Upload could not be authorized.' }, 502);
    const uploadUrl = /^https?:\/\//.test(payload.url)
      ? payload.url
      : `${config.baseUrl}/storage/v1${payload.url.startsWith('/') ? '' : '/'}${payload.url}`;
    return json({
      url: `/uploads/${filename}`,
      filename,
      uploadUrl,
    });
  } catch (error) {
    console.error('[storage] Could not create signed upload:', error);
    return json({ error: 'Upload could not be authorized.' }, 500);
  }
}

export async function uploadToSupabase(request: Request): Promise<Response> {
  try {
    const denied = await authorizedUploader(request);
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return json({ error: 'No file uploaded' }, 400);
    const validationError = validateUploadMetadata({ name: file.name, size: file.size, type: file.type });
    if (validationError) return validationError;

    const filename = `${randomUUID()}${extension(file.name)}`;

    const saveLocally = async (): Promise<Response> => {
      const uploadDir = getLocalStorageDir();
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ uploadDir, filename), buffer);
      return json({ url: `/uploads/${filename}` });
    };

    const config = storageConfig();
    if (!config) {
      if (!serverEnv.isProduction || serverEnv.demoMode) {
        return saveLocally();
      }
      return json({ error: 'Upload storage is not configured.' }, 503);
    }

    try {
      const result = await fetch(objectUrl(config, filename), {
        method: 'POST',
        headers: {
          ...storageHeaders(config.serviceKey, file.type),
          'x-upsert': 'false',
        },
        body: file,
        cache: 'no-store',
      });
      if (!result.ok) {
        const errBody = await result.text().catch(() => '(unreadable)');
        console.error(`[storage] Supabase upload failed — status ${result.status}, body: ${errBody}`);
        if (!serverEnv.isProduction || serverEnv.demoMode) {
          console.warn('[storage] Supabase upload failed, falling back to local storage');
          return saveLocally();
        }
        return json({ error: 'Upload failed.' }, 502);
      }

      return json({ url: `/uploads/${filename}` });
    } catch (networkError) {
      if (!serverEnv.isProduction || serverEnv.demoMode) {
        console.warn('[storage] Supabase unreachable, falling back to local storage:', networkError);
        return saveLocally();
      }
      throw networkError;
    }
  } catch (error) {
    console.error('[storage] Upload failed:', error);
    return json({ error: 'Upload failed.' }, 500);
  }
}

export async function downloadFromSupabase(request: Request, filename: string): Promise<Response> {
  try {
    await hydrateServerlessState();
    if (!filename || filename === '.' || filename === '..' || /[\\/]/.test(filename)) {
      return json({ error: 'File not found' }, 404);
    }

    const url = new URL(request.url);
    const userId = request.headers.get('x-user-id') || url.searchParams.get('uid');
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const authorized = findUploadAccessCheck(`/uploads/${filename}`);
    if (!authorized) return json({ error: 'File not found' }, 404);
    if (!authorized(user)) return json({ error: 'Forbidden' }, 403);

    // First, check if the file exists on local disk (used in Docker, dev, or local storage fallback)
    const uploadDir = getLocalStorageDir();
    const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, filename);
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);
      const ext = extension(filename);
      const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileBuffer.length),
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `inline; filename="${filename.replace(/["\r\n]/g, '')}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const config = storageConfig();
    if (!config) {
      return json({ error: 'File not found' }, 404);
    }
    const result = await fetch(authenticatedObjectUrl(config, filename), {
      headers: storageHeaders(config.serviceKey),
      cache: 'no-store',
    });
    if (result.status === 404) return json({ error: 'File not found' }, 404);
    if (!result.ok || !result.body) {
      console.error(`[storage] Download failed with status ${result.status}`);
      return json({ error: 'File download failed.' }, 502);
    }

    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${filename.replace(/["\r\n]/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    const contentType = result.headers.get('content-type');
    const contentLength = result.headers.get('content-length');
    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    return new Response(result.body, { status: 200, headers });
  } catch (error) {
    console.error('[storage] Download failed:', error);
    return json({ error: 'File download failed.' }, 500);
  }
}
