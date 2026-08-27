import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import { getAdminPlan, setAdminPlan } from '@/services/admin-api';
import type { Plan } from '@/services/payments-api';

/** Price and duration of the single subscription. Stored server-side. */
const AdminPricing = () => {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [defaults, setDefaults] = useState<{ priceUSD: number; months: number } | null>(null);
    const [priceUSD, setPriceUSD] = useState(100);
    const [months, setMonths] = useState(12);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getAdminPlan()
            .then(res => {
                setPlan(res.plan);
                setDefaults(res.defaults);
                setPriceUSD(res.plan.priceUSD);
                setMonths(res.plan.months);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load the plan.'))
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await setAdminPlan({ priceUSD, months });
            setPlan(res.plan);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the plan.');
        } finally {
            setSaving(false);
        }
    };

    const changed = !!plan && (plan.priceUSD !== priceUSD || plan.months !== months);
    const perMonth = Math.round(priceUSD / Math.max(1, months));

    return (
        <AdminShell title='Plan' description='What Nexus Bot Pro costs, and how long it lasts.'>
            <div className='card flex max-w-xl flex-col gap-5'>
                {loading ? (
                    <div className='flex justify-center py-10'>
                        <Spinner />
                    </div>
                ) : (
                    <>
                        <div className='grid gap-4 sm:grid-cols-2'>
                            <label className='flex flex-col gap-1.5'>
                                <span className='label'>Price (USD)</span>
                                <input
                                    type='number'
                                    min={1}
                                    step='1'
                                    value={priceUSD}
                                    onChange={e => setPriceUSD(Number(e.target.value))}
                                    className='field'
                                />
                            </label>
                            <label className='flex flex-col gap-1.5'>
                                <span className='label'>Duration (months)</span>
                                <input
                                    type='number'
                                    min={1}
                                    step='1'
                                    value={months}
                                    onChange={e => setMonths(Number(e.target.value))}
                                    className='field'
                                />
                            </label>
                        </div>

                        <div className='card-flat flex items-center justify-between'>
                            <div>
                                <div className='label'>Buyers will see</div>
                                <div className='mt-1 font-mono text-lg font-extrabold text-fg'>
                                    ${priceUSD} / {months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`}
                                </div>
                            </div>
                            <div className='text-right'>
                                <div className='label'>Per month</div>
                                <div className='mt-1 font-mono text-sm font-bold text-mist-300'>${perMonth}</div>
                            </div>
                        </div>

                        {defaults && (defaults.priceUSD !== priceUSD || defaults.months !== months) && (
                            <button
                                type='button'
                                onClick={() => {
                                    setPriceUSD(defaults.priceUSD);
                                    setMonths(defaults.months);
                                }}
                                className='btn-ghost btn-sm self-start'
                            >
                                <RotateCcw size={13} /> Reset to ${defaults.priceUSD} / {defaults.months} months
                            </button>
                        )}

                        {error && <p className='text-sm text-mist-300'>{error}</p>}

                        <div className='flex items-center gap-3'>
                            <button
                                type='button'
                                onClick={save}
                                disabled={saving || !changed || priceUSD <= 0 || months <= 0}
                                className='btn-solid btn-sm'
                            >
                                <Save size={13} /> {saving ? 'Saving…' : 'Save plan'}
                            </button>
                            {saved && <span className='text-xs font-semibold text-fg'>Saved.</span>}
                        </div>
                    </>
                )}
            </div>
        </AdminShell>
    );
};

export default AdminPricing;
