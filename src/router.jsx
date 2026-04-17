import { createBrowserRouter } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { AboutPage } from "./pages/AboutPage.jsx";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <DashboardPage />,
  },
  {
    path: "/about",
    element: <AboutPage />,
  },
]);
