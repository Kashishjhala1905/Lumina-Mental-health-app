import { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";
import { Sun, Moon } from "lucide-react";

const ThemeToggle = () => {
  const { darkMode, setDarkMode } = useContext(ThemeContext);

  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="p-2 rounded-full transition 
                 hover:bg-muted 
                 dark:hover:bg-dark-muted"
    >
      {darkMode ? (
        <Sun className="w-5 h-5 text-yellow-400 transition" />
      ) : (
        <Moon className="w-5 h-5 text-purple-500 transition" />
      )}
    </button>
  );
};

export default ThemeToggle;