const API_BASE = '';

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('dental_token');
};

// Enhanced API request function with auth
export const apiRequest = async (
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> => {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText}`);
  }

  return response;
};

// File upload function
export const uploadFiles = async (
  url: string,
  formData: FormData,
): Promise<Response> => {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText}`);
  }

  return response;
};
