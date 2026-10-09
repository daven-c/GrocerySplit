import { describe, it, expect } from 'vitest';
import { labelMap } from '../people';

describe('labelMap', () => {
    it('leaves unique names alone', () => {
        expect(labelMap([{ user_id: 'a', name: 'Amy', username: 'amy' }, { user_id: 'b', name: 'Bo', username: 'bo' }])).toEqual({ a: 'Amy', b: 'Bo' });
    });

    it('adds the @username when two people share a name (ignoring case)', () => {
        const l = labelMap([{ user_id: 'a', name: 'Sam', username: 'sam_k' }, { user_id: 'b', name: 'sam', username: 'sam_r' }, { user_id: 'c', name: 'Bo', username: 'bo' }]);
        expect(l).toEqual({ a: 'Sam (@sam_k)', b: 'sam (@sam_r)', c: 'Bo' });
    });

    it('keeps the plain name for someone with no username yet', () => {
        expect(labelMap([{ user_id: 'a', name: 'Sam', username: 'sam_k' }, { user_id: 'b', name: 'Sam' }])).toEqual({ a: 'Sam (@sam_k)', b: 'Sam' });
    });
});
