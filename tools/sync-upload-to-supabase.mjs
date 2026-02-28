import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';
const ROOT_DIR = path.resolve(process.cwd(), 'upload');
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY env가 필요합니다.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);
const SKIP_EXTS = new Set(['.heic', '.heif']);

const CATEGORY_FOLDERS = [
  { folder: '자켓', code: 'outer' },
  { folder: '아우터', code: 'outer' },
  { folder: '셔츠', code: 'shirts' },
  { folder: '팬츠', code: 'pants' },
  { folder: '가방', code: 'bags' },
  { folder: '악세사리', code: 'accessories' },
  { folder: '인형', code: 'dolls' },
  { folder: '드레스', code: 'dresses' },
];

const PRODUCT_FOLDER_ALIAS = new Map([
  ['enicoangryshark', 'Desert Angry Shark'],
]);

const COLLECTION_DIR = '컬렉션';

function normalizeKey(value) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`"“”]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '');
}

function stripNumberPrefix(value) {
  return (value || '').replace(/^\s*\d+\s*[.)-]?\s*/, '').trim();
}

function toSlug(value) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`"“”]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function toAsciiSlug(value) {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`\"“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function scoreImageName(filePath) {
  const name = path.basename(filePath).toLowerCase();
  let score = 0;
  if (name.includes('썸네일') || name.includes('thumbnail') || name.includes('thumb')) score += 40;
  if (name.includes('main') || name.includes('메인')) score += 20;
  if (name.includes('cover')) score += 15;
  if (name.includes('size') || name.includes('chart') || name.includes('사이즈')) score -= 30;
  return score;
}

function mimeTypeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function sanitizeFileStem(value) {
  const slug = toAsciiSlug(path.basename(value, path.extname(value)));
  return slug || 'image';
}

function toStoragePath(...parts) {
  return parts.join('/').replace(/\\/g, '/');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listImmediateDirs(targetPath) {
  if (!(await pathExists(targetPath))) return [];
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name);
}

async function listImmediateFiles(targetPath) {
  if (!(await pathExists(targetPath))) return [];
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => path.join(targetPath, entry.name));
}

async function walkImageFiles(targetPath, skippedCollector) {
  if (!(await pathExists(targetPath))) return [];
  const out = [];

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTS.has(ext)) {
        skippedCollector.push(fullPath);
        continue;
      }
      if (!IMAGE_EXTS.has(ext)) continue;
      out.push(fullPath);
    }
  }

  await walk(targetPath);
  out.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' }));
  return out;
}

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const item of paths) {
    const key = item.replace(/\\/g, '/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function pickThumbnail(files) {
  if (files.length === 0) return null;
  const sorted = [...files].sort((a, b) => {
    const scoreDiff = scoreImageName(b) - scoreImageName(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
  });
  return sorted[0] ?? null;
}

async function collectProductFolders(skippedHeic) {
  const rows = [];

  for (const category of CATEGORY_FOLDERS) {
    const categoryPath = path.join(ROOT_DIR, category.folder);
    const productDirs = await listImmediateDirs(categoryPath);
    for (const dirName of productDirs) {
      const dirKey = normalizeKey(dirName);
      if (!dirKey) continue;
      if (dirKey.includes('상세보기용') || dirKey.includes('상세페이지') || dirKey.includes('썸네일용')) {
        continue;
      }

      const productPath = path.join(categoryPath, dirName);
      const childDirs = await listImmediateDirs(productPath);
      const thumbDirs = childDirs.filter((name) => {
        const key = normalizeKey(name);
        return key.includes('썸네일') || key.includes('thumbnail') || key.includes('thumb');
      });
      const detailDirs = childDirs.filter((name) => {
        const key = normalizeKey(name);
        return key.includes('상세') || key.includes('detail');
      });

      const thumbFiles = uniquePaths(
        (await Promise.all(thumbDirs.map((name) => walkImageFiles(path.join(productPath, name), skippedHeic)))).flat(),
      );
      const detailFiles = uniquePaths(
        (await Promise.all(detailDirs.map((name) => walkImageFiles(path.join(productPath, name), skippedHeic)))).flat(),
      );

      const directFiles = (await listImmediateFiles(productPath)).filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (SKIP_EXTS.has(ext)) {
          skippedHeic.push(filePath);
          return false;
        }
        return IMAGE_EXTS.has(ext);
      });

      let allFiles = uniquePaths([...thumbFiles, ...detailFiles, ...directFiles]);
      if (allFiles.length === 0) {
        allFiles = await walkImageFiles(productPath, skippedHeic);
      }

      if (allFiles.length === 0) {
        continue;
      }

      let thumbnail = pickThumbnail(uniquePaths([...thumbFiles, ...directFiles, ...detailFiles])) || allFiles[0] || null;
      if (!thumbnail) continue;

      const detailList = uniquePaths([
        ...detailFiles,
        ...directFiles.filter((item) => item !== thumbnail),
        ...allFiles.filter((item) => item !== thumbnail),
      ]);

      rows.push({
        folderName: dirName,
        folderKey: normalizeKey(stripNumberPrefix(dirName)),
        categoryFolder: category.folder,
        categoryCode: category.code,
        thumbnail,
        detailList,
      });
    }
  }

  return rows;
}

