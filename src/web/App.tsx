/**
 * Application shell.
 * Owns the reviewer access gate; the admitted screen is the demo application.
 */
import { useEffect, useState, type FormEvent } from "react";
import { fetchAccess, submitAccessCode } from "./api.js";
import { BrandHeader } from "./components/BrandHeader.js";
import { DemoApp } from "./components/DemoApp.js";

export function App() {
  const [access, setAccess] = useState<
    "checking" | "required" | "admitted" | "unavailable"
  >("checking");
  const [code, setCode] = useState("");
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchAccess()
      .then((state) => {
        if (active) setAccess(state);
      })
      .catch(() => {
        if (active) setAccess("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  /** Input: the reviewer access code. Output: a private cookie and the demo screen. */
  async function enterDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError("");
    try {
      const result = await submitAccessCode(code);
      if (result === "admitted") {
        setCode("");
        setAccess("admitted");
        return;
      }
      setAccessError(
        result === "rejected"
          ? "The code was not accepted. Check it and try again."
          : "Demo access is temporarily unavailable. Please try again later.",
      );
    } catch {
      setAccessError("The demo server is unavailable. Please try again.");
    }
  }

  if (access === "admitted") return <DemoApp />;
  return (
    <>
      <BrandHeader title="Municipal service demo" />
      <main className="page">
        <section className="access-card">
          {access === "checking" ? (
            <p role="status">Checking demo access…</p>
          ) : access === "required" ? (
            <>
              <h1>Reviewer access</h1>
              <p className="intro">
                Enter the demo access code you were given to continue.
              </p>
              <form onSubmit={enterDemo}>
                <label htmlFor="reviewer-code">Reviewer access code</label>
                <input
                  id="reviewer-code"
                  type="password"
                  autoComplete="off"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <button type="submit">Enter demo</button>
              </form>
            </>
          ) : (
            <div role="alert">
              <p>The demo server is unavailable.</p>
              <button type="button" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}
          {accessError && (
            <p role="alert" className="error">
              {accessError}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
