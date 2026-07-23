import { NavLink, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-sky-500 grid place-items-center font-bold text-sm">A</div>
            <span className="font-semibold tracking-tight">Accela Media Schedule Builder</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <TopLink to="/">Campaigns</TopLink>
            <TopLink to="/guided">Guided Builder</TopLink>
            <TopLink to="/reference">Reference Data</TopLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function TopLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md transition-colors ${
          isActive ? "bg-white/15 text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
