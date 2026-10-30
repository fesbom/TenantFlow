import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { handleAuthFailure, handleAuthFailureFromError } from "./session";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Sessão inválida (token expirado/revogado, usuário inativo, clínica suspensa):
    // encerra a sessão e volta para o login em vez de deixar a tela em loop de falhas.
    if (await handleAuthFailure(res)) {
      return new Promise<never>(() => {});
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem('dental_token');
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('dental_token');
    const headers: Record<string, string> = {};
    
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Rede de segurança global: qualquer query/mutação que falhe com erro de autenticação
// (inclusive as que usam fetch próprio) derruba a sessão e volta para o login.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    handleAuthFailureFromError(event.action.error);
  }
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    handleAuthFailureFromError(event.action.error);
  }
});
