import { Transaksi, PengaturanPeriode, PeriodeModel } from './types';

export const DEFAULT_PENGATURAN_PERIODE: PengaturanPeriode = {
  mode: 'auto_salary',
  tanggal_gajian_tetap: 25,
  kata_kunci_gaji: 'gaji,gajian,payroll,salary',
  auto_close_on_next: true,
  budget_override: {}
};

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatRupiah(amount: number): string {
  return 'Rp' + Math.round(amount || 0).toLocaleString('id-ID');
}

/**
 * Check if a transaction is a salary / gaji transaction
 */
export function isSalaryTransaction(tx: Transaksi, keywords: string[]): boolean {
  if (tx.tipe !== 'Pemasukan') return false;
  const itemLower = (tx.item || '').toLowerCase();
  const catLower = (tx.kategori || '').toLowerCase();
  const noteLower = (tx.catatan || '').toLowerCase();

  return keywords.some(k => {
    const kw = k.trim().toLowerCase();
    if (!kw) return false;
    return itemLower.includes(kw) || catLower.includes(kw) || noteLower.includes(kw);
  });
}

/**
 * Generate default periodic range based on fixed cutoff day
 * e.g. cutoff day 25
 */
export function getFixedPaydayRange(cutoffDay: number, referenceDateStr?: string): { start: string; end: string } {
  const today = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  let startYear = currentYear;
  let startMonth = currentMonth;

  if (currentDay >= cutoffDay) {
    // Current period started on cutoffDay of this month
    startMonth = currentMonth;
    startYear = currentYear;
  } else {
    // Current period started on cutoffDay of previous month
    if (currentMonth === 0) {
      startMonth = 11;
      startYear = currentYear - 1;
    } else {
      startMonth = currentMonth - 1;
    }
  }

  const startDate = new Date(startYear, startMonth, cutoffDay);
  const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
  
  // End date is today for active period
  const todayStr = getTodayDateString();

  return {
    start: startStr,
    end: todayStr
  };
}

/**
 * Calculate the projected next payday based on last payday or fixed cutoff
 */
