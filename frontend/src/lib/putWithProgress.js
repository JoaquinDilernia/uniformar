// PUT con progreso (fetch no informa avance de subida). onProgress recibe 0..1
export function putWithProgress(url, file, { headers = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(xhr.status === 413 ? 'El video es más grande de lo esperado.' : `No se pudo subir el video (${xhr.status}). Probá de nuevo.`)));
    xhr.onerror = () => reject(new Error('Se cortó la subida. Revisá internet y probá de nuevo.'));
    xhr.send(file);
  });
}
