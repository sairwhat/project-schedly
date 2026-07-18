export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
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
    title: "Student Tools",
    items: [
      { label: "To-Do List", href: "/todo", icon: "check-square" },
      { label: "Reminders", href: "/reminders", icon: "bell-ring" },
      { label: "GPA Calculator", href: "/gpa", icon: "graduation-cap" },
      { label: "Pomodoro Timer", href: "/pomodoro", icon: "timer" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Notifications", href: "/notifications", icon: "bell" },
      { label: "Help & Feedback", href: "/feedback", icon: "life-buoy" },
    ],
  },
];

export const mainNav: NavItem[] = navGroups.flatMap((g) => g.items);
