export default function StorefrontLoading() {
  return (
    <div
      className="fixed inset-0 grid place-content-center gap-4 bg-[#f8f9fa] p-6 text-center font-mono text-[#111827]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="font-heading text-4xl font-black tracking-tighter">ENICO VECK</p>
      <p className="text-sm text-[#4b5563]">화면을 준비하고 있어요.</p>
    </div>
  );
}
