/**
 * Módulo especializado de exportação PDF e Excel para Processos e Ofícios do CRB-4.
 * Gera PDFs A4 Paisagem institucionais com capa-resumo, KPIs, captura de gráficos,
 * tabela cruzada e listagem detalhada com paginação automática e colunas fixas.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  normalizarStatusProcesso, 
  normalizarTipoSolicitacao, 
  normalizarTipoOficio, 
  normalizarAssuntoOficio,
  compararNumeroDesc,
  getAnoRegistro 
} from './numeracao';

export interface ExportContext {
  ano?: string;
  status?: string;
  tipo?: string;
  usuarioNome?: string;
  operador?: string;
  periodoInicio?: string;
  periodoFim?: string;
}

/**
 * Formata qualquer valor de data para o padrão oficial brasileiro DD/MM/AAAA.
 * Nunca retorna formato ISO. Retorna string vazia para valores nulos/inválidos/'-'.
 */
export function formatarDataBR(val: any): string {
  if (!val || val === '-' || val === 'null' || val === 'undefined') return '';
  if (typeof val === 'number') {
    if (val > 100000000000) {
      const dt = new Date(val);
      if (!isNaN(dt.getTime())) {
        const dia = String(dt.getUTCDate()).padStart(2, '0');
        const mes = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const ano = dt.getUTCFullYear();
        return `${dia}/${mes}/${ano}`;
      }
    }
    return '';
  }
  const s = String(val).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return '';

  // Já em dd/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

  // Extrai dd/mm/aaaa com hora ou texto adicional
  const ddmmyyyyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyyMatch) {
    return `${ddmmyyyyMatch[1]}/${ddmmyyyyMatch[2]}/${ddmmyyyyMatch[3]}`;
  }

  // Extrai ISO aaaa-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dia = String(parsed.getDate()).padStart(2, '0');
    const mes = String(parsed.getMonth() + 1).padStart(2, '0');
    const ano = parsed.getFullYear();
    if (ano >= 1990 && ano <= 2099) {
      return `${dia}/${mes}/${ano}`;
    }
  }

  return '';
}

/**
 * Retorna texto ou data formatada para a plenária de Processos
 */
function formatarPlenariaProcesso(p: any): string {
  const dt = p.dataPlenaria ? formatarDataBR(p.dataPlenaria) : '';
  if (dt) return dt;
  if (p.dataPlenaria && typeof p.dataPlenaria === 'string') {
    const limpo = p.dataPlenaria.trim();
    if (limpo && limpo !== '-') return limpo;
  }
  if (p.observacaoPlenaria && typeof p.observacaoPlenaria === 'string') {
    const limpo = p.observacaoPlenaria.trim();
    if (limpo && limpo !== '-') return limpo;
  }
  return '';
}

/**
 * Aplica o rodapé institucional com número de páginas em todas as páginas do PDF
 */
function aplicarRodapeGlobal(doc: jsPDF) {
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, 200, 283, 200);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text('CRB-4 - Conselho Regional de Biblioteconomia da 4ª Região | Gerado pelo SGI CRB-4', 14, 205);
    doc.text(`Página ${i} de ${pageCount}`, 283, 205, { align: 'right' });
  }
}

const PALETA_HEX = [
  '#1e3a8a', // Azul Marinho CRB
  '#7c3aed', // Roxo Institucional
  '#059669', // Verde Esmeralda
  '#d97706', // Âmbar / Laranja
  '#0284c7', // Azul Céu
  '#dc2626', // Vermelho
  '#475569', // Slate
  '#8b5cf6'  // Violeta
];

const STATUS_HEX: Record<string, string> = {
  'Deferido': '#059669',
  'Indeferido': '#dc2626',
  'Aguardando Plenária': '#1e3a8a',
  'Em Análise': '#7c3aed',
  'Pendente': '#d97706',
  'Ad Referendum': '#8b5cf6',
  'Sobrestado': '#475569',
  'Enviado': '#059669',
  'Aguardando Envio': '#7c3aed',
  'Cancelado': '#dc2626',
  'Outros': '#64748b'
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [isNaN(r) ? 30 : r, isNaN(g) ? 58 : g, isNaN(b) ? 138 : b];
}

function setDocFillHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDocDrawHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setDocTextHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function desenharPainelCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  titulo: string,
  subtitulo: string,
  corDestaqueHex: string = '#1e3a8a'
) {
  setDocFillHex(doc, '#ffffff');
  setDocDrawHex(doc, '#e2e8f0');
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  setDocFillHex(doc, corDestaqueHex);
  doc.rect(x + 3.5, y + 3.5, 1.8, 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  setDocTextHex(doc, '#1e3a8a');
  doc.text(titulo, x + 7.5, y + 7.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setDocTextHex(doc, '#64748b');
  doc.text(subtitulo, x + 7.5, y + 10.5);

  setDocDrawHex(doc, '#f1f5f9');
  doc.line(x + 3.5, y + 12.8, x + w - 3.5, y + 12.8);
}

/**
 * Desenha os 3 gráficos analíticos para Processos diretamente com formas nativas no jsPDF
 */
function desenharGraficosNativosProcessos(
  doc: jsPDF,
  topTipos: Array<{ tipo: string; qtd: number }>,
  statusCounts: Record<string, number>,
  evolucaoMensal: number[],
  total: number,
  startY: number
) {
  const cardH = 70;

  // 1. Barras por Tipo de Solicitação (w = 90)
  const c1X = 14;
  const c1W = 90;
  desenharPainelCard(doc, c1X, startY, c1W, cardH, 'Tipos de Solicitação', 'Top pedidos protocolados no período', '#7c3aed');

  const maxQtdTipo = Math.max(...topTipos.map(t => t.qtd), 1);
  let yTipo = startY + 16.5;
  const barAreaW = 34;
  const tiposMostrados = topTipos.slice(0, 5);

  if (tiposMostrados.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    setDocTextHex(doc, '#94a3b8');
    doc.text('Nenhuma solicitação registrada.', c1X + 10, yTipo + 15);
  } else {
    tiposMostrados.forEach((item, idx) => {
      const cor = PALETA_HEX[idx % PALETA_HEX.length];
      const barW = Math.max(1.5, (item.qtd / maxQtdTipo) * barAreaW);
      const pct = total > 0 ? ((item.qtd / total) * 100).toFixed(1) : '0';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#334155');
      const rotulo = item.tipo.length > 20 ? item.tipo.slice(0, 19) + '…' : item.tipo;
      doc.text(rotulo, c1X + 4.5, yTipo + 3.8);

      setDocFillHex(doc, '#f1f5f9');
      doc.roundedRect(c1X + 37, yTipo, barAreaW, 4.8, 1, 1, 'F');

      setDocFillHex(doc, cor);
      doc.roundedRect(c1X + 37, yTipo, barW, 4.8, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#1e293b');
      doc.text(`${item.qtd} (${pct}%)`, c1X + 37 + barAreaW + 2, yTipo + 3.8);

      yTipo += 10;
    });
  }

  // 2. Distribuição por Status (w = 88)
  const c2X = 108;
  const c2W = 88;
  desenharPainelCard(doc, c2X, startY, c2W, cardH, 'Distribuição por Status', 'Estágio processual e deliberações', '#059669');

  const statusEntries = Object.entries(statusCounts)
    .filter(([_, qtd]) => qtd > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let ySt = startY + 16.5;
  const maxStQtd = Math.max(...statusEntries.map(([_, q]) => q), 1);
  const stBarAreaW = 30;

  if (statusEntries.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    setDocTextHex(doc, '#94a3b8');
    doc.text('Sem dados de status.', c2X + 10, ySt + 15);
  } else {
    statusEntries.forEach(([st, qtd]) => {
      const cor = STATUS_HEX[st] || '#64748b';
      const barW = Math.max(1.5, (qtd / maxStQtd) * stBarAreaW);
      const pct = total > 0 ? ((qtd / total) * 100).toFixed(1) : '0';

      setDocFillHex(doc, cor);
      doc.circle(c2X + 6.5, ySt + 2.5, 1.8, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#334155');
      const nomeSt = st.length > 17 ? st.slice(0, 16) + '…' : st;
      doc.text(nomeSt, c2X + 10, ySt + 3.8);

      setDocFillHex(doc, '#f1f5f9');
      doc.roundedRect(c2X + 41, ySt, stBarAreaW, 4.8, 1, 1, 'F');

      setDocFillHex(doc, cor);
      doc.roundedRect(c2X + 41, ySt, barW, 4.8, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#1e293b');
      doc.text(`${qtd} (${pct}%)`, c2X + 41 + stBarAreaW + 2, ySt + 3.8);

      ySt += 10;
    });
  }

  // 3. Evolução Mensal de Solicitações (w = 83)
  const c3X = 200;
  const c3W = 83;
  desenharPainelCard(doc, c3X, startY, c3W, cardH, 'Evolução Mensal', 'Volume de entradas por mês do ano', '#1e3a8a');

  const maxMesQtd = Math.max(...evolucaoMensal, 1);
  const baselineY = startY + 58;
  const maxBarH = 34;
  const slotW = (c3W - 10) / 12;
  const barW = 3.2;

  setDocDrawHex(doc, '#cbd5e1');
  doc.setLineWidth(0.4);
  doc.line(c3X + 4, baselineY, c3X + c3W - 4, baselineY);

  evolucaoMensal.forEach((qtd, i) => {
    const slotX = c3X + 5 + i * slotW;
    const barX = slotX + (slotW - barW) / 2;

    if (qtd > 0) {
      const barH = Math.max(1.8, (qtd / maxMesQtd) * maxBarH);
      const barY = baselineY - barH;

      setDocFillHex(doc, '#1e3a8a');
      doc.roundedRect(barX, barY, barW, barH, 0.6, 0.6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      setDocTextHex(doc, '#1e3a8a');
      doc.text(String(qtd), barX + barW / 2, barY - 1.2, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    setDocTextHex(doc, '#64748b');
    doc.text(MESES_ABREV[i], barX + barW / 2, baselineY + 4, { align: 'center' });
  });
}

/**
 * Desenha os 3 gráficos analíticos para Ofícios diretamente com formas nativas no jsPDF
 */
function desenharGraficosNativosOficios(
  doc: jsPDF,
  topTipos: Array<{ tipo: string; qtd: number }>,
  topAssuntos: Array<{ assunto: string; qtd: number }>,
  statusCounts: Record<string, number>,
  evolucaoMensal: number[],
  total: number,
  startY: number
) {
  const cardH = 70;

  // 1. Modalidades de Ofício (w = 88)
  const c1X = 14;
  const c1W = 88;
  desenharPainelCard(doc, c1X, startY, c1W, cardH, 'Modalidades de Ofício', 'Tipos expedidos (Presidente, Administrativo, etc.)', '#1e3a8a');

  const maxQtdTipo = Math.max(...topTipos.map(t => t.qtd), 1);
  let yTipo = startY + 16.5;
  const barAreaW = 34;
  const tiposMostrados = topTipos.slice(0, 5);

  if (tiposMostrados.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    setDocTextHex(doc, '#94a3b8');
    doc.text('Nenhum ofício registrado.', c1X + 10, yTipo + 15);
  } else {
    tiposMostrados.forEach((item, idx) => {
      const cor = PALETA_HEX[idx % PALETA_HEX.length];
      const barW = Math.max(1.5, (item.qtd / maxQtdTipo) * barAreaW);
      const pct = total > 0 ? ((item.qtd / total) * 100).toFixed(1) : '0';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#334155');
      const rotulo = item.tipo.length > 20 ? item.tipo.slice(0, 19) + '…' : item.tipo;
      doc.text(rotulo, c1X + 4.5, yTipo + 3.8);

      setDocFillHex(doc, '#f1f5f9');
      doc.roundedRect(c1X + 37, yTipo, barAreaW, 4.8, 1, 1, 'F');

      setDocFillHex(doc, cor);
      doc.roundedRect(c1X + 37, yTipo, barW, 4.8, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#1e293b');
      doc.text(`${item.qtd} (${pct}%)`, c1X + 37 + barAreaW + 2, yTipo + 3.8);

      yTipo += 10;
    });
  }

  // 2. Assuntos Mais Frequentes (w = 92)
  const c2X = 106;
  const c2W = 92;
  desenharPainelCard(doc, c2X, startY, c2W, cardH, 'Assuntos Mais Frequentes', 'Temas principais tratados nas correspondências', '#059669');

  const maxQtdAssunto = Math.max(...topAssuntos.map(a => a.qtd), 1);
  let yAss = startY + 16.5;
  const assBarAreaW = 32;
  const assuntosMostrados = topAssuntos.slice(0, 5);

  if (assuntosMostrados.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    setDocTextHex(doc, '#94a3b8');
    doc.text('Sem dados de assuntos.', c2X + 10, yAss + 15);
  } else {
    assuntosMostrados.forEach((item) => {
      const cor = '#059669';
      const barW = Math.max(1.5, (item.qtd / maxQtdAssunto) * assBarAreaW);
      const pct = total > 0 ? ((item.qtd / total) * 100).toFixed(1) : '0';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#334155');
      const rotulo = item.assunto.length > 21 ? item.assunto.slice(0, 20) + '…' : item.assunto;
      doc.text(rotulo, c2X + 4.5, yAss + 3.8);

      setDocFillHex(doc, '#f1f5f9');
      doc.roundedRect(c2X + 41, yAss, assBarAreaW, 4.8, 1, 1, 'F');

      setDocFillHex(doc, cor);
      doc.roundedRect(c2X + 41, yAss, barW, 4.8, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setDocTextHex(doc, '#1e293b');
      doc.text(`${item.qtd} (${pct}%)`, c2X + 41 + assBarAreaW + 2, yAss + 3.8);

      yAss += 10;
    });
  }

  // 3. Evolução Mensal de Expedição (w = 81)
  const c3X = 202;
  const c3W = 81;
  desenharPainelCard(doc, c3X, startY, c3W, cardH, 'Evolução Mensal', 'Volume de ofícios emitidos ao longo do ano', '#7c3aed');

  const maxMesQtd = Math.max(...evolucaoMensal, 1);
  const baselineY = startY + 58;
  const maxBarH = 34;
  const slotW = (c3W - 10) / 12;
  const barW = 3.2;

  setDocDrawHex(doc, '#cbd5e1');
  doc.setLineWidth(0.4);
  doc.line(c3X + 4, baselineY, c3X + c3W - 4, baselineY);

  evolucaoMensal.forEach((qtd, i) => {
    const slotX = c3X + 5 + i * slotW;
    const barX = slotX + (slotW - barW) / 2;

    if (qtd > 0) {
      const barH = Math.max(1.8, (qtd / maxMesQtd) * maxBarH);
      const barY = baselineY - barH;

      setDocFillHex(doc, '#7c3aed');
      doc.roundedRect(barX, barY, barW, barH, 0.6, 0.6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      setDocTextHex(doc, '#7c3aed');
      doc.text(String(qtd), barX + barW / 2, barY - 1.2, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    setDocTextHex(doc, '#64748b');
    doc.text(MESES_ABREV[i], barX + barW / 2, baselineY + 4, { align: 'center' });
  });
}

// ============================================================================
// EXPORTAÇÃO PDF: PROCESSOS
// ============================================================================

export async function exportarRelatorioPdfProcessos(
  processos: any[],
  context: ExportContext
): Promise<void> {
  const sorted = [...processos].sort(compararNumeroDesc);
  const total = sorted.length;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const anoTxt = context.ano ? context.ano : 'Todos os Anos';
  const tituloRelatorio = `Relatório de Processos ${anoTxt}`;
  const dataHoraAtual = new Date().toLocaleString('pt-BR');

  // Cálculos de Status
  const statusCounts: Record<string, number> = {
    'Deferido': 0,
    'Indeferido': 0,
    'Aguardando Plenária': 0,
    'Em Análise': 0,
    'Pendente': 0,
    'Ad Referendum': 0,
    'Sobrestado': 0,
    'Outros': 0
  };

  const mapTipos: Record<string, number> = {};
  const COLUNAS_STATUS = ['Deferido', 'Indeferido', 'Aguardando Plenária', 'Em Análise', 'Pendente', 'Ad Referendum', 'Outros'];
  const matrizCruzada: Record<string, Record<string, number>> = {};
  const evolucaoMensal = new Array(12).fill(0);

  sorted.forEach(p => {
    const stNorm = normalizarStatusProcesso(p.status);
    const tpNorm = normalizarTipoSolicitacao(p.solicitacao || p.descricao);

    if (statusCounts[stNorm] !== undefined) statusCounts[stNorm]++;
    else statusCounts['Outros']++;

    mapTipos[tpNorm] = (mapTipos[tpNorm] || 0) + 1;

    if (!matrizCruzada[tpNorm]) {
      matrizCruzada[tpNorm] = {};
      COLUNAS_STATUS.forEach(c => { matrizCruzada[tpNorm][c] = 0; });
    }
    const stCol = COLUNAS_STATUS.includes(stNorm) ? stNorm : 'Outros';
    matrizCruzada[tpNorm][stCol] = (matrizCruzada[tpNorm][stCol] || 0) + 1;

    // Extração do mês de solicitação
    const dtStr = p.dataSolicitacao || p.dataAbertura || p.createdAt || p.data;
    if (dtStr) {
      let m: number | null = null;
      if (typeof dtStr === 'string' && dtStr.includes('/')) {
        const parts = dtStr.split('/');
        if (parts.length >= 2) {
          const mesNum = parseInt(parts[1], 10);
          if (mesNum >= 1 && mesNum <= 12) m = mesNum - 1;
        }
      }
      if (m === null) {
        const d = new Date(dtStr);
        if (!isNaN(d.getTime())) {
          m = d.getMonth();
        }
      }
      if (m !== null && m >= 0 && m < 12) {
        evolucaoMensal[m]++;
      }
    }
  });

  const topTipos = Object.entries(mapTipos)
    .map(([tipo, qtd]) => ({ tipo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  // --------------------------------------------------------------------------
  // PÁGINA 1: Capa-Resumo & Metadados & Cartões KPI
  // --------------------------------------------------------------------------
  // Faixa de cabeçalho institucional
  doc.setFillColor(30, 58, 138); // #1e3a8a
  doc.rect(14, 12, 4, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('CRB-4 | Conselho Regional de Biblioteconomia 4ª Região', 22, 17);

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(tituloRelatorio, 22, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Sistema de Gestão Integrada | Relatório Analítico Consolidado de Processos Administrativos', 22, 30);

  // Quadro de Metadados / Filtros
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 35, 269, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('FILTROS APLICADOS', 18, 41);
  doc.text('EMISSÃO E RESPONSÁVEL', 130, 41);
  doc.text('BASE TOTAL', 230, 41);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138);
  doc.text(`Exercício: ${anoTxt}`, 18, 47);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Status: ${context.status || 'Todos'} | Solicitação: ${context.tipo || 'Todas'}`, 18, 52);

  doc.text(`Gerado em: ${dataHoraAtual}`, 130, 47);
  doc.text(`Operador: ${context.usuarioNome || context.operador || 'Administrador CRB-4'}`, 130, 52);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.text(`${total}`, 230, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('processos selecionados', 230, 52);

  // Cartões KPI (6 cartões lado a lado)
  const cardW = 41.5;
  const cardH = 26;
  const cardY = 62;
  const kpisProcessos = [
    { label: 'TOTAL', val: total, bg: [255, 255, 255], border: [203, 213, 225], text: [30, 58, 138], sub: 'Processos no período' },
    { label: 'DEFERIDOS', val: statusCounts['Deferido'] || 0, bg: [236, 253, 245], border: [167, 243, 208], text: [6, 95, 70], sub: 'Aprovados em plenária' },
    { label: 'INDEFERIDOS', val: statusCounts['Indeferido'] || 0, bg: [254, 242, 242], border: [254, 202, 202], text: [153, 27, 27], sub: 'Negados / arquivados' },
    { label: 'PAUTA PLENÁRIA', val: statusCounts['Aguardando Plenária'] || 0, bg: [239, 246, 255], border: [191, 219, 254], text: [30, 58, 138], sub: 'Em julgamento' },
    { label: 'EM ANÁLISE / PENDENTE', val: (statusCounts['Em Análise'] || 0) + (statusCounts['Pendente'] || 0), bg: [245, 243, 255], border: [221, 214, 254], text: [91, 33, 182], sub: 'Com relator' },
    { label: 'AD REFERENDUM', val: statusCounts['Ad Referendum'] || 0, bg: [250, 245, 255], border: [233, 213, 255], text: [107, 33, 168], sub: 'Decisão da presidência' },
  ];

  kpisProcessos.forEach((kpi, idx) => {
    const x = 14 + idx * (cardW + 4);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
    doc.text(kpi.label, x + 3.5, cardY + 6);

    doc.setFontSize(13);
    doc.text(String(kpi.val), x + 3.5, cardY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 3.5, cardY + 22);
  });

  // Resumo Executivo / Destaques na Capa
  const resumoY = 94;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 58, 138);
  doc.text('Síntese das Solicitações e Distribuição de Decisões', 14, resumoY);

  // Tabela síntese dos 8 principais tipos na capa
  const topRows = topTipos.slice(0, 7).map(item => [
    item.tipo,
    String(item.qtd),
    total > 0 ? `${((item.qtd / total) * 100).toFixed(1)}%` : '0%'
  ]);

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: 14 },
    tableWidth: 130,
    head: [['Tipo de Solicitação', 'Qtd', '%']],
    body: topRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' }
    }
  });

  // Tabela síntese dos status na capa
  const stRows = Object.entries(statusCounts)
    .filter(([_, v]) => v > 0)
    .map(([st, v]) => [
      st,
      String(v),
      total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%'
    ]);

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: 153 },
    tableWidth: 130,
    head: [['Status / Estágio Processual', 'Qtd', '%']],
    body: stRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' }
    }
  });

  // --------------------------------------------------------------------------
  // PÁGINA 2: Gráficos & Tabela Cruzada
  // --------------------------------------------------------------------------
  doc.addPage('a4', 'landscape');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setDocTextHex(doc, '#1e3a8a');
  doc.text('Visão Gráfica Analítica e Tabela Cruzada (Tipo x Status)', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setDocTextHex(doc, '#64748b');
  doc.text('Indicadores quantitativos por modalidade, status e evolução temporal com matriz deliberativa', 14, 21);

  setDocDrawHex(doc, '#e2e8f0');
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  // Desenha os 3 gráficos analíticos diretamente com formas nativas no jsPDF
  desenharGraficosNativosProcessos(doc, topTipos, statusCounts, evolucaoMensal, total, 26);

  const tabelaCruzadaStartY = 104;

  // Tabela Cruzada: Tipo de Solicitação x Status
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setDocTextHex(doc, '#1e3a8a');
  doc.text('Tabela Cruzada: Solicitação x Situação Deliberativa', 14, tabelaCruzadaStartY - 3);

  const cruzadaHead = ['Tipo de Solicitação', ...COLUNAS_STATUS, 'Total'];
  const cruzadaRows = Object.entries(matrizCruzada).map(([tipo, stMap]) => {
    const rowTotal = Object.values(stMap).reduce((acc, v) => acc + v, 0);
    return [
      tipo,
      ...COLUNAS_STATUS.map(st => String(stMap[st] || 0)),
      String(rowTotal)
    ];
  }).sort((a, b) => parseInt(b[b.length - 1], 10) - parseInt(a[a.length - 1], 10));

  // Linha de total geral no rodapé da tabela cruzada
  const cruzadaFoot = [
    'Total Geral',
    ...COLUNAS_STATUS.map(st => {
      const sum = Object.values(matrizCruzada).reduce((acc, stMap) => acc + (stMap[st] || 0), 0);
      return String(sum);
    }),
    String(total)
  ];

  autoTable(doc, {
    startY: tabelaCruzadaStartY,
    margin: { left: 14, right: 14 },
    head: [cruzadaHead],
    body: cruzadaRows,
    foot: [cruzadaFoot],
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 58, 138], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left', fontStyle: 'bold' },
      [cruzadaHead.length - 1]: { fontStyle: 'bold', fillColor: [241, 245, 249] }
    }
  });

  // --------------------------------------------------------------------------
  // PÁGINA 3+: Listagem Completa de Processos
  // --------------------------------------------------------------------------
  doc.addPage('a4', 'landscape');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.text(`Listagem Completa de Processos (${total} registros)`, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Relação analítica dos registros cadastrados com paginação contínua e colunas fixas', 14, 21);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  // Mapeamento limpo das linhas da tabela
  const tableDataProcessos = sorted.map(p => {
    const num = p.numero || p.numeroProcesso || '';
    const interessado = (p.profissional || p.interessado || '').trim();
    const solicitacao = (p.solicitacao || p.descricao || '').trim();
    const dataSol = formatarDataBR(p.dataSolicitacao || p.dataAbertura || p.createdAt);
    const status = normalizarStatusProcesso(p.status);
    const plenaria = formatarPlenariaProcesso(p);
    const obs = (p.observacao || p.registro || '').trim();

    return [num, interessado, solicitacao, dataSol, status, plenaria, obs];
  });

  autoTable(doc, {
    startY: 26,
    margin: { left: 14, right: 14, top: 20, bottom: 15 },
    showHead: 'everyPage',
    head: [[
      'Nº Processo',
      'Interessado / Profissional',
      'Solicitação',
      'Data Solicitação',
      'Status',
      'Plenária',
      'Registro / Observação'
    ]],
    body: tableDataProcessos,
    theme: 'striped',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      overflow: 'linebreak',
      textColor: [51, 65, 85],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', textColor: [30, 58, 138] }, // Nº Processo
      1: { cellWidth: 56 }, // Interessado
      2: { cellWidth: 52 }, // Solicitação
      3: { cellWidth: 26, halign: 'center' }, // Data
      4: { cellWidth: 32, halign: 'center', fontStyle: 'bold' }, // Status
      5: { cellWidth: 35 }, // Plenária
      6: { cellWidth: 40 }  // Observação
    }
  });

  aplicarRodapeGlobal(doc);

  const dataIsoHoje = new Date().toISOString().split('T')[0];
  const nomeArquivo = `Relatorio_Processos_${context.ano || 'Geral'}_${dataIsoHoje}.pdf`;
  doc.save(nomeArquivo);
}

// ============================================================================
// EXPORTAÇÃO PDF: OFÍCIOS
// ============================================================================

export async function exportarRelatorioPdfOficios(
  oficios: any[],
  context: ExportContext
): Promise<void> {
  const sorted = [...oficios].sort(compararNumeroDesc);
  const total = sorted.length;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const anoTxt = context.ano ? context.ano : 'Todos os Anos';
  const tituloRelatorio = `Relatório de Ofícios Expedidos ${anoTxt}`;
  const dataHoraAtual = new Date().toLocaleString('pt-BR');

  // Métricas
  const statusCounts: Record<string, number> = {
    'Enviado': 0,
    'Aguardando Envio': 0,
    'Pendente': 0,
    'Cancelado': 0,
    'Outros': 0
  };

  const mapTipos: Record<string, number> = {};
  const mapAssuntos: Record<string, number> = {};
  const COLUNAS_STATUS_OFICIOS = ['Enviado', 'Aguardando Envio', 'Pendente', 'Cancelado', 'Outros'];
  const matrizCruzada: Record<string, Record<string, number>> = {};
  const evolucaoMensalOficios = new Array(12).fill(0);

  sorted.forEach(o => {
    const rawSt = String(o.status || '').trim();
    let stNorm = 'Enviado';
    if (/aguardando/i.test(rawSt)) stNorm = 'Aguardando Envio';
    else if (/pendente/i.test(rawSt)) stNorm = 'Pendente';
    else if (/cancelado|sem efeito/i.test(rawSt)) stNorm = 'Cancelado';
    else if (/enviado|protocolado/i.test(rawSt)) stNorm = 'Enviado';
    else if (rawSt) stNorm = rawSt;

    if (statusCounts[stNorm] !== undefined) statusCounts[stNorm]++;
    else statusCounts['Outros']++;

    const rawTipo = o.tipoOficio || o.tipo;
    const tpNorm = normalizarTipoOficio(rawTipo);
    mapTipos[tpNorm] = (mapTipos[tpNorm] || 0) + 1;

    const assNorm = normalizarAssuntoOficio(o.assunto);
    mapAssuntos[assNorm] = (mapAssuntos[assNorm] || 0) + 1;

    if (!matrizCruzada[tpNorm]) {
      matrizCruzada[tpNorm] = {};
      COLUNAS_STATUS_OFICIOS.forEach(c => { matrizCruzada[tpNorm][c] = 0; });
    }
    const stCol = COLUNAS_STATUS_OFICIOS.includes(stNorm) ? stNorm : 'Outros';
    matrizCruzada[tpNorm][stCol] = (matrizCruzada[tpNorm][stCol] || 0) + 1;

    // Extração do mês de envio do ofício
    const dtStr = o.dataEnvio || o.dataEmissao || o.data || o.createdAt;
    if (dtStr) {
      let m: number | null = null;
      if (typeof dtStr === 'string' && dtStr.includes('/')) {
        const parts = dtStr.split('/');
        if (parts.length >= 2) {
          const mesNum = parseInt(parts[1], 10);
          if (mesNum >= 1 && mesNum <= 12) m = mesNum - 1;
        }
      }
      if (m === null) {
        const d = new Date(dtStr);
        if (!isNaN(d.getTime())) {
          m = d.getMonth();
        }
      }
      if (m !== null && m >= 0 && m < 12) {
        evolucaoMensalOficios[m]++;
      }
    }
  });

  const topTipos = Object.entries(mapTipos)
    .map(([tipo, qtd]) => ({ tipo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  const topAssuntos = Object.entries(mapAssuntos)
    .map(([assunto, qtd]) => ({ assunto, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  // --------------------------------------------------------------------------
  // PÁGINA 1: Capa-Resumo & Metadados & Cartões KPI
  // --------------------------------------------------------------------------
  doc.setFillColor(30, 58, 138);
  doc.rect(14, 12, 4, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('CRB-4 | Conselho Regional de Biblioteconomia 4ª Região', 22, 17);

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(tituloRelatorio, 22, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Sistema de Gestão Integrada | Relatório Analítico Consolidado de Correspondências Oficiais', 22, 30);

  // Quadro de Metadados / Filtros
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 35, 269, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('FILTROS APLICADOS', 18, 41);
  doc.text('EMISSÃO E RESPONSÁVEL', 130, 41);
  doc.text('BASE TOTAL', 230, 41);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138);
  doc.text(`Exercício: ${anoTxt}`, 18, 47);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Status: ${context.status || 'Todos'} | Modalidade: ${context.tipo || 'Todas'}`, 18, 52);

  doc.text(`Gerado em: ${dataHoraAtual}`, 130, 47);
  doc.text(`Operador: ${context.usuarioNome || context.operador || 'Administrador CRB-4'}`, 130, 52);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.text(`${total}`, 230, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('ofícios expedidos', 230, 52);

  // Cartões KPI
  const cardW = 50.5;
  const cardH = 26;
  const cardY = 62;
  const kpisOficios = [
    { label: 'TOTAL EXPEDIDO', val: total, bg: [255, 255, 255], border: [203, 213, 225], text: [30, 58, 138], sub: 'Correspondências no período' },
    { label: 'ENVIADOS', val: statusCounts['Enviado'] || 0, bg: [236, 253, 245], border: [167, 243, 208], text: [6, 95, 70], sub: 'Protocolados com sucesso' },
    { label: 'AGUARDANDO ENVIO', val: (statusCounts['Aguardando Envio'] || 0) + (statusCounts['Pendente'] || 0), bg: [245, 243, 255], border: [221, 214, 254], text: [91, 33, 182], sub: 'Em preparação / pendentes' },
    { label: 'CANCELADOS', val: statusCounts['Cancelado'] || 0, bg: [254, 242, 242], border: [254, 202, 202], text: [153, 27, 27], sub: 'Sem efeito legal' },
    { label: 'MODALIDADE PRINCIPAL', val: topTipos.length > 0 ? `${topTipos[0].tipo} (${topTipos[0].qtd})` : '-', bg: [239, 246, 255], border: [191, 219, 254], text: [30, 58, 138], sub: 'Maior volume expedido' },
  ];

  kpisOficios.forEach((kpi, idx) => {
    const x = 14 + idx * (cardW + 4);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
    doc.text(kpi.label, x + 3.5, cardY + 6);

    doc.setFontSize(11);
    doc.text(String(kpi.val), x + 3.5, cardY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 3.5, cardY + 22);
  });

  // Tabelas de síntese na capa
  const resumoY = 94;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 58, 138);
  doc.text('Distribuição por Modalidade e Assunto', 14, resumoY);

  const topTiposRows = topTipos.slice(0, 6).map(item => [
    item.tipo,
    String(item.qtd),
    total > 0 ? `${((item.qtd / total) * 100).toFixed(1)}%` : '0%'
  ]);

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: 14 },
    tableWidth: 130,
    head: [['Modalidade de Ofício', 'Qtd', '%']],
    body: topTiposRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' }
    }
  });

  const topAssuntosRows = topAssuntos.slice(0, 6).map(item => [
    item.assunto,
    String(item.qtd),
    total > 0 ? `${((item.qtd / total) * 100).toFixed(1)}%` : '0%'
  ]);

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: 153 },
    tableWidth: 130,
    head: [['Assuntos Mais Frequentes', 'Qtd', '%']],
    body: topAssuntosRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' }
    }
  });

  // --------------------------------------------------------------------------
  // PÁGINA 2: Gráficos & Tabela Cruzada
  // --------------------------------------------------------------------------
  doc.addPage('a4', 'landscape');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setDocTextHex(doc, '#1e3a8a');
  doc.text('Visão Gráfica Analítica e Tabela Cruzada (Tipo x Status)', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setDocTextHex(doc, '#64748b');
  doc.text('Demonstrativo analítico das correspondências oficiais por tipo, assunto e evolução temporal', 14, 21);

  setDocDrawHex(doc, '#e2e8f0');
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  // Desenha os 3 gráficos analíticos diretamente com formas nativas no jsPDF
  desenharGraficosNativosOficios(doc, topTipos, topAssuntos, statusCounts, evolucaoMensalOficios, total, 26);

  const tabelaCruzadaStartY = 104;

  // Tabela Cruzada: Tipo x Status
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setDocTextHex(doc, '#1e3a8a');
  doc.text('Tabela Cruzada: Modalidade de Ofício x Status', 14, tabelaCruzadaStartY - 3);

  const cruzadaHead = ['Tipo de Ofício', ...COLUNAS_STATUS_OFICIOS, 'Total'];
  const cruzadaRows = Object.entries(matrizCruzada).map(([tipo, stMap]) => {
    const rowTotal = Object.values(stMap).reduce((acc, v) => acc + v, 0);
    return [
      tipo,
      ...COLUNAS_STATUS_OFICIOS.map(st => String(stMap[st] || 0)),
      String(rowTotal)
    ];
  }).sort((a, b) => parseInt(b[b.length - 1], 10) - parseInt(a[a.length - 1], 10));

  const cruzadaFoot = [
    'Total Geral',
    ...COLUNAS_STATUS_OFICIOS.map(st => {
      const sum = Object.values(matrizCruzada).reduce((acc, stMap) => acc + (stMap[st] || 0), 0);
      return String(sum);
    }),
    String(total)
  ];

  autoTable(doc, {
    startY: tabelaCruzadaStartY,
    margin: { left: 14, right: 14 },
    head: [cruzadaHead],
    body: cruzadaRows,
    foot: [cruzadaFoot],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 58, 138], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left', fontStyle: 'bold' },
      [cruzadaHead.length - 1]: { fontStyle: 'bold', fillColor: [241, 245, 249] }
    }
  });

  // --------------------------------------------------------------------------
  // PÁGINA 3+: Listagem Completa de Ofícios
  // --------------------------------------------------------------------------
  doc.addPage('a4', 'landscape');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.text(`Listagem Completa de Ofícios Expedidos (${total} registros)`, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Relação de correspondências oficiais expedidas pelo conselho regional', 14, 21);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  const tableDataOficios = sorted.map(o => {
    const num = o.numero || o.numeroOficio || '';
    const assunto = (o.assunto || '').trim();
    const tipo = normalizarTipoOficio(o.tipoOficio || o.tipo);
    const dest = (o.destinatario || o.orgaoDestino || '').trim();
    const dataEnvio = formatarDataBR(o.dataEnvio || o.dataEmissao || o.createdAt);
    const status = (o.status || '').trim();
    const obs = (o.observacao || '').trim();

    return [num, assunto, tipo, dest, dataEnvio, status, obs];
  });

  autoTable(doc, {
    startY: 26,
    margin: { left: 14, right: 14, top: 20, bottom: 15 },
    showHead: 'everyPage',
    head: [[
      'Nº Ofício',
      'Assunto',
      'Tipo de Ofício',
      'Destinatário',
      'Data de Envio',
      'Status',
      'Observação'
    ]],
    body: tableDataOficios,
    theme: 'striped',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      overflow: 'linebreak',
      textColor: [51, 65, 85],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', textColor: [30, 58, 138] }, // Nº Ofício
      1: { cellWidth: 54 }, // Assunto
      2: { cellWidth: 30 }, // Tipo
      3: { cellWidth: 58 }, // Destinatário
      4: { cellWidth: 26, halign: 'center' }, // Data Envio
      5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }, // Status
      6: { cellWidth: 45 }  // Observação
    }
  });

  aplicarRodapeGlobal(doc);

  const dataIsoHoje = new Date().toISOString().split('T')[0];
  const nomeArquivo = `Relatorio_Oficios_${context.ano || 'Geral'}_${dataIsoHoje}.pdf`;
  doc.save(nomeArquivo);
}

// ============================================================================
// EXPORTAÇÃO EXCEL MULTI-ABA: PROCESSOS E OFÍCIOS
// ============================================================================

export function exportarRelatorioExcelProcessos(
  processos: any[],
  context: ExportContext
): void {
  const sorted = [...processos].sort(compararNumeroDesc);
  const total = sorted.length;
  const wb = XLSX.utils.book_new();

  // 1. Aba de Dados Limpa
  const linhasDados = sorted.map(p => ({
    'Nº Processo': p.numero || p.numeroProcesso || '',
    'Interessado / Profissional': (p.profissional || p.interessado || '').trim(),
    'Solicitação': (p.solicitacao || p.descricao || '').trim(),
    'Data da Solicitação': formatarDataBR(p.dataSolicitacao || p.dataAbertura || p.createdAt),
    'Status': normalizarStatusProcesso(p.status),
    'Plenária': formatarPlenariaProcesso(p),
    'Registro / Observação': (p.observacao || p.registro || '').trim()
  }));

  const wsDados = XLSX.utils.json_to_sheet(linhasDados);
  XLSX.utils.book_append_sheet(wb, wsDados, 'Processos');

  // 2. Aba de Resumo
  const statusCounts: Record<string, number> = {};
  const mapTipos: Record<string, number> = {};
  const COLUNAS_STATUS = ['Deferido', 'Indeferido', 'Aguardando Plenária', 'Em Análise', 'Pendente', 'Ad Referendum', 'Outros'];
  const matrizCruzada: Record<string, Record<string, number>> = {};

  sorted.forEach(p => {
    const stNorm = normalizarStatusProcesso(p.status);
    const tpNorm = normalizarTipoSolicitacao(p.solicitacao || p.descricao);

    statusCounts[stNorm] = (statusCounts[stNorm] || 0) + 1;
    mapTipos[tpNorm] = (mapTipos[tpNorm] || 0) + 1;

    if (!matrizCruzada[tpNorm]) {
      matrizCruzada[tpNorm] = {};
      COLUNAS_STATUS.forEach(c => { matrizCruzada[tpNorm][c] = 0; });
    }
    const stCol = COLUNAS_STATUS.includes(stNorm) ? stNorm : 'Outros';
    matrizCruzada[tpNorm][stCol] = (matrizCruzada[tpNorm][stCol] || 0) + 1;
  });

  const resumoKPIs = [
    { 'Métrica': 'Total de Processos', 'Quantidade': total, 'Percentual': '100%' },
    ...Object.entries(statusCounts).map(([st, qtd]) => ({
      'Métrica': `Status: ${st}`,
      'Quantidade': qtd,
      'Percentual': total > 0 ? `${((qtd / total) * 100).toFixed(1)}%` : '0%'
    })),
    ...Object.entries(mapTipos).sort((a, b) => b[1] - a[1]).map(([tp, qtd]) => ({
      'Métrica': `Solicitação: ${tp}`,
      'Quantidade': qtd,
      'Percentual': total > 0 ? `${((qtd / total) * 100).toFixed(1)}%` : '0%'
    }))
  ];

  const wsResumo = XLSX.utils.json_to_sheet(resumoKPIs);
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // 3. Aba de Tabela Cruzada
  const linhasCruzada = Object.entries(matrizCruzada).map(([tp, stMap]) => {
    const row: Record<string, any> = { 'Tipo de Solicitação': tp };
    COLUNAS_STATUS.forEach(c => {
      row[c] = stMap[c] || 0;
    });
    row['Total'] = Object.values(stMap).reduce((acc, v) => acc + v, 0);
    return row;
  });

  const wsCruzada = XLSX.utils.json_to_sheet(linhasCruzada);
  XLSX.utils.book_append_sheet(wb, wsCruzada, 'Tabela Cruzada');

  const dataIsoHoje = new Date().toISOString().split('T')[0];
  const nomeArquivo = `Relatorio_Processos_${context.ano || 'Geral'}_${dataIsoHoje}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);
}

export function exportarRelatorioExcelOficios(
  oficios: any[],
  context: ExportContext
): void {
  const sorted = [...oficios].sort(compararNumeroDesc);
  const total = sorted.length;
  const wb = XLSX.utils.book_new();

  // 1. Aba de Dados Limpa
  const linhasDados = sorted.map(o => ({
    'Nº Ofício': o.numero || o.numeroOficio || '',
    'Assunto': (o.assunto || '').trim(),
    'Tipo de Ofício': normalizarTipoOficio(o.tipoOficio || o.tipo),
    'Destinatário': (o.destinatario || o.orgaoDestino || '').trim(),
    'Data de Envio': formatarDataBR(o.dataEnvio || o.dataEmissao || o.createdAt),
    'Status': (o.status || '').trim(),
    'Observação': (o.observacao || '').trim()
  }));

  const wsDados = XLSX.utils.json_to_sheet(linhasDados);
  XLSX.utils.book_append_sheet(wb, wsDados, 'Oficios');

  // 2. Aba de Resumo
  const statusCounts: Record<string, number> = {};
  const mapTipos: Record<string, number> = {};
  const mapAssuntos: Record<string, number> = {};
  const COLUNAS_STATUS = ['Enviado', 'Aguardando Envio', 'Pendente', 'Cancelado', 'Outros'];
  const matrizCruzada: Record<string, Record<string, number>> = {};

  sorted.forEach(o => {
    const rawSt = String(o.status || '').trim();
    let stNorm = 'Enviado';
    if (/aguardando/i.test(rawSt)) stNorm = 'Aguardando Envio';
    else if (/pendente/i.test(rawSt)) stNorm = 'Pendente';
    else if (/cancelado|sem efeito/i.test(rawSt)) stNorm = 'Cancelado';
    else if (/enviado|protocolado/i.test(rawSt)) stNorm = 'Enviado';
    else if (rawSt) stNorm = rawSt;

    statusCounts[stNorm] = (statusCounts[stNorm] || 0) + 1;

    const tpNorm = normalizarTipoOficio(o.tipoOficio || o.tipo);
    mapTipos[tpNorm] = (mapTipos[tpNorm] || 0) + 1;

    const assNorm = normalizarAssuntoOficio(o.assunto);
    mapAssuntos[assNorm] = (mapAssuntos[assNorm] || 0) + 1;

    if (!matrizCruzada[tpNorm]) {
      matrizCruzada[tpNorm] = {};
      COLUNAS_STATUS.forEach(c => { matrizCruzada[tpNorm][c] = 0; });
    }
    const stCol = COLUNAS_STATUS.includes(stNorm) ? stNorm : 'Outros';
    matrizCruzada[tpNorm][stCol] = (matrizCruzada[tpNorm][stCol] || 0) + 1;
  });

  const resumoKPIs = [
    { 'Métrica': 'Total de Ofícios Expedidos', 'Quantidade': total, 'Percentual': '100%' },
    ...Object.entries(statusCounts).map(([st, qtd]) => ({
      'Métrica': `Status: ${st}`,
      'Quantidade': qtd,
      'Percentual': total > 0 ? `${((qtd / total) * 100).toFixed(1)}%` : '0%'
    })),
    ...Object.entries(mapTipos).sort((a, b) => b[1] - a[1]).map(([tp, qtd]) => ({
      'Métrica': `Modalidade: ${tp}`,
      'Quantidade': qtd,
      'Percentual': total > 0 ? `${((qtd / total) * 100).toFixed(1)}%` : '0%'
    })),
    ...Object.entries(mapAssuntos).sort((a, b) => b[1] - a[1]).map(([ass, qtd]) => ({
      'Métrica': `Assunto: ${ass}`,
      'Quantidade': qtd,
      'Percentual': total > 0 ? `${((qtd / total) * 100).toFixed(1)}%` : '0%'
    }))
  ];

  const wsResumo = XLSX.utils.json_to_sheet(resumoKPIs);
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // 3. Aba de Tabela Cruzada
  const linhasCruzada = Object.entries(matrizCruzada).map(([tp, stMap]) => {
    const row: Record<string, any> = { 'Tipo de Ofício': tp };
    COLUNAS_STATUS.forEach(c => {
      row[c] = stMap[c] || 0;
    });
    row['Total'] = Object.values(stMap).reduce((acc, v) => acc + v, 0);
    return row;
  });

  const wsCruzada = XLSX.utils.json_to_sheet(linhasCruzada);
  XLSX.utils.book_append_sheet(wb, wsCruzada, 'Tabela Cruzada');

  const dataIsoHoje = new Date().toISOString().split('T')[0];
  const nomeArquivo = `Relatorio_Oficios_${context.ano || 'Geral'}_${dataIsoHoje}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);
}
