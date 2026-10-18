import { apiRequest } from '@/shared/api';

type SessionResponse = {
  token: string;
  account: { id: string; email: string };
};

export function signUpRequest(email: string, password: string): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/auth/signup', { method: 'POST', body: { email, password } });
}

export function logInRequest(email: string, password: string): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/auth/login', { method: 'POST', body: { email, password } });
}
