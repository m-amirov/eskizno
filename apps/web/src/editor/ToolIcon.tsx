type ToolIconName = 'brush' | 'eraser' | 'bucket' | 'shapes' | 'palette' | 'eyedropper' | 'download' | 'undo' | 'redo'
  | 'trash' | 'maximize' | 'minimize' | 'plus' | 'minus' | 'reset' | 'chevron' | 'more' | 'grip';

/** Small, dependency-free line icons. The containing button supplies the accessible name. */
export function ToolIcon({ name }: { name: ToolIconName }) {
  const path = {
    brush: <><path d="M13.5 6.5 17 3a2.1 2.1 0 0 1 3 3l-3.5 3.5" /><path d="m13.5 6.5 4 4-8.2 8.2c-1.4 1.4-3.6 1.2-4.8.9 0-1.9-.5-3.4.9-4.8Z" /><path d="m11 9 4 4" /></>,
    eraser: <><path d="m20 13-7.5 7.5H6L2.5 17a2 2 0 0 1 0-2.8l9.7-9.7a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8Z" /><path d="m9 8 8 8M12.5 20.5H21" /></>,
    bucket: <><path d="m12 3 8.5 8.5a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1 0-2.8Z" /><path d="M3.5 12h16M19.5 18.5s-1.5 2-1.5 3a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3Z" /></>,
    shapes: <><rect x="2.5" y="3" width="11" height="11" rx="1.5" /><circle cx="17" cy="16.5" r="5" /><path d="M3 20.5h7" /></>,
    palette: <><path d="M12 2a10 10 0 0 0 0 20h1.1a2.5 2.5 0 0 0 1.7-4.3 1.5 1.5 0 0 1 1.1-2.6H19a3 3 0 0 0 3-3A10 10 0 0 0 12 2Z" /><circle cx="7" cy="10" r="1" /><circle cx="11" cy="6" r="1" /><circle cx="16" cy="7.5" r="1" /></>,
    eyedropper: <><path d="m2 22 6-2 10.5-10.5a2.6 2.6 0 0 0 0-3.7l-.3-.3a2.6 2.6 0 0 0-3.7 0L4 16Z" /><path d="m11 9 4 4m1.5-9.5 3-3 4 4-3 3" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
    undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 0 14h-2" /></>,
    redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a7 7 0 0 0 0 14h2" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
    maximize: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></>,
    minimize: <><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    reset: <><path d="M3 11a9 9 0 1 1 2 7" /><path d="M3 4v7h7" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    grip: <><circle cx="8" cy="5" r="1.1" /><circle cx="16" cy="5" r="1.1" /><circle cx="8" cy="12" r="1.1" /><circle cx="16" cy="12" r="1.1" /><circle cx="8" cy="19" r="1.1" /><circle cx="16" cy="19" r="1.1" /></>,
  } satisfies Record<ToolIconName, React.ReactNode>;
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {path[name]}
  </svg>;
}
