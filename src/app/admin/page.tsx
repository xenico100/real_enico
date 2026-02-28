'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCcw, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { AccountAuthPanel } from '@/app/components/subculture/AccountAuthPanel';
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  isProductCategory,
  type ProductCategory,
} from '@/app/constants/productCategories';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type ProductRow = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  images: unknown;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProductFormState = {
  title: string;
  category: ProductCategory;
  description: string;
  price: string;
  currency: string;
  isPublished: boolean;
  images: string[];
};

type AdminRow = {
  user_id: string;
  created_at?: string | null;
};

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

const emptyForm: ProductFormState = {
  title: '',
  category: DEFAULT_PRODUCT_CATEGORY,
  description: '',
  price: '',
  currency: 'KRW',
  isPublished: true,
  images: [],
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const payload = error as Record<string, unknown>;
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.msg === 'string' && payload.msg) ||
      (typeof payload.error_description === 'string' && payload.error_description) ||
      '';

    if (message) return message;
  }

  return fallback;
}

function isMissingProductsColumn(error: unknown, column: string) {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes(`'${column}' column`) ||
    message.includes(`products.${column}`) ||
    message.includes(`column ${column}`)
  );
}

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      if (value.trim()) return [value];
    }
  }

  return [];
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPrice(price: number | string | null, currency: string | null) {
  if (price === null || price === undefined || price === '') return '-';
  const numeric = Number(price);
  if (Number.isNaN(numeric)) return `${price}`;

  if ((currency || '').toUpperCase() === 'KRW') {
    return `${numeric.toLocaleString('ko-KR')} KRW`;
  }

  return `${numeric.toLocaleString()} ${currency || ''}`.trim();
}

