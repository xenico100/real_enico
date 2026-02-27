'use client';

import { useState, type ReactNode } from 'react';

interface GoogleLoginButtonProps {
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
  onLogin?: () => Promise<void> | void;
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12Z"
      />
      <path
        fill="#FBBC05"
        d="M3.6 7.7l3.2 2.3C7.7 7.8 9.7 6.3 12 6.3c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5c-3.6 0-6.7 2-8.4 5.2Z"
      />
      <path
        fill="#34A853"
        d="M12 21.5c2.5 0 4.7-.8 6.2-2.3l-2.9-2.4c-.8.6-1.8 1.1-3.3 1.1-4 0-5.2-2.6-5.5-3.8l-3.2 2.5c1.7 3.3 5.1 4.9 8.7 4.9Z"
      />
      <path
        fill="#4285F4"
        d="M21.1 14.2c0-.5-.1-.9-.1-1.3H12v3.9h5.5c-.3 1.1-.9 1.9-1.3 2.4l2.9 2.4c1.7-1.6 2.7-4 2.7-7.4Z"
      />
    </svg>
  );
}

export default function GoogleLoginButton({
  className,
  disabled,
  children,
  onLogin,
}: GoogleLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const login = async () => {
    if (disabled || isLoading) return;
    if (!onLogin) return;

    setIsLoading(true);
    try {
      await onLogin();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={login}
      disabled={disabled || isLoading || !onLogin}
      className={className ?? 'inline-flex items-center gap-3 px-4 py-2 border border-[#333] bg-[#111] text-white'}
      type="button"
      aria-label="구글 로그인"
    >
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.05)] shrink-0">
        <GoogleIcon />
      </span>
      {children ? children : <span>구글 로그인</span>}
    </button>
  );
}
