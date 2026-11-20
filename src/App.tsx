import { AppStoreProvider } from './services/useAppStore';
import { AppShell } from './app/AppShell';

export default function App() {
  return (
    <AppStoreProvider>
      <AppShell />
    </AppStoreProvider>
  );
}
