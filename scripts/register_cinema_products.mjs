import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const dotenv = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
dotenv.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const R2_BASE = 'https://pub-11768089b4c8464da58cf12287bef2fa.r2.dev/%EC%94%A8%EB%84%A4%EB%A7%88%EC%BB%AC%EB%A0%89%EC%85%98';

export const CINEMA_PRODUCTS = [
  {
    title: 'Blueprint Jacket',
    price: 240000,
    currency: 'KRW',
    description: '最高のシネマコレクション',
    is_published: true,
    specs: `${R2_BASE}/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80/detail_blueprint_jacket.jpg`,
    images: [
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_01.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_02.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_03.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_04.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_05.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_jacket_06.jpg`,
    ],
  },
  {
    title: 'Blueprint Pants',
    price: 170000,
    currency: 'KRW',
    description: '最高のシネマコレクション',
    is_published: true,
    specs: `${R2_BASE}/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80/detail_blueprint_pants.jpg`,
    images: [
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_01.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_02.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_03.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_04.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_05.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/blueprint_pants_06.jpg`,
    ],
  },
  {
    title: 'Camera Shirt',
    price: 170000,
    currency: 'KRW',
    description: '最高のシネマコレクション',
    is_published: true,
    specs: `${R2_BASE}/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80/detail_camera_shirt.jpg`,
    images: [
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_01.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_02.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_03.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_04.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_05.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/camera_shirt_06.jpg`,
    ],
  },
  {
    title: 'Film Pants',
    price: 150000,
    currency: 'KRW',
    description: '最高のシネマコレクション',
    is_published: true,
    specs: `${R2_BASE}/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80/detail_film_pants.jpg`,
    images: [
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_01.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_02.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_03.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_04.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_05.jpg`,
      `${R2_BASE}/%EC%8D%B8%EB%84%A4%EC%9D%BC/film_pants_06.jpg`,
    ],
  },
];

async function publishAll() {
  console.log('=== 씨네마 컬렉션 4종 상품 Supabase 등록/업데이트 시작 ===');
  for (const item of CINEMA_PRODUCTS) {
    const { data: existing } = await supabase
      .from('products')
      .select('id, title')
      .eq('title', item.title)
      .maybeSingle();

    const now = new Date().toISOString();
    const payload = {
      title: item.title,
      price: item.price,
      currency: item.currency,
      description: item.description,
      specs: item.specs,
      images: item.images,
      is_published: item.is_published,
      updated_at: now,
    };

    if (existing) {
      console.log(`[업데이트] 기존 상품 (${existing.id}): ${item.title}`);
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existing.id)
        .select('id, title, specs, images')
        .single();
      if (error) {
        console.error(`  -> 실패:`, error);
      } else {
        console.log(`  -> 성공! (images: ${data.images.length}장, specs: ${data.specs})`);
      }
    } else {
      console.log(`[신규 등록] ${item.title}`);
      payload.created_at = now;
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id, title, specs, images')
        .single();
      if (error) {
        console.error(`  -> 실패:`, error);
      } else {
        console.log(`  -> 성공! (ID: ${data.id})`);
      }
    }
  }
  console.log('=== 등록/업데이트 작업 완료 ===');
}

if (process.argv[1] && process.argv[1].endsWith('register_cinema_products.mjs')) {
  publishAll().catch(console.error);
}
