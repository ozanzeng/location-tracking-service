// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
    ),
  );

const fill = () => {
  fireEvent.change(screen.getByLabelText('Kullanıcı adı'), { target: { value: 'ayse' } });
  fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'yonetici-sifresi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
};

describe('AdminLogin', () => {
  test('doğru bilgilerle oturum verilir', async () => {
    const session = { token: 't'.repeat(43), expiresIn: 43_200, admin: { id: 'a1', username: 'ayse' } };
    respond(200, session);
    const onSignedIn = vi.fn();
    render(<AdminLogin notice={null} onSignedIn={onSignedIn} />);
    fill();
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
  });

  test('yanlış şifrede sunucunun mesajı, çok denemede bekleme süresi gösterilir', async () => {
    respond(401, { message: 'Kullanıcı adı ya da şifre yanlış' });
    const { unmount } = render(<AdminLogin notice={null} onSignedIn={vi.fn()} />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('Kullanıcı adı ya da şifre yanlış');
    unmount();

    respond(429, { message: 'Çok fazla başarısız giriş denemesi' }, { 'retry-after': '600' });
    render(<AdminLogin notice="Oturumun süresi doldu" onSignedIn={vi.fn()} />);
    screen.getByText('Oturumun süresi doldu');
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('(10 dk)');
  });
});
