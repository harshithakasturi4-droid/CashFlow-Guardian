import type { DashboardData, TableRow } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("cashflow-token") || localStorage.getItem("authToken");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    let message = text || "Request failed";
    try {
      const parsed = JSON.parse(text);
      message = parsed.detail || message;
    } catch {
      // Fall back to the raw server message.
    }
    throw new Error(message);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return (await response.blob()) as T;
}

export const authApi = {
  signup: (payload: { email: string; password: string; name: string }) =>
    apiFetch<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

export const dataApi = {
  dashboard: () => apiFetch<DashboardData>("/api/dashboard"),
  query: (table: string, body: Record<string, unknown>) =>
    apiFetch<{ data: TableRow[] }>(`/api/query/${table}`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  upsert: (table: string, values: Record<string, unknown> | Array<Record<string, unknown>>) =>
    apiFetch<{ data: TableRow[] }>(`/api/data/${table}`, {
      method: "POST",
      body: JSON.stringify({ values })
    }),
  patch: (table: string, filters: Record<string, unknown>, values: Record<string, unknown>) =>
    apiFetch<{ data: TableRow[] }>(`/api/data/${table}`, {
      method: "PATCH",
      body: JSON.stringify({ filters, values })
    }),
  gstSummary: (start: string, end: string) =>
    apiFetch<{ collected: number; paid: number; net_payable: number }>(
      `/api/gst-summary?start=${start}&end=${end}`
    ),
  analyzeBill: (imageBase64: string) =>
    apiFetch<{ extracted: Record<string, unknown>; flagged: boolean; reasons: string[] }>("/api/bills/analyze", {
      method: "POST",
      body: JSON.stringify({ image_base64: imageBase64 })
    }),
  voiceChat: (history: Array<{ role: string; content: string }>) =>
    apiFetch<{ reply: string }>("/api/voice/chat", {
      method: "POST",
      body: JSON.stringify({ history })
    })
};

export async function postAudio(file: Blob) {
  const token = localStorage.getItem("cashflow-token") || localStorage.getItem("authToken");
  const form = new FormData();
  form.append("audio", file, "voice.webm");
  const response = await fetch(`${API_BASE}/api/voice/stt`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  });
  if (!response.ok) throw new Error("Speech recognition failed");
  return response.json() as Promise<{ text: string }>;
}

export async function requestSpeech(text: string) {
  const token = localStorage.getItem("cashflow-token") || localStorage.getItem("authToken");
  const response = await fetch(`${API_BASE}/api/voice/tts`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error("Speech generation failed");
  return response.blob();
}
