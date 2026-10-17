const PATHS = {
  pdf: "M6 2h9l5 5v15H6V2zm9 0v5h5M9 13h6M9 17h6M9 9h2",
  youtube:
    "M3 7.5C3 6 4 5 5.5 5h13C20 5 21 6 21 7.5v9c0 1.5-1 2.5-2.5 2.5h-13C4 19 3 18 3 16.5v-9zM10 9l5 3-5 3V9z",
  text: "M5 5h14M5 10h14M5 15h9M5 20h6",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  micOff:
    "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3",
  stop: "M7 7h10v10H7z",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  close: "M6 6l12 12M18 6L6 18",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3h16v-3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
