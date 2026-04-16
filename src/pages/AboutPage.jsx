import { Link } from "react-router-dom";

export function AboutPage() {
  return (
    <main style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>About This Shell</h1>
      <p>
        This React structure is added for class/project format alignment:
        <code> App {'->'} AuthProvider {'->'} RouterProvider</code>.
      </p>
      <Link to="/">Back Home</Link>
    </main>
  );
}