export function getNextPayday(lastPaydayStr: string, fixedCutoffDay: number = 25): { dateStr: string; daysLeft: number } {
  const [y, m, d] = lastPaydayStr.split('-').map(Number);
  const lastDate = new Date(y, m - 1, d);
  
  // Next payday is roughly 1 month after last payday
  const nextMonthDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, fixedCutoffDay || d);
  const nextStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDate.getDate()).padStart(2, '0')}`;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  nextMonthDate.setHours(0, 0, 0, 0);

  const diffTime = nextMonthDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    dateStr: nextStr,
    daysLeft: Math.max(0, diffDays)
  };
}

/**
 * Compute periods from all transactions
 */
export function computePeriods(
  transactions: Transaksi[],
  settings: PengaturanPeriode,
  customPeriods: PeriodeModel[] = []
): { activePeriod: PeriodeModel; allPeriods: PeriodeModel[] } {
  const keywords = settings.kata_kunci_gaji.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const todayStr = getTodayDateString();

  // Find all salary transactions sorted by date descending
  const salaryTxs = transactions
    .filter(tx => isSalaryTransaction(tx, keywords))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const periodsList: PeriodeModel[] = [];

  if (settings.mode === 'auto_salary' && salaryTxs.length > 0) {
    // Mode 1: Auto salary detection
    // Active period is from the latest salary up to today
    const latestSalary = salaryTxs[0];
    const activeStartDate = latestSalary.tanggal;
    
    const activePeriod: PeriodeModel = {
      id: `period-${latestSalary.id}`,
      nama: `Periode Berjalan (${formatDateIndo(activeStartDate)} - Hari Ini)`,
      tanggal_mulai: activeStartDate,
      tanggal_selesai: todayStr,
      is_berjalan: true,
      gaji_transaksi_id: latestSalary.id,
      gaji_jumlah: latestSalary.jumlah,
      catatan: latestSalary.item
    };
    periodsList.push(activePeriod);

    // Compute previous periods from remaining salary transactions
    for (let i = 0; i < salaryTxs.length; i++) {
      const currentSalary = salaryTxs[i];
      if (i > 0) {
        // Previous period starts at currentSalary.tanggal, ends at (salaryTxs[i-1].tanggal - 1 day)
        const nextSalaryDate = new Date(salaryTxs[i - 1].tanggal);
        nextSalaryDate.setDate(nextSalaryDate.getDate() - 1);
        const endDateStr = `${nextSalaryDate.getFullYear()}-${String(nextSalaryDate.getMonth() + 1).padStart(2, '0')}-${String(nextSalaryDate.getDate()).padStart(2, '0')}`;

        periodsList.push({
          id: `period-${currentSalary.id}`,
          nama: `Periode ${formatDateIndo(currentSalary.tanggal)} - ${formatDateIndo(endDateStr)}`,
          tanggal_mulai: currentSalary.tanggal,
          tanggal_selesai: endDateStr,
          is_berjalan: false,
          gaji_transaksi_id: currentSalary.id,
          gaji_jumlah: currentSalary.jumlah,
          catatan: currentSalary.item
        });
      }
    }
  } else {
    // Mode 2: Fixed day cycle or fallback if no salary found
    const cutoff = settings.tanggal_gajian_tetap || 25;
    const { start } = getFixedPaydayRange(cutoff);

    const activePeriod: PeriodeModel = {
      id: `period-fixed-active`,
      nama: `Periode Berjalan (${formatDateIndo(start)} - Hari Ini)`,
      tanggal_mulai: start,
      tanggal_selesai: todayStr,
      is_berjalan: true,
      catatan: `Siklus tanggal ${cutoff}`
    };
    periodsList.push(activePeriod);

    // Generate 3 previous monthly cycles
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    for (let i = 1; i <= 3; i++) {
      const prevStartDate = new Date(startYear, startMonth - 1 - i, cutoff);
      const prevEndDate = new Date(startYear, startMonth - 1 - i + 1, cutoff - 1);
      
      const pStart = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}-${String(prevStartDate.getDate()).padStart(2, '0')}`;
      const pEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevEndDate.getDate()).padStart(2, '0')}`;

      periodsList.push({
        id: `period-fixed-${i}`,
        nama: `Periode ${formatDateIndo(pStart)} - ${formatDateIndo(pEnd)}`,
        tanggal_mulai: pStart,
        tanggal_selesai: pEnd,
        is_berjalan: false,
        catatan: `Siklus tanggal ${cutoff}`
      });
    }
  }

  // Merge any custom periods created by user
  customPeriods.forEach(cp => {
    if (!periodsList.some(p => p.id === cp.id)) {
      periodsList.push(cp);
    }
  });

  // Sort periods by start date descending
  periodsList.sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai));

  const activePeriod = periodsList.find(p => p.is_berjalan) || periodsList[0];
  return { activePeriod, allPeriods: periodsList };
}

/**
 * Filter transactions within a period
 */
export function filterTransactionsByPeriod(transactions: Transaksi[], period: PeriodeModel): Transaksi[] {
  return transactions.filter(t => {
    return t.tanggal >= period.tanggal_mulai && t.tanggal <= period.tanggal_selesai;
  });
}

/**
 * Calculate stats for a period
 */
export interface PeriodStats {
  totalPengeluaran: number;
  totalPemasukan: number;
  totalSaving: number;
  sisaAnggaran: number;
  daysPassed: number;
  daysRemaining: number;
  dailyAvgSpent: number;
  dailyRecommendedQuota: number;
  savingRatio: number;
  netCashflow: number; // Pemasukan - Pengeluaran
  netCashflowAfterSaving: number; // Pemasukan - Pengeluaran - Saving
  isSurplus: boolean;
  statusLabel: 'Surplus' | 'Defisit' | 'Imbang';
}

export function calculatePeriodStats(
  transactionsInPeriod: Transaksi[],
  totalBudget: number,
  period: PeriodeModel,
  fixedCutoffDay: number = 25
): PeriodStats {
  let totalPengeluaran = 0;
  let totalPemasukan = 0;
  let totalSaving = 0;

  transactionsInPeriod.forEach(t => {
    const amt = Number(t.jumlah) || 0;
    if (t.tipe === 'Pengeluaran') {
      totalPengeluaran += amt;
    } else if (t.tipe === 'Pemasukan') {
      totalPemasukan += amt;
    } else if (t.tipe === 'Saving/Invest' || t.kategori === 'Invest') {
      totalSaving += amt;
    }
  });

  // Days calculation
  const start = new Date(period.tanggal_mulai);
  const end = new Date(period.tanggal_selesai);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const daysPassed = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

  // Projected next payday
  const nextPayday = getNextPayday(period.tanggal_mulai, fixedCutoffDay);
  const daysRemaining = period.is_berjalan ? Math.max(1, nextPayday.daysLeft) : 0;

  const sisaAnggaran = totalBudget - totalPengeluaran;
  const dailyAvgSpent = Math.round(totalPengeluaran / daysPassed);
  const dailyRecommendedQuota = daysRemaining > 0 && sisaAnggaran > 0 ? Math.round(sisaAnggaran / daysRemaining) : 0;
  const savingRatio = totalPemasukan > 0 ? Math.round((totalSaving / totalPemasukan) * 100) : 0;

  const netCashflow = totalPemasukan - totalPengeluaran;
  const netCashflowAfterSaving = totalPemasukan - totalPengeluaran - totalSaving;
  const isSurplus = netCashflow > 0;
  const statusLabel: 'Surplus' | 'Defisit' | 'Imbang' =
    netCashflow > 0 ? 'Surplus' : netCashflow < 0 ? 'Defisit' : 'Imbang';

  return {
    totalPengeluaran,
    totalPemasukan,
    totalSaving,
    sisaAnggaran,
    daysPassed,
    daysRemaining,
    dailyAvgSpent,
    dailyRecommendedQuota,
    savingRatio,
    netCashflow,
    netCashflowAfterSaving,
    isSurplus,
    statusLabel
  };
}
