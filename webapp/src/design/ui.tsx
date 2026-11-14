import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Search,
  Upload,
  Download,
  X,
} from "lucide-react";
export function Button({
  children,
  variant = "primary",
  busy = false,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy}
      className={`ds-button ds-${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="ds-spin" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generated = useId(),
    id = props.id ?? generated;
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-help` : undefined}
        className="ds-input"
      />
      {(error || hint) && (
        <small id={`${id}-help`} className={error ? "ds-error-text" : ""}>
          {error || hint}
        </small>
      )}
    </div>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      <select {...props} id={id} className="ds-input">
        {children}
      </select>
    </div>
  );
}
export function Textarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      <textarea {...props} id={id} className="ds-input" />
    </div>
  );
}
export function Choice({
  label,
  type = "checkbox",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="ds-choice">
      <input {...props} type={type} />
      {label}
    </label>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`ds-badge ds-badge-${tone}`}>
      {tone === "success" && <Check size={12} />}
      {children}
    </span>
  );
}
export function Card({
  children,
  className = "",
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`ds-card ${className}`}>
      {title && (
        <header className="ds-card-header">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
export function EmptyState({
  title = "Tout est prêt pour la suite.",
  description = "Ce module sera disponible dans une prochaine étape.",
  icon = <Inbox size={25} />,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <span className="ds-empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="ds-feedback" role="alert">
      <AlertCircle size={23} />
      <h2>Impossible de charger cet espace.</h2>
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
export function AccessDenied() {
  return (
    <section>
      <h1>Accès refusé</h1>
      <EmptyState
        title="Cet accès n’est pas autorisé."
        description="Choisissez un module correspondant à vos permissions actuelles, ou vérifiez vos affiliations."
        icon={<LockKeyhole size={26} />}
      />
    </section>
  );
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Chargement" className="ds-skeletons">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ds-skeleton" />
      ))}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  label = "Rechercher un module",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="ds-search">
      <Search size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
      />
    </label>
  );
}
/** Native dialog supplies focus trapping, Escape and inert background; restores the trigger on close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`ds-dialog ${drawer ? "ds-drawer" : ""}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-dialog-title">
        <h2 id={id}>{title}</h2>
        <Button variant="ghost" aria-label="Fermer" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p>{description}</p>
      <div className="ds-actions">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>
          Confirmer
        </Button>
      </div>
    </Dialog>
  );
}
/** Disclosure popover keeps native keyboard semantics; links remain regular navigation links. */
export function Popover({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={ref}
      className="ds-popover"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          ref.current?.removeAttribute("open");
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>{label}</summary>
      <div
        className="ds-popover-panel"
        onClick={() => ref.current?.removeAttribute("open")}
      >
        {children}
      </div>
    </details>
  );
}
export function Tabs({
  items,
  selected,
  onChange,
}: {
  items: { id: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ds-tabs" role="group" aria-label="Choisir une vue">
      {items.map((item) => (
        <button
          key={item.id}
          aria-pressed={selected === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="ds-pagination" aria-label="Pagination">
      <Button
        variant="ghost"
        aria-label="Page précédente"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeft size={16} />
      </Button>
      <span>
        Page {page} sur {Math.max(1, pages)}
      </span>
      <Button
        variant="ghost"
        aria-label="Page suivante"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        <ArrowRight size={16} />
      </Button>
    </nav>
  );
}
export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: ReactNode[][];
  caption: string;
}) {
  return (
    <div
      className="ds-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="ds-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  title="Aucune donnée disponible pour le moment."
                  description="Le module n’est pas encore connecté à des données métier."
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Stat({
  label,
  value,
  detail = "Disponible prochainement",
}: {
  label: string;
  value?: number | string;
  detail?: string;
}) {
  return (
    <div className="ds-stat">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{detail}</small>
    </div>
  );
}
/** No invented series: only draws actual caller-supplied non-negative values. */
export function Chart({
  title,
  values,
}: {
  title: string;
  values?: { label: string; value: number }[];
}) {
  const data = values?.filter((v) => Number.isFinite(v.value) && v.value >= 0),
    max = Math.max(1, ...(data?.map((v) => v.value) ?? []));
  return (
    <Card
      title={title}
      action={
        <Badge>{data?.length ? "Période sélectionnée" : "À venir"}</Badge>
      }
    >
      {data?.length ? (
        <div
          className="ds-chart"
          role="img"
          aria-label={data.map((v) => `${v.label} : ${v.value}`).join(", ")}
        >
          {data.map((v) => (
            <div key={v.label}>
              <span style={{ height: `${(v.value / max) * 140}px` }} />
              <small>{v.label}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="ds-chart-empty">
          <div className="ds-chart-grid" />
          <span>Aucune série disponible</span>
          <small>Les tendances apparaîtront avec les premières données.</small>
        </div>
      )}
    </Card>
  );
}
export function ImportExport({
  enabled = false,
  onImport,
  onExport,
}: {
  enabled?: boolean;
  onImport?: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="ds-actions">
      <Button
        variant="secondary"
        disabled={!enabled || !onImport}
        title={!enabled ? "Disponible avec le futur module métier" : undefined}
        onClick={onImport}
      >
        <Upload size={15} />
        Importer
      </Button>
      <Button
        variant="secondary"
        disabled={!enabled || !onExport}
        title={!enabled ? "Disponible avec le futur module métier" : undefined}
        onClick={onExport}
      >
        <Download size={15} />
        Exporter
      </Button>
    </div>
  );
}
export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [message, onDismiss]);
  return message ? (
    <div className="ds-toast" role="status">
      <Check size={17} />
      <span>{message}</span>
      <button aria-label="Fermer la notification" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  ) : null;
}
export function Permission({
  permissions,
  requires,
  children,
}: {
  permissions: readonly string[];
  requires: string;
  children: ReactNode;
}) {
  return permissions.includes(requires) ? children : null;
}
export function DemoDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ouvrir un dialogue
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Exemple de dialogue"
      >
        <p>Composant de présentation. Aucune donnée métier n’est modifiée.</p>
        <Button onClick={() => setOpen(false)}>Fermer</Button>
      </Dialog>
    </>
  );
}
