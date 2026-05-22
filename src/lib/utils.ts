import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: any) {
  if (!date) return '-';
  
  // Handle Firestore Timestamp
  if (date?.toDate) date = date.toDate();
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleDateString('pt-BR');
}

export function openAttachment(anexo: { nome: string; base64: string }) {
  try {
    const arr = anexo.base64.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const url = URL.createObjectURL(blob);
    
    // Check if it is an image or pdf for direct display, otherwise download
    const isPDForImage = mime.startsWith('image/') || mime === 'application/pdf';
    
    if (isPDForImage) {
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        return;
      }
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.download = anexo.nome;
    link.click();
  } catch (error) {
    console.error("Erro ao visualizar anexo, tentando download direto:", error);
    const link = document.createElement('a');
    link.href = anexo.base64;
    link.download = anexo.nome;
    link.click();
  }
}
