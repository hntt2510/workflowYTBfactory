import type { ReactNode } from "react";
import { creatorBlockingMessage } from "../creatorStudioCopy";

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {props.eyebrow ? <p className="eyebrow">{props.eyebrow}</p> : null}
        <h1>{props.title}</h1>
        {props.description ? <p className="page-description">{props.description}</p> : null}
      </div>
      {props.actions ? <div className="header-actions">{props.actions}</div> : null}
    </header>
  );
}

export function SectionCard(props: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`section-card ${props.className ?? ""}`.trim()}>
      {props.title || props.description ? (
        <div className="section-card-header">
          {props.title ? <h2>{props.title}</h2> : null}
          {props.description ? <p>{props.description}</p> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function MetricCard(props: { label: string; value: string | number; detail?: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? <small className={`tone-${props.tone ?? "default"}`}>{props.detail}</small> : null}
    </div>
  );
}

export function StatusBadge(props: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" | "demo" }) {
  return <span className={`status-badge tone-${props.tone ?? "default"}`}>{props.children}</span>;
}

export function EmptyState(props: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{props.title}</h3>
      <p>{props.detail}</p>
      {props.action ? <div>{props.action}</div> : null}
    </div>
  );
}

export function DisabledAction(props: { children: ReactNode; reason: string }) {
  const reason = creatorBlockingMessage(props.reason);
  return (
    <button className="button secondary" type="button" disabled title={reason} aria-label={`${String(props.children)} chưa sẵn sàng: ${reason}`}>
      {props.children}
    </button>
  );
}

export function FormField(props: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <label className="form-field" htmlFor={props.htmlFor}>
      <span>{props.label}</span>
      {props.children}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

export function TagList(props: { items: string[]; limit?: number }) {
  const limit = props.limit ?? props.items.length;
  const visible = props.items.slice(0, limit);
  const hidden = props.items.length - visible.length;
  return (
    <div className="tag-list">
      {visible.map((item) => (
        <span key={item}>{item}</span>
      ))}
      {hidden > 0 ? <span>+{hidden}</span> : null}
    </div>
  );
}

export function ScoreBar(props: { value: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(props.value * 10)));
  return (
    <div className="score-bar" aria-label={props.label ? `${props.label}: ${percent}%` : `${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function DataTable(props: { children: ReactNode; label: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={props.label} tabIndex={0}>
      <table className="data-table">{props.children}</table>
    </div>
  );
}

export function SettingsList(props: { items: Array<[string, string]> }) {
  return (
    <dl className="settings-list">
      {props.items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
