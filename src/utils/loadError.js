// Plain-language text for a failed page load (used by the waiter/captain
// home). Distinguishes throttling (429) and no-network from other failures.
export function describeLoadError(err) {
  const status = err?.response?.status;
  if (status === 429) {
    return { title: 'Too many requests', message: "The server is busy. Wait a few seconds, then tap Retry." };
  }
  if (!err?.response) {
    return { title: "Can't reach the server", message: 'Check your connection, then tap Retry.' };
  }
  return { title: "Couldn't load your tables", message: 'Something went wrong on our side. Tap Retry.' };
}
