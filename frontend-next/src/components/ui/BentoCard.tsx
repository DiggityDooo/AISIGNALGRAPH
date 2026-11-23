export default function BentoCard({ title, value, description, href }: {
  title: string;
  value: string;
  description?: string;
  href: string;
}) {
  // The detail document belongs to Flask, outside the static Next router.
  return (
    <a href={href} className="record-card">
      <span className="record-kind">{title.replaceAll("-", " ")} <span aria-hidden="true">↗</span></span>
      <h2>{value}</h2>
      {description && <p>{description}</p>}
    </a>
  );
}
