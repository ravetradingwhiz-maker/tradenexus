/**
 * The Nexus AI mark — a four-point star drawn with concave sides, so it reads
 * as a spark rather than a rating star. Inherits `currentColor`, which is what
 * lets it sit on either the light or the dark surface unchanged.
 */
const NexusMark = ({ size = 24 }: { size?: number }) => (
    <svg viewBox='0 0 24 24' width={size} height={size} fill='currentColor' aria-hidden='true'>
        <path d='M12 0c.5 5.9 6.1 11.5 12 12-5.9.5-11.5 6.1-12 12-.5-5.9-6.1-11.5-12-12C5.9 11.5 11.5 5.9 12 0z' />
    </svg>
);

export default NexusMark;
