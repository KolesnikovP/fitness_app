import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * An in-memory fake of the backend API, served at the network boundary with
 * MSW. It follows the real API's contract (see backend/internal/auth and
 * backend/internal/user): same paths, bodies, status codes and error shape.
 */
type FakeAccount = {
  id: string;
  email: string;
  password: string;
  unitPreference: 'kg' | 'lb' | null;
};

let accounts: FakeAccount[] = [];
let tokens = new Map<string, string>(); // token -> account id
let nextId = 1;

export const fakeApi = {
  /** Every Authorization header the API received, in order. */
  authHeaders: [] as (string | null)[],

  reset() {
    accounts = [];
    tokens = new Map();
    nextId = 1;
    this.authHeaders = [];
  },

  addAccount(email: string, password: string, unitPreference: FakeAccount['unitPreference']) {
    const account = { id: `account-${nextId++}`, email, password, unitPreference };
    accounts.push(account);
    return account;
  },

  issueToken(accountId: string) {
    const token = `token-${accountId}-${tokens.size + 1}`;
    tokens.set(token, accountId);
    return token;
  },

  findAccount(email: string) {
    return accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  },
};

function error(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

function caller(request: Request) {
  const header = request.headers.get('Authorization');
  fakeApi.authHeaders.push(header);
  const accountId = header?.startsWith('Bearer ') ? tokens.get(header.slice(7)) : undefined;
  return accounts.find((a) => a.id === accountId);
}

function me(account: FakeAccount) {
  return { id: account.id, email: account.email, unitPreference: account.unitPreference };
}

const handlers = [
  http.post('*/auth/signup', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (!email.includes('@')) return error(400, 'invalid_email', 'Enter a valid email address.');
    if (password.length < 8) return error(400, 'invalid_password', 'Password must be 8 to 72 characters.');
    if (fakeApi.findAccount(email)) return error(409, 'email_taken', 'An account with this email already exists.');

    const account = fakeApi.addAccount(email, password, null);
    return HttpResponse.json(
      { token: fakeApi.issueToken(account.id), account: { id: account.id, email } },
      { status: 201 },
    );
  }),

  http.post('*/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const account = fakeApi.findAccount(email);
    if (!account || account.password !== password) {
      return error(401, 'invalid_credentials', 'Email or password is incorrect.');
    }
    return HttpResponse.json({ token: fakeApi.issueToken(account.id), account: { id: account.id, email } });
  }),

  http.get('*/users/me', ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    return HttpResponse.json(me(account));
  }),

  http.patch('*/users/me', async ({ request }) => {
    const account = caller(request);
    if (!account) return error(401, 'unauthorized', 'Log in to continue.');
    const { unitPreference } = (await request.json()) as { unitPreference: unknown };
    if (unitPreference !== 'kg' && unitPreference !== 'lb') {
      return error(400, 'invalid_unit_preference', 'unitPreference must be "kg" or "lb".');
    }
    account.unitPreference = unitPreference;
    return HttpResponse.json(me(account));
  }),
];

export const server = setupServer(...handlers);
