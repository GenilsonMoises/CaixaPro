import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useForm } from 'react-hook-form';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarDays, Check,
  CircleDollarSign, Download, FileSpreadsheet, FileText, Filter, LogOut,
  LayoutDashboard, Menu, Pencil, Plus, Search, Settings2, Tag,
  Trash2, UsersRound, Wallet, X, Landmark, Clock3, RefreshCw, Eye, TrendingUp,
} from 'lucide-react';
import {
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useListResponsibles, useCreateResponsible, useUpdateResponsible, useDeleteResponsible,
  useListMovements, useCreateMovement, useUpdateMovement, useDeleteMovement,
  useGetOverview, useGetSettings, useUpdateSettings,
  useGetProfile, useUpdateProfile,
  getListCategoriesQueryKey, getListResponsiblesQueryKey, getListMovementsQueryKey,
  getGetOverviewQueryKey, getGetSettingsQueryKey, getGetProfileQueryKey,
} from '@workspace/api-client-react';
import type {
  Movement, MovementInput, MovementUpdate, ListMovementsParams, GetOverviewParams,
  Category, Responsible, Overview, AppSettings,
} from '@workspace/api-client-react';
import { Form } from '@/components/ui/form';
import { createCsvBlob, createXlsxBlob } from '@/lib/export';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import AuthLanding from '@/components/auth/AuthLanding';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#1769AA',
    colorForeground: '#123B63',
    colorMutedForeground: '#60778D',
    colorDanger: '#C93B37',
    colorBackground: '#FFFFFF',
    colorInput: '#FFFFFF',
    colorInputForeground: '#123B63',
    colorNeutral: '#CBD5E1',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_24px_70px_rgba(18,59,99,.12)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-[Manrope] text-[#123B63] font-extrabold tracking-tight',
    headerSubtitle: 'text-[#60778D]',
    socialButtonsBlockButtonText: 'font-semibold text-[#123B63]',
    formFieldLabel: 'font-semibold text-[#244B6D]',
    footerActionLink: 'font-semibold text-[#1769AA] hover:text-[#123B63]',
    footerActionText: 'text-[#60778D]',
    dividerText: 'text-[#7A8EA1]',
    identityPreviewEditButton: 'font-semibold text-[#1769AA]',
    formFieldSuccessText: 'text-[#267A3F]',
    alertText: 'text-[#8F2825]',
    logoBox: 'mb-2',
    logoImage: 'h-10 w-10',
    socialButtonsBlockButton: 'border-slate-200 bg-white hover:bg-[#F5F8FC]',
    formButtonPrimary: 'bg-[#1769AA] font-semibold hover:bg-[#123B63]',
    formFieldInput: 'border-slate-200 bg-white text-[#123B63] focus:border-[#1769AA]',
    footerAction: 'text-[#60778D]',
    dividerLine: 'bg-slate-200',
    alert: 'border-red-200 bg-red-50',
    otpCodeFieldInput: 'border-slate-200 text-[#123B63]',
    formFieldRow: 'gap-2',
    main: 'text-[#123B63]',
  },
};
type Filters = {
  startDate?: string;
  endDate?: string;
  search?: string;
  type?: 'income' | 'expense' | 'transfer';
  category?: string;
  responsible?: string;
  account?: 'bank' | 'cash';
};
const FilterContext = createContext<{ filters: Filters; setFilters: (next: Filters) => void }>({ filters: {}, setFilters: () => undefined });
const useGlobalFilters = () => useContext(FilterContext);
const EmployeeNameContext = createContext('');
const money = (cents = 0) => {
  const absolute = Math.abs(Math.round(cents));
  const integer = Math.floor(absolute / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${cents < 0 ? '−' : ''}${integer},${fraction} Kz`;
};
const parseKwanzaCents = (raw: string) => {
  const value = raw.trim().replace(/[\s\u00a0]/g, '').replace(/kz$/i, '');
  let normalized = value;
  if (value.includes(',')) {
    if ((value.match(/,/g) || []).length > 1) return Number.NaN;
    normalized = value.replaceAll('.', '').replace(',', '.');
  } else {
    const parts = value.split('.');
    const groupedThousands = parts.length > 1 && /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every(part => /^\d{3}$/.test(part));
    if (groupedThousands) normalized = parts.join('');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
};
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const movementTypeName = (type: string) => type === 'income' ? 'Entrada' : type === 'expense' ? 'Saída' : 'Transferência';
const accountName = (account?: string | null) => account === 'bank' ? 'Banco' : account === 'cash' ? 'Caixa' : '—';
const errorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return fallback;
};
const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10';
const buttonPrimary = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1769AA] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123B63] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50';
const buttonLight = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[.98]';
const BANK_OPTIONS = [
  'BAI',
  'BFA',
  'Banco BIC',
  'Banco Sol',
  'BPC',
  'Banco Millennium Atlântico',
  'Banco Caixa Geral Angola',
  'Banco Económico',
  'Banco Keve',
  'Banco Yetu',
  'Banco BIR',
  'Standard Bank Angola',
];

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { filters, setFilters } = useGlobalFilters();
  const employeeName = useContext(EmployeeNameContext);
  const { signOut } = useClerk();
  const categories = useListCategories();
  const responsibles = useListResponsibles();
  const fixedAccount = path === '/caixa' ? 'cash' : path === '/banco' ? 'bank' : undefined;
  const fixedType = path === '/transferencias' ? 'transfer' : undefined;
  const activeFilterCount = Object.entries(filters).filter(([key,value]) => value !== undefined && value !== '' && !(key === 'account' && fixedAccount) && !(key === 'type' && fixedType)).length;
  const links = [
    { href: '/', label: 'Resumo geral', icon: LayoutDashboard },
    { href: '/fluxo-diario', label: 'Fluxo diário', icon: ArrowLeftRight },
    { href: '/caixa', label: 'Caixa', icon: Wallet },
    { href: '/banco', label: 'Banco', icon: Landmark },
    { href: '/transferencias', label: 'Transferências', icon: RefreshCw },
    { href: '/categorias', label: 'Categorias', icon: Tag },
    { href: '/responsaveis', label: 'Responsáveis', icon: UsersRound },
    { href: '/relatorios', label: 'Relatórios', icon: FileText },
    { href: '/configuracoes', label: 'Configurações', icon: Settings2 },
  ];
  return <div className="app-shell min-h-[100dvh] bg-[#F5F8FC] text-[#123B63]">
    {mobileOpen && <button aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-[#102f4d]/40 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col bg-[#123B63] px-4 py-5 text-white transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-9 flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#1769AA] shadow-inner"><CircleDollarSign size={23} /></div>
          <div><p className="font-[Manrope] text-[15px] font-extrabold tracking-tight">CaixaPro</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.18em] text-blue-200/70">Livro financeiro privado</p></div>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10 md:hidden"><X size={18} /></button>
      </div>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/55">O seu espaço</p>
      <nav className="space-y-1">
        {links.map(item => {
          const Icon = item.icon;
          const active = item.href === '/' ? path === '/' : path === item.href;
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium ${active ? 'bg-white text-[#123B63] shadow-sm' : 'text-blue-100/80 hover:bg-white/10 hover:text-white'}`} data-testid={`link-nav-${item.href.replaceAll('/', '') || 'resumo'}`}>
            <Icon size={17} strokeWidth={active ? 2.3 : 1.8} /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#36A85A]" />}
          </Link>;
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-4">
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#36A85A]/20 text-[#8ae1a4]"><Banknote size={17} /></div>
        <p className="text-xs font-semibold">Tudo no seu ritmo</p>
        <p className="mt-1 text-[11px] leading-relaxed text-blue-100/60">Registe os movimentos do dia e mantenha as contas em ordem.</p>
      </div>
      <p className="px-2 pt-4 text-[10px] text-blue-100/40">CaixaPro · Kwanza</p>
    </aside>
    <div className="md:pl-[252px]">
      <header className="sticky top-0 z-30 border-b border-[#e5ebf2] bg-[#F5F8FC]/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3">
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir navegação" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white md:hidden"><Menu size={18} /></button>
          <div className="relative max-w-[430px] flex-1">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Pesquisar movimentos" data-testid="input-global-search" value={filters.search || ''} onChange={event => setFilters({ ...filters, search: event.target.value || undefined })} placeholder="Pesquisar movimentos..." className={`${inputClass} h-10 border-transparent bg-white pl-10 shadow-[0_2px_8px_rgba(18,59,99,.04)]`} />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-right">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4eff9] text-[10px] font-bold text-[#1769AA] sm:h-9 sm:w-9 sm:text-xs">{initials(employeeName || 'FP')}</div>
            <div className="min-w-0"><p className="max-w-[92px] truncate text-[11px] font-semibold text-[#123B63] sm:max-w-[170px] sm:text-xs">{employeeName}</p><p className="hidden text-[10px] text-slate-400 sm:block">Funcionário · Kwanza angolano</p></div>
            <button type="button" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="Terminar sessão" title="Terminar sessão" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><LogOut size={16}/></button>
          </div>
        </div>
        <details className="group mx-auto mt-3 max-w-[1440px]">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[#1769AA]" data-testid="button-global-filters">
            <Filter size={14}/> Filtros globais
            <span className="rounded-full bg-[#eaf3fb] px-2 py-0.5 text-[10px]">Filtros activos: {activeFilterCount}</span>
            <span className="ml-auto text-[10px] font-medium text-slate-400 group-open:hidden">Mostrar</span>
            <span className="ml-auto hidden text-[10px] font-medium text-slate-400 group-open:inline">Ocultar</span>
          </summary>
          <div className="mt-3 grid gap-3 rounded-2xl border border-[#e5ebf2] bg-white p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-6">
            <label className="text-[10px] font-semibold text-slate-500">Data inicial<input type="date" className={`${inputClass} mt-1 h-10 text-xs`} value={filters.startDate || ''} onChange={event => setFilters({ ...filters, startDate: event.target.value || undefined })}/></label>
            <label className="text-[10px] font-semibold text-slate-500">Data final<input type="date" className={`${inputClass} mt-1 h-10 text-xs`} value={filters.endDate || ''} onChange={event => setFilters({ ...filters, endDate: event.target.value || undefined })}/></label>
            <label className="text-[10px] font-semibold text-slate-500">Movimento<select disabled={!!fixedType} className={`${inputClass} mt-1 h-10 text-xs disabled:bg-slate-100`} value={fixedType || filters.type || ''} onChange={event => setFilters({ ...filters, type: (event.target.value || undefined) as Filters['type'] })}><option value="">Todos</option><option value="income">Entrada</option><option value="expense">Saída</option><option value="transfer">Transferência</option></select></label>
            <label className="text-[10px] font-semibold text-slate-500">Categoria<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.category || ''} onChange={event => setFilters({ ...filters, category: event.target.value || undefined })}><option value="">Todas as categorias</option>{(categories.data || []).map((item: Category) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
            <label className="text-[10px] font-semibold text-slate-500">Responsável<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.responsible || ''} onChange={event => setFilters({ ...filters, responsible: event.target.value || undefined })}><option value="">Todos</option>{(responsibles.data || []).map((item: Responsible) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
            <label className="text-[10px] font-semibold text-slate-500">Conta<select disabled={!!fixedAccount} className={`${inputClass} mt-1 h-10 text-xs disabled:bg-slate-100`} value={fixedAccount || filters.account || ''} onChange={event => setFilters({ ...filters, account: (event.target.value || undefined) as Filters['account'] })}><option value="">Caixa e Banco</option><option value="cash">Caixa</option><option value="bank">Banco</option></select></label>
            <button onClick={() => setFilters({})} className={`${buttonLight} sm:col-span-2 xl:col-span-6 xl:justify-self-end`} data-testid="button-clear-global-filters">Limpar filtros</button>
          </div>
        </details>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">{children}</main>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.19em] text-[#1769AA]">{eyebrow}</p><h1 className="font-[Manrope] text-[26px] font-extrabold tracking-[-.04em] text-[#123B63] sm:text-[32px]">{title}</h1><p className="mt-1.5 text-sm text-slate-500">{description}</p></div>
    {action}
  </div>;
}
function LoadingState() { return <div className="space-y-4" aria-label="A carregar"><div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" /></div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="surface flex flex-col items-center px-5 py-12 text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-[#EF4444]"><RefreshCw size={20} /></div><h3 className="font-semibold">Não foi possível carregar</h3><p className="mt-1 text-sm text-slate-500">Verifique a ligação e tente novamente.</p><button className={`${buttonLight} mt-4`} onClick={retry}><RefreshCw size={15} /> Tentar novamente</button></div>; }
function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="flex flex-col items-center px-5 py-12 text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf3fb] text-[#1769AA]"><CircleDollarSign size={23} /></div><h3 className="font-semibold text-[#123B63]">{title}</h3><p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{text}</p>{action && <div className="mt-4">{action}</div>}</div>; }

function MetricCard({ label, value, icon: Icon, tone, hint }: { label: string; value: number; icon: typeof Wallet; tone: 'blue'|'green'|'red'|'amber'; hint: string }) {
  const colors = { blue: 'bg-[#e9f2fb] text-[#1769AA]', green: 'bg-[#e8f7ed] text-[#36A85A]', red: 'bg-[#fff0ef] text-[#EF4444]', amber: 'bg-[#fff5df] text-[#F59E0B]' };
  return <div className="surface p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(18,59,99,.09)] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-3 font-[Manrope] text-[22px] font-extrabold tracking-[-.045em] text-[#123B63] sm:text-[25px]" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{money(value)}</p></div><div className={`grid h-10 w-10 place-items-center rounded-[14px] ${colors[tone]}`}><Icon size={19} /></div></div><p className="mt-3 text-[11px] text-slate-400">{hint}</p></div>;
}

function CountMetric({ value }: { value: number }) {
  return <div className="surface p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">N.º de movimentos</p><p className="mt-3 font-[Manrope] text-[25px] font-extrabold text-[#123B63]" data-testid="metric-movement-count">{value.toLocaleString('pt-AO')}</p></div><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#e9f2fb] text-[#1769AA]"><ArrowLeftRight size={19}/></div></div><p className="mt-3 text-[11px] text-slate-400">Movimentos incluídos no filtro</p></div>;
}

function FlowBars({ data }: { data: Overview['dailyFlow'] }) {
  if (!data.length) return <EmptyState title="Sem dados para este período" text="Quando houver movimentos, o fluxo diário será apresentado aqui." />;
  const days = data.slice(-12);
  const peak = Math.max(1, ...days.map(day => Math.max(day.incomeCents, day.expenseCents)));
  return <div className="flex h-[190px] items-end gap-2 border-b border-slate-100 pb-2 sm:gap-4">{days.map(day => <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="flex h-[150px] w-full items-end justify-center gap-1.5">{[{amount:day.incomeCents,color:'#36A85A',label:'Entradas'},{amount:day.expenseCents,color:'#EF4444',label:'Saídas'}].map(bar => <div key={bar.label} title={`${bar.label}: ${money(bar.amount)}`} className="w-[34%] max-w-5 rounded-t-md transition-all duration-500" style={{height:`${Math.max(5,bar.amount/peak*100)}%`,backgroundColor:bar.color}}/>)}</div><span className="truncate text-[9px] text-slate-400">{new Intl.DateTimeFormat('pt-AO',{day:'2-digit',month:'short'}).format(new Date(`${day.date.slice(0,10)}T12:00:00`))}</span></div>)}</div>;
}

function CategoryDonut({ data }: { data: Overview['expensesByCategory'] }) {
  const colors = ['#1769AA','#36A85A','#F59E0B','#EF4444','#5b8db7','#8c6bb1'];
  const otherCategories = data.slice(6);
  const chartData = [
    ...data.slice(0,6),
    ...(otherCategories.length ? [{
      category: 'Outras',
      amountCents: otherCategories.reduce((sum,item)=>sum+item.amountCents,0),
      percentage: otherCategories.reduce((sum,item)=>sum+item.percentage,0),
    }] : []),
  ];
  const segments: string[] = [];
  let cursor = 0;
  chartData.forEach((item,index) => {
    const next = cursor + item.percentage;
    segments.push(`${colors[index % colors.length]} ${cursor}% ${next}%`);
    cursor = next;
  });
  if (!data.length) return <EmptyState title="Sem despesas categorizadas" text="As despesas registadas com categoria vão surgir neste resumo." />;
  return <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
    <div className="relative mx-auto grid h-40 w-40 place-items-center rounded-full" style={{background:`conic-gradient(${segments.join(',')})`}}>
      <div className="grid h-[102px] w-[102px] place-items-center rounded-full bg-white text-center shadow-inner"><div><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Despesas</p><p className="mt-1 text-sm font-extrabold text-[#123B63]">{money(data.reduce((sum,item)=>sum+item.amountCents,0))}</p></div></div>
    </div>
    <div className="space-y-3">{chartData.map((item,index)=><div key={item.category} className="flex items-start gap-2.5 text-xs"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:colors[index%colors.length]}}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="break-words font-semibold text-slate-700">{item.category}</span><span className="shrink-0 text-slate-400">{item.percentage.toLocaleString('pt-AO',{maximumFractionDigits:1})}%</span></div><p className="mt-0.5 text-[11px] text-slate-500">{money(item.amountCents)}</p></div></div>)}</div>
  </div>;
}

function MovementModal({ open, close, movement, initialType }: { open: boolean; close: () => void; movement?: Movement; initialType?: 'income'|'expense'|'transfer' }) {
  const qc = useQueryClient();
  const categoriesQuery = useListCategories();
  const responsibleQuery = useListResponsibles();
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const defaults = movement ? {
    date: movement.date.slice(0, 10), type: movement.type, account: movement.account, destinationAccount: movement.destinationAccount || 'cash',
    amount: (movement.amountCents / 100).toFixed(2), category: movement.category || '', description: movement.description,
    responsible: movement.responsible || '', note: movement.note || '',
    bankChoice: movement.bankName ? (BANK_OPTIONS.includes(movement.bankName) ? movement.bankName : '__other__') : '',
    customBankName: movement.bankName && !BANK_OPTIONS.includes(movement.bankName) ? movement.bankName : '',
  } : { date: new Date().toISOString().slice(0, 10), type: initialType || 'expense', account: 'cash', destinationAccount: 'bank', amount: '', category: '', description: '', responsible: '', note: '', bankChoice: '', customBankName: '' };
  const form = useForm({ defaultValues: defaults });
  useEffect(() => { if (open) form.reset(defaults); }, [open, movement?.id, initialType]);
  if (!open) return null;
  const type = form.watch('type');
  const account = form.watch('account');
  const destinationAccount = form.watch('destinationAccount');
  const usesBank = account === 'bank' || (type === 'transfer' && destinationAccount === 'bank');
  const submit = form.handleSubmit(values => {
    const payload: MovementInput = {
      date: values.date, type: values.type as MovementInput['type'], account: values.account as MovementInput['account'],
      destinationAccount: values.type === 'transfer' ? values.destinationAccount as MovementInput['account'] : null,
      bankName: usesBank ? (values.bankChoice === '__other__' ? values.customBankName.trim() : values.bankChoice) || null : null,
      amountCents: parseKwanzaCents(values.amount), category: values.type !== 'transfer' ? values.category || null : null,
      description: values.description.trim(), responsible: values.responsible || null, note: values.note || null,
    };
    const done = () => { qc.invalidateQueries({ queryKey: getListMovementsQueryKey() }); qc.invalidateQueries({ queryKey: getGetOverviewQueryKey() }); close(); };
    if (movement) update.mutate({ id: movement.id, data: payload as MovementUpdate }, { onSuccess: done });
    else create.mutate({ data: payload }, { onSuccess: done });
  });
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#102f4d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="page-enter max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:max-w-[580px] sm:rounded-[24px] sm:p-7">
      <div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#1769AA]">{movement ? 'Actualizar registo' : 'Novo registo'}</p><h2 className="mt-1 font-[Manrope] text-xl font-extrabold text-[#123B63]">{movement ? 'Editar movimento' : 'Registar movimento'}</h2></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div>
      <Form {...form}><form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-600">Tipo *</legend>
          <div className="grid grid-cols-3 gap-2">
          {(['income','expense','transfer'] as const).map((choice, index) => <button type="button" key={choice} aria-pressed={type === choice} onClick={() => { form.setValue('type', choice); if (choice === 'transfer' && form.getValues('account') === form.getValues('destinationAccount')) form.setValue('destinationAccount', form.getValues('account') === 'cash' ? 'bank' : 'cash'); }} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${type === choice ? 'border-[#1769AA] bg-[#eaf3fb] text-[#1769AA]' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><span className="mr-1.5 inline-flex align-middle">{index === 0 ? <ArrowDownLeft size={15}/> : index === 1 ? <ArrowUpRight size={15}/> : <RefreshCw size={14}/>}</span>{movementTypeName(choice)}</button>)}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Data *<input type="date" className={inputClass} {...form.register('date', { required: true })} /></label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Montante (Kz) *<input inputMode="decimal" placeholder="0,00" className={inputClass} {...form.register('amount', { required: true, validate: v => parseKwanzaCents(v) > 0 || 'Indique um valor válido' })} /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">{type === 'transfer' ? 'Conta de origem *' : 'Conta *'}<select className={inputClass} {...form.register('account', { required: true, onChange: event => { const next = event.target.value; if (form.getValues('destinationAccount') === next) form.setValue('destinationAccount', next === 'cash' ? 'bank' : 'cash'); } })}><option value="cash">Caixa</option><option value="bank">Banco</option></select></label>
          {type === 'transfer' ? <label className="space-y-1.5 text-xs font-semibold text-slate-600">Conta de destino<select className={inputClass} {...form.register('destinationAccount')}><option value={form.watch('account') === 'cash' ? 'bank' : 'cash'}>{form.watch('account') === 'cash' ? 'Banco' : 'Caixa'}</option></select></label> :
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">Categoria *<select required className={inputClass} {...form.register('category', { required: true })}><option value="">Seleccione uma categoria</option>{(categoriesQuery.data || []).map((item: Category) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}
        </div>
        {usesBank && <div className={`grid gap-4 ${form.watch('bankChoice') === '__other__' ? 'sm:grid-cols-2' : ''}`}>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Banco utilizado *
            <select className={inputClass} {...form.register('bankChoice', { required: usesBank })}>
              <option value="">Seleccione o banco</option>
              {BANK_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__other__">Outro banco</option>
            </select>
          </label>
          {form.watch('bankChoice') === '__other__' && <label className="space-y-1.5 text-xs font-semibold text-slate-600">Nome do banco *
            <input autoComplete="organization" maxLength={120} className={inputClass} placeholder="Escreva o nome do banco" {...form.register('customBankName', { required: usesBank && form.watch('bankChoice') === '__other__' })} />
          </label>}
        </div>}
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Responsável<select className={inputClass} {...form.register('responsible')}><option value="">Sem responsável</option>{(responsibleQuery.data || []).filter((person: Responsible) => person.active || person.name === movement?.responsible).map(person => <option key={person.id} value={person.name}>{person.name}{!person.active ? ' (inactivo)' : ''}</option>)}</select></label>
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Descrição *<input placeholder="Ex.: Pagamento de fornecedor" className={inputClass} {...form.register('description', { required: true, minLength: 1 })} /></label>
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Nota (opcional)<textarea rows={2} placeholder="Acrescente um detalhe útil..." className={`${inputClass} h-auto resize-none py-3`} {...form.register('note')} /></label>
        {(create.isError || update.isError) && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage(create.error || update.error, 'Não foi possível guardar. Reveja os dados e tente novamente.')}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={close} className={buttonLight}>Cancelar</button><button disabled={create.isPending || update.isPending} className={buttonPrimary}>{create.isPending || update.isPending ? 'A guardar…' : <><Check size={16}/>{movement ? 'Guardar alterações' : 'Guardar movimento'}</>}</button></div>
      </form></Form>
    </div>
  </div>;
}

function MovementTable({ movements, onEdit, onDelete, onDetails, deletingId, readOnly = false }: { movements: Movement[]; onEdit: (m: Movement) => void; onDelete: (m: Movement) => void; onDetails: (m: Movement) => void; deletingId?: number; readOnly?: boolean }) {
  if (!movements.length) return <EmptyState title="Ainda sem movimentos" text="Os registos que adicionar aparecem aqui, organizados por data e conta." />;
  return <>
    <div className="divide-y divide-slate-100 md:hidden print:hidden">
      {movements.map(m => <article key={m.id} data-testid={`card-movement-${m.id}`} className="px-4 py-4">
        <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-[11px] text-slate-500">{dateLabel(m.date)}</span><span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{m.movementCode}</span></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${m.type === 'income' ? 'bg-[#e8f7ed] text-[#267a3f]' : m.type === 'expense' ? 'bg-[#fff0ef] text-[#c93b37]' : 'bg-[#eaf3fb] text-[#1769AA]'}`}>{movementTypeName(m.type).toUpperCase()}</span></div>
        <div className="mt-3 flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-[#123B63]">{m.description}</p><p className="mt-1 text-[11px] text-slate-500">{m.type === 'transfer' ? `${accountName(m.account)} → ${accountName(m.destinationAccount)}` : accountName(m.account)}{m.bankName ? ` · ${m.bankName}` : ''}</p></div><p className={`shrink-0 whitespace-nowrap text-sm font-bold ${m.type === 'income' ? 'text-[#36A85A]' : m.type === 'expense' ? 'text-[#EF4444]' : 'text-[#1769AA]'}`}>{m.type === 'income' ? '+' : m.type === 'expense' ? '−' : ''}{money(m.amountCents)}</p></div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px]"><div><p className="text-slate-400">Categoria</p><p className="mt-0.5 font-medium text-slate-700">{m.category || (m.type === 'transfer' ? 'Transferência' : '—')}</p></div><div><p className="text-slate-400">Responsável</p><p className="mt-0.5 font-medium text-slate-700">{m.responsible || '—'}</p></div><div className="col-span-2"><p className="text-slate-400">Observação</p><p className="mt-0.5 break-words text-slate-600">{m.note || '—'}</p></div></div>
        {!readOnly && <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2"><button aria-label="Ver detalhe" title="Ver detalhe" onClick={() => onDetails(m)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#1769AA]"><Eye size={16}/></button><button aria-label="Editar" title="Editar" onClick={() => onEdit(m)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#1769AA]"><Pencil size={15}/></button><button aria-label="Eliminar" title="Eliminar" onClick={() => onDelete(m)} disabled={deletingId === m.id} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-[#EF4444]"><Trash2 size={15}/></button></div>}
      </article>)}
    </div>
    <div className="hidden overflow-x-auto md:block print:block"><table className="w-full min-w-[1300px] table-fixed text-left"><colgroup><col style={{width:'145px'}}/><col style={{width:'95px'}}/><col style={{width:'85px'}}/><col style={{width:'125px'}}/><col style={{width:'110px'}}/><col style={{width:'130px'}}/><col style={{width:'110px'}}/><col style={{width:'160px'}}/><col style={{width:'110px'}}/><col style={{width:'140px'}}/>{!readOnly && <col style={{width:'145px'}}/>}</colgroup><thead><tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-3 py-3">Código</th><th className="px-3 py-3">Data</th><th className="px-3 py-3">Movimento</th><th className="px-3 py-3 text-right">Valor</th><th className="px-3 py-3">Origem</th><th className="px-3 py-3">Banco</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Descrição</th><th className="px-3 py-3">Responsável</th><th className="px-3 py-3">Observação</th>{!readOnly && <th className="px-3 py-3 text-right">Ações</th>}</tr></thead><tbody>{movements.map((m, index) => {
    const badgeColor = m.type === 'income' ? 'bg-[#e8f7ed] text-[#267a3f]' : m.type === 'expense' ? 'bg-[#fff0ef] text-[#c93b37]' : 'bg-[#eaf3fb] text-[#1769AA]';
    const amountColor = m.type === 'income' ? 'text-[#36A85A]' : m.type === 'expense' ? 'text-[#EF4444]' : 'text-[#1769AA]';
    return <tr key={m.id} data-testid={`row-movement-${m.id}`} className={`border-b border-slate-50 transition hover:bg-[#f8fbfe] ${index === movements.length - 1 ? 'border-b-0' : ''}`}>
      <td className="whitespace-nowrap px-3 py-3.5 text-[10px] font-semibold text-slate-600">{m.movementCode}</td>
      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-500">{dateLabel(m.date)}</td>
      <td className="px-3 py-3.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${badgeColor}`}>{movementTypeName(m.type).toUpperCase()}</span></td>
      <td className={`whitespace-nowrap px-3 py-3.5 text-right text-sm font-bold ${amountColor}`}>{m.type === 'income' ? '+' : m.type === 'expense' ? '−' : ''}{money(m.amountCents)}</td>
      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-600">{m.type === 'transfer' ? `${accountName(m.account)} → ${accountName(m.destinationAccount)}` : accountName(m.account)}</td>
      <td className="overflow-hidden px-3 py-3.5 text-xs text-slate-600"><span className="block truncate" title={m.bankName || ''}>{m.bankName || '—'}</span></td>
      <td className="overflow-hidden px-3 py-3.5 text-xs text-slate-600"><span className="block truncate" title={m.category || ''}>{m.category || (m.type === 'transfer' ? 'Transferência' : '—')}</span></td>
      <td className="overflow-hidden px-3 py-3.5 text-xs font-semibold text-[#123B63]"><span className="block truncate" title={m.description}>{m.description}</span></td>
      <td className="overflow-hidden px-3 py-3.5 text-xs text-slate-600"><span className="block truncate" title={m.responsible || ''}>{m.responsible || '—'}</span></td>
      <td className="overflow-hidden px-3 py-3.5 text-xs text-slate-500"><span className="block truncate" title={m.note || ''}>{m.note || '—'}</span></td>
      {!readOnly && <td className="px-3 py-3.5"><div className="flex justify-end gap-1"><button aria-label="Ver detalhe" title="Ver detalhe" onClick={() => onDetails(m)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#1769AA]"><Eye size={16}/></button><button aria-label="Editar" title="Editar" onClick={() => onEdit(m)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#1769AA]"><Pencil size={15}/></button><button aria-label="Eliminar" title="Eliminar" onClick={() => onDelete(m)} disabled={deletingId === m.id} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-[#EF4444]"><Trash2 size={15}/></button></div></td>}
    </tr>;
  })}</tbody></table></div>
  </>;
}

function MovementLedger({ title, subtitle, scope, transfersOnly = false }: { title: string; subtitle: string; scope?: 'bank'|'cash'; transfersOnly?: boolean }) {
  const { filters, setFilters } = useGlobalFilters();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Movement>();
  const [details, setDetails] = useState<Movement>();
  const categories = useListCategories();
  const responsibles = useListResponsibles();
  const deleteMutation = useDeleteMovement();
  const activeFilterCount = Object.entries(filters).filter(([key,value]) => value !== undefined && value !== '' && !(scope && key === 'account') && !(transfersOnly && key === 'type')).length;
  const params = useMemo<ListMovementsParams>(() => ({
    ...filters,
    ...(scope ? { account: scope } : {}),
    ...(transfersOnly ? { type: 'transfer' } : {}),
  }), [filters.startDate, filters.endDate, filters.search, filters.type, filters.category, filters.responsible, filters.account, scope, transfersOnly]);
  const query = useListMovements(params);
  const overview = useGetOverview(params);
  const summary = overview.data as Overview | undefined;
  const scopedSummary = scope ? summary?.[scope] : undefined;
  const income = scopedSummary?.incomeCents ?? summary?.incomeCents ?? 0;
  const expense = scopedSummary?.expenseCents ?? summary?.expenseCents ?? 0;
  const net = income - expense;
  const transferTotal = transfersOnly ? (query.data || []).reduce((sum, item) => sum + item.amountCents, 0) : 0;
  const edit = (m: Movement) => { setEditing(m); setModal(true); };
  const remove = (m: Movement) => { if (window.confirm(`Eliminar o movimento “${m.description}”? Esta acção não pode ser anulada.`)) deleteMutation.mutate({ id: m.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMovementsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetOverviewQueryKey() }); } }); };
  return <>
    <PageHeading eyebrow="Movimentos" title={title} description={subtitle} action={<button onClick={() => { setEditing(undefined); setModal(true); }} className={buttonPrimary}><Plus size={17}/> Novo movimento</button>} />
    <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label={transfersOnly ? 'Montante transferido' : scope ? `Entradas ${scope === 'cash' ? 'Caixa' : 'Banco'}` : 'Entradas'} value={transfersOnly ? transferTotal : income} icon={transfersOnly ? ArrowLeftRight : ArrowDownLeft} tone={transfersOnly ? 'blue' : 'green'} hint={transfersOnly ? 'Somatório das transferências filtradas' : 'Total no período filtrado'}/>
      <MetricCard label={transfersOnly ? 'Saldo do Banco' : scope ? `Saídas ${scope === 'cash' ? 'Caixa' : 'Banco'}` : 'Saídas'} value={transfersOnly ? summary?.bank.balanceCents || 0 : expense} icon={transfersOnly ? Landmark : ArrowUpRight} tone={transfersOnly ? 'blue' : 'red'} hint={transfersOnly ? 'Saldo actual nesta conta' : 'Movimentos de saída no período'}/>
      <MetricCard label={transfersOnly ? 'Saldo da Caixa' : scope ? 'Saldo actual' : 'Saldo do período'} value={transfersOnly ? summary?.cash.balanceCents || 0 : scope ? scopedSummary?.balanceCents || 0 : net} icon={transfersOnly ? Wallet : CircleDollarSign} tone="blue" hint={scope ? 'Saldo disponível nesta conta' : transfersOnly ? 'Saldo actual nesta conta' : 'Entradas menos saídas filtradas'}/>
      <CountMetric value={summary?.movementCount || 0}/>
    </section>
    {transfersOnly && <p className="mb-5 rounded-xl border border-[#b8d2e9] bg-[#eaf3fb] px-4 py-3 text-xs text-[#123B63]">O valor transferido sai de uma conta e entra noutra; o total combinado de Caixa e Banco não muda.</p>}
    {scope && <section className="surface mb-5 p-5 sm:p-6"><div className="mb-5"><h2 className="font-[Manrope] text-base font-bold">Entradas e saídas por dia</h2><p className="mt-1 text-xs text-slate-400">{scope === 'cash' ? 'Fluxo diário do Caixa' : 'Fluxo diário do Banco'}</p></div><FlowBars data={summary?.dailyFlow || []}/></section>}
    <section className="surface mb-5 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#123B63]"><Filter size={15} className="text-[#1769AA]"/> Filtrar movimentos <span className="ml-auto rounded-full bg-[#eaf3fb] px-2.5 py-1 text-[10px] text-[#1769AA]">Filtros activos: {activeFilterCount}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[10px] font-semibold text-slate-500">Data inicial<input type="date" className={`${inputClass} mt-1 h-10 text-xs`} value={filters.startDate || ''} onChange={e => setFilters({ ...filters, startDate: e.target.value || undefined })}/></label>
        <label className="text-[10px] font-semibold text-slate-500">Data final<input type="date" className={`${inputClass} mt-1 h-10 text-xs`} value={filters.endDate || ''} onChange={e => setFilters({ ...filters, endDate: e.target.value || undefined })}/></label>
        {!transfersOnly && <label className="text-[10px] font-semibold text-slate-500">Tipo<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.type || ''} onChange={e => setFilters({ ...filters, type: (e.target.value || undefined) as Filters['type'] })}><option value="">Todos os tipos</option><option value="income">Entrada</option><option value="expense">Saída</option><option value="transfer">Transferência</option></select></label>}
        {!scope && !transfersOnly && <label className="text-[10px] font-semibold text-slate-500">Origem<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.account || ''} onChange={e => setFilters({ ...filters, account: (e.target.value || undefined) as Filters['account'] })}><option value="">Caixa e Banco</option><option value="cash">Caixa</option><option value="bank">Banco</option></select></label>}
        <label className="text-[10px] font-semibold text-slate-500">Categoria<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.category || ''} onChange={e => setFilters({ ...filters, category: e.target.value || undefined })}><option value="">Todas as categorias</option>{(categories.data || []).map((c: Category) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-slate-500">Responsável<select className={`${inputClass} mt-1 h-10 text-xs`} value={filters.responsible || ''} onChange={e => setFilters({ ...filters, responsible: e.target.value || undefined })}><option value="">Todas as pessoas</option>{(responsibles.data || []).map((p: Responsible) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <button onClick={() => setFilters({})} className={`${buttonLight} self-end`} data-testid="button-clear-ledger-filters">Limpar filtros</button>
      </div>
    </section>
    {deleteMutation.isError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{errorMessage(deleteMutation.error,'Não foi possível eliminar este movimento.')}</p>}
    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-[#123B63]">Registos</h2><p className="mt-0.5 text-[11px] text-slate-400">{query.data?.length || 0} movimentos encontrados</p></div><span className="rounded-full bg-[#eaf3fb] px-3 py-1 text-[10px] font-semibold text-[#1769AA]">{scope ? accountName(scope) : transfersOnly ? 'Transferências' : 'Todos'}</span></div>
      {query.isLoading ? <div className="p-5"><LoadingState/></div> : query.isError ? <div className="p-5"><ErrorState retry={() => query.refetch()}/></div> : <MovementTable movements={query.data || []} onEdit={edit} onDelete={remove} onDetails={setDetails} deletingId={deleteMutation.isPending ? Number(deleteMutation.variables?.id) : undefined}/>}
    </section>
    <MovementModal open={modal} close={() => setModal(false)} movement={editing} initialType={transfersOnly ? 'transfer' : undefined}/>
    {details && <DetailModal movement={details} close={() => setDetails(undefined)} onEdit={() => { setEditing(details); setDetails(undefined); setModal(true); }}/>}
  </>;
}

function DetailModal({ movement, close, onEdit }: { movement: Movement; close: () => void; onEdit: () => void }) {
  return <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#102f4d]/40 p-0 sm:items-center sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="page-enter w-full rounded-t-[24px] bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-[24px]">
    <div className="flex justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#1769AA]">Detalhe do movimento</p><h2 className="mt-1 text-xl font-bold">{movement.description}</h2></div><button onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
     <p className={`mt-5 font-[Manrope] text-2xl font-extrabold ${movement.type === 'expense' ? 'text-[#EF4444]' : movement.type === 'transfer' ? 'text-[#1769AA]' : 'text-[#36A85A]'}`}>{movement.type === 'expense' ? '−' : movement.type === 'income' ? '+' : ''}{money(movement.amountCents)}</p>
     <div className="mt-5 divide-y divide-slate-100 rounded-2xl bg-[#F5F8FC] px-4"><InfoRow label="Código" value={movement.movementCode}/><InfoRow label="Tipo" value={movementTypeName(movement.type)}/><InfoRow label="Data" value={dateLabel(movement.date)}/><InfoRow label="Conta" value={movement.type === 'transfer' ? `${accountName(movement.account)} → ${accountName(movement.destinationAccount)}` : accountName(movement.account)}/>{movement.bankName && <InfoRow label="Banco" value={movement.bankName}/>}<InfoRow label="Categoria" value={movement.category || 'Sem categoria'}/><InfoRow label="Responsável" value={movement.responsible || 'Sem responsável'}/><InfoRow label="Nota" value={movement.note || 'Sem nota'}/></div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={close} className={buttonLight}>Fechar</button><button onClick={onEdit} className={buttonPrimary}><Pencil size={15}/> Editar</button></div>
  </div></div>;
}
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 py-3 text-xs"><span className="text-slate-500">{label}</span><span className="text-right font-semibold text-[#123B63]">{value}</span></div>; }

function Dashboard() {
  const { filters } = useGlobalFilters();
  const params = useMemo<GetOverviewParams>(() => ({ ...filters }), [filters.startDate, filters.endDate, filters.search, filters.type, filters.category, filters.responsible, filters.account]);
  const overview = useGetOverview(params);
  const [modal, setModal] = useState(false);
  if (overview.isLoading) return <><PageHeading eyebrow="O seu dinheiro, em perspectiva" title="Resumo geral" description="Uma leitura simples e actualizada das suas contas."/><LoadingState/></>;
  if (overview.isError) return <><PageHeading eyebrow="O seu dinheiro, em perspectiva" title="Resumo geral" description="Uma leitura simples e actualizada das suas contas."/><ErrorState retry={() => overview.refetch()}/></>;
  const data = overview.data as Overview | undefined;
  const flow = data?.dailyFlow || [];
  const availableBalance = filters.account === 'cash' ? data?.cash.balanceCents || 0 : filters.account === 'bank' ? data?.bank.balanceCents || 0 : data?.totalAvailableCents || 0;
  return <div className="page-enter">
    <PageHeading eyebrow="O seu dinheiro, em perspectiva" title="Resumo geral" description={`Aqui está o estado das suas contas${filters.startDate || filters.endDate ? ' para o período seleccionado' : ' neste momento'}.`} action={<button className={buttonPrimary} onClick={() => setModal(true)}><Plus size={17}/> Registar movimento</button>} />
    <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label={filters.account ? `Disponível · ${accountName(filters.account)}` : 'Total disponível'} value={availableBalance} icon={CircleDollarSign} tone="blue" hint={filters.account ? `Saldo actual na conta ${accountName(filters.account)}` : 'Saldo combinado de Caixa e Banco'}/>
      <MetricCard label="Entradas" value={data?.incomeCents || 0} icon={ArrowDownLeft} tone="green" hint="Movimentos de entrada no período"/>
      <MetricCard label="Saídas" value={data?.expenseCents || 0} icon={ArrowUpRight} tone="red" hint="Movimentos de saída no período"/>
      <MetricCard label="Saldo líquido" value={data?.netCents || 0} icon={TrendingUp} tone={(data?.netCents || 0) >= 0 ? 'amber' : 'red'} hint={`${data?.movementCount || 0} movimentos registados`}/>
    </section>
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface p-5 sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><h2 className="font-[Manrope] text-base font-bold">Movimento ao longo do tempo</h2><p className="mt-1 text-xs text-slate-400">Entradas e saídas, dia a dia</p></div><div className="flex gap-3 text-[10px] font-semibold"><span className="flex items-center gap-1.5 text-slate-500"><i className="h-2 w-2 rounded-full bg-[#36A85A]"/>Entradas</span><span className="flex items-center gap-1.5 text-slate-500"><i className="h-2 w-2 rounded-full bg-[#EF4444]"/>Saídas</span></div></div>
        {flow.length ? <FlowBars data={flow}/> : <EmptyState title="O seu fluxo começa aqui" text="Quando registar entradas e saídas, verá a evolução diária nesta área."/>}
      </section>
      <section className="surface p-5 sm:p-6"><div className="mb-5"><h2 className="font-[Manrope] text-base font-bold">Despesas por categoria</h2><p className="mt-1 text-xs text-slate-400">Onde está a ser aplicado o dinheiro</p></div>
        <CategoryDonut data={data?.expensesByCategory || []}/>
      </section>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <section className="surface p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-[Manrope] text-base font-bold">Saldos por conta</h2><p className="mt-1 text-xs text-slate-400">Disponibilidade actual</p></div><Wallet size={18} className="text-[#1769AA]"/></div>
        {([['Caixa',data?.cash,'cash'],['Banco',data?.bank,'bank']] as const).map(([name,acc]) => <div key={name} className="mb-3 flex flex-col gap-3 rounded-2xl bg-[#F5F8FC] p-4 last:mb-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#1769AA] shadow-sm">{name==='Caixa'?<Wallet size={17}/>:<Landmark size={17}/>}</div><div className="min-w-0"><p className="text-xs font-semibold">{name}</p><p className="mt-1 break-words text-[10px] text-slate-400">Entradas {money(acc?.incomeCents || 0)} · Saídas {money(acc?.expenseCents || 0)}</p></div></div><p className="self-end whitespace-nowrap font-[Manrope] text-sm font-extrabold sm:self-auto">{money(acc?.balanceCents || 0)}</p></div>)}
      </section>
      <section className="surface overflow-hidden"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-[Manrope] text-base font-bold">Movimentos recentes</h2><p className="mt-1 text-xs text-slate-400">Actividade mais recente</p></div><Link href="/fluxo-diario" className="text-xs font-semibold text-[#1769AA] hover:underline">Ver todos</Link></div>
          {(data?.recentMovements || []).length ? <div className="divide-y divide-slate-50">{data?.recentMovements.slice(0,5).map(m => <div key={m.id} className="flex items-center gap-3 px-5 py-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${m.type==='income'?'bg-[#e8f7ed] text-[#36A85A]':m.type==='expense'?'bg-[#fff0ef] text-[#EF4444]':'bg-[#eaf3fb] text-[#1769AA]'}`}>{m.type==='income'?<ArrowDownLeft size={17}/>:m.type==='expense'?<ArrowUpRight size={17}/>:<RefreshCw size={15}/>}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{m.description}</p><p className="mt-1 truncate text-[10px] text-slate-400">{m.movementCode} · {dateLabel(m.date)} · {m.bankName || accountName(m.account)}</p></div><p className={`whitespace-nowrap text-xs font-bold ${m.type==='income'?'text-[#36A85A]':m.type==='expense'?'text-[#EF4444]':'text-[#1769AA]'}`}>{m.type==='income'?'+':m.type==='expense'?'−':''}{money(m.amountCents)}</p></div>)}</div> : <EmptyState title="Nenhuma actividade ainda" text="Os seus movimentos recentes vão aparecer aqui."/>}
      </section>
    </div>
    <p className="mt-5 flex items-center justify-end gap-1.5 text-[10px] text-slate-400"><Clock3 size={12}/> Actualizado {data?.updatedAt ? dateLabel(data.updatedAt) : 'agora'}</p>
    <MovementModal open={modal} close={() => setModal(false)}/>
  </div>;
}

function EntityPage({ kind }: { kind: 'categories'|'responsibles' }) {
  const isCategory = kind === 'categories';
  const cats = useListCategories(); const people = useListResponsibles();
  const createCategory = useCreateCategory(); const updateCategory = useUpdateCategory(); const deleteCategory = useDeleteCategory();
  const createPerson = useCreateResponsible(); const updatePerson = useUpdateResponsible(); const deletePerson = useDeleteResponsible();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category|Responsible|undefined>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''); const [role, setRole] = useState(''); const [active, setActive] = useState(true);
  const list = isCategory ? cats : people;
  const start = (entity?: Category|Responsible) => { setEditing(entity); setName(entity?.name || ''); setRole(!isCategory && entity ? (entity as Responsible).role || '' : ''); setActive(!isCategory && entity ? (entity as Responsible).active : true); setOpen(true); };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: isCategory ? getListCategoriesQueryKey() : getListResponsiblesQueryKey() });
    qc.invalidateQueries({ queryKey: getListMovementsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetOverviewQueryKey() });
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const done = () => { invalidate(); setOpen(false); };
    if (isCategory) {
      if (editing) updateCategory.mutate({ id: editing.id, data: { name: name.trim() } }, { onSuccess: done });
      else createCategory.mutate({ data: { name: name.trim() } }, { onSuccess: done });
    } else {
      const payload = { name: name.trim(), role: role.trim() || null, active };
      if (editing) updatePerson.mutate({ id: editing.id, data: payload }, { onSuccess: done });
      else createPerson.mutate({ data: payload }, { onSuccess: done });
    }
  };
  const remove = (entry: Category|Responsible) => { if (window.confirm(`Eliminar “${entry.name}”?`)) { const done = invalidate; if (isCategory) deleteCategory.mutate({ id: entry.id }, { onSuccess: done }); else deletePerson.mutate({ id: entry.id }, { onSuccess: done }); } };
  return <>
    <PageHeading eyebrow="Organização" title={isCategory ? 'Categorias' : 'Responsáveis'} description={isCategory ? 'Agrupe as despesas para perceber melhor cada saída.' : 'Defina quem acompanha e regista os movimentos.'} action={<button onClick={() => start()} className={buttonPrimary}><Plus size={17}/>{isCategory ? 'Nova categoria' : 'Adicionar responsável'}</button>}/>
    {(deleteCategory.isError || deletePerson.isError) && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{errorMessage(deleteCategory.error || deletePerson.error,'Não foi possível eliminar o registo.')}</p>}
    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold">{isCategory ? 'As suas categorias' : 'Pessoas responsáveis'}</h2><p className="mt-1 text-[11px] text-slate-400">{list.data?.length || 0} registos</p></div>{isCategory?<Tag size={18} className="text-[#1769AA]"/>:<UsersRound size={18} className="text-[#1769AA]"/>}</div>
      {list.isLoading ? <div className="p-5"><LoadingState/></div> : list.isError ? <div className="p-5"><ErrorState retry={() => list.refetch()}/></div> : !(list.data || []).length ? <EmptyState title={isCategory ? 'Crie a primeira categoria' : 'Adicione uma pessoa responsável'} text={isCategory ? 'Use nomes claros como Transporte, Fornecedores ou Alimentação.' : 'Os responsáveis ajudam a manter cada movimento identificado.'} action={<button onClick={() => start()} className={buttonPrimary}><Plus size={16}/> {isCategory ? 'Criar categoria' : 'Adicionar pessoa'}</button>}/> :
        <div className="divide-y divide-slate-50">{(list.data as (Category|Responsible)[]).map(entry => <div key={entry.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f8fbfe]"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#eaf3fb] text-xs font-bold text-[#1769AA]">{isCategory ? <Tag size={17}/> : initials(entry.name)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{entry.name}</p>{!isCategory && !(entry as Responsible).active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">Inactivo</span>}</div><p className="mt-1 text-[11px] text-slate-400">{isCategory ? `Criada a ${dateLabel(entry.createdAt)}` : (entry as Responsible).role || 'Sem função definida'}</p></div><button onClick={() => start(entry)} aria-label="Editar registo" className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#1769AA]"><Pencil size={16}/></button><button onClick={() => remove(entry)} aria-label="Eliminar registo" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-[#EF4444]"><Trash2 size={16}/></button></div>)}</div>}
    </section>
    {open && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#102f4d]/40 p-0 sm:items-center sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="page-enter w-full rounded-t-[24px] bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-[24px]"><div className="mb-5 flex justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#1769AA]">{editing?'Editar':'Novo registo'}</p><h2 className="mt-1 text-xl font-bold">{isCategory?'Categoria':'Responsável'}</h2></div><button onClick={()=>setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><form onSubmit={save} className="space-y-4"><label className="block space-y-1.5 text-xs font-semibold text-slate-600">Nome<input autoFocus required maxLength={isCategory?80:120} value={name} onChange={e=>setName(e.target.value)} className={inputClass} placeholder={isCategory?'Ex.: Transporte':'Nome e apelido'}/></label>{!isCategory&&<><label className="block space-y-1.5 text-xs font-semibold text-slate-600">Função (opcional)<input value={role} onChange={e=>setRole(e.target.value)} className={inputClass} placeholder="Ex.: Operações"/></label><label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#F5F8FC] p-3 text-xs font-semibold"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} className="h-4 w-4 accent-[#1769AA]"/>Responsável activo</label></>}
      {(createCategory.isError||updateCategory.isError||createPerson.isError||updatePerson.isError)&&<p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Não foi possível guardar. Tente novamente.</p>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setOpen(false)} className={buttonLight}>Cancelar</button><button className={buttonPrimary}><Check size={15}/> Guardar</button></div></form></div></div>}
  </>;
}

function SettingsPage() {
  const query = useGetSettings();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [bank, setBank] = useState(''); const [cash, setCash] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (query.data && !loaded) {
      const setting = query.data as AppSettings;
      setBank((setting.bankOpeningBalanceCents / 100).toFixed(2));
      setCash((setting.cashOpeningBalanceCents / 100).toFixed(2));
      setLoaded(true);
    }
  }, [query.data, loaded]);
  const save = (e: React.FormEvent) => { e.preventDefault(); update.mutate({ data: { bankOpeningBalanceCents: parseKwanzaCents(bank), cashOpeningBalanceCents: parseKwanzaCents(cash) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); qc.invalidateQueries({ queryKey: getGetOverviewQueryKey() }); } }); };
  return <><PageHeading eyebrow="Preferências" title="Configurações" description="Defina os saldos iniciais para começar a acompanhar as contas."/>
    {query.isLoading ? <LoadingState/> : query.isError ? <ErrorState retry={()=>query.refetch()}/> : <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="surface p-5 sm:p-7"><div className="mb-6 flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#eaf3fb] text-[#1769AA]"><Settings2 size={18}/></div><div><h2 className="font-[Manrope] text-base font-bold">Saldos de abertura</h2><p className="mt-1 text-xs text-slate-400">Montantes existentes no início do controlo financeiro.</p></div></div>
        <form onSubmit={save} className="space-y-4"><label className="block space-y-1.5 text-xs font-semibold text-slate-600">Saldo inicial do Banco (Kz)<input type="number" step="0.01" min="0" value={bank} onChange={e=>setBank(e.target.value)} className={inputClass}/></label><label className="block space-y-1.5 text-xs font-semibold text-slate-600">Saldo inicial da Caixa (Kz)<input type="number" step="0.01" min="0" value={cash} onChange={e=>setCash(e.target.value)} className={inputClass}/></label>
          {update.isSuccess && <p className="rounded-xl bg-[#e8f7ed] px-3 py-2.5 text-xs font-medium text-[#267a3f]">Saldos iniciais actualizados com sucesso.</p>}{update.isError&&<p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">Não foi possível guardar os saldos. Tente novamente.</p>}
          <div className="flex justify-end border-t border-slate-100 pt-4"><button disabled={update.isPending} className={buttonPrimary}><Check size={16}/>{update.isPending?'A guardar…':'Guardar saldos'}</button></div></form>
      </section>
      <aside className="rounded-[20px] bg-[#123B63] p-6 text-white"><div className="mb-6 grid h-11 w-11 place-items-center rounded-[15px] bg-white/10"><CircleDollarSign size={22}/></div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/70">Um ponto de partida</p><h2 className="mt-2 font-[Manrope] text-xl font-bold">As contas começam no valor certo.</h2><p className="mt-3 text-sm leading-relaxed text-blue-100/70">Os saldos de abertura são somados aos movimentos registados para mostrar o valor disponível em cada conta.</p><div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><div className="flex justify-between text-xs"><span className="text-blue-100/65">Banco</span><b>{money(query.data?.bankOpeningBalanceCents || 0)}</b></div><div className="flex justify-between text-xs"><span className="text-blue-100/65">Caixa</span><b>{money(query.data?.cashOpeningBalanceCents || 0)}</b></div></div></aside>
     </div>}
     <EmployeeProfileSettings/>
  </>;
}

function EmployeeProfileSettings() {
  const profile = useGetProfile();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (profile.data && !loaded) {
      setDisplayName(profile.data.displayName || '');
      setLoaded(true);
    }
  }, [profile.data, loaded]);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) return;
    update.mutate(
      { data: { displayName: name } },
      {
        onSuccess: result => {
          qc.setQueryData(getGetProfileQueryKey(), result);
          setDisplayName(result.displayName || name);
        },
      },
    );
  };
  return <section className="surface mt-5 p-5 sm:p-7">
    <div className="mb-5 flex items-start gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#eaf3fb] text-[#1769AA]"><UsersRound size={18}/></div>
      <div><h2 className="font-[Manrope] text-base font-bold">Perfil do funcionário</h2><p className="mt-1 text-xs text-slate-400">Este nome aparece na sua sessão do CaixaPro.</p></div>
    </div>
    {profile.isError ? <ErrorState retry={() => profile.refetch()}/> : <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 space-y-1.5 text-xs font-semibold text-slate-600">Nome apresentado<input required minLength={2} maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} className={inputClass} placeholder="Nome e apelido"/></label>
      <button disabled={update.isPending || profile.isLoading || displayName.trim().length < 2} className={buttonPrimary}><Check size={16}/>{update.isPending ? 'A guardar…' : 'Guardar nome'}</button>
      {update.isSuccess && <span role="status" className="text-xs font-medium text-[#267a3f]">Nome actualizado.</span>}
      {update.isError && <span role="alert" className="text-xs text-red-700">{errorMessage(update.error, 'Não foi possível actualizar o nome.')}</span>}
    </form>}
  </section>;
}

function ReportsPage() {
  const { filters } = useGlobalFilters();
  const movements = useListMovements(filters);
  const overview = useGetOverview(filters);
  const download = (format: 'csv'|'excel') => {
    const rows = movements.data || [];
    const headers = ['Código','Data','Tipo','Descrição','Conta','Banco','Destino','Categoria','Responsável','Montante (Kz)','Nota'];
    const exportRows = rows.map(m => [m.movementCode,m.date.slice(0,10),movementTypeName(m.type),m.description,accountName(m.account),m.bankName||'',accountName(m.destinationAccount),m.category||'',m.responsible||'',m.amountCents/100,m.note||'']);
    const blob = format === 'excel'
      ? createXlsxBlob(headers, exportRows)
      : createCsvBlob(headers, exportRows.map(row => row.map((value,index) => index === 9 && typeof value === 'number' ? value.toFixed(2).replace('.', ',') : value)));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-financeiro-${new Date().toISOString().slice(0,10)}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <><PageHeading eyebrow="Análise e partilha" title="Relatórios" description="Exporte os movimentos e leve um resumo claro das contas consigo."/>
    {movements.isLoading || overview.isLoading ? <LoadingState/> : movements.isError || overview.isError ? <ErrorState retry={()=>{movements.refetch();overview.refetch()}}/> : <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="surface p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-[Manrope] text-base font-bold">Resumo do período</h2><p className="mt-1 text-xs text-slate-400">{filters.startDate||filters.endDate ? `${filters.startDate||'Início'} a ${filters.endDate||'Hoje'}` : 'Todos os movimentos'}</p></div><CalendarDays size={18} className="text-[#1769AA]"/></div>
        <div className="grid gap-3 sm:grid-cols-2"><SummaryTile label="Entradas" amount={overview.data?.incomeCents||0} tone="green"/><SummaryTile label="Saídas" amount={overview.data?.expenseCents||0} tone="red"/><SummaryTile label="Saldo líquido" amount={overview.data?.netCents||0} tone="blue"/><SummaryTile label="Movimentos" text={`${overview.data?.movementCount||0}`} tone="amber"/></div>
        <div className="mt-5 rounded-2xl bg-[#F5F8FC] p-4"><div className="mb-3 flex items-center justify-between text-xs"><span className="font-semibold">Saldos actuais</span><span className="font-bold">{money(overview.data?.totalAvailableCents||0)}</span></div><div className="flex h-2 overflow-hidden rounded-full bg-slate-200"><div className="bg-[#1769AA]" style={{width:`${overview.data?.totalAvailableCents ? Math.max(0,overview.data.bank.balanceCents / overview.data.totalAvailableCents *100):50}%`}}/><div className="bg-[#36A85A] flex-1"/></div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Banco {money(overview.data?.bank.balanceCents||0)}</span><span>Caixa {money(overview.data?.cash.balanceCents||0)}</span></div></div>
      </section>
      <section className="surface p-5 sm:p-6"><div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#1769AA]">Exportar</p><h2 className="mt-1 font-[Manrope] text-base font-bold">Escolha o formato</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Os ficheiros respeitam os filtros aplicados à pesquisa global.</p></div>
        <div className="space-y-3"><ExportButton icon={Download} title="Ficheiro CSV" description="Texto com separador ponto e vírgula" onClick={()=>download('csv')}/><ExportButton icon={FileSpreadsheet} title="Livro Excel (.xlsx)" description="Folha editável com montantes numéricos" onClick={()=>download('excel')}/><ExportButton icon={FileText} title="Relatório para PDF" description="Abrir a janela de impressão ou guardar como PDF" onClick={()=>window.print()}/></div>
        <div className="mt-5 rounded-xl border border-[#f2d89a] bg-[#fff8e8] p-3 text-[11px] leading-relaxed text-[#82651c]">O relatório inclui {movements.data?.length || 0} movimentos. Ajuste o período na barra superior para refinar os resultados.</div>
      </section>
      <section className="surface overflow-hidden xl:col-span-2"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="text-sm font-bold">Pré-visualização dos movimentos</h2><p className="mt-1 text-[11px] text-slate-400">Uma amostra do conteúdo exportado</p></div><button onClick={()=>download('csv')} className={buttonLight}><Download size={15}/> Descarregar CSV</button></div>{movements.data?.length ? <><div className="max-h-[330px] overflow-auto print:hidden"><MovementTable movements={movements.data.slice(0,8)} onEdit={()=>undefined} onDelete={()=>undefined} onDetails={()=>undefined} readOnly/></div><div className="hidden print:block"><MovementTable movements={movements.data} onEdit={()=>undefined} onDelete={()=>undefined} onDetails={()=>undefined} readOnly/></div></> : <EmptyState title="Sem dados para exportar" text="Adicione movimentos ou altere os filtros para preparar o relatório."/>}</section>
    </div>}
  </>;
}
function SummaryTile({label,amount,text,tone}:{label:string;amount?:number;text?:string;tone:'green'|'red'|'blue'|'amber'}) { return <div className="rounded-2xl bg-[#F5F8FC] p-4"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-2 font-[Manrope] text-lg font-extrabold ${tone==='green'?'text-[#36A85A]':tone==='red'?'text-[#EF4444]':tone==='blue'?'text-[#1769AA]':'text-[#F59E0B]'}`}>{text||money(amount||0)}</p></div>; }
function ExportButton({icon:Icon,title,description,onClick}:{icon:typeof Download;title:string;description:string;onClick:()=>void}) { return <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3.5 text-left transition hover:border-[#b8d2e9] hover:bg-[#f7fbff]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf3fb] text-[#1769AA] transition group-hover:bg-[#1769AA] group-hover:text-white"><Icon size={18}/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{title}</span><span className="mt-1 block text-[10px] text-slate-400">{description}</span></span><Download size={15} className="text-slate-300 group-hover:text-[#1769AA]"/></button>; }

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function AuthLoading() {
  return <main className="grid min-h-[100dvh] place-items-center bg-[#F5F8FC]">
    <div className="flex flex-col items-center gap-4 text-center">
      <img src={`${basePath}/logo.svg`} alt="" className="h-12 w-12"/>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#1769AA]/20 border-t-[#1769AA]"/>
      <p className="text-xs font-medium text-slate-500">A preparar a sua conta…</p>
    </div>
  </main>;
}

function SignInPage() {
  return <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#F5F8FC] px-4 py-8">
    <Link href="/" className="text-xs font-semibold text-[#1769AA] hover:underline">← Voltar ao CaixaPro</Link>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/>
  </main>;
}

function SignUpPage() {
  return <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#F5F8FC] px-4 py-8">
    <Link href="/" className="text-xs font-semibold text-[#1769AA] hover:underline">← Voltar ao CaixaPro</Link>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/>
  </main>;
}

function ProfileSetup({ suggestedName }: { suggestedName: string }) {
  const update = useUpdateProfile();
  const client = useQueryClient();
  const [displayName, setDisplayName] = useState(suggestedName);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) return;
    update.mutate(
      { data: { displayName: name } },
      { onSuccess: profile => client.setQueryData(getGetProfileQueryKey(), profile) },
    );
  };
  return <main className="grid min-h-[100dvh] place-items-center bg-[#F5F8FC] px-4 py-8">
    <section className="w-full max-w-[460px] rounded-[28px] border border-[#dce7f0] bg-white p-6 shadow-[0_24px_70px_rgba(18,59,99,.10)] sm:p-8">
      <div className="mb-6 flex items-center gap-3"><img src={`${basePath}/logo.svg`} alt="" className="h-11 w-11"/><div><p className="font-[Manrope] text-lg font-extrabold text-[#123B63]">CaixaPro</p><p className="text-xs text-slate-400">Configure o seu livro</p></div></div>
      <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#1769AA]">Primeiro acesso</p>
      <h1 className="mt-2 font-[Manrope] text-2xl font-extrabold text-[#123B63]">Como devemos apresentar o seu nome?</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Este nome será mostrado na sua sessão. O seu livro financeiro começa vazio e só fica visível para esta conta.</p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Nome do funcionário
          <input autoFocus required minLength={2} maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} className={inputClass} placeholder="Nome e apelido"/>
        </label>
        {update.isError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">{errorMessage(update.error, 'Não foi possível guardar o nome.')}</p>}
        <button disabled={update.isPending || displayName.trim().length < 2} className={`${buttonPrimary} w-full`}>
          <Check size={16}/>{update.isPending ? 'A guardar…' : 'Criar o meu livro'}
        </button>
      </form>
    </section>
  </main>;
}

function FinancialApp({ suggestedName }: { suggestedName: string }) {
  const profile = useGetProfile();
  const [filters, setFilters] = useState<Filters>({});
  if (profile.isLoading) return <AuthLoading/>;
  if (profile.isError) return <main className="grid min-h-[100dvh] place-items-center bg-[#F5F8FC] px-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><p className="font-semibold text-[#123B63]">Não foi possível abrir o seu livro.</p><p className="mt-2 text-sm text-slate-500">Verifique a ligação e tente novamente.</p><button className={`${buttonPrimary} mt-5`} onClick={() => void profile.refetch()}><RefreshCw size={15}/> Tentar novamente</button></div></main>;
  if (!profile.data?.displayName) return <ProfileSetup suggestedName={suggestedName}/>;
  return <EmployeeNameContext.Provider value={profile.data.displayName}>
    <FilterContext.Provider value={{ filters, setFilters }}>
      <Shell><RoutedErrorBoundary><Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/fluxo-diario" component={()=><MovementLedger title="Fluxo diário" subtitle="Acompanhe entradas, saídas e transferências num só lugar."/>}/>
      <Route path="/caixa" component={()=><MovementLedger title="Movimentos de Caixa" subtitle="Veja o dinheiro que entrou e saiu da sua caixa." scope="cash"/>}/>
      <Route path="/banco" component={()=><MovementLedger title="Movimentos de Banco" subtitle="Acompanhe os movimentos da sua conta bancária." scope="bank"/>}/>
      <Route path="/transferencias" component={()=><MovementLedger title="Transferências" subtitle="Registe e consulte passagens de valor entre contas." transfersOnly/>}/>
      <Route path="/categorias" component={()=><EntityPage kind="categories"/>}/>
      <Route path="/responsaveis" component={()=><EntityPage kind="responsibles"/>}/>
      <Route path="/relatorios" component={ReportsPage}/>
      <Route path="/configuracoes" component={SettingsPage}/>
      <Route component={NotFound}/>
      </Switch></RoutedErrorBoundary></Shell>
    </FilterContext.Provider>
  </EmployeeNameContext.Provider>;
}

function AppRoutes() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [location, setLocation] = useLocation();
  if (!isLoaded) return <AuthLoading/>;
  if (!isSignedIn || !user) {
    return <Switch>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/" component={() => <AuthLanding onSignIn={() => setLocation('/sign-in')} onSignUp={() => setLocation('/sign-up')}/>}/>
      <Route component={() => <Redirect to="/"/>}/>
    </Switch>;
  }
  if (location.startsWith('/sign-in') || location.startsWith('/sign-up')) {
    return <Redirect to="/"/>;
  }
  return <FinancialApp key={user.id} suggestedName={user.fullName || user.firstName || ''}/>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Bem-vindo de volta', subtitle: 'Entre para aceder ao seu livro financeiro.' } },
      signUp: { start: { title: 'Crie a sua conta', subtitle: 'Comece um livro financeiro privado para a sua conta.' } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator/>
      <TooltipProvider>
        <AppRoutes/>
        <Toaster/>
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter>;
}

export default App;
