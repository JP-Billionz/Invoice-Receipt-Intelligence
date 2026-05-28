import { describe, expect, it, vi } from 'vitest';

import {
  parseEmailFrom,
  sendMagicLinkViaSendGrid,
} from '@/lib/email/sendgrid';

describe('parseEmailFrom', () => {
  it('parses "Name <email>" form', () => {
    expect(parseEmailFrom('AISB Receipts AI <jp@aisolutionsbb.com>')).toEqual({
      name: 'AISB Receipts AI',
      email: 'jp@aisolutionsbb.com',
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseEmailFrom('  AISB Receipts AI  <  jp@aisolutionsbb.com  >  ')).toEqual({
      name: 'AISB Receipts AI',
      email: 'jp@aisolutionsbb.com',
    });
  });

  it('accepts bare email — uses the email as the name', () => {
    expect(parseEmailFrom('jp@aisolutionsbb.com')).toEqual({
      name: 'jp@aisolutionsbb.com',
      email: 'jp@aisolutionsbb.com',
    });
  });

  it('uses the email as fallback name when angle brackets contain only the address', () => {
    expect(parseEmailFrom('<jp@aisolutionsbb.com>')).toEqual({
      name: 'jp@aisolutionsbb.com',
      email: 'jp@aisolutionsbb.com',
    });
  });

  it('throws on empty input', () => {
    expect(() => parseEmailFrom('')).toThrow();
    expect(() => parseEmailFrom('   ')).toThrow();
  });

  it('throws on plain non-email string', () => {
    expect(() => parseEmailFrom('not an email')).toThrow();
  });

  it('throws when angle brackets do not contain an email', () => {
    expect(() => parseEmailFrom('Name <not-an-email>')).toThrow();
  });
});

describe('sendMagicLinkViaSendGrid', () => {
  function mockFetchOk() {
    return vi.fn().mockResolvedValue(
      new Response('', { status: 202, statusText: 'Accepted' }),
    );
  }

  it('POSTs to the SendGrid Mail Send endpoint with bearer auth', async () => {
    const fetchImpl = mockFetchOk();
    await sendMagicLinkViaSendGrid({
      to: 'user@example.com',
      url: 'https://app.example.com/api/auth/callback/http-email?token=abc',
      host: 'app.example.com',
      fetchImpl,
      env: {
        SENDGRID_API_KEY: 'SG.test-key',
        EMAIL_FROM: 'AISB Receipts AI <jp@aisolutionsbb.com>',
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer SG.test-key',
      'Content-Type': 'application/json',
    });
  });

  it('sends the canonical SendGrid v3 body shape', async () => {
    const fetchImpl = mockFetchOk();
    await sendMagicLinkViaSendGrid({
      to: 'user@example.com',
      url: 'https://app.example.com/sign-in?t=xyz',
      host: 'app.example.com',
      fetchImpl,
      env: {
        SENDGRID_API_KEY: 'SG.test-key',
        EMAIL_FROM: 'AISB Receipts AI <jp@aisolutionsbb.com>',
      },
    });

    const init = fetchImpl.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body.personalizations).toEqual([{ to: [{ email: 'user@example.com' }] }]);
    expect(body.from).toEqual({
      email: 'jp@aisolutionsbb.com',
      name: 'AISB Receipts AI',
    });
    expect(body.subject).toBe('Sign in to app.example.com');
    expect(body.content).toHaveLength(2);
    expect(body.content[0].type).toBe('text/plain');
    expect(body.content[0].value).toContain('https://app.example.com/sign-in?t=xyz');
    expect(body.content[1].type).toBe('text/html');
    expect(body.content[1].value).toContain('https://app.example.com/sign-in?t=xyz');
  });

  it('throws when SENDGRID_API_KEY is missing', async () => {
    await expect(
      sendMagicLinkViaSendGrid({
        to: 'user@example.com',
        url: 'https://app/x',
        host: 'app',
        fetchImpl: mockFetchOk(),
        env: { EMAIL_FROM: 'a <a@b.com>' },
      }),
    ).rejects.toThrow(/SENDGRID_API_KEY/);
  });

  it('throws when EMAIL_FROM is missing', async () => {
    await expect(
      sendMagicLinkViaSendGrid({
        to: 'user@example.com',
        url: 'https://app/x',
        host: 'app',
        fetchImpl: mockFetchOk(),
        env: { SENDGRID_API_KEY: 'SG.x' },
      }),
    ).rejects.toThrow(/EMAIL_FROM/);
  });

  it('throws with SendGrid error body on non-2xx — invoicer-style debug visibility', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: 'The from address does not match a verified Sender Identity' }] }),
        { status: 403, statusText: 'Forbidden' },
      ),
    );

    await expect(
      sendMagicLinkViaSendGrid({
        to: 'user@example.com',
        url: 'https://app/x',
        host: 'app',
        fetchImpl,
        env: {
          SENDGRID_API_KEY: 'SG.bad',
          EMAIL_FROM: 'AISB <bad@notverified.com>',
        },
      }),
    ).rejects.toThrow(/403.*does not match a verified Sender Identity/s);
  });

  it('throws on 401 (invalid API key)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"errors":[{"message":"unauthorized"}]}', {
        status: 401,
        statusText: 'Unauthorized',
      }),
    );

    await expect(
      sendMagicLinkViaSendGrid({
        to: 'user@example.com',
        url: 'https://app/x',
        host: 'app',
        fetchImpl,
        env: {
          SENDGRID_API_KEY: 'SG.bad',
          EMAIL_FROM: 'a <a@b.com>',
        },
      }),
    ).rejects.toThrow(/401/);
  });

  it('HTML-escapes the host and URL to prevent injection', async () => {
    const fetchImpl = mockFetchOk();
    await sendMagicLinkViaSendGrid({
      to: 'user@example.com',
      url: 'https://app.example.com/x?token=<script>alert(1)</script>',
      host: 'app.example.com',
      fetchImpl,
      env: {
        SENDGRID_API_KEY: 'SG.test-key',
        EMAIL_FROM: 'a <a@b.com>',
      },
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const html = body.content[1].value;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
