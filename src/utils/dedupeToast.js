// One visible toast per error message. The axios interceptor toasts every
// failed request and many pages toast the same server message again in their
// own catch block, so the user saw each error twice. react-hot-toast replaces
// a toast that has the same id instead of stacking a second one, so give
// error toasts their message as the default id.
import toast from 'react-hot-toast';

let installed = false;

export function installErrorToastDedupe() {
  if (installed) return;
  installed = true;
  const original = toast.error.bind(toast);
  toast.error = (message, opts) => {
    if (typeof message !== 'string' || !message) return original(message, opts);
    // A caller with its own id (e.g. replacing a loading toast) would not
    // replace the interceptor's toast that uses the message as id, so drop that one.
    if (opts && opts.id && opts.id !== message) toast.dismiss(message);
    return original(message, { id: message, ...opts });
  };
}
