import { useState, useContext } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, Sun, Moon } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useAuth } from "../context/AuthContext";
import { ThemeContext } from "../context/ThemeContext";
import ProfileDropdown from "./ProfileDropdown";
import NotificationBell from "./NotificationBell";
import { ROLE_HOME } from "@/lib/roles";

const ROLE_LINK_LABEL = { user: "Dashboard", counselor: "Counselor", admin: "Admin" };

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { darkMode, setDarkMode } = useContext(ThemeContext);

  const links = [
    { href: "/", label: "Home" },
    { href: "/chatbot", label: "AI Chat" },
    { href: "/assessment", label: "Assessment" },
    { href: "/resources", label: "Resources" },
    { href: "/community", label: "Community" },
    { href: "/counseling", label: "Counseling" },
    { href: "/victim-support", label: "Victim Support" },
    { href: "/emergency", label: "Emergency" },
  ];
  // Role-specific dashboard link (the Admin link is no longer shown to everyone)
  if (user && ROLE_HOME[user.role]) {
    links.push({ href: ROLE_HOME[user.role], label: ROLE_LINK_LABEL[user.role] });
  }

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium text-foreground dark:text-white hover:bg-gradient-primary hover:text-white transition-all duration-300 ${isActive ? "bg-primary/10" : ""}`;

  return (
    <nav className="sticky top-0 z-50 bg-card/80 dark:bg-[#111827]/90 backdrop-blur-md border-b border-border shadow-lg transition-colors duration-300 transform-none hover:scale-100">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-gradient-primary focus:text-white">
        Skip to content
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-xl" aria-label="Lumina home">
            <BrandLogo size="md" alt="" />
            <span className="gradient-text">Lumina</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden xl:flex gap-1 items-center">
            {links.map((link) => (
              <NavLink key={link.href} to={link.href} end={link.href === "/"} className={linkClass}>
                {link.label}
              </NavLink>
            ))}

            {/* 🌙 Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-foreground dark:text-white hover:bg-primary/10 dark:hover:bg-gray-700 transition-colors"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-yellow-400 transition" />
              ) : (
                <Moon className="w-5 h-5 text-purple-500 transition" />
              )}
            </button>

            {user ? (
              <>
                <NotificationBell />
                <ProfileDropdown />
              </>
            ) : (
              <div className="flex items-center gap-1 ml-1">
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-foreground dark:text-white hover:bg-gradient-primary hover:text-white transition-all duration-300"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-primary text-white shadow-md hover:opacity-90 transition-all duration-300"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile / tablet controls */}
          <div className="xl:hidden flex items-center gap-1">
            {user && <NotificationBell />}
            <button
              className="p-2 rounded-lg text-foreground dark:text-white hover:bg-primary/10 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="xl:hidden pb-4 space-y-2">
            {links.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                end={link.href === "/"}
                className={(state) => `block ${linkClass(state)}`}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}

            {/* Mobile Dark Toggle */}
            <button
              onClick={() => {
                setDarkMode(!darkMode);
                setIsOpen(false);
              }}
              className="block w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-foreground dark:text-white hover:bg-primary/10 dark:hover:bg-gray-700 transition-colors"
            >
              {darkMode ? (
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-yellow-400" />
                  Light Mode
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-purple-500" />
                  Dark Mode
                </div>
              )}
            </button>

            {!user && (
              <div className="flex gap-2 px-1">
                <Link
                  to="/login"
                  className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground dark:text-white hover:bg-gradient-primary hover:text-white transition-all duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-medium bg-gradient-primary text-white hover:opacity-90 transition-all duration-300"
                  onClick={() => setIsOpen(false)}
                >
                  Sign Up
                </Link>
              </div>
            )}

            {user && (
              <div className="px-4 py-2">
                <ProfileDropdown align="left" />
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
