import React from 'react';
import { render } from '@testing-library/react';
import { AppDataProvider } from '../lib/appData';
import { ME } from './apiMock';

/** Render a screen inside the shared data provider, as the real app does. */
export function renderWithData(ui: React.ReactElement) {
    // As a wrapper, so `rerender` keeps the provider.
    return render(ui, { wrapper: ({ children }) => <AppDataProvider userId={ME}>{children}</AppDataProvider> });
}

/** What the user actually sees: opacity multiplied up the ancestor chain. */
export function effectiveOpacity(el: Element): number {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || '1');
    return o;
}
