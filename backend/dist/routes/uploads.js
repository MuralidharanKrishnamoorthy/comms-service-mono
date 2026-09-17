import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const startsWith = (bytes, signature) => signature.every((byte, index) => bytes[index] === byte);
const ascii = (bytes, start, end) => bytes.subarray(start, end).toString('latin1');
const IMAGE_FORMATS = [
    {
        extension: '.png',
        label: 'PNG',
        matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    {
        extension: '.jpg',
        label: 'JPEG',
        matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
    },
    {
        extension: '.gif',
        label: 'GIF',
        matches: (bytes) => ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6)),
    },
    {
        extension: '.webp',
        label: 'WEBP',
        matches: (bytes) => ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP',
    },
];
const SUPPORTED = IMAGE_FORMATS.map((format) => format.label).join(', ');
export const uploadsRoute = new Hono();
uploadsRoute.post('/', async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!file || !(file instanceof File)) {
        return c.json({ error: 'No file provided (expected multipart field "file")' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return c.json({ error: `File too large (${Math.round(file.size / 1024)}KB) — 5MB max.` }, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = IMAGE_FORMATS.find((candidate) => candidate.matches(bytes));
    if (!format) {
        return c.json({ error: `Unsupported file contents. Allowed: ${SUPPORTED}.` }, 400);
    }
    const filename = `${randomUUID()}${format.extension}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path.join(UPLOADS_DIR, filename), bytes);
    return c.json({ url: `/uploads/${filename}` }, 201);
});