function AdminConsoleInner() {
  const [isEmbedded, setIsEmbedded] = useState(false);
  const { isConfigured, isAuthReady, isAuthenticated, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canManageProducts = isAuthenticated && isAdmin;
  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      }),
    [products],
  );

  const clearMessages = () => {
    setPageMessage(null);
    setPageError(null);
  };

  const getSupabaseOrThrow = () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error(
        'Supabase env is missing. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 확인 필요',
      );
    }
    return supabase;
  };

  const resetForm = () => {
    setEditingProductId(null);
    setForm(emptyForm);
    setManualImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadProducts = async (opts?: { forcePublishedOnly?: boolean }) => {
    if (!isConfigured) return;

    clearMessages();
    setIsLoadingProducts(true);
    try {
      const supabase = getSupabaseOrThrow();
      let query = supabase.from('products').select('*');

      const publishedOnly = opts?.forcePublishedOnly ?? !canManageProducts;
      if (publishedOnly) {
        query = query.eq('is_published', true);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const categoryValue = typeof row.category === 'string' ? row.category : null;
        const categoryNameRaw =
          typeof row.category_name_raw === 'string' ? row.category_name_raw : null;
        const resolvedCategory =
          (categoryValue && isProductCategory(categoryValue) && categoryValue) ||
          (categoryNameRaw && isProductCategory(categoryNameRaw) && categoryNameRaw) ||
          DEFAULT_PRODUCT_CATEGORY;
        const rawPrice = row.price;
        const parsedPrice =
          typeof rawPrice === 'number'
            ? rawPrice
            : typeof rawPrice === 'string'
              ? rawPrice
              : null;

        return {
          id: String(row.id ?? ''),
          title: typeof row.title === 'string' ? row.title : null,
          category: resolvedCategory,
          description: typeof row.description === 'string' ? row.description : null,
          price: parsedPrice,
          currency: typeof row.currency === 'string' ? row.currency : 'KRW',
          images: row.images,
          is_published:
            typeof row.is_published === 'boolean' ? row.is_published : true,
          created_at: typeof row.created_at === 'string' ? row.created_at : null,
          updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
        } satisfies ProductRow;
      });

      setProducts(mapped);
    } catch (error) {
      setPageError(getErrorMessage(error, '상품 목록을 불러오지 못했습니다.'));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setIsEmbedded(params.get('embedded') === '1');
  }, []);

  useEffect(() => {
    let active = true;

    const checkAdminRole = async () => {
      if (!isConfigured) {
        if (active) {
          setIsCheckingAdmin(false);
          setIsAdmin(false);
        }
        return;
      }

      if (!isAuthReady) return;

      if (!isAuthenticated || !user) {
        if (active) {
          setIsAdmin(false);
          setIsCheckingAdmin(false);
        }
        return;
      }

      if (active) setIsCheckingAdmin(true);

      const normalizedEmail = (user.email || '').toLowerCase();
      if (normalizedEmail === PRIMARY_ADMIN_EMAIL) {
        if (active) {
          setIsAdmin(true);
          setIsCheckingAdmin(false);
        }
        return;
      }

      try {
        const supabase = getSupabaseOrThrow();
        const { data, error } = await supabase
          .from('admins')
          .select('user_id, created_at')
          .eq('user_id', user.id)
          .maybeSingle<AdminRow>();

        if (error) throw error;

        if (active) {
          setIsAdmin(Boolean(data?.user_id));
        }
      } catch (error) {
        if (active) {
          setIsAdmin(false);
          setPageError(
            error instanceof Error ? `관리자 권한 확인 실패: ${error.message}` : '관리자 권한 확인 실패',
          );
        }
      } finally {
        if (active) setIsCheckingAdmin(false);
      }
    };

    void checkAdminRole();

    return () => {
      active = false;
    };
  }, [isConfigured, isAuthReady, isAuthenticated, user]);

  useEffect(() => {
    if (!isConfigured) return;
    if (!isAuthReady) return;
    if (isCheckingAdmin) return;
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, isAuthReady, isCheckingAdmin, canManageProducts]);

  const startEditProduct = (product: ProductRow) => {
    clearMessages();
    setEditingProductId(product.id);
    const categoryValue = product.category ?? '';
    setForm({
      title: product.title ?? '',
      category: isProductCategory(categoryValue) ? categoryValue : DEFAULT_PRODUCT_CATEGORY,
      description: product.description ?? '',
      price: product.price === null || product.price === undefined ? '' : String(product.price),
      currency: product.currency ?? 'KRW',
      isPublished: Boolean(product.is_published),
      images: normalizeImages(product.images),
    });
    setManualImageUrl('');
  };

  const handleAddManualImage = () => {
    const trimmed = manualImageUrl.trim();
    if (!trimmed) return;
    setForm((prev) => ({ ...prev, images: [...prev.images, trimmed] }));
    setManualImageUrl('');
  };

  const handleRemoveImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== index),
    }));
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canManageProducts || !user) {
      setPageError('관리자 로그인 후 업로드할 수 있습니다.');
      return;
    }

    setIsUploading(true);
    clearMessages();

    try {
      const supabase = getSupabaseOrThrow();
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() || 'jpg';
        const safeBase = file.name
          .replace(/\.[^/.]+$/, '')
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, '-')
          .slice(0, 40);
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeBase}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path);
        if (publicData.publicUrl) {
          uploadedUrls.push(publicData.publicUrl);
        }
      }

      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      setPageMessage(`${uploadedUrls.length}개 이미지 업로드 완료`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '이미지 업로드 실패');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageProducts) {
      setPageError('관리자만 저장할 수 있습니다.');
      return;
    }
    if (!form.title.trim()) {
      setPageError('title은 필수입니다.');
      return;
    }
    if (!form.price.trim()) {
      setPageError('price는 필수입니다.');
      return;
    }
    if (!isProductCategory(form.category)) {
      setPageError('카테고리를 선택하세요.');
      return;
    }

    const parsedPrice = Number.parseInt(form.price, 10);
    if (Number.isNaN(parsedPrice)) {
      setPageError('price는 숫자로 입력하세요.');
      return;
    }

    setIsSaving(true);
    clearMessages();

    try {
      const supabase = getSupabaseOrThrow();
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim() || null,
        price: parsedPrice,
        currency: form.currency.trim().toUpperCase() || 'KRW',
        images: form.images,
        is_published: form.isPublished,
        updated_at: now,
      };

      let saveError: unknown = null;
      let usedCategoryFallback = false;

      if (editingProductId) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProductId);
        saveError = error;

        if (saveError && isMissingProductsColumn(saveError, 'category')) {
          const compatPayload: Record<string, unknown> = { ...payload };
          delete compatPayload.category;
          const retry = await supabase
            .from('products')
            .update(compatPayload)
            .eq('id', editingProductId);
          saveError = retry.error;
          usedCategoryFallback = !retry.error;
        }
      } else {
        const insertPayload: Record<string, unknown> = {
          ...payload,
          created_at: now,
        };
        const { error } = await supabase.from('products').insert(insertPayload);
        saveError = error;

        if (saveError && isMissingProductsColumn(saveError, 'category')) {
          const compatPayload: Record<string, unknown> = { ...insertPayload };
          delete compatPayload.category;
          const retry = await supabase.from('products').insert(compatPayload);
          saveError = retry.error;
          usedCategoryFallback = !retry.error;
        }
      }

      if (saveError) throw saveError;

      if (editingProductId) {
        setPageMessage(
          usedCategoryFallback
            ? '상품 수정 완료 (DB에 category 컬럼이 없어 카테고리는 별도 저장되지 않았습니다)'
            : '상품 수정 완료',
        );
      } else {
        setPageMessage(
          usedCategoryFallback
            ? '상품 등록 완료 (DB에 category 컬럼이 없어 카테고리는 별도 저장되지 않았습니다)'
            : '상품 등록 완료',
        );
      }

      resetForm();
      await loadProducts({ forcePublishedOnly: false });
    } catch (error) {
      setPageError(getErrorMessage(error, '상품 저장 실패'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!canManageProducts) return;
    const confirmed = window.confirm('이 상품을 삭제할까요?');
    if (!confirmed) return;

    clearMessages();

    try {
      const supabase = getSupabaseOrThrow();
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;

      setProducts((prev) => prev.filter((product) => product.id !== productId));
      if (editingProductId === productId) {
        resetForm();
      }
      setPageMessage('상품 삭제 완료');
    } catch (error) {
      setPageError(getErrorMessage(error, '상품 삭제 실패'));
    }
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen'} bg-[#050505] text-[#e5e5e5]`}>
      <div className={`mx-auto max-w-7xl px-4 md:px-8 ${isEmbedded ? 'py-4 md:py-6' : 'py-8 md:py-12'}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[#333] pb-6 mb-8">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-[#00ffd1] uppercase">
              Admin Console
            </p>
            <h1 className="font-heading text-5xl md:text-7xl uppercase tracking-tight leading-[0.9]">
              Products
            </h1>
            <p className="font-mono text-xs text-[#777] mt-2">
              관리자만 업로드/수정/삭제 가능, 일반 유저는 조회만
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadProducts()}
              disabled={isLoadingProducts || !isConfigured}
              className="inline-flex items-center gap-2 px-3 py-2 border border-[#333] bg-[#111] font-mono text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors disabled:opacity-50"
            >
              <RefreshCcw size={14} className={isLoadingProducts ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 px-3 py-2 border border-[#333] bg-[#111] font-mono text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
            >
              <Plus size={14} />
              New Post
            </button>
            <Link
              href="/admin/collections"
              className="inline-flex items-center gap-2 px-3 py-2 border border-[#333] bg-[#111] font-mono text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
            >
              Collections Admin
            </Link>
            {!isEmbedded && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-3 py-2 border border-[#333] bg-[#111] font-mono text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
              >
                Back Home
              </Link>
            )}
          </div>
        </div>

        {!isConfigured && (
          <div className="border border-[#333] bg-[#0a0a0a] p-6 font-mono text-sm">
            <p className="text-[#00ffd1] mb-2 uppercase tracking-widest">Config Required</p>
            <p className="text-[#aaa] text-xs">
              `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 후 다시 확인하세요.
            </p>
          </div>
        )}

        {isConfigured && (
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
            <div className="space-y-6">
              <div className="border border-[#333] bg-[#0a0a0a] p-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#666] mb-3">
                  Access Status
                </p>

                {!isAuthReady || isCheckingAdmin ? (
                  <div className="flex items-center gap-2 font-mono text-xs text-[#aaa]">
                    <Loader2 size={14} className="animate-spin text-[#00ffd1]" />
                    권한 확인 중...
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between gap-3 border-b border-[#222] pb-2">
                      <span className="text-[#666]">Authenticated</span>
                      <span className={isAuthenticated ? 'text-[#00ffd1]' : 'text-[#888]'}>
                        {isAuthenticated ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-[#222] pb-2">
                      <span className="text-[#666]">Admin</span>
                      <span className={isAdmin ? 'text-[#00ffd1]' : 'text-[#888]'}>
                        {isAdmin ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#666]">Visible Data</span>
                      <span className="text-[#e5e5e5]">
                        {canManageProducts ? 'ALL PRODUCTS' : 'PUBLISHED ONLY'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {canManageProducts ? (
                <form onSubmit={handleSaveProduct} className="border border-[#333] bg-[#0a0a0a] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-heading text-3xl uppercase tracking-tight">
                      {editingProductId ? 'Edit Product' : 'New Product'}
                    </h2>
                    {editingProductId && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="font-mono text-[11px] px-2 py-1 border border-[#333] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors uppercase"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#666] mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                      placeholder="상품명"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#666] mb-2">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          category: isProductCategory(e.target.value)
                            ? e.target.value
                            : DEFAULT_PRODUCT_CATEGORY,
                        }))
                      }
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                    >
                      {PRODUCT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[#666] mb-2">
                        Price (bigint)
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.price}
                        onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                        className="w-full bg-black border border-[#333] px-3 py-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                        placeholder="10000"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[#666] mb-2">
                        Currency
                      </label>
                      <input
                        type="text"
                        value={form.currency}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))
                        }
                        className="w-full bg-black border border-[#333] px-3 py-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                        placeholder="KRW"
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#666] mb-2">
                      Description
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={5}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm focus:outline-none focus:border-[#00ffd1] resize-y"
                      placeholder="상품 설명"
                    />
                  </div>

                  <label className="flex items-center gap-3 p-3 border border-[#333] bg-[#111] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isPublished}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, isPublished: e.target.checked }))
                      }
                      className="accent-[#00ffd1]"
                    />
                    <span className="font-mono text-xs uppercase tracking-widest">
                      Published (일반 유저에게 노출)
                    </span>
                  </label>

                  <div className="space-y-3 border border-[#333] bg-[#090909] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#666]">
                        Product Images (jsonb array)
                      </p>
                      <span className="font-mono text-[10px] text-[#00ffd1]">
                        {form.images.length} items
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => void handleUploadImages(e.target.files)}
                        className="block w-full text-xs text-[#aaa] file:mr-3 file:border file:border-[#333] file:bg-[#111] file:text-[#e5e5e5] file:px-3 file:py-2 file:cursor-pointer"
                        disabled={isUploading}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="hidden"
                      >
                        hidden
                      </button>
                      <p className="text-[10px] text-[#666] font-mono">
                        bucket: `product-images` (public)
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={manualImageUrl}
                        onChange={(e) => setManualImageUrl(e.target.value)}
                        placeholder="https://... (manual URL)"
                        className="flex-1 bg-black border border-[#333] px-3 py-2 text-xs focus:outline-none focus:border-[#00ffd1]"
                      />
                      <button
                        type="button"
                        onClick={handleAddManualImage}
                        className="px-3 py-2 border border-[#333] bg-[#111] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {form.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                        {form.images.map((url, index) => (
                          <div key={`${url}-${index}`} className="border border-[#333] bg-[#111] p-2">
                            <div className="aspect-square bg-black border border-[#222] overflow-hidden mb-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-mono text-[10px] text-[#888] break-all line-clamp-3">
                                {url}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(index)}
                                className="text-[#666] hover:text-red-400 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving || isUploading}
                    className="w-full py-3 bg-[#e5e5e5] text-black font-bold uppercase tracking-widest hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
                  >
                    {isSaving
                      ? 'Saving...'
                      : editingProductId
                        ? 'Update Product'
                        : 'Create Product'}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="border border-[#333] bg-[#0a0a0a] p-5">
                    <h2 className="font-heading text-3xl uppercase tracking-tight mb-3">
                      Admin Login Required
                    </h2>
                    <p className="font-mono text-xs text-[#888] leading-relaxed">
                      `/admin` 에서는 관리자만 상품 업로드/수정/삭제가 가능합니다. 일반 유저는
                      게시물 조회만 가능합니다.
                    </p>
                  </div>
                  <AccountAuthPanel />
                </div>
              )}
            </div>

            <div className="space-y-4">
              {(pageMessage || pageError) && (
                <div
                  className={`border p-4 font-mono text-xs ${
                    pageError
                      ? 'border-red-700 bg-red-950/20 text-red-300'
                      : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                  }`}
                >
                  {pageError || pageMessage}
                </div>
              )}

              <div className="border border-[#333] bg-[#0a0a0a] p-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#666]">
                    Product List
                  </p>
                  <p className="font-mono text-xs text-[#999] mt-1">
                    {canManageProducts
                      ? '전체 상품 (published / draft 포함)'
                      : 'published 상품만 표시'}
                  </p>
                </div>
                <div className="font-mono text-xs text-[#00ffd1]">
                  {isLoadingProducts ? 'Loading...' : `${sortedProducts.length} items`}
                </div>
              </div>

              {isLoadingProducts ? (
                <div className="border border-[#333] bg-[#0a0a0a] p-8 flex items-center justify-center gap-3 font-mono text-xs text-[#aaa]">
                  <Loader2 size={14} className="animate-spin text-[#00ffd1]" />
                  상품 불러오는 중...
                </div>
              ) : sortedProducts.length === 0 ? (
                <div className="border border-[#333] bg-[#0a0a0a] p-8 font-mono text-xs text-[#777] text-center">
                  표시할 상품이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortedProducts.map((product) => {
                    const imageList = normalizeImages(product.images);
                    return (
                      <article
                        key={product.id}
                        className="border border-[#333] bg-[#0a0a0a] overflow-hidden"
                      >
                        <div className="aspect-[4/3] bg-black border-b border-[#222] relative">
                          {imageList[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageList[0]}
                              alt={product.title || 'product'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#555]">
                              NO IMAGE
                            </div>
                          )}
                          <div className="absolute top-2 left-2 px-2 py-1 text-[10px] font-mono border border-[#333] bg-black/80">
                            {product.is_published ? (
                              <span className="text-[#00ffd1]">PUBLISHED</span>
                            ) : (
                              <span className="text-[#aaa]">DRAFT</span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-heading text-2xl uppercase tracking-tight leading-none break-words">
                                {product.title || '(untitled)'}
                              </h3>
                              <p className="font-mono text-[10px] text-[#00ffd1] mt-2 uppercase tracking-widest">
                                {isProductCategory(product.category ?? '')
                                  ? product.category
                                  : DEFAULT_PRODUCT_CATEGORY}
                              </p>
                              <p className="font-mono text-[10px] text-[#666] mt-2 break-all">
                                {product.id}
                              </p>
                            </div>
                            {canManageProducts && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditProduct(product)}
                                  className="p-2 border border-[#333] bg-[#111] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
                                  aria-label="Edit product"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteProduct(product.id)}
                                  className="p-2 border border-[#333] bg-[#111] hover:border-red-500 hover:text-red-400 transition-colors"
                                  aria-label="Delete product"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="border border-[#222] bg-[#111] p-2">
                              <p className="text-[#666] mb-1">Price</p>
                              <p className="text-[#e5e5e5]">
                                {formatPrice(product.price, product.currency)}
                              </p>
                            </div>
                            <div className="border border-[#222] bg-[#111] p-2">
                              <p className="text-[#666] mb-1">Images</p>
                              <p className="text-[#e5e5e5]">{imageList.length} files</p>
                            </div>
                          </div>

                          <p className="font-mono text-xs text-[#9a9a9a] leading-relaxed line-clamp-4 min-h-16">
                            {product.description || '설명이 없습니다.'}
                          </p>

                          <div className="border-t border-[#222] pt-3 grid grid-cols-2 gap-2 text-[10px] font-mono text-[#666]">
                            <div>
                              <p className="mb-1">Created</p>
                              <p className="text-[#888]">{formatDate(product.created_at)}</p>
                            </div>
                            <div>
                              <p className="mb-1">Updated</p>
                              <p className="text-[#888]">{formatDate(product.updated_at)}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <AdminConsoleInner />;
}
