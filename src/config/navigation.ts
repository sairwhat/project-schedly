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
  { label: "Schedule", href: "/schedule", icon: "calendar", primary: true },
  { label: "To-Do", href: "/todo", icon: "check-square", primary: true },
  { label: "Reminders", href: "/reminders", icon: "bell-ring", primary: true },
  { label: "Pomodoro", href: "/pomodoro", icon: "timer", primary: true },
];

/**
 * Sidebar (Navigation Drawer) groups.
 * On desktop these are shown in full (primary + secondary).
 * On mobile the primary items are omitted (they live in the Bottom Nav)
 * and account actions stay in the user menu.
 */
export const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: primaryNav,
  },
  {
    title: "Tools",
    items: [
      { label: "Notes", href: "/notes", icon: "sticky-note" },
      { label: "GPA Calculator", href: "/gpa", icon: "graduation-cap" },
      { label: "Music", href: "/music", icon: "music" },
    ],
  },
];

export const mainNav: NavItem[] = [...primaryNav, ...navGroups.flatMap((g) => g.items)];
