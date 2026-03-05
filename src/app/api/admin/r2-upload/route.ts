import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';

export const runtime = 'nodejs';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

async function authenticateAdmin(request: Request) {
  const config = getServerConfig();
  if (!config) {
    return NextResponse.json({ message: 'Supabase server config is missing.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  if ((user.email || '').trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 });
  }

  return user;
}

function sanitizeFileName(name: string) {
  return name
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    const folder = (formData.get('folder')?.toString().trim() || 'products').replace(/[^a-z0-9/_-]/gi, '');

    if (files.length === 0) {
      return NextResponse.json({ message: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const userId = authResult.id;
    const urls: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeBase = sanitizeFileName(file.name) || 'image';
      const objectKey = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID()}-${safeBase}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());

      const url = await uploadToR2({
        objectKey,
        body: bytes,
        contentType: file.type || 'application/octet-stream',
      });
      urls.push(url);
    }

    return NextResponse.json({ ok: true, urls });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'R2 업로드 실패',
      },
      { status: 500 },
    );
  }
}
