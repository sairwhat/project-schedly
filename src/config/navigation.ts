export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
      { label: "Schedule", href: "/schedule", icon: "calendar" },

    ],
  },
  {
    title: "Productivity",
    items: [
      { label: "To-Do List", href: "/todo", icon: "check-square" },
      { label: "Reminders", href: "/reminders", icon: "bell-ring" },
      { label: "Pomodoro Timer", href: "/pomodoro", icon: "timer" },
      { label: "Notes", href: "/notes", icon: "sticky-note" },
      { label: "Music", href: "/music", icon: "music" },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "GPA Calculator", href: "/gpa", icon: "graduation-cap" },
    ],
  },
];

export const mainNav: NavItem[] = navGroups.flatMap((g) => g.items);
