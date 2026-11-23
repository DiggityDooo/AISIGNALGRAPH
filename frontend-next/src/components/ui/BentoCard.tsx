export default function BentoCard({ title, value, description, href, metadata }: {
  title: string;
  value: string;
  description?: string;
  href: string;
  metadata?: string;
}) {
  // The detail document belongs to Flask, outside the static Next router.
  return (
    <a href={href} className="record-card">
      <span className="record-kind">{title.replaceAll("-", " ")} <span aria-hidden="true">↗</span></span>
      <h2>{value}</h2>
      {description && <p>{description}</p>}
      {metadata && <small className="directory-card-meta">{metadata}</small>}
    </a>
  );
}
