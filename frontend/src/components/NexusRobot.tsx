/**
 * The Nexus AI figure — an original line-art android, drawn to sit inside the
 * monochrome system rather than fight it.
 *
 * Everything is built from theme tokens (`fg`, `ink`, `line`), so it inverts
 * with the light theme like the rest of the page. The floating chips carry
 * digits on purpose: the last digit is what most of the strategies actually
 * trade, so the motif says what the product does.
 */
const NexusRobot = ({ className = '' }: { className?: string }) => (
    <svg
        viewBox='0 0 420 480'
        className={className}
        role='img'
        aria-label='An android studying live market data'
    >
        {/* Hairline grid, echoing the section background */}
        <defs>
            <pattern id='nx-grid' width='28' height='28' patternUnits='userSpaceOnUse'>
                <path d='M28 0H0V28' fill='none' className='stroke-line' strokeWidth='1' />
            </pattern>
            <linearGradient id='nx-fade' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='white' stopOpacity='0.5' />
                <stop offset='100%' stopColor='white' stopOpacity='0' />
            </linearGradient>
            <mask id='nx-grid-mask'>
                <rect width='420' height='480' fill='url(#nx-fade)' />
            </mask>
        </defs>
        <rect width='420' height='480' fill='url(#nx-grid)' mask='url(#nx-grid-mask)' opacity='0.7' />

        {/* Antenna */}
        <line x1='210' y1='44' x2='210' y2='72' className='stroke-line-strong' strokeWidth='3' />
        <circle cx='210' cy='38' r='7' className='fill-fg' />

        {/* Head */}
        <rect x='138' y='68' width='144' height='122' rx='40' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />
        {/* Visor */}
        <rect x='159' y='104' width='102' height='40' rx='20' className='fill-fg' />
        <circle cx='184' cy='124' r='7' className='fill-ink-900' />
        <circle cx='236' cy='124' r='7' className='fill-ink-900' />
        {/* Mouth grille */}
        <rect x='190' y='160' width='40' height='6' rx='3' className='fill-line-strong' />
        {/* Ear pods */}
        <rect x='124' y='108' width='16' height='44' rx='8' className='fill-line-strong' />
        <rect x='280' y='108' width='16' height='44' rx='8' className='fill-line-strong' />

        {/* Neck */}
        <rect x='194' y='188' width='32' height='22' className='fill-line-strong' />

        {/* Torso */}
        <rect x='116' y='206' width='188' height='168' rx='34' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />

        {/* Chest panel — a tiny tick chart, which is what it is watching */}
        <rect x='152' y='240' width='116' height='84' rx='16' className='fill-ink-900 stroke-line' strokeWidth='2' />
        <polyline
            points='166,300 184,286 200,296 216,266 232,278 252,254'
            fill='none'
            className='stroke-fg'
            strokeWidth='3'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
        <circle cx='252' cy='254' r='5' className='fill-fg' />

        {/* Arms */}
        <rect x='84' y='222' width='28' height='118' rx='14' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />
        <rect x='308' y='222' width='28' height='118' rx='14' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />

        {/* Waist + legs */}
        <rect x='168' y='374' width='84' height='20' rx='10' className='fill-line-strong' />
        <rect x='160' y='394' width='36' height='54' rx='16' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />
        <rect x='224' y='394' width='36' height='54' rx='16' className='fill-ink-700 stroke-line-strong' strokeWidth='2' />

        {/* Ground shadow */}
        <ellipse cx='210' cy='456' rx='96' ry='10' className='fill-line' />

        {/* Floating digit chips — the last-digit motif the bots trade on */}
        <g className='fill-ink-800 stroke-line-strong' strokeWidth='2'>
            <circle cx='58' cy='120' r='26' />
            <circle cx='366' cy='196' r='22' />
            <circle cx='74' cy='372' r='20' />
        </g>
        <g className='fill-fg' fontFamily='ui-monospace, monospace' fontWeight='700' textAnchor='middle'>
            <text x='58' y='129' fontSize='22'>
                3
            </text>
            <text x='366' y='204' fontSize='19'>
                7
            </text>
            <text x='74' y='379' fontSize='17'>
                9
            </text>
        </g>
    </svg>
);

export default NexusRobot;
