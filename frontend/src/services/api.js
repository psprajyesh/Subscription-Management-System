const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Small fetch wrapper for the future Express API.
 * The current ZIP does not include a running backend yet.
 */
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.message
      ? payload.message
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export const customersApi = {
  list: () => apiRequest("/customers"),
  create: (customer) => apiRequest("/customers", { method: "POST", body: JSON.stringify(customer) }),
};
export const subscriptionsApi = {
  list: () => apiRequest("/subscriptions"),
};
