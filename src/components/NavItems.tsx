"use client";
import { NAV_ITEMS } from "../constants";
import { Link, useLocation } from "react-router-dom";

interface NavItemsProps {
  onNavigate?: () => void;
}

const NavItems = ({ onNavigate }: NavItemsProps) => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium">
      {NAV_ITEMS.map(({ href, label }) => (
        <li key={href}>
          <Link
            to={href}
            onClick={onNavigate}
            className={`hover:text-orange-500 transition-colors ${
              isActive(href) ? "text-gray-100" : ""
            }`}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default NavItems;
