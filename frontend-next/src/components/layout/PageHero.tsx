import KineticText from "@/components/ui/KineticText";
import GlassButton from "@/components/ui/GlassButton";
import ScrollMouseIndicator from "@/components/ui/ScrollMouseIndicator";

export type PageHeroProps = {
  eyebrow: string;
  bgTitle?: string;
  title: string;
  description: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  compact?: boolean;
  showScroll?: boolean;
};

export default function PageHero({
  eyebrow,
  bgTitle = "AISIGNAL",
  title,
  description,
  primaryCta,
  secondaryCta,
  compact = false,
  showScroll = false,
}: PageHeroProps) {
  return (
    <section
      className={`hero-aeru relative w-full flex flex-col items-center justify-center px-6 ${
        compact ? "min-h-[42vh] pt-28 pb-16 pointer-events-auto" : "min-h-screen pb-28 pt-28 pointer-events-none"
      }`}
    >
      <div className="hero-aeru__bg-title" aria-hidden>
        {bgTitle}
      </div>

      <div className="hero-aeru__content pointer-events-auto text-center max-w-3xl mx-auto flex flex-col items-center gap-5 md:gap-7 animate-hero-fade">
        <p className="hero-aeru__eyebrow font-mono text-[10px] md:text-xs uppercase tracking-[0.35em] text-primary">
          {eyebrow}
        </p>
        <h1
          className={`hero-aeru__title font-display font-bold uppercase text-foreground ${
            compact
              ? "text-3xl sm:text-4xl md:text-5xl leading-tight tracking-[0.05em]"
              : "text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08] tracking-[0.06em]"
          }`}
        >
          <KineticText text={title} />
        </h1>
        <p className="hero-aeru__copy font-mono text-sm md:text-base text-muted max-w-xl leading-relaxed">
          {description}
        </p>
        {(primaryCta || secondaryCta) && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-1">
            {primaryCta && (
              <GlassButton primary glassPill href={primaryCta.href}>
                {primaryCta.label}
              </GlassButton>
            )}
            {secondaryCta && (
              <GlassButton glassPill href={secondaryCta.href}>
                {secondaryCta.label}
              </GlassButton>
            )}
          </div>
        )}
      </div>

      {showScroll && <ScrollMouseIndicator />}
    </section>
  );
}
