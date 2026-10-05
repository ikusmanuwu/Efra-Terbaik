-- ==============================================================================
-- TAMBAHAN: Jalankan ini di Supabase SQL Editor untuk fitur PERIODE ANGGARAN
-- ==============================================================================
-- Tabel ini menyimpan konfigurasi siklus gajian & daftar periode anggaran kustom
-- Kompatibel dengan skema efraterbaik sebelumnya (supabase.sql, supabase_anggaran.sql, supabase_master.sql)

-- 1. Tabel Pengaturan Periode (Siklus Gajian & Mode)
create table if not exists pengaturan_periode (
  id int primary key default 1,
  mode text not null default 'auto_salary' check (mode in ('auto_salary', 'fixed_day', 'custom')),
  tanggal_gajian_tetap int not null default 25 check (tanggal_gajian_tetap between 1 and 31),
  kata_kunci_gaji text not null default 'gaji,gajian,payroll,salary',
  auto_close_on_next boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint single_setting check (id = 1)
);

-- Seed default pengaturan
insert into pengaturan_periode (id, mode, tanggal_gajian_tetap, kata_kunci_gaji)
values (1, 'auto_salary', 25, 'gaji,gajian,payroll,salary')
on conflict (id) do nothing;

-- 2. Tabel Periode Anggaran (History & Custom Periods)
create table if not exists periode_anggaran (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  tanggal_mulai date not null,
  tanggal_selesai date, -- null = sedang berjalan sampai hari ini
  catatan text,
  target_saving numeric default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_periode_tanggal on periode_anggaran (tanggal_mulai desc);

-- 3. Row Level Security (RLS)
alter table pengaturan_periode enable row level security;
alter table periode_anggaran enable row level security;

create policy "authenticated_all_pengaturan_periode" on pengaturan_periode
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_all_periode_anggaran" on periode_anggaran
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
