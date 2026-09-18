import {
    TradeTypesDigitsDiffersIcon,
    TradeTypesDigitsEvenIcon,
    TradeTypesDigitsMatchesIcon,
    TradeTypesDigitsOddIcon,
    TradeTypesDigitsOverIcon,
    TradeTypesDigitsUnderIcon,
    TradeTypesHighsAndLowsHigherIcon,
    TradeTypesHighsAndLowsHighIcon,
    TradeTypesHighsAndLowsLowerIcon,
    TradeTypesHighsAndLowsLowIcon,
    TradeTypesHighsAndLowsNoTouchIcon,
    TradeTypesHighsAndLowsTouchIcon,
    TradeTypesInsAndOutsEndsInIcon,
    TradeTypesInsAndOutsEndsOutIcon,
    TradeTypesUpsAndDownsFallIcon,
    TradeTypesUpsAndDownsOnlyDownsIcon,
    TradeTypesUpsAndDownsOnlyUpsIcon,
    TradeTypesUpsAndDownsRiseIcon,
} from '@deriv/quill-icons/TradeTypes';
import { IllustrativeMarketsIcon } from '@deriv/quill-icons/Illustrative';

/**
 * The contract's trade type as Deriv's own mark — an Over contract reads as the
 * Over glyph rather than the word, which is what lets a row stay one line.
 *
 * Imported directly rather than lazily: these are a few hundred bytes each and
 * they all appear in the same list, so a chunk per icon would cost more than it
 * saved.
 */
const ICONS: Record<string, typeof TradeTypesDigitsEvenIcon> = {
    CALL: TradeTypesUpsAndDownsRiseIcon,
    CALLE: TradeTypesUpsAndDownsRiseIcon,
    PUT: TradeTypesUpsAndDownsFallIcon,
    PUTE: TradeTypesUpsAndDownsFallIcon,
    HIGHER: TradeTypesHighsAndLowsHigherIcon,
    LOWER: TradeTypesHighsAndLowsLowerIcon,
    DIGITEVEN: TradeTypesDigitsEvenIcon,
    DIGITODD: TradeTypesDigitsOddIcon,
    DIGITOVER: TradeTypesDigitsOverIcon,
    DIGITUNDER: TradeTypesDigitsUnderIcon,
    DIGITMATCH: TradeTypesDigitsMatchesIcon,
    DIGITDIFF: TradeTypesDigitsDiffersIcon,
    ONETOUCH: TradeTypesHighsAndLowsTouchIcon,
    NOTOUCH: TradeTypesHighsAndLowsNoTouchIcon,
    EXPIRYRANGE: TradeTypesInsAndOutsEndsInIcon,
    EXPIRYMISS: TradeTypesInsAndOutsEndsOutIcon,
    TICKHIGH: TradeTypesHighsAndLowsHighIcon,
    TICKLOW: TradeTypesHighsAndLowsLowIcon,
    RUNHIGH: TradeTypesUpsAndDownsOnlyUpsIcon,
    RUNLOW: TradeTypesUpsAndDownsOnlyDownsIcon,
};

/**
 * `title` rather than a tooltip component: the label is what the row used to say
 * in words, so it still has to be readable somewhere, and a native title is the
 * one place that costs nothing and works on every input.
 */
const TradeTypeIcon = ({ type, label, size = 20 }: { type?: string; label: string; size?: number }) => {
    const Icon = (type && ICONS[type.toUpperCase()]) || IllustrativeMarketsIcon;
    return (
        <span className='flex shrink-0 items-center' title={label}>
            <Icon width={size} height={size} />
        </span>
    );
};

export default TradeTypeIcon;
