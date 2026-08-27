import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

/** Flips the monochrome system between black-on-white and white-on-black. */
const ThemeToggle = () => {
    const { theme, toggle } = useTheme();
    const next = theme === 'dark' ? 'light' : 'dark';

    return (
        <button
            type='button'
            onClick={toggle}
            title={`Switch to ${next} theme`}
            aria-label={`Switch to ${next} theme`}
            className='flex h-9 w-9 items-center justify-center rounded-lg border border-line text-mist-300 transition-colors hover:border-line-strong hover:text-fg'
        >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
};

export default ThemeToggle;
