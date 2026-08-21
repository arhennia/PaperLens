"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface FolderItem {
  id: string;
  name: string;
  subject: string | null;
}

interface SideNavProps {
  folders?: FolderItem[];
  currentFolderId?: string;
}

export function SideNav({ currentFolderId }: SideNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "materials";

  // Determine active item
  const isHome = pathname === "/" || pathname === "/login";
  const isFolder = pathname.startsWith("/folders");

  const targetFolderId =
    currentFolderId ||
    (isFolder ? pathname.split("/")[2] : null) ||
    "cs-201-dsa";

  const navItems = [
    {
      id: "home",
      href: "/",
      label: "Home / Exam Hub",
      icon: "home",
      isActive: isHome,
    },
    {
      id: "materials",
      href: `/folders/${targetFolderId}?tab=materials`,
      label: "Subject Materials",
      icon: "folder_open",
      isActive: isFolder && currentTab === "materials",
    },
    {
      id: "analysis",
      href: `/folders/${targetFolderId}?tab=analysis`,
      label: "Analysis Hub",
      icon: "search",
      isActive: isFolder && currentTab === "analysis",
    },
    {
      id: "checklist",
      href: `/folders/${targetFolderId}?tab=checklist`,
      label: "Practice Checklist",
      icon: "fact_check",
      isActive: isFolder && currentTab === "checklist",
    },
    {
      id: "mock-paper",
      href: `/folders/${targetFolderId}?tab=mock-paper`,
      label: "AI Mock Paper Generator",
      icon: "edit_note",
      isActive: isFolder && currentTab === "mock-paper",
    },
  ];

  return (
    <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-16 flex-col items-center border-r border-gray-200 bg-white py-4 shrink-0 z-30">
      <div className="flex flex-col items-center gap-4">
        {navItems.map((item) => {
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className={`flex h-10 w-10 items-center justify-center transition-all ${
                item.isActive
                  ? "rounded-lg border-2 border-[#0099FF] bg-[#EBF5FF] text-[#0099FF] shadow-xs"
                  : "rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">
                {item.icon}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
