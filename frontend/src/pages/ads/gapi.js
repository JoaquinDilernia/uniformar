import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, getToken } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';

// Agente de Google Ads: mismas piezas que Meta, bajo /gads
const keys = { overview: ['gads', 'overview'], decisions: ['gads', 'decisions'], learnings: ['gads', 'learnings'] };

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['gads'] });
}

export const useGoogleOverview = ({ enabled = true } = {}) => useQuery({
  queryKey: keys.overview,
  enabled,
  queryFn: () => api.get('/gads/overview'),
  refetchInterval: (q) => (q.state.data?.lastRun?.status === 'running' ? 5000 : false),
});
export const useGoogleDecisions = () => useQuery({ queryKey: keys.decisions, queryFn: () => api.get('/gads/decisions').then((r) => r.decisions) });
export const useGoogleLearnings = () => useQuery({ queryKey: keys.learnings, queryFn: () => api.get('/gads/learnings').then((r) => r.learnings) });

export function useRefreshGoogle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.get('/gads/overview?refresh=1'), meta: { success: false }, onSuccess: (data) => qc.setQueryData(keys.overview, data) });
}
export function useStartGoogleRun() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api.post('/gads/runs'), meta: { success: 'El agente de Google arrancó a analizar. Tarda unos minutos.' }, onSettled: refresh });
}
export function useGoogleDecide() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, approve }) => api.post(`/gads/decisions/${id}/${approve ? 'approve' : 'reject'}`).then((r) => r.decision),
    meta: { success: false },
    onSettled: refresh,
  });
}
export function useGoogleSetStatus() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: ({ id, level, status, name }) => api.post(`/gads/objects/${id}/status`, { level, status, name }), meta: { success: 'Listo ✓' }, onSettled: refresh });
}
export function useDeleteGoogleLearning() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id) => api.del(`/gads/learnings/${id}`), meta: { success: false }, onSettled: refresh });
}
export function useSaveGoogleSettings() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (patch) => api.put('/gads/settings', patch).then((r) => r.settings), meta: { success: 'Ajustes guardados ✓' }, onSettled: refresh });
}

// Biblioteca de imágenes para Google (se cargan acá o se traen de las piezas de Meta)
export const useGoogleImages = () => useQuery({ queryKey: ['gads', 'images'], queryFn: () => api.get('/gads/images').then((r) => r.images) });
export function useUploadGoogleImage() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ name, file }) => {
      const image = (await api.post('/gads/images', { name })).image;
      try {
        await uploadFile({ ownerType: 'gads_image', ownerId: image.id, file, kind: 'raw' });
      } catch (err) {
        await api.post(`/gads/images/${image.id}/archive`).catch(() => {});
        throw err;
      }
      return image;
    },
    meta: { success: 'Imagen cargada ✓' },
    onSettled: refresh,
  });
}
export function useImportFromMeta() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (creativeId) => api.post(`/gads/images/from-creative/${creativeId}`), meta: { success: 'Imagen traída de Meta ✓' }, onSettled: refresh });
}
export function useImageToCampaign() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, campaign }) => api.post(`/gads/images/${id}/to-campaign`, { campaign_id: campaign.id, campaign_name: campaign.name }),
    meta: { success: 'Imagen subida a la campaña ✓' },
    onSettled: refresh,
  });
}
export function useArchiveGoogleImage() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id) => api.post(`/gads/images/${id}/archive`), meta: { success: false }, onSettled: refresh });
}
// Descarga el recorte (cuadrado u horizontal) listo para cargar a mano en Google Ads
export async function downloadCrop(image, shape) {
  const res = await fetch(`${API_BASE}/api/gads/images/${image.id}/${shape}.jpg`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('No se pudo bajar la imagen.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${image.name} ${shape}.jpg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
