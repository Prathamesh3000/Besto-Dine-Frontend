/**
 * Fresh TanStack QueryClient per test (retries off so failures surface
 * immediately) and a wrapper factory for renderHook / render.
 */
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

export function wrapperFor(client, Inner) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>
        {Inner ? <Inner>{children}</Inner> : children}
      </QueryClientProvider>
    )
  }
}
