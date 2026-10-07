import { ArrowRight, BookOpen, Check, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';
import { Link } from 'wouter';

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

type AuthLandingProps = {
  onSignIn: () => void;
  onSignUp: () => void;
};

export default function AuthLanding({ onSignIn, onSignUp }: AuthLandingProps) {
  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#F5F8FC] text-[#123B63]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-36 -top-40 h-[430px] w-[430px] rounded-full border border-[#dce8f2]" />
        <div className="absolute -right-20 -top-24 h-[300px] w-[300px] rounded-full border border-[#e5edf5]" />
        <div className="absolute -bottom-52 -left-28 h-[430px] w-[430px] rounded-full bg-[#eaf3fb]/80" />
        <div className="absolute inset-x-0 top-0 h-1 bg-[#1769AA]" />
      </div>

      <header className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-7">
        <Link href="/" aria-label="CaixaPro, início" className="flex items-center gap-3">
          <img src={logoUrl} alt="" className="h-11 w-11" />
          <span className="font-[Manrope] text-[19px] font-extrabold tracking-[-.045em] text-[#123B63]">CaixaPro</span>
        </Link>
        <div className="hidden items-center gap-2 text-xs font-semibold text-[#668099] sm:flex">
          <LockKeyhole size={14} strokeWidth={2} />
          <span>Um livro privado para cada conta</span>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1320px] flex-1 items-center gap-12 px-5 pb-12 pt-8 sm:px-8 md:grid-cols-[1.02fr_.98fr] md:gap-8 md:py-14 lg:gap-16 lg:px-12">
        <div className="page-enter max-w-[610px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d8e7f3] bg-white/75 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[.13em] text-[#1769AA] shadow-[0_4px_16px_rgba(18,59,99,.04)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#36A85A]" />
            Finanças pessoais, com privacidade
          </div>
          <h1 className="font-[Manrope] text-[42px] font-extrabold leading-[1.07] tracking-[-.055em] text-[#123B63] sm:text-[54px] lg:text-[66px]">
            As suas contas.
            <br />
            <span className="text-[#1769AA]">No seu livro.</span>
          </h1>
          <p className="mt-6 max-w-[490px] text-[15px] leading-7 text-[#60778d] sm:text-[17px] sm:leading-8">
            Registe entradas, despesas e transferências num só lugar. Cada colaborador tem um livro próprio, privado e separado dos restantes.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onSignIn}
              className="group inline-flex min-h-[52px] items-center justify-center gap-3 rounded-xl bg-[#1769AA] px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(23,105,170,.18)] transition hover:-translate-y-0.5 hover:bg-[#123B63] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1769AA]/20"
            >
              Entrar na minha conta
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={onSignUp}
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-[#d8e3ed] bg-white/70 px-6 text-sm font-bold text-[#244b6d] transition hover:border-[#a9c5dc] hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1769AA]/15"
            >
              Criar conta
            </button>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#8496a7]">
            A sua conta dá acesso apenas ao seu próprio livro.
          </p>

          <div className="mt-12 grid max-w-[540px] gap-4 border-t border-[#dce6ef] pt-6 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e5f1fa] text-[#1769AA]"><ShieldCheck size={18} /></span>
              <div>
                <p className="text-sm font-bold text-[#244b6d]">Acesso individual</p>
                <p className="mt-1 text-xs leading-5 text-[#8293a3]">Os seus registos ficam separados por conta.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9f5ec] text-[#32864b]"><Check size={18} /></span>
              <div>
                <p className="text-sm font-bold text-[#244b6d]">Feito para o dia a dia</p>
                <p className="mt-1 text-xs leading-5 text-[#8293a3]">Caixa, banco e movimentos sempre claros.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="soft-in relative mx-auto w-full max-w-[520px] md:justify-self-end">
          <div aria-hidden="true" className="absolute -right-3 -top-7 h-28 w-28 rounded-[30px] border border-[#d4e4f0] sm:-right-7 sm:-top-10 sm:h-36 sm:w-36" />
          <div className="relative overflow-hidden rounded-[28px] border border-[#dce7f0] bg-white p-5 shadow-[0_24px_70px_rgba(18,59,99,.10)] sm:rounded-[32px] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#edf1f5] pb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf3fb] text-[#1769AA]">
                  <BookOpen size={21} strokeWidth={1.8} />
                </div>
                <div>
                  <p className="font-[Manrope] text-[15px] font-extrabold tracking-[-.025em]">O seu livro</p>
                  <p className="mt-0.5 text-[11px] text-[#8a9aaa]">Pessoal e privado</p>
                </div>
              </div>
              <div className="flex h-8 items-center gap-1.5 rounded-full bg-[#eaf6ed] px-3 text-[10px] font-bold text-[#32864b]">
                <LockKeyhole size={12} />
                PRIVADO
              </div>
            </div>

            <div className="py-6">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8a9aaa]">Organize as suas finanças</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#f2f7fb] p-4">
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#1769AA] shadow-sm"><Wallet size={16} /></div>
                  <p className="text-xs font-bold text-[#244b6d]">Caixa</p>
                  <div className="mt-3 h-1.5 w-[82%] rounded-full bg-[#d8e7f3]" />
                  <div className="mt-2 h-1.5 w-[54%] rounded-full bg-[#e3edf5]" />
                </div>
                <div className="rounded-2xl bg-[#f2f7fb] p-4">
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#32864b] shadow-sm"><BookOpen size={16} /></div>
                  <p className="text-xs font-bold text-[#244b6d]">Banco</p>
                  <div className="mt-3 h-1.5 w-[68%] rounded-full bg-[#d8e7f3]" />
                  <div className="mt-2 h-1.5 w-[44%] rounded-full bg-[#e3edf5]" />
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-[#d8e4ed] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#71879b]">
                  <span className="h-2 w-2 rounded-full bg-[#36A85A]" />
                  Entradas, despesas e transferências
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="h-2 w-full rounded-full bg-[#edf3f7]" />
                  <div className="h-2 w-[78%] rounded-full bg-[#edf3f7]" />
                  <div className="h-2 w-[88%] rounded-full bg-[#edf3f7]" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-[#123B63] px-4 py-3.5 text-white">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#a8d4f2]"><ShieldCheck size={18} /></div>
              <p className="text-xs leading-5 text-blue-50/90">Cada colaborador consulta apenas os registos da sua própria conta.</p>
            </div>
          </div>
          <div aria-hidden="true" className="absolute -bottom-5 -left-5 -z-10 h-24 w-24 rounded-full bg-[#dbeaf5]/80 blur-xl" />
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 border-t border-[#dce6ef] px-5 py-5 text-[11px] text-[#8a9aaa] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <span>CaixaPro <span className="px-1.5 text-[#c2cdd7]">/</span> Controlo financeiro pessoal</span>
        <span>Valores em Kwanza angolano (Kz)</span>
      </footer>
    </main>
  );
}
