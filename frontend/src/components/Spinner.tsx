/** Monochrome loading indicator — a rotating arc, no colour. */
const Spinner = ({ size = 28 }: { size?: number }) => (
    <span
        role='status'
        aria-label='Loading'
        className='inline-block animate-spin rounded-full border-2 border-line border-t-fg'
        style={{ width: size, height: size }}
    />
);

export default Spinner;
