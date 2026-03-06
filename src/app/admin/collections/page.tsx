'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCcw, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { AccountAuthPanel } from '@/app/components/subculture/AccountAuthPanel';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type CollectionRow = {
  id: string;
  title: string | null;
  season: string | null;
  description: string | null;
  full_description: string | null;
  release_date: string | null;
  items: number | string | null;
  image: string | null;
  images: unknown;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type CollectionFormState = {
  title: string;
  season: string;
  description: string;
  fullDescription: string;
  releaseDate: string;
  items: string;
  isPublished: boolean;
  images: string[];
};

type AdminRow = {
  user_id: string;
  created_at?: string | null;
};

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

const emptyForm: CollectionFormState = {
  title: '',
  season: '',
  description: '',
  fullDescription: '',
  releaseDate: '',
  items: '',
  isPublished: true,
  images: [],
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

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

function normalizeImages(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      if (value.trim()) return [value.trim()];
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

function formatItems(value: number | string | null) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value}`;
  return `${numeric.toLocaleString('ko-KR')}개`;
}

function AdminCollectionsConsoleInner() {
  const [isEmbedded, setIsEmbedded] = useState(false);
  const { session, isConfigured, isAuthReady, isAuthenticated, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [form, setForm] = useState<CollectionFormState>(emptyForm);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'editor' | 'list'>('list');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canManageCollections = isAuthenticated && isAdmin;
  const sortedCollections = useMemo(
    () =>
      [...collections].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      }),
    [collections],
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
    setEditingCollectionId(null);
    setForm(emptyForm);
    setManualImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadCollections = async (opts?: { forcePublishedOnly?: boolean }) => {
    if (!isConfigured) return;

    clearMessages();
    setIsLoadingCollections(true);
    try {
      const supabase = getSupabaseOrThrow();
      let query = supabase.from('collections').select('*');

      const publishedOnly = opts?.forcePublishedOnly ?? !canManageCollections;
      if (publishedOnly) {
        query = query.eq('is_published', true);
      }

      let { data, error } = await query.order('created_at', { ascending: false });

      if (
        error &&
        publishedOnly &&
        getErrorMessage(error, '').toLowerCase().includes('is_published')
      ) {
        const retry = await supabase
          .from('collections')
          .select('*')
          .order('created_at', { ascending: false });
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const rawItems = row.items;
        const items =
          typeof rawItems === 'number'
            ? rawItems
            : typeof rawItems === 'string'
              ? rawItems
              : null;

        return {
          id: String(row.id ?? ''),
          title: typeof row.title === 'string' ? row.title : null,
          season: typeof row.season === 'string' ? row.season : null,
          description: typeof row.description === 'string' ? row.description : null,
          full_description:
            typeof row.full_description === 'string' ? row.full_description : null,
          release_date: typeof row.release_date === 'string' ? row.release_date : null,
          items,
          image: typeof row.image === 'string' ? row.image : null,
          images: row.images,
          is_published:
            typeof row.is_published === 'boolean' ? row.is_published : true,
          created_at: typeof row.created_at === 'string' ? row.created_at : null,
          updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
        } satisfies CollectionRow;
      });

      setCollections(mapped);
    } catch (error) {
      setPageError(getErrorMessage(error, '컬렉션 목록을 불러오지 못했습니다.'));
    } finally {
      setIsLoadingCollections(false);
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
        if (active) setIsAdmin(Boolean(data?.user_id));
      } catch (error) {
        if (active) {
          setIsAdmin(false);
          setPageError(
            `관리자 권한 확인 실패: ${getErrorMessage(error, 'unknown error')}`,
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
    void loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, isAuthReady, isCheckingAdmin, canManageCollections]);

  const startEditCollection = (collection: CollectionRow) => {
    clearMessages();
    setWorkspaceView('editor');
    setEditingCollectionId(collection.id);
    const normalizedImages = normalizeImages(collection.images);
    setForm({
      title: collection.title ?? '',
      season: collection.season ?? '',
      description: collection.description ?? '',
      fullDescription: collection.full_description ?? '',
      releaseDate: collection.release_date ?? '',
      items:
        collection.items === null || collection.items === undefined ? '' : String(collection.items),
      isPublished: Boolean(collection.is_published),
      images:
        normalizedImages.length > 0
          ? normalizedImages
          : collection.image
            ? [collection.image]
            : [],
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
    if (!canManageCollections || !user) {
      setPageError('관리자 로그인 후 업로드할 수 있습니다.');
      return;
    }

    setIsUploading(true);
    clearMessages();

    try {
      if (!session?.access_token) {
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      const uploadedUrls: string[] = [];

      const formData = new FormData();
      formData.append('folder', 'collections');
      for (const file of Array.from(files)) {
        formData.append('files', file);
      }

      const response = await fetch('/api/admin/r2-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const payload = (await response.json()) as { urls?: string[]; message?: string };
      if (!response.ok) {
        throw new Error(payload.message || 'R2 업로드 실패');
      }

      uploadedUrls.push(...(Array.isArray(payload.urls) ? payload.urls : []));

      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      setPageMessage(`${uploadedUrls.length}개 이미지 업로드 완료`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setPageError(getErrorMessage(error, '이미지 업로드 실패'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCollections) {
      setPageError('관리자만 저장할 수 있습니다.');
      return;
    }

    if (!form.title.trim()) {
      setPageError('title은 필수입니다.');
      return;
    }

    if (form.items.trim()) {
      const parsed = Number.parseInt(form.items, 10);
      if (Number.isNaN(parsed)) {
        setPageError('items는 숫자로 입력하세요.');
        return;
      }
    }

    setIsSaving(true);
    clearMessages();

    try {
      if (!session?.access_token) {
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      const cleanedImages = form.images.map((item) => item.trim()).filter(Boolean);
      const parsedItems = form.items.trim() ? Number.parseInt(form.items, 10) : 0;

      const payload = {
        title: form.title.trim(),
        season: form.season.trim() || null,
        description: form.description.trim() || null,
        full_description: form.fullDescription.trim() || null,
        release_date: form.releaseDate.trim() || null,
        items: parsedItems,
        image: cleanedImages[0] || null,
        images: cleanedImages,
        is_published: form.isPublished,
      };

      const response = await fetch('/api/admin/collections', {
        method: editingCollectionId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(
          editingCollectionId ? { id: editingCollectionId, ...payload } : payload,
        ),
      });

      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || '컬렉션 저장 실패');
      }

      setPageMessage(result.message || '컬렉션 게시물 저장 완료');

      resetForm();
      await loadCollections({ forcePublishedOnly: false });
    } catch (error) {
      setPageError(getErrorMessage(error, '컬렉션 저장 실패'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!canManageCollections) return;
    const confirmed = window.confirm('이 컬렉션 게시물을 삭제할까요?');
    if (!confirmed) return;

    clearMessages();

    try {
      if (!session?.access_token) {
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      const response = await fetch('/api/admin/collections', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: collectionId }),
      });

      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || '컬렉션 삭제 실패');
      }

      setCollections((prev) => prev.filter((item) => item.id !== collectionId));
      if (editingCollectionId === collectionId) {
        resetForm();
      }
      setPageMessage(result.message || '컬렉션 삭제 완료');
    } catch (error) {
      setPageError(getErrorMessage(error, '컬렉션 삭제 실패'));
    }
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen'} bg-[#050505] text-[#e5e5e5]`}>
      <div className={`mx-auto max-w-[1720px] px-3 md:px-6 lg:px-8 ${isEmbedded ? 'py-4 md:py-6' : 'py-6 md:py-10'}`}>
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-[#111] px-4 py-5 md:mb-8 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-[#00ffd1] uppercase">
              Admin Console
            </p>
            <h1 className="font-heading text-4xl md:text-6xl xl:text-7xl uppercase tracking-tight leading-[0.92]">
              컬렉션 게시물 목록
            </h1>
            <p className="mt-2 font-mono text-sm leading-relaxed text-[#b8b8b8]">
              컬렉션 목록 먼저 보고, 수정 버튼 누르면 바로 편집 화면으로 넘어갑니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 md:min-w-[520px] md:grid-cols-3">
            <button
              type="button"
              onClick={() => void loadCollections()}
              disabled={isLoadingCollections || !isConfigured}
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#171717] px-3 py-3 font-mono text-sm text-[#ededed] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] disabled:opacity-50"
            >
              <RefreshCcw size={14} className={isLoadingCollections ? 'animate-spin' : ''} />
              새로고침
            </button>
            <Link
              href="/admin"
              className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-[#7bb8ff]/35 bg-[#7bb8ff]/10 px-3 py-3 font-mono text-sm text-[#e8f3ff] transition-colors hover:bg-[#7bb8ff]/20"
            >
              의류 목록
            </Link>
            {!isEmbedded && (
              <Link
                href="/"
                className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-white/15 bg-[#171717] px-3 py-3 font-mono text-sm text-[#ededed] transition-colors hover:bg-[#232323]"
              >
                홈으로
              </Link>
            )}
          </div>
        </div>
        </div>

        {!isConfigured && (
          <div className="border border-[#333] bg-[#0a0a0a] p-6 font-mono text-sm">
            <p className="text-[#00ffd1] mb-2 uppercase tracking-widest">Config Required</p>
            <p className="text-[#d8d8d8] text-xs">
              `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 후 다시 확인하세요.
            </p>
          </div>
        )}

        {isConfigured && (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-[#111] p-4 md:p-5">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#00ffd1]">
                작업 화면
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWorkspaceView('editor')}
                  className={`rounded-2xl px-4 py-4 text-sm font-mono transition-colors ${
                    workspaceView === 'editor'
                      ? 'border border-[#7bb8ff]/60 bg-[#7bb8ff]/15 text-[#eef6ff] shadow-[0_0_0_1px_rgba(123,184,255,0.2)]'
                      : 'border border-white/15 bg-[#171717] text-[#c8c8c8] hover:border-[#7bb8ff]/40 hover:text-[#eef6ff]'
                  }`}
                >
                  수정 화면
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceView('list')}
                  className={`rounded-2xl px-4 py-4 text-sm font-mono transition-colors ${
                    workspaceView === 'list'
                      ? 'border border-[#00ffd1]/60 bg-[#00ffd1]/15 text-[#ecfffa] shadow-[0_0_0_1px_rgba(0,255,209,0.18)]'
                      : 'border border-white/15 bg-[#171717] text-[#c8c8c8] hover:border-[#00ffd1]/40 hover:text-[#ecfffa]'
                  }`}
                >
                  게시물 목록
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
            <div className={`mx-auto w-full max-w-4xl space-y-6 ${workspaceView === 'list' ? 'hidden' : ''}`}>
              <div className="rounded-[24px] border border-white/10 bg-[#111] p-5 md:p-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#9b9b9b] mb-3">
                  Access Status
                </p>

                {!isAuthReady || isCheckingAdmin ? (
                  <div className="flex items-center gap-2 font-mono text-xs text-[#d8d8d8]">
                    <Loader2 size={14} className="animate-spin text-[#00ffd1]" />
                    권한 확인 중...
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between gap-3 border-b border-[#222] pb-2">
                      <span className="text-[#9b9b9b]">Authenticated</span>
                      <span className={isAuthenticated ? 'text-[#00ffd1]' : 'text-[#c6c6c6]'}>
                        {isAuthenticated ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-[#222] pb-2">
                      <span className="text-[#9b9b9b]">Admin</span>
                      <span className={isAdmin ? 'text-[#00ffd1]' : 'text-[#c6c6c6]'}>
                        {isAdmin ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#9b9b9b]">Visible Data</span>
                      <span className="text-[#e5e5e5]">
                        {canManageCollections ? 'ALL COLLECTIONS' : 'PUBLISHED ONLY'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {canManageCollections ? (
                <form onSubmit={handleSaveCollection} className="rounded-[28px] border border-white/10 bg-[#111] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)] space-y-5 md:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-heading text-2xl uppercase tracking-tight md:text-4xl">
                      {editingCollectionId ? '컬렉션 게시물 수정' : '컬렉션 게시물 작성'}
                    </h2>
                    {editingCollectionId && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-xl border border-white/15 px-3 py-2 font-mono text-xs text-[#d9d9d9] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] uppercase"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1]"
                      placeholder="컬렉션 제목"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                        Season
                      </label>
                      <input
                        type="text"
                        value={form.season}
                        onChange={(e) => setForm((prev) => ({ ...prev, season: e.target.value }))}
                        className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1]"
                        placeholder="예: 봄/여름 2027"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                        Items Count
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.items}
                        onChange={(e) => setForm((prev) => ({ ...prev, items: e.target.value }))}
                        className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1]"
                        placeholder="24"
                        min={0}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={form.releaseDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, releaseDate: e.target.value }))}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1]"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                      Short Description
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={4}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1] resize-y"
                      placeholder="카드 요약 설명"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase text-[#9b9b9b] mb-2">
                      Full Description
                    </label>
                    <textarea
                      value={form.fullDescription}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, fullDescription: e.target.value }))
                      }
                      rows={7}
                      className="w-full bg-black border border-[#333] px-3 py-3 text-sm text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1] resize-y"
                      placeholder="상세 팝업에 들어갈 본문 설명"
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
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#9b9b9b]">
                        Collection Images (jsonb array)
                      </p>
                      <span className="font-mono text-[10px] text-[#00ffd1]">
                        {form.images.length} items
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 border border-[#333] bg-[#111] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors cursor-pointer w-fit">
                        <Upload size={14} />
                        <span className="font-mono text-xs uppercase tracking-widest">이미지 업로드</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => void handleUploadImages(e.target.files)}
                          className="sr-only"
                          disabled={isUploading}
                        />
                      </label>
                      <p className="text-[10px] text-[#9b9b9b] font-mono">
                        Cloudflare R2 퍼블릭 URL 사용 / 배열 순서가 상세 팝업 이미지 순서로 사용됨
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={manualImageUrl}
                        onChange={(e) => setManualImageUrl(e.target.value)}
                        placeholder="https://... (manual URL)"
                        className="flex-1 bg-black border border-[#333] px-3 py-2 text-xs text-[#f1f1f1] placeholder:text-[#7f7f7f] focus:outline-none focus:border-[#00ffd1]"
                      />
                      <button
                        type="button"
                        onClick={handleAddManualImage}
                        className="px-3 py-2 border border-[#333] bg-[#111] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
                        aria-label="Add image url"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {form.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                        {form.images.map((url, index) => (
                          <div key={`${url}-${index}`} className="border border-[#333] bg-[#111] p-2">
                            <div className="aspect-[4/5] bg-black border border-[#222] overflow-hidden mb-2 relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="w-full h-full object-contain bg-black" />
                              <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/80 border border-[#333] text-[9px] font-mono text-[#d8d8d8]">
                                {index + 1}
                              </div>
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-mono text-[10px] text-[#c6c6c6] break-all line-clamp-3">
                                {url}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(index)}
                                className="text-[#9b9b9b] hover:text-red-400 transition-colors"
                                aria-label="Remove image"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-4 bg-gradient-to-t from-[#0a0a0a] to-[#0a0a0a]/95 border-t border-[#222]">
                    <button
                      type="submit"
                      disabled={isSaving || isUploading}
                      className="w-full py-3 bg-[#00ffd1] text-black font-bold uppercase tracking-widest hover:bg-[#75ffe8] transition-colors disabled:opacity-50"
                    >
                      {isSaving
                        ? '저장 중...'
                        : editingCollectionId
                          ? '수정 업로드'
                          : '새 게시물 업로드'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="border border-[#333] bg-[#0a0a0a] p-5">
                    <h2 className="font-heading text-3xl uppercase tracking-tight mb-3">
                      Admin Login Required
                    </h2>
                    <p className="font-mono text-xs text-[#c6c6c6] leading-relaxed">
                      `/admin/collections`에서는 관리자만 컬렉션 게시물 업로드/수정/삭제가 가능합니다.
                      일반 유저는 게시물 조회만 가능합니다.
                    </p>
                  </div>
                  <AccountAuthPanel />
                </div>
              )}
            </div>

            <div className={`space-y-4 ${workspaceView === 'editor' ? 'hidden' : ''}`}>
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

              <div className="rounded-[24px] border border-white/10 bg-[#111] p-4 md:p-5">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-[#9b9b9b]">
                    컬렉션 게시물 목록
                  </p>
                  <p className="font-mono text-sm text-[#d0d0d0] mt-2">
                    {canManageCollections
                      ? '전체 컬렉션 (published / draft 포함)'
                      : 'published 컬렉션만 표시'}
                  </p>
                </div>
                <div className="mt-4 font-mono text-sm text-[#00ffd1]">
                  {isLoadingCollections ? 'Loading...' : `${sortedCollections.length} items`}
                </div>
              </div>

              {isLoadingCollections ? (
                <div className="border border-[#333] bg-[#0a0a0a] p-8 flex items-center justify-center gap-3 font-mono text-xs text-[#d8d8d8]">
                  <Loader2 size={14} className="animate-spin text-[#00ffd1]" />
                  컬렉션 불러오는 중...
                </div>
              ) : sortedCollections.length === 0 ? (
                <div className="border border-[#333] bg-[#0a0a0a] p-8 font-mono text-xs text-[#b8b8b8] text-center">
                  표시할 컬렉션 게시물이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                  {sortedCollections.map((collection) => {
                    const baseImageList = normalizeImages(collection.images);
                    const previewImage = collection.image || baseImageList[0] || '';
                    const imageList = baseImageList.length > 0 ? baseImageList : previewImage ? [previewImage] : [];
                    return (
                      <article
                        key={collection.id}
                        className="overflow-hidden rounded-[24px] border border-white/10 bg-[#121212] shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
                      >
                        <div className="relative aspect-[3/4] border-b border-white/10 bg-black">
                          {previewImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={previewImage}
                              alt={collection.title || 'collection'}
                              className="w-full h-full object-contain bg-black"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#9a9a9a]">
                              NO IMAGE
                            </div>
                          )}
                          <div className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/80 px-2.5 py-1 text-[10px] font-mono">
                            {collection.is_published ? (
                              <span className="text-[#00ffd1]">PUBLISHED</span>
                            ) : (
                              <span className="text-[#d8d8d8]">DRAFT</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 p-3 md:p-4">
                          <div>
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 text-base font-heading uppercase tracking-tight leading-tight break-words sm:text-xl">
                                {collection.title || '(untitled)'}
                              </h3>
                              <p className="mt-2 font-mono text-[10px] text-[#9b9b9b] break-all">
                                {collection.id}
                              </p>
                            </div>
                            {canManageCollections && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditCollection(collection)}
                                  className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-[#00ffd1]/50 bg-[#00ffd1]/12 px-2 py-2 text-[11px] font-mono text-[#d8fff6] transition-colors hover:bg-[#00ffd1]/20"
                                  aria-label="Edit collection"
                                >
                                  <Pencil size={12} />
                                  수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCollection(collection.id)}
                                  className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-red-500/50 bg-red-500/10 px-2 py-2 text-[11px] font-mono text-red-300 transition-colors hover:bg-red-500/20"
                                  aria-label="Delete collection"
                                >
                                  <Trash2 size={12} />
                                  삭제
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-2 text-xs font-mono sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-[#181818] p-3">
                              <p className="mb-1 text-[#9b9b9b]">시즌</p>
                              <p className="text-[#e5e5e5] break-words">{collection.season || '-'}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-[#181818] p-3">
                              <p className="mb-1 text-[#9b9b9b]">구성 수</p>
                              <p className="text-[#e5e5e5]">{formatItems(collection.items)}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-[#181818] p-3">
                              <p className="mb-1 text-[#9b9b9b]">발매일</p>
                              <p className="text-[#e5e5e5]">{collection.release_date || '-'}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-[#181818] p-3">
                              <p className="mb-1 text-[#9b9b9b]">이미지</p>
                              <p className="text-[#e5e5e5]">{imageList.length} files</p>
                            </div>
                          </div>

                          <p className="font-mono text-xs leading-relaxed text-[#b2b2b2] line-clamp-3">
                            {collection.description || '설명이 없습니다.'}
                          </p>
                          <p className="min-h-[72px] border-t border-white/10 pt-3 font-mono text-xs leading-relaxed text-[#d4d4d4] line-clamp-4">
                            {collection.full_description || '상세 설명이 없습니다.'}
                          </p>

                          <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px] font-mono text-[#9b9b9b]">
                            <div>
                              <p className="mb-1">Created</p>
                              <p className="text-[#c6c6c6]">{formatDate(collection.created_at)}</p>
                            </div>
                            <div>
                              <p className="mb-1">Updated</p>
                              <p className="text-[#c6c6c6]">{formatDate(collection.updated_at)}</p>
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCollectionsPage() {
  return <AdminCollectionsConsoleInner />;
}
