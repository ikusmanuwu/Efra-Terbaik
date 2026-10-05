export interface Transaksi {
  id: string;
  tanggal: string; // YYYY-MM-DD
  item: string;
  kategori: string;
  tipe: 'Pengeluaran' | 'Pemasukan' | 'Saving/Invest' | string;
  jumlah: number;
  catatan?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface Anggaran {
  kategori: string;
  budget: number;
}

export interface PemasukanRutin {
  id: string;
  sumber: string;
  jumlah: number;
}

export interface TargetSaving {
  id: number;
  target: number;
}

export interface MasterKategori {
  id: string;
  nama: string;
  kelompok_anggaran?: string | null;
  urutan: number;
}

export interface MasterTipe {
  id: string;
  nama: string;
  urutan: number;
}

export type PeriodeMode = 'auto_salary' | 'fixed_day' | 'custom';

export interface PengaturanPeriode {
  id?: number;
  mode: PeriodeMode;
  tanggal_gajian_tetap: number; // 1 - 31, default 25
  kata_kunci_gaji: string; // comma separated: 'gaji,gajian,payroll,salary'
  auto_close_on_next: boolean;
  budget_override?: Record<string, number>; // optional override per category
}

export interface PeriodeModel {
  id: string;
  nama: string;
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string; // YYYY-MM-DD
  is_berjalan: boolean;
  gaji_transaksi_id?: string;
  gaji_jumlah?: number;
  catatan?: string;
  target_saving?: number;
}
