import { Link } from 'react-router-dom';
import SITE from '@/config/site';

/** Public footer: navigation, the risk disclaimer, and the Deriv disclosure. */
const Footer = () => (
    <footer className='border-t border-line bg-ink-900'>
        <div className='container-page grid gap-10 py-12 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]'>
            <div>
                <span className='wordmark text-lg text-fg'>
                    Trade<span className='text-mist-400'>Nexus</span>
                </span>
                <p className='mt-3 max-w-sm text-sm leading-relaxed text-mist-400'>
                    Set your stake, your target and your stop — then let {SITE.bots.basic}, {SITE.bots.recovery}{' '}
                    and {SITE.bots.pro} trade Deriv options while you get on with your day.
                </p>
            </div>

            <nav aria-label='Product'>
                <h2 className='label'>Product</h2>
                <ul className='mt-3 space-y-2 text-sm'>
                    <li>
                        <a href='/#bots' className='text-mist-400 transition-colors hover:text-fg'>
                            AI Bots
                        </a>
                    </li>
                    <li>
                        <a href='/#strategies' className='text-mist-400 transition-colors hover:text-fg'>
                            Strategies
                        </a>
                    </li>
                    <li>
                        <Link to='/pricing' className='text-mist-400 transition-colors hover:text-fg'>
                            Pricing
                        </Link>
                    </li>
                    <li>
                        <a href='/#faq' className='text-mist-400 transition-colors hover:text-fg'>
                            FAQ
                        </a>
                    </li>
                </ul>
            </nav>

            <div>
                <h2 className='label'>Support</h2>
                <ul className='mt-3 space-y-2 text-sm'>
                    <li>
                        <a
                            href={`mailto:${SITE.supportEmail}`}
                            className='text-mist-400 transition-colors hover:text-fg'
                        >
                            {SITE.supportEmail}
                        </a>
                    </li>
                    <li>
                        <a
                            href='https://deriv.com'
                            target='_blank'
                            rel='noreferrer noopener'
                            className='text-mist-400 transition-colors hover:text-fg'
                        >
                            Deriv.com
                        </a>
                    </li>
                </ul>
            </div>
        </div>

        <div className='border-t border-line'>
            <div className='container-page flex flex-col gap-3 py-6 text-[11px] leading-relaxed text-mist-500 sm:flex-row sm:items-center sm:justify-between'>
                <p>
                    © {new Date().getFullYear()} {SITE.name}. Not affiliated with, or endorsed by, Deriv.
                </p>
                <p className='max-w-xl sm:text-right'>
                    Trading carries risk. Automated strategies can lose money. Never trade with funds you cannot
                    afford to lose.
                </p>
            </div>
        </div>
    </footer>
);

export default Footer;
