import { useRouter } from "next/router";
import { useState } from "react";

type Access = "records" | "verifier";

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

const Login = () => {
  const [selectedOption, setSelectedOption] = useState<Access | null>(null);
  const [mode, setMode] = useState<"login" | "request">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const switchMode = (next: "login" | "request") => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const resetForm = () => {
    setSelectedOption(null);
    setForm({ name: "", email: "", password: "", message: "" });
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.email.trim()) return setError("Please enter your email address.");
    if (mode === "login" && !form.password) return setError("Please enter your password.");
    if (mode === "request" && !form.name.trim()) return setError("Please enter your full name.");

    setSubmitting(true);
    try {
      if (mode === "request") {
        const response = await fetch("/api/auth/request-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, email: form.email, message: form.message }),
        });
        const data = await response.json();
        if (!data.success) return setError(data.error || "Could not send your request. Please try again.");
        setNotice(data.message);
        setForm((prev) => ({ ...prev, message: "" }));
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await response.json();
      if (!data.success) return setError(data.error || "Invalid email or password.");

      // The session itself lives in an httpOnly cookie; this is only display info for the UI.
      localStorage.setItem(
        "user",
        JSON.stringify({ name: data.user.name, email: data.user.email, role: data.user.role, access: selectedOption }),
      );
      const next = typeof router.query.next === "string" && router.query.next.startsWith("/") ? router.query.next : "/";
      router.push(next.startsWith("//") ? "/" : next);
    } catch {
      setError("An error occurred. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  const optionButton = (option: Access, title: string, subtitle: string, tone: "blue" | "green") => (
    <button
      onClick={() => setSelectedOption(option)}
      className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 group hover:shadow-md ${
        tone === "blue"
          ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 hover:border-blue-300"
          : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-100 hover:border-green-300"
      }`}
    >
      <div className="text-left">
        <h3 className={`font-medium text-gray-800 ${tone === "blue" ? "group-hover:text-blue-600" : "group-hover:text-green-600"}`}>
          {title}
        </h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <span className="text-gray-400">→</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="mx-auto bg-gradient-to-r from-blue-500 to-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Welcome to Magazines Summary Portal</h1>
            <p className="text-gray-500 mt-2">Secure access to our platform</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          {notice && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-green-700 text-sm">{notice}</p>
            </div>
          )}

          {!selectedOption ? (
            <div className="space-y-4">
              <p className="text-gray-600">Select your purpose:</p>
              {optionButton("records", "Add New Records", "Submit new data entries", "blue")}
              {optionButton("verifier", "Verify Summaries", "Review and validate information", "green")}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-800">
                  {mode === "login" ? "Sign in" : "Request access"}
                </h2>
                <div className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full">
                  {selectedOption === "records" ? "Add Records" : "Verify Summaries"}
                </div>
              </div>

              <div className="flex justify-center">
                <div className="bg-gray-100 p-1 rounded-lg flex">
                  {(["login", "request"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        mode === m ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {m === "login" ? "Login" : "Request access"}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "request" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" name="name" autoComplete="name" value={form.name} onChange={handleInputChange} className={inputClass} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" name="email" autoComplete="email" value={form.email} onChange={handleInputChange} className={inputClass} />
              </div>

              {mode === "login" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={form.password}
                    onChange={handleInputChange}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    No password yet, or forgot it?{" "}
                    <button type="button" onClick={() => switchMode("request")} className="text-blue-600 hover:underline">
                      Request one from the admin
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
                  <textarea name="message" rows={3} value={form.message} onChange={handleInputChange} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-2">
                    Your request is emailed to the admin, who will set a password for you.
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
                >
                  {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Send request"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-gray-50 px-8 py-4 text-center border-t border-gray-100">
          <p className="text-sm text-gray-500">Secure access portal • All rights reserved</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
