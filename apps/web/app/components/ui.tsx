"use client";
import {
  Children,
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export function Icon({
  name = "grid",
  size = 20,
}: {
  name?: string | undefined;
  size?: number;
}) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    mandate: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5",
    agent:
      "M5 8h14v12H5z M9 12v2 M15 12v2 M9 17h6 M12 8V4 M10 4h4 M2 12h3 M19 12h3",
    shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
    check: "M5 12l4 4L19 6",
    wallet: "M3 6h17v14H3z M3 6V3h14v3 M15 11h6v5h-6z",
    payment: "M3 7h18v13H3z M3 11h18 M7 16h4 M7 3h10",
    settings: "M5 3v18 M19 3v18 M12 3v18 M2 8h6 M9 16h6 M16 9h6",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    close: "M6 6l12 12 M18 6L6 18",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    alert: "M12 3L2 21h20z M12 9v5 M12 17v1",
    clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow ?? "Workspace"}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
export function Card({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon?: string;
}) {
  return (
    <article className="metric">
      <div className="metric-heading">
        <span>{label}</span>
        <Icon name={icon} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="mandate" size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function LoadingState({
  label = "Loading workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <span>{label}</span>
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
export function Feedback({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`feedback ${error ? "error" : ""}`}
    >
      <Icon name={error ? "alert" : "check"} />
      <div>{children}</div>
    </div>
  );
}
export function TechnicalDetails({
  children,
  title = "Technical details",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <details className="technical">
      <summary>{title}</summary>
      {children}
    </details>
  );
}
export function Timeline({
  items,
}: {
  items: { id: string; title: string; detail: ReactNode }[];
}) {
  return (
    <ol className="timeline">
      {items.map((i) => (
        <li key={i.id}>
          <span className="timeline-dot" />
          <div>
            <strong>{i.title}</strong>
            <div>{i.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ).filter((node) => node.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <strong>{title}</strong>
        <button
          type="button"
          className="icon-button secondary"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const WizardContext = createContext<{ values: [string, string][] }>({
  values: [],
});
export function FormReview() {
  const { values } = useContext(WizardContext);
  return (
    <dl className="review-summary">
      {values.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function GuidedForm({
  steps,
  children,
  onSubmit,
  busy = false,
}: {
  steps: string[];
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
}) {
  const [step, setStep] = useState(0),
    [values, setValues] = useState<[string, string][]>([]);
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const panels = Children.toArray(children);
  function navigate(next: number) {
    const fields = Array.from(
      form.current?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea") ?? [],
    );
    setValues(
      fields
        .filter((f) => f.name && f.type !== "file")
        .map((f) => [
          f.labels?.[0]?.textContent?.trim() || f.name,
          f instanceof HTMLInputElement && f.type === "checkbox"
            ? f.checked
              ? "Yes"
              : "No"
            : f instanceof HTMLSelectElement
              ? (f.selectedOptions[0]?.textContent ?? f.value)
              : f.value || "Not supplied",
        ]),
    );
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function validate(all = false) {
    const fields = form.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      all
        ? "input,select,textarea"
        : `[data-step="${step}"] input,[data-step="${step}"] select,[data-step="${step}"] textarea`,
    );
    const invalid = Array.from(fields ?? []).find((f) => !f.validity.valid);
    if (!invalid) return true;
    const target = Number(
      invalid.closest("[data-step]")?.getAttribute("data-step"),
    );
    navigate(target);
    requestAnimationFrame(() => {
      invalid.focus();
      invalid.reportValidity();
    });
    return false;
  }
  return (
    <form
      ref={form}
      className="guided-form"
      noValidate
      onSubmit={(e) => {
        if (step < steps.length - 1) {
          e.preventDefault();
          if (validate()) navigate(step + 1);
          return;
        }
        if (!validate(true)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
    >
      <ol className="stepper" aria-label="Form progress">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            data-complete={i < step}
          >
            <span>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      <h3 ref={heading} tabIndex={-1} className="step-title">
        <span>
          Step {step + 1} of {steps.length}
        </span>
        {steps[step]}
      </h3>
      <WizardContext.Provider value={{ values }}>
        {panels.map((panel, i) => (
          <div
            key={steps[i]}
            data-step={i}
            hidden={i !== step}
            className="step-panel"
          >
            {panel}
          </div>
        ))}
      </WizardContext.Provider>
      <div className="wizard-actions">
        {step > 0 && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => navigate(step - 1)}
          >
            Back
          </button>
        )}
        {step < steps.length - 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (validate()) navigate(step + 1);
            }}
          >
            Continue <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
    </form>
  );
}

export function TransactionSummary({
  entries,
}: {
  entries: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="review-summary">
      {entries.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
