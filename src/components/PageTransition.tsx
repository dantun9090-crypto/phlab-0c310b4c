import { Outlet, useRouterState } from "@tanstack/react-router";

export function PageTransition() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  if (isHome) {
    return <Outlet />;
  }

  return (
    <div key={pathname} className="animate-fade-in">
      <Outlet />
    </div>
  );
}
