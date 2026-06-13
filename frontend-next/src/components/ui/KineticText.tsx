export default function KineticText({ text }: { text: string }) {
  const words = text.split(" ").filter(Boolean);

  return (
    <span className="hero-kinetic-text flex flex-wrap justify-center overflow-hidden">
      <span className="sr-only">{text}</span>
      {words.map((word, index) => (
        <span
          key={index}
          className="inline-block animate-hero-fade will-change-transform [transform:translate3d(0,0,0)]"
          aria-hidden="true"
          style={{
            marginRight: "0.25em",
            animationDelay: `${index * 70}ms`,
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
