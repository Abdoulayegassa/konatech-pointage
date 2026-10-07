import { ServiceWorkerRegistration } from './service-worker-registration';

export function EmployeePwaLayout({ children }: { children: React.ReactNode }) {
  return <><ServiceWorkerRegistration />{children}</>;
}
