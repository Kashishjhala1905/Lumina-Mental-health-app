import { useState, useRef, useEffect } from 'react';
import { User, LogOut, LayoutDashboard, ShieldCheck, History, MessageSquareHeart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { homeFor, ROLE_LABEL } from '@/lib/roles';

export default function ProfileDropdown({ align = 'right' }) {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside or pressing Escape
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", onKey);
        };
    }, [dropdownRef]);

    const handleLogout = async () => {
        setSigningOut(true);
        setIsOpen(false);
        // Ends the session, clears the account state and returns to the public homepage
        await logout();
        setSigningOut(false);
    };

    const itemClass = "group flex w-full items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground";

    return (
        <div className="relative ml-1" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative w-10 h-10 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 transition-all shadow-md flex items-center justify-center border-2 border-background ring-2 ring-primary/20"
                aria-label="User menu"
                aria-expanded={isOpen}
            >
                {user?.name ? (
                    <span className="text-lg font-bold">
                        {user.name.charAt(0).toUpperCase()}
                    </span>
                ) : (
                    <User className="w-5 h-5" />
                )}
            </button>

            {isOpen && (
                <div className={`absolute ${align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'} z-50 mt-2 w-56 rounded-md bg-popover shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-border`}>
                    <div className="py-1">
                        <div className="px-4 py-2 text-sm text-muted-foreground border-b border-border">
                            <p className="font-medium truncate text-foreground">{user?.name}</p>
                            <p className="truncate text-xs">{user?.username ? `@${user.username}` : user?.email}</p>
                            <p className="text-xs text-primary mt-0.5">{ROLE_LABEL[user?.role] || user?.role}</p>
                            {user?.counselorApplication?.status === 'pending' && (
                                <p className="text-xs text-amber-600 mt-0.5">Counselor application pending</p>
                            )}
                        </div>
                        <Link to={homeFor(user)} onClick={() => setIsOpen(false)} className={itemClass}>
                            <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" /> My Dashboard
                        </Link>
                        {user?.role === 'user' && (
                            <Link to="/history" onClick={() => setIsOpen(false)} className={itemClass}>
                                <History className="mr-2 h-4 w-4" aria-hidden="true" /> My History
                            </Link>
                        )}
                        {user?.role === 'user' && (
                            <Link to="/victim-support/dashboard" onClick={() => setIsOpen(false)} className={itemClass}>
                                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Victim Support
                            </Link>
                        )}
                        <Link to="/profile" onClick={() => setIsOpen(false)} className={itemClass}>
                            <User className="mr-2 h-4 w-4" aria-hidden="true" /> Profile & Security
                        </Link>
                        <Link to="/feedback" onClick={() => setIsOpen(false)} className={itemClass}>
                            <MessageSquareHeart className="mr-2 h-4 w-4" aria-hidden="true" /> Give Feedback
                        </Link>
                        <button onClick={handleLogout} disabled={signingOut} className={itemClass}>
                            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                            {signingOut ? 'Signing out...' : 'Sign out'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
