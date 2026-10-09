// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks } from '../../test/apiMock';
import ReceiptPhotos from '../ReceiptPhotos';

const photo = (n: number) => ({ id: `p${n}`, path: `g1/s1/${n}.jpg`, url: `https://x/${n}.jpg` });
const file = (name = 'r.jpg', type = 'image/jpeg') => new File(['x'], name, { type });

beforeEach(resetMocks);
afterEach(cleanup);

describe('Reference photos', () => {
    it('adds a photo to the expense and reloads the list', async () => {
        const u = userEvent.setup();
        api.listPhotos.mockResolvedValueOnce([]).mockResolvedValue([photo(1)]);
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        expect(await screen.findByText(/Add a picture of the receipt/)).toBeInTheDocument();
        await u.upload(screen.getByLabelText('Choose photos'), file());
        await waitFor(() => expect(api.addPhoto).toHaveBeenCalledTimes(1));
        expect(api.addPhoto.mock.calls[0].slice(0, 2)).toEqual(['s1', 'g1']);
        expect(await screen.findByAltText('Reference photo 1')).toBeInTheDocument();
    });

    it('stops at 3 photos', async () => {
        api.listPhotos.mockResolvedValue([photo(1), photo(2), photo(3)]);
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        expect(await screen.findByText('3 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add photo' })).toBeDisabled();
    });

    it('only adds as many as fit', async () => {
        const u = userEvent.setup();
        api.listPhotos.mockResolvedValue([photo(1), photo(2)]);
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        await screen.findByText('2 of 3');
        await u.upload(screen.getByLabelText('Choose photos'), [file('a.jpg'), file('b.jpg')]);
        await waitFor(() => expect(api.addPhoto).toHaveBeenCalledTimes(1));
        expect(await screen.findByText(/Only 1 more photo fits/)).toBeInTheDocument();
    });

    it('rejects a photo type the bucket will not take', async () => {
        const u = userEvent.setup({ applyAccept: false });
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        await screen.findByText(/Add a picture/);
        await u.upload(screen.getByLabelText('Choose photos'), file('r.heic', 'image/heic'));
        expect(await screen.findByText('Use a JPEG, PNG or WebP photo.')).toBeInTheDocument();
        expect(api.addPhoto).not.toHaveBeenCalled();
    });

    it('opens a photo and removes it', async () => {
        const u = userEvent.setup();
        api.listPhotos.mockResolvedValue([photo(1)]);
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        await u.click(await screen.findByRole('button', { name: 'Open photo 1' }));
        await u.click(await screen.findByRole('button', { name: 'Remove photo' }));
        await waitFor(() => expect(api.removePhoto).toHaveBeenCalledWith(photo(1)));
    });
});
