import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/auth-context.jsx";
import { appRouter } from "./router.jsx";

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={appRouter} future={{ v7_startTransition: true }} />
    </AuthProvider>
  );
}
