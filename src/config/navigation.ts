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

/**
 * Sidebar (Navigation Drawer) groups — secondary tools, utilities,
 * personalization, and account management. Primary destinations
 * (Dashboard, Schedule, To-Do, Reminders, Pomodoro) live in the
 * Bottom Navigation and are excluded from the drawer.
 */
export const navGroups: NavGroup[] = [
  {
    title: "Tools",
    items: [
      { label: "Notes", href: "/notes", icon: "sticky-note" },
      { label: "GPA Calculator", href: "/gpa", icon: "graduation-cap" },
      { label: "Music", href: "/music", icon: "music" },
    ],
  },
];

/** Primary destinations — shown in the Bottom Navigation only. */
export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", primary: true },
  { label: "Schedule", href: "/schedule", icon: "calendar", primary: true },
  { label: "To-Do", href: "/todo", icon: "check-square", primary: true },
  { label: "Reminders", href: "/reminders", icon: "bell-ring", primary: true },
  { label: "Pomodoro", href: "/pomodoro", icon: "timer", primary: true },
];

export const mainNav: NavItem[] = [...primaryNav, ...navGroups.flatMap((g) => g.items)];