async function collectCollectionFolders(skippedHeic) {
  const root = path.join(ROOT_DIR, COLLECTION_DIR);
  const dirs = await listImmediateDirs(root);
  const collectionDirs = dirs.filter((name) => {
    const key = normalizeKey(name);
    return !key.includes('상세보기용') && !key.includes('상세페이지') && !key.includes('썸네일용');
  });

  const out = [];
  for (const dirName of collectionDirs) {
    const folderPath = path.join(root, dirName);
    const files = await walkImageFiles(folderPath, skippedHeic);
    if (files.length === 0) continue;

    const thumbnail = pickThumbnail(files) || files[0] || null;
    if (!thumbnail) continue;
    const ordered = uniquePaths([thumbnail, ...files.filter((filePath) => filePath !== thumbnail)]);

    out.push({
      folderName: dirName,
      folderKey: normalizeKey(stripNumberPrefix(dirName)),
      thumbnail,
      imageList: ordered,
    });
  }
  return out;
}

function matchByFolderKey(folderKey, rowsByNorm, usedIds, fallbackRows) {
  const aliasTitle = PRODUCT_FOLDER_ALIAS.get(folderKey);
  if (aliasTitle) {
    const aliasNorm = normalizeKey(aliasTitle);
    const row = rowsByNorm.get(aliasNorm);
    if (row && !usedIds.has(row.id)) return row;
  }

  const direct = rowsByNorm.get(folderKey);
  if (direct && !usedIds.has(direct.id)) return direct;

  let best = null;
  let bestScore = -Infinity;
  for (const row of fallbackRows) {
    if (usedIds.has(row.id)) continue;
    const titleKey = normalizeKey(row.title || '');
    if (!titleKey) continue;

    const contains = folderKey.includes(titleKey) || titleKey.includes(folderKey);
    if (!contains) continue;

    let score = 0;
    if (folderKey === titleKey) score += 200;
    score += Math.min(folderKey.length, titleKey.length);
    score -= Math.abs(folderKey.length - titleKey.length);

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best;
}

async function uploadOne(localFilePath, storagePath) {
  if (DRY_RUN) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  }

  const body = await fs.readFile(localFilePath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
    upsert: true,
    contentType: mimeTypeFromExt(localFilePath),
    cacheControl: '3600',
  });
  if (error) {
    throw new Error(`upload 실패: ${storagePath} (${error.message})`);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function updateProducts(productFolders) {
  const { data: productRows, error } = await supabase.from('products').select('id,title,images').order('updated_at', { ascending: false });
  if (error) throw new Error(`products 조회 실패: ${error.message}`);

  const rowsByNorm = new Map();
  for (const row of productRows) {
    rowsByNorm.set(normalizeKey(row.title || ''), row);
  }

  const usedIds = new Set();
  const unmatchedFolders = [];
  const updated = [];

  for (const folder of productFolders) {
    const row = matchByFolderKey(folder.folderKey, rowsByNorm, usedIds, productRows);
    if (!row) {
      unmatchedFolders.push(folder.folderName);
      continue;
    }

    usedIds.add(row.id);
    const title = row.title || folder.folderName;
    const productSlug =
      toAsciiSlug(stripNumberPrefix(title)) ||
      toAsciiSlug(stripNumberPrefix(folder.folderName)) ||
      row.id;
    const base = toStoragePath('manual-upload', folder.categoryCode, productSlug);

    const thumbExt = path.extname(folder.thumbnail).toLowerCase() || '.png';
    const thumbFileName = `01-${sanitizeFileStem(folder.thumbnail)}${thumbExt}`;
    const thumbPath = toStoragePath(base, 'thumb', thumbFileName);
    const thumbUrl = await uploadOne(folder.thumbnail, thumbPath);

    const detailUrls = [];
    let detailIndex = 2;
    for (const detailPath of folder.detailList) {
      const ext = path.extname(detailPath).toLowerCase() || '.png';
      const fileName = `${String(detailIndex).padStart(2, '0')}-${sanitizeFileStem(detailPath)}${ext}`;
      const storagePath = toStoragePath(base, 'detail', fileName);
      const url = await uploadOne(detailPath, storagePath);
      detailUrls.push(url);
      detailIndex += 1;
    }

    const images = Array.from(new Set([thumbUrl, ...detailUrls]));
    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ images, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) {
        throw new Error(`products 업데이트 실패 (${title}): ${updateError.message}`);
      }
    }

    updated.push({ title, imageCount: images.length, folder: folder.folderName });
  }

  return { updated, unmatchedFolders, totalDbRows: productRows.length };
}

