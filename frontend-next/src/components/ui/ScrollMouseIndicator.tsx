export default function ScrollMouseIndicator() {
  return (
    <a
      href="#archives"
      className="scroll-mouse pointer-events-auto"
      aria-label="Scroll to archives"
    >
      <span className="scroll-mouse__shell" aria-hidden>
        <span className="scroll-mouse__dot" />
      </span>
      <span className="scroll-mouse__label">Scroll</span>
    </a>
  );
}
