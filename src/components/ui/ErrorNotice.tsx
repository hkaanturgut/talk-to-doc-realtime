export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
    >
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-2 min-h-11 min-w-11 rounded-lg p-2 text-red-700 dark:text-red-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
