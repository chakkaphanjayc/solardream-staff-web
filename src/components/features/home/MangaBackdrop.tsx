export default function MangaBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#F0EEE9]">
      <div className="absolute inset-0 bg-[linear-gradient(155deg,#e9f2f4_0%,#f0eee9_48%,#f3e7d7_100%)]" />
      <div className="absolute inset-0 opacity-[0.32] [background-image:radial-gradient(circle_at_72%_14%,rgba(255,235,175,0.42),transparent_27%),radial-gradient(circle_at_25%_75%,rgba(183,209,234,0.22),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(245,242,235,0.1),rgba(240,238,233,0.5)_68%,rgba(240,238,233,0.9))]" />
    </div>
  );
}
