import { isPrimaryAdmin } from '@/lib/security/identity';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';
import { validatedImageExtension } from '@/lib/security/imageUpload';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export const runtime = 'nodejs';


function getServerConfig() {
  const url = assertExpectedSupabaseProject(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );
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

  if (!isPrimaryAdmin(user)) {
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
    const folder = formData.get('folder')?.toString().trim() || 'products';
    if (!['products', 'collections'].includes(folder)) {
      return NextResponse.json({ message: '허용되지 않은 업로드 폴더입니다.' }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ message: '업로드할 파일이 없습니다.' }, { status: 400 });
    }
    if (files.length > 10 || files.some(file => file.size <= 0 || file.size > 20 * 1024 * 1024) || files.reduce((size, file) => size + file.size, 0) > 60 * 1024 * 1024) {
      return NextResponse.json({ message: '이미지는 최대 10개, 파일당 20MB, 합계 60MB까지 업로드할 수 있습니다.' }, { status: 413 });
    }

    // Validate every file before writing any object.
    const validated = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = validatedImageExtension(bytes, file.type.toLowerCase());
      if (!ext) return NextResponse.json({ message: '지원하는 이미지 형식과 파일 내용이 일치해야 합니다.' }, { status: 400 });
      validated.push({ file, bytes, ext });
    }

    const userId = authResult.id;
    const urls: string[] = [];

    for (const { file, bytes, ext } of validated) {
      const safeBase = sanitizeFileName(file.name) || 'image';
      const objectKey = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID()}-${safeBase}.${ext}`;

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
