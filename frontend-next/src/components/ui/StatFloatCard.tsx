import Link from "next/link";

export default function StatFloatCard({
  title,
  value,
  href,
  className = "",
}: {
  title: string;
  value: string;
  href?: string;
  className?: string;
}) {
  const card = (
    <div className={`stat-float-card ${className}`}>
      <span className="stat-float-card__label">{title}</span>
      <strong className="stat-float-card__value">{value}</strong>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="stat-float-card__link pointer-events-auto">
        {card}
      </Link>
    );
  }

  return card;
}
