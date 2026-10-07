import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const useHome = (week) => useQuery({
  queryKey: ['home', week ?? 'now'],
  queryFn: () => api.get(`/home${week ? `?week=${week}` : ''}`),
  placeholderData: keepPreviousData,
  refetchInterval: 60_000,
});
