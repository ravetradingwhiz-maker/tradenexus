import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Common frame for the admin screens: back link, title, and a content card. */
const AdminShell = ({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
}) => (
    <div className='container-page flex flex-col gap-5 py-8'>
        <div>
            <Link
                to='/app'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-mist-500 transition-colors hover:text-fg'
            >
                <ArrowLeft size={13} /> Back to the bots
            </Link>
            <div className='mt-3 flex flex-wrap items-end justify-between gap-3'>
                <div>
                    <h1 className='wordmark text-2xl text-fg'>{title}</h1>
                    {description && <p className='mt-1 text-sm text-mist-400'>{description}</p>}
                </div>
                {actions}
            </div>
        </div>
        {children}
    </div>
);

export default AdminShell;
