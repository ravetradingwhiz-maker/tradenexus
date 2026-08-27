import { useEffect, useState } from 'react';
import { Check, Crown } from 'lucide-react';
import { getPlan, type Plan } from '@/services/payments-api';
import { useSubscriptionOptional } from '@/context/SubscriptionContext';
import { shortDate } from '@/utils/format';

/** Static default, so the card renders instantly before the API answers. */
const FALLBACK: Plan = { label: 'Pro', priceUSD: 100, months: 12, term: '1 year' };

const PERKS = [
    'All four Pro bots unlocked',
    'Bulk trading up to 10 contracts at once',
    'Every free strategy stays free, forever',
    'Works on every login of your Deriv account',
    'Priority support',
];

/** The single plan. `onSelect` fires when the buyer wants to pay. */
const PricingPlans = ({ onSelect, ctaLabel = 'Get Pro' }: { onSelect: () => void; ctaLabel?: string }) => {
    const [plan, setPlan] = useState<Plan>(FALLBACK);
    const subscription = useSubscriptionOptional();

    useEffect(() => {
        getPlan()
            .then(setPlan)
            .catch(() => {
                /* keep the built-in default */
            });
    }, []);

    const active = subscription?.active;
    const perMonth = Math.round(plan.priceUSD / Math.max(1, plan.months));

    return (
        <div className='mx-auto grid max-w-4xl gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center'>
            {/* Price */}
            <div className='relative rounded-2xl border border-fg bg-ink-800 p-7'>
                {active && <span className='chip absolute -top-2.5 right-6 bg-ink-900'>Active</span>}

                <div className='flex items-center gap-2'>
                    <Crown size={16} className='text-fg' />
                    <h3 className='wordmark text-lg text-fg'>Nexus Bot Pro</h3>
                </div>

                <div className='mt-5 flex items-baseline gap-2'>
                    <span className='font-mono text-5xl font-extrabold text-fg'>${plan.priceUSD}</span>
                    <span className='text-sm text-mist-400'>/ {plan.term}</span>
                </div>
                <p className='mt-1.5 text-xs text-mist-500'>
                    Works out at about ${perMonth} a month. One payment, no renewals to forget.
                </p>

                {active && subscription?.expiresAt && (
                    <p className='mt-4 rounded-lg border border-line bg-ink-700 px-3 py-2 text-xs text-mist-300'>
                        You&apos;re covered until{' '}
                        <strong className='text-fg'>{shortDate(subscription.expiresAt)}</strong>. Paying again adds
                        another {plan.term}.
                    </p>
                )}

                <button type='button' onClick={onSelect} className='btn-solid mt-6 w-full py-3'>
                    {active ? `Add another ${plan.term}` : ctaLabel}
                </button>
                <p className='mt-2.5 text-center text-[11px] text-mist-500'>Card, M-Pesa or crypto.</p>
            </div>

            {/* What you get */}
            <div className='rounded-2xl border border-line bg-ink-800 p-7'>
                <h4 className='label'>What you unlock</h4>
                <ul className='mt-4 space-y-3'>
                    {PERKS.map(perk => (
                        <li key={perk} className='flex items-start gap-2.5 text-sm text-mist-200'>
                            <Check size={16} className='mt-0.5 shrink-0 text-fg' />
                            {perk}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default PricingPlans;
