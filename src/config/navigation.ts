export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
  /** Shown in the bottom navigation (primary destinations) */
  primary?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Primary destinations — shown in the Bottom Navigation (mobile). */
export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", primary: true },
  { label: "Calendar", href: "/schedule", icon: "calendar", primary: true },
  { label: "To-Do List", href: "/todo", icon: "check-square", primary: true },
  { label: "Syllabus", href: "/syllabus", icon: "book-open", primary: true, adminOnly: true },
];

/**
 * Sidebar (Navigation Drawer) groups.
 * The primary destinations are NOT listed here — they live in the Bottom Nav
 * (mobile) and are added back to the drawer only on desktop, where there is
 * no bottom nav. Account actions stay in the user menu.
 */
export const navGroups: NavGroup[] = [
  {
    title: "Tools",
    items: [
      { label: "Notes", href: "/notes", icon: "sticky-note" },
      { label: "Pomodoro", href: "/pomodoro", icon: "timer" },
      { label: "Chika", href: "/news", icon: "newspaper", adminOnly: true },
      { label: "Notifications", href: "/notifications", icon: "bell" },
      { label: "GWA Calculator", href: "/gwa", icon: "graduation-cap" },
    ],
  },
];

// Flattened, deduped list of every sidebar destination (primary + Tools), for
// the desktop AppNavPanel which shows everything.
export const mainNav: NavItem[] = [
  ...primaryNav,
  ...navGroups.flatMap((g) => g.items),
].filter(
  (item, i, arr) => arr.findIndex((x) => x.href === item.href) === i
);
