import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Wallet,
  TrendingDown,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  Clock,
  Settings,
  Search,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  BarChart3,
  ListFilter
} from 'lucide-react';
import { supabase, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from './supabaseClient';
import {
  Transaksi,
  Anggaran,
  PemasukanRutin,
  TargetSaving,
  MasterKategori,
  MasterTipe,
  PengaturanPeriode,
  PeriodeModel
} from './types';
import {
  computePeriods,
  filterTransactionsByPeriod,
  calculatePeriodStats,
  formatRupiah,
  formatDateIndo,
  getTodayDateString,
  DEFAULT_PENGATURAN_PERIODE
} from './periodUtils';

type ActiveTab = 'input' | 'periode' | 'anggaran' | 'transaksi' | 'dashboard' | 'ringkasan' | 'master' | 'netlify';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('input');
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Core Data
  const [transaksiList, setTransaksiList] = useState<Transaksi[]>([]);
  const [anggaranList, setAnggaranList] = useState<Anggaran[]>([]);
  const [pemasukanRutinList, setPemasukanRutinList] = useState<PemasukanRutin[]>([]);
  const [targetSaving, setTargetSaving] = useState<number>(0);
  const [masterKategori, setMasterKategori] = useState<MasterKategori[]>([]);
  const [masterTipe, setMasterTipe] = useState<MasterTipe[]>([]);

  // Period state
  const [periodSettings, setPeriodSettings] = useState<PengaturanPeriode>(() => {
    const saved = localStorage.getItem('efrat_period_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_PENGATURAN_PERIODE;
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // New Transaction Form state
  const [fTanggal, setFTanggal] = useState<string>(getTodayDateString());
  const [fItem, setFItem] = useState<string>('');
  const [fKategori, setFKategori] = useState<string>('');
  const [fTipe, setFTipe] = useState<string>('Pengeluaran');
  const [fJumlah, setFJumlah] = useState<string>('');
  const [fCatatan, setFCatatan] = useState<string>('');
  const [formErr, setFormErr] = useState<string>('');
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Edit Transaction Modal state
  const [editingTx, setEditingTx] = useState<Transaksi | null>(null);

  // Filter Transaction Tab state
  const [txFilterDari, setTxFilterDari] = useState<string>('');
  const [txFilterSampai, setTxFilterSampai] = useState<string>('');
  const [txFilterKategori, setTxFilterKategori] = useState<string>('');
  const [txFilterTipe, setTxFilterTipe] = useState<string>('');
  const [txFilterSearch, setTxFilterSearch] = useState<string>('');

  // Netlify Copy state
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Auth Modal state
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('ikusmanuwu@gmail.com');
  const [loginPass, setLoginPass] = useState<string>('');
  const [loginErr, setLoginErr] = useState<string>('');

  // 1. Initial Data Fetching
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Check auth session
      const { data: sessionData } = await supabase.auth.getSession();
      setCurrentUser(sessionData?.session?.user?.email || null);

      // Fetch all tables in parallel
      const [
        { data: txs },
        { data: angs },
        { data: pems },
        { data: tgt },
        { data: kats },
        { data: tips }
      ] = await Promise.all([
        supabase.from('transaksi').select('*').order('tanggal', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('anggaran').select('*'),
        supabase.from('pemasukan_rutin').select('*').order('sumber'),
        supabase.from('target_saving').select('*').eq('id', 1).maybeSingle(),
        supabase.from('master_kategori').select('*').order('urutan').order('nama'),
        supabase.from('master_tipe').select('*').order('urutan').order('nama')
      ]);

      if (txs) setTransaksiList(txs);
      if (angs) setAnggaranList(angs);
      if (pems) setPemasukanRutinList(pems);
      if (tgt) setTargetSaving(tgt.target || 0);
      if (kats) {
        setMasterKategori(kats);
        if (kats.length > 0 && !fKategori) {
          setFKategori(kats[0].nama);
        }
      }
      if (tips) {
        setMasterTipe(tips);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Save period settings to localStorage
  useEffect(() => {
    localStorage.setItem('efrat_period_settings', JSON.stringify(periodSettings));
  }, [periodSettings]);

  // Compute Periods from all transactions
  const { activePeriod, allPeriods } = useMemo(() => {
    return computePeriods(transaksiList, periodSettings);
  }, [transaksiList, periodSettings]);

  // Selected Period for Anggaran / Dashboard / Filter
  const currentSelectedPeriod = useMemo(() => {
    if (selectedPeriodId) {
      const found = allPeriods.find(p => p.id === selectedPeriodId);
      if (found) return found;
    }
    return activePeriod;
  }, [selectedPeriodId, allPeriods, activePeriod]);

  // Categories mapped to Anggaran groups
  const kategoriGroups = useMemo(() => {
    const groups: { [label: string]: string[] } = {};
    masterKategori.forEach(k => {
      if (!k.kelompok_anggaran) return;
      if (!groups[k.kelompok_anggaran]) groups[k.kelompok_anggaran] = [];
      groups[k.kelompok_anggaran].push(k.nama);
    });
    return Object.keys(groups).map(label => ({ label, kategoris: groups[label] }));
  }, [masterKategori]);

  // Total standard budget
  const totalStandardBudget = useMemo(() => {
    const budgetMap: { [k: string]: number } = {};
    anggaranList.forEach(a => {
      budgetMap[a.kategori] = Number(a.budget) || 0;
    });
    return kategoriGroups.reduce((acc, g) => acc + (budgetMap[g.label] || 0), 0);
  }, [anggaranList, kategoriGroups]);

  // Stats for the active period
  const activePeriodStats = useMemo(() => {
    if (!activePeriod) return null;
    const txInPeriod = filterTransactionsByPeriod(transaksiList, activePeriod);
    return calculatePeriodStats(
      txInPeriod,
      totalStandardBudget,
      activePeriod,
      periodSettings.tanggal_gajian_tetap
    );
  }, [activePeriod, transaksiList, totalStandardBudget, periodSettings]);

  // Stats for the selected period
  const selectedPeriodStats = useMemo(() => {
    if (!currentSelectedPeriod) return null;
    const txInPeriod = filterTransactionsByPeriod(transaksiList, currentSelectedPeriod);
    return calculatePeriodStats(
      txInPeriod,
      totalStandardBudget,
      currentSelectedPeriod,
      periodSettings.tanggal_gajian_tetap
    );
  }, [currentSelectedPeriod, transaksiList, totalStandardBudget, periodSettings]);

  // Realisasi per kategori for selected period
  const realisasiSelectedPeriodPerKategori = useMemo(() => {
    if (!currentSelectedPeriod) return {};
    const map: { [cat: string]: number } = {};
    const txInPeriod = filterTransactionsByPeriod(transaksiList, currentSelectedPeriod);
    txInPeriod.forEach(t => {
      if (t.tipe === 'Pengeluaran') {
        map[t.kategori] = (map[t.kategori] || 0) + Number(t.jumlah || 0);
      }
    });
    return map;
  }, [currentSelectedPeriod, transaksiList]);

  // Format Ribuan for Input form
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setFJumlah('');
      return;
    }
    const num = Number(rawDigits);
    setFJumlah(num.toLocaleString('id-ID'));
  };

  // Submit new transaction
  const handleAddTransaksi = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr('');

    const cleanJumlah = parseFloat(fJumlah.replace(/\./g, ''));
    if (!fTanggal || !fItem.trim() || !cleanJumlah || cleanJumlah <= 0) {
      setFormErr('Mohon isi tanggal, nama item, dan jumlah dengan benar.');
      return;
    }

    setFormSubmitting(true);
    try {
      const userEmail = currentUser || 'ikusmanuwu@gmail.com';
      const { data, error } = await supabase.from('transaksi').insert({
        tanggal: fTanggal,
        item: fItem.trim(),
        kategori: fKategori || (masterKategori[0]?.nama || 'Lain-Lain'),
        tipe: fTipe,
        jumlah: cleanJumlah,
        catatan: fCatatan.trim() || null,
        created_by: userEmail
      }).select().single();

      if (error) {
        throw error;
      }

      // Prepend to list
      if (data) {
        setTransaksiList(prev => [data, ...prev]);
      }
      setFItem('');
      setFJumlah('');
      setFCatatan('');
    } catch (err: any) {
      setFormErr('Gagal menyimpan transaksi: ' + (err.message || String(err)));
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete transaction
  const handleDeleteTx = async (id: string) => {
    if (!confirm('Apakah kamu yakin ingin menghapus transaksi ini?')) return;
    try {
      const { error } = await supabase.from('transaksi').delete().eq('id', id);
      if (error) throw error;
      setTransaksiList(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert('Gagal menghapus: ' + err.message);
    }
  };

  // Save edited transaction
  const handleSaveEditTx = async () => {
    if (!editingTx) return;
    if (!editingTx.tanggal || !editingTx.item || !editingTx.jumlah || editingTx.jumlah <= 0) {
      alert('Lengkapi tanggal, item, dan jumlah.');
      return;
    }

    try {
      const { error } = await supabase.from('transaksi').update({
        tanggal: editingTx.tanggal,
        item: editingTx.item,
        kategori: editingTx.kategori,
        tipe: editingTx.tipe,
        jumlah: Number(editingTx.jumlah),
        catatan: editingTx.catatan || null
      }).eq('id', editingTx.id);

      if (error) throw error;

      setTransaksiList(prev => prev.map(t => (t.id === editingTx.id ? { ...editingTx, jumlah: Number(editingTx.jumlah) } : t)));
      setEditingTx(null);
    } catch (err: any) {
      alert('Gagal memperbarui transaksi: ' + err.message);
    }
  };

  // Update budget row
  const handleUpdateBudget = async (kategori: string, amountStr: string) => {
    const budget = parseFloat(amountStr) || 0;
    try {
      await supabase.from('anggaran').upsert({ kategori, budget });
      setAnggaranList(prev => {
        const idx = prev.findIndex(a => a.kategori === kategori);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { kategori, budget };
          return updated;
        }
        return [...prev, { kategori, budget }];
      });
    } catch (err: any) {
      console.error('Error updating budget:', err);
    }
  };

  // Filtered transactions for the Transaksi Tab
  const filteredTransactions = useMemo(() => {
    return transaksiList.filter(t => {
      if (txFilterDari && t.tanggal < txFilterDari) return false;
      if (txFilterSampai && t.tanggal > txFilterSampai) return false;
      if (txFilterKategori && t.kategori !== txFilterKategori) return false;
      if (txFilterTipe && t.tipe !== txFilterTipe) return false;
      if (txFilterSearch) {
        const q = txFilterSearch.toLowerCase();
        const itemMatch = (t.item || '').toLowerCase().includes(q);
        const catMatch = (t.catatan || '').toLowerCase().includes(q);
        if (!itemMatch && !catMatch) return false;
      }
      return true;
    });
  }, [transaksiList, txFilterDari, txFilterSampai, txFilterKategori, txFilterTipe, txFilterSearch]);

  // Set preset filters
  const applyTxFilterPreset = (preset: 'active_period' | 'this_month' | 'all') => {
    if (preset === 'active_period' && activePeriod) {
      setTxFilterDari(activePeriod.tanggal_mulai);
      setTxFilterSampai(activePeriod.tanggal_selesai);
    } else if (preset === 'this_month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      setTxFilterDari(start);
      setTxFilterSampai(end);
    } else {
      setTxFilterDari('');
      setTxFilterSampai('');
    }
    setTxFilterKategori('');
    setTxFilterTipe('');
    setTxFilterSearch('');
  };

  // Copy helper
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-[#222222] font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2f6f4f] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Catatan Keuangan</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{currentUser || 'ikusmanuwu@gmail.com'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllData}
              disabled={loading}
              className="p-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2f6f4f]' : ''}`} />
            </button>
            <button
              onClick={() => setActiveTab('periode')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-[#2f6f4f] border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Siklus Periode</span>
            </button>
            <button
              onClick={() => setActiveTab('netlify')}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1"
              title="Netlify Deploy Info"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Netlify</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tabs Navigation */}
        <div className="max-w-3xl mx-auto px-4 flex gap-1.5 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveTab('input')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'input'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Input Transaksi
          </button>
          <button
            onClick={() => setActiveTab('transaksi')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'transaksi'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Data Transaksi
          </button>
          <button
            onClick={() => setActiveTab('periode')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeTab === 'periode'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Periode Anggaran
          </button>
          <button
            onClick={() => setActiveTab('anggaran')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'anggaran'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Anggaran vs Realisasi
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('ringkasan')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'ringkasan'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Ringkasan
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
              activeTab === 'master'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Master Data
          </button>
          <button
            onClick={() => setActiveTab('netlify')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1 ${
              activeTab === 'netlify'
                ? 'bg-[#2f6f4f] text-white font-semibold shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            🚀 Deploy Netlify
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* ========================================================================= */}
        {/* TAB: INPUT */}
        {/* ========================================================================= */}
        {activeTab === 'input' && (
          <div className="space-y-4">
            {/* Periode Berjalan Widget Banner */}
            <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 h-full w-1.5 bg-[#2f6f4f]"></div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Siklus Gajian Aktif
                    </span>
                    <span className="text-xs text-gray-500">
                      Hari ke-{activePeriodStats?.daysPassed || 1}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-gray-900 mt-1">
                    {activePeriod ? activePeriod.nama : 'Memuat Periode Berjalan...'}
                  </h2>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {activePeriod
                      ? `${formatDateIndo(activePeriod.tanggal_mulai)} s/d ${formatDateIndo(activePeriod.tanggal_selesai)} · Dihitung sejak gajian terakhir`
                      : 'Mendeteksi transaksi pemasukan gaji...'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('periode')}
                  className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Atur Konteks</span>
                </button>
              </div>

              {/* Quick stats grid for active period */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100 text-center">
                <div className="bg-red-50/60 rounded-xl p-2.5">
                  <div className="text-xs text-red-600 font-medium">Pengeluaran</div>
                  <div className="text-sm sm:text-base font-bold text-red-700 mt-0.5">
                    {formatRupiah(activePeriodStats?.totalPengeluaran || 0)}
                  </div>
                </div>
                <div className="bg-emerald-50/60 rounded-xl p-2.5">
                  <div className="text-xs text-emerald-600 font-medium">Pemasukan</div>
                  <div className="text-sm sm:text-base font-bold text-emerald-700 mt-0.5">
                    {formatRupiah(activePeriodStats?.totalPemasukan || 0)}
                  </div>
                </div>
                <div className="bg-blue-50/60 rounded-xl p-2.5">
                  <div className="text-xs text-blue-600 font-medium">Saving / Invest</div>
                  <div className="text-sm sm:text-base font-bold text-blue-700 mt-0.5">
                    {formatRupiah(activePeriodStats?.totalSaving || 0)}
                  </div>
                </div>
              </div>

              {/* Status Arus Kas Periode: SURPLUS vs MINUS */}
              <div
                className={`mt-3 p-3 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
                  (activePeriodStats?.netCashflow || 0) >= 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {(activePeriodStats?.netCashflow || 0) >= 0 ? (
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <div className="font-extrabold flex items-center gap-1.5">
                      <span>
                        {(activePeriodStats?.netCashflow || 0) >= 0 ? '🟢 SURPLUS ARUS KAS' : '🔴 DEFISIT / MINUS'}
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.2 rounded-full bg-white/70 border border-current">
                        {(activePeriodStats?.netCashflow || 0) >= 0 ? 'Pemasukan > Pengeluaran' : 'Pengeluaran > Pemasukan'}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      Selisih: {formatRupiah(activePeriodStats?.totalPemasukan || 0)} - {formatRupiah(activePeriodStats?.totalPengeluaran || 0)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-black text-base sm:text-lg ${
                      (activePeriodStats?.netCashflow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {(activePeriodStats?.netCashflow || 0) >= 0 ? '+' : '-'}
                    {formatRupiah(Math.abs(activePeriodStats?.netCashflow || 0))}
                  </div>
                  {(activePeriodStats?.totalSaving || 0) > 0 && (
                    <div className="text-[10px] text-gray-500">
                      Setelah tabungan: {formatRupiah(activePeriodStats?.netCashflowAfterSaving || 0)}
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Safe Quota Row */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 text-xs text-gray-600">
                <div>
                  Sisa Budget:{' '}
                  <span className={`font-semibold ${(activePeriodStats?.sisaAnggaran || 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatRupiah(activePeriodStats?.sisaAnggaran || 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[#2f6f4f] font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                  <Clock className="w-3 h-3" />
                  <span>Kuota Aman: {formatRupiah(activePeriodStats?.dailyRecommendedQuota || 0)}/hari</span>
                </div>
              </div>
            </div>

            {/* Input Form Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2f6f4f]" />
                Tambah Transaksi Baru
              </h2>

              <form onSubmit={handleAddTransaksi} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={fTanggal}
                    onChange={e => setFTanggal(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Item / Keterangan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Makan siang, Kopi susu, Gaji Bulanan, dsb."
                    value={fItem}
                    onChange={e => setFItem(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Kategori</label>
                    <select
                      value={fKategori}
                      onChange={e => setFKategori(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f] bg-white"
                    >
                      {masterKategori.map(k => (
                        <option key={k.id} value={k.nama}>
                          {k.nama}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tipe</label>
                    <select
                      value={fTipe}
                      onChange={e => setFTipe(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f] bg-white"
                    >
                      {masterTipe.length > 0 ? (
                        masterTipe.map(t => (
                          <option key={t.id} value={t.nama}>
                            {t.nama}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Pengeluaran">Pengeluaran</option>
                          <option value="Pemasukan">Pemasukan</option>
                          <option value="Saving/Invest">Saving/Invest</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Jumlah (Rp)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-gray-500 font-bold">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={fJumlah}
                      onChange={handleAmountChange}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Catatan tambahan..."
                    value={fCatatan}
                    onChange={e => setFCatatan(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                  />
                </div>

                {formErr && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{formErr}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full py-3 bg-[#2f6f4f] hover:bg-[#235c3f] text-white font-bold rounded-xl text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  {formSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Simpan Transaksi</span>
                </button>
              </form>
            </div>

            {/* Transaksi Terbaru */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Transaksi Terbaru</h3>
                <button
                  onClick={() => setActiveTab('transaksi')}
                  className="text-xs text-[#2f6f4f] font-semibold hover:underline flex items-center gap-0.5"
                >
                  Lihat Semua ({transaksiList.length}) <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {transaksiList.slice(0, 10).map(tx => {
                  const isOut = tx.tipe === 'Pengeluaran';
                  const isIn = tx.tipe === 'Pemasukan';
                  return (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">{tx.item}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-gray-600">{tx.kategori}</span>
                          <span>·</span>
                          <span>{formatDateIndo(tx.tanggal)}</span>
                          {tx.created_by && (
                            <>
                              <span>·</span>
                              <span className="text-gray-400 truncate max-w-[120px]">{tx.created_by.split('@')[0]}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-sm whitespace-nowrap ${
                            isOut ? 'text-red-600' : isIn ? 'text-[#2f6f4f]' : 'text-blue-600'
                          }`}
                        >
                          {isOut ? '-' : '+'}
                          {formatRupiah(tx.jumlah)}
                        </span>
                        <button
                          onClick={() => setEditingTx(tx)}
                          className="p-1 text-gray-400 hover:text-gray-700 rounded-md"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTx(tx.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-md"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: PERIODE (FITUR UTAMA YANG DIMINTA USER) */}
        {/* ========================================================================= */}
        {activeTab === 'periode' && (
          <div className="space-y-4">
            {/* Periode Info Hero */}
            <div className="bg-linear-to-br from-emerald-900 to-[#1f4a35] text-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-emerald-700/60 text-emerald-200 text-xs font-semibold">
                  Aturan Periode Anggaran
                </span>
                <span className="text-xs text-emerald-300">
                  Model: Siklus Gajian (WhatsApp Bot Style)
                </span>
              </div>

              <h2 className="text-lg font-bold mt-2">
                {activePeriod ? activePeriod.nama : 'Periode Berjalan'}
              </h2>
              <p className="text-xs text-emerald-200 mt-1 max-w-xl">
                Periode dihitung dari <b>tanggal gajian terakhir</b> sampai <b>tanggal hari ini</b> sebagai 1 periode anggaran & pengeluaran berjalan.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 text-center border border-white/10">
                  <div className="text-xs text-emerald-200">Hari Berjalan</div>
                  <div className="text-xl font-extrabold mt-0.5">{activePeriodStats?.daysPassed || 1} hari</div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 text-center border border-white/10">
                  <div className="text-xs text-emerald-200">Menuju Gajian</div>
                  <div className="text-xl font-extrabold mt-0.5">{activePeriodStats?.daysRemaining || 0} hari</div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 text-center border border-white/10">
                  <div className="text-xs text-emerald-200">Rata-rata Keluar</div>
                  <div className="text-base sm:text-lg font-bold mt-0.5 text-amber-300">
                    {formatRupiah(activePeriodStats?.dailyAvgSpent || 0)}/hr
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 text-center border border-white/10">
                  <div className="text-xs text-emerald-200">Kuota Aman Harian</div>
                  <div className="text-base sm:text-lg font-bold mt-0.5 text-emerald-300">
                    {formatRupiah(activePeriodStats?.dailyRecommendedQuota || 0)}/hr
                  </div>
                </div>
              </div>

              {/* Status Surplus / Defisit Periode Berjalan */}
              <div className="mt-4 p-3 rounded-xl bg-white/15 backdrop-blur-xs border border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(activePeriodStats?.netCashflow || 0) >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-emerald-300" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-300" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
                      Status Arus Kas Siklus Ini
                    </div>
                    <div className="text-sm font-bold text-white">
                      {(activePeriodStats?.netCashflow || 0) >= 0 ? '🟢 SURPLUS (Pemasukan Lebih Besar)' : '🔴 DEFISIT / MINUS (Pengeluaran Lebih Besar)'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-base sm:text-lg font-black ${(activePeriodStats?.netCashflow || 0) >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                    {(activePeriodStats?.netCashflow || 0) >= 0 ? '+' : '-'}
                    {formatRupiah(Math.abs(activePeriodStats?.netCashflow || 0))}
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    In: {formatRupiah(activePeriodStats?.totalPemasukan || 0)} | Out: {formatRupiah(activePeriodStats?.totalPengeluaran || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Konfigurasi & Konteks Periode */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-5 h-5 text-[#2f6f4f]" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Pengaturan Konteks & Aturan Periode
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Mode Penentuan Siklus Periode
                  </label>
                  <select
                    value={periodSettings.mode}
                    onChange={e =>
                      setPeriodSettings(prev => ({
                        ...prev,
                        mode: e.target.value as any
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f] bg-white"
                  >
                    <option value="auto_salary">
                      Otomatis: Deteksi Tanggal Transaksi Gajian Terakhir (Rekomendasi)
                    </option>
                    <option value="fixed_day">
                      Jadwal Rutin: Tanggal Cutoff Gajian Tetap Setiap Bulan
                    </option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {periodSettings.mode === 'auto_salary'
                      ? 'Sistem otomatis mencari transaksi pemasukan bertema gaji/payroll terbaru dan menjadikannya titik awal periode berjalan.'
                      : 'Sistem memotong periode berdasarkan tanggal gajian bulanan tetap (misal tgl 25).'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Tanggal Cutoff Gajian Rutin (1 - 31)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={periodSettings.tanggal_gajian_tetap}
                      onChange={e =>
                        setPeriodSettings(prev => ({
                          ...prev,
                          tanggal_gajian_tetap: parseInt(e.target.value, 10) || 25
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Dipakai untuk proyeksi gajian berikutnya & estimasi sisa hari.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Kata Kunci Pencarian Transaksi Gaji
                    </label>
                    <input
                      type="text"
                      value={periodSettings.kata_kunci_gaji}
                      onChange={e =>
                        setPeriodSettings(prev => ({
                          ...prev,
                          kata_kunci_gaji: e.target.value
                        }))
                      }
                      placeholder="gaji, gajian, payroll, salary"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Item pemasukan dengan kata ini akan otomatis diakui sebagai gaji.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-xs text-emerald-800 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Aturan tersimpan otomatis di perangkat & terhubung ke Supabase
                  </span>
                  <button
                    onClick={() => {
                      setPeriodSettings({ ...periodSettings });
                      alert('Periode dihitung ulang berdasarkan data terbaru!');
                    }}
                    className="px-3.5 py-1.5 bg-[#2f6f4f] text-white text-xs font-semibold rounded-lg hover:bg-[#235c3f] transition-colors"
                  >
                    Terapkan & Hitung Ulang
                  </button>
                </div>
              </div>
            </div>

            {/* Riwayat & Daftar Periode */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Daftar & Riwayat Siklus Periode
                </h3>
                <span className="text-xs text-gray-500">{allPeriods.length} periode terdeteksi</span>
              </div>

              <div className="space-y-2.5">
                {allPeriods.map(p => {
                  const isAct = p.id === activePeriod?.id;
                  const isSel = p.id === currentSelectedPeriod?.id;
                  const pStats = calculatePeriodStats(
                    filterTransactionsByPeriod(transaksiList, p),
                    totalStandardBudget,
                    p,
                    periodSettings.tanggal_gajian_tetap
                  );

                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isSel
                          ? 'border-[#2f6f4f] bg-emerald-50/40 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">{p.nama}</span>
                            {isAct && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                Berjalan
                              </span>
                            )}
                            {isSel && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-800">
                                Terpilih
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDateIndo(p.tanggal_mulai)} s/d {formatDateIndo(p.tanggal_selesai)}
                            {p.gaji_jumlah ? ` · Gaji Masuk: ${formatRupiah(p.gaji_jumlah)}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs">
                            <div className="flex items-center justify-end gap-1.5 font-bold">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                  pStats.isSurplus
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {pStats.isSurplus ? '🟢 Surplus' : '🔴 Minus'}{' '}
                                {pStats.isSurplus ? '+' : '-'}
                                {formatRupiah(Math.abs(pStats.netCashflow))}
                              </span>
                            </div>
                            <div className="text-gray-500 text-[11px] mt-0.5">
                              In: {formatRupiah(pStats.totalPemasukan)} | Out: {formatRupiah(pStats.totalPengeluaran)}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedPeriodId(p.id);
                              setActiveTab('anggaran');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors shadow-2xs"
                          >
                            Buka di Anggaran
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: ANGGARAN VS REALISASI */}
        {/* ========================================================================= */}
        {activeTab === 'anggaran' && (
          <div className="space-y-4">
            {/* Periode Selector Dropdown */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Konteks Periode yang Ditampilkan
              </label>
              <select
                value={currentSelectedPeriod?.id || ''}
                onChange={e => setSelectedPeriodId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2f6f4f] bg-white"
              >
                {allPeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nama} {p.is_berjalan ? '(Sedang Berjalan)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                Rentang hitungan: {formatDateIndo(currentSelectedPeriod?.tanggal_mulai || '')} s/d{' '}
                {formatDateIndo(currentSelectedPeriod?.tanggal_selesai || '')}
              </p>
            </div>

            {/* Ringkasan Anggaran Periode Terpilih */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Ringkasan Realisasi Periode
              </h3>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-emerald-50">
                  <div className="text-xs font-medium text-emerald-700">Pemasukan</div>
                  <div className="text-sm sm:text-base font-bold text-emerald-800 mt-0.5">
                    {formatRupiah(selectedPeriodStats?.totalPemasukan || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-red-50">
                  <div className="text-xs font-medium text-red-700">Pengeluaran</div>
                  <div className="text-sm sm:text-base font-bold text-red-800 mt-0.5">
                    {formatRupiah(selectedPeriodStats?.totalPengeluaran || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50">
                  <div className="text-xs font-medium text-blue-700">Saving / Invest</div>
                  <div className="text-sm sm:text-base font-bold text-blue-800 mt-0.5">
                    {formatRupiah(selectedPeriodStats?.totalSaving || 0)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-gray-100 text-center">
                <div className="p-2.5 rounded-xl bg-gray-50">
                  <div className="text-xs font-medium text-gray-500">Sisa Belum Teralokasi</div>
                  <div className="text-sm sm:text-base font-bold text-gray-900 mt-0.5">
                    {formatRupiah(
                      (selectedPeriodStats?.totalPemasukan || 0) -
                        (selectedPeriodStats?.totalPengeluaran || 0) -
                        (selectedPeriodStats?.totalSaving || 0)
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50">
                  <div className="text-xs font-medium text-gray-500">Rasio Tabungan</div>
                  <div className="text-sm sm:text-base font-bold text-gray-900 mt-0.5">
                    {selectedPeriodStats?.savingRatio || 0}%
                  </div>
                </div>
              </div>

              {/* Status Surplus vs Defisit untuk Periode Terpilih */}
              <div
                className={`mt-3 p-3 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
                  (selectedPeriodStats?.netCashflow || 0) >= 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {(selectedPeriodStats?.netCashflow || 0) >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-extrabold">
                      {(selectedPeriodStats?.netCashflow || 0) >= 0
                        ? '🟢 SURPLUS ARUS KAS PERIODE'
                        : '🔴 DEFISIT / MINUS PERIODE'}
                    </span>
                    <span className="text-[11px] text-gray-500 block sm:inline sm:ml-1.5">
                      (Pemasukan {formatRupiah(selectedPeriodStats?.totalPemasukan || 0)} - Pengeluaran {formatRupiah(selectedPeriodStats?.totalPengeluaran || 0)})
                    </span>
                  </div>
                </div>
                <div
                  className={`font-black text-sm sm:text-base ${
                    (selectedPeriodStats?.netCashflow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {(selectedPeriodStats?.netCashflow || 0) >= 0 ? '+' : '-'}
                  {formatRupiah(Math.abs(selectedPeriodStats?.netCashflow || 0))}
                </div>
              </div>
            </div>

            {/* Pemasukan Rutin */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Daftar Pemasukan Rutin
              </h3>
              <div className="divide-y divide-gray-100 mb-3">
                {pemasukanRutinList.map(pr => (
                  <div key={pr.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">{pr.sumber}</span>
                    <span className="font-bold text-[#2f6f4f]">{formatRupiah(pr.jumlah)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabel Anggaran vs Realisasi */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Anggaran vs Realisasi per Kategori
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ketik angka pada kolom Anggaran untuk mengubah plafon budget
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase">
                      <th className="py-2.5 pr-2">Kategori</th>
                      <th className="py-2.5 px-2 text-right">Anggaran</th>
                      <th className="py-2.5 px-2 text-right">Realisasi</th>
                      <th className="py-2.5 pl-2 text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {kategoriGroups.map(group => {
                      const budgetRow = anggaranList.find(a => a.kategori === group.label);
                      const budgetVal = budgetRow?.budget || 0;
                      const realisasi = group.kategoris.reduce(
                        (sum, k) => sum + (realisasiSelectedPeriodPerKategori[k] || 0),
                        0
                      );
                      const sisa = budgetVal - realisasi;
                      const isOver = realisasi > budgetVal && budgetVal > 0;
                      const pct =
                        budgetVal > 0
                          ? Math.min(100, Math.round((realisasi / budgetVal) * 100))
                          : realisasi > 0
                          ? 100
                          : 0;

                      return (
                        <tr key={group.label} className="hover:bg-gray-50/50">
                          <td className="py-3 pr-2">
                            <div className="font-semibold text-gray-800">{group.label}</div>
                            <div className="w-24 sm:w-36 h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isOver ? 'bg-red-500' : 'bg-[#2f6f4f]'
                                }`}
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <input
                              type="number"
                              defaultValue={budgetVal}
                              onBlur={e => handleUpdateBudget(group.label, e.target.value)}
                              className="w-24 px-2 py-1 text-right text-xs font-semibold border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2f6f4f]"
                            />
                          </td>
                          <td
                            className={`py-3 px-2 text-right font-medium whitespace-nowrap ${
                              isOver ? 'text-red-600 font-bold' : 'text-gray-700'
                            }`}
                          >
                            {formatRupiah(realisasi)}
                          </td>
                          <td
                            className={`py-3 pl-2 text-right font-bold whitespace-nowrap ${
                              sisa < 0 ? 'text-red-600' : 'text-gray-900'
                            }`}
                          >
                            {formatRupiah(sisa)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: DATA TRANSAKSI */}
        {/* ========================================================================= */}
        {activeTab === 'transaksi' && (
          <div className="space-y-4">
            {/* Filter Box */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5" />
                  Filter Cepat
                </span>
                <button
                  onClick={() => applyTxFilterPreset('all')}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Reset Semua
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => applyTxFilterPreset('active_period')}
                  className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100"
                >
                  Periode Berjalan ({activePeriod ? formatDateIndo(activePeriod.tanggal_mulai) : ''} - Hari Ini)
                </button>
                <button
                  onClick={() => applyTxFilterPreset('this_month')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  Bulan Ini
                </button>
                <button
                  onClick={() => applyTxFilterPreset('all')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  Semua ({transaksiList.length})
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
                  <input
                    type="date"
                    value={txFilterDari}
                    onChange={e => setTxFilterDari(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={txFilterSampai}
                    onChange={e => setTxFilterSampai(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                  <select
                    value={txFilterKategori}
                    onChange={e => setTxFilterKategori(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Semua Kategori</option>
                    {masterKategori.map(k => (
                      <option key={k.id} value={k.nama}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipe</label>
                  <select
                    value={txFilterTipe}
                    onChange={e => setTxFilterTipe(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Semua Tipe</option>
                    <option value="Pengeluaran">Pengeluaran</option>
                    <option value="Pemasukan">Pemasukan</option>
                    <option value="Saving/Invest">Saving/Invest</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cari Keterangan</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Ketik kata kunci item / catatan..."
                    value={txFilterSearch}
                    onChange={e => setTxFilterSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* List Results */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                {filteredTransactions.length} Transaksi Ditemukan
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Tidak ada transaksi yang cocok dengan filter.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredTransactions.map(tx => {
                    const isOut = tx.tipe === 'Pengeluaran';
                    const isIn = tx.tipe === 'Pemasukan';
                    return (
                      <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 truncate">{tx.item}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-medium text-gray-700">{tx.kategori}</span>
                            <span>·</span>
                            <span>{tx.tipe}</span>
                            <span>·</span>
                            <span>{formatDateIndo(tx.tanggal)}</span>
                          </div>
                          {tx.catatan && (
                            <div className="text-xs text-gray-400 italic mt-0.5 truncate">
                              "{tx.catatan}"
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold text-sm whitespace-nowrap ${
                              isOut ? 'text-red-600' : isIn ? 'text-[#2f6f4f]' : 'text-blue-600'
                            }`}
                          >
                            {isOut ? '-' : '+'}
                            {formatRupiah(tx.jumlah)}
                          </span>
                          <button
                            onClick={() => setEditingTx(tx)}
                            className="p-1 text-gray-400 hover:text-gray-700 rounded-md"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTx(tx.id)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded-md"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-2">
                Distribusi Pengeluaran Periode Terpilih
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Konteks: {currentSelectedPeriod?.nama} ({formatDateIndo(currentSelectedPeriod?.tanggal_mulai || '')} - {formatDateIndo(currentSelectedPeriod?.tanggal_selesai || '')})
              </p>

              <div className="space-y-3">
                {kategoriGroups.map(group => {
                  const realisasi = group.kategoris.reduce(
                    (sum, k) => sum + (realisasiSelectedPeriodPerKategori[k] || 0),
                    0
                  );
                  if (realisasi === 0) return null;
                  const totalOut = selectedPeriodStats?.totalPengeluaran || 1;
                  const percentage = Math.round((realisasi / totalOut) * 100);

                  return (
                    <div key={group.label}>
                      <div className="flex items-center justify-between text-xs font-medium mb-1">
                        <span className="text-gray-800">{group.label}</span>
                        <span className="text-gray-500">
                          {formatRupiah(realisasi)} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2f6f4f] rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Summary Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">
                Kinerja Finansial Siklus Berjalan
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500">Total Transaksi Masuk & Keluar</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    {filterTransactionsByPeriod(transaksiList, currentSelectedPeriod || activePeriod!).length}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs text-gray-500">Rata-rata Harian</div>
                  <div className="text-lg font-bold text-red-600 mt-1">
                    {formatRupiah(selectedPeriodStats?.dailyAvgSpent || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: DEPLOY NETLIFY (FITUR DEPLOYMENT TRIGGER) */}
        {/* ========================================================================= */}
        {activeTab === 'netlify' && (
          <div className="space-y-4">
            <div className="bg-linear-to-br from-emerald-800 to-teal-900 text-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-700 text-emerald-200 text-xs font-semibold">
                  Netlify Deploy
                </span>
                <span className="text-xs text-emerald-300">GitHub: ikusmanuwu/efraterbaik</span>
              </div>
              <h2 className="text-lg font-bold mt-2">Panduan Trigger Auto-Deploy ke Netlify</h2>
              <p className="text-xs text-emerald-100 mt-1 max-w-xl">
                Semua file dan konfigurasi sudah disiapkan. Begitu kamu push pembaruan ini ke repository GitHub kamu, Netlify akan otomatis mendeteksi dan langsung men-deploy aplikasimu!
              </p>
            </div>

            {/* Step-by-step Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                Langkah Cepat (3 Langkah)
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-[#2f6f4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      File <code>netlify.toml</code> sudah dibuat di repository
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      File ini memberi tahu Netlify cara menyajikan website kamu dengan konfigurasi publish direktori yang tepat.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-[#2f6f4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      File <code>index.html</code> mandiri (standalone) dengan fitur Periode sudah siap
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Tersedia file <code>standalone_index.html</code> yang memuat seluruh fitur periode siklus gajian ini dalam satu file HTML tanpa build tool rumit.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-[#2f6f4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Jalankan Git Commit & Push</div>
                    <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-lg font-mono text-xs mt-1.5 overflow-x-auto">
                      git add .<br />
                      git commit -m "feat: tambah periode anggaran siklus gajian & netlify deploy"<br />
                      git push origin main
                    </div>
                  </div>
                </div>
              </div>

              {/* Copy Netlify.toml button */}
              <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    copyToClipboard(
                      `[build]\n  publish = "."\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200`,
                      'netlify_toml'
                    )
                  }
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {copiedType === 'netlify_toml' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>Salin netlify.toml</span>
                </button>

                <button
                  onClick={() =>
                    copyToClipboard(
                      `-- SQL Skema Periode Anggaran\ncreate table if not exists pengaturan_periode (\n  id int primary key default 1,\n  mode text not null default 'auto_salary',\n  tanggal_gajian_tetap int not null default 25,\n  kata_kunci_gaji text not null default 'gaji,gajian,payroll,salary'\n);`,
                      'sql_periode'
                    )
                  }
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {copiedType === 'sql_periode' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>Salin supabase_periode.sql</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: MASTER DATA & RINGKASAN */}
        {/* ========================================================================= */}
        {activeTab === 'master' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Master Kategori & Tipe
            </h3>
            <p className="text-xs text-gray-500">
              Daftar ini dimuat langsung dari tabel <code>master_kategori</code> di database Supabase kamu.
            </p>

            <div className="divide-y divide-gray-100">
              {masterKategori.map(k => (
                <div key={k.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{k.nama}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      ({k.kelompok_anggaran ? `Kelompok: ${k.kelompok_anggaran}` : 'Tidak dianggarkan'})
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">
                    Urutan: {k.urutan}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ringkasan' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Ringkasan Kategori 6 Bulan Terakhir
            </h3>
            <p className="text-xs text-gray-500">
              Total per kategori dihitung berdasarkan riwayat transaksi.
            </p>

            <div className="divide-y divide-gray-100">
              {kategoriGroups.map(group => {
                const total = transaksiList
                  .filter(t => group.kategoris.includes(t.kategori) && t.tipe === 'Pengeluaran')
                  .reduce((sum, t) => sum + Number(t.jumlah || 0), 0);

                return (
                  <div key={group.label} className="py-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">{group.label}</span>
                    <span className="font-bold text-gray-900">{formatRupiah(total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modal Edit Transaksi */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Edit Transaksi</h3>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal</label>
              <input
                type="date"
                value={editingTx.tanggal}
                onChange={e => setEditingTx({ ...editingTx, tanggal: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
              <input
                type="text"
                value={editingTx.item}
                onChange={e => setEditingTx({ ...editingTx, item: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Kategori</label>
                <select
                  value={editingTx.kategori}
                  onChange={e => setEditingTx({ ...editingTx, kategori: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  {masterKategori.map(k => (
                    <option key={k.id} value={k.nama}>
                      {k.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tipe</label>
                <select
                  value={editingTx.tipe}
                  onChange={e => setEditingTx({ ...editingTx, tipe: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  <option value="Pengeluaran">Pengeluaran</option>
                  <option value="Pemasukan">Pemasukan</option>
                  <option value="Saving/Invest">Saving/Invest</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Jumlah (Rp)</label>
              <input
                type="number"
                value={editingTx.jumlah}
                onChange={e => setEditingTx({ ...editingTx, jumlah: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan</label>
              <input
                type="text"
                value={editingTx.catatan || ''}
                onChange={e => setEditingTx({ ...editingTx, catatan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingTx(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
              >
                Batal
              </button>
              <button
                onClick={handleSaveEditTx}
                className="flex-1 py-2 rounded-xl bg-[#2f6f4f] text-white text-xs font-semibold hover:bg-[#235c3f]"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