async function updateCollections(collectionFolders) {
  const { data: collectionRows, error } = await supabase
    .from('collections')
    .select('id,title,image,images')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`collections 조회 실패: ${error.message}`);

  const rowsByNorm = new Map();
  for (const row of collectionRows) {
    rowsByNorm.set(normalizeKey(row.title || ''), row);
  }

  const updated = [];
  const unmatchedFolders = [];

  for (const folder of collectionFolders) {
    const row = rowsByNorm.get(folder.folderKey);
    if (!row) {
      unmatchedFolders.push(folder.folderName);
      continue;
    }

    const title = row.title || folder.folderName;
    const slug = toAsciiSlug(title) || row.id;
    const urls = [];

    let index = 1;
    for (const filePath of folder.imageList) {
      const ext = path.extname(filePath).toLowerCase() || '.png';
      const fileName = `${String(index).padStart(2, '0')}-${sanitizeFileStem(filePath)}${ext}`;
      const storagePath = toStoragePath('collections', slug, fileName);
      const url = await uploadOne(filePath, storagePath);
      urls.push(url);
      index += 1;
    }

    const deduped = Array.from(new Set(urls));
    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('collections')
        .update({
          image: deduped[0] ?? null,
          images: deduped,
          items: deduped.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updateError) {
        throw new Error(`collections 업데이트 실패 (${title}): ${updateError.message}`);
      }
    }

    updated.push({ title, imageCount: deduped.length, folder: folder.folderName });
  }

  return { updated, unmatchedFolders, totalDbRows: collectionRows.length };
}

async function main() {
  const skippedHeic = [];
  const productFolders = await collectProductFolders(skippedHeic);
  const collectionFolders = await collectCollectionFolders(skippedHeic);

  const productResult = await updateProducts(productFolders);
  const collectionResult = await updateCollections(collectionFolders);

  console.log(`mode=${DRY_RUN ? 'dry-run' : 'apply'}`);
  console.log(`products folders: ${productFolders.length}, updated: ${productResult.updated.length}, db rows: ${productResult.totalDbRows}`);
  console.log(`collections folders: ${collectionFolders.length}, updated: ${collectionResult.updated.length}, db rows: ${collectionResult.totalDbRows}`);

  if (productResult.unmatchedFolders.length) {
    console.log('unmatched product folders:', productResult.unmatchedFolders.join(', '));
  }
  if (collectionResult.unmatchedFolders.length) {
    console.log('unmatched collection folders:', collectionResult.unmatchedFolders.join(', '));
  }

  if (skippedHeic.length) {
    console.log(`skipped unsupported HEIC/HEIF files: ${skippedHeic.length}`);
  }

  console.log('\nupdated products');
  for (const item of productResult.updated) {
    console.log(`- ${item.title} <= ${item.folder} (${item.imageCount} images)`);
  }

  console.log('\nupdated collections');
  for (const item of collectionResult.updated) {
    console.log(`- ${item.title} <= ${item.folder} (${item.imageCount} images)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
