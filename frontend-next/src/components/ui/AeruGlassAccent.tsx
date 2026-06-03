/**
 * Decorative aeruk-style glass shard (CSS). Sits behind UI, does not block clicks.
 */
export default function AeruGlassAccent() {
  return (
    <div className="aeru-glass-accent" aria-hidden>
      <div className="aeru-glass-accent__shard aeru-glass-accent__shard--a" />
      <div className="aeru-glass-accent__shard aeru-glass-accent__shard--b" />
      <div className="aeru-glass-accent__shard aeru-glass-accent__shard--c" />
    </div>
  );
}
