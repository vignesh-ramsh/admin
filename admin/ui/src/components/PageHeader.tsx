import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-head__title">{title}</h1>
        {subtitle && <div className="page-head__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="inline">{actions}</div>}
    </div>
  );
}
