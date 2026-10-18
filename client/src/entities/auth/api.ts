import { apiRequest } from '@/shared/api';

type AuthResponse = {
  token: string;
  account: { id: string; email: string };
};

export function signUpRequest(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body: { email, password } });
}

export function logInRequest(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
}
