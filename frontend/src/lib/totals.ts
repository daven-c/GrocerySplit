import { useMemo } from 'react';
import { useAppData } from './appData';
import { computeBalances, Balances } from './balances';

/** What you are owed and what you owe across every shared group (your Personal section is kept separate). */
export function totalsOf(balances: Pick<Balances, 'friends'>) {
    let owed = 0, owe = 0;
    for (const f of Object.values(balances.friends)) {
        if (f.net > 0.004) owed += f.net;
        else if (f.net < -0.004) owe -= f.net;
    }
    return { owed, owe, net: owed - owe };
}

export function useHomeTotals() {
    const { me, groups, sessions, settlements } = useAppData();
    return useMemo(() => {
        const shared = groups.filter(g => !g.personal);
        const balances = computeBalances(me, shared, sessions, settlements);
        return { balances, ...totalsOf(balances) };
    }, [me, groups, sessions, settlements]);
}
