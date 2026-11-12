import { AuthProvider } from '../auth/AuthProvider';
import { AppRouter } from './router';

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
